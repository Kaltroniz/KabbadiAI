"""KabadiAI Asynchronous Scan Engine (/scan/* & SQS Worker)
Implements:
1. POST /scan/upload-url: Generates S3 presigned PUT URL for direct client upload (bypasses 4MB base64 API limit).
2. POST /scan/jobs: Enqueues job to SQS and registers QUEUED state in ScanJobsTable (< 200ms).
3. GET /scan/jobs/{id}: Returns job state (QUEUED, PROCESSING, COMPLETED, FAILED).
4. SQS Worker: Consumes messages from ScanJobsQueue, fetches image from S3, executes pipeline with Circuit Breaker, stores result.
"""
from __future__ import annotations
import base64, json, os, time, uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import boto3

from src.scan.resilience import is_rate_limited
from src.scan.pipeline import ScanContext, run_pipeline

UPLOADS_BUCKET = os.environ.get("UPLOADS_BUCKET", "")
SCAN_JOBS_TABLE = os.environ.get("SCAN_JOBS_TABLE", "")
SCAN_JOBS_QUEUE_URL = os.environ.get("SCAN_JOBS_QUEUE_URL", "")
ALLOWED_CONTENT_TYPES = {"image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp"}
MAX_IMAGE_BYTES = 4_000_000

_s3 = None
_sqs = None
_ddb = None

def _get_s3():
    global _s3
    if not _s3:
        _s3 = boto3.client("s3")
    return _s3

def _get_sqs():
    global _sqs
    if not _sqs:
        _sqs = boto3.client("sqs")
    return _sqs

def _jobs_table():
    global _ddb
    if not _ddb:
        _ddb = boto3.resource("dynamodb")
    return _ddb.Table(SCAN_JOBS_TABLE) if SCAN_JOBS_TABLE else None

def _json(status: int, body: dict, headers: dict = None):
    def _default(obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        raise TypeError
    h = {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type,authorization",
    }
    if headers:
        h.update(headers)
    return {"statusCode": status, "headers": h, "body": json.dumps(body, default=_default)}

# ─── ROUTE 1: POST /scan/upload-url ─────────────────────────────────────────
def handle_upload_url(event):
    client_ip = (event.get("requestContext", {}).get("http", {}).get("sourceIp")
                 or event.get("headers", {}).get("x-forwarded-for", "").split(",")[0].strip())
    if is_rate_limited(client_ip):
        return _json(429, {"error": "Too many requests. Please wait a few seconds before uploading again."})

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return _json(400, {"error": "Invalid JSON body"})

    content_type = body.get("content_type", "image/jpeg").lower()
    fmt = ALLOWED_CONTENT_TYPES.get(content_type)
    if not fmt:
        return _json(400, {"error": f"Unsupported content_type. Supported: {list(ALLOWED_CONTENT_TYPES.keys())}"})

    file_size = body.get("file_size")
    if file_size and int(file_size) > MAX_IMAGE_BYTES:
        return _json(400, {"error": "Image too large. Maximum size is 4 MB."})

    job_id = uuid.uuid4().hex[:12]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    key = f"uploads/{today}/{job_id}.{fmt}"

    # Generate presigned PUT URL valid for 15 minutes
    if UPLOADS_BUCKET:
        try:
            upload_url = _get_s3().generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": UPLOADS_BUCKET,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=900,
            )
        except Exception as e:
            print("S3 presigned URL error:", repr(e))
            return _json(500, {"error": "Failed to generate upload URL"})
    else:
        upload_url = f"https://mock-s3.amazonaws.com/{key}"

    return _json(200, {
        "job_id": job_id,
        "file_key": key,
        "upload_url": upload_url,
        "expires_in_seconds": 900,
    })

# ─── ROUTE 2: POST /scan/jobs ───────────────────────────────────────────────
def handle_submit_job(event):
    client_ip = (event.get("requestContext", {}).get("http", {}).get("sourceIp")
                 or event.get("headers", {}).get("x-forwarded-for", "").split(",")[0].strip())
    if is_rate_limited(client_ip):
        return _json(429, {"error": "Rate limit exceeded. Please wait a few seconds."})

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return _json(400, {"error": "Invalid JSON body"})

    job_id = body.get("job_id") or uuid.uuid4().hex[:12]
    file_key = body.get("file_key")
    image_b64 = body.get("image_b64")

    if not file_key and not image_b64:
        return _json(400, {"error": "Either file_key or image_b64 is required"})

    lat = float(body["lat"]) if body.get("lat") is not None else None
    lon = float(body["lon"]) if body.get("lon") is not None else None
    user_weight_g = int(body["user_weight_g"]) if body.get("user_weight_g") is not None else None
    lang = str(body.get("language", "en"))[:5]

    now_iso = datetime.now(timezone.utc).isoformat()
    now_epoch = int(datetime.now(timezone.utc).timestamp())
    job_record = {
        "job_id": job_id,
        "status": "QUEUED",
        "created_at": now_iso,
        "updated_at": now_iso,
        "expires_at": now_epoch + 86400,  # 24h TTL
        "file_key": file_key or "",
        "language": lang,
        "has_coords": lat is not None and lon is not None,
    }

    # Record initial job status in DynamoDB
    tbl = _jobs_table()
    if tbl:
        try:
            tbl.put_item(Item=job_record)
        except Exception as e:
            print("DynamoDB save job error:", repr(e))

    # Send message to SQS Queue
    payload = {
        "job_id": job_id,
        "file_key": file_key,
        "image_b64": image_b64,
        "media_type": body.get("media_type", "image/jpeg"),
        "lat": lat,
        "lon": lon,
        "user_weight_g": user_weight_g,
        "language": lang,
    }

    if SCAN_JOBS_QUEUE_URL:
        try:
            _get_sqs().send_message(
                QueueUrl=SCAN_JOBS_QUEUE_URL,
                MessageBody=json.dumps(payload),
            )
        except Exception as e:
            print("SQS send_message error:", repr(e))
            return _json(500, {"error": "Failed to enqueue scan job"})

    return _json(202, {
        "job_id": job_id,
        "status": "QUEUED",
        "poll_interval_ms": 1500,
        "created_at": now_iso,
    })

# ─── ROUTE 3: GET /scan/jobs/{id} ───────────────────────────────────────────
def handle_get_job(event):
    path_params = event.get("pathParameters") or {}
    job_id = path_params.get("id") or path_params.get("proxy")
    if not job_id:
        return _json(400, {"error": "Job ID required"})

    tbl = _jobs_table()
    if not tbl:
        return _json(200, {"job_id": job_id, "status": "COMPLETED", "mock": True})

    try:
        res = tbl.get_item(Key={"job_id": job_id})
        item = res.get("Item")
        if not item:
            return _json(404, {"error": "Job not found"})

        # Short cache for completed jobs, no-cache for queued/processing
        cache_hdr = {"cache-control": "public, max-age=60"} if item.get("status") == "COMPLETED" else {"cache-control": "no-cache"}
        return _json(200, item, headers=cache_hdr)
    except Exception as e:
        print("DynamoDB get job error:", repr(e))
        return _json(500, {"error": "Failed to fetch job"})

# ─── SQS WORKER HANDLER ────────────────────────────────────────────────────
def handle_sqs_worker(event, context):
    """Processes messages from SQS ScanJobsQueue."""
    records = event.get("Records") or []
    tbl = _jobs_table()

    for rec in records:
        body = json.loads(rec.get("body") or "{}")
        job_id = body.get("job_id")
        file_key = body.get("file_key")
        image_b64 = body.get("image_b64")
        media_type = body.get("media_type", "image/jpeg")
        fmt = ALLOWED_CONTENT_TYPES.get(media_type, "jpeg")

        if tbl and job_id:
            try:
                tbl.update_item(
                    Key={"job_id": job_id},
                    UpdateExpression="SET #s = :p, updated_at = :u",
                    ExpressionAttributeNames={"#s": "status"},
                    ExpressionAttributeValues={
                        ":p": "PROCESSING",
                        ":u": datetime.now(timezone.utc).isoformat(),
                    }
                )
            except Exception as e:
                print("Job update to PROCESSING error:", repr(e))

        # Retrieve image bytes
        img_bytes = b""
        if image_b64:
            img_bytes = base64.b64decode(image_b64)
        elif file_key and UPLOADS_BUCKET:
            try:
                s3_obj = _get_s3().get_object(Bucket=UPLOADS_BUCKET, Key=file_key)
                img_bytes = s3_obj["Body"].read()
            except Exception as e:
                print(f"Failed to fetch S3 image {file_key}:", repr(e))
                if tbl and job_id:
                    tbl.update_item(
                        Key={"job_id": job_id},
                        UpdateExpression="SET #s = :f, #err = :e, updated_at = :u",
                        ExpressionAttributeNames={"#s": "status", "#err": "error"},
                        ExpressionAttributeValues={
                            ":f": "FAILED",
                            ":e": "Failed to read image from S3",
                            ":u": datetime.now(timezone.utc).isoformat(),
                        }
                    )
                continue

        # Build ScanContext
        deadline = time.time() + (context.get_remaining_time_in_millis() / 1000.0 if context else 50.0) - 5.0
        ctx = ScanContext(
            image=img_bytes,
            fmt=fmt,
            lat=body.get("lat"),
            lon=body.get("lon"),
            user_weight_g=body.get("user_weight_g"),
            lang=body.get("language", "en"),
            deadline=deadline,
        )

        try:
            result = run_pipeline(ctx)
            if tbl and job_id:
                now_iso = datetime.now(timezone.utc).isoformat()
                tbl.update_item(
                    Key={"job_id": job_id},
                    UpdateExpression="SET #s = :c, #res = :r, updated_at = :u",
                    ExpressionAttributeNames={"#s": "status", "#res": "result"},
                    ExpressionAttributeValues={
                        ":c": "COMPLETED",
                        ":r": json.loads(json.dumps(result), parse_float=Decimal),
                        ":u": now_iso,
                    }
                )
        except Exception as exc:
            print(f"Worker pipeline error for job {job_id}:", repr(exc))
            if tbl and job_id:
                tbl.update_item(
                    Key={"job_id": job_id},
                    UpdateExpression="SET #s = :f, #err = :e, updated_at = :u",
                    ExpressionAttributeNames={"#s": "status", "#err": "error"},
                    ExpressionAttributeValues={
                        ":f": "FAILED",
                        ":e": str(exc)[:300],
                        ":u": datetime.now(timezone.utc).isoformat(),
                    }
                )

    return {"processed": len(records)}

# ─── COMBINED HTTP API DISPATCHER ──────────────────────────────────────────
def api_handler(event, context):
    http_method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod") or "GET"
    path = event.get("rawPath") or event.get("path") or ""

    if http_method == "OPTIONS":
        return _json(200, {"ok": True})

    if "/upload-url" in path:
        return handle_upload_url(event)
    elif path.rstrip("/").endswith("/jobs") and http_method == "POST":
        return handle_submit_job(event)
    elif "/jobs" in path and http_method == "GET":
        return handle_get_job(event)

    return _json(404, {"error": "Not found"})

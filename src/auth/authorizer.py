"""KabadiAI - Lambda Request Authorizer (API Gateway HTTP API Payload 2.0)
Validates Bearer token using HMAC-SHA256 and returns simple response format {isAuthorized: true/false}.
Can be attached to private HttpApi routes with 300-second TTL caching.
"""
from __future__ import annotations
import base64
import hashlib
import hmac
import json
import os
import time

SECRET = os.environ.get("JWT_SECRET", "kabadiai-change-me-before-deploy")
_CACHED_SECRET: str | None = None

def _get_secret() -> str:
    global _CACHED_SECRET
    if _CACHED_SECRET is not None:
        return _CACHED_SECRET
    val = SECRET
    if val.startswith("/") or val.startswith("arn:aws:ssm:"):
        try:
            import boto3
            ssm = boto3.client("ssm")
            res = ssm.get_parameter(Name=val, WithDecryption=True)
            _CACHED_SECRET = res["Parameter"]["Value"]
            return _CACHED_SECRET
        except Exception as e:
            print("Failed to fetch authorizer JWT secret from SSM:", repr(e))
            _CACHED_SECRET = val
            return _CACHED_SECRET
    _CACHED_SECRET = val
    return _CACHED_SECRET

def _b64ud(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (4 - len(s) % 4))

def _b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def handler(event, _context):
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    auth_header = headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return {"isAuthorized": False}

    token = auth_header[7:].strip()
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return {"isAuthorized": False}
        header_b64, body_b64, sig_b64 = parts
        secret = _get_secret()
        expected = _b64u(hmac.new(secret.encode(), f"{header_b64}.{body_b64}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig_b64, expected):
            return {"isAuthorized": False}

        payload = json.loads(_b64ud(body_b64))
        if payload.get("exp", 0) < time.time():
            return {"isAuthorized": False}

        return {
            "isAuthorized": True,
            "context": {
                "userId": payload.get("id", ""),
                "email": payload.get("email", ""),
                "role": payload.get("role", "user")
            }
        }
    except Exception as exc:
        print("Authorizer validation error:", repr(exc))
        return {"isAuthorized": False}

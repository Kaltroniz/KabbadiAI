"""KabadiAI Authentication Lambda
Routes:
  POST /auth/register   – email/password signup
  POST /auth/login      – email/password login  → JWT
  POST /auth/google     – Google ID-token login/signup → JWT
  GET  /auth/me         – verify JWT, return user profile

All crypto uses Python's standard library only (no external packages):
  - PBKDF2-HMAC-SHA256 for password hashing
  - HMAC-SHA256 for JWT signing (HS256)
"""
import base64, hashlib, hmac, json, os, re, time, urllib.request, uuid
from datetime import datetime, timezone
from decimal import Decimal
import boto3

TABLE      = os.environ.get("USERS_TABLE", "")
SECRET     = os.environ.get("JWT_SECRET", "kabadiai-change-me-before-deploy")
GOOGLE_AUD = os.environ.get("GOOGLE_CLIENT_ID", "")  # set in template.yaml parameter
TOKEN_TTL  = 60 * 60 * 24 * 30  # 30 days in seconds

_ddb = None

def _table():
    global _ddb
    if not _ddb:
        _ddb = boto3.resource("dynamodb").Table(TABLE)
    return _ddb

# ─── JWT (pure stdlib) ────────────────────────────────────────────────────────

def _b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _b64ud(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (4 - len(s) % 4))

def _make_jwt(payload: dict) -> str:
    header  = _b64u(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = dict(payload)
    payload["exp"] = int(time.time()) + TOKEN_TTL
    payload["iat"] = int(time.time())
    body = _b64u(json.dumps(payload).encode())
    sig  = _b64u(hmac.new(SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"

def _verify_jwt(token: str) -> dict | None:
    try:
        h, b, s = token.split(".")
        expected = _b64u(hmac.new(SECRET.encode(), f"{h}.{b}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(s, expected):
            return None
        payload = json.loads(_b64ud(b))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None

# ─── Password hashing (PBKDF2) ────────────────────────────────────────────────

def _hash_pw(password: str) -> str:
    salt = os.urandom(16)
    dk   = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 260_000)
    return base64.b64encode(salt + dk).decode()

def _verify_pw(password: str, stored: str) -> bool:
    try:
        raw  = base64.b64decode(stored)
        salt = raw[:16]
        dk   = raw[16:]
        return hmac.compare_digest(
            hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 260_000), dk
        )
    except Exception:
        return False

# ─── Google token verification ────────────────────────────────────────────────

def _verify_google_token(id_token: str) -> dict | None:
    """Verify a Google ID token via Google's public tokeninfo endpoint."""
    try:
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
        with urllib.request.urlopen(url, timeout=8) as r:
            info = json.load(r)
        # Validate audience (client_id) if configured
        if GOOGLE_AUD and info.get("aud") != GOOGLE_AUD:
            print("Google token: wrong aud", info.get("aud"))
            return None
        if int(info.get("exp", 0)) < time.time():
            return None
        return info
    except Exception as e:
        print("Google token verify error:", repr(e))
        return None

# ─── DynamoDB helpers ─────────────────────────────────────────────────────────

def _get_user(email: str) -> dict | None:
    r = _table().get_item(Key={"email": email.lower()})
    return r.get("Item")

def _put_user(user: dict):
    _table().put_item(Item=json.loads(json.dumps(user), parse_float=Decimal))

# ─── Response helper ─────────────────────────────────────────────────────────

def _j(status: int, body: dict):
    def _default(obj):
        if isinstance(obj, Decimal): return float(obj)
        raise TypeError
    return {
        "statusCode": status,
        "headers": {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "content-type,authorization",
        },
        "body": json.dumps(body, default=_default),
    }

def _auth_header(event: dict) -> str | None:
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    auth = headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None

def _safe_body(event: dict) -> dict:
    try:
        raw = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            raw = base64.b64decode(raw).decode()
        return json.loads(raw) or {}
    except Exception:
        return {}

def _public_user(u: dict) -> dict:
    """Strip sensitive fields before returning to client."""
    return {
        "id":         u.get("id"),
        "email":      u.get("email"),
        "name":       u.get("name", ""),
        "avatar":     u.get("avatar", ""),
        "provider":   u.get("provider", "email"),
        "created_at": u.get("created_at", ""),
    }

# ─── Route handlers ───────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

def _register(b: dict):
    email    = str(b.get("email", "")).strip().lower()
    password = str(b.get("password", ""))
    name     = str(b.get("name", "")).strip()[:80]

    if not _EMAIL_RE.match(email):
        return _j(400, {"error": "Invalid email address."})
    if len(password) < 8:
        return _j(400, {"error": "Password must be at least 8 characters."})
    if not name:
        return _j(400, {"error": "Name is required."})
    if _get_user(email):
        return _j(409, {"error": "An account with this email already exists."})

    user = {
        "id":         uuid.uuid4().hex,
        "email":      email,
        "name":       name,
        "avatar":     "",
        "provider":   "email",
        "password_hash": _hash_pw(password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _put_user(user)
    token = _make_jwt({"sub": user["id"], "email": email, "name": name})
    return _j(201, {"token": token, "user": _public_user(user)})


def _login(b: dict):
    email    = str(b.get("email", "")).strip().lower()
    password = str(b.get("password", ""))

    user = _get_user(email)
    if not user or user.get("provider") != "email":
        return _j(401, {"error": "Invalid email or password."})
    if not _verify_pw(password, user.get("password_hash", "")):
        return _j(401, {"error": "Invalid email or password."})

    token = _make_jwt({"sub": user["id"], "email": email, "name": user.get("name", "")})
    return _j(200, {"token": token, "user": _public_user(user)})


def _google_auth(b: dict):
    id_token = str(b.get("credential", "")).strip()
    if not id_token:
        return _j(400, {"error": "Missing Google credential."})

    info = _verify_google_token(id_token)
    if not info:
        return _j(401, {"error": "Invalid or expired Google token."})

    email  = info.get("email", "").lower()
    name   = info.get("name") or info.get("given_name") or email.split("@")[0]
    avatar = info.get("picture", "")

    if not email:
        return _j(400, {"error": "Google account has no email."})

    user = _get_user(email)
    if user:
        # Existing user — update avatar if changed
        if user.get("avatar") != avatar:
            user["avatar"] = avatar
            _put_user(user)
    else:
        # New user via Google
        user = {
            "id":         uuid.uuid4().hex,
            "email":      email,
            "name":       name,
            "avatar":     avatar,
            "provider":   "google",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        _put_user(user)

    token = _make_jwt({"sub": user["id"], "email": email, "name": user.get("name", "")})
    return _j(200, {"token": token, "user": _public_user(user)})


def _me(event: dict):
    token = _auth_header(event)
    if not token:
        return _j(401, {"error": "Authorization header required."})
    payload = _verify_jwt(token)
    if not payload:
        return _j(401, {"error": "Token invalid or expired."})
    user = _get_user(payload.get("email", ""))
    if not user:
        return _j(404, {"error": "User not found."})
    return _j(200, {"user": _public_user(user)})


# ─── Main handler ─────────────────────────────────────────────────────────────

def handler(event, _context):
    path   = event.get("rawPath", "")
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET").upper()

    # CORS preflight
    if method == "OPTIONS":
        return _j(200, {})

    try:
        if path.endswith("/auth/register") and method == "POST":
            return _register(_safe_body(event))
        if path.endswith("/auth/login") and method == "POST":
            return _login(_safe_body(event))
        if path.endswith("/auth/google") and method == "POST":
            return _google_auth(_safe_body(event))
        if path.endswith("/auth/me") and method == "GET":
            return _me(event)
        return _j(404, {"error": "Not found."})
    except Exception as exc:
        print("auth error:", repr(exc))
        return _j(500, {"error": "Internal server error."})

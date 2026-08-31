import hashlib
import hmac
import time
import base64
import json

try:
    from backend.config import JWT_SECRET_KEY, TOKEN_EXPIRE_DAYS
except ImportError:
    from config import JWT_SECRET_KEY, TOKEN_EXPIRE_DAYS

def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    if not salt:
        salt = base64.b64encode(hashlib.sha256(str(time.time()).encode()).digest()).decode()[:16]
    pwd_hash = hashlib.sha256((password + salt).encode()).hexdigest()
    return pwd_hash, salt

def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    return hashlib.sha256((password + salt).encode()).hexdigest() == stored_hash

def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

def base64url_decode(data: str) -> bytes:
    padding = '=' * (4 - (len(data) % 4)) if len(data) % 4 != 0 else ''
    return base64.urlsafe_b64decode(data + padding)

def generate_user_token(user_id: str, username: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user_id,
        "username": username,
        "exp": int(time.time()) + (TOKEN_EXPIRE_DAYS * 86400)
    }

    hdr_b64 = base64url_encode(json.dumps(header).encode())
    pld_b64 = base64url_encode(json.dumps(payload).encode())

    signature = hmac.new(
        JWT_SECRET_KEY.encode(),
        f"{hdr_b64}.{pld_b64}".encode(),
        hashlib.sha256
    ).digest()
    sig_b64 = base64url_encode(signature)

    return f"{hdr_b64}.{pld_b64}.{sig_b64}"

def verify_user_token(token: str) -> dict:
    if not token or token.count('.') != 2:
        return None
    try:
        hdr_b64, pld_b64, sig_b64 = token.split('.')
        expected_sig = hmac.new(
            JWT_SECRET_KEY.encode(),
            f"{hdr_b64}.{pld_b64}".encode(),
            hashlib.sha256
        ).digest()

        if not hmac.compare_digest(base64url_decode(sig_b64), expected_sig):
            return None

        payload = json.loads(base64url_decode(pld_b64).decode())
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None

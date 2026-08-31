import os
import hmac
import hashlib
import time
import base64
import json
from backend.config import JWT_SECRET_KEY, TOKEN_EXPIRE_DAYS

def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    if not salt:
        salt = base64.b64encode(os.urandom(16)).decode('utf-8')
    pwd_hash = hashlib.sha256((password + salt).encode('utf-8')).hexdigest()
    return pwd_hash, salt

def verify_password(plain_password: str, hashed_password: str, salt: str) -> bool:
    calc_hash, _ = hash_password(plain_password, salt)
    return hmac.compare_digest(calc_hash, hashed_password)

def generate_user_token(user_id: str, username: str) -> str:
    expire_time = int(time.time()) + (TOKEN_EXPIRE_DAYS * 86400)
    payload = {
        "sub": user_id,
        "username": username,
        "exp": expire_time
    }
    payload_str = base64.b64encode(json.dumps(payload).encode('utf-8')).decode('utf-8')
    signature = hmac.new(JWT_SECRET_KEY.encode('utf-8'), payload_str.encode('utf-8'), hashlib.sha256).hexdigest()
    return f"{payload_str}.{signature}"

def verify_user_token(token: str) -> dict | None:
    if not token or "." not in token:
        return None
    try:
        payload_str, signature = token.split(".", 1)
        expected_sig = hmac.new(JWT_SECRET_KEY.encode('utf-8'), payload_str.encode('utf-8'), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None
        
        payload = json.loads(base64.b64decode(payload_str.encode('utf-8')).decode('utf-8'))
        if time.time() > payload.get("exp", 0):
            return None
            
        return payload
    except Exception:
        return None

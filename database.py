import json
import uuid
import threading
import os
from pathlib import Path

try:
    from backend.config import DB_FILE
except ImportError:
    from config import DB_FILE

db_lock = threading.Lock()

def get_default_db() -> dict:
    return {
        "users": {},
        "playlists": {},
        "likes": {},
        "history": {}
    }

def load_db() -> dict:
    with db_lock:
        if not DB_FILE.exists():
            data = get_default_db()
            save_db_internal(data)
            return data
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            data = get_default_db()
            save_db_internal(data)
            return data

def save_db_internal(data: dict):
    temp_file = DB_FILE.with_suffix(".tmp")
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    temp_file.replace(DB_FILE)

def save_db(data: dict):
    with db_lock:
        save_db_internal(data)

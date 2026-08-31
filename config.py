import os
from pathlib import Path

# Auto-detect root directory whether inside backend/ or at root
current_dir = Path(__file__).resolve().parent
if current_dir.name == "backend":
    BASE_DIR = current_dir.parent
else:
    BASE_DIR = current_dir

if (BASE_DIR / "frontend").exists():
    FRONTEND_DIR = BASE_DIR / "frontend"
else:
    FRONTEND_DIR = BASE_DIR

if (BASE_DIR / "data").exists():
    DATA_DIR = BASE_DIR / "data"
else:
    DATA_DIR = BASE_DIR

if (BASE_DIR / "downloads").exists():
    DOWNLOADS_DIR = BASE_DIR / "downloads"
else:
    DOWNLOADS_DIR = BASE_DIR

DATA_DIR.mkdir(parents=True, exist_ok=True)
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

DB_FILE = DATA_DIR / "music_db.json"

# Auth Settings
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "soundwave_super_secret_music_key_2026_x88")
TOKEN_EXPIRE_DAYS = 30

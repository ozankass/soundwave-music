import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
FRONTEND_DIR = BASE_DIR / "frontend"
DOWNLOADS_DIR = BASE_DIR / "downloads"

DATA_DIR.mkdir(parents=True, exist_ok=True)
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

DB_FILE = DATA_DIR / "music_db.json"

# Auth Settings
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "soundwave_super_secret_music_key_2026_x88")
TOKEN_EXPIRE_DAYS = 30

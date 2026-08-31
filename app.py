import os
import sys
import uuid
import requests
from typing import Optional, List
from pathlib import Path

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from fastapi import FastAPI, HTTPException, Header, Depends, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.config import FRONTEND_DIR, DOWNLOADS_DIR
from backend.auth import hash_password, verify_password, generate_user_token, verify_user_token
from backend.database import load_db, save_db
from backend.radio_service import get_radio_stations
from backend.music_service import (
    search_tracks, get_audio_stream_url, get_top_charts,
    get_personalized_smart_mixes, get_track_lyrics, download_mp3_track
)

app = FastAPI(title="SoundWave Pro API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    return verify_user_token(token)

def require_user(authorization: Optional[str] = Header(None)) -> dict:
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Lütfen önce giriş yapın veya hesap oluşturun.")
    return user

class RegisterRequest(BaseModel):
    username: str
    password: str

class LoginRequest(BaseModel):
    username: str
    password: str

class LikeTrackRequest(BaseModel):
    track_id: str
    title: str
    artist: str
    thumbnail: str
    duration_str: str

class CreatePlaylistRequest(BaseModel):
    name: str

class AddTrackToPlaylistRequest(BaseModel):
    track_id: str
    title: str
    artist: str
    thumbnail: str
    duration_str: str

# -------------------------------------------------------------
# Public Music & Radio Endpoints
# -------------------------------------------------------------
@app.get("/api/charts")
def get_charts():
    return get_top_charts()

@app.get("/api/smart-mixes")
def get_smart_mixes(user: Optional[dict] = Depends(get_current_user)):
    user_artists = []
    if user:
        db = load_db()
        likes = db.get("likes", {}).get(user["sub"], [])
        user_artists = [t.get("artist") for t in likes if t.get("artist")]
    return {"mixes": get_personalized_smart_mixes(user_artists)}

@app.get("/api/search")
def search_music(q: str = Query(..., min_length=1)):
    tracks = search_tracks(q, limit=15)
    return {"query": q, "tracks": tracks}

@app.get("/api/playlist/query")
def load_playlist_by_query(q: str = Query(..., min_length=1)):
    tracks = search_tracks(q, limit=12)
    return {"query": q, "tracks": tracks}

@app.get("/api/stream/{video_id}")
def stream_music_info(video_id: str):
    stream_url = get_audio_stream_url(video_id)
    if not stream_url:
        raise HTTPException(status_code=404, detail="Ses akışı bulunamadı.")
    return {"video_id": video_id, "stream_url": f"/api/stream/{video_id}/audio", "direct_url": stream_url}

@app.get("/api/stream/{video_id}/audio")
def stream_audio_proxy(video_id: str):
    """
    Direct audio streaming proxy that streams audio chunks directly to browser.
    Eliminates CORS errors, expired URL tokens, and cross-origin audio blocks.
    """
    stream_url = get_audio_stream_url(video_id)
    if not stream_url:
        raise HTTPException(status_code=404, detail="Ses akışı bulunamadı.")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    }

    try:
        remote_req = requests.get(stream_url, headers=headers, stream=True, timeout=12)
        remote_req.raise_for_status()

        content_type = remote_req.headers.get("Content-Type", "audio/mp4")
        content_length = remote_req.headers.get("Content-Length")

        def iterfile():
            try:
                for chunk in remote_req.iter_content(chunk_size=65536):
                    if chunk:
                        yield chunk
            except Exception as e:
                print(f"[Streaming Chunk Interrupted] {e}")

        response_headers = {
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=7200"
        }
        if content_length:
            response_headers["Content-Length"] = content_length

        return StreamingResponse(
            iterfile(),
            media_type=content_type,
            headers=response_headers
        )
    except Exception as e:
        print(f"[Stream Proxy Error] {e}")
        raise HTTPException(status_code=500, detail="Ses akışı başlatılamadı.")

@app.get("/api/lyrics")
def get_lyrics(title: str, artist: str):
    lyrics_text = get_track_lyrics(title, artist)
    return {"lyrics": lyrics_text}

@app.get("/api/radios")
def get_radios():
    return {"radios": get_radio_stations()}

@app.get("/api/recommendations")
def get_recommendations(q: str = "Popüler Şarkılar"):
    tracks = search_tracks(f"{q} audio", limit=8)
    return {"recommendations": tracks}

@app.get("/api/download/{video_id}")
def download_music(video_id: str, background_tasks: BackgroundTasks):
    try:
        mp3_path, clean_filename = download_mp3_track(video_id)
        if not mp3_path.exists():
            raise HTTPException(status_code=500, detail="MP3 dönüştürme başarısız oldu.")
        
        background_tasks.add_task(lambda p: p.unlink(missing_ok=True), mp3_path)
        
        return FileResponse(
            path=mp3_path,
            filename=clean_filename,
            media_type="audio/mpeg"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# -------------------------------------------------------------
# User Auth Endpoints
# -------------------------------------------------------------
@app.post("/api/auth/register")
def register_user(req: RegisterRequest):
    if len(req.username) < 3:
        raise HTTPException(status_code=400, detail="Kullanıcı adı en az 3 karakter olmalıdır.")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Şifre en az 6 karakter olmalıdır.")

    db = load_db()
    users = db.setdefault("users", {})

    username_lower = req.username.strip().lower()
    if username_lower in users:
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten alınmış.")

    user_id = str(uuid.uuid4())
    pwd_hash, salt = hash_password(req.password)

    users[username_lower] = {
        "id": user_id,
        "username": req.username.strip(),
        "password_hash": pwd_hash,
        "salt": salt
    }

    db.setdefault("likes", {})[user_id] = []
    db.setdefault("playlists", {})[user_id] = []
    save_db(db)

    token = generate_user_token(user_id, req.username.strip())
    return {
        "success": True,
        "token": token,
        "user": {"id": user_id, "username": req.username.strip()}
    }

@app.post("/api/auth/login")
def login_user(req: LoginRequest):
    db = load_db()
    users = db.get("users", {})
    username_lower = req.username.strip().lower()

    if username_lower not in users:
        raise HTTPException(status_code=400, detail="Kullanıcı adı veya şifre hatalı.")

    user_record = users[username_lower]
    if not verify_password(req.password, user_record["password_hash"], user_record["salt"]):
        raise HTTPException(status_code=400, detail="Kullanıcı adı veya şifre hatalı.")

    token = generate_user_token(user_record["id"], user_record["username"])
    return {
        "success": True,
        "token": token,
        "user": {"id": user_record["id"], "username": user_record["username"]}
    }

@app.get("/api/auth/me")
def get_current_user_profile(user: dict = Depends(require_user)):
    return {"user": user}

# -------------------------------------------------------------
# User Library (Likes & Playlists)
# -------------------------------------------------------------
@app.get("/api/user/library")
def get_user_library(user: dict = Depends(require_user)):
    user_id = user["sub"]
    db = load_db()
    
    likes = db.get("likes", {}).get(user_id, [])
    playlists = db.get("playlists", {}).get(user_id, [])
    
    return {
        "likes": likes,
        "playlists": playlists
    }

@app.post("/api/user/like")
def toggle_like_track(req: LikeTrackRequest, user: dict = Depends(require_user)):
    user_id = user["sub"]
    db = load_db()
    likes_dict = db.setdefault("likes", {})
    user_likes = likes_dict.setdefault(user_id, [])

    existing_idx = next((i for i, t in enumerate(user_likes) if t.get("track_id") == req.track_id), None)
    
    if existing_idx is not None:
        user_likes.pop(existing_idx)
        is_liked = False
    else:
        user_likes.insert(0, req.model_dump())
        is_liked = True

    save_db(db)
    return {"success": True, "is_liked": is_liked, "likes_count": len(user_likes)}

@app.post("/api/user/playlist")
def create_playlist(req: CreatePlaylistRequest, user: dict = Depends(require_user)):
    user_id = user["sub"]
    db = load_db()
    pl_dict = db.setdefault("playlists", {})
    user_playlists = pl_dict.setdefault(user_id, [])

    new_pl = {
        "id": f"pl_{uuid.uuid4().hex[:8]}",
        "name": req.name.strip(),
        "tracks": []
    }
    user_playlists.append(new_pl)
    save_db(db)
    return {"success": True, "playlist": new_pl}

@app.post("/api/user/playlist/{playlist_id}/add")
def add_track_to_playlist(playlist_id: str, req: AddTrackToPlaylistRequest, user: dict = Depends(require_user)):
    user_id = user["sub"]
    db = load_db()
    user_playlists = db.get("playlists", {}).get(user_id, [])
    
    target_pl = next((p for p in user_playlists if p["id"] == playlist_id), None)
    if not target_pl:
        raise HTTPException(status_code=404, detail="Çalma listesi bulunamadı.")

    if not any(t.get("track_id") == req.track_id for t in target_pl["tracks"]):
        target_pl["tracks"].append(req.model_dump())
        save_db(db)

    return {"success": True, "playlist": target_pl}

@app.delete("/api/user/playlist/{playlist_id}/track/{track_id}")
def remove_track_from_playlist(playlist_id: str, track_id: str, user: dict = Depends(require_user)):
    user_id = user["sub"]
    db = load_db()
    user_playlists = db.get("playlists", {}).get(user_id, [])
    
    target_pl = next((p for p in user_playlists if p["id"] == playlist_id), None)
    if not target_pl:
        raise HTTPException(status_code=404, detail="Çalma listesi bulunamadı.")

    target_pl["tracks"] = [t for t in target_pl["tracks"] if t.get("track_id") != track_id]
    save_db(db)
    return {"success": True, "playlist": target_pl}

# -------------------------------------------------------------
# Static Mounts & HTML
# -------------------------------------------------------------
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

@app.get("/")
def serve_home():
    return FileResponse(FRONTEND_DIR / "index.html")

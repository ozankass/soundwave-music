import os
import re
import time
import requests
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

# Clear proxy variables
for proxy_var in ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"]:
    os.environ.pop(proxy_var, None)

import yt_dlp
import static_ffmpeg
from backend.config import DOWNLOADS_DIR

static_ffmpeg.add_paths()

# In-memory stream URL cache (video_id -> {"url": str, "time": float})
STREAM_CACHE = {}
CACHE_TTL = 3600 * 2 # 2 hours cache

# Thread pool for stream prefetching
executor = ThreadPoolExecutor(max_workers=4)

def format_duration(seconds: int) -> str:
    if not seconds or seconds <= 0:
        return "0:00"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"

def clean_track_title(title: str) -> tuple[str, str]:
    """Cleans (Official Video), (Lyric Video) etc. and splits into Title & Artist"""
    cleaned = re.sub(r'[\(\[\{](?:official|audio|video|lyric|hd|4k|clip|prod\.|feat\.|ft\.)[^\)\]\}]*[\)\]\}]', '', title, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    
    if " - " in cleaned:
        parts = cleaned.split(" - ", 1)
        artist = parts[0].strip()
        song = parts[1].strip()
        return song, artist
    return cleaned, "Sanatçı"

def search_tracks(query: str, limit: int = 15) -> list:
    """Searches YouTube for tracks and returns structured music metadata"""
    clean_q = query.strip()
    if not clean_q:
        return []

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "no_color": True,
        "noplaylist": True,
        "noproxy": "*",
        "proxy": "",
        "extract_flat": True,
        "default_search": f"ytsearch{limit}",
        "js_runtimes": {"node": {}},
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            res = ydl.extract_info(f"ytsearch{limit}:{clean_q}", download=False)
            entries = res.get("entries", [])
            tracks = []
            for e in entries:
                if not e or not e.get("id"):
                    continue
                v_id = e.get("id")
                raw_title = e.get("title", "")
                song_title, artist = clean_track_title(raw_title)
                
                if artist == "Sanatçı" and e.get("channel"):
                    artist = e.get("channel").replace(" - Topic", "").replace("VEVO", "").strip()

                dur = e.get("duration") or 0
                thumb = e.get("thumbnail") or f"https://i.ytimg.com/vi/{v_id}/hqdefault.jpg"

                track_item = {
                    "id": v_id,
                    "title": song_title,
                    "artist": artist,
                    "full_title": raw_title,
                    "duration": dur,
                    "duration_str": format_duration(dur),
                    "thumbnail": thumb,
                    "views": e.get("view_count", 0)
                }
                tracks.append(track_item)

            # Background prefetch top 2 tracks to make opening instant
            if tracks:
                for t in tracks[:2]:
                    executor.submit(get_audio_stream_url, t["id"])

            return tracks
    except Exception as e:
        print(f"[Music Search Error] {e}")
        return []

def get_audio_stream_url(video_id: str) -> str:
    """
    Resolves and returns direct playable audio stream URL.
    Optimized for high-speed instant playback using direct audio formats.
    """
    now = time.time()
    if video_id in STREAM_CACHE:
        cached = STREAM_CACHE[video_id]
        if now - cached["time"] < CACHE_TTL:
            return cached["url"]

    yt_url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "no_color": True,
        "noplaylist": True,
        "noproxy": "*",
        "proxy": "",
        "format": "140/251/bestaudio[ext=m4a]/bestaudio/best",
        "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
        "js_runtimes": {"node": {}},
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(yt_url, download=False)
            stream_url = info.get("url")
            if not stream_url and info.get("formats"):
                audio_formats = [f for f in info["formats"] if f.get("vcodec") == "none"]
                if audio_formats:
                    stream_url = audio_formats[-1].get("url")
                else:
                    stream_url = info["formats"][-1].get("url")

            if stream_url:
                STREAM_CACHE[video_id] = {"url": stream_url, "time": now}
                return stream_url
    except Exception as e:
        print(f"[Stream URL Error] {e}")
    
    return None

def get_top_charts() -> dict:
    """Returns curated popular initial trending tracks, curated playlists, and genres"""
    tr_top = [
        {"id": "G8Xp_V0m-X0", "title": "Mesafe", "artist": "Semicenk", "duration_str": "3:15", "thumbnail": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80"},
        {"id": "oY6Wn3KkF8Y", "title": "Aklına Ben Gelicem", "artist": "BLOK3", "duration_str": "2:45", "thumbnail": "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80"},
        {"id": "d0y80G_vM5g", "title": "Ömrüm", "artist": "Motive", "duration_str": "3:02", "thumbnail": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80"},
        {"id": "vLwQ9qCqM1s", "title": "NKBBI", "artist": "Lvbel C5", "duration_str": "2:30", "thumbnail": "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=300&auto=format&fit=crop&q=80"},
        {"id": "k8X1lMvT0vY", "title": "Aşkın Olayım", "artist": "Simge", "duration_str": "4:12", "thumbnail": "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&auto=format&fit=crop&q=80"},
        {"id": "y9Q1l0pM5vX", "title": "Belki", "artist": "Dedublüman", "duration_str": "3:40", "thumbnail": "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&auto=format&fit=crop&q=80"}
    ]

    global_top = [
        {"id": "JFcgOboQZ08", "title": "Birds of a Feather", "artist": "Billie Eilish", "duration_str": "3:18", "thumbnail": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80"},
        {"id": "kPa7bsKwL-c", "title": "Die With A Smile", "artist": "Lady Gaga & Bruno Mars", "duration_str": "4:11", "thumbnail": "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80"},
        {"id": "TUVcZfQe-Kw", "title": "Espresso", "artist": "Sabrina Carpenter", "duration_str": "2:55", "thumbnail": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80"},
        {"id": "4NRXx6U8ABQ", "title": "Blinding Lights", "artist": "The Weeknd", "duration_str": "3:20", "thumbnail": "https://images.unsplash.com/photo-1571266028243-3716f02d2d2e?w=300&auto=format&fit=crop&q=80"},
        {"id": "3tmd-ClpJxA", "title": "Cruel Summer", "artist": "Taylor Swift", "duration_str": "2:58", "thumbnail": "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=300&auto=format&fit=crop&q=80"}
    ]

    featured_playlists = [
        {"id": "pl-spotify-top", "name": "Spotify Türkiye Top 50 Hits", "query": "Spotify Türkiye Top 50 2026", "color": "linear-gradient(135deg, #1db954, #191414)", "desc": "Türkiye'nin en çok dinlenen hit parçaları"},
        {"id": "pl-yt-viral", "name": "YouTube Music Viral Trendler", "query": "YouTube Music Viral Hits", "color": "linear-gradient(135deg, #ff0000, #282828)", "desc": "Sosyal medyada viral olan şarkılar"},
        {"id": "pl-synthwave", "name": "Gece Sürüşü & Synthwave", "query": "Synthwave Retro 80s Chill", "color": "linear-gradient(135deg, #8b5cf6, #ec4899)", "desc": "Gece sürüşleri ve odaklanma miksi"},
        {"id": "pl-workout", "name": "Workout & Yüksek Enerji", "query": "Gym Workout Motivation Music", "color": "linear-gradient(135deg, #f59e0b, #ef4444)", "desc": "Spor ve enerji için tempolu ritimler"},
        {"id": "pl-acoustic", "name": "Akustik & Kahve Molası", "query": "Akustik Türkçe Slow Şarkılar", "color": "linear-gradient(135deg, #06b6d4, #3b82f6)", "desc": "Sakin gitar ve huzurlu vokaller"}
    ]

    genres = [
        {"name": "Türkçe Pop", "color": "linear-gradient(135deg, #ec4899, #f43f5e)", "icon": "🔥"},
        {"name": "Hip-Hop & Rap", "color": "linear-gradient(135deg, #8b5cf6, #6366f1)", "icon": "🎤"},
        {"name": "Lo-Fi & Chill", "color": "linear-gradient(135deg, #10b981, #059669)", "icon": "☕"},
        {"name": "Rock & Metal", "color": "linear-gradient(135deg, #f59e0b, #d97706)", "icon": "🎸"},
        {"name": "Deep House & EDM", "color": "linear-gradient(135deg, #06b6d4, #0284c7)", "icon": "🎧"},
        {"name": "Akustik & Slow", "color": "linear-gradient(135deg, #64748b, #475569)", "icon": "🌙"}
    ]

    return {
        "turkey_top": tr_top,
        "global_top": global_top,
        "featured_playlists": featured_playlists,
        "genres": genres
    }

def get_personalized_smart_mixes(user_history_artists: list = None) -> list:
    """
    Generates dynamic personalized playlists:
    #Günlük Ritimlerin #1, #Günlük Ritimlerin #2, #Haftalık Ritimlerin #1, #Haftalık Ritimlerin #2, #Aylık Ritimlerin #1
    """
    seed_artist = user_history_artists[0] if user_history_artists else "Semicenk"

    return [
        {
            "id": "mix-daily-1",
            "name": "#Günlük Ritimlerin 1",
            "tag": "GÜNLÜK MİKS",
            "desc": f"{seed_artist}, BLOK3 ve enerjik hit parçalardan sana özel günlük akış.",
            "query": f"{seed_artist} popüler şarkılar",
            "color": "linear-gradient(135deg, #6366f1, #a855f7)",
            "icon": "⚡"
        },
        {
            "id": "mix-daily-2",
            "name": "#Günlük Ritimlerin 2",
            "tag": "SAKİN & CHILL",
            "desc": "Günün yorgunluğunu atmak için dinlendirici Lo-Fi & Akustik tınılar.",
            "query": "Lofi Chill acoustic beats",
            "color": "linear-gradient(135deg, #10b981, #06b6d4)",
            "icon": "☕"
        },
        {
            "id": "mix-weekly-1",
            "name": "#Haftalık Ritimlerin 1",
            "tag": "HAFTANIN EN İYİLERİ",
            "desc": "Bu hafta en çok dinlediğin müzik tarzından seçilmiş en iyi parçalar.",
            "query": f"{seed_artist} mix 2026",
            "color": "linear-gradient(135deg, #ec4899, #8b5cf6)",
            "icon": "🚀"
        },
        {
            "id": "mix-weekly-2",
            "name": "#Haftalık Ritimlerin 2",
            "tag": "HAFTALIK KEŞİF",
            "desc": "Zevkine göre henüz keşfetmediğin yepyeni sanatçılar ve şarkılar.",
            "query": "Yeni çıkan popüler şarkılar 2026",
            "color": "linear-gradient(135deg, #f59e0b, #ec4899)",
            "icon": "🎧"
        },
        {
            "id": "mix-monthly-1",
            "name": "#Aylık Ritimlerin 1",
            "tag": "AYIN FAVORİLERİ",
            "desc": "Ay boyunca en çok tekrar çaldığın hitlerin özel koleksiyonu.",
            "query": "Türkiye Top Trend Şarkılar",
            "color": "linear-gradient(135deg, #3b82f6, #6366f1)",
            "icon": "🌙"
        }
    ]

def get_track_lyrics(title: str, artist: str) -> str:
    """Fetches clean song lyrics from public lyrics API or generates synchronized text"""
    try:
        clean_s = re.sub(r'[\(\[].*?[\)\]]', '', title).strip()
        clean_a = re.sub(r'[\(\[].*?[\)\]]', '', artist).strip()
        
        # Try lrclib.net public API
        resp = requests.get(
            f"https://lrclib.net/api/get?track_name={clean_s}&artist_name={clean_a}",
            timeout=4
        )
        if resp.status_code == 200:
            data = resp.json()
            plain_lyrics = data.get("plainLyrics") or data.get("syncedLyrics")
            if plain_lyrics:
                return plain_lyrics
    except Exception as e:
        print(f"[Lyrics API Error] {e}")

    return f"🎵 {title}\n🎤 {artist}\n\n[Müzik Çalıyor...]\n\nBu şarkının sözleri otomatik senkronize ediliyor.\nKeyifli dinlemeler dileriz!"

def download_mp3_track(video_id: str) -> tuple[Path, str]:
    """Downloads track directly as 320kbps MP3 on-demand"""
    yt_url = f"https://www.youtube.com/watch?v={video_id}"
    out_template = str(DOWNLOADS_DIR / f"{video_id}.%(ext)s")
    
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "no_color": True,
        "noplaylist": True,
        "noproxy": "*",
        "proxy": "",
        "format": "bestaudio/best",
        "outtmpl": out_template,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "320",
        }],
        "js_runtimes": {"node": {}},
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(yt_url, download=True)
        title = info.get("title", "soundwave_track")
        clean_title = re.sub(r'[\\/*?:"<>|]', "", title).strip() or "track"
        
        mp3_file = DOWNLOADS_DIR / f"{video_id}.mp3"
        return mp3_file, f"{clean_title}.mp3"

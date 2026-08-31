import os
import uvicorn

# Clear proxy variables
for proxy_var in ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"]:
    os.environ.pop(proxy_var, None)

if __name__ == "__main__":
    print("=" * 65)
    print("🎵 SoundWave Pro - Müzik Dinleme, Radyo & MP3 İndirici Başlatılıyor...")
    print("🌐 Web Arayüzü: http://localhost:4000")
    print("✨ Reklamsız Müzik Akışı, Canlı Radyolar & Çalma Listeleri Hazır!")
    print("=" * 65)
    
    uvicorn.run("backend.app:app", host="127.0.0.1", port=4000, reload=False, log_level="info")

/**
 * SoundWave Pro - Advanced Streaming Music, Cinema Mode & Web Audio Visualizer Engine
 */

const API_BASE = window.API_BASE_URL || "";

const App = {
    audio: new Audio(),
    currentTrack: null,
    queue: [],
    queueIndex: 0,
    isPlaying: false,
    isShuffle: false,
    isLoop: false,
    activeView: "home",
    chartsData: null,
    selectedTrackForPlaylist: null,

    // Web Audio API Visualizer
    audioCtx: null,
    analyser: null,
    sourceNode: null,
    isAudioContextReady: false,

    init() {
        this.initAudioEvents();
        this.initPlayerControls();
        this.initSearch();
        this.initNavigation();
        this.initCinemaMode();
        this.loadInitialCharts();
        this.loadSmartMixes();
        this.loadRadios();
    },

    initAudioEvents() {
        this.audio.addEventListener("timeupdate", () => {
            const cur = this.audio.currentTime || 0;
            const dur = this.audio.duration || 0;

            const curLabel = document.getElementById("time-current");
            const durLabel = document.getElementById("time-duration");
            const progress = document.getElementById("seekbar-progress");

            if (curLabel) curLabel.textContent = this.formatTime(cur);
            if (durLabel && dur > 0) durLabel.textContent = this.formatTime(dur);
            if (progress && dur > 0) {
                progress.style.width = `${(cur / dur) * 100}%`;
            }
        });

        this.audio.addEventListener("ended", () => {
            if (this.isLoop) {
                this.audio.currentTime = 0;
                this.audio.play();
            } else {
                this.playNext();
            }
        });

        this.audio.addEventListener("play", () => {
            this.isPlaying = true;
            this.updatePlayPauseUI();
            document.body.classList.add("playing");
            this.initWebAudio();
        });

        this.audio.addEventListener("pause", () => {
            this.isPlaying = false;
            this.updatePlayPauseUI();
            document.body.classList.remove("playing");
        });

        this.audio.addEventListener("error", (e) => {
            console.error("Audio stream error:", e);
        });
    },

    initWebAudio() {
        if (this.isAudioContextReady) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            this.audioCtx = new AudioContext();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 64;

            this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);
            this.sourceNode.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);
            this.isAudioContextReady = true;

            this.startVisualizerLoop();
        } catch (e) {
            console.log("Web Audio fallback visualizer", e);
            this.startFallbackVisualizer();
        }
    },

    startVisualizerLoop() {
        const canvas = document.getElementById("visualizer-canvas");
        const halo = document.getElementById("bass-halo-ring");
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            requestAnimationFrame(draw);
            if (!this.isPlaying) return;

            this.analyser.getByteFrequencyData(dataArray);

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let bassSum = 0;
            for (let i = 0; i < 4; i++) {
                bassSum += dataArray[i];
            }
            const bassAvg = bassSum / 4;
            const scale = 1 + (bassAvg / 255) * 0.28;
            const opacity = 0.4 + (bassAvg / 255) * 0.5;

            if (halo) {
                halo.style.transform = `scale(${scale})`;
                halo.style.opacity = `${opacity}`;
            }

            const barWidth = (canvas.width / bufferLength) * 2;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height;
                const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
                grad.addColorStop(0, "#6366f1");
                grad.addColorStop(0.5, "#a855f7");
                grad.addColorStop(1, "#ec4899");

                ctx.fillStyle = grad;
                ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
                x += barWidth;
            }
        };

        draw();
    },

    startFallbackVisualizer() {
        const halo = document.getElementById("bass-halo-ring");
        setInterval(() => {
            if (!this.isPlaying || !halo) return;
            const randomBass = 1 + Math.random() * 0.2;
            halo.style.transform = `scale(${randomBass})`;
        }, 120);
    },

    initPlayerControls() {
        const playBtn = document.getElementById("btn-play-pause");
        if (playBtn) playBtn.addEventListener("click", () => this.togglePlayPause());

        const nextBtn = document.getElementById("btn-next");
        const prevBtn = document.getElementById("btn-prev");
        if (nextBtn) nextBtn.addEventListener("click", () => this.playNext());
        if (prevBtn) prevBtn.addEventListener("click", () => this.playPrev());

        const shuffleBtn = document.getElementById("btn-shuffle");
        const loopBtn = document.getElementById("btn-loop");
        if (shuffleBtn) {
            shuffleBtn.addEventListener("click", () => {
                this.isShuffle = !this.isShuffle;
                shuffleBtn.style.color = this.isShuffle ? "var(--accent-primary)" : "var(--text-muted)";
            });
        }
        if (loopBtn) {
            loopBtn.addEventListener("click", () => {
                this.isLoop = !this.isLoop;
                loopBtn.style.color = this.isLoop ? "var(--accent-primary)" : "var(--text-muted)";
            });
        }

        const seekbar = document.getElementById("seekbar-wrap");
        if (seekbar) {
            seekbar.addEventListener("click", (e) => {
                if (!this.audio.duration) return;
                const rect = seekbar.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const percent = clickX / rect.width;
                this.audio.currentTime = percent * this.audio.duration;
            });
        }

        const volWrap = document.getElementById("volume-slider-wrap");
        const volBar = document.getElementById("volume-slider-bar");
        if (volWrap) {
            volWrap.addEventListener("click", (e) => {
                const rect = volWrap.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const percent = Math.max(0, Math.min(1, clickX / rect.width));
                this.audio.volume = percent;
                if (volBar) volBar.style.width = `${percent * 100}%`;
            });
        }

        const playerLikeBtn = document.getElementById("player-like-btn");
        if (playerLikeBtn) {
            playerLikeBtn.addEventListener("click", () => {
                if (this.currentTrack) Auth.toggleLike(this.currentTrack);
            });
        }

        const playerDlBtn = document.getElementById("player-download-btn");
        if (playerDlBtn) {
            playerDlBtn.addEventListener("click", () => {
                if (this.currentTrack && this.currentTrack.id) {
                    this.downloadTrack(this.currentTrack);
                }
            });
        }
    },

    togglePlayPause() {
        if (!this.currentTrack && this.queue.length > 0) {
            this.playTrack(this.queue[0]);
            return;
        }
        if (this.audio.paused) {
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            this.audio.play().catch(e => console.log(e));
        } else {
            this.audio.pause();
        }
    },

    updatePlayPauseUI() {
        const btn = document.getElementById("btn-play-pause");
        if (!btn) return;
        if (this.isPlaying) {
            btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        } else {
            btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        }
    },

    playTrack(track, queueList = null) {
        if (queueList) {
            this.queue = queueList;
            this.queueIndex = this.queue.findIndex(t => t.id === track.id);
            if (this.queueIndex === -1) this.queueIndex = 0;
        } else if (!this.queue.some(t => t.id === track.id)) {
            this.queue.push(track);
            this.queueIndex = this.queue.length - 1;
        }

        this.currentTrack = track;
        this.updatePlayerMetadata(track);

        // Direct stream URL
        this.audio.src = `${API_BASE}/api/stream/${track.id}/audio`;
        
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
        this.audio.play().catch(e => console.log("Playback starting...", e));
        
        this.updateLikedState();
        this.loadRecommendations(track.artist || track.title);
        this.loadLyrics(track.title, track.artist);
        this.updateCinemaVideo(track.id);
    },

    playRadio(radio) {
        this.currentTrack = {
            id: radio.id,
            title: radio.name,
            artist: `Canlı Radyo (${radio.genre})`,
            thumbnail: radio.logo,
            duration_str: "CANLI"
        };
        this.updatePlayerMetadata(this.currentTrack);
        this.audio.src = radio.stream_url;
        this.audio.play().catch(e => console.log("Radio play error:", e));
    },

    playNext() {
        if (this.queue.length === 0) return;
        if (this.isShuffle) {
            this.queueIndex = Math.floor(Math.random() * this.queue.length);
        } else {
            this.queueIndex = (this.queueIndex + 1) % this.queue.length;
        }
        this.playTrack(this.queue[this.queueIndex]);
    },

    playPrev() {
        if (this.queue.length === 0) return;
        this.queueIndex = (this.queueIndex - 1 + this.queue.length) % this.queue.length;
        this.playTrack(this.queue[this.queueIndex]);
    },

    updatePlayerMetadata(track) {
        const thumb = document.getElementById("player-thumb");
        const title = document.getElementById("player-title");
        const artist = document.getElementById("player-artist");
        const dur = document.getElementById("time-duration");

        const cinemaThumb = document.getElementById("cinema-cover-img");
        const cinemaTitle = document.getElementById("cinema-title");
        const cinemaArtist = document.getElementById("cinema-artist");

        const coverSrc = track.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&auto=format&fit=crop&q=80';
        
        if (thumb) thumb.src = coverSrc;
        if (title) title.textContent = track.title || 'Parça Adı';
        if (artist) artist.textContent = track.artist || 'Sanatçı';
        if (dur && track.duration_str) dur.textContent = track.duration_str;

        if (cinemaThumb) cinemaThumb.src = coverSrc;
        if (cinemaTitle) cinemaTitle.textContent = track.title || 'Parça Adı';
        if (cinemaArtist) cinemaArtist.textContent = track.artist || 'Sanatçı';
    },

    updateLikedState() {
        const btn = document.getElementById("player-like-btn");
        if (!btn || !this.currentTrack) return;
        const isLiked = (Auth.library.likes || []).some(t => t.track_id === this.currentTrack.id);
        if (isLiked) {
            btn.classList.add("liked");
            btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
        } else {
            btn.classList.remove("liked");
            btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
        }
    },

    downloadTrack(track) {
        if (!track || !track.id) return;
        window.open(`${API_BASE}/api/download/${track.id}`, "_blank");
    },

    // -------------------------------------------------------------
    // Cinema Mode & Lyrics & Video Clip
    // -------------------------------------------------------------
    initCinemaMode() {
        const overlay = document.getElementById("cinema-overlay");
        const thumbWrap = document.getElementById("player-thumb-wrap");
        const titleEl = document.getElementById("player-title");
        const eqAnim = document.getElementById("equalizer-anim");

        const openCinema = () => {
            if (overlay) overlay.classList.add("active");
        };

        if (thumbWrap) thumbWrap.addEventListener("click", openCinema);
        if (titleEl) titleEl.addEventListener("click", openCinema);
        if (eqAnim) eqAnim.addEventListener("click", openCinema);

        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && overlay && overlay.classList.contains("active")) {
                overlay.classList.remove("active");
            }
        });
    },

    closeCinema() {
        const overlay = document.getElementById("cinema-overlay");
        if (overlay) overlay.classList.remove("active");
    },

    switchCinemaMode(mode) {
        const btnLyrics = document.getElementById("mode-btn-lyrics");
        const btnVideo = document.getElementById("mode-btn-video");
        const lyricsBox = document.getElementById("lyrics-container");
        const videoBox = document.getElementById("video-container");

        if (mode === "video") {
            btnVideo.classList.add("active");
            btnLyrics.classList.remove("active");
            lyricsBox.style.display = "none";
            videoBox.style.display = "block";
        } else {
            btnLyrics.classList.add("active");
            btnVideo.classList.remove("active");
            lyricsBox.style.display = "block";
            videoBox.style.display = "none";
        }
    },

    async loadLyrics(title, artist) {
        const lyricsEl = document.getElementById("lyrics-container");
        if (!lyricsEl) return;
        lyricsEl.textContent = "Şarkı sözleri yükleniyor...";

        try {
            const resp = await fetch(`${API_BASE}/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`);
            const data = await resp.json();
            lyricsEl.textContent = data.lyrics || "Sözler bulunamadı.";
        } catch (e) {
            lyricsEl.textContent = "Sözler yüklenemedi.";
        }
    },

    updateCinemaVideo(videoId) {
        const videoBox = document.getElementById("video-container");
        if (!videoBox) return;
        videoBox.innerHTML = `
            <iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        `;
    },

    // -------------------------------------------------------------
    // Smart Mixes & Charts
    // -------------------------------------------------------------
    async loadSmartMixes() {
        try {
            const headers = Auth.token ? { "Authorization": `Bearer ${Auth.token}` } : {};
            const resp = await fetch(`${API_BASE}/api/smart-mixes`, { headers });
            const data = await resp.json();
            const grid = document.getElementById("smart-mixes-grid");
            if (!grid) return;
            grid.innerHTML = "";

            (data.mixes || []).forEach(m => {
                const card = document.createElement("div");
                card.style.cssText = `background:${m.color}; border-radius:14px; padding:20px; color:#fff; cursor:pointer; min-height:120px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:var(--shadow-card); transition:var(--transition); position:relative; overflow:hidden;`;
                card.innerHTML = `
                    <div>
                        <span style="font-size:10px; font-weight:900; background:rgba(0,0,0,0.3); padding:3px 8px; border-radius:4px; letter-spacing:0.8px;">${m.tag}</span>
                        <h4 style="font-size:16px; font-weight:800; margin-top:8px;">${m.name}</h4>
                        <p style="font-size:12px; opacity:0.85; margin-top:4px; line-height:1.4;">${m.desc}</p>
                    </div>
                    <span style="font-size:24px; align-self:flex-end;">${m.icon}</span>
                `;
                card.onmouseenter = () => card.style.transform = "translateY(-4px)";
                card.onmouseleave = () => card.style.transform = "translateY(0)";
                card.onclick = () => this.playPlaylistByQuery(m.query, m.name);
                grid.appendChild(card);
            });
        } catch (e) {
            console.error("Smart mixes error:", e);
        }
    },

    async loadInitialCharts() {
        try {
            const resp = await fetch(`${API_BASE}/api/charts`);
            this.chartsData = await resp.json();

            this.renderTracksGrid("grid-turkey-top", this.chartsData.turkey_top || []);
            this.renderTracksGrid("grid-global-top", this.chartsData.global_top || []);
            this.renderFeaturedPlaylists(this.chartsData.featured_playlists || []);
            this.renderGenres(this.chartsData.genres || []);
        } catch (e) {
            console.error("Charts fetch error:", e);
        }
    },

    renderFeaturedPlaylists(playlists) {
        const grid = document.getElementById("featured-playlists-grid");
        if (!grid) return;
        grid.innerHTML = "";

        playlists.forEach(pl => {
            const card = document.createElement("div");
            card.style.cssText = `background:${pl.color}; border-radius:14px; padding:20px; color:#fff; cursor:pointer; min-height:110px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:var(--shadow-card); transition:var(--transition);`;
            card.innerHTML = `
                <div>
                    <h4 style="font-size:16px; font-weight:800;">${pl.name}</h4>
                    <p style="font-size:12px; opacity:0.85; margin-top:4px;">${pl.desc}</p>
                </div>
                <span style="font-size:13px; font-weight:bold; align-self:flex-end; opacity:0.9;">Tümünü Çal ▶</span>
            `;
            card.onmouseenter = () => card.style.transform = "translateY(-4px)";
            card.onmouseleave = () => card.style.transform = "translateY(0)";
            card.onclick = () => this.playPlaylistByQuery(pl.query, pl.name);
            grid.appendChild(card);
        });
    },

    async playPlaylistByQuery(query, title) {
        this.switchView("search");
        document.getElementById("search-view-title").textContent = `🎵 ${title}`;
        const tbody = document.getElementById("search-results-tbody");
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px;">Şarkılar yükleniyor...</td></tr>`;

        try {
            const resp = await fetch(`${API_BASE}/api/playlist/query?q=${encodeURIComponent(query)}`);
            const data = await resp.json();
            const tracks = data.tracks || [];

            this.renderSearchResultsTable(tracks);
            if (tracks.length > 0) {
                this.playTrack(tracks[0], tracks);
            }
        } catch (e) {
            console.error("Playlist query error:", e);
        }
    },

    renderTracksGrid(elementId, tracks) {
        const grid = document.getElementById(elementId);
        if (!grid) return;
        grid.innerHTML = "";

        tracks.forEach(track => {
            const card = document.createElement("div");
            card.className = "track-card";
            card.innerHTML = `
                <div class="track-img-wrap">
                    <img class="track-img" src="${track.thumbnail}" alt="${this.escapeHtml(track.title)}" loading="lazy">
                    <div class="card-play-overlay">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </div>
                </div>
                <div class="track-card-title" title="${this.escapeHtml(track.title)}">${this.escapeHtml(track.title)}</div>
                <div class="track-card-artist">${this.escapeHtml(track.artist)}</div>
            `;
            card.onclick = () => this.playTrack(track, tracks);
            grid.appendChild(card);
        });
    },

    renderGenres(genres) {
        const wrap = document.getElementById("genres-grid");
        if (!wrap) return;
        wrap.innerHTML = "";

        genres.forEach(g => {
            const card = document.createElement("div");
            card.style.cssText = `background:${g.color}; border-radius:14px; padding:20px; color:#fff; cursor:pointer; font-weight:800; font-size:16px; min-height:90px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:var(--shadow-card); transition:var(--transition);`;
            card.innerHTML = `
                <span>${g.name}</span>
                <span style="font-size:24px; align-self:flex-end;">${g.icon}</span>
            `;
            card.onmouseenter = () => card.style.transform = "translateY(-4px)";
            card.onmouseleave = () => card.style.transform = "translateY(0)";
            card.onclick = () => {
                document.getElementById("search-input").value = g.name;
                this.performSearch(g.name);
            };
            wrap.appendChild(card);
        });
    },

    async loadRadios() {
        try {
            const resp = await fetch(`${API_BASE}/api/radios`);
            const data = await resp.json();
            const grid = document.getElementById("radios-grid");
            if (!grid) return;
            grid.innerHTML = "";

            (data.radios || []).forEach(r => {
                const card = document.createElement("div");
                card.className = "radio-card";
                card.innerHTML = `
                    <img src="${r.logo}" class="radio-thumb" alt="${this.escapeHtml(r.name)}">
                    <div>
                        <div style="font-weight:700; font-size:14px; margin-bottom:2px;">${this.escapeHtml(r.name)}</div>
                        <div style="font-size:12px; color:var(--text-muted); margin-bottom:6px;">${this.escapeHtml(r.genre)}</div>
                        <span class="live-tag"><span class="live-dot"></span> CANLI</span>
                    </div>
                `;
                card.onclick = () => this.playRadio(r);
                grid.appendChild(card);
            });
        } catch (e) {
            console.error("Radio load error:", e);
        }
    },

    async loadRecommendations(seed) {
        try {
            const resp = await fetch(`${API_BASE}/api/recommendations?q=${encodeURIComponent(seed)}`);
            const data = await resp.json();
            this.renderTracksGrid("grid-recommendations", data.recommendations || []);
        } catch (e) {
            console.error("Recommendations error:", e);
        }
    },

    // -------------------------------------------------------------
    // Search
    // -------------------------------------------------------------
    initSearch() {
        const input = document.getElementById("search-input");
        if (!input) return;

        let debounceTimer;
        input.addEventListener("input", (e) => {
            const val = e.target.value.trim();
            clearTimeout(debounceTimer);
            if (val.length >= 2) {
                debounceTimer = setTimeout(() => this.performSearch(val), 400);
            }
        });

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && input.value.trim()) {
                clearTimeout(debounceTimer);
                this.performSearch(input.value.trim());
            }
        });
    },

    async performSearch(query) {
        this.switchView("search");
        const titleEl = document.getElementById("search-view-title");
        const tbody = document.getElementById("search-results-tbody");
        if (titleEl) titleEl.textContent = `"${query}" için arama sonuçları:`;
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">Aranıyor...</td></tr>`;

        try {
            const resp = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
            const data = await resp.json();
            const tracks = data.tracks || [];
            this.renderSearchResultsTable(tracks);
        } catch (e) {
            console.error("Search error:", e);
        }
    },

    renderSearchResultsTable(tracks) {
        const tbody = document.getElementById("search-results-tbody");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (tracks.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px;">Sonuç bulunamadı.</td></tr>`;
            return;
        }

        tracks.forEach((t, idx) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="width:30px; color:var(--text-dim);">${idx + 1}</td>
                <td style="width:50px;"><img src="${t.thumbnail}" style="width:40px; height:40px; border-radius:6px; object-fit:cover;" alt=""></td>
                <td>
                    <strong style="color:#fff; cursor:pointer;" onclick="App.playTrack(${JSON.stringify(t).replace(/"/g, '&quot;')}, ${JSON.stringify(tracks).replace(/"/g, '&quot;')})">${this.escapeHtml(t.title)}</strong>
                    <div style="font-size:12px; color:var(--text-muted);">${this.escapeHtml(t.artist)}</div>
                </td>
                <td style="color:var(--text-dim);">${t.duration_str}</td>
                <td style="text-align:right;">
                    <button class="player-icon-btn" title="Çal" onclick="App.playTrack(${JSON.stringify(t).replace(/"/g, '&quot;')}, ${JSON.stringify(tracks).replace(/"/g, '&quot;')})">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </button>
                    <button class="player-icon-btn" title="Çalma Listesine Ekle" onclick="App.openAddToPlaylistModal(${JSON.stringify(t).replace(/"/g, '&quot;')})">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                    <button class="player-icon-btn" title="Beğen" onclick="Auth.toggleLike(${JSON.stringify(t).replace(/"/g, '&quot;')})">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                    </button>
                    <button class="player-icon-btn" title="320kbps MP3 İndir" onclick="App.downloadTrack(${JSON.stringify(t).replace(/"/g, '&quot;')})">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    // -------------------------------------------------------------
    // Add to Playlist Modal
    // -------------------------------------------------------------
    openAddToPlaylistModal(track) {
        if (!Auth.token) {
            Auth.openAuthModal('login');
            return;
        }

        this.selectedTrackForPlaylist = track;
        const modal = document.getElementById("playlist-select-modal");
        const list = document.getElementById("modal-playlists-list");
        if (!modal || !list) return;

        list.innerHTML = "";
        const playlists = Auth.library.playlists || [];

        if (playlists.length === 0) {
            list.innerHTML = `<p style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">Henüz bir çalma listeniz yok.</p>`;
        } else {
            playlists.forEach(pl => {
                const btn = document.createElement("button");
                btn.className = "btn btn-secondary";
                btn.style.cssText = "width:100%; justify-content:space-between; margin-bottom:8px; padding:10px 14px; font-size:13px;";
                btn.innerHTML = `
                    <span>📁 ${this.escapeHtml(pl.name)}</span>
                    <span style="font-size:11px; color:var(--text-muted);">${(pl.tracks || []).length} şarkı</span>
                `;
                btn.onclick = () => this.addSelectedTrackToPlaylist(pl.id);
                list.appendChild(btn);
            });
        }

        modal.classList.add("active");
    },

    closeAddToPlaylistModal() {
        const modal = document.getElementById("playlist-select-modal");
        if (modal) modal.classList.remove("active");
    },

    async addSelectedTrackToPlaylist(playlistId) {
        if (!this.selectedTrackForPlaylist) return;
        const t = this.selectedTrackForPlaylist;

        try {
            const resp = await fetch(`${API_BASE}/api/user/playlist/${playlistId}/add`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${Auth.token}`
                },
                body: JSON.stringify({
                    track_id: t.id,
                    title: t.title,
                    artist: t.artist,
                    thumbnail: t.thumbnail,
                    duration_str: t.duration_str || "3:00"
                })
            });

            if (resp.ok) {
                this.closeAddToPlaylistModal();
                await Auth.fetchUserLibrary();
                alert("Şarkı çalma listesine eklendi! 🎉");
            }
        } catch (e) {
            alert("Eklenirken hata oluştu.");
        }
    },

    async createPlaylistFromModal() {
        const input = document.getElementById("new-playlist-input");
        if (!input || !input.value.trim()) return;

        const name = input.value.trim();
        try {
            const resp = await fetch(`${API_BASE}/api/user/playlist`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${Auth.token}`
                },
                body: JSON.stringify({ name })
            });

            if (resp.ok) {
                const data = await resp.json();
                input.value = "";
                await Auth.fetchUserLibrary();
                if (this.selectedTrackForPlaylist) {
                    await this.addSelectedTrackToPlaylist(data.playlist.id);
                }
            }
        } catch (e) {
            alert("Liste oluşturulamadı.");
        }
    },

    // -------------------------------------------------------------
    // Navigation & Views Switcher
    // -------------------------------------------------------------
    initNavigation() {
        const navItems = document.querySelectorAll(".nav-item[data-view]");
        navItems.forEach(item => {
            item.addEventListener("click", () => {
                const view = item.dataset.view;
                navItems.forEach(n => n.classList.remove("active"));
                item.classList.add("active");
                this.switchView(view);
            });
        });
    },

    switchView(viewName) {
        this.activeView = viewName;
        const sections = document.querySelectorAll(".view-section");
        sections.forEach(s => s.classList.remove("active"));

        const target = document.getElementById(`view-${viewName}`);
        if (target) target.classList.add("active");

        if (viewName === "likes") {
            this.renderLikesView();
        }
    },

    renderLikesView() {
        const tbody = document.getElementById("likes-tbody");
        if (!tbody) return;
        tbody.innerHTML = "";

        const likes = Auth.library.likes || [];
        const countLabel = document.getElementById("likes-count-label");
        if (countLabel) countLabel.textContent = `${likes.length} Şarkı`;

        if (likes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--text-muted);">Henüz beğenilen şarkı yok. Şarkıların yanındaki ❤️ butonuna basarak favorilerinize ekleyebilirsiniz.</td></tr>`;
            return;
        }

        const tracks = likes.map(item => ({
            id: item.track_id,
            title: item.title,
            artist: item.artist,
            thumbnail: item.thumbnail,
            duration_str: item.duration_str
        }));

        tracks.forEach((trackObj, idx) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="width:30px; color:var(--text-dim);">${idx + 1}</td>
                <td style="width:50px;"><img src="${trackObj.thumbnail}" style="width:40px; height:40px; border-radius:6px; object-fit:cover;" alt=""></td>
                <td>
                    <strong style="color:#fff; cursor:pointer;" onclick="App.playTrack(${JSON.stringify(trackObj).replace(/"/g, '&quot;')}, ${JSON.stringify(tracks).replace(/"/g, '&quot;')})">${this.escapeHtml(trackObj.title)}</strong>
                    <div style="font-size:12px; color:var(--text-muted);">${this.escapeHtml(trackObj.artist)}</div>
                </td>
                <td style="color:var(--text-dim);">${trackObj.duration_str}</td>
                <td style="text-align:right;">
                    <button class="player-icon-btn" title="Çal" onclick="App.playTrack(${JSON.stringify(trackObj).replace(/"/g, '&quot;')}, ${JSON.stringify(tracks).replace(/"/g, '&quot;')})">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </button>
                    <button class="player-icon-btn liked" title="Beğenilerden Kaldır" onclick="Auth.toggleLike(${JSON.stringify(trackObj).replace(/"/g, '&quot;')})">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                    </button>
                    <button class="player-icon-btn" title="320kbps MP3 İndir" onclick="App.downloadTrack(${JSON.stringify(trackObj).replace(/"/g, '&quot;')})">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    playAllLikes() {
        const likes = Auth.library.likes || [];
        if (likes.length === 0) return;
        const tracks = likes.map(item => ({
            id: item.track_id,
            title: item.title,
            artist: item.artist,
            thumbnail: item.thumbnail,
            duration_str: item.duration_str
        }));
        this.playTrack(tracks[0], tracks);
    },

    openPlaylistView(pl) {
        this.switchView("playlist");
        document.getElementById("playlist-view-title").textContent = pl.name;
        const countLabel = document.getElementById("playlist-count-label");
        if (countLabel) countLabel.textContent = `${(pl.tracks || []).length} Şarkı`;

        const tbody = document.getElementById("playlist-tbody");
        if (!tbody) return;
        tbody.innerHTML = "";

        const tracks = (pl.tracks || []).map(item => ({
            id: item.track_id,
            title: item.title,
            artist: item.artist,
            thumbnail: item.thumbnail,
            duration_str: item.duration_str
        }));

        if (tracks.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--text-muted);">Bu çalma listesi henüz boş. Şarkı arayıp "➕" butonuna basarak ekleyebilirsiniz.</td></tr>`;
            return;
        }

        tracks.forEach((trackObj, idx) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="width:30px; color:var(--text-dim);">${idx + 1}</td>
                <td style="width:50px;"><img src="${trackObj.thumbnail}" style="width:40px; height:40px; border-radius:6px; object-fit:cover;" alt=""></td>
                <td>
                    <strong style="color:#fff; cursor:pointer;" onclick="App.playTrack(${JSON.stringify(trackObj).replace(/"/g, '&quot;')}, ${JSON.stringify(tracks).replace(/"/g, '&quot;')})">${this.escapeHtml(trackObj.title)}</strong>
                    <div style="font-size:12px; color:var(--text-muted);">${this.escapeHtml(trackObj.artist)}</div>
                </td>
                <td style="color:var(--text-dim);">${trackObj.duration_str}</td>
                <td style="text-align:right;">
                    <button class="player-icon-btn" title="Çal" onclick="App.playTrack(${JSON.stringify(trackObj).replace(/"/g, '&quot;')}, ${JSON.stringify(tracks).replace(/"/g, '&quot;')})">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </button>
                    <button class="player-icon-btn" title="Listeden Kaldır" onclick="App.removeTrackFromPlaylist('${pl.id}', '${trackObj.id}')">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    playAllCurrentPlaylist() {
        const tbody = document.getElementById("playlist-tbody");
        const firstPlayBtn = tbody.querySelector("button[title='Çal']");
        if (firstPlayBtn) firstPlayBtn.click();
    },

    async removeTrackFromPlaylist(playlistId, trackId) {
        try {
            const resp = await fetch(`${API_BASE}/api/user/playlist/${playlistId}/track/${trackId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${Auth.token}` }
            });
            if (resp.ok) {
                const data = await resp.json();
                await Auth.fetchUserLibrary();
                this.openPlaylistView(data.playlist);
            }
        } catch (e) {
            console.error("Remove from playlist error:", e);
        }
    },

    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    },

    escapeHtml(str) {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
};

document.addEventListener("DOMContentLoaded", () => {
    App.init();
});

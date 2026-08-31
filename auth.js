/**
 * SoundWave Pro - Auth & User Library Manager
 */

const API_BASE = window.API_BASE_URL || "";

const Auth = {
    token: localStorage.getItem("soundwave_token"),
    currentUser: null,
    library: { likes: [], playlists: [] },

    init() {
        this.checkAuth();
        this.initAuthForms();
    },

    async checkAuth() {
        if (!this.token) {
            this.renderGuestUI();
            return;
        }

        try {
            const resp = await fetch(`${API_BASE}/api/auth/me`, {
                headers: { "Authorization": `Bearer ${this.token}` }
            });

            if (resp.ok) {
                const data = await resp.json();
                this.currentUser = data.user;
                this.renderUserUI();
                this.fetchUserLibrary();
            } else {
                this.logout();
            }
        } catch (e) {
            this.renderGuestUI();
        }
    },

    renderGuestUI() {
        const area = document.getElementById("user-auth-area");
        if (!area) return;
        area.innerHTML = `
            <button class="btn btn-secondary" onclick="Auth.openAuthModal('login')">Giriş Yap</button>
            <button class="btn btn-primary" onclick="Auth.openAuthModal('register')">Kayıt Ol</button>
        `;
    },

    renderUserUI() {
        const area = document.getElementById("user-auth-area");
        if (!area) return;
        area.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:32px; height:32px; border-radius:50%; background:var(--accent-gradient); display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:13px; color:#fff;">
                    ${(this.currentUser.username || 'U')[0].toUpperCase()}
                </div>
                <span style="font-size:13px; font-weight:700; color:#fff;">${this.currentUser.username}</span>
                <button class="btn btn-secondary" style="padding:6px 12px; font-size:11px;" onclick="Auth.logout()">Çıkış</button>
            </div>
        `;
    },

    async fetchUserLibrary() {
        if (!this.token) return;
        try {
            const resp = await fetch(`${API_BASE}/api/user/library`, {
                headers: { "Authorization": `Bearer ${this.token}` }
            });
            if (resp.ok) {
                this.library = await resp.json();
                this.renderSidebarPlaylists();
                App.updateLikedState();
            }
        } catch (e) {
            console.error("Library fetch error:", e);
        }
    },

    renderSidebarPlaylists() {
        const list = document.getElementById("sidebar-playlists");
        if (!list) return;
        list.innerHTML = "";

        (this.library.playlists || []).forEach(pl => {
            const li = document.createElement("li");
            li.className = "playlist-item";
            li.textContent = `📁 ${pl.name} (${(pl.tracks || []).length})`;
            li.onclick = () => App.openPlaylistView(pl);
            list.appendChild(li);
        });
    },

    openAuthModal(mode = 'login') {
        const modal = document.getElementById("auth-modal");
        const title = document.getElementById("auth-modal-title");
        const submitBtn = document.getElementById("auth-submit-btn");
        const switchText = document.getElementById("auth-switch-text");

        if (!modal) return;
        modal.dataset.mode = mode;

        if (mode === 'login') {
            title.textContent = "Hesabınıza Giriş Yapın";
            submitBtn.textContent = "Giriş Yap";
            switchText.innerHTML = `Hesabınız yok mu? <a href="javascript:void(0)" onclick="Auth.openAuthModal('register')" style="color:var(--accent-primary); font-weight:bold;">Kayıt Olun</a>`;
        } else {
            title.textContent = "Yeni Hesap Oluşturun";
            submitBtn.textContent = "Kayıt Ol";
            switchText.innerHTML = `Zaten hesabınız var mı? <a href="javascript:void(0)" onclick="Auth.openAuthModal('login')" style="color:var(--accent-primary); font-weight:bold;">Giriş Yapın</a>`;
        }

        modal.classList.add("active");
    },

    closeAuthModal() {
        const modal = document.getElementById("auth-modal");
        if (modal) modal.classList.remove("active");
    },

    initAuthForms() {
        const form = document.getElementById("auth-form");
        if (!form) return;

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const modal = document.getElementById("auth-modal");
            const mode = modal.dataset.mode || 'login';
            const username = document.getElementById("auth-username").value.trim();
            const password = document.getElementById("auth-password").value;
            const errBox = document.getElementById("auth-error");

            errBox.style.display = "none";

            const endpoint = mode === 'login' ? `${API_BASE}/api/auth/login` : `${API_BASE}/api/auth/register`;

            try {
                const resp = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, password })
                });

                const data = await resp.json();
                if (resp.ok && data.token) {
                    this.token = data.token;
                    localStorage.setItem("soundwave_token", data.token);
                    this.currentUser = data.user;
                    this.closeAuthModal();
                    this.renderUserUI();
                    this.fetchUserLibrary();
                } else {
                    errBox.textContent = data.detail || "Giriş başarısız.";
                    errBox.style.display = "block";
                }
            } catch (err) {
                errBox.textContent = "Bağlantı hatası!";
                errBox.style.display = "block";
            }
        });
    },

    async toggleLike(track) {
        if (!this.token) {
            this.openAuthModal('login');
            return;
        }

        try {
            const resp = await fetch(`${API_BASE}/api/user/like`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    track_id: track.id,
                    title: track.title,
                    artist: track.artist,
                    thumbnail: track.thumbnail,
                    duration_str: track.duration_str || "3:00"
                })
            });

            if (resp.ok) {
                await this.fetchUserLibrary();
                App.updateLikedState();
            }
        } catch (e) {
            console.error("Like toggle error:", e);
        }
    },

    async createPlaylistPrompt() {
        if (!this.token) {
            this.openAuthModal('login');
            return;
        }

        const name = prompt("Yeni Çalma Listesi Adı:");
        if (!name || !name.trim()) return;

        try {
            const resp = await fetch(`${API_BASE}/api/user/playlist`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.token}`
                },
                body: JSON.stringify({ name: name.trim() })
            });

            if (resp.ok) {
                await this.fetchUserLibrary();
            }
        } catch (e) {
            alert("Liste oluşturulamadı.");
        }
    },

    logout() {
        localStorage.removeItem("soundwave_token");
        this.token = null;
        this.currentUser = null;
        this.library = { likes: [], playlists: [] };
        this.renderGuestUI();
        this.renderSidebarPlaylists();
        App.updateLikedState();
    }
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        Auth.init();
    });
} else {
    Auth.init();
}

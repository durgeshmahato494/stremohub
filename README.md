<div align="center">
  <h1>🎬 StremoHub</h1>
  <p><strong>Open-source media center for Linux</strong></p>
  <p>YouTube · Streaming Movies & Series · IPTV Live TV</p>
  <p>Built for IR remote control — perfect for Raspberry Pi & ARM TV boxes</p>

  <a href="https://github.com/durgeshmahato494/stremohub/releases/latest">
    <img src="https://img.shields.io/github/v/release/durgeshmahato494/stremohub?label=latest&color=e50914" alt="Release">
  </a>
  <img src="https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-blue" alt="Platform">
  <img src="https://img.shields.io/badge/arch-amd64%20%7C%20arm64-green" alt="Arch">
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="License">
</div>

---

## ✨ Features

| Module | What it does |
|--------|-------------|
| **YouTube** | SmartTube-style · yt-dlp direct streams · quality selector · no ads · search & watch history without login |
| **Movies & Series** | TMDB metadata · 11 embed sources · Hindi dubbed mode · built-in player |
| **Live TV** | M3U playlists · channel groups · HLS playback · ffmpeg transcoding |
| **IR Remote** | Full 2D arrow navigation · on-screen keyboard · F1–F4 tab switching |

---

## 📦 Installation

### Linux (Ubuntu / Debian / Raspberry Pi OS)

```bash
# amd64 (PC / laptop)
sudo dpkg -i stremohub-v3.0-linux-amd64.deb
sudo apt-get install -f
stremohub

# arm64 (Raspberry Pi 4/5, Orange Pi)
sudo dpkg -i stremohub-v3.0-linux-arm64.deb
sudo apt-get install -f
stremohub
```

### Any Linux distro

```bash
chmod +x install-linux.sh
./install-linux.sh
```

Supports: Ubuntu · Debian · Fedora · Arch · openSUSE

### Windows 10 / 11

1. Install **Python 3.10+** from [python.org](https://python.org) — check ✅ *Add to PATH*
2. Double-click `install-windows.bat`
3. Launch with desktop shortcut

### macOS

```bash
pip3 install pywebview yt-dlp
brew install ffmpeg
python3 src/stremohub-webview.py
```

---

## ⚙️ Configuration

All settings live in one file. StremoHub works without any configuration — keys are optional.

```bash
# Create config file
mkdir -p ~/.local/share/stremohub
cp config.example.json ~/.local/share/stremohub/config.json
nano ~/.local/share/stremohub/config.json
```

```json
{
  "youtube": {
    "client_id": "",
    "client_secret": ""
  },
  "streamvault": {
    "tmdb_api_key": ""
  },
  "server": {
    "host": "127.0.0.1",
    "port": 8765
  }
}
```

> **Everything works without keys.** YouTube streaming works without login. Movies work without TMDB (no artwork). Live TV only needs an M3U URL.

---

## 🔑 YouTube Sign-in

> **Using the release package?** No setup needed — just click Sign In and enter the code. Read on.

Sign-in enables your subscriptions, liked videos, and watch history sync across devices.
Without sign-in everything still works — browse, search, and watch freely.

### How to sign in (release package)

1. Open StremoHub → **YouTube** tab → click **Sign in**
2. A code appears on screen — e.g. `ABCD-1234`
3. On your phone or any browser go to **[youtube.com/activate](https://youtube.com/activate)**
4. Enter the code
5. Sign in with your Google account → click **Allow**
6. Back in StremoHub — you're signed in ✅

That's it. No API keys, no configuration files.

> **Note:** You may see a *"This app isn't verified"* screen — click **Advanced** → **Go to StremoHub (unsafe)** to proceed. This warning appears on all apps that haven't completed Google's verification process and does not mean the app is harmful.

---

## 🎬 Movies & Series — TMDB Setup

TMDB provides posters, ratings, descriptions, and cast. Free API — takes 2 minutes.

1. Create a free account at **[themoviedb.org](https://www.themoviedb.org)**
2. **Settings** → **API** → **Create** → choose **Developer**
3. Fill in: App name `StremoHub` · Personal use
4. Copy your **API Key (v3 auth)**

Add to config:

```json
{
  "streamvault": {
    "tmdb_api_key": "YOUR_TMDB_API_KEY"
  }
}
```

---

## 📡 Live TV — IPTV

No account or API key needed. Just add any M3U playlist URL.

### Add a playlist

1. Open StremoHub → **Live TV** tab
2. Click **+ M3U**
3. Paste a playlist URL and click **Add**

Channels load automatically and are grouped by category.

### Free public playlists

| Region | URL |
|--------|-----|
| India | `https://iptv-org.github.io/iptv/countries/in.m3u` |
| All countries | `https://iptv-org.github.io/iptv/index.m3u` |
| By category | `https://iptv-org.github.io/iptv/categories/news.m3u` |

Browse all available lists at **[iptv-org.github.io](https://iptv-org.github.io)**

### Add your own subscription

If you have a paid IPTV subscription, your provider gives you an M3U URL — paste it the same way. StremoHub supports standard M3U/M3U8 playlist formats.

---

## ⌨️ IR Remote / Keyboard Controls

| Key | Action |
|-----|--------|
| `↑ ↓ ← →` | Navigate |
| `Enter` | Select · open keyboard on search box |
| `Backspace / Back` | Go back · close |
| `Space` | Play / Pause |
| `F` | Fullscreen |
| `M` | Mute |
| `[ ]` | Volume down / up |
| `PageUp / PageDown` | Next / Prev channel |
| `F1` | YouTube tab |
| `F2` | Movies tab |
| `F3` | Live TV tab |
| `F4` | Settings tab |

### ir-keytable (Raspberry Pi / TV boxes)

```bash
ir-keytable                     # list remotes
sudo ir-keytable -p RC-6 -w /etc/rc_keymaps/your_remote.toml
```

Map: OK → `KEY_ENTER` · Back → `KEY_BACKSPACE` · Arrows → `KEY_UP/DOWN/LEFT/RIGHT`

---

## 🏗️ Build from Source

### Step 1 — Clone

```bash
git clone https://github.com/durgeshmahato494/stremohub.git
cd stremohub
```

### Step 2 — Add your credentials

Open `src/server/stremohub_server.py` and fill in these 3 lines near the top of the file:

```python
YT_CLIENT_ID     = "YOUR_CLIENT_ID.apps.googleusercontent.com"
YT_CLIENT_SECRET = "YOUR_CLIENT_SECRET"
TMDB_API_KEY     = "YOUR_TMDB_API_KEY"
```

**Get YouTube credentials (free):**
1. Go to **[console.cloud.google.com](https://console.cloud.google.com)**
2. New project → Enable **YouTube Data API v3**
3. **Credentials** → **+ Create** → **OAuth 2.0 Client ID** → **TV and Limited Input devices**
4. Copy the **Client ID** and **Client Secret**

**Get TMDB key (free, for movie artwork):**
1. Register at **[themoviedb.org](https://www.themoviedb.org)**
2. **Settings** → **API** → **Create** → copy **API Key (v3 auth)**

> **Credentials are optional.** Without them: YouTube sign-in won't work (browsing/watching still works), movies show without posters.

### Step 3 — Build

```bash
bash build.sh amd64   # → dist/stremohub_amd64.deb
bash build.sh arm64   # → dist/stremohub_arm64.deb
```

### Step 4 — Install

```bash
sudo dpkg -i dist/stremohub_amd64.deb
sudo apt-get install -f
stremohub
```

See `platforms/` for Windows, macOS, Arch Linux, RPM, and Android TV builds.

---

## 📁 Project Structure

```
stremohub/
├── src/
│   ├── stremohub-gtk.py        # Linux GTK + WebKit2 launcher
│   ├── stremohub-webview.py    # Windows / macOS launcher
│   ├── server/
│   │   ├── stremohub_server.py # Python HTTP backend (port 8765)
│   │   └── init_db.py          # SQLite schema
│   └── app/                    # Web UI
│       ├── index.html
│       ├── css/main.css
│       └── js/
│           ├── youtube.js      # YouTube module
│           ├── pikashow.js     # Movies & series
│           ├── pvr.js          # Live TV
│           ├── player.js       # HLS/MP4 player
│           ├── remote.js       # IR remote navigation
│           └── osk.js          # On-screen keyboard
├── platforms/                  # Per-platform build files
├── config.example.json         # Config template
└── build.sh                    # Build script
```

User data: `~/.local/share/stremohub/` — no root access needed after install.

---

## 🛠️ Tech Stack

`Python 3` · `WebKit2GTK` · `Vanilla JS` · `SQLite` · `yt-dlp` · `ffmpeg` · `TMDB API`

---

## 📄 License

MIT — free to use, modify and distribute.

---

<div align="center">
Made with ❤️ · <a href="https://github.com/durgeshmahato494/stremohub/issues">Report a bug</a> · <a href="https://github.com/durgeshmahato494/stremohub/issues">Request a feature</a>
</div>

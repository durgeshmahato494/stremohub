# StremoHub — First-time Setup

## Add Your API Credentials

Copy the example config and fill in your keys:

```bash
mkdir -p ~/.local/share/stremohub
cp config.example.json ~/.local/share/stremohub/config.json
nano ~/.local/share/stremohub/config.json
```

### YouTube Login (optional)
Get credentials from https://console.cloud.google.com
→ APIs & Services → Credentials → Create → OAuth 2.0 Client ID → TV and Limited Input devices

### TMDB (for movie/series artwork)
Get a free API key from https://www.themoviedb.org/settings/api

## StremoHub works without any keys
- YouTube: browse, search, and watch without signing in
- Movies: works without TMDB key (no artwork/metadata)
- Live TV: works with any M3U playlist URL, no key needed

# StremoHub Privacy Policy

**Last updated:** 2025

## Summary
StremoHub stores all data **locally on your device only**. We collect nothing.

## What we store (locally)
| Data | Location | Purpose |
|------|----------|---------|
| Watch history | `~/.local/share/stremohub/db/stremohub.db` | Show on home screen |
| Search history | Same SQLite database | Show on home screen |
| IPTV playlists | Same SQLite database | Remember your channels |
| YouTube auth token | Same SQLite database | Keep you signed in |
| App settings | `~/.local/share/stremohub/config.json` | Save your preferences |

## What we do NOT do
- ❌ No analytics or telemetry
- ❌ No data sent to any StremoHub server (there is none)
- ❌ No advertising
- ❌ No tracking

## Third-party connections
StremoHub connects directly from your device to:
- **YouTube / Google** — for video playback and optional sign-in
- **TMDB** — for movie/series metadata and posters
- **Your IPTV provider** — for live TV streams

Your IP address is visible to these services as with any browser.

## YouTube sign-in
If you choose to sign in with Google, StremoHub uses the standard
OAuth 2.0 device flow. Your credentials are never seen by StremoHub.
The access token is stored locally and used only to fetch your
subscriptions, watch history, and liked videos.

## Contact
Open an issue at https://github.com/YOUR_USERNAME/stremohub/issues

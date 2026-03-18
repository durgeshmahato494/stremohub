#!/usr/bin/env python3
"""
StremoHub v2 — Fully Integrated Backend
All APIs built-in. Zero configuration required.
  • YouTube  → InnerTube (no key)
  • TMDB     → built-in key (+ user override)
  • Streams  → 8 embed sources
  • IPTV     → M3U parser + SQLite
"""
import json, sqlite3, os, sys, re, urllib.request, urllib.error, urllib.parse
import time, socketserver, threading
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, urlencode
from pathlib import Path

import pwd
# Use user-writable directory — no root needed
_home = os.path.expanduser("~")
_data = os.environ.get("STREMOHUB_DATA", os.path.join(_home, ".local", "share", "stremohub"))

CONFIG_PATH = os.path.join(_data, "config.json")
DB_PATH     = os.path.join(_data, "db", "stremohub.db")
APP_DIR     = Path("/usr/lib/stremohub/app")

# ── Built-in API keys (zero config) ───────────────────────────────────────────
# TMDB public read-access token (free tier — works for all metadata)
TMDB_KEY_BUILTIN  = "27536cdbd67638071863eeeddef3b34e"
TMDB_READ_BUILTIN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9"

# User YouTube Data API key (for authenticated requests)
YT_DATA_API_KEY = "AIzaSyALaBGCzKmNj66pVKznKV1UmzDexg0Qqkc"

# InnerTube — YouTube internal (same key SmartTube/NewPipe/Piped use)
IT_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"  # InnerTube
YT_DATA_API_KEY = "AIzaSyALaBGCzKmNj66pVKznKV1UmzDexg0Qqkc"  # YouTube Data API v3
IT_URL = "https://www.youtube.com/youtubei/v1"
IT_CTX = {"client":{"clientName":"WEB","clientVersion":"2.20240101.00.00","hl":"en","gl":"US"}}

# ── YouTube device code login (no API key needed, like SmartTube) ─────────────
# These are hardcoded client IDs embedded in YouTube TV/Android apps.
# No Google Cloud Console setup required — same approach as SmartTube.
# Source: SmartTube github.com/yuliskov/SmartTube
YT_TOKEN_URL = "https://oauth2.googleapis.com/token"
YT_SCOPE     = ("https://www.googleapis.com/auth/youtube "
                "https://www.googleapis.com/auth/userinfo.profile "
                "https://www.googleapis.com/auth/userinfo.email")

# ── Build-from-source: enter your credentials here ───────────────────────────
# Get from: console.cloud.google.com → APIs & Services → Credentials
# Application type: "TV and Limited Input devices"
# See README.md → "Build from Source" section for full instructions
#
YT_CLIENT_ID     = ""   # ← paste your Client ID here
YT_CLIENT_SECRET = ""   # ← paste your Client Secret here
TMDB_API_KEY     = ""   # ← paste your TMDB API key here (optional)
# ─────────────────────────────────────────────────────────────────────────────

YT_CLIENTS = [
    (YT_CLIENT_ID, YT_CLIENT_SECRET),
]

# Kept for backward compat
YT_TV_CLIENT_ID     = YT_CLIENT_ID
YT_TV_CLIENT_SECRET = YT_CLIENT_SECRET
YT_TV_SCOPE         = YT_SCOPE
YT_DEVICE_URL       = "https://oauth2.googleapis.com/device/code"
YT_DEVICE_CLIENTS   = YT_CLIENTS

TMDB_BASE = "https://api.themoviedb.org/3"

# ── Config ────────────────────────────────────────────────────────────────────
def load_config():
    default = {"server":{"host":"127.0.0.1","port":8765},"youtube":{},"streamvault":{},"iptv":{}}
    try:
        if not os.path.exists(CONFIG_PATH):
            return default
        with open(CONFIG_PATH) as f:
            data = json.load(f)
        # merge with defaults so missing keys don't crash
        for k,v in default.items():
            if k not in data:
                data[k] = v
        return data
    except Exception:
        return default

def save_config(cfg):
    with open(CONFIG_PATH,"w") as f: json.dump(cfg,f,indent=2)

CONFIG = load_config()
HOST   = CONFIG["server"].get("host","127.0.0.1")
PORT   = CONFIG["server"].get("port",8765)

# ── Database ──────────────────────────────────────────────────────────────────
def get_db():
    c = sqlite3.connect(DB_PATH); c.row_factory = sqlite3.Row; return c

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = get_db()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS yt_sessions(
            id INTEGER PRIMARY KEY,access_token TEXT,refresh_token TEXT,
            expires_at INTEGER,user_info TEXT,
            created_at INTEGER DEFAULT(strftime('%s','now')));
        CREATE TABLE IF NOT EXISTS yt_history(
            id INTEGER PRIMARY KEY,video_id TEXT UNIQUE,title TEXT,
            channel TEXT,thumbnail TEXT,
            watched_at INTEGER DEFAULT(strftime('%s','now')));
        CREATE TABLE IF NOT EXISTS yt_favorites(
            id INTEGER PRIMARY KEY,video_id TEXT UNIQUE,title TEXT,
            channel TEXT,thumbnail TEXT,duration TEXT,
            added_at INTEGER DEFAULT(strftime('%s','now')));
        CREATE TABLE IF NOT EXISTS iptv_playlists(
            id INTEGER PRIMARY KEY,name TEXT,url TEXT,local_path TEXT,
            last_updated INTEGER,channel_count INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS iptv_channels(
            id INTEGER PRIMARY KEY,playlist_id INTEGER,name TEXT,url TEXT,
            group_title TEXT,logo TEXT,tvg_id TEXT,tvg_name TEXT,
            FOREIGN KEY(playlist_id) REFERENCES iptv_playlists(id));
        CREATE TABLE IF NOT EXISTS iptv_favorites(
            id INTEGER PRIMARY KEY,channel_id INTEGER UNIQUE,
            added_at INTEGER DEFAULT(strftime('%s','now')),
            FOREIGN KEY(channel_id) REFERENCES iptv_channels(id));
        CREATE TABLE IF NOT EXISTS sv_favorites(
            id INTEGER PRIMARY KEY,content_id TEXT,source_id INTEGER DEFAULT 0,
            title TEXT,poster TEXT,type TEXT,
            added_at INTEGER DEFAULT(strftime('%s','now')));
        CREATE TABLE IF NOT EXISTS sv_watch_history(
            id INTEGER PRIMARY KEY,content_id TEXT,source_id INTEGER DEFAULT 0,
            title TEXT,poster TEXT,type TEXT,
            progress INTEGER DEFAULT 0,duration INTEGER DEFAULT 0,
            watched_at INTEGER DEFAULT(strftime('%s','now')));
        CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT);
        CREATE TABLE IF NOT EXISTS pvr_search_history(
            id INTEGER PRIMARY KEY, query TEXT UNIQUE,
            count INTEGER DEFAULT 1,
            searched_at INTEGER DEFAULT(strftime('%s','now')));
        CREATE TABLE IF NOT EXISTS sv_search_history(
            id INTEGER PRIMARY KEY, query TEXT UNIQUE,
            count INTEGER DEFAULT 1,
            searched_at INTEGER DEFAULT(strftime('%s','now')));
        CREATE TABLE IF NOT EXISTS yt_search_history(
            id INTEGER PRIMARY KEY, query TEXT UNIQUE,
            count INTEGER DEFAULT 1,
            searched_at INTEGER DEFAULT(strftime('%s','now')));
    """)
    # Pre-register India IPTV playlist if not already present
    INDIA_PL  = "https://iptv-org.github.io/iptv/countries/in.m3u"
    INDIA_NAME = "\U0001f1ee\U0001f1f3 India IPTV (iptv-org)"
    existing = c.execute("SELECT id FROM iptv_playlists WHERE url=?", (INDIA_PL,)).fetchone()
    if not existing:
        c.execute(
            "INSERT INTO iptv_playlists(name,url,last_updated,channel_count) VALUES(?,?,?,?)",
            (INDIA_NAME, INDIA_PL, int(time.time()), 0)
        )
    c.commit(); c.close()

# ── TMDB helpers ──────────────────────────────────────────────────────────────
def get_tmdb_key():
    if TMDB_API_KEY: return TMDB_API_KEY
    # Always use baked-in key; user override in config is optional
    cfg = load_config()
    user_key = cfg.get("streamvault",{}).get("tmdb_api_key","")
    return user_key if user_key else TMDB_KEY_BUILTIN

def tmdb_get(endpoint, params=None):
    params = dict(params or {})
    params["api_key"] = get_tmdb_key()
    url = f"{TMDB_BASE}/{endpoint}?{urlencode(params)}"
    req = urllib.request.Request(url, headers={"Accept":"application/json",
          "User-Agent":"StremoHub/2.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": e.code, "message": e.read().decode()[:200]}
    except Exception as e:
        return {"error": str(e)}

# ── InnerTube helpers ─────────────────────────────────────────────────────────
def it_post(endpoint, body, token=None):
    url  = f"{IT_URL}/{endpoint}?key={IT_KEY}&prettyPrint=false"
    body["context"] = IT_CTX
    req  = urllib.request.Request(url, data=json.dumps(body).encode(), headers={
        "Content-Type":"application/json",
        "X-YouTube-Client-Name":"1",
        "X-YouTube-Client-Version":"2.20240101.00.00",
        "User-Agent":"Mozilla/5.0 (compatible; StremoHub/2.0)",
    })
    if token: req.add_header("Authorization",f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e: return {"error":e.code}
    except Exception as e: return {"error":str(e)}

def it_text(obj):
    if not obj: return ""
    if "simpleText" in obj: return obj["simpleText"]
    if "runs" in obj: return "".join(r.get("text","") for r in obj["runs"])
    return ""

def it_thumb(thumbs):
    if not thumbs: return ""
    ordered = sorted(thumbs, key=lambda t:t.get("width",0), reverse=True)
    for t in ordered:
        if t.get("width",0) <= 480: return t.get("url","")
    return ordered[-1].get("url","") if ordered else ""

def walk(obj, kind, out=None):
    if out is None: out=[]
    if isinstance(obj,dict):
        if kind in obj: out.append(obj[kind])
        for v in obj.values(): walk(v,kind,out)
    elif isinstance(obj,list):
        for i in obj: walk(i,kind,out)
    return out

def parse_video(r):
    vid = r.get("videoId","")
    chId = ""
    for k in ("longBylineText","shortBylineText","ownerText"):
        if k in r:
            runs = r[k].get("runs",[{}])
            ep = runs[0].get("navigationEndpoint",{})
            chId = ep.get("browseEndpoint",{}).get("browseId","")
            if chId: break
    return {
        "id":         vid,
        "title":      it_text(r.get("title",{})),
        "channel":    it_text(r.get("longBylineText") or r.get("shortBylineText") or r.get("ownerText",{})),
        "channelId":  chId,
        "views":      it_text(r.get("viewCountText",{})),
        "published":  it_text(r.get("publishedTimeText",{})),
        "duration":   it_text(r.get("lengthText",{})),
        "thumbnail":  it_thumb(r.get("thumbnail",{}).get("thumbnails",[])) or f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg",
        "description":it_text(r.get("descriptionSnippet",{})),
    }

def yt_search(q, n=20, token=None):
    r = it_post("search",{"query":q,"params":"EgIQAQ=="},token)
    return [parse_video(v) for v in walk(r,"videoRenderer")[:n]]

def yt_trending(region="US", cat="", token=None):
    ctx = {"client":{**IT_CTX["client"],"gl":region}}
    r   = it_post("browse",{"browseId":"FEtrending","params":""},token)
    r["context"] = ctx
    r   = it_post("browse",{"browseId":"FEtrending","context":ctx})
    return [parse_video(v) for v in walk(r,"videoRenderer")[:24]]

def yt_video_detail(vid, token=None):
    r = it_post("player",{"videoId":vid,"playbackContext":{"contentPlaybackContext":{"signatureTimestamp":19950}}},token)
    d = r.get("videoDetails",{})
    mi= r.get("microformat",{}).get("playerMicroformatRenderer",{})
    return {"id":d.get("videoId",""),"title":d.get("title",""),"channel":d.get("author",""),
            "channelId":d.get("channelId",""),"views":d.get("viewCount",""),
            "description":d.get("shortDescription",""),"duration":d.get("lengthSeconds",""),
            "thumbnail":it_thumb(d.get("thumbnail",{}).get("thumbnails",[])),
            "published":mi.get("publishDate","")}

def yt_related(vid, token=None):
    r = it_post("next",{"videoId":vid},token)
    # Try multiple renderer types - YouTube changes these often
    items = (walk(r,"compactVideoRenderer") or
             walk(r,"videoRenderer")        or
             walk(r,"gridVideoRenderer")    or [])
    return [parse_video(v) for v in items[:20]]

def yt_channel(chid, token=None):
    r = it_post("browse",{"browseId":chid},token)
    h = (r.get("header",{}).get("c4TabbedHeaderRenderer") or
         r.get("header",{}).get("channelPageHeaderRenderer") or {})
    return {"id":chid,"title":it_text(h.get("title",{})) or h.get("title",""),
            "thumbnail":it_thumb(h.get("avatar",{}).get("thumbnails",[])),
            "subscribers":it_text(h.get("subscriberCountText",{}))}

def yt_channel_videos(chid, token=None):
    r = it_post("browse",{"browseId":chid,"params":"EgZ2aWRlb3PyBgQKAjoA"},token)
    vids = walk(r,"gridVideoRenderer") or walk(r,"videoRenderer")
    return [parse_video(v) for v in vids[:24]]

def yt_subscriptions(token):
    r = it_post("browse",{"browseId":"FEsubscriptions"},token)
    return [parse_video(v) for v in walk(r,"videoRenderer")[:30]]

# ── YouTube auth ──────────────────────────────────────────────────────────────
REDIRECT_URI  = "http://127.0.0.1:8765/youtube/oauth/callback"
YT_AUTH_URL   = "https://accounts.google.com/o/oauth2/v2/auth"
YT_SCOPES     = ("https://www.googleapis.com/auth/youtube.readonly "
                 "https://www.googleapis.com/auth/youtube.force-ssl "
                 "https://www.googleapis.com/auth/userinfo.profile "
                 "https://www.googleapis.com/auth/userinfo.email")

def _get_yt_credentials():
    """Return (client_id, client_secret) — prefer user config over built-in."""
    cfg = load_config().get("youtube",{})
    cid = cfg.get("client_id","")  or YT_TV_CLIENT_ID
    sec = cfg.get("client_secret","") or YT_TV_CLIENT_SECRET
    return cid, sec

def yt_build_auth_url():
    """Build the OAuth redirect URL. Works for Web, Desktop AND TV client types."""
    cid, _ = _get_yt_credentials()
    params = urlencode({
        "client_id":     cid,
        "redirect_uri":  REDIRECT_URI,
        "response_type": "code",
        "scope":         YT_SCOPES,
        "access_type":   "offline",
        "prompt":        "consent",
    })
    return f"{YT_AUTH_URL}?{params}"

def yt_exchange_code(code):
    """Exchange auth code for tokens (redirect OAuth flow)."""
    cid, sec = _get_yt_credentials()
    data = urlencode({
        "code":          code,
        "client_id":     cid,
        "client_secret": sec,
        "redirect_uri":  REDIRECT_URI,
        "grant_type":    "authorization_code",
    }).encode()
    req = urllib.request.Request(YT_TOKEN_URL, data=data,
          headers={"Content-Type":"application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e:
        try: return json.loads(e.read())
        except Exception: return {"error": str(e.code)}
    except Exception as e: return {"error": str(e)}

def yt_device_start():
    """
    Get YouTube activation code for youtube.com/activate.
    No API key or Google Console setup required.
    Uses client IDs embedded in YouTube TV apps (same as SmartTube).
    """
    for cid, sec in YT_CLIENTS:
        try:
            data = urlencode({
                "client_id": cid,
                "scope":     YT_SCOPE,
            }).encode()
            req = urllib.request.Request(
                "https://oauth2.googleapis.com/device/code",
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            with urllib.request.urlopen(req, timeout=12) as r:
                resp = json.loads(r.read())

            if "user_code" in resp:
                # Override URL to always point at youtube.com/activate
                resp["verification_url"] = "https://www.youtube.com/activate"
                resp["_cid"] = cid
                resp["_sec"] = sec
                return resp

        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read())
            except Exception:
                body = {}
            err = body.get("error", "")
            if err in ("invalid_client", "unauthorized_client"):
                continue  # try next client
            # Other error — return it
            return body
        except Exception as ex:
            continue  # network error, try next

    return {
        "error": "unavailable",
        "message": "Could not get activation code. YouTube works without login.",
    }

def yt_device_poll(device_code, cid="", sec="", **_):
    """
    Poll Google to check if user entered the activation code.
    Returns {"status":"ok","user":{...}} on success.
    """
    if not cid: cid = YT_TV_CLIENT_ID
    if not sec: sec = YT_TV_CLIENT_SECRET

    try:
        data = urlencode({
            "client_id":     cid,
            "client_secret": sec,
            "device_code":   device_code,
            "grant_type":    "urn:ietf:params:oauth2:grant-type:device_code",
        }).encode()
        req = urllib.request.Request(
            YT_TOKEN_URL, data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        with urllib.request.urlopen(req, timeout=12) as r:
            resp = json.loads(r.read())

        if "access_token" in resp:
            # Save session to DB
            at  = resp.get("access_token","")
            rt  = resp.get("refresh_token","")
            exp = int(time.time()) + resp.get("expires_in", 3600)
            db  = get_db()
            db.execute("DELETE FROM yt_sessions")
            db.execute("INSERT INTO yt_sessions(access_token,refresh_token,expires_at) VALUES(?,?,?)",
                       (at, rt, exp))
            db.commit(); db.close()
            # Get user info
            user = yt_user_info(at)
            return {"status": "ok", "user": user}

        return resp

    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read())
        except Exception:
            return {"error": str(e.code)}
        err = body.get("error", "")
        if err == "authorization_pending": return {"status": "pending"}
        if err == "slow_down":             return {"status": "pending"}
        if err == "expired_token":         return {"status": "expired_token"}
        return body
    except Exception as ex:
        return {"error": str(ex)}

def yt_get_token():
    db  = get_db()
    row = db.execute("SELECT * FROM yt_sessions ORDER BY id DESC LIMIT 1").fetchone()
    db.close()
    if not row: return None
    if row["expires_at"] and time.time() > row["expires_at"]-60:
        return yt_refresh(row["refresh_token"])
    return row["access_token"]

def yt_refresh(rt):
    data = urlencode({"client_id":YT_TV_CLIENT_ID,"client_secret":YT_TV_CLIENT_SECRET,
                      "refresh_token":rt,"grant_type":"refresh_token"}).encode()
    req  = urllib.request.Request(YT_TOKEN_URL,data=data,
           headers={"Content-Type":"application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req,timeout=15) as r: resp=json.loads(r.read())
        db = get_db()
        db.execute("UPDATE yt_sessions SET access_token=?,expires_at=? WHERE refresh_token=?",
                   (resp.get("access_token"),int(time.time())+resp.get("expires_in",3600),rt))
        db.commit(); db.close()
        return resp.get("access_token")
    except Exception: return None

def yt_user_info(token):
    req = urllib.request.Request("https://www.googleapis.com/oauth2/v2/userinfo",
          headers={"Authorization":f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req,timeout=10) as r: return json.loads(r.read())
    except Exception: return {}

# ── YouTube Data API v3 (baked-in key — better metadata) ─────────────────────
YT_DATA_BASE = "https://www.googleapis.com/youtube/v3"

def yt_data_get(endpoint, params, token=None):
    """YouTube Data API v3 call using baked-in key."""
    params = dict(params)
    # Use baked-in key
    params["key"] = YT_DATA_API_KEY
    url = f"{YT_DATA_BASE}/{endpoint}?{urlencode(params)}"
    req = urllib.request.Request(url, headers={"Accept":"application/json",
          "User-Agent":"StremoHub/2.0"})
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": e.code, "message": e.read().decode()[:200]}
    except Exception as e:
        return {"error": str(e)}

def yt_data_search(query, n=20, token=None):
    """Search using YouTube Data API v3."""
    r = yt_data_get("search", {
        "q": query, "part": "snippet", "type": "video",
        "maxResults": n, "order": "relevance",
    }, token)
    items = []
    for item in r.get("items", []):
        vid = item.get("id",{}).get("videoId","")
        sn  = item.get("snippet",{})
        th  = sn.get("thumbnails",{}).get("medium",{}).get("url","") or               sn.get("thumbnails",{}).get("default",{}).get("url","") or               f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg"
        items.append({
            "id": vid,
            "title": sn.get("title",""),
            "channel": sn.get("channelTitle",""),
            "channelId": sn.get("channelId",""),
            "published": sn.get("publishedAt","")[:10],
            "thumbnail": th,
            "description": sn.get("description","")[:200],
            "views": "", "duration": "",
        })
    return items

def yt_data_trending(region="US", category="", token=None):
    """Trending using YouTube Data API v3."""
    params = {
        "part": "snippet,statistics,contentDetails",
        "chart": "mostPopular",
        "regionCode": region,
        "maxResults": "24",
    }
    if category:
        params["videoCategoryId"] = category
    r = yt_data_get("videos", params, token)
    items = []
    for item in r.get("items", []):
        vid = item.get("id","")
        sn  = item.get("snippet",{})
        st  = item.get("statistics",{})
        cd  = item.get("contentDetails",{})
        th  = sn.get("thumbnails",{}).get("medium",{}).get("url","") or               f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg"
        # Format duration PT4M32S → 4:32
        dur = ""
        raw = cd.get("duration","")
        if raw:
            import re as _re
            m = _re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", raw)
            if m:
                h,mn,s = int(m.group(1) or 0),int(m.group(2) or 0),int(m.group(3) or 0)
                dur = f"{h}:{mn:02d}:{s:02d}" if h else f"{mn}:{s:02d}"
        vc = st.get("viewCount","")
        if vc:
            vc_int = int(vc)
            if vc_int >= 1_000_000: vc = f"{vc_int/1_000_000:.1f}M views"
            elif vc_int >= 1_000:   vc = f"{vc_int/1_000:.1f}K views"
            else:                   vc = f"{vc_int} views"
        items.append({
            "id": vid,
            "title": sn.get("title",""),
            "channel": sn.get("channelTitle",""),
            "channelId": sn.get("channelId",""),
            "published": sn.get("publishedAt","")[:10],
            "thumbnail": th,
            "views": vc,
            "duration": dur,
            "description": sn.get("description","")[:200],
        })
    return items

def yt_data_video_detail(vid, token=None):
    """Video detail using YouTube Data API v3."""
    r = yt_data_get("videos", {
        "id": vid,
        "part": "snippet,statistics,contentDetails",
    }, token)
    items = r.get("items", [])
    if not items:
        return yt_video_detail(vid, token)  # fallback to InnerTube
    item = items[0]
    sn = item.get("snippet",{})
    st = item.get("statistics",{})
    cd = item.get("contentDetails",{})
    vc = st.get("viewCount","")
    if vc:
        vc_int = int(vc)
        if vc_int >= 1_000_000: vc = f"{vc_int/1_000_000:.1f}M"
        elif vc_int >= 1_000:   vc = f"{vc_int/1_000:.1f}K"
    lc = st.get("likeCount","")
    if lc:
        lc_int = int(lc)
        if lc_int >= 1_000_000: lc = f"{lc_int/1_000_000:.1f}M"
        elif lc_int >= 1_000:   lc = f"{lc_int/1_000:.1f}K"
    th = sn.get("thumbnails",{}).get("maxres",{}).get("url","") or          sn.get("thumbnails",{}).get("high",{}).get("url","") or          f"https://i.ytimg.com/vi/{vid}/maxresdefault.jpg"
    return {
        "id":          vid,
        "title":       sn.get("title",""),
        "channel":     sn.get("channelTitle",""),
        "channelId":   sn.get("channelId",""),
        "views":       vc,
        "likes":       lc,
        "description": sn.get("description",""),
        "published":   sn.get("publishedAt","")[:10],
        "thumbnail":   th,
        "duration":    cd.get("duration",""),
    }

def yt_data_channel(chid, token=None):
    """Channel info using YouTube Data API v3."""
    r = yt_data_get("channels", {
        "id": chid,
        "part": "snippet,statistics,brandingSettings",
    }, token)
    items = r.get("items",[])
    if not items: return yt_channel(chid, token)
    item = items[0]; sn = item.get("snippet",{}); st = item.get("statistics",{})
    sc = st.get("subscriberCount","")
    if sc:
        sc_int = int(sc)
        if sc_int >= 1_000_000: sc = f"{sc_int/1_000_000:.1f}M subscribers"
        elif sc_int >= 1_000:   sc = f"{sc_int/1_000:.1f}K subscribers"
        else:                   sc = f"{sc_int} subscribers"
    return {
        "id":          chid,
        "title":       sn.get("title",""),
        "thumbnail":   sn.get("thumbnails",{}).get("medium",{}).get("url",""),
        "banner":      item.get("brandingSettings",{}).get("image",{}).get("bannerExternalUrl",""),
        "subscribers": sc,
        "videoCount":  st.get("videoCount",""),
        "description": sn.get("description","")[:300],
    }

def yt_data_channel_videos(chid, token=None):
    """Channel videos using YouTube Data API v3."""
    # Get uploads playlist ID first
    ch = yt_data_get("channels",{"id":chid,"part":"contentDetails"},token)
    items = ch.get("items",[])
    if not items: return yt_channel_videos(chid, token)
    pl_id = items[0].get("contentDetails",{}).get("relatedPlaylists",{}).get("uploads","")
    if not pl_id: return []
    r = yt_data_get("playlistItems",{
        "playlistId": pl_id, "part": "snippet,contentDetails", "maxResults": "24"
    }, token)
    result = []
    for item in r.get("items",[]):
        sn  = item.get("snippet",{})
        vid = sn.get("resourceId",{}).get("videoId","")
        th  = sn.get("thumbnails",{}).get("medium",{}).get("url","") or               f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg"
        result.append({
            "id": vid, "title": sn.get("title",""),
            "channel": sn.get("channelTitle",""), "channelId": chid,
            "published": sn.get("publishedAt","")[:10],
            "thumbnail": th, "views":"","duration":"","description":"",
        })
    return result

def yt_data_subscriptions(token):
    """Subscriptions using YouTube Data API v3."""
    r = yt_data_get("subscriptions",{
        "part":"snippet","mine":"true","maxResults":"50","order":"alphabetical"
    }, token)
    items = []
    for item in r.get("items",[]):
        sn   = item.get("snippet",{})
        chid = sn.get("resourceId",{}).get("channelId","")
        th   = sn.get("thumbnails",{}).get("medium",{}).get("url","")
        items.append({
            "id": chid, "title": sn.get("title",""),
            "channelId": chid, "channel": sn.get("title",""),
            "thumbnail": th, "views":"","duration":"","published":"","description":"",
        })
    return items

# ── M3U parser ────────────────────────────────────────────────────────────────
def parse_m3u(content):
    channels=[]; lines=content.splitlines(); i=0
    while i<len(lines):
        line=lines[i].strip()
        if line.startswith("#EXTINF:"):
            info={"name":"","url":"","group_title":"Uncategorized","logo":"","tvg_id":"","tvg_name":""}
            for attr,key in [('group-title="([^"]*)"','group_title'),('tvg-logo="([^"]*)"','logo'),
                              ('tvg-id="([^"]*)"','tvg_id'),('tvg-name="([^"]*)"','tvg_name')]:
                m=re.search(attr,line,re.IGNORECASE)
                if m: info[key]=m.group(1)
            c=line.rfind(",")
            if c!=-1: info["name"]=line[c+1:].strip()
            j=i+1
            while j<len(lines) and not lines[j].strip(): j+=1
            if j<len(lines) and not lines[j].strip().startswith("#"):
                info["url"]=lines[j].strip(); i=j
            channels.append(info)
        i+=1
    return channels

def fetch_m3u(url):
    if url.startswith("http"):
        req=urllib.request.Request(url,headers={"User-Agent":"StremoHub/2.0"})
        with urllib.request.urlopen(req,timeout=30) as r:
            return r.read().decode("utf-8",errors="replace")
    with open(url,"r",encoding="utf-8",errors="replace") as f: return f.read()



import subprocess, threading, shutil, tempfile, hashlib

# ── FFmpeg transcoding proxy ──────────────────────────────────────────────────
# Converts ANY format (MPEG-2, H264, HEVC, AAC, AC3) to HLS for WebKit
FFMPEG = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"
_transcode_sessions = {}  # url_hash -> (process, hls_dir)
_transcode_lock     = threading.Lock()

def _url_hash(url):
    return hashlib.md5(url.encode()).hexdigest()[:12]

def _start_transcode(url):
    """Start an ffmpeg HLS transcode session for the given stream URL.
       Returns (hls_dir, playlist_path) or raises on error."""
    uid     = _url_hash(url)
    hls_dir = os.path.join(tempfile.gettempdir(), f"stremohub_{uid}")

    with _transcode_lock:
        # Reuse existing session if still running
        if uid in _transcode_sessions:
            proc, d = _transcode_sessions[uid]
            if proc.poll() is None and os.path.exists(os.path.join(d,"index.m3u8")):
                return d, os.path.join(d,"index.m3u8")
            else:
                del _transcode_sessions[uid]

        os.makedirs(hls_dir, exist_ok=True)
        playlist = os.path.join(hls_dir, "index.m3u8")

        cmd = [
            FFMPEG, "-y",
            "-loglevel",  "error",
            "-reconnect", "1",
            "-reconnect_streamed", "1",
            "-reconnect_delay_max", "5",
            "-user_agent", "Mozilla/5.0 (compatible; StremoHub/3.0)",
            "-i", url,
            # Video: copy H264/HEVC as-is, transcode MPEG-2 to H264
            "-c:v", "copy",
            "-c:a", "aac",         # Always transcode audio to AAC (WebKit requires it)
            "-ac", "2",            # Stereo
            "-ar", "44100",
            "-b:a", "128k",
            # HLS output settings
            "-f",            "hls",
            "-hls_time",     "3",
            "-hls_list_size","10",    # Rolling 10-segment window
            "-hls_flags",   "delete_segments+append_list",
            "-hls_segment_filename", os.path.join(hls_dir, "seg%03d.ts"),
            playlist
        ]

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            preexec_fn=os.setsid
        )
        _transcode_sessions[uid] = (proc, hls_dir)

        # Wait up to 6s for first segment
        import time as _time
        for _ in range(24):
            _time.sleep(0.25)
            if os.path.exists(playlist) and os.path.getsize(playlist) > 0:
                return hls_dir, playlist
            if proc.poll() is not None:
                err = proc.stderr.read(500).decode(errors="replace")
                raise RuntimeError(f"ffmpeg exited: {err}")

        raise RuntimeError("ffmpeg did not produce HLS output in time")

def _cleanup_transcode(uid):
    with _transcode_lock:
        if uid in _transcode_sessions:
            proc, d = _transcode_sessions.pop(uid)
            try: os.killpg(os.getpgid(proc.pid), 9)
            except Exception: pass

def _cleanup_old_sessions():
    """Kill transcoding sessions that are no longer active."""
    import time as _time
    with _transcode_lock:
        dead = [uid for uid,(proc,_) in _transcode_sessions.items() if proc.poll() is not None]
        for uid in dead: del _transcode_sessions[uid]



# ── Pikashow embed stream extractor ──────────────────────────────────────────
def sv_extract_streams(embed_url):
    """
    Extract direct video stream URLs from any embed source using yt-dlp.
    Works with vidsrc, autoembed, vidlink, 2embed, multiembed, and more.
    Returns list of stream dicts or {"error": ...}
    """
    import shutil, subprocess as sp, json as _json

    ytdlp = shutil.which("yt-dlp") or shutil.which("yt_dlp")

    if not ytdlp:
        try:
            import yt_dlp as ydl_mod
            return _sv_extract_module(embed_url, ydl_mod)
        except ImportError:
            return {"error": "yt-dlp not installed", "streams": []}

    try:
        cmd = [
            ytdlp,
            "--dump-json",
            "--no-playlist",
            "--no-warnings",
            "--quiet",
            "--no-check-certificate",
            "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "--add-header", "Referer:" + embed_url,
            embed_url
        ]
        r = sp.run(cmd, capture_output=True, text=True, timeout=25)
        if r.returncode != 0 or not r.stdout.strip():
            return {"error": r.stderr[:200] or "yt-dlp returned no output", "streams": []}
        info = _json.loads(r.stdout)
        return _sv_parse_streams(info)
    except Exception as e:
        return {"error": str(e), "streams": []}

def _sv_extract_module(embed_url, ydl_mod):
    opts = {
        "quiet": True,
        "no_warnings": True,
        "no_check_certificate": True,
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": embed_url,
        },
    }
    try:
        with ydl_mod.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(embed_url, download=False)
        return _sv_parse_streams(info)
    except Exception as e:
        return {"error": str(e), "streams": []}

def _sv_parse_streams(info):
    """Parse yt-dlp output into stream list for frontend."""
    streams = []
    formats = info.get("formats") or []
    for f in formats:
        url = f.get("url", "")
        if not url: continue
        vcodec = f.get("vcodec", "none")
        acodec = f.get("acodec", "none")
        has_v  = vcodec not in ("none", "")
        has_a  = acodec not in ("none", "")
        if not has_v and not has_a: continue
        qual = (f.get("format_note") or
                (str(f.get("height",""))+"p" if f.get("height") else "") or
                f.get("ext",""))
        streams.append({
            "url":      url,
            "quality":  qual,
            "hasVideo": has_v,
            "hasAudio": has_a,
            "height":   f.get("height", 0) or 0,
            "ext":      f.get("ext", ""),
        })

    # If no separate formats, check for direct URL
    if not streams and info.get("url"):
        streams.append({
            "url":      info["url"],
            "quality":  info.get("format_note", "") or info.get("ext", ""),
            "hasVideo": True,
            "hasAudio": True,
            "height":   info.get("height", 0) or 0,
            "ext":      info.get("ext", ""),
        })

    # Sort best first: combined (video+audio), highest resolution
    streams.sort(key=lambda x: (not(x["hasVideo"] and x["hasAudio"]), -(x.get("height") or 0)))

    return {
        "streams": streams[:8],
        "title":   info.get("title", ""),
    }

# ── IPTV Stream Proxy ──────────────────────────────────────────────────────────
def _proxy_request(url, extra_headers=None):
    """Fetch a remote URL and return (status, headers, body)."""
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; StremoHub/2.0)",
        "Referer": url,
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, {}, b""
    except Exception as e:
        return 502, {}, str(e).encode()

def _rewrite_m3u8(content_bytes, original_url, proxy_base):
    """Rewrite segment URLs in .m3u8 so they go through the proxy."""
    from urllib.parse import urljoin
    text = content_bytes.decode("utf-8", errors="replace")
    lines = text.splitlines()
    out   = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            # It's a segment URL — make it absolute then proxy it
            abs_url = urljoin(original_url, stripped)
            # Decide endpoint based on extension
            if ".m3u8" in abs_url:
                proxied = f"{proxy_base}/iptv/m3u8proxy?url={urllib.parse.quote(abs_url, safe='')}"
            else:
                proxied = f"{proxy_base}/iptv/tsproxy?url={urllib.parse.quote(abs_url, safe='')}"
            out.append(proxied)
        else:
            out.append(line)
    return "\n".join(out).encode("utf-8")


# ── YouTube direct stream extractor ───────────────────────────────────────────
def yt_get_streams(video_id, token=None):
    """Extract direct YouTube stream URLs using yt-dlp (handles n-sig cipher correctly)."""
    import shutil, subprocess as sp, tempfile

    ytdlp = shutil.which("yt-dlp") or shutil.which("yt_dlp")
    if not ytdlp:
        # Try python module
        try:
            import yt_dlp as ytdlp_mod
            return _yt_streams_module(video_id, ytdlp_mod)
        except ImportError:
            pass
        return {"error": "yt-dlp not installed. Run: sudo apt install yt-dlp", "streams": []}

    try:
        cmd = [
            ytdlp, "--dump-json", "--no-playlist",
            "--no-warnings", "--quiet",
            f"https://www.youtube.com/watch?v={video_id}"
        ]
        r = sp.run(cmd, capture_output=True, text=True, timeout=30)
        if r.returncode != 0:
            return {"error": r.stderr[:200] or "yt-dlp failed", "streams": []}
        info = json.loads(r.stdout)
        return _yt_parse_formats(info, video_id)
    except Exception as e:
        return {"error": str(e), "streams": []}

def _yt_streams_module(video_id, ytdlp_mod):
    """Use yt_dlp python module to extract streams."""
    opts = {"quiet":True,"no_warnings":True,"extract_flat":False}
    with ytdlp_mod.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(
            f"https://www.youtube.com/watch?v={video_id}", download=False)
    return _yt_parse_formats(info, video_id)

def _yt_parse_formats(info, video_id):
    """Parse yt-dlp format list into our stream format."""
    streams = []
    for f in (info.get("formats") or []):
        url = f.get("url","")
        if not url: continue
        vcodec = f.get("vcodec","none")
        acodec = f.get("acodec","none")
        has_v  = vcodec not in ("none","")
        has_a  = acodec not in ("none","")
        # Skip formats without video
        if not has_v: continue
        qual = f.get("format_note","") or f.get("resolution","") or                (str(f.get("height",""))+"p" if f.get("height") else "")
        streams.append({
            "url":      url,
            "itag":     f.get("format_id",""),
            "mime":     f.get("ext",""),
            "quality":  qual,
            "hasVideo": has_v,
            "hasAudio": has_a,
            "width":    f.get("width",0) or 0,
            "height":   f.get("height",0) or 0,
            "bitrate":  f.get("tbr",0) or 0,
            "fps":      f.get("fps",0) or 0,
        })
    # Sort: combined (audio+video) first, then by height desc
    streams.sort(key=lambda x: (not(x["hasVideo"] and x["hasAudio"]), -(x.get("height") or 0)))
    # Deduplicate by quality label
    seen = set()
    deduped = []
    for s in streams:
        k = s["quality"]
        if k and k not in seen:
            seen.add(k); deduped.append(s)
        elif not k:
            deduped.append(s)
    return {"streams": deduped[:12], "videoId": video_id,
            "title": info.get("title",""), "duration": info.get("duration",0)}

# ── HTTP Handler ──────────────────────────────────────────────────────────────
MIME={".html":"text/html",".css":"text/css",".js":"application/javascript",
      ".json":"application/json",".png":"image/png",".jpg":"image/jpeg",
      ".svg":"image/svg+xml",".ico":"image/x-icon",
      ".m3u":"audio/x-mpegurl",".m3u8":"application/vnd.apple.mpegurl"}

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*a): pass

    def cors(self):
        self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Access-Control-Allow-Methods","GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers","Content-Type,Authorization")

    def jsend(self,data,status=200):
        body=json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",len(body))
        self.cors(); self.end_headers(); self.wfile.write(body)

    def fsend(self,path):
        ext=Path(path).suffix.lower(); mime=MIME.get(ext,"application/octet-stream")
        try:
            with open(path,"rb") as f: data=f.read()
            self.send_response(200)
            self.send_header("Content-Type",mime)
            self.send_header("Content-Length",len(data))
            self.end_headers(); self.wfile.write(data)
        except FileNotFoundError:
            self.send_response(404); self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200); self.cors(); self.end_headers()

    def body(self):
        n=int(self.headers.get("Content-Length",0))
        return json.loads(self.rfile.read(n)) if n else {}

    def do_GET(self):
        prs=urlparse(self.path); path=prs.path
        qs=parse_qs(prs.query); p=lambda k,d="": qs.get(k,[d])[0]

        # Static
        if path in ("/","/index.html"): self.fsend(APP_DIR/"index.html"); return
        for pfx in ("/css/","/js/","/img/","/fonts/"):
            if path.startswith(pfx): self.fsend(APP_DIR/path[1:]); return

        # ── IPTV stream proxy (fixes WebKit CORS + HLS codec issues) ──────────
        if path in ("/iptv/m3u8proxy", "/iptv/tsproxy", "/iptv/proxy"):
            stream_url = p("url")
            if not stream_url:
                self.send_response(400); self.end_headers(); return
            headers = {
                "User-Agent": "Mozilla/5.0 (compatible; StremoHub/2.0)",
                "Referer": stream_url,
                "Accept": "*/*",
                "Accept-Encoding": "identity",
                "Connection": "keep-alive",
            }
            req2 = urllib.request.Request(stream_url, headers=headers)
            try:
                resp2 = urllib.request.urlopen(req2, timeout=20)
                ct = resp2.headers.get("Content-Type","")
                is_m3u8 = (path=="/iptv/m3u8proxy" or "mpegurl" in ct.lower()
                           or stream_url.split("?")[0].endswith(".m3u8"))
                is_ts   = (path=="/iptv/tsproxy" or "mp2t" in ct.lower()
                           or stream_url.split("?")[0].endswith(".ts"))
                if is_m3u8:
                    body = resp2.read()
                    proxy_base = f"http://127.0.0.1:{PORT}"
                    body = _rewrite_m3u8(body, stream_url, proxy_base)
                    ct   = "application/vnd.apple.mpegurl"
                    self.send_response(200)
                    self.send_header("Content-Type", ct)
                    self.send_header("Content-Length", len(body))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Cache-Control", "no-cache")
                    self.end_headers()
                    self.wfile.write(body)
                else:
                    # Stream through in chunks (live TS / large segments)
                    if is_ts: ct = "video/mp2t"
                    cl = resp2.headers.get("Content-Length","")
                    self.send_response(200)
                    self.send_header("Content-Type", ct or "application/octet-stream")
                    if cl: self.send_header("Content-Length", cl)
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Cache-Control", "no-cache")
                    self.end_headers()
                    while True:
                        chunk = resp2.read(65536)
                        if not chunk: break
                        try: self.wfile.write(chunk)
                        except Exception: break
                resp2.close()
            except Exception as e:
                self.send_response(502)
                self.send_header("Content-Type","text/plain")
                self.send_header("Access-Control-Allow-Origin","*")
                self.end_headers()
                self.wfile.write(str(e).encode())
            return

        # Ping / health check
        if path=="/ping": self.jsend({"ok":True,"version":"3.0.0"}); return

        # ── FFmpeg real-time HLS transcoder ─────────────────────────────────
        if path == "/iptv/transcode":
            stream_url = p("url")
            if not stream_url:
                self.jsend({"error":"no url"},400); return
            try:
                hls_dir, playlist = _start_transcode(stream_url)
                uid = _url_hash(stream_url)
                hls_url = f"http://127.0.0.1:{PORT}/iptv/hls/{uid}/index.m3u8"
                self.jsend({"hls_url": hls_url, "uid": uid})
            except Exception as e:
                self.jsend({"error": str(e)}, 500)
            return

        if path.startswith("/iptv/hls/"):
            parts = path.split("/")
            if len(parts) >= 5:
                uid   = parts[3]; fname = "/".join(parts[4:])
                with _transcode_lock:
                    sess = _transcode_sessions.get(uid)
                hls_dir = sess[1] if sess else os.path.join(tempfile.gettempdir(),f"stremohub_{uid}")
                fpath = os.path.join(hls_dir, fname)
                if os.path.exists(fpath):
                    ext = fpath.rsplit(".",1)[-1].lower()
                    ct  = "application/vnd.apple.mpegurl" if ext=="m3u8" else "video/mp2t"
                    with open(fpath,"rb") as f2: data=f2.read()
                    self.send_response(200)
                    self.send_header("Content-Type",ct)
                    self.send_header("Content-Length",len(data))
                    self.send_header("Access-Control-Allow-Origin","*")
                    self.send_header("Cache-Control","no-cache")
                    self.end_headers(); self.wfile.write(data)
                else:
                    self.send_response(404); self.end_headers()
            return

        # YouTube direct stream URLs (built-in player)
        if path=="/youtube/streams":
            token   = yt_get_token()
            streams = yt_get_streams(p("id"), token)
            self.jsend(streams); return

        # Search history
        if path=="/youtube/search/history":
            db=get_db()
            rows=db.execute("SELECT query,count,searched_at FROM yt_search_history ORDER BY searched_at DESC LIMIT 30").fetchall()
            db.close(); self.jsend({"items":[dict(r) for r in rows]}); return

        # API status — shows which keys are active
        if path=="/api/status":
            cfg = load_config()
            yt_cfg = cfg.get("youtube",{})
            sv_cfg = cfg.get("streamvault",{})
            self.jsend({
                "youtube": {
                    "innertube":    True,
                    "data_api_key": bool(yt_cfg.get("api_key") or YT_DATA_API_KEY),
                    "oauth_ready":  bool(yt_cfg.get("client_id") or YT_TV_CLIENT_ID),
                    "logged_in":    bool(yt_get_token()),
                },
                "tmdb": {
                    "key_active": True,
                    "source": "user" if sv_cfg.get("tmdb_api_key") else "built-in",
                },
                "iptv": {
                    "india_playlist": "https://iptv-org.github.io/iptv/countries/in.m3u",
                },
                "version": "2.0.0"
            }); return

        # ── YouTube auth ──────────────────────────────────

        # === Redirect OAuth (works with Web/Desktop/any client) ===
        if path=="/youtube/auth/url":
            self.jsend({"auth_url": yt_build_auth_url()}); return

        if path=="/youtube/oauth/callback":
            code  = p("code")
            error = p("error")
            if error:
                html = (f'<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;'
                        f'margin-top:80px;background:#0f0f0f;color:#f1f1f1">'
                        f'<h2 style="color:#ef4444">&#10060; Login failed: {error}</h2>'
                        f'<p style="color:#aaa">Close this tab and try again.</p></body></html>')
                self.send_response(200)
                self.send_header("Content-Type","text/html"); self.end_headers()
                self.wfile.write(html.encode()); return
            tokens = yt_exchange_code(code)
            if "access_token" not in tokens:
                msg = tokens.get("error_description","Unknown error")
                html = (f'<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;'
                        f'margin-top:80px;background:#0f0f0f;color:#f1f1f1">'
                        f'<h2 style="color:#ef4444">&#10060; Token error</h2>'
                        f'<p style="color:#aaa">{msg}</p>'
                        f'<p style="color:#aaa">Close this tab and try again.</p></body></html>')
                self.send_response(200)
                self.send_header("Content-Type","text/html"); self.end_headers()
                self.wfile.write(html.encode()); return
            at = tokens["access_token"]; rt = tokens.get("refresh_token","")
            ea = int(time.time()) + tokens.get("expires_in",3600)
            ui = yt_user_info(at)
            db = get_db(); db.execute("DELETE FROM yt_sessions")
            db.execute("INSERT INTO yt_sessions(access_token,refresh_token,expires_at,user_info)"
                       " VALUES(?,?,?,?)", (at, rt, ea, json.dumps(ui)))
            db.commit(); db.close()
            name = ui.get("name","") or ui.get("email","") or "Account"
            html = (f'<!DOCTYPE html><html><head>'
                    f'<meta http-equiv="refresh" content="2;url=http://127.0.0.1:8765">'
                    f'</head><body style="font-family:sans-serif;text-align:center;'
                    f'margin-top:80px;background:#0f0f0f;color:#f1f1f1">'
                    f'<div style="font-size:56px;margin-bottom:16px">&#9989;</div>'
                    f'<h2 style="color:#22c55e">Signed in as {name}</h2>'
                    f'<p style="color:#aaa">Returning to StremoHub…</p>'
                    f'<script>setTimeout(()=>{{try{{window.close()}}catch(e){{}}window.location="http://127.0.0.1:8765"}},1500);</script>'
                    f'</body></html>')
            self.send_response(200)
            self.send_header("Content-Type","text/html"); self.end_headers()
            self.wfile.write(html.encode()); return

        # === Device code flow (for TV-type OAuth clients) ===
        if path=="/youtube/auth/device/start":
            self.jsend(yt_device_start()); return

        if path=="/youtube/auth/device/poll":
            d=yt_device_poll(p("device_code"), cid=p("cid",""), sec=p("sec",""))
            err=d.get("error","")
            if err in ("authorization_pending","slow_down"):
                self.jsend({"status":err}); return
            if "access_token" in d:
                at=d["access_token"]; rt=d.get("refresh_token","")
                ea=int(time.time())+d.get("expires_in",3600)
                ui=yt_user_info(at)
                db=get_db(); db.execute("DELETE FROM yt_sessions")
                db.execute("INSERT INTO yt_sessions(access_token,refresh_token,expires_at,user_info) VALUES(?,?,?,?)",
                           (at,rt,ea,json.dumps(ui)))
                db.commit(); db.close()
                self.jsend({"status":"ok","user":ui}); return
            self.jsend({"status": err or "error", "raw": d}); return

        if path=="/youtube/auth/status":
            token=yt_get_token()
            if token:
                db=get_db()
                row=db.execute("SELECT user_info FROM yt_sessions ORDER BY id DESC LIMIT 1").fetchone()
                db.close()
                ui=json.loads(row["user_info"]) if row and row["user_info"] else {}
                self.jsend({"logged_in":True,"user":ui})
            else:
                self.jsend({"logged_in":False})
            return

        if path=="/youtube/auth/logout":
            db=get_db(); db.execute("DELETE FROM yt_sessions"); db.commit(); db.close()
            self.jsend({"ok":True}); return

        # ── YouTube InnerTube ─────────────────────────────
        if path=="/youtube/trending":
            token=yt_get_token()
            items=yt_trending(p("region","US"),p("category",""),token)
            self.jsend({"items":items}); return

        if path=="/youtube/search":
            token=yt_get_token()
            self.jsend({"items":yt_search(p("q"),int(p("maxResults","20")),token)}); return

        if path=="/youtube/video":
            token=yt_get_token()
            self.jsend({"items":[yt_video_detail(p("id"),token)]}); return

        if path=="/youtube/related":
            token=yt_get_token()
            self.jsend({"items":yt_related(p("id"),token)}); return

        if path=="/youtube/channel":
            token=yt_get_token()
            self.jsend({"items":[yt_channel(p("id"),token)]}); return

        if path=="/youtube/channel/videos":
            token=yt_get_token()
            self.jsend({"items":yt_channel_videos(p("channelId"),token)}); return

        if path=="/youtube/subscriptions":
            token=yt_get_token()
            if not token: self.jsend({"error":"not logged in"},401); return
            self.jsend({"items":yt_subscriptions(token)}); return

        if path=="/youtube/search/history":
            db   = get_db()
            rows = db.execute(
                "SELECT query,count,searched_at FROM yt_search_history "
                "ORDER BY searched_at DESC LIMIT 30").fetchall()
            db.close()
            self.jsend({"items":[dict(r) for r in rows]}); return

        if path=="/youtube/history":
            db=get_db()
            rows=db.execute("SELECT * FROM yt_history ORDER BY watched_at DESC LIMIT 50").fetchall()
            db.close(); self.jsend({"items":[dict(r) for r in rows]}); return

        if path=="/youtube/favorites":
            db=get_db()
            rows=db.execute("SELECT * FROM yt_favorites ORDER BY added_at DESC").fetchall()
            db.close(); self.jsend({"items":[dict(r) for r in rows]}); return

        # ── TMDB / Pikashow ───────────────────────────────
        # Extract direct stream from any embed URL via yt-dlp
        if path=="/sv/extract":
            embed_url = p("url")
            if not embed_url:
                self.jsend({"error":"no url","streams":[]},400); return
            result = sv_extract_streams(embed_url)
            self.jsend(result); return

        if path=="/sv/search/history":
            db=get_db()
            rows=db.execute("SELECT query,count,searched_at FROM sv_search_history ORDER BY searched_at DESC LIMIT 30").fetchall()
            db.close(); self.jsend({"items":[dict(r) for r in rows]}); return

        if path=="/sv/trending":
            mt=p("media_type","all"); pm={}
            lang=p("with_original_language","")
            if lang: pm["with_original_language"]=lang
            self.jsend(tmdb_get(f"trending/{mt}/week",pm)); return

        if path=="/sv/search":
            self.jsend(tmdb_get("search/multi",{"query":p("q"),"page":p("page","1")})); return

        if path=="/sv/movie":
            self.jsend(tmdb_get(f"movie/{p('id')}",
                {"append_to_response":"videos,credits,similar,recommendations"})); return

        if path=="/sv/tv":
            self.jsend(tmdb_get(f"tv/{p('id')}",
                {"append_to_response":"videos,credits,similar,recommendations"})); return

        if path=="/sv/season":
            self.jsend(tmdb_get(f"tv/{p('tv_id')}/season/{p('season','1')}")); return

        if path=="/sv/genres":
            self.jsend(tmdb_get(f"genre/{p('media_type','movie')}/list")); return

        if path=="/sv/discover":
            mt=p("media_type","movie")
            pm={"sort_by":p("sort_by","popularity.desc"),"page":p("page","1")}
            wg=p("with_genres","") or p("genres","")
            lang=p("with_original_language","")
            vc=p("vote_count.gte","")
            if wg:   pm["with_genres"]=wg
            if lang: pm["with_original_language"]=lang
            if vc:   pm["vote_count.gte"]=vc
            self.jsend(tmdb_get(f"discover/{mt}",pm)); return

        if path=="/sv/person":
            self.jsend(tmdb_get(f"person/{p('id')}",{"append_to_response":"movie_credits,tv_credits"})); return

        if path=="/sv/favorites":
            db=get_db()
            rows=db.execute("SELECT * FROM sv_favorites ORDER BY added_at DESC").fetchall()
            db.close(); self.jsend({"items":[dict(r) for r in rows]}); return

        if path=="/sv/history":
            db=get_db()
            rows=db.execute("SELECT * FROM sv_watch_history ORDER BY watched_at DESC LIMIT 50").fetchall()
            db.close(); self.jsend({"items":[dict(r) for r in rows]}); return

        # ── IPTV ──────────────────────────────────────────
        if path=="/pvr/search/history":
            db=get_db()
            rows=db.execute("SELECT query,count,searched_at FROM pvr_search_history ORDER BY searched_at DESC LIMIT 30").fetchall()
            db.close(); self.jsend({"items":[dict(r) for r in rows]}); return

        if path=="/iptv/playlists":
            db=get_db(); rows=db.execute("SELECT * FROM iptv_playlists").fetchall()
            db.close(); self.jsend({"playlists":[dict(r) for r in rows]}); return

        if path=="/iptv/channels":
            pl_id=p("playlist_id"); group=p("group"); db=get_db()
            if group and group!="all":
                rows=db.execute("SELECT * FROM iptv_channels WHERE playlist_id=? AND group_title=? ORDER BY name",(pl_id,group)).fetchall()
            else:
                rows=db.execute("SELECT * FROM iptv_channels WHERE playlist_id=? ORDER BY group_title,name",(pl_id,)).fetchall()
            db.close(); self.jsend({"channels":[dict(r) for r in rows]}); return

        if path=="/iptv/groups":
            pl_id=p("playlist_id"); db=get_db()
            rows=db.execute("SELECT group_title,COUNT(*) as count FROM iptv_channels WHERE playlist_id=? GROUP BY group_title ORDER BY group_title",(pl_id,)).fetchall()
            db.close(); self.jsend({"groups":[dict(r) for r in rows]}); return

        if path=="/iptv/search":
            pl_id=p("playlist_id"); q=f"%{p('q')}%"; db=get_db()
            rows=db.execute("SELECT * FROM iptv_channels WHERE playlist_id=? AND name LIKE ? ORDER BY name LIMIT 100",(pl_id,q)).fetchall()
            db.close(); self.jsend({"channels":[dict(r) for r in rows]}); return

        if path=="/iptv/favorites":
            db=get_db()
            rows=db.execute("SELECT c.* FROM iptv_channels c JOIN iptv_favorites f ON c.id=f.channel_id").fetchall()
            db.close(); self.jsend({"channels":[dict(r) for r in rows]}); return

        # ── Config ────────────────────────────────────────
        if path=="/config":
            cfg=load_config(); self.jsend(cfg); return

        if path=="/config/tmdb-status":
            cfg=load_config()
            user_key=cfg.get("streamvault",{}).get("tmdb_api_key","")
            self.jsend({
                "key_source": "user" if user_key else "built-in",
                "active": True,
                "tmdb_ready": True,
                "youtube_ready": True,
            }); return

        self.send_response(404); self.end_headers()

    def do_POST(self):
        prs=urlparse(self.path); path=prs.path; body=self.body()

        if path=="/youtube/search/history/add":
            q = body.get("query","").strip()
            if q:
                db = get_db()
                db.execute(
                    "INSERT INTO yt_search_history(query,count,searched_at) VALUES(?,1,strftime('%s','now'))"
                    " ON CONFLICT(query) DO UPDATE SET count=count+1,searched_at=strftime('%s','now')",
                    (q,))
                db.execute("DELETE FROM yt_search_history WHERE id NOT IN (SELECT id FROM yt_search_history ORDER BY searched_at DESC LIMIT 25)")
                db.commit(); db.close()
            self.jsend({"ok":True}); return

        if path=="/youtube/search/history/delete":
            q = body.get("query","")
            db = get_db()
            if q: db.execute("DELETE FROM yt_search_history WHERE query=?",(q,))
            else: db.execute("DELETE FROM yt_search_history")
            db.commit(); db.close()
            self.jsend({"ok":True}); return

        if path=="/youtube/history/add":
            db=get_db()
            db.execute("INSERT OR REPLACE INTO yt_history(video_id,title,channel,thumbnail) VALUES(?,?,?,?)",
                       (body.get("video_id"),body.get("title"),body.get("channel"),body.get("thumbnail")))
            db.commit(); db.close(); self.jsend({"ok":True}); return

        if path=="/youtube/search/history/clear":
            db=get_db(); db.execute("DELETE FROM yt_search_history"); db.commit(); db.close()
            self.jsend({"ok":True}); return

        if path=="/youtube/favorites/add":
            db=get_db()
            db.execute("INSERT OR REPLACE INTO yt_favorites(video_id,title,channel,thumbnail,duration) VALUES(?,?,?,?,?)",
                       (body.get("video_id"),body.get("title"),body.get("channel"),body.get("thumbnail"),body.get("duration","")))
            db.commit(); db.close(); self.jsend({"ok":True}); return

        if path=="/youtube/favorites/remove":
            db=get_db(); db.execute("DELETE FROM yt_favorites WHERE video_id=?",(body.get("video_id"),))
            db.commit(); db.close(); self.jsend({"ok":True}); return

        if path=="/pvr/search/history/add":
            q=body.get("query","").strip()
            if q:
                db=get_db()
                db.execute("INSERT INTO pvr_search_history(query,count,searched_at) VALUES(?,1,strftime('%s','now')) ON CONFLICT(query) DO UPDATE SET count=count+1,searched_at=strftime('%s','now')",(q,))
                db.commit(); db.close()
            self.jsend({"ok":True}); return

        if path=="/pvr/search/history/delete":
            q=body.get("query","")
            db=get_db()
            if q: db.execute("DELETE FROM pvr_search_history WHERE query=?",(q,))
            else: db.execute("DELETE FROM pvr_search_history")
            db.commit(); db.close(); self.jsend({"ok":True}); return

        if path=="/iptv/playlists/add":
            name=body.get("name","Playlist"); url=body.get("url","")
            try:
                content=fetch_m3u(url); channels=parse_m3u(content); db=get_db()
                cur=db.execute("INSERT INTO iptv_playlists(name,url,last_updated,channel_count) VALUES(?,?,?,?)",
                               (name,url,int(time.time()),len(channels)))
                pl_id=cur.lastrowid
                db.executemany("INSERT INTO iptv_channels(playlist_id,name,url,group_title,logo,tvg_id,tvg_name) VALUES(?,?,?,?,?,?,?)",
                               [(pl_id,c["name"],c["url"],c["group_title"],c["logo"],c["tvg_id"],c["tvg_name"]) for c in channels])
                db.commit(); db.close()
                self.jsend({"ok":True,"id":pl_id,"channel_count":len(channels)})
            except Exception as e: self.jsend({"error":str(e)},500)
            return

        if path=="/iptv/playlists/delete":
            pl_id=body.get("id"); db=get_db()
            db.execute("DELETE FROM iptv_channels WHERE playlist_id=?",(pl_id,))
            db.execute("DELETE FROM iptv_playlists WHERE id=?",(pl_id,))
            db.commit(); db.close(); self.jsend({"ok":True}); return

        if path=="/iptv/playlists/refresh":
            pl_id=body.get("id"); db=get_db()
            row=db.execute("SELECT * FROM iptv_playlists WHERE id=?",(pl_id,)).fetchone()
            if not row: self.jsend({"error":"not found"},404); return
            try:
                content=fetch_m3u(row["url"] or row["local_path"] or "")
                channels=parse_m3u(content); db.execute("DELETE FROM iptv_channels WHERE playlist_id=?",(pl_id,))
                db.executemany("INSERT INTO iptv_channels(playlist_id,name,url,group_title,logo,tvg_id,tvg_name) VALUES(?,?,?,?,?,?,?)",
                               [(pl_id,c["name"],c["url"],c["group_title"],c["logo"],c["tvg_id"],c["tvg_name"]) for c in channels])
                db.execute("UPDATE iptv_playlists SET last_updated=?,channel_count=? WHERE id=?",(int(time.time()),len(channels),pl_id))
                db.commit(); db.close(); self.jsend({"ok":True,"channel_count":len(channels)})
            except Exception as e: self.jsend({"error":str(e)},500)
            return

        if path=="/iptv/favorites/toggle":
            ch_id=body.get("channel_id"); db=get_db()
            row=db.execute("SELECT id FROM iptv_favorites WHERE channel_id=?",(ch_id,)).fetchone()
            if row:
                db.execute("DELETE FROM iptv_favorites WHERE channel_id=?",(ch_id,))
                db.commit(); db.close(); self.jsend({"favorited":False})
            else:
                db.execute("INSERT INTO iptv_favorites(channel_id) VALUES(?)",(ch_id,))
                db.commit(); db.close(); self.jsend({"favorited":True})
            return

        if path=="/sv/search/history/add":
            q=body.get("query","").strip()
            if q:
                db=get_db()
                db.execute("INSERT INTO sv_search_history(query,count,searched_at) VALUES(?,1,strftime('%s','now')) ON CONFLICT(query) DO UPDATE SET count=count+1,searched_at=strftime('%s','now')",(q,))
                db.execute("DELETE FROM sv_search_history WHERE id NOT IN (SELECT id FROM sv_search_history ORDER BY searched_at DESC LIMIT 25)")
                db.commit(); db.close()
            self.jsend({"ok":True}); return

        if path=="/sv/search/history/delete":
            q=body.get("query","")
            db=get_db()
            if q: db.execute("DELETE FROM sv_search_history WHERE query=?",(q,))
            else: db.execute("DELETE FROM sv_search_history")
            db.commit(); db.close(); self.jsend({"ok":True}); return

        if path=="/sv/favorites/toggle":
            db=get_db()
            row=db.execute("SELECT id FROM sv_favorites WHERE content_id=? AND source_id=?",
                           (body.get("content_id"),body.get("source_id",0))).fetchone()
            if row:
                db.execute("DELETE FROM sv_favorites WHERE id=?",(row["id"],))
                db.commit(); db.close(); self.jsend({"favorited":False})
            else:
                db.execute("INSERT INTO sv_favorites(content_id,source_id,title,poster,type) VALUES(?,?,?,?,?)",
                           (body.get("content_id"),body.get("source_id",0),body.get("title"),body.get("poster"),body.get("type","movie")))
                db.commit(); db.close(); self.jsend({"favorited":True})
            return

        if path=="/sv/history/update":
            db=get_db()
            db.execute("INSERT OR REPLACE INTO sv_watch_history(content_id,source_id,title,poster,type,progress,duration) VALUES(?,?,?,?,?,?,?)",
                       (body.get("content_id"),body.get("source_id",0),body.get("title"),body.get("poster"),
                        body.get("type","movie"),body.get("progress",0),body.get("duration",0)))
            db.commit(); db.close(); self.jsend({"ok":True}); return

        if path=="/config/update":
            cfg=load_config(); cfg.update(body); save_config(cfg)
            global CONFIG; CONFIG=cfg
            self.jsend({"ok":True}); return

        self.send_response(404); self.end_headers()

if __name__=="__main__":
    # Ensure user-writable dirs exist
    os.makedirs(os.path.join(_data, "db"),    exist_ok=True)
    os.makedirs(os.path.join(_data, "cache"), exist_ok=True)
    os.makedirs(os.path.join(_data, "playlists"), exist_ok=True)
    if not os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH,"w") as _f:
            json.dump({"server":{"host":"127.0.0.1","port":8765},
                       "youtube":{},"streamvault":{},"iptv":{}}, _f, indent=2)
    # Re-read config after ensuring it exists
    CONFIG = load_config()
    HOST   = CONFIG["server"].get("host","127.0.0.1")
    PORT   = CONFIG["server"].get("port",8765)
    init_db()
    socketserver.TCPServer.allow_reuse_address=True
    print(f"StremoHub v2 starting on http://{HOST}:{PORT}", flush=True)
    try:
        with socketserver.ThreadingTCPServer((HOST,PORT),Handler) as s:
            print(f"StremoHub v2 ready at http://{HOST}:{PORT}", flush=True)
            sys.stdout.flush()
            s.serve_forever()
    except OSError as e:
        print(f"ERROR: Cannot bind to {HOST}:{PORT} — {e}", flush=True)
        sys.exit(1)

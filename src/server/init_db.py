#!/usr/bin/env python3
import sqlite3, os, json

_data   = os.environ.get("STREMOHUB_DATA",
          os.path.join(os.path.expanduser("~"), ".local", "share", "stremohub"))
DB_PATH = os.path.join(_data, "db", "stremohub.db")

os.makedirs(os.path.join(_data, "db"),        exist_ok=True)
os.makedirs(os.path.join(_data, "cache"),     exist_ok=True)
os.makedirs(os.path.join(_data, "playlists"), exist_ok=True)

# Write default config if missing
cfg_path = os.path.join(_data, "config.json")
if not os.path.exists(cfg_path):
    with open(cfg_path, "w") as f:
        json.dump({"server":{"host":"127.0.0.1","port":8765},
                   "youtube": {"api_key": ""},
                   "streamvault":{"tmdb_api_key": ""},
                   "iptv":{}}, f, indent=2)

conn = sqlite3.connect(DB_PATH)
conn.executescript("""
    CREATE TABLE IF NOT EXISTS yt_sessions(id INTEGER PRIMARY KEY,access_token TEXT,refresh_token TEXT,expires_at INTEGER,user_info TEXT,created_at INTEGER DEFAULT(strftime('%s','now')));
    CREATE TABLE IF NOT EXISTS yt_history(id INTEGER PRIMARY KEY,video_id TEXT UNIQUE,title TEXT,channel TEXT,thumbnail TEXT,watched_at INTEGER DEFAULT(strftime('%s','now')));
    CREATE TABLE IF NOT EXISTS yt_favorites(id INTEGER PRIMARY KEY,video_id TEXT UNIQUE,title TEXT,channel TEXT,thumbnail TEXT,duration TEXT,added_at INTEGER DEFAULT(strftime('%s','now')));
    CREATE TABLE IF NOT EXISTS iptv_playlists(id INTEGER PRIMARY KEY,name TEXT,url TEXT,local_path TEXT,last_updated INTEGER,channel_count INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS iptv_channels(id INTEGER PRIMARY KEY,playlist_id INTEGER,name TEXT,url TEXT,group_title TEXT,logo TEXT,tvg_id TEXT,tvg_name TEXT);
    CREATE TABLE IF NOT EXISTS iptv_favorites(id INTEGER PRIMARY KEY,channel_id INTEGER UNIQUE,added_at INTEGER DEFAULT(strftime('%s','now')));
    CREATE TABLE IF NOT EXISTS sv_favorites(id INTEGER PRIMARY KEY,content_id TEXT,source_id INTEGER DEFAULT 0,title TEXT,poster TEXT,type TEXT,added_at INTEGER DEFAULT(strftime('%s','now')));
    CREATE TABLE IF NOT EXISTS sv_watch_history(id INTEGER PRIMARY KEY,content_id TEXT,source_id INTEGER DEFAULT 0,title TEXT,poster TEXT,type TEXT,progress INTEGER DEFAULT 0,duration INTEGER DEFAULT 0,watched_at INTEGER DEFAULT(strftime('%s','now')));
    CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT);
""")
# Pre-register India IPTV
INDIA = "https://iptv-org.github.io/iptv/countries/in.m3u"
if not conn.execute("SELECT id FROM iptv_playlists WHERE url=?", (INDIA,)).fetchone():
    import time
    conn.execute("INSERT INTO iptv_playlists(name,url,last_updated,channel_count) VALUES(?,?,?,?)",
                 ("\U0001f1ee\U0001f1f3 India IPTV", INDIA, int(time.time()), 0))
conn.commit(); conn.close()
print("StremoHub DB ready at:", DB_PATH)

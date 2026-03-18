#!/usr/bin/env python3
"""StremoHub v2 — Standalone GTK native window with robust startup"""
import sys, os, subprocess, time, signal, threading

SERVER_PY = "/usr/lib/stremohub/server/stremohub_server.py"
URL       = "http://127.0.0.1:8765"
LOG_FILE  = "/var/log/stremohub/server.log"

def ensure_dirs():
    """Create user-writable data directories — no root needed."""
    import json
    data = os.environ.get("STREMOHUB_DATA",
           os.path.join(os.path.expanduser("~"), ".local", "share", "stremohub"))
    os.makedirs(os.path.join(data, "db"),        exist_ok=True)
    os.makedirs(os.path.join(data, "cache"),     exist_ok=True)
    os.makedirs(os.path.join(data, "playlists"), exist_ok=True)
    # User log dir
    log_dir = os.path.join(data, "logs")
    os.makedirs(log_dir, exist_ok=True)
    global LOG_FILE
    LOG_FILE = os.path.join(log_dir, "server.log")
    # Write default config if missing
    cfg_path = os.path.join(data, "config.json")
    if not os.path.exists(cfg_path):
        with open(cfg_path, "w") as f:
            json.dump({"server":{"host":"127.0.0.1","port":8765},
                       "youtube": {"api_key": ""},
                       "streamvault":{"tmdb_api_key": ""},
                       "iptv":{}}, f, indent=2)

def kill_old_server():
    """Kill any leftover server on port 8765."""
    try:
        import subprocess as sp
        result = sp.run(["fuser", "-k", "8765/tcp"], capture_output=True, timeout=3)
    except Exception:
        pass
    try:
        result = sp.run(["pkill", "-f", "stremohub_server.py"], capture_output=True, timeout=3)
    except Exception:
        pass
    time.sleep(0.5)

def start_server():
    """Start the backend server, return process."""
    ensure_dirs()
    # Try system log first, fall back to user home, then /tmp
    log_file = None
    # Prefer user home — LOG_FILE is now set by ensure_dirs() to user path
    for path in [LOG_FILE,
                 os.path.expanduser("~/.local/share/stremohub/logs/server.log"),
                 "/tmp/stremohub_server.log"]:
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            log = open(path, "a")
            log.write(f"\n{'='*40}\nStarting StremoHub v2 at {time.ctime()}\n")
            log.flush()
            log_file = path
            break
        except PermissionError:
            continue

    if log is None:
        log = open(os.devnull, "w")

    proc = subprocess.Popen(
        [sys.executable, SERVER_PY],
        stdout=log, stderr=log,
        preexec_fn=os.setsid
    )
    return proc, log

def wait_server(timeout=15):
    """Poll until server responds or timeout."""
    import urllib.request
    for i in range(timeout * 4):
        try:
            urllib.request.urlopen(URL + "/ping", timeout=1)
            return True
        except Exception:
            time.sleep(0.25)
    return False

def show_error_dialog(msg):
    """Show a simple GTK error dialog."""
    try:
        import gi
        gi.require_version("Gtk","3.0")
        from gi.repository import Gtk
        d = Gtk.MessageDialog(
            message_type=Gtk.MessageType.ERROR,
            buttons=Gtk.ButtonsType.CLOSE,
            text="StremoHub failed to start",
            secondary_text=msg
        )
        d.run(); d.destroy()
    except Exception:
        print(f"ERROR: {msg}", file=sys.stderr)

def run_gtk(srv_proc):
    """Launch the WebKit2 GTK window."""
    import gi
    for ver in ("4.1","4.0"):
        try: gi.require_version("WebKit2", ver); break
        except ValueError: continue
    gi.require_version("Gtk","3.0")
    from gi.repository import Gtk, WebKit2, Gdk

    win = Gtk.Window(title="StremoHub v2")
    win.set_default_size(1400, 880)
    try: win.set_icon_name("stremohub")
    except Exception: pass

    # Header bar
    hbar = Gtk.HeaderBar()
    hbar.set_show_close_button(True)
    hbar.set_title("StremoHub v2")
    win.set_titlebar(hbar)

    nav = Gtk.Box(spacing=2)
    bb = Gtk.Button.new_from_icon_name("go-previous-symbolic",  Gtk.IconSize.BUTTON)
    bf = Gtk.Button.new_from_icon_name("go-next-symbolic",      Gtk.IconSize.BUTTON)
    br = Gtk.Button.new_from_icon_name("view-refresh-symbolic", Gtk.IconSize.BUTTON)
    bh = Gtk.Button.new_from_icon_name("go-home-symbolic",      Gtk.IconSize.BUTTON)
    for b in (bb,bf,br,bh): nav.pack_start(b,False,False,0)
    hbar.pack_start(nav)

    # WebKit settings
    s = WebKit2.Settings()
    s.set_enable_javascript(True)
    s.set_enable_media(True)
    s.set_enable_media_stream(True)
    s.set_enable_html5_local_storage(True)
    s.set_enable_html5_database(True)
    s.set_media_playback_requires_user_gesture(False)
    s.set_javascript_can_open_windows_automatically(True)
    s.set_allow_file_access_from_file_urls(True)
    s.set_allow_universal_access_from_file_urls(True)
    try: s.set_enable_encrypted_media(True)
    except Exception: pass
    try: s.set_hardware_acceleration_policy(WebKit2.HardwareAccelerationPolicy.ALWAYS)
    except Exception: pass

    # User agent — pretend to be Chrome so embeds work
    try: s.set_user_agent_with_application_details("StremoHub","2.0")
    except Exception: pass

    wv = WebKit2.WebView()
    wv.set_settings(s)
    wv.load_uri(URL)

    # Title sync
    wv.connect("notify::title", lambda w,_:
        win.set_title((w.get_title() or "StremoHub") + " — StremoHub v2"))

    # Nav buttons
    bb.connect("clicked", lambda _: wv.go_back())
    bf.connect("clicked", lambda _: wv.go_forward())
    br.connect("clicked", lambda _: wv.reload())
    bh.connect("clicked", lambda _: wv.load_uri(URL))
    wv.connect("notify::uri", lambda w,_: (
        bb.set_sensitive(w.can_go_back()),
        bf.set_sensitive(w.can_go_forward())))

    # Open new windows in same view
    def on_policy(wv, dec, dt):
        if dt == WebKit2.PolicyDecisionType.NEW_WINDOW_ACTION:
            wv.load_uri(dec.get_request().get_uri())
            dec.ignore(); return True
    wv.connect("decide-policy", on_policy)
    wv.connect("permission-request", lambda w,r: r.allow() or True)

    # Layout
    sc = Gtk.ScrolledWindow()
    sc.set_hexpand(True); sc.set_vexpand(True); sc.add(wv)
    win.add(sc)
    win.connect("destroy", Gtk.main_quit)
    win.show_all()

    # Dark CSS
    css = (b"window,headerbar{background:#0a0a0a;color:#f1f1f1}"
           b"headerbar{border-bottom:1px solid #1e1e1e;min-height:44px}"
           b"button{background:transparent;border:none;color:#777;"
           b"padding:4px 8px;border-radius:4px;min-width:0}"
           b"button:hover{background:rgba(255,255,255,.06);color:#fff}")
    p = Gtk.CssProvider()
    p.load_from_data(css)
    Gtk.StyleContext.add_provider_for_screen(
        Gdk.Screen.get_default(), p,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

    Gtk.main()

def main():
    kill_old_server()

    # Start server with log output
    srv_proc, srv_log = start_server()

    def cleanup(*_):
        try:
            os.killpg(os.getpgid(srv_proc.pid), signal.SIGTERM)
        except Exception:
            pass
        try:
            srv_log.close()
        except Exception:
            pass
        sys.exit(0)

    signal.signal(signal.SIGINT,  cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    # Wait for server to become ready
    print("Starting StremoHub v2 server...", flush=True)
    ready = wait_server(timeout=15)

    if not ready:
        # Read log for error details
        log_tail = ""
        for lf in [LOG_FILE,
                   os.path.expanduser("~/.local/share/stremohub/server.log"),
                   "/tmp/stremohub_server.log"]:
            try:
                with open(lf) as f:
                    log_tail = f.read()[-800:]
                    LOG_FILE_USED = lf
                    break
            except Exception:
                continue
        if not log_tail:
            log_tail = "No log found. Try: python3 /usr/lib/stremohub/server/stremohub_server.py"

        show_error_dialog(
            f"Server did not start on {URL}\n\n"
            f"Last output:\n{log_tail}"
        )
        cleanup()
        return

    print(f"Server ready at {URL}", flush=True)

    try:
        run_gtk(srv_proc)
    except ImportError as e:
        # WebKit2GTK not installed — open in default browser
        print(f"GTK/WebKit2 not available ({e}), opening browser...", flush=True)
        import webbrowser
        webbrowser.open(URL)
        srv_proc.wait()
    finally:
        cleanup()

if __name__ == "__main__":
    main()

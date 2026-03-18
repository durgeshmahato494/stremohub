#!/usr/bin/env python3
"""
StremoHub — Cross-platform launcher (Windows / macOS / Linux)
Uses pywebview which wraps WebView2 (Windows), WebKit (macOS/Linux)
Install: pip install pywebview
"""
import sys, os, threading, time, subprocess, socket, signal

# Add server to path
ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'server'))

PORT = 8765
SERVER_URL = f'http://127.0.0.1:{PORT}'

def is_port_free(port):
    with socket.socket() as s:
        try: s.bind(('127.0.0.1', port)); return True
        except OSError: return False

def start_server():
    from stremohub_server import run_server
    run_server()

def wait_for_server(timeout=15):
    import urllib.request
    for _ in range(timeout * 10):
        try:
            urllib.request.urlopen(SERVER_URL, timeout=0.5)
            return True
        except: time.sleep(0.1)
    return False

def main():
    # Start backend server in background thread
    if is_port_free(PORT):
        t = threading.Thread(target=start_server, daemon=True)
        t.start()
        wait_for_server()

    try:
        import webview
    except ImportError:
        print("pywebview not installed. Run: pip install pywebview")
        # Fallback: open in system browser
        import webbrowser
        webbrowser.open(SERVER_URL)
        input("Press Enter to exit...")
        return

    window = webview.create_window(
        'StremoHub',
        SERVER_URL,
        width=1280, height=720,
        min_size=(800, 500),
        resizable=True,
        text_select=False,
        background_color='#0f0f0f',
    )

    webview.start(
        gui='edgechromium' if sys.platform == 'win32' else 'gtk',
        http_server=False,
        debug=False,
    )

if __name__ == '__main__':
    main()

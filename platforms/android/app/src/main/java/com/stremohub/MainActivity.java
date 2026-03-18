package com.stremohub;
import android.app.Activity; import android.os.Bundle;
import android.view.*; import android.webkit.*;
import android.widget.FrameLayout;

/**
 * StremoHub Android TV — WebView wrapper
 * Connects to a StremoHub server (local or network)
 * D-pad remote buttons mapped to keyboard events
 */
public class MainActivity extends Activity {
    private WebView webView;

    // NETWORK MODE: set to your Linux server IP
    // e.g. "http://192.168.1.100:8765"
    // EMBEDDED MODE (Chaquopy): keep as 127.0.0.1
    private static final String SERVER_URL = "http://192.168.1.100:8765";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Fullscreen for TV
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.grant(request.getResources());
            }
        });

        FrameLayout layout = new FrameLayout(this);
        layout.addView(webView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(layout);

        new Thread(() -> {
            try { Thread.sleep(300); } catch (Exception ignored) {}
            runOnUiThread(() -> webView.loadUrl(SERVER_URL));
        }).start();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_UP:
                injectKey(KeyEvent.KEYCODE_DPAD_UP); return true;
            case KeyEvent.KEYCODE_DPAD_DOWN:
                injectKey(KeyEvent.KEYCODE_DPAD_DOWN); return true;
            case KeyEvent.KEYCODE_DPAD_LEFT:
                injectKey(KeyEvent.KEYCODE_DPAD_LEFT); return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT:
                injectKey(KeyEvent.KEYCODE_DPAD_RIGHT); return true;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
                injectKey(KeyEvent.KEYCODE_ENTER); return true;
            case KeyEvent.KEYCODE_BACK:
                injectKey(KeyEvent.KEYCODE_ESCAPE); return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
                injectKey(KeyEvent.KEYCODE_SPACE); return true;
            case KeyEvent.KEYCODE_CHANNEL_UP:
                injectKey(KeyEvent.KEYCODE_PAGE_UP); return true;
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
                injectKey(KeyEvent.KEYCODE_PAGE_DOWN); return true;
            case KeyEvent.KEYCODE_VOLUME_UP:
                injectKey(KeyEvent.KEYCODE_VOLUME_UP); return true;
            case KeyEvent.KEYCODE_VOLUME_DOWN:
                injectKey(KeyEvent.KEYCODE_VOLUME_DOWN); return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private void injectKey(int code) {
        webView.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, code));
        webView.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP,   code));
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}

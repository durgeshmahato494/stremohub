# StremoHub Android TV

## Build APK

**Requirements:** Android Studio, JDK 17, Android SDK 34

```bash
cd platforms/android
./gradlew assembleRelease
# APK: app/build/outputs/apk/release/app-release.apk
```

## Two modes

### Mode 1: Network mode (recommended)
Run StremoHub on your Linux PC/server, then set `SERVER_URL` in MainActivity.java
to your server's IP address. The Android TV app connects over your local network.

```java
private static final String SERVER_URL = "http://192.168.1.100:8765";
```

### Mode 2: Embedded Python server (self-contained APK)
Uses [Chaquopy](https://chaquo.com/chaquopy/) to run Python inside the APK.
Uncomment Chaquopy lines in build.gradle — adds ~30MB to APK size.

## Install on Android TV

```bash
adb connect YOUR_TV_IP
adb install app-release.apk
```

## Key mapping (TV remote → web events)
| TV Remote | Web Key |
|-----------|---------|
| D-pad ↑↓←→ | ArrowUp/Down/Left/Right |
| OK/Select | Enter |
| Back | Escape |
| Play/Pause | Space |
| Ch+/Ch- | PageUp/PageDown |

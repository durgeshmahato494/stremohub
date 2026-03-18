Name:           stremohub
Version:        3.0
Release:        1%{?dist}
Summary:        Open-source media center — YouTube, streaming, IPTV

License:        MIT
URL:            https://github.com/YOUR_USERNAME/stremohub
Source0:        %{name}-%{version}.tar.gz

BuildArch:      noarch
Requires:       python3 python3-gobject webkit2gtk4.0 ffmpeg yt-dlp

%description
StremoHub is a media center for Linux combining YouTube (SmartTube-style),
streaming movies/series, and IPTV live TV. Designed for IR remote control
on Raspberry Pi and ARM TV boxes.

%prep
%autosetup

%install
install -dm755 %{buildroot}/usr/lib/stremohub
cp -r src/app    %{buildroot}/usr/lib/stremohub/
cp -r src/server %{buildroot}/usr/lib/stremohub/
install -Dm755 src/stremohub-gtk.py %{buildroot}/usr/lib/stremohub/stremohub-gtk.py

install -dm755 %{buildroot}/usr/bin
cat > %{buildroot}/usr/bin/stremohub << 'LAUNCHER'
#!/bin/bash
exec python3 /usr/lib/stremohub/stremohub-gtk.py "$@"
LAUNCHER
chmod +x %{buildroot}/usr/bin/stremohub

%files
/usr/lib/stremohub/
/usr/bin/stremohub

%changelog
* %(date "+%a %b %d %Y") StremoHub Team <support@stremohub.local> - 3.0-1
- Initial release

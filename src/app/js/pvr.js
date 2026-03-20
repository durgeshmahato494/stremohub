/* pvr.js — Kodi PVR IPTV Simple Client
   Built-in player using ffmpeg server-side transcoding for ALL formats:
   MPEG-2, H264, HEVC, AC3, MP3, AAC — all supported via ffmpeg→HLS pipeline
*/
'use strict';

const PROXY = 'http://127.0.0.1:8765';

let _pvrPlId   = null;
let _pvrGroup  = 'all';
let _pvrChId   = null;
let _pvrPlayer = null;
let _pvrUrl    = '';
let _pvrName   = '';

/* ─── INIT ─────────────────────────────────────────────────── */
async function pvrInit() {
  _pvrPlayer = shPlayerInit('shp-container');

  // Wire prev/next channel for arrow key nav
  _pvrPlayer.onPrevChannel = pvrPrevChannel;
  _pvrPlayer.onNextChannel = pvrNextChannel;

  await pvrLoadPlaylists();
  await _pvrAutoIndia();
  _pvrBindColumnKeys();
  setTimeout(_pvrWireSearch, 200);

  // Hourly auto-refresh
  setInterval(() => {
    if (_pvrPlId) pvrRefresh(_pvrPlId);
  }, 3600000); // 3,600,000 ms = 1 hour
}

/* ─── KEYBOARD COLUMN NAVIGATION ──────────────────────────── */
function _pvrBindColumnKeys() {
  // Make channel items focusable
  _makeFocusable();
}

function _focusFirstIn(containerId) {
  const el = document.getElementById(containerId)
    ?.querySelector('[tabindex="0"], button, a, input, .gitem, .chitem, video, .shp');
  el?.focus();
}

function _focusNext(sel) {
  const all  = [...document.querySelectorAll(sel)];
  const curr = document.activeElement;
  const idx  = all.indexOf(curr);
  if (idx < all.length-1) all[idx+1].focus();
  else if (all.length) all[0].focus(); // wrap
}

function _focusPrev(sel) {
  const all  = [...document.querySelectorAll(sel)];
  const curr = document.activeElement;
  const idx  = all.indexOf(curr);
  if (idx > 0) all[idx-1].focus();
  else if (all.length) all[all.length-1].focus(); // wrap
}

/* ─── PREV / NEXT CHANNEL ─────────────────────────────────── */
function pvrNextChannel() {
  const items = [...document.querySelectorAll('.chitem')];
  const cur   = items.findIndex(i => i.id === 'pvr-ch-' + _pvrChId);
  const next  = items[cur + 1] || items[0];
  if (next) { next.focus(); next.click(); }
}
function pvrPrevChannel() {
  const items = [...document.querySelectorAll('.chitem')];
  const cur   = items.findIndex(i => i.id === 'pvr-ch-' + _pvrChId);
  const prev  = cur > 0 ? items[cur - 1] : items[items.length - 1];
  if (prev) { prev.focus(); prev.click(); }
}

async function _pvrAutoIndia() {
  const d   = await GET('/iptv/playlists');
  const pls = d.playlists || [];
  const india = pls.find(p => p.url?.includes('/in.m3u'));
  if (!india) return;
  const sel = document.getElementById('pvr-pl');
  if (india.channel_count === 0) {
    const st = document.getElementById('pvr-add-status');
    if (st) st.innerHTML = '<span style="font-size:11px;color:var(--t2)">📡 Loading India channels…</span>';
    const r = await POST('/iptv/playlists/refresh', { id: india.id });
    if (r.ok) {
      toast(`✅ India IPTV — ${r.channel_count} channels`, 'ok');
      await pvrLoadPlaylists();
      if (sel) { sel.value = india.id; pvrSelectPlaylist(); }
    }
  } else if (sel && !sel.value) {
    sel.value = india.id;
    pvrSelectPlaylist();
  }
}

/* ─── PLAYLISTS ─────────────────────────────────────────────── */
async function pvrLoadPlaylists() {
  const d   = await GET('/iptv/playlists');
  const sel = document.getElementById('pvr-pl');
  const pls = d.playlists || [];
  sel.innerHTML = '<option value="">— Select playlist —</option>' +
    pls.map(p =>
      `<option value="${p.id}">${esc(p.name)} (${p.channel_count||0} ch)</option>`
    ).join('');
}

async function pvrSelectPlaylist() {
  const plId = document.getElementById('pvr-pl').value;
  if (!plId) {
    document.getElementById('pvr-ch-list').innerHTML = '';
    return;
  }
  _pvrPlId = plId; _pvrGroup = 'all';
  pvrLoadChannels();
}

/* ─── GROUPS / CHANNELS ─────────────────────────────────────── */
async function pvrLoadChannels() {
  const list = document.getElementById('pvr-ch-list');
  list.innerHTML = '<div style="padding:24px;text-align:center"><div class="spin"></div></div>';
  const url = `/iptv/channels?playlist_id=${_pvrPlId}`;
  const d = await GET(url);
  _renderCh(d.channels || []);
}

async function _pvrLoadFavs() {
  const d = await GET('/iptv/favorites');
  _renderCh(d.channels || []);
}

function _renderCh(channels) {
  const list = document.getElementById('pvr-ch-list');
  if (!channels.length) {
    list.innerHTML = '<div style="padding:30px;text-align:center;color:var(--t3);font-size:13px">No channels</div>';
    return;
  }
  list.innerHTML = channels.map(ch => `
    <div class="chitem ${ch.id===_pvrChId?'on':''}" id="pvr-ch-${ch.id}"
         onclick='pvrPlay(${JSON.stringify(ch)})' tabindex='0' onkeydown='if(event.key==="Enter")pvrPlay(${JSON.stringify(ch)})'>
      ${ch.logo
        ? `<img class="ch-logo" src="${esc(ch.logo)}" loading="lazy"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : ''}
      <div class="ch-logo-ph" style="${ch.logo?'display:none':''}">📺</div>
      </div>
    </div>`).join('');

  // Auto-focus first channel if on PVR tab and focus is on sidebar
  const active = document.activeElement;
  if (!active || active === document.body || active.closest('#sidebar')) {
    if (window.irFocusFirst) {
      setTimeout(() => window.irFocusFirst(list), 100);
    }
  }
}

/* ─── SEARCH ────────────────────────────────────────────────── */
let _pvrST;
function pvrSearch() {
  const q = document.getElementById('pvr-q').value.trim();
  clearTimeout(_pvrST);
  if (!q) { pvrLoadChannels(); return; }
  if (!_pvrPlId) return;
  _pvrST = setTimeout(async () => {
    const d = await GET(`/iptv/search?playlist_id=${_pvrPlId}&q=${encodeURIComponent(q)}`);
    _renderCh(d.channels || []);
  }, 300);
}

/* ─── PVR Search History removed ─────────────────────────────── */

function _pvrWireSearch() {
  const input = document.getElementById('pvr-q');
  if (!input || input._w) return;
  input._w = true;
  // Search history removed from PVR section
}

/* ─── PLAY ──────────────────────────────────────────────────── */
function pvrPlay(ch) {
  const { id, name='', url='', group_title:group='', logo='' } = ch;
  _pvrChId = id; _pvrUrl = url; _pvrName = name;

  document.querySelectorAll('.chitem').forEach(c => c.classList.remove('on'));
  const el = document.getElementById('pvr-ch-' + id);
  if (el) { el.classList.add('on'); el.scrollIntoView({behavior:'smooth',block:'nearest'}); }

  document.getElementById('pvr-now').innerHTML = `
    <div class="ch-n">${esc(name)}</div>`;

  _pvrStreamSmart(url, name);
}

async function _pvrStreamSmart(url, name) {
  if (!_pvrPlayer) return;

  // Show loading state
  _pvrPlayer._showOverlay('Connecting to stream…');

  // Detect format from URL
  const isHls    = /\.m3u8(\?|$)/i.test(url);
  const isMpeg2  = /\.ts(\?|$)/i.test(url);
  const isDirect = /\.(mp4|mkv|webm|avi)(\?|$)/i.test(url);

  // Strategy:
  // 1. Try direct HLS proxy first (fast)
  // 2. If format not supported error → use ffmpeg transcode (handles MPEG-2, all codecs)
  // 3. Fallback to mpv/vlc via system if available

  _pvrPlayer.onFormatError = async () => {
    // Format not supported → try ffmpeg transcode
    toast('⚙️ Transcoding stream via ffmpeg…');
    await _pvrTranscode(url, name);
  };

  if (isHls) {
    // Try direct HLS proxy first
    const proxied = `${PROXY}/iptv/m3u8proxy?url=${encodeURIComponent(url)}`;
    _pvrPlayer.load(proxied);
    _pvrPlayer.video.onerror = async () => {
      const code = _pvrPlayer.video.error?.code;
      if (code === 4 || code === 3) await _pvrTranscode(url, name);
    };
  } else {
    // Non-HLS: go straight to ffmpeg transcode for MPEG-2, H264 etc
    await _pvrTranscode(url, name);
  }
}

async function _pvrTranscode(url, name) {
  _pvrPlayer._showOverlay('⚙️ Starting ffmpeg transcoder…');

  const d = await GET(`/iptv/transcode?url=${encodeURIComponent(url)}`);
  if (d.error) {
    _pvrPlayer._showError(`Transcode failed: ${d.error}\n\nTry opening in external player.`);
    return;
  }

  toast('✅ Transcoding — loading stream…', 'ok');
  _pvrPlayer.load(d.hls_url);
}

/* ─── ADD / MANAGE PLAYLISTS ─────────────────────────────────── */
function pvrShowAdd() {
  document.getElementById('pvr-add-modal').classList.remove('hidden');
  document.getElementById('pvr-add-status').textContent = '';
  document.getElementById('pvr-add-name').value = '';
  document.getElementById('pvr-add-url').value  = '';
}
function pvrCloseAdd() {
  document.getElementById('pvr-add-modal').classList.add('hidden');
}

async function pvrImport() {
  const name = document.getElementById('pvr-add-name').value.trim() || 'Playlist';
  const url  = document.getElementById('pvr-add-url').value.trim();
  if (!url) { toast('Enter a URL or file path','err'); return; }
  const st = document.getElementById('pvr-add-status');
  st.innerHTML = '<div class="spin" style="width:12px;height:12px;border-width:2px;display:inline-block"></div> Importing…';
  const d = await POST('/iptv/playlists/add', { name, url });
  if (d.error) {
    st.textContent = '❌ ' + d.error;
    toast('Import failed: ' + d.error, 'err');
  } else {
    pvrCloseAdd();
    toast(`✅ ${d.channel_count} channels imported`, 'ok');
    await pvrLoadPlaylists();
    document.getElementById('pvr-pl').value = d.id;
    pvrSelectPlaylist();
  }
}

async function pvrRefresh(plId) {
  toast('Refreshing…');
  const d = await POST('/iptv/playlists/refresh', { id: plId });
  if (d.error) toast('Error: ' + d.error, 'err');
  else {
    toast(`✅ ${d.channel_count} channels`, 'ok');
    await pvrLoadPlaylists();
    if (String(_pvrPlId) === String(plId)) pvrSelectPlaylist();
  }
}

async function pvrDelete(plId, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  await POST('/iptv/playlists/delete', { id: plId });
  toast('Deleted');
  _pvrPlId = null;
  await pvrLoadPlaylists();
  document.getElementById('pvr-ch-list').innerHTML = '';
}

async function pvrFav(chId) {
  const d = await POST('/iptv/favorites/toggle', { channel_id: chId });
  toast(d.favorited ? '❤️ Saved' : 'Removed', d.favorited ? 'ok' : '');
}

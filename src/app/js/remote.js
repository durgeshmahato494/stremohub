/* remote.js — IR Remote Navigation Engine v2
   - Arrow keys: 2D spatial navigation between any focusable element
   - Enter: click
   - Back/Escape: close/back
   - Media keys: playback control
   - F1-F4: tab switching
   - OSK integration: auto-show keyboard when navigating into search inputs
*/
'use strict';

const FOCUSABLE = [
  'button:not([disabled]):not([tabindex="-1"])',
  'a[href]',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '.vcard','.pcard','.wcard',
  '.chitem','.gitem',
  '.pill','.pp-src-btn',
  '.ep-btn','.pp-season-btn','.pp-ep-btn',
  '.osk-key',
  '.yt-load-more',
  '.sidenav li',
].join(',');

let _irActive = false;

/* ── Focus helpers ──────────────────────────────────────────── */
function _visible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 &&
    window.getComputedStyle(el).visibility !== 'hidden' &&
    window.getComputedStyle(el).display    !== 'none';
}

function _getFocusable(root) {
  root = root || document.querySelector('.tab.active') || document.body;
  return [...root.querySelectorAll(FOCUSABLE)].filter(_visible);
}

function _irFocus(el) {
  if (!el) return;
  document.querySelectorAll('.ir-focused').forEach(e => e.classList.remove('ir-focused'));
  el.classList.add('ir-focused');
  el.scrollIntoView({behavior:'smooth', block:'nearest', inline:'nearest'});
  el.focus?.();
}

/* ── Spatial navigation ─────────────────────────────────────── */
function _navDir(dir) {
  const active = document.activeElement;
  const all    = _getFocusable();

  if (!all.length) return;

  // If nothing focused, start at first element
  if (!active || active === document.body || !all.includes(active)) {
    _irFocus(all[0]);
    return;
  }

  const ar = active.getBoundingClientRect();
  const ax = ar.left + ar.width  / 2;
  const ay = ar.top  + ar.height / 2;

  let best = null, bestScore = Infinity;

  for (const el of all) {
    if (el === active) continue;
    const er = el.getBoundingClientRect();
    const ex = er.left + er.width  / 2;
    const ey = er.top  + er.height / 2;
    const dx = ex - ax, dy = ey - ay;

    // Must be in the correct direction
    const ok =
      (dir === 'right' && dx >  5) ||
      (dir === 'left'  && dx < -5) ||
      (dir === 'down'  && dy >  5) ||
      (dir === 'up'    && dy < -5);
    if (!ok) continue;

    const primary   = (dir==='left'||dir==='right') ? Math.abs(dx) : Math.abs(dy);
    const secondary = (dir==='left'||dir==='right') ? Math.abs(dy) : Math.abs(dx);
    const score     = primary + secondary * 3;
    if (score < bestScore) { bestScore = score; best = el; }
  }

  if (best) _irFocus(best);
}

/* ── Sidebar navigation ────────────────────────────────────── */
function _navSidebar(dir) {
  const sidebar = document.getElementById('sidebar');
  const tabs    = [...document.querySelectorAll('.sidenav li')];
  if (!tabs.length) return;

  const active  = document.activeElement;
  const inSide  = active?.closest('#sidebar');

  if (dir === 'left' && !inSide) {
    // Jump into sidebar, focus active tab
    const activeTab = sidebar.querySelector('.sidenav li.active') || tabs[0];
    _irFocus(activeTab);
    return true;
  }
  if (dir === 'right' && inSide) {
    // Jump back to content
    const tab = document.querySelector('.tab.active');
    const first = _getFocusable(tab)[0];
    if (first) _irFocus(first);
    return true;
  }
  if (inSide) {
    const idx = tabs.indexOf(active);
    if (dir === 'up'   && idx > 0)             { _irFocus(tabs[idx-1]); return true; }
    if (dir === 'down' && idx < tabs.length-1) { _irFocus(tabs[idx+1]); return true; }
    if (dir === 'down' && idx === tabs.length-1) {
      // From last tab, jump to content
      const tab = document.querySelector('.tab.active');
      const first = _getFocusable(tab)[0];
      if (first) { _irFocus(first); return true; }
    }
  }
  return false;
}

/* ── Search history navigation ─────────────────────────────── */
function _navHist(dir) {
  // Returns true if handled within dropdown
  const histId = document.getElementById('yt-sh') ? 'yt-sh' : document.getElementById('pvr-sh') ? 'pvr-sh' : 'pika-sh';
  const hist   = document.getElementById(histId);
  if (!hist || hist.style.display === 'none') return false;

  const items = [...hist.querySelectorAll('.hist-item')];
  if (!items.length) return false;

  const focused = hist.querySelector('.ir-hist-focus');
  const idx     = focused ? items.indexOf(focused) : -1;
  items.forEach(i => i.classList.remove('ir-hist-focus'));

  let next = idx;
  if (dir === 'down') next = Math.min(idx + 1, items.length - 1);
  if (dir === 'up')   next = idx - 1;

  if (next < 0) return false; // exit back to keyboard/input
  items[next].classList.add('ir-hist-focus');
  items[next].scrollIntoView({block:'nearest'});
  return true;
}

function _selectHist() {
  const focused = document.querySelector('.ir-hist-focus');
  if (!focused) return false;
  focused.click();
  return true;
}

/* ── Back action ────────────────────────────────────────────── */
function _back() {
  // OSK first
  if (window._oskVisible) { oskHide?.(); return; }

  // Close modals
  const pikaPlayer = document.getElementById('pika-player');
  if (pikaPlayer && !pikaPlayer.classList.contains('hidden')) { fpClose?.(); return; }
  const ytModal = document.getElementById('yt-login-modal');
  if (ytModal && !ytModal.classList.contains('hidden')) { ytCloseLogin?.(); return; }

  // Close search history
  const hist = document.getElementById('yt-sh') || document.getElementById('pika-sh');
  if (hist) { hist.remove(); return; }

  // Go back in current tab
  const tab = document.querySelector('.tab.active');
  if (tab?.id === 'tab-youtube')  { ytHome?.(); return; }
  if (tab?.id === 'tab-pikashow') { pikaHome?.(); return; }
}

/* ── Media control ──────────────────────────────────────────── */
function _media(key) {
  const p = window._shPlayer || window._ytPlayerInst || window._fpPlayer;
  if (!p) return;
  const v = p.video;
  if (!v) return;
  if (key === 'play')   { v.paused ? v.play() : v.pause(); return; }
  if (key === 'stop')   { v.pause(); return; }
  if (key === 'fwd')    { if (v.duration) v.currentTime = Math.min(v.duration, v.currentTime+10); return; }
  if (key === 'rew')    { v.currentTime = Math.max(0, v.currentTime-10); return; }
  if (key === 'chup')   { window._shPlayer?.onNextChannel?.(); return; }
  if (key === 'chdown') { window._shPlayer?.onPrevChannel?.(); return; }
  if (key === 'volup')  { v.volume = Math.min(1, v.volume+.1); return; }
  if (key === 'voldwn') { v.volume = Math.max(0, v.volume-.1); return; }
}

/* ── Fullscreen ─────────────────────────────────────────────── */
function _fullscreen() {
  if (document.fullscreenElement) { document.exitFullscreen(); return; }
  if (window._shPlayer)      { window._shPlayer._fs?.(); return; }
  if (window._ytPlayerInst)  { window._ytPlayerInst._fs?.(); return; }
  // YouTube embed
  const ytEmbed = document.getElementById('yt-player-container');
  if (ytEmbed?.querySelector('#yt-embed-iframe')) { ytEmbed.requestFullscreen?.(); return; }
  // Pikashow
  const pp = document.getElementById('pika-player');
  if (pp && !pp.classList.contains('hidden')) { pp.requestFullscreen?.(); return; }
}

/* ── Main keydown handler ───────────────────────────────────── */
document.addEventListener('keydown', e => {
  // If OSK is open, let osk.js handle it (capture phase, higher priority)
  if (window._oskVisible) return;

  // Don't intercept while typing in a real input/textarea
  const tag = document.activeElement?.tagName;
  const isRealInput = (tag === 'INPUT' || tag === 'TEXTAREA') &&
                      !['ArrowUp','ArrowDown','Escape','Enter'].includes(e.key);
  if (isRealInput) return;

  // Activate remote mode on any key
  if (!_irActive) {
    _irActive = true;
    document.body.classList.add('ir-active');
    if (!document.activeElement || document.activeElement === document.body) {
      const first = _getFocusable()[0];
      if (first) _irFocus(first);
    }
  }

  const active = document.activeElement;
  const isInput = active?.tagName === 'INPUT';

  switch (e.key) {
    // ── Navigation ──────────────────────────────────────────
    case 'ArrowRight':
      e.preventDefault();
      if (_navHist('right')) break;
      if (_navSidebar('right')) break;
      _navDir('right');
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (_navHist('left')) break;
      if (_navSidebar('left')) break;
      _navDir('left');
      break;
    case 'ArrowDown':
      e.preventDefault();
      // If focused on search input, jump straight to results grid
      if (active && (active.id === 'yt-q' || active.id === 'pika-q' || active.id === 'pvr-q')) {
        const tab = document.querySelector('.tab.active');
        // Try result grids in order
        const grids = ['yt-search-grid','yt-trending-grid','yt-rows',
                       'pika-search-grid','pika-rows',
                       'pvr-ch-list'];
        let jumped = false;
        for (const gid of grids) {
          const g = document.getElementById(gid);
          if (!g || g.closest('.hidden')) continue;
          const first = _getFocusable(g)[0];
          if (first) { _irFocus(first); jumped = true; break; }
        }
        if (!jumped) _navDir('down');
        break;
      }
      if (!_navHist('down') && !_navSidebar('down')) _navDir('down');
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (_navHist('up')) break;
      if (_navSidebar('up')) break;
      _navDir('up');
      break;

    // ── Select ──────────────────────────────────────────────
    // ── Select ──────────────────────────────────────────────
    case 'Enter':
      e.preventDefault();
      if (_selectHist()) break;
      if (isInput && (active.id === 'yt-q' || active.id === 'pika-q' || active.id === 'pvr-q')) {
        oskShow?.(active);
      } else {
        active?.click?.();
      }
      break;

    // ── Back ────────────────────────────────────────────────
    case 'Backspace':
    case 'Escape':
      e.preventDefault();
      _back();
      break;

    // ── Media ────────────────────────────────────────────────
    case ' ':
      if (!isInput) { e.preventDefault(); _media('play'); }
      break;
    case 'MediaPlayPause':
    case 'MediaPlay':     e.preventDefault(); _media('play');   break;
    case 'MediaStop':     e.preventDefault(); _media('stop');   break;
    case 'MediaFastForward': e.preventDefault(); _media('fwd'); break;
    case 'MediaRewind':      e.preventDefault(); _media('rew'); break;
    case 'PageUp':        e.preventDefault(); _media('chup');   break;
    case 'PageDown':      e.preventDefault(); _media('chdown'); break;
    case 'VolumeUp':      e.preventDefault(); _media('volup');  break;
    case 'VolumeDown':    e.preventDefault(); _media('voldwn'); break;

    // ── Fullscreen ───────────────────────────────────────────
    case 'f': case 'F':
      if (!isInput) { e.preventDefault(); _fullscreen(); }
      break;

    // ── Tab switching (blocked when OSK open) ─────────────────
    case 'F1': if(!window._oskVisible){e.preventDefault();switchTab('youtube',  document.querySelector('[data-tab="youtube"]'));}  break;
    case 'F2': if(!window._oskVisible){e.preventDefault();switchTab('pikashow', document.querySelector('[data-tab="pikashow"]'));} break;
    case 'F3': if(!window._oskVisible){e.preventDefault();switchTab('pvr',      document.querySelector('[data-tab="pvr"]'));}      break;
    case 'F4': if(!window._oskVisible){e.preventDefault();switchTab('settings', document.querySelector('[data-tab="settings"]'));} break;

    // ── Home ──────────────────────────────────────────────────
    case 'Home':
    case 'MediaHome':
      e.preventDefault();
      const t = document.querySelector('.tab.active');
      if (t?.id==='tab-youtube')  ytHome?.();
      if (t?.id==='tab-pikashow') pikaHome?.();
      break;
  }
}, true); // capture — highest priority

/* ── Mouse hides remote mode ─────────────────────────────────── */
document.addEventListener('mousemove', () => {
  if (_irActive) {
    _irActive = false;
    document.body.classList.remove('ir-active');
    document.querySelectorAll('.ir-focused').forEach(e => e.classList.remove('ir-focused'));
  }
}, {passive:true});

/* ── Hook switchTab to re-focus after tab switch ─────────────── */
const _origSwitch = window.switchTab;
if (_origSwitch) {
  window.switchTab = function(name, el) {
    _origSwitch(name, el);
    setTimeout(() => {
      if (_irActive) {
        // Skip search inputs — they trigger OSK on focus
        const all = _getFocusable(document.getElementById('tab-'+name));
        const first = all.find(e => e.tagName !== 'INPUT' && e.id !== 'pvr-q');
        if (first) _irFocus(first);
      }
    }, 250);
  };
}

// OSK wiring is handled entirely by osk.js

/* ── First keypress hint ─────────────────────────────────────── */
let _hintShown = false;
document.addEventListener('keydown', () => {
  if (_hintShown) return; _hintShown = true;
  if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return;
  const h = document.createElement('div');
  h.className = 'ir-hint';
  h.innerHTML = '🎮 Remote Active<br>↑↓←→ Navigate · OK Select<br>⌫ Back · F1-F4 Tabs<br>On input: Enter = Keyboard';
  document.body.appendChild(h);
  setTimeout(() => h.remove(), 4000);
}, {once:true});

/* ── IR focus CSS (applied to body.ir-active) ────────────────── */
// Dynamic CSS injection for search history item focus
const _dynCSS = document.createElement('style');
_dynCSS.textContent = `
  .ir-hist-focus {
    background: rgba(59,130,246,.18) !important;
    border-left: 3px solid #3b82f6 !important;
    border-radius: 4px;
  }
`;
document.head.appendChild(_dynCSS);

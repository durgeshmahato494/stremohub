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
  '.vcard','.pcard','.wcard','.vcompact',
  '.chitem','.gitem',
  '.pill','.pp-src-btn',
  '.ep-btn','.pp-season-btn','.pp-ep-btn',
  '.osk-key',
  '.yt-load-more',
  '.sidenav li',
  'details summary',
  '.btn-pri','.btn-sec',
  '.stab','.yt-hist-del','.btn-link','.yt-avatar-row',
].join(',');

let _irActive = false;

function irBegin() {
  if (_irActive) return;
  _irActive = true;
  document.body.classList.add('ir-active');
  const all = _getFocusable();
  if (all.length && (!document.activeElement || document.activeElement === document.body)) {
    _irFocus(all[0]);
  }
}

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
  el.scrollIntoView({behavior:'smooth', block:'center', inline:'center'});
  el.focus?.();
}

/* ── Spatial navigation ─────────────────────────────────────── */
function _navDir(dir) {
  const active = document.activeElement;
  const all    = _getFocusable();

  if (!all.length) return;
  const activeCol = _getColRoot(active);

  // If nothing focused yet, start at the first element
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

    // Strict vertical lock: if moving up/down, stay in same column
    if (dir === 'up' || dir === 'down') {
      if (_getColRoot(el) !== activeCol) continue;
    }
    const er = el.getBoundingClientRect();
    const ex = er.left + er.width  / 2;
    const ey = er.top  + er.height / 2;
    const dx = ex - ax;
    const dy = ey - ay;

    // Primary / secondary axis distances
    const primary   = (dir === 'left' || dir === 'right') ? Math.abs(dx) : Math.abs(dy);
    const secondary = (dir === 'left' || dir === 'right') ? Math.abs(dy) : Math.abs(dx);

    // ── Strict directional gate ──────────────────────────────
    // 1. Must be clearly in the pressed direction (min 4px clearance)
    const clearance = 4;
    const inDir =
      (dir === 'right' && dx >  clearance) ||
      (dir === 'left'  && dx < -clearance) ||
      (dir === 'down'  && dy >  clearance) ||
      (dir === 'up'    && dy < -clearance);
    if (!inDir) continue;

    // 2. Must be within a 56° cone (relaxed from strict 45°):
    //    lateral drift must not exceed 1.5x primary travel distance.
    if (secondary > primary * 1.5) continue;

    // ── Score: prefer closest in primary axis; penalize lateral drift
    // secondary * 5 keeps the winner firmly in the target lane.
    const score = primary + secondary * 5;
    if (score < bestScore) { bestScore = score; best = el; }
  }

  // Try explicit jumpers
  if (_navRails(dir)) return true;
  if (_navPVRCols(dir)) return true;
  if (dir === 'left' || dir === 'right') {
    if (_navSidebar(dir)) return true;
  }

  if (best) {
    _irFocus(best);
    return true;
  }
  return false;
}

function _getColRoot(el) {
  if (!el) return null;
  const inPVR = el.closest('#tab-pvr');
  if (inPVR) {
    if (el.closest('#shp-wrap')) return 'pvr-player';
    return 'pvr-list-area'; // Groups search + channel list
  }
  return el.closest('.yt-rail') || 
         el.closest('.pika-rail') ||
         el.closest('#sidebar') ||
         el.closest('.tab-main') || 
         el.closest('.tab.active');
}

function _navPVRCols(dir) {
  const active = document.activeElement;
  const tab    = document.querySelector('.tab.active');
  if (tab?.id !== 'tab-pvr') return false;

  const inCh = active.closest('#pvr-ch-list');
  const inPl = active.closest('#shp-wrap');

  if (dir === 'right' && inCh) {
    const wrap = document.getElementById('shp-wrap');
    if (wrap) { _irFocus(wrap); return true; }
  }
  if (dir === 'left' && inPl) {
    const list = document.getElementById('pvr-ch-list');
    const first = _getFocusable(list)[0];
    if (first) { _irFocus(first); return true; }
  }
  // Up/Down from search box to channels
  const inSearch = active.id === 'pvr-q';
  if (dir === 'down' && inSearch) {
    const list = document.getElementById('pvr-ch-list');
    const first = _getFocusable(list)[0];
    if (first) { _irFocus(first); return true; }
  }
  if (dir === 'up' && inCh) {
    const q = document.getElementById('pvr-q');
    if (q) { _irFocus(q); return true; }
  }
  return false;
}

function _navRails(dir) {
  const active = document.activeElement;
  const inYtR = active.closest('.yt-rail');
  const inPkR = active.closest('.pika-rail');

  const tab   = document.querySelector('.tab.active');
  const rail  = tab?.querySelector('.yt-rail, .pika-rail');

  if (dir === 'right' && (inYtR || inPkR)) {
    // Jump from rail to main content
    const main = tab?.querySelector('.tab-main');
    const first = _getFocusable(main)[0];
    if (first) { _irFocus(first); return true; }
  }
  if (dir === 'left' && !inYtR && !inPkR && !active.closest('#sidebar')) {
    // Jump from content to local rail (if it exists)
    if (rail) {
      const first = _getFocusable(rail)[0];
      if (first) { _irFocus(first); return true; }
    }
  }

  // Explicit vertical navigation within rails
  if ((dir === 'up' || dir === 'down') && (inYtR || inPkR)) {
    const r = inYtR || inPkR;
    const all = _getFocusable(r);
    const idx = all.indexOf(active);
    if (dir === 'down' && idx < all.length - 1) { _irFocus(all[idx+1]); return true; }
    if (dir === 'up' && idx > 0) { _irFocus(all[idx-1]); return true; }
    return true; // block if at edges
  }

  return false;
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

  // Trap left/right so focus doesn't accidentally move to elements behind the dropdown
  if (dir === 'left' || dir === 'right') return true;

  const items = [...hist.querySelectorAll('.hist-item')];
  if (!items.length) return false;

  const focused = hist.querySelector('.ir-hist-focus');
  const idx     = focused ? items.indexOf(focused) : -1;
  items.forEach(i => i.classList.remove('ir-hist-focus'));

  let next = idx;
  if (dir === 'down') next = Math.min(idx + 1, items.length - 1);
  if (dir === 'up')   next = idx - 1;

  if (next < 0) {
    const input = document.getElementById(histId === 'yt-sh' ? 'yt-q' : histId === 'pvr-sh' ? 'pvr-q' : 'pika-q');
    if (input) _irFocus(input);
    return true;
  }
  
  items[next].classList.add('ir-hist-focus');
  items[next].scrollIntoView({behavior:'smooth', block:'center'});

  // Remove focus from background items to prevent double highlight
  document.querySelectorAll('.ir-focused').forEach(e => {
    if (e.tagName !== 'INPUT') e.classList.remove('ir-focused');
  });
  
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
  if (window._oskVisible) return;

  const tag = document.activeElement?.tagName;
  const isRealInput = (tag === 'INPUT' || tag === 'TEXTAREA') &&
                      !['ArrowUp','ArrowDown','Escape','Enter'].includes(e.key);
  if (isRealInput) return;

  // Activation check
  if (!_irActive && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    irBegin();
    _showHint();
  }
  if (!_irActive) return;

  const active = document.activeElement;
  const isInput = (active?.tagName === 'INPUT');

  switch (e.key) {
    case 'ArrowRight': case 'ArrowLeft': case 'ArrowDown': case 'ArrowUp':
      e.preventDefault();
      const dir = e.key.replace('Arrow','').toLowerCase();
      if (_navHist(dir)) break;
      if (_navRails(dir)) break;
      if (_navPVRCols(dir)) break;
      if (_navSidebar(dir)) break;
      _navDir(dir);
      break;

    case 'Enter':
      e.preventDefault();
      if (_selectHist && _selectHist()) break;
      if (isInput && (active.id === 'yt-q' || active.id === 'pika-q' || active.id === 'pvr-q')) {
        if (typeof oskShow === 'function') oskShow(active);
      } else {
        active?.click?.();
      }
      break;

    case 'Backspace':
    case 'Escape':
      e.preventDefault();
      _back();
      break;

    case ' ':
      if (!isInput) { e.preventDefault(); _media?.('play'); }
      break;

    case 'MediaPlayPause': case 'MediaPlay': e.preventDefault(); _media?.('play'); break;
    case 'MediaStop': e.preventDefault(); _media?.('stop'); break;
    case 'MediaFastForward': e.preventDefault(); _media?.('fwd'); break;
    case 'MediaRewind': e.preventDefault(); _media?.('rew'); break;
    case 'PageUp': e.preventDefault(); _media?.('chup'); break;
    case 'PageDown': e.preventDefault(); _media?.('chdown'); break;
    case 'VolumeUp': e.preventDefault(); _media?.('volup'); break;
    case 'VolumeDown': e.preventDefault(); _media?.('voldwn'); break;
    case 'f': case 'F': if (!isInput) { e.preventDefault(); _fullscreen?.(); } break;

    case 'F1': e.preventDefault(); switchTab('youtube',  document.querySelector('[data-tab="youtube"]'));  break;
    case 'F2': e.preventDefault(); switchTab('pikashow', document.querySelector('[data-tab="pikashow"]')); break;
    case 'F3': e.preventDefault(); switchTab('pvr',      document.querySelector('[data-tab="pvr"]'));      break;
    case 'F4': e.preventDefault(); switchTab('settings', document.querySelector('[data-tab="settings"]')); break;

    case 'Home': case 'MediaHome':
      e.preventDefault();
      const t = document.querySelector('.tab.active');
      if (t?.id==='tab-youtube')  window.ytHome?.();
      if (t?.id==='tab-pikashow') window.pikaHome?.();
      break;
  }
}, true);

/* ── Activation Hint ─────────────────────────────────────────── */
let _hintShown = false;
function _showHint() {
  if (_hintShown) return; _hintShown = true;
  const h = document.createElement('div');
  h.className = 'ir-hint';
  h.innerHTML = '🎮 Remote Active<br>↑↓←→ Navigate · OK Select · F1-F4 Tabs';
  document.body.appendChild(h);
  setTimeout(() => h.remove(), 4000);
}

/* ── Mouse hides remote mode ─────────────────────────────────── */
document.addEventListener('mousemove', e => {
  if (!_irActive) return;
  if (Math.abs(e.movementX || 0) < 5 && Math.abs(e.movementY || 0) < 5) return;
  _irActive = false;
  document.body.classList.remove('ir-active');
  document.querySelectorAll('.ir-focused').forEach(e => e.classList.remove('ir-focused'));
}, {passive:true});

/* ── Hook switchTab to re-focus after tab switch ─────────────── */
const _origSwitch = window.switchTab;
if (_origSwitch) {
  window.switchTab = function(name, el) {
    _origSwitch(name, el);
    setTimeout(() => {
      if (_irActive) {
        const tab = document.getElementById('tab-' + name);
        if (name === 'youtube') {
          // Focus first video or home button
          const first = tab.querySelector('.vcard') || document.getElementById('yt-btn-home');
          if (first) _irFocus(first);
        } else if (name === 'pikashow') {
          // Focus Hero "Watch Now" or first card
          const first = tab.querySelector('#pika-hero .btn-pri') || tab.querySelector('.pcard') || document.getElementById('pika-btn-home');
          if (first) _irFocus(first);
        } else if (name === 'pvr') {
          // Focus first channel in list
          const first = tab.querySelector('.chitem');
          if (first) _irFocus(first);
          else {
            // If no channels yet, focus playlist dropdown as fallback
            const pl = document.getElementById('pvr-pl');
            if (pl) _irFocus(pl);
          }
        } else {
          const all = _getFocusable(tab);
          const first = all.find(e => e.tagName !== 'INPUT' && e.id !== 'pvr-q');
          if (first) _irFocus(first);
        }
      }
    }, 250);
  };
}

/* ── Global helper for transitioning view focus ─────────────── */
window.irFocusFirst = function(containerEl) {
  if (!_irActive || !containerEl) return;
  setTimeout(() => {
    // Only focus if the active element is not already inside the container
    if (!containerEl.contains(document.activeElement)) {
      const all = _getFocusable(containerEl);
      // Skip input elements by default so OSK doesn't pop up wildly
      let first = all.find(e => e.tagName !== 'INPUT');
      if (!first && all.length) first = all[0];
      if (first) _irFocus(first);
    }
  }, 100);
};

// OSK wiring is handled entirely by osk.js

// Extra listeners removed.

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

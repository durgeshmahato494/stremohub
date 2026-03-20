/* osk.js — On-Screen Keyboard v3
   Shows when any search input is focused (remote or mouse)
   stopImmediatePropagation blocks all key leaking
*/
'use strict';

const OSK_ROWS = [
  ['1','2','3','4','5','6','7','8','9','0','⌫'],
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['⇧','z','x','c','v','b','n','m','@','.'],
  ['HIDE','!','?','-','_','SPACE','CLEAR','✓'],
];

let _oskTarget  = null;
let _oskShift   = false;
let _oskRow     = 4;
let _oskCol     = 0;

// ── OSK enabled / disabled pref (persisted in localStorage) ──
let _oskEnabled = localStorage.getItem('osk_enabled') !== 'false'; // default ON

/** Called by the Settings toggle checkbox */
window.setOskEnabled = function(val) {
  _oskEnabled = !!val;
  localStorage.setItem('osk_enabled', _oskEnabled ? 'true' : 'false');
  // If OSK is currently open and we're turning it off, close it
  if (!_oskEnabled && window._oskVisible) oskHide();
};

// Expose as window property so remote.js can check it
Object.defineProperty(window, '_oskVisible', {
  get: () => !!document.getElementById('osk-panel')?.classList.contains('osk-visible'),
  configurable: true,
});

/* ── Build DOM ──────────────────────────────────────────────── */
function _buildOsk() {
  if (document.getElementById('osk-panel')) return;
  const p = document.createElement('div');
  p.id = 'osk-panel';
  p.innerHTML = `
    <div class="osk-preview-row">
      <span class="osk-label">Search:</span>
      <div class="osk-preview" id="osk-preview"></div>
      <button class="osk-hide-btn" id="osk-x">✕</button>
    </div>
    <div class="osk-keys" id="osk-keys"></div>
    <div class="osk-hint">↑↓←→ Move &nbsp;·&nbsp; OK/Enter Press &nbsp;·&nbsp; Back/Esc Close</div>`;
  document.body.appendChild(p);
  document.getElementById('osk-x').addEventListener('click', e => {
    e.stopImmediatePropagation(); oskHide();
  });
  _renderKeys();
}

function _renderKeys() {
  const c = document.getElementById('osk-keys');
  if (!c) return;
  c.innerHTML = '';
  OSK_ROWS.forEach((row, ri) => {
    const row_el = document.createElement('div');
    row_el.className = 'osk-row';
    row.forEach((key, ci) => {
      const btn = document.createElement('button');
      btn.className = 'osk-key';
      btn.dataset.r = ri; btn.dataset.c = ci; btn.dataset.k = key;
      btn.tabIndex = -1;
      if (key==='SPACE'){ btn.textContent='⎵  Space  ⎵'; btn.classList.add('osk-space-key'); }
      else if (key==='CLEAR'){ btn.textContent='⌦ Clear'; btn.classList.add('osk-wide'); }
      else if (key==='⌫'){ btn.textContent='⌫'; btn.classList.add('osk-del'); }
      else if (key==='⇧'){ btn.textContent='⇧'; btn.classList.add('osk-shift'); }
      else if (key==='✓'){ btn.textContent='✓ Go'; btn.classList.add('osk-go'); }
      else { btn.textContent = key; }
      btn.addEventListener('click', e => { e.stopImmediatePropagation(); _press(key); });
      row_el.appendChild(btn);
    });
    c.appendChild(row_el);
  });
}

/* ── Show / Hide ────────────────────────────────────────────── */
window.oskShow = function(input) {
  if (!input) return;
  if (!_oskEnabled) return; // ← honour the toggle
  _buildOsk();
  _oskTarget = input;
  document.getElementById('osk-panel').classList.add('osk-visible');
  document.body.classList.add('osk-open');
  _oskRow = 4; _oskCol = 0;
  _updatePreview();
  _hl();
};

window.oskHide = function() {
  const p = document.getElementById('osk-panel');
  if (p) p.classList.remove('osk-visible');
  document.body.classList.remove('osk-open');
  // Set guard flag to prevent history re-opening immediately after OSK closes
  window._oskJustClosed = true;
  setTimeout(() => { window._oskJustClosed = false; }, 300);
};

/* ── Key press ──────────────────────────────────────────────── */
function _press(key) {
  if (!_oskTarget) return;
  if (key==='⌫') {
    const v=_oskTarget.value, s=_oskTarget.selectionStart??v.length;
    if(s>0){ _oskTarget.value=v.slice(0,s-1)+v.slice(s); _oskTarget.setSelectionRange(s-1,s-1); }
  } else if (key==='HIDE') {
    oskHide();
    return;
  } else if (key==='CLEAR') {
    _oskTarget.value='';
  } else if (key==='SPACE') {
    _ins(' ');
  } else if (key==='✓') {
    const t = _oskTarget;
    oskHide();
    if (t.id==='yt-q')   window.ytSearch?.();
    if (t.id==='pika-q') window.pikaSearch?.();
    if (t.id==='pvr-q')  window.pvrSearch?.();
    return;
  } else if (key==='⇧') {
    _oskShift=!_oskShift;
    document.querySelectorAll('.osk-key').forEach(b=>{
      const k=b.dataset.k;
      if(k&&k.length===1&&/[a-z]/i.test(k)) b.textContent=_oskShift?k.toUpperCase():k;
      if(k==='⇧') b.classList.toggle('osk-shift-on',_oskShift);
    });
    return;
  } else {
    _ins(_oskShift?key.toUpperCase():key);
    if(_oskShift){
      _oskShift=false;
      document.querySelectorAll('.osk-key').forEach(b=>{
        const k=b.dataset.k;
        if(k&&k.length===1&&/[a-z]/i.test(k))b.textContent=k;
        if(k==='⇧')b.classList.remove('osk-shift-on');
      });
    }
  }
  _updatePreview();
  _oskTarget.dispatchEvent(new Event('input',{bubbles:true}));
}

function _ins(ch) {
  const s=_oskTarget.selectionStart??_oskTarget.value.length;
  const e=_oskTarget.selectionEnd??_oskTarget.value.length;
  _oskTarget.value=_oskTarget.value.slice(0,s)+ch+_oskTarget.value.slice(e);
  _oskTarget.setSelectionRange(s+ch.length,s+ch.length);
}

function _updatePreview() {
  const el=document.getElementById('osk-preview');
  if(el) el.textContent=_oskTarget?.value||'';
}

/* ── Remote nav ─────────────────────────────────────────────── */
function _hl() {
  document.querySelectorAll('.osk-key').forEach(b=>b.classList.remove('osk-focused'));
  const b=document.querySelector(`.osk-key[data-r="${_oskRow}"][data-c="${_oskCol}"]`);
  if(b){ b.classList.add('osk-focused'); b.scrollIntoView({block:'nearest'}); }
}
function _move(d) {
  if(d==='l') _oskCol=Math.max(0,_oskCol-1);
  if(d==='r') _oskCol=Math.min(OSK_ROWS[_oskRow].length-1,_oskCol+1);
  if(d==='u'){ _oskRow=Math.max(0,_oskRow-1); _oskCol=Math.min(_oskCol,OSK_ROWS[_oskRow].length-1); }
  if(d==='d'){ _oskRow=Math.min(OSK_ROWS.length-1,_oskRow+1); _oskCol=Math.min(_oskCol,OSK_ROWS[_oskRow].length-1); }
  _hl();
}

/* ── Key capture — MUST be first listener ──────────────────── */
document.addEventListener('keydown', e => {
  if (!window._oskVisible) return;
  // Block EVERYTHING from leaking when OSK is open
  e.stopImmediatePropagation();
  e.stopPropagation();
  switch(e.key) {
    case 'ArrowLeft':  e.preventDefault(); _move('l'); break;
    case 'ArrowRight': e.preventDefault(); _move('r'); break;
    case 'ArrowUp':    e.preventDefault(); _move('u'); break;
    case 'ArrowDown':  e.preventDefault(); _move('d'); break;
    case 'Enter':      e.preventDefault(); _press(OSK_ROWS[_oskRow][_oskCol]); break;
    case 'Backspace':  e.preventDefault(); _press('⌫'); break;
    case 'Escape':     e.preventDefault(); oskHide(); break;
    default:
      if(e.key.length===1&&!e.ctrlKey&&!e.altKey&&!e.metaKey){
        e.preventDefault(); _ins(e.key); _updatePreview();
        _oskTarget?.dispatchEvent(new Event('input',{bubbles:true}));
      }
  }
}, true);

/* ── Wire: show OSK ONLY on intentional user action ──────────
   NOT on programmatic focus() calls from navigation
   - Mouse click on input → show OSK
   - Remote Enter while input has ir-focused class → show OSK
   - Remote ArrowDown from search box → DON'T show (focus moves to results)
*/
function _wireInput(id) {
  const input = document.getElementById(id);
  if (!input || input._oskWired) return;
  input._oskWired = true;

  // yt-q and pika-q: single click shows history first, double-click shows OSK
  // pvr-q: single click shows OSK directly (no history conflict on first click)
  if (id === 'pvr-q') {
    input.addEventListener('click', () => {
      if (!window._oskVisible) oskShow(input);
    });
  } else {
    // For yt-q / pika-q: second click (when history already open) shows OSK
    input.addEventListener('click', () => {
      const histOpen = document.getElementById('yt-sh') || document.getElementById('pika-sh');
      if (histOpen && !window._oskVisible) oskShow(input);
    });
  }
  // Remote Enter → remote.js calls oskShow() explicitly for all inputs
}

function _wireAll() {
  _wireInput('yt-q');
  _wireInput('pika-q');
  _wireInput('pvr-q');
}

// Wire on load and with retries for late-initialized tabs
_wireAll();
setTimeout(_wireAll, 500);
setTimeout(_wireAll, 1500);

// ── Sync Settings checkbox to saved pref on load ──────────────
document.addEventListener('DOMContentLoaded', () => {
  const cb = document.getElementById('osk-enabled-toggle');
  if (cb) cb.checked = _oskEnabled;
});
// Also handle late tab switches (settings tab lazy-rendered)
document.addEventListener('click', () => {
  const cb = document.getElementById('osk-enabled-toggle');
  if (cb && cb._oskSynced !== true) { cb.checked = _oskEnabled; cb._oskSynced = true; }
});

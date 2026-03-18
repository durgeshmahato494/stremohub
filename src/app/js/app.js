/* app.js — StremoHub v3 core */
'use strict';

const API = 'http://127.0.0.1:8765';

async function api(path, opts){
  try{ const r=await fetch(API+path, opts); return r.json(); }
  catch(e){ return {error:e.message}; }
}
async function GET(path){ return api(path); }
async function POST(path,body){ return api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); }

/* Tab switching */
function switchTab(name, el){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  document.querySelectorAll('.sidenav li').forEach(l=>l.classList.remove('active'));
  if(el) el.classList.add('active');
  if(name==='youtube'  && !window._ytInit)  { ytInit();   window._ytInit=true; }
  if(name==='pikashow' && !window._pkInit)  { pikaInit(); window._pkInit=true; }
  if(name==='pvr'      && !window._pvrInit) { pvrInit();  window._pvrInit=true; }
  if(name==='settings') settingsInit();
}

/* Toast */
let _tt;
function toast(msg, type=''){
  const el=document.getElementById('toast');
  el.textContent=msg; el.className='toast '+(type==='ok'?'ok':type==='err'?'err':'');
  clearTimeout(_tt); _tt=setTimeout(()=>el.classList.add('hidden'),3500);
}

/* Helpers */
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function fmtNum(n){n=parseInt(n)||0;if(n>=1e9)return(n/1e9).toFixed(1)+'B';if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1e3)return(n/1e3).toFixed(1)+'K';return n+''}
function fmtDur(iso){if(!iso)return'';const m=iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);if(!m)return'';const h=+m[1]||0,mn=+m[2]||0,s=+m[3]||0;return h?`${h}:${String(mn).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${mn}:${String(s).padStart(2,'0')}`}

document.addEventListener('DOMContentLoaded',()=>{
  switchTab('youtube', document.querySelector('[data-tab="youtube"]'));
});

/* ── Global keyboard navigation ─────────────────────────────── */
document.addEventListener('keydown', e => {
  // Alt+1/2/3/4 to switch tabs
  if (e.altKey) {
    const map = {'1':'youtube','2':'pikashow','3':'pvr','4':'settings'};
    if (map[e.key]) {
      switchTab(map[e.key], document.querySelector(`[data-tab="${map[e.key]}"]`));
      e.preventDefault();
    }
  }

  // ESC closes any open modal
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal:not(.hidden), .fullscreen-modal:not(.hidden)').forEach(m => {
      if (m.id === 'pika-player') {
        if (typeof fpClose === 'function') fpClose();
      } else if (m.id === 'pvr-add-modal') {
        if (typeof pvrCloseAdd === 'function') pvrCloseAdd();
      } else if (m.id === 'yt-login-modal') {
        m.classList.add('hidden');
      }
    });
  }
});

/* Make sidenav items keyboard-navigable */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.sidenav li').forEach(li => {
    li.setAttribute('tabindex','0');
    li.addEventListener('keydown', e => {
      if (e.key==='Enter'||e.key===' ') { e.preventDefault(); li.click(); }
    });
  });
});

/* ── IR remote first-use hint ────────────────────────────────── */
(function(){
  let shown = false;
  document.addEventListener('keydown', function(e) {
    if (shown) return;
    if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
    shown = true;
    const hint = document.createElement('div');
    hint.className = 'ir-hint';
    hint.innerHTML =
      '🎮 Remote Active<br>' +
      '↑↓ Navigate<br>' +
      '← → Sections<br>' +
      'OK / Enter Select<br>' +
      'Back / ⌫ Go back<br>' +
      'F1-F4 Tabs';
    document.body.appendChild(hint);
    setTimeout(() => hint.remove(), 4000);
  }, { once: false });
})();

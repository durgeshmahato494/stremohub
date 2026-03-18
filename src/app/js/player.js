/* player.js — StremoHub Universal Player v3.1
   Uses container-scoped IDs so multiple instances work simultaneously
   (YouTube + PVR both active at the same time without conflicts)
*/
'use strict';

const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js';
let _hlsReady = false, _hlsCbs = [];
function _ensureHls(cb) {
  if (window.Hls?.isSupported?.()) { cb(); return; }
  _hlsCbs.push(cb);
  if (_hlsReady) return; _hlsReady = true;
  const s = document.createElement('script');
  s.src = HLS_CDN;
  s.onload = () => { _hlsCbs.forEach(f=>f()); _hlsCbs=[]; };
  document.head.appendChild(s);
}

class SHPlayer {
  constructor(containerId) {
    this.cid   = containerId;            // unique prefix for child IDs
    this.el    = document.getElementById(containerId);
    this.hls   = null;
    this.video = null;
    this.currentUrl     = '';
    this.onFormatError  = null;
    this.onPrevChannel  = null;
    this.onNextChannel  = null;
    this._ctrlTimer     = null;
    this._vol           = 1;
    this._streams       = [];  // quality options
    this._build();
    this._wireKeys();
  }

  /* ── Build DOM ──────────────────────────────────────────── */
  _build() {
    const p = this.cid; // prefix for unique IDs
    this.el.innerHTML = `
      <div class="shp" id="${p}-wrap" tabindex="0">
        <video id="${p}-video" playsinline></video>

        <div class="shp-buf" id="${p}-buf">
          <svg class="shp-spin-svg" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="none" stroke="#e50914"
              stroke-width="4" stroke-dasharray="80 40" stroke-linecap="round">
              <animateTransform attributeName="transform" type="rotate"
                from="0 22 22" to="360 22 22" dur=".9s" repeatCount="indefinite"/>
            </circle>
          </svg>
          <span id="${p}-buf-msg">Connecting…</span>
        </div>

        <div class="shp-err" id="${p}-err">
          <div class="shp-err-ico">📡</div>
          <div class="shp-err-title" id="${p}-err-title">Cannot play stream</div>
          <div class="shp-err-msg"  id="${p}-err-msg"></div>
          <div class="shp-err-btns">
            <button class="shp-ebtn" id="${p}-retry" tabindex="0">🔄 Retry</button>
            <button class="shp-ebtn" id="${p}-ext"   tabindex="0">↗ Open</button>
          </div>
        </div>

        <div class="shp-topbar" id="${p}-topbar">
          <span id="${p}-ch-name"></span>
          <span id="${p}-live-pill" class="shp-live-pill">● LIVE</span>
        </div>

        <div class="shp-center-flash" id="${p}-flash"></div>

        <div class="shp-ctrl" id="${p}-ctrl">
          <div class="shp-prog-row">
            <div class="shp-live-dot" id="${p}-live-dot">● LIVE</div>
            <input class="shp-seek" id="${p}-seek" type="range"
                   value="0" min="0" max="100" step="0.05" tabindex="0">
            <span class="shp-time" id="${p}-time">0:00</span>
          </div>
          <div class="shp-btn-row">
            <div class="shp-btn-left">
              <button class="shp-cb" id="${p}-prev"  tabindex="0" title="Prev (↑)">⏮</button>
              <button class="shp-cb" id="${p}-rew"   tabindex="0" title="-10s (←)">⏪</button>
              <button class="shp-cb shp-play" id="${p}-play" tabindex="0">▶</button>
              <button class="shp-cb" id="${p}-fwd"   tabindex="0" title="+10s (→)">⏩</button>
              <button class="shp-cb" id="${p}-next"  tabindex="0" title="Next (↓)">⏭</button>
            </div>
            <div class="shp-btn-center">
              <span class="shp-title" id="${p}-title"></span>
              <!-- Quality badge -->
              <span id="${p}-qual-badge" class="shp-qual-badge" style="display:none"></span>
            </div>
            <div class="shp-btn-right">
              <button class="shp-cb" id="${p}-mute"  tabindex="0" title="Mute (M)">🔊</button>
              <input  class="shp-vol" id="${p}-vol"  type="range"
                      min="0" max="1" step="0.05" value="1" tabindex="0">
              <button class="shp-cb" id="${p}-pip"   tabindex="0" title="PiP (P)">⧉</button>
              <button class="shp-cb shp-fs" id="${p}-fs" tabindex="0" title="Fullscreen (F)">⛶</button>
            </div>
          </div>
          <div class="shp-qual-bar" id="${p}-qual-bar" style="display:none"></div>
          <div class="shp-vol-popup" id="${p}-vol-popup"></div>
        </div>
      </div>`;

    this.video = this.el.querySelector(`#${p}-video`);
    this._wire();
  }

  /* ── Wire controls ──────────────────────────────────────── */
  _wire() {
    const p = this.cid, v = this.video;
    const wrap    = this.el.querySelector(`#${p}-wrap`);
    const playBtn = this.el.querySelector(`#${p}-play`);
    const muteBtn = this.el.querySelector(`#${p}-mute`);
    const volEl   = this.el.querySelector(`#${p}-vol`);
    const seek    = this.el.querySelector(`#${p}-seek`);

    playBtn.onclick = () => this._togglePlay();
    v.onclick       = () => this._togglePlay();
    muteBtn.onclick = () => this._toggleMute();
    this.el.querySelector(`#${p}-rew`).onclick  = () => this._seek(-10);
    this.el.querySelector(`#${p}-fwd`).onclick  = () => this._seek(10);
    this.el.querySelector(`#${p}-fs`).onclick   = () => this._fs();
    this.el.querySelector(`#${p}-pip`).onclick  = () => this._pip();
    this.el.querySelector(`#${p}-prev`).onclick = () => this.onPrevChannel?.();
    this.el.querySelector(`#${p}-next`).onclick = () => this.onNextChannel?.();
    this.el.querySelector(`#${p}-retry`).onclick= () => this.load(this.currentUrl);
    this.el.querySelector(`#${p}-ext`).onclick  = () => window.open(this.currentUrl,'_blank');

    volEl.oninput = () => { this._vol=parseFloat(volEl.value); v.volume=this._vol; };
    seek.oninput  = () => { if(v.duration) v.currentTime=(seek.value/100)*v.duration; };

    v.onplay      = () => { playBtn.textContent='⏸'; this._hideOverlay(); this._showCtrl(); };
    v.onpause     = () => { playBtn.textContent='▶'; this._showCtrl(); };
    v.onwaiting   = () => this._showOverlay('Buffering…');
    v.oncanplay   = () => this._hideOverlay();
    v.ontimeupdate= () => this._updateProg();
    v.onvolumechange=()=>{
      muteBtn.textContent = v.muted||v.volume===0 ? '🔇' : v.volume<.5 ? '🔉' : '🔊';
    };

    wrap.addEventListener('mousemove', ()=>this._showCtrl());
    wrap.addEventListener('mouseleave',()=>this._schedHide());
    wrap.addEventListener('click',     ()=>wrap.focus());
    document.addEventListener('fullscreenchange',()=>{
      this.el.querySelector(`#${p}-fs`).textContent = document.fullscreenElement ? '✕' : '⛶';
    });
  }

  /* ── Keyboard ───────────────────────────────────────────── */
  _wireKeys() {
    const p = this.cid;
    this.el.querySelector(`#${p}-wrap`).addEventListener('keydown', e => {
      if (['INPUT'].includes(document.activeElement?.tagName)&&
          document.activeElement.type==='range') return;
      switch(e.key) {
        case ' ': case 'k': case 'K':
          e.preventDefault(); this._togglePlay(); break;
        case 'ArrowLeft':
          e.preventDefault(); this._seek(-10); this._flash('⏪ 10s'); break;
        case 'ArrowRight':
          e.preventDefault(); this._seek(10);  this._flash('⏩ 10s'); break;
        case 'ArrowUp':
          e.preventDefault(); this.onPrevChannel?.(); break;
        case 'ArrowDown':
          e.preventDefault(); this.onNextChannel?.(); break;
        case 'm': case 'M': e.preventDefault(); this._toggleMute(); break;
        case 'f': case 'F': e.preventDefault(); this._fs(); break;
        case 'p': case 'P': e.preventDefault(); this._pip(); break;
        case ']': e.preventDefault();
          this._vol=Math.min(1,this._vol+.1); this.video.volume=this._vol;
          this.el.querySelector(`#${p}-vol`).value=this._vol; this._flashVol(); break;
        case '[': e.preventDefault();
          this._vol=Math.max(0,this._vol-.1); this.video.volume=this._vol;
          this.el.querySelector(`#${p}-vol`).value=this._vol; this._flashVol(); break;
        case 'Escape': document.exitFullscreen?.(); break;
      }
    });
  }

  /* ── Actions ────────────────────────────────────────────── */
  _togglePlay() {
    const v=this.video;
    if (v.paused) { v.play().catch(()=>{}); this._flash('▶'); }
    else          { v.pause();              this._flash('⏸'); }
    this._showCtrl();
  }
  _toggleMute() { this.video.muted=!this.video.muted; this._flashVol(); }
  _seek(s) {
    const v=this.video;
    if (v.duration) v.currentTime=Math.max(0,Math.min(v.duration,v.currentTime+s));
    this._showCtrl();
  }
  _fs() {
    const w=this.el.querySelector(`#${this.cid}-wrap`);
    if (!document.fullscreenElement) w.requestFullscreen?.();
    else document.exitFullscreen?.();
  }
  _pip() {
    if (document.pictureInPictureElement) document.exitPictureInPicture?.();
    else this.video.requestPictureInPicture?.().catch(()=>{});
  }

  /* ── Controls show/hide ─────────────────────────────────── */
  _showCtrl() {
    const p=this.cid;
    this.el.querySelector(`#${p}-ctrl`).classList.add('visible');
    this.el.querySelector(`#${p}-topbar`).classList.add('visible');
    this._schedHide();
  }
  _schedHide() {
    clearTimeout(this._ctrlTimer);
    this._ctrlTimer=setTimeout(()=>{
      if (!this.video.paused) {
        this.el.querySelector(`#${this.cid}-ctrl`).classList.remove('visible');
        this.el.querySelector(`#${this.cid}-topbar`).classList.remove('visible');
      }
    }, 3000);
  }

  /* ── Progress ───────────────────────────────────────────── */
  _updateProg() {
    const p=this.cid, v=this.video;
    const seek=this.el.querySelector(`#${p}-seek`);
    const time=this.el.querySelector(`#${p}-time`);
    const live=this.el.querySelector(`#${p}-live-dot`);
    if (!v.duration||isNaN(v.duration)) {
      live.style.display='flex'; seek.style.display='none';
      time.textContent=this._fmt(v.currentTime);
    } else {
      live.style.display='none'; seek.style.display='';
      seek.value=(v.currentTime/v.duration)*100;
      time.textContent=this._fmt(v.currentTime)+' / '+this._fmt(v.duration);
    }
  }

  /* ── Flash ──────────────────────────────────────────────── */
  _flash(txt) {
    const el=this.el.querySelector(`#${this.cid}-flash`);
    el.textContent=txt; el.classList.remove('pop');
    void el.offsetWidth; el.classList.add('pop');
  }
  _flashVol() {
    const p=this.cid, popup=this.el.querySelector(`#${p}-vol-popup`);
    const pct=this.video.muted?0:Math.round(this._vol*100);
    popup.textContent=(this.video.muted?'🔇':pct>50?'🔊':'🔉')+' '+pct+'%';
    popup.classList.remove('pop'); void popup.offsetWidth; popup.classList.add('pop');
  }

  /* ── Public API ─────────────────────────────────────────── */
  setChannelName(name) {
    const p=this.cid;
    const a=this.el.querySelector(`#${p}-ch-name`);
    const b=this.el.querySelector(`#${p}-title`);
    if(a) a.textContent=name;
    if(b) b.textContent=name;
  }

  setQualityOptions(options) {
    // options: [{label:'1080p',url:...},{label:'720p',url:...},...]
    this._streams = options;
    const p=this.cid;
    const bar=this.el.querySelector(`#${p}-qual-bar`);
    const badge=this.el.querySelector(`#${p}-qual-badge`);
    if (!options.length) { bar.style.display='none'; badge.style.display='none'; return; }
    bar.style.display='flex';
    badge.style.display='inline-block';
    badge.textContent=options[0].label||'HD';
    bar.innerHTML = options.map((o,i)=>
      `<button class="shp-qual-btn ${i===0?'active':''}" tabindex="0"
        onclick="(()=>{
          this.closest('.shp-qual-bar').querySelectorAll('.shp-qual-btn').forEach(b=>b.classList.remove('active'));
          this.classList.add('active');
          document.getElementById('${p}-qual-badge').textContent='${esc(o.label)}';
          window._shpInstances&&window._shpInstances['${p}']&&window._shpInstances['${p}'].loadDirect('${o.url.replace(/'/g,"\\\\'").replace(/\n/g,'')}');
        }).call(this)">${esc(o.label)}</button>`
    ).join('');
    // Register instance globally so inline onclick can find it
    if (!window._shpInstances) window._shpInstances={};
    window._shpInstances[p]=this;
  }

  loadDirect(url) {
    this.currentUrl=url;
    this._hideError();
    this._showOverlay('Loading…');
    const v=this.video;
    if(this.hls){try{this.hls.destroy();}catch(e){}this.hls=null;}
    v.src=url; v.load();
    v.play().catch(()=>{});
    v.onerror=()=>{
      const code=v.error?.code;
      if((code===4||code===3)&&typeof this.onFormatError==='function') this.onFormatError(code);
      else this._showError('Playback error'+(code?` (code ${code})`:'.'));
    };
  }

  load(url) {
    this.currentUrl=url;
    this._hideError();
    this._showOverlay('Connecting…');
    const v=this.video;
    if(this.hls){try{this.hls.destroy();}catch(e){}this.hls=null;}
    v.src=''; v.load();

    const proxied=this._proxy(url);
    const isHls=/\.m3u8(\?|$)/i.test(url)||url.includes('.m3u8');

    if(isHls){
      _ensureHls(()=>{
        if(window.Hls?.isSupported()){
          this.hls=new Hls({enableWorker:false,maxBufferLength:30,
            maxMaxBufferLength:120,liveSyncDurationCount:3});
          this.hls.loadSource(proxied);
          this.hls.attachMedia(v);
          this.hls.on(Hls.Events.MANIFEST_PARSED,()=>v.play().catch(()=>{}));
          this.hls.on(Hls.Events.ERROR,(_,d)=>{
            if(d.fatal){this.hls.destroy();this.hls=null;this._nativeLoad(proxied);}
          });
        } else this._nativeLoad(proxied);
      });
    } else this._nativeLoad(proxied);
  }

  _nativeLoad(url) {
    const v=this.video;
    v.src=url; v.load(); v.play().catch(()=>{});
    v.onerror=()=>{
      const code=v.error?.code;
      if((code===4||code===3)&&typeof this.onFormatError==='function') this.onFormatError(code);
      else this._showError('Playback error'+(code?` (code ${code})`:'.'));
    };
  }

  _proxy(url) {
    if(/\.m3u8(\?|$)/i.test(url))
      return `http://127.0.0.1:8765/iptv/m3u8proxy?url=${encodeURIComponent(url)}`;
    return `http://127.0.0.1:8765/iptv/proxy?url=${encodeURIComponent(url)}`;
  }

  _fmt(s) {
    if(!s||isNaN(s)) return '0:00';
    const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.floor(s%60);
    return h?`${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
            :`${m}:${String(sec).padStart(2,'0')}`;
  }

  _showOverlay(msg) {
    const o=this.el.querySelector(`#${this.cid}-buf`);
    const m=this.el.querySelector(`#${this.cid}-buf-msg`);
    if(o)o.style.display='flex'; if(m)m.textContent=msg||'Loading…';
  }
  _hideOverlay() {
    const o=this.el.querySelector(`#${this.cid}-buf`);
    if(o)o.style.display='none';
  }
  _showError(msg) {
    this._hideOverlay();
    const e=this.el.querySelector(`#${this.cid}-err`);
    const m=this.el.querySelector(`#${this.cid}-err-msg`);
    if(e)e.style.display='flex'; if(m)m.textContent=msg||'Error';
  }
  _hideError() {
    const e=this.el.querySelector(`#${this.cid}-err`);
    if(e)e.style.display='none';
  }
  destroy() {
    if(this.hls){try{this.hls.destroy();}catch(e){}this.hls=null;}
    this.video.src=''; this.video.load();
  }
}

/* ── Global helpers ─────────────────────────────────────────── */
let _shPlayer=null;
function shPlayerInit(cid){ _shPlayer=new SHPlayer(cid); return _shPlayer; }
function shPlayerPlay(url){ _shPlayer?.load(url); }

/* ── Pikashow ad-blocker ─────────────────────────────────────── */
const AD_CSS=`[id*="ad"i],[class*="ad-"i],[class*="-ad"i],[id*="banner"i],[class*="popup"i],
[class*="interstitial"i],[class*="promo"i],iframe[src*="doubleclick"],iframe[src*="googlesyndication"],
.jw-flag-ads,.plyr__ads,[class*="vast"],[class*="vpaid"],div[class*="preroll"]{
  display:none!important;width:0!important;height:0!important;}
video{width:100%!important;height:100%!important;object-fit:contain!important}`;

function pikaInjectAdBlock(iframe){
  try{
    const doc=iframe.contentDocument||iframe.contentWindow?.document;
    if(!doc)return;
    let s=doc.getElementById('sh-ab');
    if(!s){s=doc.createElement('style');s.id='sh-ab';doc.head?.appendChild(s);}
    s.textContent=AD_CSS;
  }catch(e){}
}
document.addEventListener('DOMContentLoaded',()=>{
  new MutationObserver(muts=>muts.forEach(m=>m.addedNodes.forEach(n=>{
    if(n.id==='fp-iframe')n.addEventListener('load',()=>pikaInjectAdBlock(n));
  }))).observe(document.body,{childList:true,subtree:true});
  document.getElementById('fp-iframe')?.addEventListener('load',e=>pikaInjectAdBlock(e.target));
});

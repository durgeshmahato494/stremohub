/* youtube.js — StremoHub YouTube v3 */
'use strict';

const YT_CATS = [
  {id:'',   label:'🔥 Trending'}, {id:'10', label:'🎵 Music'},
  {id:'20', label:'🎮 Gaming'},   {id:'25', label:'📰 News'},
  {id:'24', label:'🎭 Entertainment'},{id:'28',label:'💻 Tech'},
  {id:'17', label:'⚽ Sports'},  {id:'23', label:'😂 Comedy'},
  {id:'22', label:'👤 Vlogs'},   {id:'15', label:'🐾 Pets'},
];

let _ytLoggedIn=false,_ytUser=null;
let _ytPollTimer=null,_ytPollCnt=0;
let _ytCat='',_ytCurrentId='';
let _ytPlayerInst=null;

/* ═══ INIT ════════════════════════════════════════════════════ */
async function ytInit() {
  _buildCats();
  await ytCheckAuth();
  ytHome();
  _ytWireSearch();
}

function _buildCats() {
  document.getElementById('yt-cats').innerHTML = YT_CATS.map(r=>
    `<div class="pill ${r.id===''?'on':''}" tabindex="0"
      onclick="ytSelectCat('${r.id}',this)"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();ytSelectCat('${r.id}',this)}"
    >${r.label}</div>`
  ).join('');
}

function ytSelectCat(id,el){
  _ytCat=id;
  document.querySelectorAll('#yt-cats .pill').forEach(p=>p.classList.remove('on'));
  el.classList.add('on');
  ytHome();
}

/* ─── Search history wiring ─────────────────────────────────── */
function _ytWireSearch() {
  const input = document.getElementById('yt-q');
  if (!input || input._w) return;
  input._w = true;

  // Show dropdown on any interaction
  const _guardedShow = () => { if (!window._oskJustClosed) _ytMaybeShowHist(); };
  input.addEventListener('focus',     _guardedShow);
  input.addEventListener('click',     _guardedShow);
  input.addEventListener('mousedown', _guardedShow);
  input.addEventListener('input', ()=>{
    if (!input.value.trim()) _ytMaybeShowHist();
    else ytCloseHist();
  });
}

function _ytMaybeShowHist(e) {
  // Don't show over OSK, and add tiny delay so OSK opening takes priority
  clearTimeout(window._ytHistTimer);
  window._ytHistTimer = setTimeout(() => {
    if (!window._oskVisible) ytShowHist();
  }, 120);
}

async function ytShowHist() {
  // Remove old
  document.getElementById('yt-sh')?.remove();

  const d     = await GET('/youtube/search/history');
  const items = d.items || [];

  // Build the box with all inline styles - no CSS dependency
  const box = document.createElement('div');
  box.id = 'yt-sh';
  Object.assign(box.style, {
    position:'absolute', top:'100%', left:'0', right:'0',
    marginTop:'4px', zIndex:'9999',
    background:'#1e1e1e', border:'1px solid #333',
    borderRadius:'10px', boxShadow:'0 8px 28px rgba(0,0,0,.8)',
    overflow:'hidden', maxHeight:'300px', overflowY:'auto',
    fontFamily:'system-ui,sans-serif',
  });

  if (!items.length) {
    box.innerHTML = `<div style="padding:14px;text-align:center;color:#666;font-size:12px">
      🕐 No recent searches yet</div>`;
  } else {
    let rows = `<div style="display:flex;justify-content:space-between;align-items:center;
      padding:8px 12px 6px;border-bottom:1px solid #2a2a2a;flex-shrink:0">
      <span style="font-size:11px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.3px">Recent</span>
      <button onclick="ytClearHist()"
        style="background:none;border:none;color:#e50914;font-size:11px;cursor:pointer">Clear all</button>
    </div>`;
    for (const item of items) {
      const q  = item.query || '';
      const qj = JSON.stringify(q);
      rows += `<div class="hist-item" data-q="${esc(q).replace(/"/g,'&quot;')}" onclick="ytHistPick(this.dataset.q)"
        style="display:flex;align-items:center;gap:10px;padding:9px 12px;
               cursor:pointer;border-bottom:1px solid #181818;"
        onmouseover="this.style.background='#272727'"
        onmouseout="this.style.background=''">
        <span style="color:#555;font-size:13px;flex-shrink:0">🕐</span>
        <span style="flex:1;font-size:13px;color:#f1f1f1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(q)}</span>
        <button onclick="event.stopPropagation();ytDelHist(${qj},this.parentElement)"
          style="background:none;border:none;color:#555;cursor:pointer;font-size:12px;padding:0 4px;flex-shrink:0"
          onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#555'">✕</button>
      </div>`;
    }
    box.innerHTML = rows;
  }

  // Append to body with position calculated from search box
  const sb = document.getElementById('yt-search-box');
  if (!sb) return;
  const rect = sb.getBoundingClientRect();
  Object.assign(box.style, {
    position:'fixed',
    top: (rect.bottom + 4) + 'px',
    left: rect.left + 'px',
    width: rect.width + 'px',
    zIndex: '6000',    // above OSK (5000)
  });
  document.body.appendChild(box);

  // Close when clicking outside
  setTimeout(() => {
    const close = (e) => {
      const sh = document.getElementById('yt-sh');
      if (!sh) { document.removeEventListener('click', close); return; }
      if (!sh.contains(e.target) && e.target.id !== 'yt-q') {
        ytCloseHist();
        document.removeEventListener('click', close);
      }
    };
    document.addEventListener('click', close);
  }, 0);
}

function ytHistPick(q) {
  const input = document.getElementById('yt-q');
  if (!q || !input) return;
  input.value = q;
  ytCloseHist();
  ytSearch();
}

function ytCloseHist() { document.getElementById('yt-sh')?.remove(); }
async function ytClearHist(){ await POST('/youtube/search/history/delete',{}); ytCloseHist(); toast('History cleared'); }
async function ytDelHist(q,row){ await POST('/youtube/search/history/delete',{query:q}); row?.remove(); }

/* ═══ AUTH ════════════════════════════════════════════════════ */
async function ytCheckAuth(){
  const d=await GET('/youtube/auth/status');
  _ytLoggedIn=d.logged_in; _ytUser=d.user||null; _renderAuth();
}
function _renderAuth(){
  const area=document.getElementById('yt-login-area');
  document.getElementById('yt-user-badge').textContent=_ytLoggedIn?(_ytUser?.name||''):'';
  if(_ytLoggedIn&&_ytUser){
    area.innerHTML=`<div class="yt-avatar-row" tabindex="0" onclick="ytMenu()" onkeydown="if(event.key==='Enter')ytMenu()">
      <img class="yt-avatar-img" src="${esc(_ytUser.picture||'')}" onerror="this.style.display='none'">
      <span class="yt-avatar-name">${esc(_ytUser.name||_ytUser.email||'Account')}</span>
      <span style="color:var(--t3);font-size:11px">▾</span></div>`;
  } else {
    area.innerHTML=`<button class="btn-pri" style="font-size:12px;padding:5px 12px" onclick="ytLogin()">Sign in</button>`;
  }
}

async function ytLogin(){
  const modal=document.getElementById('yt-login-modal');
  modal.classList.remove('hidden');
  modal.innerHTML=`<div class="yt-login-box">
    <div class="yt-login-logo"><span style="color:#f00;font-size:26px">▶</span>
      <span style="font-size:18px;font-weight:800">Sign in to YouTube</span></div>
    <div style="display:flex;align-items:center;gap:10px;padding:16px 0;color:var(--t2)">
      <div class="spin"></div>Getting code…</div></div>`;
  const d=await GET('/youtube/auth/device/start');
  if(!d.user_code){
    modal.innerHTML=`<div class="yt-login-box">
      <div class="yt-login-logo"><span style="color:#f00;font-size:22px">▶</span>
        <span style="font-size:16px;font-weight:800">Sign in</span></div>
      <div class="api-ok" style="margin:12px 0">✅ YouTube works without login.</div>
      <button class="btn-sec" onclick="ytCloseLogin()">Continue</button></div>`;
    return;
  }
  window._ytCID = d._cid||'';
  window._ytSEC = d._sec||'';
  const url = 'https://www.youtube.com/activate';
  modal.innerHTML=`<div class="yt-login-box">
    <div class="yt-login-logo"><span style="color:#f00;font-size:26px">▶</span>
      <span style="font-size:18px;font-weight:800">Sign in to YouTube</span></div>
    <p style="color:var(--t2);font-size:13px;margin:8px 0 4px">Open on any device:</p>
    <a href="${esc(url)}" target="_blank" class="hint-url">${esc(url)}</a>
    <p style="color:var(--t2);font-size:13px;margin:12px 0 4px">Enter code:</p>
    <div class="code-box">
      <span class="code-txt">${esc(d.user_code)}</span>
      <button class="code-copy" onclick="navigator.clipboard?.writeText('${esc(d.user_code)}').then(()=>toast('Copied!','ok'))">⧉</button>
    </div>
    <div class="poll-status" id="yt-poll">
      <div class="spin" style="width:12px;height:12px;border-width:2px"></div>
      <span>Waiting… (${Math.floor((d.expires_in||1800)/60)} min)</span>
    </div>
    <button class="btn-sec" style="margin-top:6px" onclick="ytCloseLogin()">Cancel</button></div>`;
  clearInterval(_ytPollTimer); _ytPollCnt=0;
  _ytPollTimer=setInterval(()=>_ytPoll(d.device_code,''),Math.max((d.interval||5),5)*1000);
}
async function _ytPoll(dc,wci){
  const qs=(window._ytCID?`&cid=${encodeURIComponent(window._ytCID)}`:'')+(window._ytSEC?`&sec=${encodeURIComponent(window._ytSEC)}`:'');
  const d=await GET(`/youtube/auth/device/poll?device_code=${encodeURIComponent(dc)}${qs}`);
  if(d.status==='ok'){
    clearInterval(_ytPollTimer); _ytLoggedIn=true; _ytUser=d.user||{};
    const el=document.getElementById('yt-poll');
    if(el)el.innerHTML='<span style="color:var(--green);font-weight:700">✅ Signed in!</span>';
    setTimeout(()=>{ytCloseLogin();_renderAuth();toast('✅ Signed in!','ok');},900);
  } else if(d.status==='expired_token'){
    clearInterval(_ytPollTimer);
    const el=document.getElementById('yt-poll');
    if(el)el.innerHTML='<span style="color:#ef4444">Expired — <button class="btn-pri" style="padding:3px 9px;font-size:11px" onclick="ytCloseLogin();ytLogin()">Retry</button></span>';
  }
}
function ytCloseLogin(){clearInterval(_ytPollTimer);document.getElementById('yt-login-modal').classList.add('hidden');}
async function ytLogout(){await GET('/youtube/auth/logout');_ytLoggedIn=false;_ytUser=null;_renderAuth();toast('Signed out');}
function ytMenu(){
  const area=document.getElementById('yt-login-area');
  area.innerHTML=`<div style="position:relative"><div class="yt-dropdown" id="yt-dd">
    <div class="duser"><img class="yt-avatar-img" src="${esc(_ytUser?.picture||'')}" onerror="this.style.display='none'">
      <div><div style="font-size:12px;font-weight:600">${esc(_ytUser?.name||'')}</div>
        <div style="font-size:10px;color:var(--t3)">${esc(_ytUser?.email||'')}</div></div></div>
    <hr style="border-color:var(--bdr);margin:5px 0">
    <button class="dbtn" tabindex="0" onclick="ytPage('subs')">🔔 Subscriptions</button>
    <button class="dbtn" tabindex="0" onclick="ytPage('history')">📺 Watch History</button>
    <button class="dbtn" tabindex="0" onclick="ytPage('likes')">👍 Liked Videos</button>
    <hr style="border-color:var(--bdr);margin:5px 0">
    <button class="dbtn" style="color:#ef4444" tabindex="0" onclick="ytLogout()">Sign out</button>
  </div></div>`;
  setTimeout(()=>document.addEventListener('click',function h(e){if(!e.target.closest('#yt-dd')){_renderAuth();document.removeEventListener('click',h);}}),50);
}

/* ═══ HOME ════════════════════════════════════════════════════ */
async function ytHome(){
  ytShowPage('home');
  const rows = document.getElementById('yt-rows');
  rows.innerHTML = '<div class="loading"><div class="spin"></div>Loading…</div>';
  const region = document.getElementById('yt-region').value;

  // If a category pill is selected, show that category
  if (_ytCat) {
    const d = await GET(`/youtube/trending?region=${region}&category=${_ytCat}`);
    const label = YT_CATS.find(r=>r.id===_ytCat)?.label || '';
    rows.innerHTML = `<div class="section-label">${label}</div>
      <div class="vgrid">${(d.items||[]).map(ytCard).join('')}</div>`;
    return;
  }

  // Load search history + trending in parallel
  const [hist, trending, music, gaming, news] = await Promise.all([
    GET('/youtube/search/history'),
    GET(`/youtube/trending?region=${region}&category=`),
    GET(`/youtube/trending?region=${region}&category=10`),
    GET(`/youtube/trending?region=${region}&category=20`),
    GET(`/youtube/trending?region=${region}&category=25`),
  ]);

  const histItems = (hist.items || []).slice(0, 10); // top 10 queries

  // Build home HTML - search history rows first, then trending
  let html = '';

  if (histItems.length) {
    html += `<div class="yt-hist-section-header">
      <span style="font-size:14px;font-weight:700">🕐 Based on your searches</span>
      <button onclick="ytClearHist();ytHome()" 
        style="background:none;border:none;color:var(--t3);font-size:11px;cursor:pointer">Clear history</button>
    </div>`;

    // Load results for each query in parallel (max 10 queries)
    const searchResults = await Promise.all(
      histItems.map(item =>
        GET(`/youtube/search?q=${encodeURIComponent(item.query)}&maxResults=10`)
          .then(d => ({query: item.query, items: d.items || []}))
          .catch(() => ({query: item.query, items: []}))
      )
    );

    for (const {query, items} of searchResults) {
      if (!items.length) continue;
      html += _row(`🔍 ${esc(query)}`, items, query);
    }
  }

  // Always add trending rows below
  if (!trending.error) {
    html += (histItems.length ? '<div style="height:8px"></div>' : '') +
      _row('🔥 Trending', trending.items||[]) +
      _row('🎵 Music',    music.items||[])    +
      _row('🎮 Gaming',   gaming.items||[])   +
      _row('📰 News',     news.items||[]);
  }

  if (!html) {
    rows.innerHTML = '<div class="empty"><div class="ico">⚠️</div><h3>Could not load</h3></div>';
    return;
  }
  rows.innerHTML = html;
}

function _row(title, items, searchQuery) {
  if (!items.length) return '';
  const seeMore = searchQuery
    ? `<button class="btn-link" onclick="document.getElementById('yt-q').value=${JSON.stringify(searchQuery)};ytSearch()" tabindex="0">See all</button>`
    : '';
  return `<div class="yt-row">
    <div class="yt-row-hdr"><span>${title}</span>${seeMore}</div>
    <div class="yt-scroll">${items.slice(0,10).map(v=>`<div style="flex-shrink:0;width:270px">${ytCard(v)}</div>`).join('')}</div>
  </div>`;
}


/* ═══ SEARCH ══════════════════════════════════════════════════ */
async function ytSearch(){
  const q=document.getElementById('yt-q').value.trim();
  if(!q){ytShowHist();return;}
  ytCloseHist();
  ytShowPage('search-page');
  document.getElementById('yt-sq').textContent=q;
  const grid=document.getElementById('yt-search-grid');
  grid.innerHTML='<div class="loading"><div class="spin"></div>Searching…</div>';
  POST('/youtube/search/history/add',{query:q});
  const d=await GET(`/youtube/search?q=${encodeURIComponent(q)}&maxResults=24`);
  grid.innerHTML=(d.items||[]).map(ytCard).join('')||'<div class="empty"><div class="ico">🔍</div><h3>No results</h3></div>';
}

/* ═══ VIDEO CARD ══════════════════════════════════════════════ */
function ytCard(v){
  const id=esc(v.id||''),th=v.thumbnail||`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
  const title=esc(v.title||''),ch=esc(v.channel||''),dur=esc(v.duration||'');
  const views=esc(v.views||''),pub=esc(v.published||'');
  return`<div class="vcard" tabindex="0"
    onclick="ytWatch('${id}','${title.replace(/'/g,"\\'")}','${ch.replace(/'/g,"\\'")}','${esc(th)}')"
    onkeydown="if(event.key==='Enter')this.click()">
    <div class="thumb-wrap">
      <img src="${esc(th)}" loading="lazy" onerror="this.src='https://i.ytimg.com/vi/${id}/hqdefault.jpg'">
      ${dur?`<span class="dur">${dur}</span>`:''}
    </div>
    <div class="vinfo">
      <div class="vtitle">${title}</div>
      <div class="vchan">${ch}</div>
      <div class="vmeta">${views}${views&&pub?' · ':''}${pub}</div>
    </div>
  </div>`;
}

/* ═══ WATCH ═══════════════════════════════════════════════════ */
async function ytWatch(videoId,title,channel,thumb){
  ytShowPage('watch-page');
  _ytCurrentId=videoId;
  ytCloseHist();
  POST('/youtube/history/add',{video_id:videoId,title,channel,thumbnail:thumb});
  const container=document.getElementById('yt-player-container');
  container.innerHTML='';
  if(_ytPlayerInst){try{_ytPlayerInst.destroy();}catch(e){}_ytPlayerInst=null;}
  _ytPlayerInst=new SHPlayer('yt-player-container');
  _ytPlayerInst._showOverlay('Loading streams…');
  _ytPlayerInst.onFormatError=()=>_ytEmbedFallback(_ytCurrentId);

  document.getElementById('yt-info').innerHTML=`
    <h2 style="font-size:15px;font-weight:700;margin-bottom:4px">${esc(title)}</h2>
    <div class="meta" style="color:var(--t2);font-size:12px">${esc(channel)}</div>
    <div style="display:flex;gap:7px;margin-top:9px;flex-wrap:wrap">
      <div style="background:var(--bg3);border-radius:5px;padding:5px 12px;font-size:11px;color:var(--t3)">Loading…</div>
      <button class="btn-sec" style="font-size:11px;padding:5px 10px" onclick="_ytEmbedFallback('${esc(videoId)}')">🌐 Embed</button>
    </div>`;
  // Clear related and show loading
  const relBox=document.getElementById('yt-related');
  relBox.innerHTML='<div style="padding:20px;text-align:center"><div class="spin"></div></div>';

  const [streams,detail,rel]=await Promise.all([
    GET(`/youtube/streams?id=${videoId}`),
    GET(`/youtube/video?id=${videoId}`),
    GET(`/youtube/related?id=${videoId}`),
  ]);

  if(streams.streams?.length) _ytLoadStream(streams.streams,videoId);
  else _ytEmbedFallback(videoId);

  const v=detail.items?.[0]||{};
  const infoTitle=v.title||title, infoChan=v.channel||channel;
  document.getElementById('yt-info').innerHTML=`
    <h2 style="font-size:15px;font-weight:700;margin-bottom:4px">${esc(infoTitle)}</h2>
    <div class="meta" style="color:var(--t2);font-size:12px">
      ${esc(infoChan)}${v.views?' · '+esc(v.views)+' views':''}${v.published?' · '+esc(v.published):''}
    </div>
    <div style="display:flex;gap:7px;margin-top:9px;flex-wrap:wrap" id="yt-act">
      <div id="yt-qual-wrap" style="position:relative"></div>
      <button class="btn-pri" style="font-size:11px;padding:5px 10px"
        onclick="ytSave('${esc(videoId)}','${esc(infoTitle.replace(/'/g,"\\'"))}','${esc(infoChan.replace(/'/g,"\\'"))}','${esc(thumb)}')">👍 Save</button>
      ${v.channelId?`<button class="btn-sec" style="font-size:11px;padding:5px 10px" onclick="ytChannel('${esc(v.channelId)}')">📺 Channel</button>`:''}
      <button class="btn-sec" style="font-size:11px;padding:5px 10px"
        onclick="window.open('https://www.youtube.com/watch?v=${esc(videoId)}','_blank')">↗ YouTube</button>
      <button class="btn-sec" style="font-size:11px;padding:5px 10px"
        onclick="_ytEmbedFallback('${esc(videoId)}')">🌐 Embed</button>
    </div>
    ${v.description?`<p style="margin-top:9px;font-size:12px;color:var(--t2);line-height:1.7">${esc(v.description.slice(0,500))}${v.description.length>500?'…':''}</p>`:''}`;

  if(streams.streams?.length) _ytBuildQualMenu(streams.streams,videoId);

  // Related - show 10 + Load More
  window._ytRelAll   = rel.items||[];
  window._ytRelShown = 0;
  _ytRenderRel(true);
}

/* ─── Related videos (10 + Load More) ───────────────────────── */
function _ytRelCard(v){
  const th=v.thumbnail||`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
  return`<div class="vcompact" tabindex="0"
    onclick="ytWatch('${esc(v.id)}','${esc((v.title||'').replace(/'/g,"\\'"))}','${esc((v.channel||'').replace(/'/g,"\\'"))}','${esc(th)}')"
    onkeydown="if(event.key==='Enter')this.click()">
    <img src="${esc(th)}" loading="lazy">
    <div><div class="vc-title">${esc(v.title||'')}</div>
      <div class="vc-meta">${esc(v.channel||'')}${v.duration?' · '+esc(v.duration):''}</div>
    </div></div>`;
}

function _ytRenderRel(reset){
  const all=window._ytRelAll||[];
  const PAGE=10;
  if(reset) window._ytRelShown=0;
  const box=document.getElementById('yt-related');
  if(!box) return;
  if(!all.length){
    box.innerHTML='<div style="padding:16px 8px;text-align:center;color:var(--t3);font-size:12px">No suggestions available</div>';
    return;
  }
  const next=Math.min(window._ytRelShown+PAGE,all.length);
  const slice=all.slice(0,next);
  window._ytRelShown=next;
  const hasMore=next<all.length;
  box.innerHTML=
    slice.map(_ytRelCard).join('')+
    (hasMore
      ? `<button class="yt-load-more" tabindex="0" onclick="_ytRenderRel(false)">
           ↓ Load ${Math.min(PAGE,all.length-next)} more</button>`
      : (all.length>0?`<p style="font-size:11px;color:var(--t3);text-align:center;padding:10px">All ${all.length} shown</p>`:''));
}

/* ─── Stream quality ──────────────────────────────────────────── */
function _ytLoadStream(streams,videoId){
  const combined=streams.filter(s=>s.hasVideo&&s.hasAudio);
  const list=combined.length?combined:streams.filter(s=>s.hasVideo);
  if(!list.length){_ytEmbedFallback(videoId);return;}
  const chosen=list.find(s=>s.height===720||s.quality==='720p')||list.find(s=>s.height<=1080)||list[0];
  _ytPlayerInst?.loadDirect(chosen.url);
}

function _ytBuildQualMenu(streams){
  const wrap=document.getElementById('yt-qual-wrap');
  if(!wrap)return;
  const combined=streams.filter(s=>s.hasVideo&&s.hasAudio);
  if(!combined.length)return;
  const cur=combined.find(s=>s.height===720||s.quality==='720p')||combined[0];
  wrap.innerHTML=`<button class="btn-sec" id="yt-qbtn" style="font-size:11px;padding:5px 10px" onclick="ytToggleQual()">${esc(cur.quality||'HD')} ▾</button>`;
  window._ytQualStreams=combined;
}
window.ytToggleQual=function(){
  let menu=document.getElementById('yt-qmenu');
  if(menu){menu.remove();return;}
  menu=document.createElement('div');
  menu.id='yt-qmenu';
  menu.style.cssText='position:absolute;top:100%;left:0;background:var(--bg2);border:1px solid var(--bdr);border-radius:8px;padding:4px;z-index:200;min-width:110px;box-shadow:0 6px 18px rgba(0,0,0,.6)';
  menu.innerHTML=(window._ytQualStreams||[]).map((s,i)=>
    `<button class="dbtn" tabindex="0" style="font-size:12px"
      onclick="window._ytPlayerInst?.loadDirect('${s.url.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}');document.getElementById('yt-qbtn').textContent='${esc(s.quality||s.height+'p')} ▾';document.getElementById('yt-qmenu')?.remove()">
      ${esc(s.quality||s.height+'p')} ${i===0?'✓':''}
    </button>`
  ).join('');
  document.getElementById('yt-qual-wrap').appendChild(menu);
  setTimeout(()=>document.addEventListener('click',function h(e){if(!e.target.closest('#yt-qmenu')&&!e.target.closest('#yt-qbtn')){menu.remove();document.removeEventListener('click',h);}},),50);
};

function _ytEmbedFallback(videoId){
  if(_ytPlayerInst){try{_ytPlayerInst.destroy();}catch(e){}_ytPlayerInst=null;}
  const c=document.getElementById('yt-player-container');
  c.style.position='relative';
  c.innerHTML=`<iframe id="yt-embed-iframe"
    src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0"
    style="position:absolute;inset:0;width:100%;height:100%;border:none"
    allowfullscreen allow="autoplay;encrypted-media;picture-in-picture"></iframe>
    <button onclick="document.getElementById('yt-player-container')?.requestFullscreen?.()"
      style="position:absolute;bottom:8px;right:8px;z-index:10;background:rgba(0,0,0,.6);
             border:none;color:#fff;padding:6px 10px;border-radius:5px;cursor:pointer;font-size:14px"
      title="Fullscreen (F)">⛶</button>`;
  c.focus();
}

/* ═══ CHANNEL ══════════════════════════════════════════════════ */
async function ytChannel(cid){
  ytShowPage('channel-page');
  const [ch,vids]=await Promise.all([GET(`/youtube/channel?id=${cid}`),GET(`/youtube/channel/videos?channelId=${cid}`)]);
  const c=ch.items?.[0]||{};
  document.getElementById('yt-ch-header').innerHTML=`
    ${c.thumbnail?`<img class="ch-avatar" src="${esc(c.thumbnail)}">`:'<div class="ch-avatar"></div>'}
    <div class="ch-info"><h2>${esc(c.title||'')}</h2><p>${esc(c.subscribers||'')}</p></div>`;
  document.getElementById('yt-ch-videos').innerHTML=(vids.items||[]).map(ytCard).join('')||
    '<div class="empty"><div class="ico">📺</div><h3>No videos</h3></div>';
}

function ytSave(id,title,channel,thumb){
  POST('/youtube/favorites/add',{video_id:id,title,channel,thumbnail:thumb});
  toast('👍 Saved','ok');
}

/* ═══ PAGES ════════════════════════════════════════════════════ */
function ytPage(name){
  ytShowPage(name+'-page');
  if(name==='history') _ytGrid('/youtube/history','yt-history-grid',
    v=>ytCard({id:v.video_id,title:v.title,channel:v.channel,thumbnail:v.thumbnail}));
  if(name==='subs')    _ytSubs();
  if(name==='likes')   _ytGrid('/youtube/favorites','yt-likes-grid',
    v=>ytCard({id:v.video_id,title:v.title,channel:v.channel,thumbnail:v.thumbnail,duration:v.duration}));
}
async function _ytGrid(url,id,mapper){
  const d=await GET(url);
  document.getElementById(id).innerHTML=(d.items||[]).map(mapper).join('')||
    '<div class="empty"><div class="ico">📭</div><h3>Nothing here yet</h3></div>';
}
async function _ytSubs(){
  if(!_ytLoggedIn){
    document.getElementById('yt-subs-grid').innerHTML=`<div class="empty" style="grid-column:1/-1">
      <div class="ico">🔔</div><h3>Sign in for subscriptions</h3>
      <button class="btn-pri" style="margin-top:14px" onclick="ytLogin()">Sign in</button></div>`;
    return;
  }
  const d=await GET('/youtube/subscriptions');
  document.getElementById('yt-subs-grid').innerHTML=(d.items||[]).map(ytCard).join('')||
    '<div class="empty"><div class="ico">🔔</div><h3>No subscriptions</h3></div>';
}
function ytShowPage(name){
  document.querySelectorAll('.yt-page').forEach(p=>p.classList.add('hidden'));
  document.getElementById('yt-'+name)?.classList.remove('hidden');
}

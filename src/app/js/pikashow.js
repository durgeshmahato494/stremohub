/* pikashow.js — Pikashow-exact streaming module
   Multiple stream servers, Hindi dubbed, TMDB metadata, no account needed
*/
'use strict';

const TMDB_IMG = 'https://image.tmdb.org/t/p/';
const STREAM_SOURCES = {
  // ── Indian / Hindi-first sources ──────────────────────────────────────────
  vixsrc:     (id,mt,s,e,hi)=> mt==='tv'
    ? `https://vixsrc.to/tv/${id}/${s}/${e}${hi?'?lang=hi':''}`
    : `https://vixsrc.to/movie/${id}${hi?'?lang=hi':''}`,

  cinesrc:    (id,mt,s,e,hi)=> mt==='tv'
    ? `https://cinesrc.st/embed/tv/${id}/${s}/${e}${hi?'?hl=hi':''}`
    : `https://cinesrc.st/embed/movie/${id}${hi?'?hl=hi':''}`,

  // 8Stream — Indian API with Hindi/Tamil/Telugu/Bengali tracks
  '8stream':  (id,mt,s,e,hi)=> mt==='tv'
    ? `https://8stream.site/embed/tv/${id}/${s}/${e}${hi?'?lang=hindi':''}`
    : `https://8stream.site/embed/movie/${id}${hi?'?lang=hindi':''}`,

  // MultiEmbed — supports explicit Hindi language param
  multiembed: (id,mt,s,e,hi)=> mt==='tv'
    ? `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}${hi?'&lang=hi':''}`
    : `https://multiembed.mov/?video_id=${id}&tmdb=1${hi?'&lang=hi':''}`,

  // VidLink — primaryLang=hi forces Hindi audio
  vidlink:    (id,mt,s,e,hi)=> mt==='tv'
    ? `https://vidlink.pro/tv/${id}/${s}/${e}${hi?'?primaryLang=hi':''}`
    : `https://vidlink.pro/movie/${id}${hi?'?primaryLang=hi':''}`,

  // ── Global sources (good fallbacks) ────────────────────────────────────────
  vidsrc:     (id,mt,s,e,hi)=> mt==='tv'
    ? `https://vidsrc.to/embed/tv/${id}/${s}/${e}`
    : `https://vidsrc.to/embed/movie/${id}`,

  autoembed:  (id,mt,s,e,hi)=> mt==='tv'
    ? `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`
    : `https://player.autoembed.cc/embed/movie/${id}`,

  '2embed':   (id,mt,s,e,hi)=> mt==='tv'
    ? `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`
    : `https://www.2embed.cc/embed/${id}`,

  embedsu:    (id,mt,s,e,hi)=> mt==='tv'
    ? `https://embed.su/embed/tv/${id}/${s}/${e}`
    : `https://embed.su/embed/movie/${id}`,

  // ── Extra Indian sources ────────────────────────────────────────────────────
  // FSApi — Indian IMDB/TMDB based
  fsapi:      (id,mt,s,e,hi)=> mt==='tv'
    ? `https://fsapi.xyz/tv-tmdb/${id}-${s}-${e}${hi?'?audio=Hindi':''}`
    : `https://fsapi.xyz/movie-tmdb/${id}${hi?'?audio=Hindi':''}`,

  // GDrive player — popular in India, hosts many Bollywood/South
  gdrive:     (id,mt,s,e,hi)=> mt==='tv'
    ? `https://databasegdriveplayer.co/player.php?type=series&tmdb=${id}&season=${s}&episode=${e}`
    : `https://databasegdriveplayer.co/player.php?tmdb=${id}`,
};

// Indian sources tried first when Hindi mode is on
const HINDI_SOURCES = ['8stream','vixsrc','cinesrc','multiembed','vidlink'];
// Best sources for Bollywood originals (Hindi is original language)
const BOLLYWOOD_SOURCES = ['8stream','vixsrc','cinesrc','vidsrc'];

let _fp = { id:null, mt:null, s:1, ep:1, src:'8stream', hindi:false, title:'', seasons:[], eps:[] };
let _fpMode    = 'builtin';   // 'builtin' | 'embed'
let _fpPlayer  = null;        // SHPlayer instance for built-in mode

/* ── Mode switcher ──────────────────────────────────────────── */
function fpSetMode(mode) {
  _fpMode = mode;
  const shDiv    = document.getElementById('pp-shplayer');
  const ifrDiv   = document.getElementById('pp-iframe-wrap');
  const btnBuilt = document.getElementById('pp-btn-builtin');
  const btnEmbed = document.getElementById('pp-btn-embed');

  if (mode === 'builtin') {
    shDiv.style.display  = '';
    ifrDiv.style.display = 'none';
    btnBuilt?.classList.add('on');
    btnEmbed?.classList.remove('on');
    // Re-stream in built-in mode
    if (_fp.id) _fpStreamBuiltin();
  } else {
    shDiv.style.display  = 'none';
    ifrDiv.style.display = '';
    btnBuilt?.classList.remove('on');
    btnEmbed?.classList.add('on');
    // Load embed iframe
    _fpStreamEmbed();
  }
}

/* ─── INIT ──────────────────────────────────────────────────── */
async function pikaInit(){
  await pikaHome();
  pikaLoadGenres();
  _pikaWireSearchBar();
}

function _pikaWireSearchBar() {
  const input = document.getElementById('pika-q');
  if (!input || input._wired) return;
  input._wired = true;
  input.addEventListener('focus', () => {
    // Don't show if OSK just closed (prevents re-opening loop)
    if (!window._oskJustClosed) pikaShowSearchHist();
  });
  input.addEventListener('click',     () => { if (!window._oskJustClosed) pikaShowSearchHist(); });
  input.addEventListener('mousedown', () => { if (!window._oskJustClosed) pikaShowSearchHist(); });
  input.addEventListener('input',     () => {
    if (!input.value.trim()) pikaShowSearchHist();
    else pikaCloseSearchHist();
  });
}

/* ─── HOME ──────────────────────────────────────────────────── */
async function pikaHome(){
  pikaShowPage('home');
  const rows = document.getElementById('pika-rows');
  rows.innerHTML = '<div class="loading"><div class="spin"></div> Loading…</div>';
  const lang = _pikaLang();
  const lp   = lang ? `&with_original_language=${lang}` : '';

  const [trending, bollywood, hollywood, series, anime, topRated] = await Promise.all([
    GET('/sv/trending?media_type=all'+lp),
    GET('/sv/discover?media_type=movie&sort_by=popularity.desc&with_original_language=hi'),
    GET('/sv/discover?media_type=movie&sort_by=popularity.desc&with_original_language=en'),
    GET('/sv/discover?media_type=tv&sort_by=popularity.desc'+lp),
    GET('/sv/discover?media_type=tv&with_genres=16&sort_by=popularity.desc'),
    GET('/sv/discover?media_type=movie&sort_by=vote_average.desc'+lp),
  ]);

  if(trending.error||!trending.results){ rows.innerHTML='<div class="empty" style="grid-column:1/-1"><div class="ico">🔑</div><h3>Add TMDB API key in Settings</h3></div>'; return; }

  // Build hero
  const hero = (trending.results||[]).find(i=>i.backdrop_path);
  if(hero) _pikaHero(hero);

  rows.innerHTML =
    _pikaRow('🔥 Trending Now',          trending.results||[],  'all',   'wide') +
    _pikaRow('🎵 Bollywood',             bollywood.results||[], 'movie', 'poster') +
    _pikaRow('🇮🇳 Hindi Dubbed Hollywood',hollywood.results||[], 'movie', 'wide', true) +
    _pikaRow('📺 Popular Series',        series.results||[],    'tv',    'poster') +
    _pikaRow('⭐ Top Rated',             topRated.results||[],  'movie', 'poster') +
    _pikaRow('🌸 Anime',                 anime.results||[],     'tv',    'poster');

  // Auto-focus Hero "Watch Now" button if on Pikashow tab and focus is on sidebar/rail
  const active = document.activeElement;
  if (!active || active === document.body || active.closest('#sidebar') || active.closest('.pika-rail')) {
    const heroBtn = document.querySelector('#pika-hero .btn-pri');
    if (heroBtn) {
      setTimeout(() => window.irFocus?.(heroBtn), 150);
    }
  }
}

function _pikaLang(){ return document.getElementById('pika-lang')?.value||''; }

function _pikaHero(item){
  const el   = document.getElementById('pika-hero');
  const mt   = item.media_type||(item.title?'movie':'tv');
  const title= item.title||item.name||'';
  const year = (item.release_date||item.first_air_date||'').slice(0,4);
  const rating=item.vote_average?.toFixed(1)||'';
  const bg   = item.backdrop_path ? TMDB_IMG+'original'+item.backdrop_path : '';
  el.style.backgroundImage = bg?`url(${bg})`:'';
  el.innerHTML=`<div class="hero-content">
    <div class="hero-title">${esc(title)}</div>
    <div class="hero-meta">
      ${year?`<span>📅 ${esc(year)}</span>`:''}
      ${rating?`<span style="color:var(--gold)">★ ${esc(rating)}</span>`:''}
      <span style="background:var(--bg4);padding:1px 6px;border-radius:3px;font-size:11px">${mt.toUpperCase()}</span>
    </div>
    <div class="hero-btns">
      <button class="btn-pri" tabindex="0" onclick="fpPlay(${item.id},'${mt}')">▶ Watch Now</button>
      <button class="btn-pri" style="background:linear-gradient(135deg,#ff6b35,#f7931e)" tabindex="0" onclick="fpPlayHindi(${item.id},'${mt}')">🇮🇳 Hindi</button>
      <button class="btn-sec" onclick="pikaDetail(${item.id},'${mt}')">ℹ Info</button>
    </div>
  </div>`;
}

function _pikaRow(title, items, mt, style='poster', hindi=false){
  if(!items.length) return '';
  const cards = style==='wide'
    ? items.slice(0,15).map(i=>_pikaWide(i,mt,hindi)).join('')
    : items.slice(0,15).map(i=>_pikaPoster(i,mt,hindi)).join('');
  return `<div class="pika-row">
    <div class="pika-row-hdr"><span>${title}</span></div>
    <div class="pika-scroll">${cards}</div>
  </div>`;
}

/* ─── CARDS ─────────────────────────────────────────────────── */
function _pikaPoster(item, forceMt, hindi=false){
  const mt     = forceMt||item.media_type||(item.title?'movie':'tv');
  const title  = esc(item.title||item.name||'Unknown');
  const year   = (item.release_date||item.first_air_date||'').slice(0,4);
  const rating = item.vote_average?.toFixed(1)||'';
  const poster = item.poster_path ? TMDB_IMG+'w342'+item.poster_path : '';
  return `<div class="pcard" tabindex="0" onclick="pikaDetail(${item.id},'${mt}')" onkeydown="if(event.key==='Enter')pikaDetail(${item.id},'${mt}')">
    ${rating?`<div class="rating-badge">★ ${esc(rating)}</div>`:''}
    ${hindi?'<div class="hindi-badge">🇮🇳 HINDI</div>':''}
    ${poster?`<img src="${esc(poster)}" loading="lazy" alt="${title}">`:`<div style="aspect-ratio:2/3;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:32px">🎬</div>`}
    <div class="play-ov"><div class="play-circle">▶</div></div>
    <div class="pinfo"><div class="ptitle">${title}</div><div class="pyear">${esc(year)}</div></div>
  </div>`;
}

function _pikaWide(item, mt, hindi=false){
  const title = esc(item.title||item.name||'');
  const year  = (item.release_date||item.first_air_date||'').slice(0,4);
  const rating= item.vote_average?.toFixed(1)||'';
  const bg    = item.backdrop_path ? TMDB_IMG+'w500'+item.backdrop_path : '';
  return `<div class="wcard" tabindex="0" onclick="pikaDetail(${item.id},'${mt}')" onkeydown="if(event.key==='Enter')pikaDetail(${item.id},'${mt}')">
    ${hindi?`<div style="position:absolute;top:5px;left:5px;z-index:2" class="hindi-badge">🇮🇳 HINDI</div>`:''}
    ${bg?`<img src="${esc(bg)}" loading="lazy" alt="${title}">`:`<div style="aspect-ratio:16/9;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:26px">🎬</div>`}
    <div class="winfo"><div class="wtitle">${title}</div><div class="wmeta">${esc(year)} ${rating?'· ★ '+esc(rating):''}</div></div>
  </div>`;
}

/* ─── GENRES ────────────────────────────────────────────────── */
async function pikaLoadGenres(){
  const d = await GET('/sv/genres?media_type=movie');
  const bar = document.getElementById('pika-genre-bar');
  bar.innerHTML =
    `<div class="pill on" tabindex="0" onclick="pikaHome();document.querySelectorAll('#pika-genre-bar .pill').forEach(p=>p.classList.remove('on'));this.classList.add('on')">All</div>` +
    `<div class="pill" tabindex="0" onclick="pikaNav('hindi');this.classList.add('on')">🇮🇳 Hindi Dubbed</div>` +
    `<div class="pill" tabindex="0" onclick="pikaNav('bollywood');this.classList.add('on')">🎵 Bollywood</div>` +
    `<div class="pill" tabindex="0" onclick="pikaNav('anime');this.classList.add('on')">🌸 Anime</div>` +
    (d.genres||[]).map(g=>`<div class="pill" tabindex="0" onclick="pikaGenre(${g.id},'movie',this)">${esc(g.name)}</div>`).join('');
}

async function pikaGenre(id, mt, el){
  document.querySelectorAll('#pika-genre-bar .pill').forEach(p=>p.classList.remove('on'));
  el?.classList.add('on');
  pikaShowPage('home');
  const rows = document.getElementById('pika-rows');
  rows.innerHTML='<div class="loading"><div class="spin"></div></div>';
  const d = await GET(`/sv/discover?media_type=${mt}&with_genres=${id}`);
  rows.innerHTML=`<div class="pgrid">${(d.results||[]).map(i=>_pikaPoster(i,mt)).join('')}</div>`;
}

/* ─── SEARCH ────────────────────────────────────────────────── */
async function pikaSearch(){
  const q = document.getElementById('pika-q').value.trim();
  if(!q){ pikaShowSearchHist(); return; }
  pikaCloseSearchHist();
  POST('/sv/search/history/add', {query: q});
  pikaShowPage('search-page');
  document.getElementById('pika-sq').textContent = q;
  const grid = document.getElementById('pika-search-grid');
  grid.innerHTML='<div class="loading" style="grid-column:1/-1"><div class="spin"></div></div>';
  const d = await GET(`/sv/search?q=${encodeURIComponent(q)}`);
  grid.innerHTML = (d.results||[]).filter(i=>i.media_type!=='person').map(i=>_pikaPoster(i)).join('') ||
    '<div class="empty" style="grid-column:1/-1"><div class="ico">🔍</div><h3>No results</h3></div>';
}

/* ─── DISCOVER / NAV ────────────────────────────────────────── */
async function pikaNav(type){
  pikaShowPage('home');
  const rows = document.getElementById('pika-rows');
  rows.innerHTML='<div class="loading"><div class="spin"></div></div>';

  if(type==='movie'){
    const [pop,top,upcoming] = await Promise.all([
      GET('/sv/discover?media_type=movie&sort_by=popularity.desc'),
      GET('/sv/discover?media_type=movie&sort_by=vote_average.desc'),
      GET('/sv/trending?media_type=movie'),
    ]);
    rows.innerHTML = `
      <div class="section-tabs">
        <button class="stab on" onclick="pikaNav('movie')">🔥 Popular</button>
        <button class="stab" onclick="pikaNav('movie-top')">⭐ Top Rated</button>
        <button class="stab" onclick="pikaNav('movie-new')">🆕 New</button>
      </div>
      <div class="pgrid">${(pop.results||[]).map(i=>_pikaPoster(i,'movie')).join('')}</div>`;
  } else if(type==='tv'){
    const d = await GET('/sv/discover?media_type=tv&sort_by=popularity.desc');
    rows.innerHTML=`<div class="section-label">📺 Series</div><div class="pgrid">${(d.results||[]).map(i=>_pikaPoster(i,'tv')).join('')}</div>`;
  } else if(type==='hindi'){
    const [hw,bw] = await Promise.all([
      GET('/sv/discover?media_type=movie&sort_by=popularity.desc&with_original_language=en'),
      GET('/sv/discover?media_type=movie&sort_by=popularity.desc&with_original_language=hi'),
    ]);
    rows.innerHTML =
      _pikaRow('🇮🇳 Hindi Dubbed Hollywood', hw.results||[], 'movie','wide',true) +
      _pikaRow('🎵 Bollywood',               bw.results||[], 'movie','poster');
  } else if(type==='bollywood'){
    const [m,s] = await Promise.all([
      GET('/sv/discover?media_type=movie&sort_by=popularity.desc&with_original_language=hi'),
      GET('/sv/discover?media_type=tv&sort_by=popularity.desc&with_original_language=hi'),
    ]);
    rows.innerHTML =
      _pikaRow('🎵 Bollywood Movies', m.results||[], 'movie','wide') +
      _pikaRow('📺 Hindi Series',    s.results||[], 'tv','poster');
  } else if(type==='anime'){
    const [p,t,m] = await Promise.all([
      GET('/sv/discover?media_type=tv&with_genres=16&sort_by=popularity.desc'),
      GET('/sv/discover?media_type=tv&with_genres=16&sort_by=vote_average.desc'),
      GET('/sv/discover?media_type=movie&with_genres=16&sort_by=popularity.desc'),
    ]);
    rows.innerHTML =
      _pikaRow('🌸 Popular Anime',  p.results||[], 'tv','poster') +
      _pikaRow('⭐ Top Rated Anime',t.results||[], 'tv','poster') +
      _pikaRow('🎥 Anime Movies',   m.results||[], 'movie','poster');
  }
}

/* ─── DETAIL ────────────────────────────────────────────────── */
async function pikaDetail(id, mt){
  pikaShowPage('detail-page');
  const el = document.getElementById('pika-detail');
  el.innerHTML='<div class="loading"><div class="spin"></div> Loading…</div>';
  const endpoint = mt==='tv'?'tv':'movie';
  const d = await GET(`/sv/${endpoint}?id=${id}`);
  if(!d.id){ el.innerHTML='<div class="empty"><div class="ico">⚠️</div><h3>Not found</h3></div>'; return; }

  const title    = d.title||d.name||'';
  const year     = (d.release_date||d.first_air_date||'').slice(0,4);
  const rating   = d.vote_average?.toFixed(1)||'';
  const runtime  = d.runtime?`${Math.floor(d.runtime/60)}h ${d.runtime%60}m`:(d.episode_run_time?.[0]?d.episode_run_time[0]+'m/ep':'');
  const genres   = (d.genres||[]).map(g=>g.name).join(', ');
  const backdrop = d.backdrop_path ? TMDB_IMG+'w1280'+d.backdrop_path : '';
  const poster   = d.poster_path   ? TMDB_IMG+'w342' +d.poster_path  : '';
  const cast     = (d.credits?.cast||[]).slice(0,12);
  const similar  = [...(d.recommendations?.results||[]),...(d.similar?.results||[])].slice(0,12);
  const trailer  = (d.videos?.results||[]).find(v=>v.type==='Trailer'&&v.site==='YouTube');
  const seasons  = mt==='tv'?(d.seasons||[]).filter(s=>s.season_number>0):[];
  const hasHindi = (d.spoken_languages||[]).some(l=>l.iso_639_1==='hi') || d.original_language==='en';

  const srcPills = Object.keys(STREAM_SOURCES).map(src=>
    `<div class="src-pill ${src==='vidsrc'?'on':''}" id="sp-${src}" onclick="pikaSetSrc('${src}')">
       <span class="src-dot"></span>${src}
     </div>`
  ).join('');

  el.innerHTML=`
    ${backdrop?`<div class="detail-backdrop" style="background-image:url(${esc(backdrop)})"></div>`:'<div style="height:60px"></div>'}
    <div class="detail-body">
      <div class="detail-poster">${poster?`<img src="${esc(poster)}" alt="${esc(title)}">`:'<div style="aspect-ratio:2/3;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:40px">🎬</div>'}</div>
      <div class="detail-info">
        <h1>${esc(title)}</h1>
        <div class="detail-tags">
          ${year?`<span class="tag">📅 ${esc(year)}</span>`:''}
          ${rating?`<span class="tag" style="color:var(--gold)">★ ${esc(rating)}/10</span>`:''}
          ${runtime?`<span class="tag">⏱ ${esc(runtime)}</span>`:''}
          <span class="tag" style="background:var(--bg3)">HD</span>
          ${mt==='tv'&&d.number_of_seasons?`<span class="tag">${d.number_of_seasons} Season${d.number_of_seasons>1?'s':''}</span>`:''}
          ${genres?`<span class="tag">${esc(genres)}</span>`:''}
        </div>
        <p class="detail-overview">${esc(d.overview||'')}</p>
        <div class="detail-actions">
          <button class="btn-pri" style="font-size:14px;padding:10px 22px" onclick="fpPlay(${id},'${mt}')">▶ Watch Now</button>
          ${hasHindi?`<button class="btn-pri" style="background:linear-gradient(135deg,#ff6b35,#f7931e);font-size:14px;padding:10px 22px" onclick="fpPlayHindi(${id},'${mt}')">🇮🇳 Hindi</button>`:''}
          ${trailer?`<button class="btn-sec" onclick="pikaTrailer('${esc(trailer.key)}')">🎞 Trailer</button>`:''}
          <button class="btn-sec" onclick="pikaSaveFav({id:${id},title:'${esc(title.replace(/'/g,"\\'"))}',poster_path:'${d.poster_path||''}',media_type:'${mt}'})">❤️ My List</button>
        </div>
        <div style="margin-top:10px">
          <div style="font-size:11px;color:var(--t3);margin-bottom:7px;font-weight:700;letter-spacing:.4px">STREAM SOURCES</div>
          <div class="src-pills">${srcPills}</div>
        </div>
        ${seasons.length?`<div style="margin-top:8px">
          <div style="font-size:11px;color:var(--t3);margin-bottom:7px;font-weight:700;letter-spacing:.4px">SEASONS</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${seasons.map(s=>`<div style="display:flex;gap:4px">
              <div class="src-pill" onclick="fpPlay(${id},'tv',${s.season_number},1)">S${s.season_number} <span style="color:var(--t3);font-size:10px">${s.episode_count}ep</span></div>
              <div class="src-pill" style="padding:4px 7px" onclick="fpPlayHindi(${id},'tv',${s.season_number},1)" title="Hindi">🇮🇳</div>
            </div>`).join('')}
          </div>
        </div>`:''}
      </div>
    </div>
    ${cast.length?`<div class="section-label" style="padding-left:22px">🎭 Cast</div>
      <div class="cast-row">${cast.map(a=>{const ph=a.profile_path?TMDB_IMG+'w185'+a.profile_path:'';return`<div class="cast-card"><img src="${esc(ph||'')}" onerror="this.style.display='none'" loading="lazy"><div class="cname">${esc(a.name)}</div><div class="cchar">${esc(a.character||'')}</div></div>`;}).join('')}</div>`:''}
    ${similar.length?`<div class="section-label" style="padding-left:22px">Similar</div>
      <div class="pika-scroll" style="padding-left:22px">${similar.map(i=>_pikaPoster(i,mt)).join('')}</div>`:''}`;
}

function pikaSetSrc(src){
  _fp.src = src;
  document.querySelectorAll('[id^="sp-"]').forEach(p=>p.classList.toggle('on',p.id==='sp-'+src));
}

/* ─── PLAYER ────────────────────────────────────────────────── */
async function fpPlay(id, mt, s=1, ep=1){
  _fp.hindi = false;
  _fp.src   = document.getElementById('pika-src').value || 'vidsrc';
  await _fpOpen(id, mt, s, ep);
}

async function fpPlayHindi(id, mt, s=1, ep=1){
  _fp.hindi = true;

  // For Hindi mode: try to find the Hindi-dubbed version on TMDB
  // then use Indian sources that specifically host Hindi dubs
  try {
    const info = await GET(`/sv/${mt==='tv'?'tv':'movie'}?id=${id}`);
    const origLang = info.original_language || '';
    if (origLang !== 'hi') {
      // Not originally Hindi — need to find Hindi dubbed source
      // Indian sources with Hindi dub support (tried in order):
      const hindiSrcOrder = ['8stream','vixsrc','cinesrc','multiembed','vidlink','fsapi','gdrive'];
      _fp.src = hindiSrcOrder[0];
    } else {
      // Already Hindi original — any Indian source works great
      _fp.src = '8stream';
    }
  } catch(e) {
    _fp.src = '8stream';
  }

  await _fpOpen(id, mt, s, ep);
}

async function _fpOpen(id, mt, s, ep){
  _fp.id=id; _fp.mt=mt; _fp.s=s; _fp.ep=ep;
  const _pp = document.getElementById('pika-player');
  _pp.classList.remove('hidden');
  _pp.style.display = 'flex';
  document.body.style.overflow='hidden';
  document.getElementById('fp-src').value = _fp.src;
  _fpUpdateHindiBtn();
  document.getElementById('fp-loading').style.display='flex';
  document.getElementById('fp-iframe').src='about:blank';

  // Load season/episode sidebar for TV
  if (mt==='tv') {
    await _fpLoadEps(id, s);
  } else {
    const sw=document.getElementById('pp-season-wrap');
    const ew=document.getElementById('pp-ep-wrap');
    if(sw) sw.classList.add('hidden');
    if(ew) ew.classList.add('hidden');
  }

  // Start streaming — try built-in first
  _fpStreamBuiltin();
  POST('/sv/history/update',{content_id:String(id),source_id:0,type:mt,progress:0,duration:0});
  
  // Focus the player modal topbar or back button
  if (window.irFocusFirst) window.irFocusFirst(document.getElementById('pika-player'));
}

/* ── Built-in player: extract direct stream via yt-dlp ─────── */
async function _fpStreamBuiltin() {
  const {id, mt, s, ep, src, hindi} = _fp;
  const builder = STREAM_SOURCES[src]||STREAM_SOURCES.vidsrc;
  const embedUrl = builder(id, mt, s, ep, hindi);

  // Show loading state
  const loadEl = document.getElementById('fp-loading');
  const loadMsg= document.getElementById('fp-load-msg');
  if(loadEl) loadEl.style.display='flex';
  if(loadMsg) loadMsg.textContent = `⚡ Extracting stream from ${src}…`;

  // Show SHPlayer area with loading
  document.getElementById('pp-shplayer').style.display = '';
  document.getElementById('pp-iframe-wrap').style.display = 'none';

  // Init SHPlayer
  if (!_fpPlayer) {
    _fpPlayer = new SHPlayer('pp-shplayer');
    _fpPlayer.onFormatError = () => {
      toast('⚠️ Built-in failed — switching to embed…');
      fpSetMode('embed');
    };
    _fpPlayer.setChannelName(_fp.title||'');
  }
  _fpPlayer._showOverlay(`Extracting from ${src}…`);

  // Call server to extract direct stream URL via yt-dlp
  const result = await GET(`/sv/extract?url=${encodeURIComponent(embedUrl)}`);

  if (result.streams?.length) {
    if(loadEl) loadEl.style.display='none';
    // Pick best stream
    const combined = result.streams.filter(s=>s.hasVideo&&s.hasAudio);
    const chosen   = combined[0] || result.streams[0];
    _fpPlayer.setChannelName(_fp.title||'');
    _fpPlayer.loadDirect(chosen.url);
    // Build quality options if multiple
    if (combined.length > 1) {
      _fpPlayer.setQualityOptions(combined.map(s=>({
        label: s.quality || (s.height?s.height+'p':'HD'),
        url: s.url
      })));
    }
    toast(`✅ Stream extracted from ${src}`, 'ok');
  } else {
    // Extraction failed — auto-fall to embed
    console.warn('Extract failed:', result.error);
    if(loadMsg) loadMsg.textContent='Built-in extraction failed — loading embed…';
    setTimeout(()=>fpSetMode('embed'), 500);
  }
}

/* ── Embed fallback ─────────────────────────────────────────── */
function _fpStreamEmbed() {
  _fpStream();  // original iframe-based stream
}

async function _fpLoadEps(id, s){
  const [d, tvInfo] = await Promise.all([GET(`/sv/season?tv_id=${id}&season=${s}`), GET(`/sv/tv?id=${id}`)]);
  const eps = d.episodes||[]; const seasons=(tvInfo.seasons||[]).filter(s=>s.season_number>0);
  _fp.eps=eps; _fp.seasons=seasons; _fp.title=tvInfo.name||'';
  document.getElementById('fp-season').innerHTML=seasons.map(ss=>`<option value="${ss.season_number}" ${ss.season_number===s?'selected':''}> Season ${ss.season_number}</option>`).join('');
  document.getElementById('fp-ep').innerHTML=eps.map(e=>`<option value="${e.episode_number}" ${e.episode_number===_fp.ep?'selected':''}>E${e.episode_number}${e.name?' · '+e.name.slice(0,25):''}</option>`).join('');
  document.getElementById('fp-ep-grid').innerHTML=`<div class="ep-title">Season ${s} — ${eps.length} Episodes</div>
    <div class="ep-btns">${eps.map(e=>`<button class="ep-btn ${e.episode_number===_fp.ep?'on':''}" id="ep-${e.episode_number}" onclick="fpEp(${e.episode_number})">E${e.episode_number}</button>`).join('')}</div>`;
}

const HINDI_SRC_ORDER = ['8stream','vixsrc','cinesrc','multiembed','vidlink','fsapi','gdrive','vidsrc','autoembed'];

function _fpStream(){
  const {id,mt,s,ep,src,hindi} = _fp;
  const builder = STREAM_SOURCES[src]||STREAM_SOURCES.vidsrc;
  const url = builder(id,mt,s,ep,hindi);
  const label = hindi?'🇮🇳 ':'';

  // Update title
  const titleEl = document.getElementById('fp-title');
  const epInfo  = document.getElementById('pp-ep-info');
  if(titleEl) titleEl.textContent = `${label}${_fp.title||'Now Playing'}`;
  if(epInfo)  epInfo.textContent  = mt==='tv'?`Season ${s} · Episode ${ep}`:'';

  // Update source buttons
  document.querySelectorAll('.pp-src-btn').forEach(b =>
    b.classList.toggle('on', b.dataset.src===src)
  );

  // Hindi button state
  const hindiBtn = document.getElementById('fp-hindi');
  if(hindiBtn) hindiBtn.classList.toggle('on', hindi);

  const iframe  = document.getElementById('fp-iframe');
  const loading = document.getElementById('fp-loading');
  if(loading) loading.style.display='flex';

  // Hide hint
  const hint = document.getElementById('fp-hindi-hint');
  if(hint) hint.classList.add('hidden');

  iframe.onload = () => {
    if(loading) loading.style.display='none';
    if(hindi){
      clearTimeout(window._hindiHintTimer);
      window._hindiHintTimer = setTimeout(()=>{
        const hint = document.getElementById('fp-hindi-hint');
        if(hint) hint.classList.remove('hidden');
      }, 5000);
    }
  };
  iframe.src = url;
}

function fpNextHindiSrc(){
  const hint = document.getElementById('fp-hindi-hint');
  if(hint) hint.classList.add('hidden');
  const cur = _fp.src;
  const idx = HINDI_SRC_ORDER.indexOf(cur);
  const next = HINDI_SRC_ORDER[(idx+1)%HINDI_SRC_ORDER.length];
  fpSwitchSrc(next);
  toast(`🇮🇳 Trying ${next}…`);
}

function fpNextHindiSrc(){
  document.getElementById('fp-hindi-hint')?.remove();
  const cur = _fp.src;
  const idx = HINDI_SRC_ORDER.indexOf(cur);
  const next = HINDI_SRC_ORDER[(idx+1) % HINDI_SRC_ORDER.length];
  _fp.src = next;
  document.getElementById('fp-src').value = next;
  document.querySelectorAll('[id^="sp-"]').forEach(p=>p.classList.toggle('on',p.id==='sp-'+next));
  toast(`🇮🇳 Trying ${next} for Hindi…`);
  _fpStream();
}

function fpEp(ep){
  _fp.ep=ep;
  const sel=document.getElementById('fp-ep');
  if(sel) sel.value=ep;
  // old ep-btn
  document.querySelectorAll('.ep-btn').forEach(b=>b.classList.remove('on'));
  const oldBtn=document.getElementById('ep-'+ep);
  if(oldBtn){oldBtn.classList.add('on');oldBtn.scrollIntoView({behavior:'smooth',block:'nearest'});}
  // new pp-ep-btn
  document.querySelectorAll('.pp-ep-btn').forEach(b=>b.classList.remove('on'));
  const newBtn=document.getElementById('pp-ep-'+ep);
  if(newBtn){newBtn.classList.add('on');newBtn.scrollIntoView({behavior:'smooth',block:'nearest'});}
  _fpStream();
}

function fpChangeSeason(optCtx){
  const s=parseInt((optCtx||document.getElementById('fp-season'))?.value||_fp.s);
  document.querySelectorAll('.pp-season-btn').forEach(b=>b.classList.toggle('on',parseInt(b.textContent.slice(1))===s));
  _fp.s=s; _fp.ep=1;
  _fpLoadEps(_fp.id,s).then(_fpStream);
}

function fpChangeEp(){fpEp(parseInt(document.getElementById('fp-ep').value));}

function fpSwitchSrc(src){
  _fp.src=src;
  const sel=document.getElementById('pika-src');
  if(sel) sel.value=src;
  document.querySelectorAll('[id^="sp-"]').forEach(p=>p.classList.toggle('on',p.id==='sp-'+src));
  document.querySelectorAll('.pp-src-btn').forEach(b=>b.classList.toggle('on',b.dataset.src===src));
  // Re-extract or re-embed depending on current mode
  if (_fpMode==='builtin') _fpStreamBuiltin();
  else _fpStream();
}

function fpToggleHindi(){
  _fp.hindi=!_fp.hindi;
  if(_fp.hindi){ _fp.src=HINDI_SOURCES[0]; document.getElementById('fp-src').value=_fp.src; }
  _fpUpdateHindiBtn(); _fpStream();
  toast(_fp.hindi?'🇮🇳 Hindi ON':'Hindi OFF');
}

function _fpUpdateHindiBtn(){
  const btn=document.getElementById('fp-hindi');
  btn.className='fp-btn '+(_fp.hindi?'hindi-on':'');
  btn.textContent=_fp.hindi?'🇮🇳 Hindi ON':'🇮🇳 Hindi';
}

function fpFullscreen(){
  const m=document.getElementById('pika-player');
  if(!document.fullscreenElement)m.requestFullscreen?.();
  else document.exitFullscreen?.();
}

function fpClose(){
  const player = document.getElementById('pika-player');
  player.classList.add('hidden');
  player.style.display = 'none';           // override inline style set by _fpOpen
  const iframe = document.getElementById('fp-iframe');
  if(iframe) iframe.src='about:blank';
  if (window.irFocusFirst) window.irFocusFirst(document.getElementById('pika-detail-page'));
  _fp.hindi=false;
  document.body.style.overflow='';
  const sw=document.getElementById('pp-season-wrap');
  const ew=document.getElementById('pp-ep-wrap');
  if(sw) sw.classList.add('hidden');
  if(ew) ew.classList.add('hidden');
  clearTimeout(window._hindiHintTimer);
  const hint=document.getElementById('fp-hindi-hint');
  if(hint) hint.classList.add('hidden');
}

function pikaTrailer(key){
  const d=document.createElement('div'); d.className='modal';
  d.innerHTML=`<div style="background:#000;border-radius:10px;overflow:hidden;width:min(840px,95vw)">
    <div style="display:flex;justify-content:flex-end;padding:6px">
      <button class="fp-btn fp-close" onclick="this.closest('.modal').remove()">✕</button>
    </div>
    <iframe width="100%" style="aspect-ratio:16/9;display:block" src="https://www.youtube.com/embed/${key}?autoplay=1" allowfullscreen allow="autoplay;encrypted-media"></iframe>
  </div>`;
  document.body.appendChild(d);
}

/* ─── FAV / HISTORY / MY LIST ───────────────────────────────── */
async function pikaSaveFav(item){
  const mt=item.media_type||(item.title?'movie':'tv');
  const d=await POST('/sv/favorites/toggle',{content_id:String(item.id),source_id:0,title:item.title||item.name||'',poster:item.poster_path||'',type:mt});
  toast(d.favorited?'❤️ Added to My List':'Removed','ok');
}

async function _pikaLoadGrid(url,gridId,mapper){
  const d=await GET(url);
  document.getElementById(gridId).innerHTML=(d.items||[]).map(mapper).join('')||
    '<div class="empty" style="grid-column:1/-1"><div class="ico">📭</div><h3>Nothing here</h3></div>';
}

/* ─── PAGE NAV ──────────────────────────────────────────────── */

/* ─── Pikashow search history ──────────────────────────────── */
async function pikaShowSearchHist() {
  const old = document.getElementById('pika-sh');
  if (old) old.remove();

  const d     = await GET('/sv/search/history');
  const items = d.items || [];

  const box = document.createElement('div');
  box.id    = 'pika-sh';
  box.style.cssText = `
    position:absolute; top:calc(100% + 4px); left:0; right:0; z-index:999;
    background:#1e1e1e; border:1px solid #333; border-radius:10px;
    box-shadow:0 8px 28px rgba(0,0,0,.7); overflow:hidden;
    max-height:320px; overflow-y:auto;
  `;

  if (!items.length) {
    box.innerHTML = `<div style="padding:14px;text-align:center;color:#666;font-size:12px">
      🕐 No recent searches yet — start searching!
    </div>`;
  } else {
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;
      padding:8px 12px 6px;border-bottom:1px solid #2a2a2a">
      <span style="font-size:11px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.4px">Recent Searches</span>
    </div>`;
    for (const item of items) {
      const q  = item.query || '';
      const qj = JSON.stringify(q);
      html += `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;
          cursor:pointer;border-bottom:1px solid #1a1a1a;transition:.12s"
        onmouseover="this.style.background='#272727'" onmouseout="this.style.background=''"
        class="hist-item" data-q="${esc(q).replace(/"/g,'&quot;')}" onclick="pikaHistPick(this.dataset.q)">
        <span style="color:#555;font-size:14px">🕐</span>
        <span style="flex:1;font-size:13px;color:#f1f1f1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(q)}</span>
        <button onclick="event.stopPropagation();pikaDelHist(${qj},this.closest('div'))"
          style="background:none;border:none;color:#555;cursor:pointer;font-size:13px;padding:2px 6px"
          onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#555'">✕</button>
      </div>`;
    }
    box.innerHTML = html;
  }

  const sb = document.getElementById('pika-search-box');
  if (!sb) return;
  const rect = sb.getBoundingClientRect();
  Object.assign(box.style, {
    position: 'fixed',
    top:  (rect.bottom + 4) + 'px',
    left: rect.left + 'px',
    width: rect.width + 'px',
    zIndex: '6000',
  });
  document.body.appendChild(box);

  // Close when clicking outside
  setTimeout(() => {
    function closeHist(e) {
      const sh = document.getElementById('pika-sh');
      if (!sh) { document.removeEventListener('click', closeHist); return; }
      if (!sh.contains(e.target) && e.target.id !== 'pika-q') {
        pikaCloseSearchHist();
        document.removeEventListener('click', closeHist);
      }
    }
    document.addEventListener('click', closeHist);
  }, 0);
}

function pikaHistPick(q) {
  const input = document.getElementById('pika-q');
  if (!q || !input) return;
  input.value = q;
  pikaCloseSearchHist();
  pikaSearch();
}

function pikaCloseSearchHist() {
  document.getElementById('pika-sh')?.remove();
}
async function pikaClearHist() { await POST('/sv/search/history/delete', {}); pikaCloseSearchHist(); toast('History cleared'); }
async function pikaDelHist(q, row) { await POST('/sv/search/history/delete', {query: q}); row?.remove(); }

function pikaShowPage(name){
  document.querySelectorAll('.pika-page').forEach(p=>p.classList.add('hidden'));
  document.getElementById('pika-'+name)?.classList.remove('hidden');
}

function pikaPage(name){
  pikaShowPage(name+'-page');
  if(name==='mylist') _pikaLoadGrid('/sv/favorites','pika-mylist-grid',i=>{const p=i.poster?TMDB_IMG+'w342'+i.poster:'';return`<div class="pcard" onclick="pikaDetail('${i.content_id}','${i.type||'movie'}')">${p?`<img src="${esc(p)}" loading="lazy">`:'<div style="aspect-ratio:2/3;background:var(--bg3);display:flex;align-items:center;justify-content:center">🎬</div>'}<div class="play-ov"><div class="play-circle">▶</div></div><div class="pinfo"><div class="ptitle">${esc(i.title||'')}</div></div></div>`;});
  if(name==='continue') _pikaLoadGrid('/sv/history','pika-continue-grid',i=>{const p=i.poster?TMDB_IMG+'w342'+i.poster:'';return`<div class="pcard" onclick="fpPlay('${i.content_id}','${i.type||'movie'}')">${p?`<img src="${esc(p)}" loading="lazy">`:'<div style="aspect-ratio:2/3;background:var(--bg3);display:flex;align-items:center;justify-content:center">🎬</div>'}<div class="play-ov"><div class="play-circle">▶</div></div><div class="pinfo"><div class="ptitle">${esc(i.title||'')}</div><div class="pyear">Resume ▶</div></div></div>`;});
  if (window.irFocusFirst) window.irFocusFirst(document.getElementById(`pika-${name}-page`));
}

// ESC closes player
document.addEventListener('keydown',e=>{
  if(e.key==='Escape') fpClose();
});

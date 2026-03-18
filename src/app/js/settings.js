/* settings.js — v3 */
'use strict';

async function settingsInit(){
  const [cfg, status] = await Promise.all([GET('/config'), GET('/api/status')]);
  const yt = cfg.youtube||{};
  document.getElementById('cfg-yt-cid').value = yt.client_id||'';
  document.getElementById('cfg-yt-sec').value  = '';
  document.getElementById('cfg-tmdb').value    = cfg.streamvault?.tmdb_api_key||'';

  const src = status?.tmdb?.source||'built-in';
  const okEl = document.getElementById('tmdb-ok');
  if(okEl) okEl.textContent = src==='user' ? '✅ Your TMDB key is active' : '✅ Built-in TMDB API active';

  // SponsorBlock
  const sb = cfg.sponsorblock||{};
  const sbEnabled = document.getElementById('sb-enabled');
  if(sbEnabled) sbEnabled.checked = sb.enabled !== false;
  const cats = sb.categories||['sponsor','intro','outro','selfpromo'];
  document.querySelectorAll('#sb-cats input[type=checkbox]').forEach(cb=>{
    cb.checked = cats.includes(cb.value);
  });

  await _settingsLoadPlaylists();
}

async function saveCfgYt(){
  const cid = document.getElementById('cfg-yt-cid').value.trim();
  const sec = document.getElementById('cfg-yt-sec').value.trim();
  const cfg = await GET('/config');
  cfg.youtube = cfg.youtube||{};
  if(cid) cfg.youtube.client_id     = cid;
  if(sec) cfg.youtube.client_secret = sec;
  await POST('/config/update', cfg);
  toast('YouTube config saved','ok');
}

async function saveCfgTmdb(){
  const key = document.getElementById('cfg-tmdb').value.trim();
  const cfg = await GET('/config');
  cfg.streamvault = cfg.streamvault||{};
  cfg.streamvault.tmdb_api_key = key;
  await POST('/config/update', cfg);
  toast(key?'TMDB key saved':'Reverted to built-in','ok');
  settingsInit();
}

async function saveSponsorBlock(){
  const enabled = document.getElementById('sb-enabled').checked;
  const cats = [...document.querySelectorAll('#sb-cats input[type=checkbox]:checked')].map(c=>c.value);
  const cfg = await GET('/config');
  cfg.sponsorblock = { enabled, categories: cats };
  await POST('/config/update', cfg);
  // Update in-memory youtube.js vars
  if(typeof _sbEnabled!=='undefined'){ window._sbEnabled=enabled; window._sbCategories=cats; }
  toast('SponsorBlock saved','ok');
}

async function _settingsLoadPlaylists(){
  const d   = await GET('/iptv/playlists');
  const el  = document.getElementById('pvr-pl-mgmt');
  const pls = d.playlists||[];
  if(!pls.length){ el.innerHTML='<p style="color:var(--t3);font-size:12px">No playlists yet.</p>'; return; }
  el.innerHTML = pls.map(p=>`
    <div class="pvr-pl-item">
      <div style="min-width:0">
        <div class="pl-n">${esc(p.name||'')}</div>
        <div class="pl-u">${esc(p.url||'')}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:2px">${p.channel_count>0?'✅ '+p.channel_count+' channels':'⏳ Not loaded'}</div>
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button class="btn-sec" style="font-size:11px;padding:3px 8px" onclick="pvrRefresh(${p.id})">🔄</button>
        <button class="btn-sec" style="font-size:11px;padding:3px 8px;color:#ef4444" onclick="pvrDelete(${p.id},'${esc(p.name.replace(/'/g,"\\'"))}')">🗑</button>
      </div>
    </div>`).join('');
}

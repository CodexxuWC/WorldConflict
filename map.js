/* map.js — logique complète pour map.html
   - attend que Leaflet soit chargé (Leaflet script est inclus avant ce fichier, both deferred)
   - utilise WC.apiFetch si présent sinon fallback fetch wrapper
*/

(function(){
  // ---- helpers ----
  const apiFetch = async (url, opts = {}) => {
    if (window.WC && typeof WC.apiFetch === 'function') {
      try { return await WC.apiFetch(url, opts); } catch(e){ /* fallthrough */ }
    }
    opts = Object.assign({ credentials:'same-origin' }, opts);
    opts.headers = opts.headers || {};
    if (!opts.headers['Content-Type'] && !(opts.body instanceof FormData)) opts.headers['Content-Type'] = 'application/json';
    try {
      const r = await fetch(url, opts);
      const ct = (r.headers.get('content-type') || '');
      const data = ct.includes('application/json') ? await r.json() : await r.text();
      return { ok: r.ok, status: r.status, data };
    } catch (err) { return { ok:false, status:0, error: err.message }; }
  };

  const el = id => document.getElementById(id);
  const showToast = (txt, t=2800) => {
    const toast = el('toast');
    if(!toast) return;
    toast.textContent = txt;
    toast.hidden = false;
    setTimeout(()=> toast.hidden = true, t);
  };

  // ---- DOM refs ----
  const mapEl = el('map');
  const countryListEl = el('countryList');
  const countryDetailsEl = el('countryDetails');
  const joinBtn = el('joinBtn');
  const actionsBtn = el('actionsBtn');
  const searchInput = el('searchInput');
  const searchBtn = el('searchBtn');
  const refreshBtn = el('refreshBtn');
  const zoomIn = el('zoomIn');
  const zoomOut = el('zoomOut');
  const fitAll = el('fitAll');

  // ---- state ----
  let map = null;
  let geojsonLayer = null;
  let countries = [];
  let selectedCountry = null;
  let userSession = null;

  // ---- session ----
  async function fetchSession(){
    try {
      const r = await apiFetch('/api/session', { method: 'GET' });
      if (r && r.ok && r.data) { userSession = r.data; return userSession; }
    } catch(e) { /* noop */ }
    userSession = null;
    return null;
  }

  // ---- map init ----
  function initMap(){
    // safety: Leaflet must be available
    if (typeof L === 'undefined') {
      console.error('Leaflet non chargé');
      return;
    }
    map = L.map(mapEl, { worldCopyJump:true, minZoom:2, maxZoom:8 }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 8
    }).addTo(map);
  }

  // ---- geo styling ----
  function styleFeature(feature){
    const owner = feature?.properties?.owner || null;
    const myCountryId = userSession?.rp?.country_id || null;
    if (!owner) return { weight:1, opacity:0.8, color:'#0b1220', fillColor:'#1f2937', fillOpacity:0.6 };
    if (owner === myCountryId) return { weight:1, opacity:0.9, color:'#071021', fillColor:'#1657a3', fillOpacity:0.75 };
    return { weight:1, opacity:0.8, color:'#071021', fillColor:'#7c3aed', fillOpacity:0.6 };
  }

  function onEachFeature(feature, layer){
    layer.on({
      click: () => selectCountry(feature, layer),
      mouseover: e => e.target.setStyle({ weight:2 }),
      mouseout: e => geojsonLayer && geojsonLayer.resetStyle(e.target)
    });
    const name = feature.properties?.name || feature.properties?.name_en || '—';
    layer.bindTooltip(name, { sticky:true });
  }

  // ---- selection ----
  async function selectCountry(feature, layer){
    selectedCountry = feature;
    renderCountryDetails(feature);
    try { const bounds = layer.getBounds(); map.fitBounds(bounds.pad(0.5), { maxZoom:5, animate:true }); } catch(e){}
    await updateActionButtons();
    // fetch members count and update details
    fetchMembersCount(feature.properties.id).then(cnt => {
      const p = feature.properties;
      countryDetailsEl.innerHTML = `<strong>${p.name || p.name_en || '—'}</strong>
        <div class="mini" style="margin-top:6px">ID: ${p.id || '—'}</div>
        <div class="mini" style="margin-top:6px">Propriétaire: ${p.owner || 'Aucun'}</div>
        <div class="mini" style="margin-top:6px">Membres: ${cnt}</div>`;
    }).catch(()=>{});
  }

  function renderCountryDetails(feature){
    const p = feature.properties || {};
    countryDetailsEl.innerHTML = `<strong>${p.name || p.name_en || '—'}</strong>
      <div class="mini" style="margin-top:6px">ID: ${p.id || '—'}</div>
      <div class="mini" style="margin-top:6px">Propriétaire: ${p.owner || 'Aucun'}</div>
      <div class="mini" style="margin-top:6px">Membres: —</div>`;
  }

  async function fetchMembersCount(countryId){
    if (!countryId) return '—';
    try {
      const r = await apiFetch(`/api/countries/${encodeURIComponent(countryId)}/members-count`, { method: 'GET' });
      if (r && r.ok && r.data) return r.data.count ?? r.data ?? '—';
    } catch(e){}
    return '—';
  }

  async function updateActionButtons(){
    await fetchSession();
    joinBtn.disabled = true;
    actionsBtn.disabled = true;
    if (!selectedCountry) return;
    const owner = selectedCountry.properties.owner || null;
    if (!owner) {
      joinBtn.disabled = false;
      actionsBtn.disabled = false;
      return;
    }
    const isLeader = userSession?.rp && userSession.rp.role === 'leader' && userSession.rp.country_id === owner;
    if (isLeader) {
      actionsBtn.disabled = false;
      joinBtn.disabled = true;
    }
  }

  // ---- load countries (GeoJSON tolerant) ----
  async function loadCountries(){
    try {
      const r = await apiFetch('/api/countries', { method: 'GET' });
      if (r && r.ok && r.data) {
        if (r.data.type === 'FeatureCollection') return r.data;
        if (Array.isArray(r.data)) {
          const features = r.data.map(c => ({
            type: 'Feature',
            properties: Object.assign({}, c.properties || c),
            geometry: c.geometry || c.geo || null
          }));
          return { type:'FeatureCollection', features };
        }
      }
    } catch(e){ console.warn('fetch /api/countries failed', e); }

    // fallback minimal sample so map works offline
    return {
      type: 'FeatureCollection',
      features: [
        { type:'Feature', properties:{ id:'FRA', name:'France', owner:null },
          geometry: { type:'Polygon', coordinates: [[[2.0,51.0],[2.5,49.0],[3.0,44.0],[0.0,43.0],[-1.5,48.0],[2.0,51.0]]] } },
        { type:'Feature', properties:{ id:'DZA', name:'Algérie', owner:null },
          geometry: { type:'Polygon', coordinates: [[[0,37],[5,36],[7,32],[3,30],[-2,32],[0,37]]] } }
      ]
    };
  }

  // ---- render on map + side list ----
  async function renderCountries(){
    const geojson = await loadCountries();
    countries = geojson.features || [];
    if (geojsonLayer) map.removeLayer(geojsonLayer);
    geojsonLayer = L.geoJSON(geojson, { style: styleFeature, onEachFeature }).addTo(map);

    // populate list
    countryListEl.innerHTML = '';
    countries.sort((a,b) => (a.properties?.name||'').localeCompare(b.properties?.name||'')).forEach(f => {
      const div = document.createElement('div');
      div.className = 'country-item';
      div.setAttribute('role','listitem');
      div.innerHTML = `<div>
          <div class="country-name">${f.properties?.name || '—'}</div>
          <div class="country-meta">ID: ${f.properties?.id || '—'}</div>
        </div>
        <div class="country-meta">${f.properties?.owner ? 'Owned' : 'Libre'}</div>`;
      div.addEventListener('click', () => {
        geojsonLayer.eachLayer(l => { if (l.feature === f) selectCountry(f, l); });
      });
      countryListEl.appendChild(div);
    });

    // fit map to all features
    try {
      const bounds = geojsonLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.2));
    } catch(e){}
  }

  // ---- actions ----
  async function joinSelectedCountry(){
    if (!selectedCountry) return;
    if (!userSession) { showToast('Connecte-toi pour rejoindre'); return; }
    const cid = selectedCountry.properties.id;
    try {
      const r = await apiFetch(`/api/countries/${encodeURIComponent(cid)}/join`, { method: 'POST' });
      if (r && r.ok) { showToast('Rejoint avec succès'); await renderCountries(); }
      else showToast('Échec de la requête');
    } catch(e){ showToast('Erreur réseau'); }
  }

  async function showActions(){
    if (!selectedCountry) return;
    await fetchSession();
    const owner = selectedCountry.properties.owner || null;
    const isLeader = userSession?.rp && userSession.rp.role === 'leader' && userSession.rp.country_id === owner;
    if (!isLeader) { alert('Aucune action disponible — requiert être leader du pays.'); return; }

    // simple modal-less action flow (prompt fallback) — swap to proper modals later
    const choice = prompt('Actions (tape: rename, invite, war):');
    if (!choice) return;
    if (choice === 'rename') {
      const name = prompt('Nouveau nom:'); if (!name) return;
      // call server endpoint (example)
      try {
        const r = await apiFetch(`/api/countries/${encodeURIComponent(owner)}/rename`, {
          method: 'POST', body: JSON.stringify({ name })
        });
        if (r && r.ok) showToast('Pays renommé');
        else showToast('Échec renommage');
      } catch(e) { showToast('Erreur réseau'); }
      await renderCountries();
    } else if (choice === 'invite') {
      const user = prompt('Pseudo à inviter:'); if (!user) return;
      // simulated, server endpoint is required
      showToast('Invitation envoyée (simulé)');
    } else if (choice === 'war') {
      const target = prompt('ID cible (ex: FRA):'); if (!target) return;
      showToast('Déclaration de guerre (simulé) contre ' + target);
    } else {
      showToast('Action inconnue');
    }
  }

  // ---- search ----
  function searchCountry(q){
    if (!q) return;
    q = q.trim().toLowerCase();
    const found = countries.find(f => (f.properties?.name || '').toLowerCase().includes(q) || (f.properties?.id || '').toLowerCase() === q);
    if (found) { geojsonLayer.eachLayer(l => { if (l.feature === found) selectCountry(found, l); }); }
    else showToast('Aucun pays trouvé');
  }

  // ---- UI wiring ----
  function wireUI(){
    searchBtn.addEventListener('click', () => searchCountry(searchInput.value));
    searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') searchCountry(searchInput.value); });
    refreshBtn.addEventListener('click', async () => { await renderCountries(); showToast('Carte rafraîchie'); });
    zoomIn.addEventListener('click', () => map.zoomIn());
    zoomOut.addEventListener('click', () => map.zoomOut());
    fitAll.addEventListener('click', () => {
      try { const b = geojsonLayer.getBounds(); if (b.isValid()) map.fitBounds(b.pad(0.2)); } catch(e){}
    });
    joinBtn.addEventListener('click', joinSelectedCountry);
    actionsBtn.addEventListener('click', showActions);

    // bottom nav
    el('navChat').addEventListener('click', () => location.href = 'chat.html');
    el('navLobby').addEventListener('click', () => location.href = 'dashboard.html');
    el('navProfile').addEventListener('click', () => location.href = 'profile.html');
  }

  // ---- bootstrap ----
  (async function boot(){
    initMap();
    wireUI();
    await fetchSession();
    await renderCountries();

    // refresh periodically while page open (30s)
    setInterval(async () => {
      await renderCountries();
    }, 30000);
  })();

})();

// Join-rp.js
(() => {
  const countrySelect = document.getElementById('countrySelect');
  const countryFilter = document.getElementById('countryFilter');
  const filterClear = document.getElementById('countryFilterClear');
  const displayNameInput = document.getElementById('displayName');
  const submitBtn = document.getElementById('submitJoin');
  const skipBtn = document.getElementById('skipBtn');
  const loader = document.getElementById('loader');
  const msg = document.getElementById('msg');
  const preview = document.getElementById('countryPreview');

  const cp = {
    flag: document.getElementById('cpFlag'),
    name: document.getElementById('cpName'),
    meta: document.getElementById('cpMeta'),
    desc: document.getElementById('cpDesc'),
    code: document.getElementById('cpCode'),
    pop: document.getElementById('cpPop'),
  };

  let modal = null;
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <h3 id="modalTitle" style="margin:0 0 8px 0">Confirmer ton choix</h3>
        <div id="modalBody" class="muted">Rejoindre ce pays ?</div>
        <div class="modal-actions">
          <button id="modalCancel" type="button" class="btn ghost small">Annuler</button>
          <button id="modalConfirm" type="button" class="btn primary">Rejoindre</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.querySelector('#modalCancel').addEventListener('click', () => closeModal());
    modal.querySelector('#modalConfirm').addEventListener('click', () => {
      closeModal();
      performJoin();
    });

    document.addEventListener('keydown', (e) => {
      if (!modal.classList.contains('open')) return;
      if (e.key === 'Escape') closeModal();
    });

    return modal;
  }
  function openModal(text) {
    const m = ensureModal();
    m.querySelector('#modalBody').textContent = text || 'Rejoindre ce pays ?';
    m.classList.add('open');
    setTimeout(() => {
      const c = m.querySelector('#modalConfirm');
      if (c) c.focus();
    }, 60);
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
  }

  // apiFetch wrapper (keeps credentials and JSON header)
  const WC_API = window.WC && typeof window.WC.apiFetch === 'function' ? window.WC.apiFetch : null;
  async function apiFetch(url, opts) {
    if (WC_API) return WC_API(url, opts);
    opts = opts || {};
    opts.credentials = opts.credentials || 'same-origin';
    if (!opts.headers && !(opts.body instanceof FormData)) opts.headers = { 'Content-Type': 'application/json' };
    try {
      const r = await fetch(url, opts);
      const ct = r.headers.get('content-type') || '';
      let body = null;
      if (ct.includes('application/json')) body = await r.json(); else body = await r.text();
      if (!r.ok) return { ok: false, status: r.status, data: body, error: body && body.error ? body.error : (typeof body === 'string' ? body : 'Erreur') };
      return { ok: true, status: r.status, data: body };
    } catch (err) {
      return { ok: false, status: 0, error: err.message || 'Network error' };
    }
  }

  // UX helpers
  function setMsg(text = '', type = 'info') {
    if (!msg) return;
    msg.textContent = text;
    msg.classList.remove('msg-error','msg-success','msg-info');
    if (!text) return;
    msg.classList.add(type === 'success' ? 'msg-success' : type === 'error' ? 'msg-error' : 'msg-info');
  }
  function showLoader(show = true) {
    if (!loader) return;
    loader.classList.toggle('hidden', !show);
    loader.setAttribute('aria-hidden', String(!show));
  }
  function enableSubmit(enable = true) {
    if (!submitBtn) return;
    submitBtn.disabled = !enable;
    submitBtn.setAttribute('aria-disabled', String(!enable));
  }

  function debounce(fn, wait = 250) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  const FALLBACK_COUNTRIES = [
    { id: 'fr', name: 'France', continent: 'Europe', file: null, meta: { code: 'FR', pop: '67M' } },
    { id: 'us', name: 'États-Unis', continent: 'Amérique', file: null, meta: { code: 'US', pop: '331M' } },
    { id: 'alg', name: 'Algérie', continent: 'Afrique', file: null, meta: { code: 'DZ', pop: '44M' } },
    { id: 'ru', name: 'Russie', continent: 'Europe/Asie', file: null, meta: { code: 'RU', pop: '145M' } }
  ];

  let countriesList = [];
  let countriesLoaded = false;
  let isSubmitting = false;

  // utility: get basename from path
  function basenamePath(p) {
    if (!p) return null;
    try {
      return p.split('/').pop().replace(/\.json$/i, '');
    } catch (e) { return null; }
  }

  // populate select: handle c.id OR fallback to filename; support c.meta or c.metadata
  function populateSelect(list) {
    countrySelect.innerHTML = '<option value="">-- Choisir un pays --</option>';
    list.sort((a,b) => (a.name||'').localeCompare(b.name||''));
    for (const c of list) {
      const opt = document.createElement('option');
      // determine value: prefer explicit id, else fallback to filename (from file path), else slugged name
      let val = null;
      if (c.id) val = String(c.id);
      else if (c.file) val = basenamePath(c.file);
      else if (c.name) val = String(c.name).toLowerCase().replace(/\s+/g, '_').replace(/[^\w_-]/g, '');
      if (!val) continue; // skip malformed entries
      opt.value = val;
      opt.textContent = c.name || val;

      // dataset file (if provided)
      if (c.file) opt.dataset.file = c.file;
      if (c.continent) opt.dataset.continent = c.continent;
      // accept both meta and metadata keys
      const metaObj = c.meta || c.metadata || c.metadata || null;
      if (metaObj) {
        try { opt.dataset.meta = JSON.stringify(metaObj); } catch (e) { opt.dataset.meta = null; }
      }
      countrySelect.appendChild(opt);
    }

    countriesLoaded = true;
    updateSubmitState();
  }

  function filterSelect(q) {
    q = (q || '').toLowerCase().trim();
    for (const opt of Array.from(countrySelect.options)) {
      if (!opt.value) continue; // keep placeholder visible
      const txt = (opt.textContent || '').toLowerCase();
      opt.hidden = q ? !txt.includes(q) : false;
    }
    if (filterClear) filterClear.hidden = !q;
  }

  function clearPreview() {
    if (!preview) return;
    preview.classList.add('hidden');
    preview.classList.remove('visible');
    cp.flag.textContent = '🌍';
    cp.name.textContent = '—';
    cp.meta.textContent = '';
    cp.desc.textContent = '';
    if (cp.code) cp.code.textContent = 'Code —';
    if (cp.pop) cp.pop.textContent = 'Pop —';
  }

  // read meta field from option or from file
  async function fetchCountryPreview() {
    clearPreview();
    const sel = countrySelect.selectedOptions?.[0];
    if (!sel || !sel.value) {
      enableSubmit(false);
      return;
    }

    // try inline meta first (supports meta or metadata saved in dataset)
    let meta = null;
    try { meta = sel.dataset.meta ? JSON.parse(sel.dataset.meta) : null; } catch (e) { meta = null; }

    if (meta) {
      cp.flag.textContent = meta.flag_emoji || '🌍';
      cp.name.textContent = meta.name || sel.textContent;
      cp.meta.textContent = sel.dataset.continent || meta.region || '';
      cp.desc.textContent = meta.description || '';
      if (cp.code) cp.code.textContent = meta.code ? `Code ${meta.code}` : 'Code —';
      if (cp.pop) cp.pop.textContent = meta.pop ? `Pop ${meta.pop}` : 'Pop —';
      preview.classList.remove('hidden');
      preview.classList.add('visible');
      enableSubmit(true);
      return;
    }

    // otherwise try to fetch the country file if dataset.file exists
    const file = sel.dataset.file;
    if (file) {
      showLoader(true);
      try {
        const r = await fetch(file, { credentials: 'same-origin' });
        if (r.ok) {
          const d = await r.json();
          cp.flag.textContent = d.flag_emoji || d.emoji || '🌍';
          cp.name.textContent = d.name || d.common || sel.textContent;
          cp.meta.textContent = d.continent || d.region || sel.dataset.continent || '';
          cp.desc.textContent = d.description || d.summary || '';
          if (cp.code) cp.code.textContent = (d.metadata && d.metadata.code) ? `Code ${d.metadata.code}` : (d.code ? `Code ${d.code}` : 'Code —');
          if (cp.pop) cp.pop.textContent = (d.metadata && d.metadata.pop) ? `Pop ${d.metadata.pop}` : (d.pop ? `Pop ${d.pop}` : 'Pop —');
          preview.classList.remove('hidden');
          preview.classList.add('visible');
        } else {
          cp.name.textContent = sel.textContent;
          preview.classList.remove('hidden');
          preview.classList.add('visible');
        }
      } catch (err) {
        cp.name.textContent = sel.textContent;
        preview.classList.remove('hidden');
        preview.classList.add('visible');
      } finally {
        showLoader(false);
      }
    } else {
      // fallback: just show the name from the option
      cp.name.textContent = sel.textContent;
      cp.meta.textContent = sel.dataset.continent || '';
      if (cp.code) cp.code.textContent = sel.dataset.code || 'Code —';
      if (cp.pop) cp.pop.textContent = sel.dataset.pop || 'Pop —';
      preview.classList.remove('hidden');
      preview.classList.add('visible');
    }

    enableSubmit(true);
  }

  // load countries
  async function loadCountries() {
    countrySelect.innerHTML = '<option value="">— Chargement —</option>';
    countriesLoaded = false;
    showLoader(true);
    try {
      const r = await apiFetch('/api/countries', { method: 'GET' });
      showLoader(false);
      if (!r.ok || !r.data) {
        countriesList = FALLBACK_COUNTRIES.slice();
        setMsg('Liste des pays indisponible — mode démo.', 'info');
        populateSelect(countriesList);
        return;
      }
      // server returns { ok: true, countries: [...] }
      const payload = r.data;
      const arr = Array.isArray(payload.countries) ? payload.countries : (Array.isArray(payload) ? payload : (Array.isArray(r.data) ? r.data : []));
      countriesList = arr;
      if (!countriesList.length) {
        countriesList = FALLBACK_COUNTRIES.slice();
        setMsg('Aucun pays trouvé — mode démo.', 'info');
      } else {
        setMsg('', 'info');
      }
      populateSelect(countriesList);
    } catch (err) {
      showLoader(false);
      countriesList = FALLBACK_COUNTRIES.slice();
      populateSelect(countriesList);
      setMsg('Erreur réseau — liste pays en mode local.', 'info');
    }
  }

  // ensure submit enabled only when countries loaded and a valid option is selected
  function updateSubmitState() {
    const sel = countrySelect.selectedOptions?.[0];
    enableSubmit(Boolean(countriesLoaded && sel && sel.value));
  }

  // form submit (opens modal)
  async function formSubmitHandler(e) {
    if (e) e.preventDefault();
    setMsg('', 'info');
    const sel = countrySelect.selectedOptions?.[0];
    const country_id = sel?.value?.trim() || null;
    const country_name = sel?.textContent || null;
    const displayName = (displayNameInput.value || '').trim() || null;

    if (!country_id) {
      setMsg('Choisis un pays.', 'error');
      return;
    }
    openModal(`Confirmer : rejoindre ${country_name}${displayName ? ` — sous le nom ${displayName}` : ''} ?`);
  }

  // actual join request
  async function performJoin() {
    if (isSubmitting) return;
    // final safety: prevent sending if button disabled
    if (submitBtn && submitBtn.disabled) return;

    isSubmitting = true;
    showLoader(true);
    enableSubmit(false);
    setMsg('', 'info');

    const sel = countrySelect.selectedOptions?.[0];
    const country_id = sel?.value?.trim() || null;
    const country_name = sel?.textContent || null;
    const displayName = (displayNameInput.value || '').trim() || null;

    console.debug('performJoin payload:', { country_id, country_name, displayName });

    if (!country_id) {
      setMsg('Choisis un pays avant de rejoindre le RP.', 'error');
      showLoader(false);
      enableSubmit(true);
      isSubmitting = false;
      return;
    }

    const origText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) submitBtn.textContent = 'Envoi…';

    try {
      const r = await apiFetch('/api/user/join-rp', {
        method: 'POST',
        body: JSON.stringify({ country_id, country_name, displayName })
      });

      showLoader(false);
      isSubmitting = false;

      if (!r.ok) {
        const errMsg = r.error || (r.data && r.data.error) || 'Impossible de rejoindre.';
        setMsg('Erreur : ' + errMsg, 'error');
        enableSubmit(true);
        if (submitBtn) submitBtn.textContent = origText;
        return;
      }

      const data = r.data || {};
      const assigned = data.assigned || r.assigned;
      const next = data.next || r.next;

      if (assigned === 'leader') {
        setMsg('Tu es le premier membre — tu es maintenant dirigeant. Redirection…', 'success');
        setTimeout(() => window.location.href = 'dashboard.html', 700);
        return;
      }
      if (next === '/choose-role.html' || next === 'choose-role') {
        setMsg('Étape suivante : choisir un rôle — redirection…', 'info');
        setTimeout(() => window.location.href = '/choose-role.html', 600);
        return;
      }

      setMsg('Inscription prise en compte — redirection…', 'success');
      setTimeout(() => window.location.href = 'dashboard.html', 700);
    } catch (err) {
      console.error(err);
      showLoader(false);
      isSubmitting = false;
      setMsg('Erreur réseau — réessaie plus tard.', 'error');
      enableSubmit(true);
      if (submitBtn) submitBtn.textContent = origText;
    }
  }

  // events
  countryFilter.addEventListener('input', debounce((e) => filterSelect(e.target.value), 180));
  if (filterClear) {
    filterClear.addEventListener('click', () => {
      countryFilter.value = '';
      filterSelect('');
      filterClear.hidden = true;
      countryFilter.focus();
    });
  }

  countrySelect.addEventListener('change', () => {
    fetchCountryPreview();
    updateSubmitState();
  });

  displayNameInput.addEventListener('input', () => {
    updateSubmitState();
  });

  const form = document.getElementById('joinForm');
  if (form) form.addEventListener('submit', formSubmitHandler);

  if (skipBtn) skipBtn.addEventListener('click', () => { window.location.href = 'dashboard.html'; });

  // bootstrap
  (async () => {
    await loadCountries();
    clearPreview();
    // keep button disabled until a selection is made
    enableSubmit(false);

    try {
      const r = await apiFetch('/api/session', { method: 'GET' });
      if (!r.ok || !r.data || !r.data.ok) {
        window.location.href = 'index.html';
        return;
      }
      if (r.data.rp && r.data.rp.joined) {
        window.location.href = 'dashboard.html';
        return;
      }
    } catch (e) {
      // allow continued use in offline/demo mode
    }
  })();

  window.__WC_performJoin = performJoin;
})();

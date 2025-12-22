// join-rp.js — version améliorée : debounce search, clear button, modal confirmation,
// fallback countries, UX accessible, better error handling.

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

  // preview elements
  const cp = {
    flag: document.getElementById('cpFlag'),
    name: document.getElementById('cpName'),
    meta: document.getElementById('cpMeta'),
    desc: document.getElementById('cpDesc'),
    code: document.getElementById('cpCode'),
    pop: document.getElementById('cpPop'),
  };

  // confirmation modal (created dynamically to avoid modifying HTML too much)
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
          <button id="modalCancel" class="btn ghost small">Annuler</button>
          <button id="modalConfirm" class="btn primary">Rejoindre</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // wire buttons
    modal.querySelector('#modalCancel').addEventListener('click', () => closeModal());
    modal.querySelector('#modalConfirm').addEventListener('click', () => {
      closeModal();
      performJoin();
    });

    // allow Esc to close
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
    // focus confirm for keyboard users
    setTimeout(() => m.querySelector('#modalConfirm').focus(), 80);
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
  }

  // API helper (wrap WC.apiFetch if present)
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

  // Debounce utility for search
  function debounce(fn, wait = 250) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // small curated fallback if /api/countries fails (keeps UX alive)
  const FALLBACK_COUNTRIES = [
    { id: 'fr', name: 'France', continent: 'Europe', file: null, meta: { code: 'FR', pop: '67M' } },
    { id: 'us', name: 'États-Unis', continent: 'Amérique', file: null, meta: { code: 'US', pop: '331M' } },
    { id: 'alg', name: 'Algérie', continent: 'Afrique', file: null, meta: { code: 'DZ', pop: '44M' } },
    { id: 'ru', name: 'Russie', continent: 'Europe/Asie', file: null, meta: { code: 'RU', pop: '145M' } }
  ];

  let countriesList = [];
  let isSubmitting = false;

  // populate select with countries (sorted)
  function populateSelect(list) {
    countrySelect.innerHTML = '<option value="">-- Choisir un pays --</option>';
    list.sort((a,b) => (a.name||'').localeCompare(b.name||''));
    for (const c of list) {
      const opt = document.createElement('option');
      opt.value = c.id || c.id;
      opt.textContent = c.name || c.id;
      if (c.file) opt.dataset.file = c.file;
      if (c.continent) opt.dataset.continent = c.continent;
      if (c.meta) opt.dataset.meta = JSON.stringify(c.meta);
      countrySelect.appendChild(opt);
    }
  }

  function filterSelect(q) {
    q = (q || '').toLowerCase().trim();
    for (const opt of Array.from(countrySelect.options)) {
      if (!opt.value) continue;
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
    cp.code && (cp.code.textContent = 'Code —');
    cp.pop && (cp.pop.textContent = 'Pop —');
  }

  async function fetchCountryPreview() {
    clearPreview();
    const sel = countrySelect.selectedOptions?.[0];
    if (!sel || !sel.value) {
      enableSubmit(false);
      return;
    }
    const meta = sel.dataset.meta ? JSON.parse(sel.dataset.meta) : null;
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

    const file = sel.dataset.file;
    if (file) {
      showLoader(true);
      try {
        const r = await fetch(file, { credentials: 'same-origin' });
        if (r.ok) {
          const d = await r.json();
          cp.flag.textContent = d.flag_emoji || d.emoji || '🌍';
          cp.name.textContent = d.name || d.common || sel.textContent;
          cp.meta.textContent = d.region || d.continent || (sel.dataset.continent || '');
          cp.desc.textContent = d.description || d.summary || '';
          if (cp.code) cp.code.textContent = d.code ? `Code ${d.code}` : 'Code —';
          if (cp.pop) cp.pop.textContent = d.pop ? `Pop ${d.pop}` : 'Pop —';
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
      cp.name.textContent = sel.textContent;
      cp.meta.textContent = sel.dataset.continent || '';
      if (cp.code) cp.code.textContent = sel.dataset.code || 'Code —';
      if (cp.pop) cp.pop.textContent = sel.dataset.pop || 'Pop —';
      preview.classList.remove('hidden');
      preview.classList.add('visible');
    }
    enableSubmit(true);
  }

  // load countries from API, fallback to local list if necessary
  async function loadCountries() {
    countrySelect.innerHTML = '<option value="">— Chargement —</option>';
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
      countriesList = Array.isArray(r.data.countries) ? r.data.countries : (Array.isArray(r.data) ? r.data : []);
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

  // handle submit flow with modal confirmation
  async function formSubmitHandler(e) {
    e && e.preventDefault();
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

  // actual network join request (called after modal confirm)
  async function performJoin() {
    if (isSubmitting) return;
    isSubmitting = true;
    showLoader(true);
    enableSubmit(false);
    setMsg('', 'info');

    const sel = countrySelect.selectedOptions?.[0];
    const country_id = sel?.value?.trim() || null;
    const country_name = sel?.textContent || null;
    const displayName = (displayNameInput.value || '').trim() || null;

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
        setMsg('Erreur : ' + (r.error || (r.data && r.data.error) || 'Impossible de rejoindre.'), 'error');
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

  // wire up events
  countryFilter.addEventListener('input', debounce((e) => filterSelect(e.target.value), 180));
  if (filterClear) {
    filterClear.addEventListener('click', () => {
      countryFilter.value = '';
      filterSelect('');
      filterClear.hidden = true;
      countryFilter.focus();
    });
  }

  countrySelect.addEventListener('change', fetchCountryPreview);
  displayNameInput.addEventListener('input', () => {
    enableSubmit(Boolean(countrySelect.value));
  });

  // form submit attaches confirmation modal
  const form = document.getElementById('joinForm');
  if (form) form.addEventListener('submit', formSubmitHandler);

  // skip button
  skipBtn.addEventListener('click', () => { window.location.href = 'dashboard.html'; });

  // on DOM ready bootstrap sequence
  (async () => {
    await loadCountries();
    clearPreview();
    enableSubmit(false);

    // session check — keep behaviour but softer: redirect only if no session
    try {
      const r = await apiFetch('/api/session', { method: 'GET' });
      if (!r.ok || !r.data || !r.data.ok) {
        // not authenticated — redirect to index/login
        window.location.href = 'index.html';
        return;
      }
      if (r.data.rp && r.data.rp.joined) {
        // already joined — redirect
        window.location.href = 'dashboard.html';
        return;
      }
    } catch (e) {
      // network issues — allow the user to continue with fallback countries
    }
  })();

  // expose performJoin for modal confirm to call
  window.__WC_performJoin = performJoin;
})();

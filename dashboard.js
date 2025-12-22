// dashboard.js — client lobby logic (refactoré)
// - Préfère window.WC.apiFetch si disponible
// - Normalise toutes les réponses { ok, status, data, error }
// - Documente / nettoie les fallbacks temporaires (TODO)
(() => {
  const menuLeft = document.getElementById('menuBtnLeft');
  const menuRight = document.getElementById('menuBtnRight');
  const leftPanel = document.getElementById('leftPanel');
  const rightPanel = document.getElementById('rightPanel');
  const closeButtons = document.querySelectorAll('.close-panel');
  const welcomeEl = document.getElementById('welcome');
  const subtitleEl = document.getElementById('subtitle');
  const qiRole = document.getElementById('qiRole');
  const qiCountry = document.getElementById('qiCountry');
  const qiMembers = document.getElementById('qiMembers');
  const actionsList = document.getElementById('actionsList');
  const feedList = document.getElementById('feedList');
  const leftPanelFoot = document.getElementById('leftPanelFoot');
  const logoutBtn = document.getElementById('logoutBtn');

  // --- Helpers: API wrapper & response normalization (shared pattern) ---
  async function localFetchWrapper(url, opts = {}) {
    opts = Object.assign({}, opts);
    opts.credentials = opts.credentials || 'same-origin';
    opts.headers = opts.headers || {};
    if (!opts.headers['Content-Type'] && !(opts.body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
    }
    try {
      // stringify plain object body when appropriate
      if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
        const ct = (opts.headers['Content-Type'] || opts.headers['content-type'] || '').toLowerCase();
        if (ct.includes('application/json')) opts.body = JSON.stringify(opts.body);
      }

      const r = await fetch(url, opts);
      const ct = (r.headers.get && r.headers.get('content-type')) || '';
      const data = ct.includes('application/json') ? await r.json() : await r.text();

      if (!r.ok) {
        return { ok: false, status: r.status, data, error: (data && data.error) || `HTTP ${r.status}` };
      }

      // try to normalize common shapes: { ok, data, error } or raw data
      if (data && typeof data === 'object') {
        if ('ok' in data && ('data' in data || 'error' in data)) {
          return { ok: !!data.ok, status: r.status, data: data.data === undefined ? null : data.data, error: data.error || null };
        }
      }

      return { ok: true, status: r.status, data, error: null };
    } catch (err) {
      return { ok: false, status: 0, data: null, error: err && err.message ? err.message : 'Network error' };
    }
  }

  async function apiFetch(url, opts = {}) {
    if (window.WC && typeof window.WC.apiFetch === 'function') {
      try {
        // WC.apiFetch is expected to return a normalized object; if not, adapt
        const r = await window.WC.apiFetch(url, opts);
        if (r && typeof r === 'object' && ('ok' in r)) return r;
        // if WC.apiFetch returned raw response object (legacy), try to normalize
        if (r && typeof r === 'object') return { ok: true, status: r.status || 200, data: r.data || r, error: null };
        return { ok: false, status: 0, data: null, error: 'Invalid response from WC.apiFetch' };
      } catch (e) {
        return { ok: false, status: 0, data: null, error: e && e.message ? e.message : 'WC.apiFetch error' };
      }
    }
    return await localFetchWrapper(url, opts);
  }

  function normalizeSessionResponse(resp) {
    // Accept: resp (normalized) or resp.data wrapper or direct session object
    if (!resp) return null;
    if (typeof resp === 'object' && ('ok' in resp)) {
      if (!resp.ok) return null;
      // condition: resp.data might itself be wrapper { ok, data }
      const payload = resp.data && resp.data.ok && resp.data.data ? resp.data.data : resp.data;
      return payload || null;
    }
    // legacy: resp is session object
    return resp;
  }

  // Helper for user messages (use WC.showMessage or fallback toast/console)
  function showMessage(el, msg, type = 'info', duration = 3000) {
    if (window.WC && typeof window.WC.showMessage === 'function') {
      try { window.WC.showMessage(el, msg, type); return; } catch (e) { /* ignore */ }
    }
    // fallbacks: if a toast element exists use it
    const toastEl = document.getElementById('toast');
    if (toastEl) {
      toastEl.textContent = msg;
      toastEl.classList.remove('visually-hidden');
      setTimeout(() => toastEl.classList.add('visually-hidden'), duration);
      return;
    }
    // last resort
    if (type === 'error') console.error('[WC]', msg);
    else console.warn('[WC]', msg);
  }

  // --- UI utilities ---
  function togglePanel(panel) {
    if (!panel) return;
    panel.classList.toggle('open');
    panel.setAttribute('aria-hidden', !panel.classList.contains('open'));
  }

  menuLeft?.addEventListener('click', () => togglePanel(leftPanel));
  menuRight?.addEventListener('click', () => togglePanel(rightPanel));
  closeButtons?.forEach(b => b.addEventListener('click', (e) => {
    const t = e.currentTarget.dataset.target;
    const el = document.getElementById(t);
    if (el) el.classList.remove('open');
  }));

  // panel nav handlers (left)
  document.querySelectorAll('.panel-nav button').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      // navigation stubs (TODO: convert to proper routes / API-driven actions)
      if (action === 'open-map') window.location.href = 'map/index.html';
      else if (action === 'recent-wars') showMessage(null, 'Fonction "guerres récentes" non implémentée.', 'info');
      else if (action === 'rules') window.open('rules.html', '_blank');
      else if (action === 'server-status') showMessage(null, 'Statut serveur : OK (placeholder)', 'info');
    });
  });

  // populate actions depending on role
  function setActionsForRole(role, user) {
    actionsList.innerHTML = '';
    const addBtn = (label, handler) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', handler);
      actionsList.appendChild(b);
    };

    function showNotImpl(label) {
      return () => showMessage(null, `${label} — fonctionnalité non implémentée (TODO).`, 'info');
    }

    if (!role || role === 'pending') {
      addBtn('Choisir rôle', () => { window.location.href = 'choose-role.html'; });
      addBtn('Voir profil', () => { window.location.href = 'profile.html'; });
      return;
    }

    if (role === 'leader') {
      addBtn('Gérer le pays', showNotImpl('Gérer le pays'));
      addBtn('Nommer un ministre', showNotImpl('Nommer un ministre'));
      addBtn('Déclarer un état d\'alerte / guerre', showNotImpl('Déclarer un état d\'alerte / guerre'));
      addBtn('Inviter à la réunion', showNotImpl('Inviter à la réunion'));
    } else if (role === 'official') {
      addBtn('Proposer une loi', showNotImpl('Proposer une loi'));
      addBtn('Gérer le ministère', showNotImpl('Gérer le ministère'));
      addBtn('Consulter demandes citoyennes', showNotImpl('Consulter demandes citoyennes'));
    } else if (role === 'citizen') {
      addBtn('Choisir un métier', showNotImpl('Choisir un métier'));
      addBtn('Participer au forum local', showNotImpl('Participer au forum local'));
      addBtn('Postuler pour un poste officiel', showNotImpl('Postuler pour un poste officiel'));
    } else {
      addBtn('Actions disponibles', () => showMessage(null, 'Aucune action spéciale.', 'info'));
    }

    // every role has quick access to map/chat/profile
    addBtn('Accès au tchat', () => window.location.href = 'chat.html');
    addBtn('Voir profil', () => window.location.href = 'profile.html');
  }

  // --- Session & counts ---
  async function fetchSession() {
    const resp = await apiFetch('/api/session', { method: 'GET' });
    // resp may be normalized { ok, status, data, error } or raw
    if (!resp || !resp.ok) return resp || null;
    return resp.data;
  }

  async function countMembersInCountry(countryId) {
    // Attempt an API call if possible; fallback to placeholder.
    if (!countryId) return '—';
    try {
      // TODO: confirm backend endpoint. Candidate endpoints:
      // - GET /api/countries/:id/members  -> returns array
      // - GET /api/countries/:id/members/count -> returns { count: N }
      // We'll attempt both shapes gracefully.
      const resp1 = await apiFetch(`/api/countries/${encodeURIComponent(countryId)}/members`, { method: 'GET' });
      if (resp1 && resp1.ok && Array.isArray(resp1.data)) return resp1.data.length.toString();

      const resp2 = await apiFetch(`/api/countries/${encodeURIComponent(countryId)}/members/count`, { method: 'GET' });
      if (resp2 && resp2.ok) {
        if (typeof resp2.data === 'number') return String(resp2.data);
        if (resp2.data && typeof resp2.data.count === 'number') return String(resp2.data.count);
      }
      // fallback: check /api/countries (global) for members property
      const resp3 = await apiFetch('/api/countries', { method: 'GET' });
      if (resp3 && resp3.ok && Array.isArray(resp3.data)) {
        const c = resp3.data.find(cc => cc.id === countryId || cc.country_id === countryId);
        if (c && (typeof c.members === 'number')) return String(c.members);
      }
      // TODO: replace placeholder with authoritative endpoint when backend is available
      return '—';
    } catch (e) {
      return '—';
    }
  }

  // --- Initialization ---
  async function init() {
    if (welcomeEl) welcomeEl.textContent = 'Vérification de la session...';
    if (subtitleEl) subtitleEl.textContent = 'Chargement de vos informations';

    const resp = await fetchSession();
    // If fetchSession returned normalized error object like { ok:false } return earlier
    if (!resp) {
      if (welcomeEl) welcomeEl.textContent = 'Non connecté';
      if (subtitleEl) subtitleEl.textContent = 'Redirection vers la page de connexion...';
      setTimeout(() => window.location.href = 'index.html', 800);
      return;
    }

    // normalize: resp may be the session object already, or wrapper { data: session }
    const session = normalizeSessionResponse(resp) || resp;

    if (!session || !session.rp || !session.rp.joined) {
      if (welcomeEl) welcomeEl.textContent = `Salut ${session && session.username ? session.username : 'invité'} — rejoins le RP`;
      if (subtitleEl) subtitleEl.textContent = 'Redirection vers la page pour choisir un pays...';
      setTimeout(() => window.location.href = 'join-rp.html', 600);
      return;
    }

    const rp = session.rp || {};
    if (welcomeEl) welcomeEl.textContent = `Bienvenue ${session.username || 'Utilisateur'}`;
    if (subtitleEl) subtitleEl.textContent = `En tant que ${rp.role || '—'} — ${rp.country_name || rp.country_id || '—'}`;
    if (qiRole) qiRole.textContent = rp.role || '—';
    if (qiCountry) qiCountry.textContent = rp.country_name || rp.country_id || '—';
    if (qiMembers) qiMembers.textContent = await countMembersInCountry(rp.country_id);

    // feed sample (stub) — TODO: replace with real feed from /api/feed when backend exists
    if (feedList) feedList.innerHTML = `<div>Bienvenue dans le lobby RP. Rôle : <strong>${rp.role || '—'}</strong>. Actions disponibles dans le menu de droite.</div>`;

    // actions
    setActionsForRole(rp.role, session);

    // left footer extra info
    if (leftPanelFoot) leftPanelFoot.textContent = `Utilisateur: ${session.username || '—'} • connecté.`;
  }

  // wire logout (use apiFetch)
  logoutBtn?.addEventListener('click', async () => {
    try {
      const r = await apiFetch('/api/logout', { method: 'POST' });
      // ignore server failure for now but log if exists
      if (r && !r.ok) console.warn('Logout warning:', r.error || r);
    } catch (e) {
      console.warn('Logout error', e);
    } finally {
      window.location.href = 'index.html';
    }
  });

  // bottom nav behaviour (simple)
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.addEventListener('click', () => {
      const to = b.dataset.to;
      if (to) window.location.href = to;
    });
  });

  // start
  init();
})();

// profile.js — page profil publique (affiche seulement le profil; settings 👉 settings.html)
(() => {
  const avatarEl = document.getElementById('avatar');
  const usernameDisplay = document.getElementById('usernameDisplay');
  const displayNameEl = document.getElementById('displayName');
  const profileUser = document.getElementById('profileUser');
  const profileEmail = document.getElementById('profileEmail');
  const rpCountry = document.getElementById('rpCountry');
  const rpRole = document.getElementById('rpRole');
  const rpDisplay = document.getElementById('rpDisplay');
  const createdAt = document.getElementById('createdAt');

  // bottom nav handlers
  document.getElementById('nav-chat')?.addEventListener('click', () => location.href = 'chat.html');
  document.getElementById('nav-lobby')?.addEventListener('click', () => location.href = 'dashboard.html');
  document.getElementById('nav-notifs')?.addEventListener('click', () => alert('Notifications à implémenter'));
  document.getElementById('nav-profile')?.addEventListener('click', () => { /* noop */ });

  // message / follow placeholders
  document.getElementById('btnMessage')?.addEventListener('click', () => alert('Ouverture du chat — fonctionnalité à implémenter'));
  document.getElementById('btnFollow')?.addEventListener('click', () => alert('Fonction suivre à implémenter'));

  // load avatar from localStorage (prototype)
  function loadAvatar() {
    try {
      const d = localStorage.getItem('wc_avatar');
      if (d) {
        avatarEl.style.backgroundImage = `url(${d})`;
        avatarEl.textContent = '';
      } else {
        avatarEl.style.backgroundImage = 'none';
        avatarEl.textContent = 'WC';
      }
    } catch (e) {
      avatarEl.textContent = 'WC';
    }
  }

  async function apiFetch(url, opts = {}) {
    if (window.WC && WC.apiFetch) return WC.apiFetch(url, opts);
    opts.credentials = opts.credentials || 'same-origin';
    opts.headers = opts.headers || {};
    if (!opts.headers['Content-Type'] && !(opts.body instanceof FormData)) opts.headers['Content-Type'] = 'application/json';
    try {
      const r = await fetch(url, opts);
      const ct = r.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await r.json() : await r.text();
      if (!r.ok) return { ok: false, status: r.status, data, error: data && data.error ? data.error : (typeof data === 'string' ? data : 'Erreur') };
      return { ok: true, status: r.status, data };
    } catch (err) {
      return { ok: false, status: 0, error: err.message || 'Network error' };
    }
  }

  async function populate() {
    const s = await apiFetch('/api/session', { method: 'GET' });
    if (!s || !s.ok || !s.data || !s.data.ok) {
      // show minimal public profile? ici on redirige si non connecté
      location.href = 'index.html';
      return;
    }
    const d = s.data;
    usernameDisplay.textContent = d.username || '—';
    displayNameEl.textContent = d.rp?.displayName || '—';
    profileUser.textContent = '@' + (d.username || '—');
    profileEmail.textContent = d.email || '—';
    rpCountry.textContent = d.rp?.country_name || d.rp?.country_id || '—';
    rpRole.textContent = d.rp?.role || '—';
    rpDisplay.textContent = d.rp?.displayName || '—';
    createdAt.textContent = d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '—';
    loadAvatar();
  }

  (async () => {
    try { await populate(); } catch (e) { console.error(e); location.href = 'index.html'; }
  })();
})();

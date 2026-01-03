// settings.js — modifications de profil (avatar local + endpoints)
(() => {
  const toastEl = document.getElementById('toast');
  const avatarPreview = document.getElementById('avatarPreview');
  const avatarFile = document.getElementById('avatarFile');
  const changeAvatar = document.getElementById('changeAvatar');
  const removeAvatar = document.getElementById('removeAvatar');

  const inputDisplayName = document.getElementById('inputDisplayName');
  const profileForm = document.getElementById('profileForm');
  const cancelProfile = document.getElementById('cancelProfile');
  const saveProfile = document.getElementById('saveProfile');

  const currentPwd = document.getElementById('currentPwd');
  const newPwd = document.getElementById('newPwd');
  const confirmPwd = document.getElementById('confirmPwd');
  const pwdForm = document.getElementById('pwdForm');
  const cancelPwd = document.getElementById('cancelPwd');
  const savePwd = document.getElementById('savePwd');

  document.getElementById('nav-chat')?.addEventListener('click', () => location.href = 'chat.html');
  document.getElementById('nav-lobby')?.addEventListener('click', () => location.href = 'dashboard.html');
  document.getElementById('nav-notifs')?.addEventListener('click', () => alert('Notifications à implémenter'));
  document.getElementById('nav-profile')?.addEventListener('click', () => location.href = 'profile.html');

  function toast(msg, t = 3200) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.remove('visually-hidden');
    setTimeout(() => toastEl.classList.add('visually-hidden'), t);
  }

  // Lightweight local fallback if WC.apiFetch is not available (keeps compatibility).
  async function localFetchWrapper(url, opts = {}) {
    opts.credentials = opts.credentials || 'same-origin';
    opts.headers = opts.headers || {};
    if (!opts.headers['Content-Type'] && !(opts.body instanceof FormData)) opts.headers['Content-Type'] = 'application/json';
    try {
      // if body is a plain object and content-type JSON, stringify
      if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
        const ct = (opts.headers['Content-Type'] || opts.headers['content-type'] || '').toLowerCase();
        if (ct.includes('application/json')) opts.body = JSON.stringify(opts.body);
      }

      const r = await fetch(url, opts);
      const ct = r.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await r.json() : await r.text();
      if (!r.ok) return { ok: false, status: r.status, data, error: data && data.error ? data.error : (typeof data === 'string' ? data : 'Erreur') };
      return { ok: true, status: r.status, data };
    } catch (err) {
      return { ok: false, status: 0, error: err.message || 'Network error' };
    }
  }

  // unified apiFetch used by this module (prefers centralized WC.apiFetch)
  async function apiFetch(url, opts = {}) {
    if (window.WC && typeof WC.apiFetch === 'function') {
      return WC.apiFetch(url, opts);
    }
    return localFetchWrapper(url, opts);
  }

  // avatar local preview
  function loadAvatar() {
    try {
      const d = localStorage.getItem('wc_avatar');
      if (d) { avatarPreview.style.backgroundImage = `url(${d})`; avatarPreview.textContent = ''; }
      else { avatarPreview.style.backgroundImage = 'none'; avatarPreview.textContent = 'WC'; }
    } catch (e) { avatarPreview.textContent = 'WC'; }
  }

  changeAvatar?.addEventListener('click', () => avatarFile?.click());
  avatarFile?.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast('Fichier non supporté'); return; }
    const r = new FileReader();
    r.onload = () => {
      try { localStorage.setItem('wc_avatar', r.result); } catch (err) { console.warn(err); }
      loadAvatar();
      toast('Avatar mis à jour (local)');
    };
    r.readAsDataURL(f);
  });

  removeAvatar?.addEventListener('click', () => {
    localStorage.removeItem('wc_avatar');
    loadAvatar();
    toast('Avatar supprimé (local)');
  });

  // normalize session response from apiFetch (supports both wrapped and raw responses)
  function normalizeSessionResponse(resp) {
    // If apiFetch wrapper returned { ok, status, data }
    if (resp && typeof resp === 'object' && ('ok' in resp)) {
      if (!resp.ok) return null;
      // session may be in resp.data, or resp.data may itself be a wrapper with .ok/data
      const payload = resp.data && resp.data.ok && resp.data.data ? resp.data.data : resp.data;
      return payload || null;
    }
    // fallback: legacy direct fetch returned the session object
    return resp || null;
  }

  // load session into form
  async function populate() {
    const s = await apiFetch('/api/session', { method: 'GET' });
    const session = normalizeSessionResponse(s);
    if (!session || !session.rp) {
      location.href = 'index.html';
      return;
    }
    inputDisplayName.value = session.rp?.displayName || '';
    loadAvatar();
  }

  // profile save
  profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveProfile.disabled = true;
    const displayName = (inputDisplayName.value || '').trim();
    // pass plain object — WC.apiFetch handles JSON serialization
    const r = await apiFetch('/api/user/update-profile', { method: 'POST', body: { displayName } });
    if (!r || !r.ok) {
      toast('Impossible d’enregistrer côté serveur — sauvegarde locale uniquement');
      saveProfile.disabled = false;
      return;
    }
    toast('Profil enregistré');
    saveProfile.disabled = false;
  });

  cancelProfile?.addEventListener('click', async () => { await populate(); toast('Annulé'); });

  // pwd save
  pwdForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    savePwd.disabled = true;
    const cur = (currentPwd.value || '').trim();
    const np = (newPwd.value || '').trim();
    const cp = (confirmPwd.value || '').trim();
    if (!cur || !np || np.length < 6) { toast('Champs invalides'); savePwd.disabled = false; return; }
    if (np !== cp) { toast('Les mots de passe ne correspondent pas'); savePwd.disabled = false; return; }
    const r = await apiFetch('/api/user/change-password', { method: 'POST', body: { current: cur, password: np } });
    if (!r || !r.ok) { toast((r && r.error) || 'Échec'); savePwd.disabled = false; return; }
    toast('Mot de passe mis à jour');
    currentPwd.value = ''; newPwd.value = ''; confirmPwd.value = '';
    savePwd.disabled = false;
  });

  cancelPwd?.addEventListener('click', () => { currentPwd.value=''; newPwd.value=''; confirmPwd.value=''; toast('Annulé'); });

  (async () => { try { await populate(); } catch (e) { console.error(e); location.href='index.html'; } })();
})();

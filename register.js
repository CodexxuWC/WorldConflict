// register.js — formulaire d'inscription (refactoré)
// - Utilise WC.apiFetch (utils.js) avec fallback minimal
// - Normalise les réponses { ok, status, data, error }
// - Remplace alert() par WC.showMessage / toast fallback
// - TODO: nettoyer fallback (force register) quand backend stable
(() => {
  const form = document.getElementById('registerForm');
  const togglePassword = document.getElementById('togglePassword');
  const year = document.getElementById('year');
  const acceptCheckbox = document.getElementById('acceptCheckbox');
  const rulesLink = document.getElementById('rulesLink');
  const submitBtn = document.getElementById('submitBtn');
  const emailInput = document.getElementById('email');
  const usernameInput = document.getElementById('username');

  // create email status element if missing
  let emailStatusEl = document.getElementById('emailStatus');
  if (!emailStatusEl && emailInput) {
    emailStatusEl = document.createElement('div');
    emailStatusEl.id = 'emailStatus';
    emailStatusEl.style.marginTop = '8px';
    emailStatusEl.style.fontSize = '13px';
    emailStatusEl.className = 'muted';
    emailInput.insertAdjacentElement('afterend', emailStatusEl);
  }

  if (year) year.textContent = new Date().getFullYear();
  if (submitBtn) submitBtn.disabled = true;

  // local state
  let emailAvailable = null; // true | false | null
  let checkAttempts = 0;
  const MAX_ATTEMPTS = 3;
  let checking = false;
  let checkTimer = null;

  function setEmailStatus(text = '', type = 'info') {
    if (!emailStatusEl) return;
    emailStatusEl.textContent = text;
    emailStatusEl.classList.remove('msg-error', 'msg-success', 'msg-info');
    emailStatusEl.classList.add(type === 'success' ? 'msg-success' : type === 'error' ? 'msg-error' : 'msg-info');
  }

  function showMessage(elOrId, text, type = 'error', timeout = 4000) {
    // prefer WC.showMessage if available
    if (window.WC && typeof window.WC.showMessage === 'function') {
      try { window.WC.showMessage(elOrId, text, type, timeout); return; } catch (e) { /* fallback */ }
    }
    // if elOrId is element, use it
    let el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (el) {
      el.textContent = text;
      el.className = `msg msg-${type}`;
      if (timeout) setTimeout(() => { if (el) el.textContent = ''; }, timeout);
      return;
    }
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = text;
      toast.classList.remove('visually-hidden');
      setTimeout(() => toast.classList.add('visually-hidden'), timeout || 3200);
      return;
    }
    // last resort
    if (type === 'error') console.error(text);
    else console.warn(text);
  }

  function normalizeResponse(resp) {
    if (!resp) return null;
    if (typeof resp === 'object' && ('ok' in resp)) {
      return { ok: !!resp.ok, status: resp.status || 0, data: resp.data === undefined ? null : resp.data, error: resp.error || null };
    }
    // wrapper shape { data: { ok: true, data: {...} } }
    if (resp && resp.data && typeof resp.data === 'object' && ('ok' in resp.data)) {
      return { ok: !!resp.data.ok, status: resp.status || 0, data: resp.data.data === undefined ? null : resp.data.data, error: resp.data.error || null };
    }
    // raw payload
    return { ok: true, status: 200, data: resp, error: null };
  }

  // apiFetch helper: prefers WC.apiFetch (utils.js) else minimal fetch fallback
  async function apiFetch(url, opts = {}) {
    if (window.WC && typeof window.WC.apiFetch === 'function') {
      try {
        return await window.WC.apiFetch(url, opts);
      } catch (e) {
        return { ok: false, status: 0, error: e && e.message ? e.message : 'WC.apiFetch error' };
      }
    }
    // minimal fallback (shouldn't be used if utils.js is loaded)
    try {
      const final = Object.assign({}, opts);
      final.credentials = final.credentials || 'same-origin';
      final.headers = Object.assign({}, final.headers || {});
      if (final.body && typeof final.body === 'object' && !(final.body instanceof FormData)) {
        if (!final.headers['Content-Type'] && !final.headers['content-type']) final.headers['Content-Type'] = 'application/json';
        const ct = (final.headers['Content-Type'] || final.headers['content-type'] || '').toLowerCase();
        if (ct.includes('application/json')) final.body = JSON.stringify(final.body);
      }
      const r = await fetch(url, final);
      const ct = r.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await r.json() : await r.text();
      if (!r.ok) return { ok: false, status: r.status, data, error: (data && data.error) || (typeof data === 'string' ? data : 'Erreur') };
      return { ok: true, status: r.status, data };
    } catch (e) {
      return { ok: false, status: 0, error: e && e.message ? e.message : 'Network error' };
    }
  }

  function updateSubmitState() {
    const accepted = !!(acceptCheckbox && acceptCheckbox.checked);
    const allowFallback = (emailAvailable === null && checkAttempts >= MAX_ATTEMPTS);
    const ok = accepted && (emailAvailable === true || allowFallback);
    if (submitBtn) submitBtn.disabled = !ok;
  }

  // toggle password visibility
  if (togglePassword) {
    togglePassword.addEventListener('click', () => {
      const pass = document.getElementById('password');
      if (!pass) return;
      pass.type = pass.type === 'password' ? 'text' : 'password';
      togglePassword.setAttribute('aria-pressed', pass.type === 'text');
    });
  }

  if (rulesLink) rulesLink.addEventListener('click', (e) => { e.preventDefault(); /* intentionally noop */ });

  // Email check (debounced)
  async function doCheckEmail(email) {
    if (!email || email.indexOf('@') === -1) {
      emailAvailable = null;
      setEmailStatus('', 'info');
      updateSubmitState();
      return;
    }

    checking = true;
    checkAttempts++;
    setEmailStatus('Vérification de l’adresse…', 'info');

    try {
      const raw = await apiFetch('/api/check-email', { method: 'POST', body: { email } });
      const resp = normalizeResponse(raw);

      if (!resp || !resp.ok || resp.data === null || resp.data === undefined) {
        emailAvailable = null;
        setEmailStatus('Impossible de vérifier l’e-mail (erreur serveur).', 'error');
      } else {
        // possible shapes: resp.data = { available: true } OR resp.data.available, OR resp.data.data.available
        const payload = (typeof resp.data === 'object') ? resp.data : {};
        const available = ('available' in payload) ? payload.available : (payload.data && typeof payload.data === 'object' && 'available' in payload.data ? payload.data.available : undefined);

        if (available === undefined) {
          emailAvailable = null;
          setEmailStatus('Vérification indisponible actuellement.', 'error');
        } else {
          emailAvailable = !!available;
          if (emailAvailable) setEmailStatus('Adresse disponible ✅', 'success');
          else setEmailStatus('Cette adresse est déjà utilisée.', 'error');
        }
      }
    } catch (err) {
      console.warn('checkEmail error', err);
      emailAvailable = null;
      setEmailStatus('Erreur réseau — impossible de vérifier l’e-mail.', 'error');
    } finally {
      checking = false;
      updateSubmitState();
    }
  }

  if (emailInput) {
    emailInput.addEventListener('input', () => {
      emailAvailable = null;
      setEmailStatus('', 'info');
      updateSubmitState();
      if (checkTimer) clearTimeout(checkTimer);
      checkTimer = setTimeout(() => doCheckEmail(emailInput.value.trim()), 500);
    });
  }

  // Form submit (register)
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = form.username?.value?.trim();
      const email = form.email?.value?.trim();
      const password = form.password?.value;
      const confirm = form.confirm?.value;
      const accepted = !!(acceptCheckbox && acceptCheckbox.checked);

      // client validation
      if (!username || username.length < 3) return showMessage(null, "Nom d'utilisateur : au moins 3 caractères.", 'error');
      if (!email || email.indexOf('@') === -1) return showMessage(null, 'Adresse e-mail invalide.', 'error');
      if (!password || password.length < 6) return showMessage(null, 'Mot de passe : au moins 6 caractères.', 'error');
      if (password !== confirm) return showMessage(null, 'Les mots de passe ne correspondent pas.', 'error');
      if (!accepted) return showMessage(null, 'Tu dois accepter la politique et les règlements.', 'error');
      if (emailAvailable === false) return showMessage(null, "Cette adresse e-mail est déjà utilisée. Utilise une autre adresse.", 'error');

      // if check not possible and attempts low, force confirmation
      if (emailAvailable === null && checkAttempts < MAX_ATTEMPTS) {
        // TODO: once backend is reliable, remove this forced path and require server verification
        const cont = window.confirm("La vérification de l'email n'a pas abouti — veux-tu attendre la vérification (recommandé) ?\n\nAnnuler = attendre, OK = forcer l'inscription.");
        if (!cont) return;
      }

      // loading state
      if (window.WC && typeof window.WC.setBtnLoading === 'function') {
        try { window.WC.setBtnLoading(submitBtn, true, 'Création du compte...'); } catch (e) { submitBtn.disabled = true; }
      } else if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Création du compte...';
      }

      try {
        const raw = await apiFetch('/api/register', { method: 'POST', body: { username, email, password } });
        const resp = normalizeResponse(raw);

        if (!resp || !resp.ok) {
          const err = resp && resp.error ? resp.error : 'Impossible de créer le compte';
          showMessage(null, 'Erreur : ' + err, 'error');
          if (window.WC && typeof window.WC.setBtnLoading === 'function') try { window.WC.setBtnLoading(submitBtn, false); } catch(e) {}
          else if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Créer un compte'; }
          return;
        }

        // Backend may return { ok: true } inside resp.data
        const payload = (resp.data && typeof resp.data === 'object') ? resp.data : {};
        if ('ok' in payload && !payload.ok) {
          showMessage(null, 'Erreur : ' + (payload.error || 'Impossible de créer le compte'), 'error');
          if (window.WC && typeof window.WC.setBtnLoading === 'function') try { window.WC.setBtnLoading(submitBtn, false); } catch(e) {}
          else if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Créer un compte'; }
          return;
        }

        // success
        showMessage(null, 'Compte créé ✅ — tu peux maintenant te connecter.', 'success', 5000);

        // small delay to show message then redirect
        setTimeout(() => { location.href = 'index.html'; }, 900);
      } catch (err) {
        console.error('Register error', err);
        showMessage(null, 'Erreur réseau — impossible de joindre le serveur.', 'error');
        if (window.WC && typeof window.WC.setBtnLoading === 'function') try { window.WC.setBtnLoading(submitBtn, false); } catch(e) {}
        else if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Créer un compte'; }
      }
    });
  }

  // re-enable submit button when terms checkbox toggled (manual)
  if (acceptCheckbox) acceptCheckbox.addEventListener('change', updateSubmitState);

})();

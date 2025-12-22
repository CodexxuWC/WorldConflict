// index.js — login (refactoré)
// - Utilise WC.apiFetch (utils.js)
// - Normalise les réponses API { ok, status, data, error }
// - Gestion uniforme des erreurs et fallback d'affichage
(() => {
  // éléments du DOM
  const form = document.getElementById('loginForm');
  const togglePassword = document.getElementById('togglePassword');
  const createAccount = document.getElementById('createAccount');
  const yearEl = document.getElementById('year');
  const userInput = document.getElementById('userInput');
  const passwordInput = document.getElementById('passwordInput');

  // afficher année
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // pré-remplir si "se souvenir" a été utilisé
  try {
    const remembered = localStorage.getItem('wc_remember_user');
    if (remembered && userInput) userInput.value = remembered;
  } catch (e) {
    console.warn('localStorage inaccessible', e);
  }

  // toggle mot de passe (safe)
  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {
      passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
      togglePassword.setAttribute('aria-pressed', passwordInput.type === 'text');
    });
  }

  // ouvrir la page d'inscription
  if (createAccount) {
    createAccount.addEventListener('click', () => {
      location.href = 'register.html';
    });
  }

  // --- Helpers: affichage messages et normalisation réponse ---
  function showMessage(el, msg, type = 'info') {
    // Prefer WC.showMessage if available
    if (window.WC && typeof window.WC.showMessage === 'function') {
      try { window.WC.showMessage(el, msg, type); return; } catch (e) { /* ignore and fallback */ }
    }
    // Fallback: element with id 'loginMsg' or generic toast
    if (el) {
      el.textContent = msg;
      el.className = `msg msg-${type}`;
      return;
    }
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = msg;
      toast.classList.remove('visually-hidden');
      setTimeout(() => toast.classList.add('visually-hidden'), 3200);
      return;
    }
    // Last resort: console
    if (type === 'error') console.error(msg);
    else console.warn(msg);
  }

  /**
   * Normalize API call response into { ok, status, data, error }
   * Accepts:
   *  - Already-normalized object: { ok, status, data, error }
   *  - Wrapper: { ok: true, data: { ...session... } }
   *  - Raw data (assume success): session object
   *  - null/undefined -> null
   */
  function normalizeResponse(resp) {
    if (!resp) return null;
    if (typeof resp === 'object' && ('ok' in resp)) {
      // already normalized
      return {
        ok: !!resp.ok,
        status: resp.status || 0,
        data: resp.data === undefined ? null : resp.data,
        error: resp.error || null
      };
    }
    // possible shape: { ok:true, data: { ok:true, data: {...} } }
    if (resp && resp.data && typeof resp.data === 'object' && ('ok' in resp.data)) {
      return {
        ok: !!resp.data.ok,
        status: resp.status || 0,
        data: resp.data.data === undefined ? null : resp.data.data,
        error: resp.data.error || null
      };
    }
    // fallback: treat as successful raw payload
    return { ok: true, status: 200, data: resp, error: null };
  }

  // --- NOUVELLE LOGIQUE DE SUBMIT (utilise WC.apiFetch) ---
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const user = (form.user?.value || '').trim();
      const password = form.password?.value || '';
      const remember = !!form.querySelector('input[name="remember"]')?.checked;
      const btn = form.querySelector('.btn.primary');

      // créer / récupérer l'élément message
      const msgEl = document.getElementById('loginMsg') || (() => {
        const d = document.createElement('div');
        d.id = 'loginMsg';
        d.className = 'msg';
        form.appendChild(d);
        return d;
      })();

      // validations simples
      if (!user) return showMessage(msgEl, "Renseigne ton email ou nom d'utilisateur.", 'error');
      if (!password || password.length < 6) return showMessage(msgEl, 'Le mot de passe doit contenir au moins 6 caractères.', 'error');

      // set loading
      if (window.WC && typeof window.WC.setBtnLoading === 'function') {
        try { window.WC.setBtnLoading(btn, true, 'Connexion...'); } catch (e) { /* ignore */ }
      } else if (btn) {
        btn.setAttribute('disabled', 'disabled');
      }

      try {
        // appel centralisé — WC.apiFetch est dans utils.js
        const rawResp = await (window.WC && typeof window.WC.apiFetch === 'function'
          ? window.WC.apiFetch('/api/login', { method: 'POST', body: { user, password } })
          : fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, password }) }).then(async r => {
              const ct = r.headers.get && r.headers.get('content-type') || '';
              const data = ct.includes('application/json') ? await r.json() : await r.text();
              return r.ok ? data : { ok: false, status: r.status, error: (data && data.error) || `HTTP ${r.status}` };
            }));

        const resp = normalizeResponse(rawResp);

        if (!resp || !resp.ok) {
          // stop loading
          if (window.WC && typeof window.WC.setBtnLoading === 'function') {
            try { window.WC.setBtnLoading(btn, false); } catch (e) { /* noop */ }
          } else if (btn) {
            btn.removeAttribute('disabled');
          }

          const errMsg = resp && resp.error ? resp.error : 'Identifiants invalides';
          showMessage(msgEl, 'Échec de la connexion — ' + errMsg, 'error');
          return;
        }

        // Optionnel : vérifier resp.data.ok si backend wraps responses
        if (resp.data && typeof resp.data === 'object' && ('ok' in resp.data) && !resp.data.ok) {
          // backend signale une erreur métier
          const businessError = resp.data.error || 'Identifiants invalides';
          showMessage(msgEl, 'Échec de la connexion — ' + businessError, 'error');
          if (window.WC && typeof window.WC.setBtnLoading === 'function') try { window.WC.setBtnLoading(btn, false); } catch(e){}
          else if (btn) btn.removeAttribute('disabled');
          return;
        }

        // gérer "se souvenir"
        try {
          if (remember) localStorage.setItem('wc_remember_user', user);
          else localStorage.removeItem('wc_remember_user');
        } catch (err) { /* noop */ }

        // succès → redirection
        window.location.href = 'dashboard.html';
      } catch (err) {
        // Erreur réseau / inattendue
        if (window.WC && typeof window.WC.setBtnLoading === 'function') {
          try { window.WC.setBtnLoading(btn, false); } catch (e) { /* noop */ }
        } else if (btn) {
          btn.removeAttribute('disabled');
        }
        console.error('Login error', err);
        showMessage(msgEl, 'Erreur réseau — impossible de joindre le serveur.', 'error');
      }
    });
  }
})();

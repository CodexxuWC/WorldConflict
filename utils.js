// utils.js — petites fonctions utilitaires globales (non-module)
// Version améliorée : non-destructive (fusionne dans window.WC), support JSON auto,
// timeout via AbortController, et helper pour token d'auth.
(function (global) {
  // reuse existing WC if present to avoid overwrite
  const WC = Object.assign({}, global.WC || {});

  // affiche l'année dans un élément (id)
  WC.showYear = function (id) {
    const el = document.getElementById(id);
    if (el) el.textContent = new Date().getFullYear();
  };

  // toggle password field by id
  WC.togglePassword = function (inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  };

  // message inline (element or id expected)
  WC.showMessage = function (elOrId, text, type = 'error', timeout = 4000) {
    let el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (!el) return;
    el.textContent = text;
    el.classList.remove('msg-error', 'msg-success', 'msg-info');
    el.classList.add(type === 'success' ? 'msg-success' : type === 'info' ? 'msg-info' : 'msg-error');
    if (timeout) {
      setTimeout(() => {
        if (el) el.textContent = '';
      }, timeout);
    }
  };

  // bouton loading state (element or node) — bascule texte
  WC.setBtnLoading = function (btn, loading, textWhenLoading = 'En cours…', restoreText = null) {
    if (!btn) return;
    if (loading) {
      if (!btn.dataset._orig) btn.dataset._orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = textWhenLoading;
    } else {
      btn.disabled = false;
      btn.textContent = restoreText || btn.dataset._orig || btn.textContent;
      delete btn.dataset._orig;
    }
  };

  // simple auth token helper (Authorization: Bearer <token>)
  WC._authToken = WC._authToken || null;
  WC.setAuthToken = function (token) {
    WC._authToken = token;
  };
  WC.clearAuthToken = function () {
    WC._authToken = null;
  };
  WC.getAuthToken = function () {
    return WC._authToken;
  };

  // wrapper fetch pour JSON, renvoie { ok, status, data, error }
  // opts supports: method, headers, body, credentials, timeout (ms), signal, skipJsonAuto (bool)
  WC.apiFetch = async function (url, opts = {}) {
    const finalOpts = Object.assign({}, opts);
    finalOpts.credentials = finalOpts.credentials || 'same-origin';
    finalOpts.headers = Object.assign({}, finalOpts.headers || {});

    // attach auth token if provided and no Authorization header set
    if (WC._authToken && !finalOpts.headers.Authorization && !finalOpts.headers.authorization) {
      finalOpts.headers.Authorization = 'Bearer ' + WC._authToken;
    }

    // automatic JSON stringify when body is a plain object and not FormData
    if (finalOpts.body && typeof finalOpts.body === 'object' && !(finalOpts.body instanceof FormData) && !finalOpts.skipJsonAuto) {
      if (!finalOpts.headers['Content-Type'] && !finalOpts.headers['content-type']) {
        finalOpts.headers['Content-Type'] = 'application/json';
      }
      // if Content-Type indicates JSON, stringify
      const ct = (finalOpts.headers['Content-Type'] || finalOpts.headers['content-type'] || '').toLowerCase();
      if (ct.includes('application/json')) {
        try {
          finalOpts.body = JSON.stringify(finalOpts.body);
        } catch (e) {
          return { ok: false, status: 0, error: 'Failed to serialize request body' };
        }
      }
    }

    // support timeout via AbortController (opts.timeout in ms)
    let controller;
    let timeoutId;
    if (typeof finalOpts.timeout === 'number' && finalOpts.timeout > 0) {
      controller = new AbortController();
      finalOpts.signal = controller.signal;
      timeoutId = setTimeout(() => controller.abort(), finalOpts.timeout);
      // remove timeout property so fetch doesn't get confused
      delete finalOpts.timeout;
    }

    try {
      const r = await fetch(url, finalOpts);
      if (timeoutId) clearTimeout(timeoutId);

      const ct = r.headers.get('content-type') || '';
      let body = null;
      // handle 204 No Content
      if (r.status === 204) body = null;
      else if (ct.includes('application/json')) {
        try { body = await r.json(); }
        catch (e) { body = null; }
      } else {
        try { body = await r.text(); } catch (e) { body = null; }
      }

      if (!r.ok) {
        const err = body && body.error ? body.error : (typeof body === 'string' ? body : 'Erreur');
        return { ok: false, status: r.status, data: body, error: err };
      }
      return { ok: true, status: r.status, data: body };
    } catch (err) {
      // Aborted?
      if (err && err.name === 'AbortError') {
        return { ok: false, status: 0, error: 'Request timeout' };
      }
      return { ok: false, status: 0, error: err && err.message ? err.message : 'Network error' };
    }
  };

  // require session (client-side redirect helper) : hits /api/session and redirects to index if not ok
  WC.requireSessionOrRedirect = async function (redirectTo = 'index.html') {
    try {
      const r = await WC.apiFetch('/api/session', { method: 'GET' });
      if (!r.ok || !r.data || !r.data.ok) {
        window.location.href = redirectTo;
        return false;
      }
      return r.data;
    } catch (e) {
      window.location.href = redirectTo;
      return false;
    }
  };

  // expose/merge into global (do not overwrite other properties)
  global.WC = Object.assign({}, global.WC || {}, WC);
})(window);

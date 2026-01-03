// notifications.js — professional notifications page
(() => {
  const notifListEl = document.getElementById('notifList');
  const tabs = Array.from(document.querySelectorAll('.notif-tabs .tab'));
  const btnLoadMore = document.getElementById('btnLoadMore');
  const btnMarkAllRead = document.getElementById('btnMarkAllRead');
  const btnClear = document.getElementById('btnClear');
  const toastEl = document.getElementById('toast');

  // nav buttons
  document.getElementById('nav-chat')?.addEventListener('click', () => location.href = 'chat.html');
  document.getElementById('nav-lobby')?.addEventListener('click', () => location.href = 'dashboard.html');
  document.getElementById('nav-notifs')?.addEventListener('click', () => { /* noop */ });
  document.getElementById('nav-profile')?.addEventListener('click', () => location.href = 'profile.html');

  function toast(msg, t = 2800) {
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

  // client state
  let notifications = []; // full list in memory
  let filtered = [];
  let page = 0;
  const PAGE_SIZE = 12;
  let activeFilter = 'all';
  let loading = false;

  // UI helpers
  function isoToNice(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch (e) {
      return iso;
    }
  }

  function renderNotification(n) {
    const item = document.createElement('article');
    item.className = 'notif-item' + (n.read ? '' : ' unread');
    item.dataset.id = n.id;

    const avatar = document.createElement('div');
    avatar.className = 'notif-avatar';
    avatar.textContent = n.source ? n.source[0]?.toUpperCase() : 'WC';

    const body = document.createElement('div');
    body.className = 'notif-body';
    const title = document.createElement('h3');
    title.className = 'notif-title';
    title.textContent = n.title || (n.type || 'Notification');
    const text = document.createElement('p');
    text.className = 'notif-text';
    text.textContent = n.text || '';
    const meta = document.createElement('div');
    meta.className = 'notif-meta';
    meta.innerHTML = `<time datetime="${n.ts}">${isoToNice(n.ts)}</time><span>•</span><span>${n.type?.toUpperCase() || 'GEN'}</span>`;

    body.appendChild(title);
    body.appendChild(text);
    body.appendChild(meta);

    const controls = document.createElement('div');
    controls.className = 'notif-controls';
    const btnToggle = document.createElement('button');
    btnToggle.className = 'icon-btn';
    btnToggle.title = n.read ? 'Marquer non lu' : 'Marquer lu';
    btnToggle.textContent = n.read ? '●' : '○';
    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleRead(n.id);
    });

    const btnOpen = document.createElement('button');
    btnOpen.className = 'icon-btn';
    btnOpen.title = 'Ouvrir';
    btnOpen.textContent = '→';
    btnOpen.addEventListener('click', (e) => {
      e.stopPropagation();
      openNotification(n);
    });

    controls.appendChild(btnToggle);
    controls.appendChild(btnOpen);

    item.appendChild(avatar);
    item.appendChild(body);
    item.appendChild(controls);

    // click opens
    item.addEventListener('click', () => openNotification(n));

    return item;
  }

  function renderPage() {
    if (!notifListEl) return;
    if (page === 0) notifListEl.innerHTML = '';
    const start = page * PAGE_SIZE;
    const chunk = filtered.slice(start, start + PAGE_SIZE);
    for (const n of chunk) {
      notifListEl.appendChild(renderNotification(n));
    }
    // update load more visibility
    if ((page + 1) * PAGE_SIZE >= filtered.length) {
      btnLoadMore?.setAttribute('disabled', 'disabled');
      btnLoadMore?.classList.add('visually-hidden');
    } else {
      btnLoadMore?.removeAttribute('disabled');
      btnLoadMore?.classList.remove('visually-hidden');
    }
  }

  function applyFilter() {
    if (activeFilter === 'all') filtered = notifications.slice().sort((a,b) => (b.ts||'').localeCompare(a.ts||''));
    else filtered = notifications.filter(n => {
      if (activeFilter === 'mentions') return !!n.mention;
      if (activeFilter === 'rp') return (n.category === 'rp' || n.type === 'rp' || n.type === 'announcement');
      if (activeFilter === 'hrp') return (n.category === 'hrp' || n.type === 'hrp');
      if (activeFilter === 'system') return (n.category === 'system' || n.type === 'system');
      return true;
    }).sort((a,b) => (b.ts||'').localeCompare(a.ts||''));
    page = 0;
    renderPage();
  }

  async function loadNotifications() {
    if (loading) return;
    loading = true;
    notifListEl.setAttribute('aria-busy', 'true');
    try {
      const r = await apiFetch('/api/notifications', { method: 'GET' });
      if (!r || !r.ok || !r.data) {
        // fallback demo data
        notifications = generateDemoNotifications();
        toast('Mode démo — notifications locales chargées');
      } else {
        // Try several shapes: { notifications: [...] } or array directly or { data: [...] }
        if (Array.isArray(r.data.notifications)) {
          notifications = r.data.notifications;
        } else if (Array.isArray(r.data)) {
          notifications = r.data;
        } else if (Array.isArray(r.data.data)) {
          notifications = r.data.data;
        } else {
          // last attempt: if r.data has keys and it's not array, try to extract notifications prop or default to empty
          notifications = Array.isArray(r.data.notifications) ? r.data.notifications : (r.data || []);
        }
      }
    } catch (e) {
      notifications = generateDemoNotifications();
      toast('Erreur réseau — mode démo');
    } finally {
      loading = false;
      notifListEl.setAttribute('aria-busy', 'false');
      applyFilter();
    }
  }

  function generateDemoNotifications() {
    const now = Date.now();
    return [
      { id: 'n1', title: 'Nouveau message dans #général', text: 'Salut — bienvenue sur WorldConflict!', ts: new Date(now - 1000*60*10).toISOString(), read: false, type: 'rp', category: 'rp', source: 'Salon' },
      { id: 'n2', title: 'Annonce système', text: 'Maintenance prévue demain 02:00 UTC.', ts: new Date(now - 1000*60*60).toISOString(), read: false, type: 'system', category: 'system', source: 'Sys' },
      { id: 'n3', title: 'Tu as été mentionné', text: '@tu dans #france', ts: new Date(now - 1000*60*60*5).toISOString(), read: true, type: 'mentions', category: 'rp', mention: true, source: 'UserA' },
      { id: 'n4', title: 'Annonce HRP', text: 'Événement communautaire vendredi.', ts: new Date(now - 1000*60*60*24).toISOString(), read: true, type: 'hrp', category: 'hrp', source: 'HRP' },
      { id: 'n5', title: 'Nouvelle politique', text: 'Règlement mis à jour.', ts: new Date(now - 1000*60*60*48).toISOString(), read: false, type: 'system', category: 'system', source: 'Sys' },
    ];
  }

  async function toggleRead(id) {
    const idx = notifications.findIndex(n => n.id === id);
    if (idx === -1) return;
    const current = notifications[idx];
    const newRead = !current.read;
    // optimistic UI
    notifications[idx].read = newRead;
    applyFilter();
    // try server
    try {
      const r = await apiFetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: { read: newRead } });
      if (!r || !r.ok) {
        // revert
        notifications[idx].read = current.read;
        applyFilter();
        toast('Impossible de mettre à jour sur le serveur');
      } else {
        toast(newRead ? 'Marquée comme lue' : 'Marquée non lue', 1200);
      }
    } catch (e) {
      // revert
      notifications[idx].read = current.read;
      applyFilter();
      toast('Erreur réseau');
    }
  }

  function openNotification(n) {
    // Mark read locally if unread
    if (!n.read) {
      n.read = true;
      applyFilter();
      // fire server call but no need to await
      apiFetch(`/api/notifications/${encodeURIComponent(n.id)}/read`, { method: 'POST', body: { read: true } }).catch(()=>{});
    }
    // navigate depending on payload (if provided)
    if (n.url) {
      location.href = n.url;
    } else {
      // open a small modal fallback (alert)
      alert((n.title ? (n.title + '\n\n') : '') + (n.text || ''));
    }
  }

  btnLoadMore?.addEventListener('click', () => {
    page++;
    renderPage();
  });

  btnMarkAllRead?.addEventListener('click', async () => {
    if (!notifications.length) return;
    // optimistic
    notifications.forEach(n => n.read = true);
    applyFilter();
    try {
      const r = await apiFetch('/api/notifications/mark-all-read', { method: 'POST' });
      if (!r || !r.ok) toast('Impossible de marquer toutes côté serveur');
      else toast('Toutes marquées comme lues');
    } catch (e) {
      toast('Erreur réseau');
    }
  });

  btnClear?.addEventListener('click', async () => {
    if (!confirm('Supprimer toutes les notifications ?')) return;
    // optimistic clear
    notifications = [];
    applyFilter();
    try {
      const r = await apiFetch('/api/notifications/clear', { method: 'POST' });
      if (!r || !r.ok) toast('Impossible de vider côté serveur');
      else toast('Notifications supprimées');
    } catch (e) {
      toast('Erreur réseau');
    }
  });

  // tab switching
  tabs.forEach(t => t.addEventListener('click', (e) => {
    tabs.forEach(x => x.classList.remove('active'));
    e.currentTarget.classList.add('active');
    activeFilter = e.currentTarget.dataset.filter || 'all';
    applyFilter();
  }));

  // initial load
  (async () => {
    await loadNotifications();
  })();

})();

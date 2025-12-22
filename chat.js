// chat.js — version améliorée (auto-resize textarea, toasts, ARIA fixes)

(() => {
  // DOM
  const channelSearch = document.getElementById('channelSearch');
  const channelNavText = document.getElementById('channelNavText');
  const channelNavVoice = document.getElementById('channelNavVoice');
  const createChannelBtn = document.getElementById('createChannelBtn');

  const currentChannelName = document.getElementById('currentChannelName');
  const currentChannelInfo = document.getElementById('currentChannelInfo');
  const messagesEl = document.getElementById('messages');
  const sendForm = document.getElementById('sendForm');
  const msgInput = document.getElementById('msgInput');
  const membersList = document.getElementById('membersList');
  const rightInfo = document.getElementById('rightInfo');

  const membersBtn = document.getElementById('membersBtn');
  const membersOverlay = document.getElementById('membersOverlay');
  const overlayActive = document.getElementById('overlayActive');
  const overlayInactive = document.getElementById('overlayInactive');
  const closeMembers = document.getElementById('closeMembers');
  const voiceControlsEl = document.getElementById('voiceControls');

  const navChat = document.getElementById('navChat');
  const navDashboard = document.getElementById('navDashboard');
  const navNotifs = document.getElementById('navNotifs');
  const navProfile = document.getElementById('navProfile');
  const leaveChannelBtn = document.getElementById('leaveChannelBtn');

  const toastEl = document.getElementById('wcToast');

  // state
  const LS_PREFIX = 'wc_chat_final_v2_';
  let channels = [];
  let current = null;
  let session = null;

  const DEFAULT_CHANNELS = [
    { id: 'global', name: '# global', type: 'text', topic: 'Salon global' },
    { id: 'general', name: '# général', type: 'text', topic: 'Discussions générales' },
    { id: 'diplomatie', name: '# diplomatie', type: 'text', topic: 'Affaires étrangères' },
    { id: 'vc-lobby', name: 'Lobby vocal', type: 'voice', topic: 'Canal vocal' },
    { id: 'vc-ops', name: 'Opérations (vocal)', type: 'voice', topic: 'Vocal — Opérations' }
  ];

  // storage helpers
  const lsKey = k => LS_PREFIX + k;
  function loadChannels() {
    try {
      const raw = localStorage.getItem(lsKey('channels'));
      channels = raw ? JSON.parse(raw) : DEFAULT_CHANNELS.slice();
      if (!Array.isArray(channels)) channels = DEFAULT_CHANNELS.slice();
    } catch {
      channels = DEFAULT_CHANNELS.slice();
    }
  }
  function saveChannels() { localStorage.setItem(lsKey('channels'), JSON.stringify(channels)); }

  function loadMessages(chId) {
    try {
      const raw = localStorage.getItem(lsKey('messages_' + chId));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  function saveMessages(chId, msgs) { localStorage.setItem(lsKey('messages_' + chId), JSON.stringify(msgs)); }
  function addMessage(chId, msg) {
    const msgs = loadMessages(chId);
    msgs.push(msg);
    saveMessages(chId, msgs);
  }

  // voice simulation keys
  function voiceKey(chId) { return lsKey('voice_' + chId); }
  function muteKey(chId) { return lsKey('mute_' + chId); }
  function isVoiceConnected(chId) { return !!localStorage.getItem(voiceKey(chId)); }
  function setVoiceConnected(chId, val) {
    if (val) localStorage.setItem(voiceKey(chId), JSON.stringify({ ts: Date.now() }));
    else localStorage.removeItem(voiceKey(chId));
  }
  function isMuted(chId) { try { const v = JSON.parse(localStorage.getItem(muteKey(chId))); return !!v?.muted; } catch { return false; } }
  function setMuted(chId, muted) { localStorage.setItem(muteKey(chId), JSON.stringify({ muted: !!muted })); }

  // session fetch
  async function fetchSession() {
    try {
      if (window.WC && typeof WC.apiFetch === 'function') {
        const r = await WC.apiFetch('/api/session', { method: 'GET' });
        if (r && r.ok && r.data) return r.data;
      }
      const r2 = await fetch('/api/session', { credentials: 'same-origin' });
      return await r2.json();
    } catch (e) {
      console.error('session fetch failed', e);
      return null;
    }
  }

  // toast (replacement for alert)
  let toastTimer = null;
  function showToast(text, duration = 2800) {
    if (!toastEl) { console.log('[toast]', text); return; }
    toastEl.textContent = text;
    toastEl.style.display = 'flex';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.style.display = 'none';
    }, duration);
  }

  // render sidebar
  function renderSidebar(filter = '') {
    channelNavText.innerHTML = '';
    channelNavVoice.innerHTML = '';
    const q = (filter || '').toLowerCase().trim();

    const textNodes = channels.filter(c => c.type === 'text' && (!q || searchable(c).includes(q))).map(makeChannelListItem);
    const voiceNodes = channels.filter(c => c.type === 'voice' && (!q || searchable(c).includes(q))).map(makeChannelListItem);

    if (textNodes.length) textNodes.forEach(n => channelNavText.appendChild(n));
    else channelNavText.innerHTML = '<li class="muted small">Aucun salon textuel</li>';

    if (voiceNodes.length) voiceNodes.forEach(n => channelNavVoice.appendChild(n));
    else channelNavVoice.innerHTML = '<li class="muted small">Aucun salon vocal</li>';
  }

  function searchable(c) { return (c.name + ' ' + (c.topic || '') + ' ' + (c.id || '')).toLowerCase(); }

  function makeChannelListItem(c) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'channel-btn' + (current === c.id ? ' active' : '');
    btn.type = 'button';
    btn.dataset.id = c.id;
    btn.setAttribute('aria-label', `${c.name} — ${c.topic || ''}`);
    btn.setAttribute('role', 'button');

    const iconSVG = c.type === 'voice'
      ? '<span class="ch-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10a3 3 0 0 0 6 0V3h-6zM3 9v2a7 7 0 0 0 7 7h0a7 7 0 0 0 7-7V9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'
      : '<span class="ch-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span>';

    const connectedDot = (c.type === 'voice' && isVoiceConnected(c.id)) ? '<span class="voice-dot" aria-hidden="true"></span>' : '';
    btn.innerHTML = `${iconSVG}<span class="ch-label">${escapeHtml(c.name)}</span>${connectedDot}`;
    btn.addEventListener('click', () => openChannel(c.id));
    li.appendChild(btn);
    return li;
  }

  // render messages
  function renderMessages(autoScroll = true) {
    messagesEl.innerHTML = '';
    if (!current) return;
    const msgs = loadMessages(current);
    if (!msgs.length) {
      const info = document.createElement('div'); info.className = 'muted'; info.textContent = 'Aucun message — commence la discussion.'; messagesEl.appendChild(info); return;
    }
    for (const m of msgs) {
      const el = document.createElement('article');
      const me = session && (m.user === session.username);
      el.className = 'msg' + (me ? ' me' : '');
      const d = safeDate(m.ts);
      const ts = d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      el.innerHTML = `<div class="who">${escapeHtml(m.userDisplay || m.user)} <span class="time">${ts}</span></div><div class="text">${escapeHtml(m.text)}</div>`;
      messagesEl.appendChild(el);
    }
    if (autoScroll) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // open channel
  function openChannel(id) {
    current = id;
    const ch = channels.find(c => c.id === id) || { name: id, type: 'text', topic: '' };
    currentChannelName.textContent = ch.name || id;
    currentChannelInfo.textContent = ch.topic || '—';
    localStorage.setItem(lsKey('last_channel'), current);
    renderSidebar(channelSearch.value || '');
    renderMessages();
    renderMembersList();
    updateVoiceControls(ch);
    // restore focus to message input
    setTimeout(() => msgInput?.focus(), 120);
    // update active class more robustly
    document.querySelectorAll('.channel-btn').forEach(b => {
      if (b.dataset.id === id) b.classList.add('active'); else b.classList.remove('active');
    });
  }

  // members list
  function renderMembersList() {
    membersList.innerHTML = '';
    if (!current) return;
    const msgs = loadMessages(current);
    const lastTs = {};
    const s = new Set();
    msgs.forEach(m => { s.add(m.user); lastTs[m.user] = Math.max(lastTs[m.user] || 0, new Date(m.ts).getTime()); });
    if (session && session.username) { s.add(session.username); lastTs[session.username] = Math.max(lastTs[session.username] || 0, Date.now()); }
    if (!s.size) { membersList.innerHTML = '<li class="muted">—</li>'; return; }
    const arr = Array.from(s);
    arr.forEach(u => {
      const last = lastTs[u] || 0;
      const active = (Date.now() - last) < (1000 * 60 * 60);
      const li = document.createElement('li');
      li.innerHTML = `<span>${escapeHtml(u)}</span><span class="small">${active ? 'actif' : 'inactif'}</span>`;
      membersList.appendChild(li);
    });
  }

  // members overlay
  function populateMembersOverlay() {
    overlayActive.innerHTML = '';
    overlayInactive.innerHTML = '';
    const users = {};
    channels.forEach(ch => {
      const msgs = loadMessages(ch.id);
      msgs.forEach(m => { const t = new Date(m.ts).getTime(); users[m.user] = Math.max(users[m.user] || 0, t); });
    });
    if (session && session.username) users[session.username] = Math.max(users[session.username] || 0, Date.now());
    const now = Date.now();
    const active = [], inactive = [];
    Object.keys(users).forEach(u => ((now - users[u]) < (1000 * 60 * 60) ? active.push({u,t:users[u]}) : inactive.push({u,t:users[u]})));
    active.sort((a,b) => b.t - a.t); inactive.sort((a,b) => b.t - a.t);
    if (!active.length) overlayActive.innerHTML = '<li class="muted">Aucun membre actif</li>';
    else active.forEach(x => overlayActive.appendChild(memberLi(x.u)));
    if (!inactive.length) overlayInactive.innerHTML = '<li class="muted">Aucun membre inactif</li>';
    else inactive.forEach(x => overlayInactive.appendChild(memberLi(x.u)));
  }
  function memberLi(u) { const li = document.createElement('li'); li.className = 'member-item'; li.textContent = u; return li; }

  // voice controls
  function updateVoiceControls(ch) {
    voiceControlsEl.innerHTML = '';
    if (!ch || ch.type !== 'voice') {
      voiceControlsEl.setAttribute('aria-hidden', 'true'); return;
    }
    voiceControlsEl.setAttribute('aria-hidden', 'false');
    const joined = isVoiceConnected(ch.id);
    const muted = isMuted(ch.id);

    const joinBtn = document.createElement('button');
    joinBtn.className = 'btn ghost small';
    joinBtn.textContent = joined ? 'Quitter vocal' : 'Rejoindre vocal';
    joinBtn.setAttribute('aria-pressed', String(joined));
    joinBtn.addEventListener('click', () => {
      setVoiceConnected(ch.id, !joined);
      const sysText = !joined ? `${session.username} a rejoint le canal vocal.` : `${session.username} a quitté le canal vocal.`;
      addMessage(ch.id, { id: 'sys-' + Date.now(), user: 'system', userDisplay: 'System', text: sysText, ts: new Date().toISOString() });
      renderSidebar(channelSearch.value || '');
      updateVoiceControls(ch);
      renderMessages();
      renderMembersList();
      showToast(!joined ? 'Connecté au vocal' : 'Déconnecté du vocal');
    });

    const muteBtn = document.createElement('button');
    muteBtn.className = 'btn ghost small';
    muteBtn.textContent = muted ? 'Muet' : 'Activer muet';
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.addEventListener('click', () => {
      setMuted(ch.id, !muted);
      updateVoiceControls(ch);
      showToast(!muted ? 'Micro mis en sourdine' : 'Micro réactivé');
    });

    voiceControlsEl.appendChild(joinBtn);
    voiceControlsEl.appendChild(muteBtn);
  }

  // send message handlers
  sendForm?.addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });
  msgInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  function sendMessage() {
    const txt = (msgInput.value || '').trim();
    if (!txt || !current) return showToast('Message vide ou salon non sélectionné', 1800);
    const user = session?.username || 'anonyme';
    const display = session?.rp?.displayName || session?.username || user;
    const msg = { id: Date.now() + '-' + Math.random().toString(36).slice(2,8), user, userDisplay: display, text: txt, ts: new Date().toISOString() };
    addMessage(current, msg);
    msgInput.value = '';
    autoResizeTextarea();
    renderMessages();
    renderSidebar(channelSearch.value || '');
    renderMembersList();
    showToast('Message envoyé', 900);
  }

  // create channel flow (no alerts)
  createChannelBtn?.addEventListener('click', () => {
    const name = prompt('Nom du salon (ex: diplomatie) — sans # :');
    if (!name) { showToast('Création annulée', 900); return; }
    const id = slugify(name);
    if (!id) return showToast('Nom invalide', 1400);
    if (channels.find(c => c.id === id)) return showToast('Ce salon existe déjà', 1400);
    const voice = confirm('Créer un canal vocal ? OK = vocal, Annuler = textuel.');
    const ch = { id, name: voice ? name.trim() : ('# ' + name.trim()), type: voice ? 'voice' : 'text', topic: voice ? 'Canal vocal' : 'Nouveau salon' };
    channels.push(ch); saveChannels();
    renderSidebar(channelSearch.value || '');
    openChannel(id);
    showToast(`Salon créé : ${ch.name}`, 1600);
  });

  // search debounce
  function debounce(fn, wait = 200) { let t = null; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); }; }
  channelSearch?.addEventListener('input', debounce(e => renderSidebar(e.target.value || ''), 150));

  // leave channel
  leaveChannelBtn?.addEventListener('click', () => {
    if (!current) return;
    if (current === 'global') return showToast('Impossible de quitter le salon global', 1200);
    openChannel('global');
    showToast('Tu as quitté le salon', 1000);
  });

  // nav
  navChat?.addEventListener('click', () => setNavActive('chat'));
  navDashboard?.addEventListener('click', () => { setNavActive('dashboard'); window.location.href = 'dashboard.html'; });
  navNotifs?.addEventListener('click', () => setNavActive('notifs'));
  navProfile?.addEventListener('click', () => { setNavActive('profile'); window.location.href = 'profile.html'; });
  function setNavActive(k) {
    [navChat, navDashboard, navNotifs, navProfile].forEach(n => n?.classList?.remove('active'));
    if (k === 'chat') navChat?.classList?.add('active');
    if (k === 'dashboard') navDashboard?.classList?.add('active');
    if (k === 'notifs') navNotifs?.classList?.add('active');
    if (k === 'profile') navProfile?.classList?.add('active');
  }

  // members overlay toggle
  membersBtn?.addEventListener('click', () => {
    const opened = membersOverlay.getAttribute('aria-hidden') === 'false';
    if (opened) closeMembersOverlay(); else openMembersOverlay();
  });
  closeMembers?.addEventListener('click', closeMembersOverlay);
  function openMembersOverlay() {
    membersOverlay.setAttribute('aria-hidden', 'false');
    membersBtn.setAttribute('aria-expanded', 'true');
    membersBtn.setAttribute('aria-pressed', 'true');
    populateMembersOverlay();
    // put focus on close for keyboard users
    setTimeout(() => closeMembers?.focus(), 60);
  }
  function closeMembersOverlay() {
    membersOverlay.setAttribute('aria-hidden', 'true');
    membersBtn.setAttribute('aria-expanded', 'false');
    membersBtn.setAttribute('aria-pressed', 'false');
    membersBtn?.focus();
  }

  // utilities
  function escapeHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function safeDate(iso) { try { return iso ? new Date(iso) : null; } catch { return null; } }
  function slugify(s) { if (!s) return ''; return s.toString().toLowerCase().trim().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'').replace(/\-+/g,'-'); }

  // auto-resize textarea
  function autoResizeTextarea() {
    if (!msgInput) return;
    msgInput.style.height = 'auto';
    const sh = Math.min(msgInput.scrollHeight, 280);
    msgInput.style.height = (sh) + 'px';
  }
  msgInput?.addEventListener('input', autoResizeTextarea);

  // init
  (async () => {
    loadChannels();
    session = await fetchSession();
    if (!session || !session.ok) {
      showToast('Tu dois être connecté pour accéder au chat.', 2000);
      setTimeout(() => window.location.href = 'index.html', 800);
      return;
    }
    document.getElementById('headerSub').textContent = `${session.username} — connecté`;

    const last = localStorage.getItem(lsKey('last_channel'));
    const initial = last && channels.find(c => c.id === last) ? last : (channels[0] && channels[0].id) || 'global';

    // ensure welcome system message
    if (!loadMessages('global')?.length) {
      addMessage('global', { id: 'sys-1', user: 'system', userDisplay: 'WorldConflict', text: 'Bienvenue sur WorldConflict — respecte les règles.', ts: new Date().toISOString() });
    }

    renderSidebar();
    openChannel(initial);
    setNavActive('chat');

    // escape to close overlay
    window.addEventListener('keydown', e => { if (e.key === 'Escape') closeMembersOverlay(); });
    // persist last channel
    window.addEventListener('beforeunload', () => { if (current) localStorage.setItem(lsKey('last_channel'), current); });
  })();

})();

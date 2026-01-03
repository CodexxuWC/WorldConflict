// app.js — first-pass shell + lightweight panel loader (function(){ // global namespace window.WC = window.WC || {};

// minimal event emitter class Emitter{ constructor(){ this._ev = document.createElement('div'); } on(name, cb){ this._ev.addEventListener(name, cb); } off(name, cb){ this._ev.removeEventListener(name, cb); } emit(name, detail){ this._ev.dispatchEvent(new CustomEvent(name, { detail })); } }

// global state WC.state = { session: null, panel: 'lobby', ready: false }; WC.events = new Emitter();

// helper: central apiFetch wrapper (delegates to existing WC.apiFetch if present) async function apiFetch(url, opts){ if (window.WC && typeof window.WC.apiFetch === 'function' && window.WC.apiFetch !== apiFetch) { return await window.WC.apiFetch(url, opts); } // lightweight fallback const final = Object.assign({}, opts); final.credentials = final.credentials || 'same-origin'; final.headers = Object.assign({}, final.headers || {}); if (final.body && typeof final.body === 'object' && !(final.body instanceof FormData)){ if (!final.headers['Content-Type'] && !final.headers['content-type']) final.headers['Content-Type'] = 'application/json'; const ct = (final.headers['Content-Type'] || final.headers['content-type'] || '').toLowerCase(); if (ct.includes('application/json')) final.body = JSON.stringify(final.body); } try{ const r = await fetch(url, final); const ct = (r.headers.get && r.headers.get('content-type')) || ''; const data = ct.includes('application/json') ? await r.json() : await r.text(); if (!r.ok) return { ok:false, status:r.status, data, error: (data && data.error) || HTTP ${r.status} }; return { ok:true, status:r.status, data }; }catch(e){ return { ok:false, status:0, error: e && e.message ? e.message : 'Network error' }; } }

// panel system: panels can be provided as templates (inline) OR as separate JS modules in /panels/<name>.js const panelContainer = document.getElementById('wc-panel-container'); const templates = Array.from(document.querySelectorAll('template[id^="tpl-"]')).reduce((acc, t) => { acc[t.id.replace('tpl-','')] = t; return acc }, {});

// register click listeners for left nav document.querySelectorAll('.wc-servers .server').forEach(b => { b.addEventListener('click', (e) => { const p = e.currentTarget.dataset.panel; if (!p) return; loadPanel(p); document.querySelectorAll('.wc-servers .server').forEach(x => x.classList.remove('active')); e.currentTarget.classList.add('active'); }); });

document.getElementById('btnLogout')?.addEventListener('click', ()=>{ location.href = 'index.html'; });

// panel loader async function loadPanel(name){ WC.state.panel = name; // update breadcrumb const bc = document.getElementById('wc-breadcrumb'); if (bc) bc.textContent = name.charAt(0).toUpperCase() + name.slice(1);

// first try to lazy-load a JS module for the panel
const modulePath = `panels/${name}.js`;

// clear container
panelContainer.innerHTML = '';

// try module loader
try{
  // Check if module file exists by attempting to fetch its headers (fast) — if fails, fall back to template
  const head = await fetch(modulePath, { method:'HEAD' });
  if (head.ok){
    // inject script dynamically and let it mount its UI to wc-panel-container
    await loadScript(modulePath);
    // module is expected to call WC.mountPanel(name, el) or handle its own mounting
    return;
  }
}catch(e){ /* ignore and fallback to template */ }

// fallback to inline template
const tpl = templates[name] || templates['lobby'];
const clone = tpl.content.cloneNode(true);
panelContainer.appendChild(clone);

// run light client-side init for known panels
if (name === 'lobby') initLobby();
if (name === 'chat') initChat();

}

function loadScript(src){ return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.defer = true; s.onload = () => resolve(); s.onerror = (e) => reject(new Error('Failed to load ' + src)); document.body.appendChild(s); }); }

// sample small in-panel initializers (keep lightweight) function initLobby(){ const el = document.getElementById('lobby-state'); if (!el) return; el.textContent = 'Aucun RP actif — status snapshot.'; // attempt to fetch a lightweight /api/session to show username (async()=>{ const r = await apiFetch('/api/session', { method:'GET' }); if (r && r.ok && r.data){ WC.state.session = r.data; const userEl = document.getElementById('wc-user'); if (userEl) userEl.textContent = r.data.username || '—'; el.textContent = Connecté en tant que ${r.data.username || '—'}; } else { const userEl = document.getElementById('wc-user'); if (userEl) userEl.textContent = 'invité'; } })(); }

function initChat(){ const form = document.getElementById('chatForm'); const messages = document.getElementById('chatMessages'); if (!form || !messages) return; form.addEventListener('submit', async (e) => { e.preventDefault(); const input = document.getElementById('chatInput'); if (!input || !input.value.trim()) return; const text = input.value.trim(); // optimistic UI const el = document.createElement('div'); el.textContent = 'Moi: ' + text; messages.appendChild(el); messages.scrollTop = messages.scrollHeight; input.value = ''; try{ await apiFetch('/api/chat/send', { method:'POST', body: { text } }); }catch(e){ console.warn('send chat failed', e); } }); }

// allow external modules to mount elements into the panel container WC.mountPanel = function(name, el){ panelContainer.innerHTML = ''; if (typeof el === 'string') panelContainer.innerHTML = el; else if (el instanceof Node) panelContainer.appendChild(el); };

// start (function(){ // initial panel from markup or default const initial = WC.state.panel || 'lobby'; loadPanel(initial).catch((e)=>{ console.error('loadPanel error', e); // show fallback const tpl = templates['lobby']; panelContainer.appendChild(tpl.content.cloneNode(true)); });

WC.state.ready = true;
WC.events.emit('ready');

})();

})();

// market.js — Front (strict) : PAS de demo fallback, PAS de génération d'items.
// Doit être utilisé avec une API backend exposant:
//   GET  /api/market/catalog
//   GET  /api/market/snapshot
//   POST /api/market/quote   { itemId, qty, countryId }
//   POST /api/market/trade   { actor, itemId, qty, countryId, side }
// Si l'API est absente, l'UI sera désactivée et affichera un message clair.

const D = document;
const $ = sel => D.querySelector(sel);

// DOM refs (assume market.html structure unchanged)
const itemListEl = $('#itemList');
const searchInput = $('#searchInput');
const searchBtn = $('#searchBtn');
const viewAllBtn = $('#viewAllBtn');

const selectedItemEl = $('#selectedItem');
const itemIdInput = $('#itemId');
const qtyInput = $('#qty');
const countryIdInput = $('#countryId');
const getQuoteBtn = $('#getQuoteBtn');
const quoteResultEl = $('#quoteResult');
const tradeControlsEl = $('#tradeControls');
const buyBtn = $('#buyBtn');
const sellBtn = $('#sellBtn');
const tradeMsgEl = $('#tradeMsg');
const breakdownPre = $('#breakdownPre');

const marketSnapshotEl = $('#marketSnapshot');
const recentTradesEl = $('#recentTrades');
const refreshBtn = $('#refreshBtn');
const viewLedgerBtn = $('#viewLedgerBtn');
const toastEl = $('#toast');

let MODE = { apiAvailable: null }; // null = unchecked, true/false

/* ---------------------------
   Helpers: apiFetch (uses WC.apiFetch if present)
   --------------------------- */
async function apiFetch(url, opts = {}) {
  const final = Object.assign({}, opts);
  final.credentials = final.credentials || 'same-origin';
  final.headers = Object.assign({}, final.headers || {});

  // JSON body auto-stringify
  if (final.body && typeof final.body === 'object' && !(final.body instanceof FormData)) {
    if (!final.headers['Content-Type'] && !final.headers['content-type']) final.headers['Content-Type'] = 'application/json';
    const ct = (final.headers['Content-Type'] || final.headers['content-type'] || '').toLowerCase();
    if (ct.includes('application/json')) final.body = JSON.stringify(final.body);
  }

  if (window.WC && typeof window.WC.apiFetch === 'function') {
    try {
      return await window.WC.apiFetch(url, final);
    } catch (e) {
      return { ok: false, status: 0, error: e && e.message ? e.message : 'WC.apiFetch error' };
    }
  }

  try {
    const r = await fetch(url, final);
    const ct = r.headers.get && r.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await r.json() : await r.text();
    if (!r.ok) return { ok: false, status: r.status, data, error: (data && data.error) || `HTTP ${r.status}` };
    return { ok: true, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: e && e.message ? e.message : 'Network error' };
  }
}

/* ---------------------------
   UI utilities
   --------------------------- */
function showToast(msg, type = 'info', dur = 2800) {
  if (window.WC && typeof window.WC.showMessage === 'function') {
    try { window.WC.showMessage(null, msg, type, dur); return; } catch (e) {}
  }
  if (!toastEl) { console[type === 'error' ? 'error' : 'log']('[market]', msg); return; }
  toastEl.textContent = msg;
  toastEl.classList.remove('visually-hidden');
  setTimeout(() => toastEl.classList.add('visually-hidden'), dur);
}

function setLoading(el, loading = true, label = null) {
  if (!el) return;
  if (loading) {
    el.setAttribute('disabled', 'disabled');
    if (label) el.dataset._old = el.textContent, el.textContent = label;
  } else {
    el.removeAttribute('disabled');
    if (el.dataset && el.dataset._old) {
      el.textContent = el.dataset._old;
      delete el.dataset._old;
    }
  }
}

function disableAllControls(reasonMsg = '') {
  [getQuoteBtn, buyBtn, sellBtn, searchBtn, viewAllBtn, refreshBtn, viewLedgerBtn].forEach(b => b && b.setAttribute('disabled', 'disabled'));
  if (reasonMsg) {
    quoteResultEl.textContent = reasonMsg;
    marketSnapshotEl.innerHTML = `<div class="muted">${reasonMsg}</div>`;
    itemListEl.innerHTML = `<div class="muted">${reasonMsg}</div>`;
  }
}

/* ---------------------------
   API detection and fetchers
   --------------------------- */
async function detectApi() {
  if (MODE.apiAvailable !== null) return MODE.apiAvailable;
  try {
    // prefer a lightweight catalog check
    const r = await apiFetch('/api/market/catalog', { method: 'GET' });
    if (r && r.ok) { MODE.apiAvailable = true; return true; }

    // fallback to snapshot
    const r2 = await apiFetch('/api/market/snapshot', { method: 'GET' });
    if (r2 && r2.ok) { MODE.apiAvailable = true; return true; }
  } catch (e) { /* ignore */ }
  MODE.apiAvailable = false;
  return false;
}

async function fetchCatalog() {
  // Strict: no client-side catalog generation
  const r = await apiFetch('/api/market/catalog', { method: 'GET' });
  if (!r || !r.ok) {
    // Try another conventional endpoint
    const r2 = await apiFetch('/api/items', { method: 'GET' });
    if (!r2 || !r2.ok) {
      throw new Error(r && r.error ? r.error : (r2 && r2.error ? r2.error : 'Catalogue indisponible'));
    }
    return (r2.data && Array.isArray(r2.data)) ? r2.data : [];
  }
  return (r.data && Array.isArray(r.data)) ? r.data : [];
}

async function fetchSnapshot() {
  const r = await apiFetch('/api/market/snapshot', { method: 'GET' });
  if (r && r.ok && r.data) return r.data;
  const r2 = await apiFetch('/api/market', { method: 'GET' });
  if (r2 && r2.ok && r2.data) return r2.data;
  throw new Error('Snapshot indisponible');
}

async function getQuote(payload) {
  // payload: { itemId, qty, countryId }
  const r = await apiFetch('/api/market/quote', { method: 'POST', body: payload });
  if (r && r.ok) {
    // The API may respond with { ok:true, price, breakdown } or raw { price, breakdown }
    if (r.data && typeof r.data === 'object') {
      if ('ok' in r.data) return r.data;
      return { ok: true, price: r.data.price, breakdown: r.data.breakdown || r.data.breakdown };
    }
    return { ok: true, price: r.data };
  }
  // try alternate path
  const r2 = await apiFetch('/api/market/price', { method: 'POST', body: payload });
  if (r2 && r2.ok) {
    if (r2.data && typeof r2.data === 'object') {
      if ('ok' in r2.data) return r2.data;
      return { ok: true, price: r2.data.price, breakdown: r2.data.breakdown || {} };
    }
    return { ok: true, price: r2.data };
  }
  return { ok: false, error: r && r.error ? r.error : 'Erreur quote' };
}

async function executeTrade(payload) {
  // payload: { actor, countryId, itemId, qty, side }
  const r = await apiFetch('/api/market/trade', { method: 'POST', body: payload });
  if (r && r.ok) {
    // common shapes: { ok:true, tx } or { tx: {...} } or { ok:true, data:{tx:...} }
    const d = r.data;
    if (d && d.ok && d.tx) return { ok: true, tx: d.tx };
    if (d && d.tx) return { ok: true, tx: d.tx };
    if (d && d.ok && d.data && d.data.tx) return { ok: true, tx: d.data.tx };
    // maybe API returns the transaction directly
    if (d && d.id) return { ok: true, tx: d };
    return { ok: true, tx: d };
  }
  // fallback alternate endpoint
  const r2 = await apiFetch('/api/market/execute', { method: 'POST', body: payload });
  if (r2 && r2.ok) {
    const d = r2.data;
    if (d && d.ok && d.tx) return { ok: true, tx: d.tx };
    if (d && d.id) return { ok: true, tx: d };
    return { ok: true, tx: d };
  }
  return { ok: false, error: r && r.error ? r.error : 'Erreur trade' };
}

/* ---------------------------
   UI renderers (strict)
   --------------------------- */
function renderItemList(items) {
  itemListEl.innerHTML = '';
  if (!items || items.length === 0) {
    itemListEl.innerHTML = '<div class="muted">Catalogue vide.</div>';
    return;
  }
  items.forEach(it => {
    const btn = D.createElement('button');
    btn.type = 'button';
    btn.className = 'catalog-item';
    // display: prefer name then id
    btn.textContent = `${(it.name || it.label || it.id)} — ${it.id}`;
    btn.dataset.itemId = it.id;
    btn.addEventListener('click', () => onSelectItem(it));
    itemListEl.appendChild(btn);
  });
}

function renderMarketSnapshot(snapshot) {
  if (!snapshot || !snapshot.state) {
    marketSnapshotEl.innerHTML = '<div class="muted">Aucune donnée de marché.</div>';
    recentTradesEl.innerHTML = '<div class="muted">Aucune transaction récente.</div>';
    return;
  }
  const keys = Object.keys(snapshot.state).slice(0, 6);
  const lines = keys.map(k => {
    const s = snapshot.state[k];
    return `${k}: stock=${s.stock ?? '—'} demand=${s.demand ?? '—'} trend=${(s.trend ?? 0).toFixed ? (s.trend ?? 0).toFixed(3) : (s.trend ?? 0)}`;
  });
  marketSnapshotEl.innerHTML = `<div>${lines.join('<br>')}</div>`;

  recentTradesEl.innerHTML = '';
  const recent = snapshot.recent || snapshot.ledger || [];
  if (!recent || !recent.length) {
    recentTradesEl.innerHTML = '<div class="muted">Aucune transaction récente.</div>';
    return;
  }
  for (const t of recent.slice(-20).reverse()) {
    const el = D.createElement('div');
    el.className = 'trade-item';
    const when = new Date(t.ts || Date.now()).toLocaleString();
    el.innerHTML = `<div><strong>${t.item}</strong> ${t.side} ×${t.qty} • ${t.total_price ?? (t.price_per_unit ? (t.price_per_unit * t.qty) : '—')}</div>
                    <div class="muted mini">${t.actor || '—'} • ${t.country || '—'} • ${when}</div>`;
    recentTradesEl.appendChild(el);
  }
}

/* ---------------------------
   Event handlers
   --------------------------- */
function onSelectItem(item) {
  selectedItemEl.textContent = `${item.name || item.label || item.id} (${item.id})`;
  itemIdInput.value = item.id;
  qtyInput.value = 1;
  countryIdInput.value = '';
  quoteResultEl.textContent = '—';
  breakdownPre.textContent = 'Aucun devis pour l\'instant.';
  tradeControlsEl.classList.add('visually-hidden');
}

/* Search */
searchBtn?.addEventListener('click', async (e) => {
  e.preventDefault();
  const q = (searchInput.value || '').trim().toLowerCase();
  try {
    const items = await fetchCatalog();
    const filtered = items.filter(it => (it.id && it.id.toLowerCase().includes(q)) || ((it.name || it.label) && (it.name || it.label).toLowerCase().includes(q)));
    renderItemList(filtered);
  } catch (err) {
    showToast('Erreur recherche catalogue', 'error');
    console.error(err);
  }
});

viewAllBtn?.addEventListener('click', async () => {
  try {
    const items = await fetchCatalog();
    renderItemList(items);
  } catch (err) {
    showToast('Impossible de charger le catalogue', 'error');
  }
});

/* Quote */
getQuoteBtn?.addEventListener('click', async (e) => {
  e.preventDefault();
  const itemId = (itemIdInput.value || '').trim();
  const qty = Number(qtyInput.value || 1);
  const countryId = (countryIdInput.value || '').trim() || null;
  if (!itemId) { showToast('Choisis un item', 'error'); return; }
  if (!(qty > 0)) { showToast('Quantité invalide', 'error'); return; }

  setLoading(getQuoteBtn, true, 'Calcul...');
  try {
    const out = await getQuote({ itemId, qty, countryId });
    if (!out || out.ok === false) {
      showToast(out && out.error ? out.error : 'Erreur devis', 'error');
      quoteResultEl.textContent = 'Erreur devis';
      return;
    }
    const price = out.price ?? (out.data && out.data.price);
    const breakdown = out.breakdown ?? (out.data && out.data.breakdown) ?? {};
    if (price === undefined || price === null) {
      quoteResultEl.textContent = 'Erreur devis';
      showToast('Réponse devis invalide', 'error');
      return;
    }
    quoteResultEl.textContent = `${price} (par unité) • Total: ${Math.round(price * qty * 100) / 100}`;
    breakdownPre.textContent = JSON.stringify(breakdown, null, 2);
    tradeControlsEl.classList.remove('visually-hidden');
    tradeMsgEl.textContent = '';
  } catch (err) {
    console.error(err);
    showToast('Erreur lors du devis', 'error');
  } finally {
    setLoading(getQuoteBtn, false);
  }
});

/* Trade */
async function doTrade(side) {
  const itemId = (itemIdInput.value || '').trim();
  const qty = Number(qtyInput.value || 1);
  const countryId = (countryIdInput.value || '').trim() || null;
  if (!itemId || !(qty > 0)) { showToast('Paramètres invalides', 'error'); return; }

  const actor = (window.WC && window.WC.session && window.WC.session.username) ? window.WC.session.username : 'web_user';
  setLoading(buyBtn, true, 'En cours...');
  setLoading(sellBtn, true, 'En cours...');
  try {
    const result = await executeTrade({ actor, countryId, itemId, qty, side });
    if (!result || result.ok === false) {
      showToast((result && result.error) || 'Échec de la transaction', 'error');
      tradeMsgEl.textContent = (result && result.error) || 'Échec';
      return;
    }
    const tx = result.tx || (result.data && result.data.tx);
    showToast('Transaction réussie', 'success');
    tradeMsgEl.textContent = `Tx: ${tx && tx.id ? tx.id : '—'} • Total: ${tx && (tx.total_price ?? (tx.price_per_unit ? tx.price_per_unit * tx.qty : null)) ?? '—'}`;
    // refresh snapshot
    await refreshSnapshot();
  } catch (err) {
    console.error(err);
    showToast('Erreur transaction', 'error');
  } finally {
    setLoading(buyBtn, false);
    setLoading(sellBtn, false);
  }
}

buyBtn?.addEventListener('click', () => doTrade('buy'));
sellBtn?.addEventListener('click', () => doTrade('sell'));

refreshBtn?.addEventListener('click', () => refreshAll());

viewLedgerBtn?.addEventListener('click', async () => {
  try {
    const snap = await fetchSnapshot();
    const ledger = snap && (snap.recent || snap.ledger || []) ? (snap.recent || snap.ledger) : [];
    if (!ledger.length) { alert('Ledger vide'); return; }
    const text = ledger.slice(-50).reverse().map(tx => `${tx.id} — ${tx.item} ${tx.side} ×${tx.qty} • ${tx.total_price ?? (tx.price_per_unit ? tx.price_per_unit * tx.qty : '—')}`).join('\n');
    alert(text);
  } catch (err) {
    showToast('Impossible de récupérer le ledger', 'error');
  }
});

// nav buttons (keep behaviour)
D.getElementById('nav-chat')?.addEventListener('click', () => location.href = 'chat.html');
D.getElementById('nav-lobby')?.addEventListener('click', () => location.href = 'dashboard.html');
D.getElementById('nav-profile')?.addEventListener('click', () => location.href = 'profile.html');

/* ---------------------------
   Boot / init
   --------------------------- */
async function refreshSnapshot() {
  try {
    const snap = await fetchSnapshot();
    renderMarketSnapshot(snap);
  } catch (err) {
    marketSnapshotEl.innerHTML = `<div class="muted">Snapshot indisponible</div>`;
    recentTradesEl.innerHTML = `<div class="muted">Transactions indisponibles</div>`;
    console.error(err);
  }
}

async function refreshAll() {
  try {
    const items = await fetchCatalog();
    renderItemList(items);
    await refreshSnapshot();
  } catch (err) {
    console.error(err);
    showToast('Impossible de rafraîchir le marché', 'error');
  }
}

async function init() {
  try {
    const apiOk = await detectApi();
    if (!apiOk) {
      showToast('API du marché indisponible — le marché est désactivé', 'error', 5000);
      disableAllControls('API indisponible');
      return;
    }
    await refreshAll();

    // preselect if ?item=...
    const params = new URLSearchParams(location.search);
    const maybeItem = params.get('item');
    if (maybeItem) {
      const items = await fetchCatalog();
      const found = items.find(it => it.id === maybeItem || (it.name && it.name.toLowerCase().includes(maybeItem.toLowerCase())));
      if (found) onSelectItem(found);
    }
  } catch (e) {
    console.error(e);
    showToast('Erreur initialisation marché', 'error');
    disableAllControls('Erreur initialisation');
  }
}

// start
init();

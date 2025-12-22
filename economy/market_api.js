// economy/market_api.js
// ESM Express router that exposes minimal market API by calling economy/engine.js
// Endpoints:
//   GET  /api/market/catalog
//   GET  /api/market/snapshot
//   POST /api/market/quote    { itemId, qty, countryId }
//   POST /api/market/trade    { actor, itemId, qty, countryId, side }

import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

// import engine methods
import {
  getQuote,
  executeTrade,
  getMarketSnapshot,
  loadState
} from './engine.js';

const router = express.Router();

// JSON body parser for endpoints
router.use(express.json());

// GET /api/market/catalog
// Returns a minimal catalog array. If a catalog module exists (economy/catalog.js) it will use it,
// otherwise it derives ids from state.json (keys) and returns { id, name } entries.
router.get('/catalog', async (req, res) => {
  try {
    // try to import an explicit catalog if present
    let catalogModule = null;
    try {
      // dynamic import — not fatal if file missing
      catalogModule = await import('./economy/catalog.js');
    } catch (e) {
      catalogModule = null;
    }

    if (catalogModule && (catalogModule.CATALOG || catalogModule.default)) {
      const CATALOG = catalogModule.CATALOG || catalogModule.default?.CATALOG || {};
      const arr = Object.keys(CATALOG).map(id => {
        const meta = CATALOG[id] || {};
        return { id, name: meta.label || meta.name || id, ...meta };
      });
      return res.json(arr);
    }

    // fallback: derive from state keys
    const state = await loadState();
    const ids = Object.keys(state || {});
    const arr = ids.map(id => ({ id, name: id }));
    return res.json(arr);
  } catch (err) {
    console.error('market/catalog error', err);
    return res.status(500).json({ ok: false, error: err.message || 'catalog error' });
  }
});

// GET /api/market/snapshot
router.get('/snapshot', async (req, res) => {
  try {
    const snap = await getMarketSnapshot({ recentLedger: 40 });
    // getMarketSnapshot returns { ok: true, state, recent } in our engine; ensure consistent shape
    if (snap && snap.ok) return res.json(snap);
    return res.json({ ok: true, state: snap.state || snap, recent: snap.recent || snap.recent });
  } catch (err) {
    console.error('market/snapshot error', err);
    return res.status(500).json({ ok: false, error: err.message || 'snapshot error' });
  }
});

// POST /api/market/quote
// body: { itemId, qty, countryId }
router.post('/quote', async (req, res) => {
  try {
    const { itemId, qty = 1, countryId = null } = req.body || {};
    if (!itemId) return res.status(400).json({ ok: false, error: 'missing itemId' });

    const out = await getQuote({ itemId, qty, countryId });
    // getQuote as implemented returns { ok: true, price, breakdown }
    return res.json(out);
  } catch (err) {
    console.error('market/quote error', err);
    return res.status(500).json({ ok: false, error: err.message || 'quote error' });
  }
});

// POST /api/market/trade
// body: { actor, itemId, qty, countryId, side } where side = 'buy'|'sell'
router.post('/trade', async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.itemId) return res.status(400).json({ ok: false, error: 'missing itemId' });
    if (!payload.qty || Number(payload.qty) <= 0) return res.status(400).json({ ok: false, error: 'invalid qty' });
    if (!['buy', 'sell'].includes(payload.side)) return res.status(400).json({ ok: false, error: 'invalid side' });

    const result = await executeTrade(payload);
    return res.json(result);
  } catch (err) {
    console.error('market/trade error', err);
    return res.status(500).json({ ok: false, error: err.message || 'trade error' });
  }
});

// also expose a root for convenience
router.get('/', (req, res) => res.json({ ok: true, endpoints: ['/catalog','/snapshot','/quote','/trade'] }));

export default router;

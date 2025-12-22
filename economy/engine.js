// economy/engine.js
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { computePrice, simulateStateAfterTrade } from './pricing.js';

const ECON_DIR = path.join('.', 'economy');
const STATE_PATH = path.join(ECON_DIR, 'state.json');
const LEDGER_PATH = path.join(ECON_DIR, 'ledger.json');
const COUNTRIES_DIR = path.join('.', 'map', 'world', 'countries');

let _countryCache = new Map();

/** --- Helpers --- **/
async function _ensureFile(filePath, initialContent) {
  try {
    await fs.access(filePath);
  } catch (e) {
    await fs.writeFile(filePath, initialContent, 'utf8');
  }
}

async function initIfNeeded() {
  // ensure economy dir files exist
  await _ensureFile(STATE_PATH, JSON.stringify({}, null, 2));
  await _ensureFile(LEDGER_PATH, JSON.stringify([], null, 2));
}

/** atomic write: write to temp then rename */
async function _atomicWriteJson(filePath, obj) {
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  // rename (replace)
  await fs.rename(tmp, filePath);
}

/** load state.json object */
export async function loadState() {
  await initIfNeeded();
  const s = await fs.readFile(STATE_PATH, 'utf8');
  try {
    return JSON.parse(s || '{}');
  } catch (e) {
    // corrupt file -> reset to empty
    return {};
  }
}

/** save state.json */
export async function saveState(stateObj) {
  await _atomicWriteJson(STATE_PATH, stateObj);
}

/** read ledger array */
export async function loadLedger() {
  await initIfNeeded();
  const s = await fs.readFile(LEDGER_PATH, 'utf8');
  try {
    return JSON.parse(s || '[]');
  } catch (e) {
    return [];
  }
}

/** append transaction (writes ledger) */
export async function appendLedger(tx) {
  const ledger = await loadLedger();
  ledger.push(tx);
  await _atomicWriteJson(LEDGER_PATH, ledger);
}

/** find country by internal id (country.json contains "id") */
export async function findCountryById(countryId) {
  if (!countryId) return null;
  if (_countryCache.has(countryId)) return _countryCache.get(countryId);

  // read folder files and parse until match
  try {
    const files = await fs.readdir(COUNTRIES_DIR);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const full = path.join(COUNTRIES_DIR, f);
      try {
        const raw = await fs.readFile(full, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.id === countryId || parsed.id === countryId.toLowerCase() || f.replace('.json','') === countryId.toLowerCase())) {
          _countryCache.set(countryId, parsed);
          return parsed;
        }
      } catch (e) {
        // ignore bad file
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

/** generate short tx id */
function makeTxId() {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 90000 + 10000).toString(36);
  return `tx_${t}_${r}`;
}

/** getQuote: returns computed price (does not mutate) */
export async function getQuote({ itemId, qty = 1, countryId = null, opts = {} }) {
  if (!itemId) return { ok: false, error: 'missing itemId' };
  if (qty <= 0) return { ok: false, error: 'qty must be > 0' };

  const state = await loadState();
  const stateItem = state[itemId] ?? { stock: 0, demand: 0, trend: 0 };
  const country = countryId ? (await findCountryById(countryId)) : null;
  const countryEconomy = country ? (country.economy ?? null) : null;

  const basePrice = opts.basePrice ?? (stateItem.basePrice ?? undefined);

  const result = computePrice(itemId, stateItem, countryEconomy, qty, Object.assign({}, opts, { basePrice }));
  return { ok: true, price: result.price, breakdown: result.breakdown };
}

/**
 * executeTrade
 * - payload: { actor, countryId, itemId, qty, side } where side in ['buy','sell']
 *   - 'buy'  => actor buys from market (market stock decreases)
 *   - 'sell' => actor sells to market (market stock increases)
 *
 * Returns: { ok: true, tx } or { ok: false, error }
 */
export async function executeTrade({ actor = 'anon', countryId, itemId, qty = 1, side = 'buy', opts = {} } = {}) {
  // basic validation
  if (!itemId) return { ok: false, error: 'missing itemId' };
  qty = Number(qty);
  if (!(qty > 0)) return { ok: false, error: 'qty must be > 0' };
  if (!['buy', 'sell'].includes(side)) return { ok: false, error: 'side must be "buy" or "sell"' };

  // load state and country
  const state = await loadState();
  if (!state[itemId]) {
    // initialize default item snapshot
    state[itemId] = { stock: 0, demand: 0, trend: 0 };
  }
  const stateItem = state[itemId];

  const country = countryId ? (await findCountryById(countryId)) : null;
  const countryEconomy = country ? (country.economy ?? null) : null;

  // compute price
  const priceResult = computePrice(itemId, stateItem, countryEconomy, qty, opts);
  const pricePerUnit = priceResult.price;
  const total = Math.round(pricePerUnit * qty * 100) / 100;

  // apply state mutation rules (simple, deterministic)
  const simulated = simulateStateAfterTrade(stateItem, qty, side);
  // update state
  state[itemId] = {
    stock: simulated.stock,
    demand: simulated.demand,
    trend: simulated.trend
  };

  // create ledger entry
  const tx = {
    id: makeTxId(),
    actor,
    country: countryId || null,
    item: itemId,
    qty,
    price_per_unit: pricePerUnit,
    total_price: total,
    side,
    breakdown: priceResult.breakdown,
    ts: Date.now()
  };

  // persist changes atomically: save state then append ledger
  await saveState(state);
  await appendLedger(tx);

  return { ok: true, tx };
}

/** convenience: returns full market snapshot (state + top N ledger entries) */
export async function getMarketSnapshot({ recentLedger = 20 } = {}) {
  const state = await loadState();
  const ledger = await loadLedger();
  const recent = Array.isArray(ledger) ? ledger.slice(-recentLedger) : [];
  return { ok: true, state, recent };
}

/** small sync helper for quick CLI debugging (optional) */
export function loadStateSync() {
  try {
    const raw = fsSync.readFileSync(STATE_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}

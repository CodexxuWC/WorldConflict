// economy/countries.js
// ES module — index économique léger pour WorldConflict
//
// - Lit map/world/countries/*.json
// - Extrait un "summary" léger par pays (id, name, continent, population, resources, borders)
// - Fournit cache en mémoire + fonctions async/sync pour y accéder
//
// Usage (async):
//   import { loadAll, getCountryById, getAllSummaries } from './economy/countries.js';
//   await loadAll(); // charge/cache
//   const france = await getCountryById('fra');
//   console.log(france.summary);

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

const COUNTRIES_DIR = path.join('.', 'map', 'world', 'countries');

let _loaded = false;
let _byId = new Map();     // key = country.id (lowercase)
let _byFile = new Map();   // key = file basename (lowercase)

/** --- Helpers --- **/

function _safeLower(s) {
  return (typeof s === 'string' ? s.toLowerCase() : s);
}

function _normalizeResources(res) {
  // Normalise resources to an object: { resourceId: qty }
  if (!res) return {};
  if (Array.isArray(res)) {
    const out = {};
    for (const r of res) {
      if (typeof r === 'string') out[r] = (out[r] || 0) + 1;
      else if (r && typeof r === 'object' && r.id) out[r.id] = (out[r.id] || 0) + (Number(r.qty) || 1);
    }
    return out;
  }
  if (typeof res === 'object') {
    // assume mapping already: copy shallowly and coerce numbers
    const out = {};
    for (const k of Object.keys(res)) {
      const v = res[k];
      out[k] = (v === null || v === undefined) ? 0 : Number(v) || 0;
    }
    return out;
  }
  // fallback: string -> single resource
  if (typeof res === 'string') return { [res]: 1 };
  return {};
}

function _extractSummary(parsed, filename) {
  // Safe extraction with many fallbacks for messy JSONs
  const id = parsed.id || parsed.iso_a3 || parsed.iso || path.basename(filename, '.json');
  const name = parsed.name || parsed.title || parsed.country || parsed.country_name || parsed.full_name || path.basename(filename, '.json');
  const continent =
    parsed.continent ||
    parsed.region ||
    (parsed.geography && parsed.geography.continent) ||
    (parsed.metadata && parsed.metadata.continent) ||
    null;

  // population.value or population
  let population = 0;
  if (parsed.population) {
    if (typeof parsed.population === 'object' && parsed.population.value !== undefined) population = Number(parsed.population.value) || 0;
    else if (typeof parsed.population === 'number') population = parsed.population;
    else if (typeof parsed.population === 'string' && parsed.population.trim() !== '') population = Number(parsed.population) || 0;
  }

  // resources: prefer economy.resources, fallback to resources top-level
  const resourcesRaw = (parsed.economy && parsed.economy.resources) || parsed.resources || parsed.raw_resources || null;
  const resources = _normalizeResources(resourcesRaw);

  // borders: geography.borders or parsed.borders
  const borders = (parsed.geography && (parsed.geography.borders || parsed.geography.borderCountries)) || parsed.borders || parsed.neighbors || [];
  const bordersArr = Array.isArray(borders) ? borders : (typeof borders === 'string' ? borders.split(',').map(s=>s.trim()).filter(Boolean) : []);

  return {
    id: String(id).toLowerCase(),
    name: String(name),
    continent: continent ? String(continent).toLowerCase() : null,
    population: Number(population || 0),
    resources,
    borders: bordersArr.map(b => String(b).toLowerCase()),
    // keep filename for debugging
    _file: filename
  };
}

/** read & parse a single file, returns { raw, summary } */
async function _readCountryFile(fullPath, filename) {
  const rawText = await fs.readFile(fullPath, 'utf8');
  const parsed = JSON.parse(rawText || '{}');
  const summary = _extractSummary(parsed, filename);
  return { raw: parsed, summary };
}

/** --- Public API --- **/

/**
 * loadAll(force = false)
 * - Loads all country files into memory and builds indexes.
 * - If force=true re-reads files.
 */
export async function loadAll(force = false) {
  if (_loaded && !force) return { ok: true, count: _byId.size };

  // ensure directory exists
  try {
    await fs.access(COUNTRIES_DIR);
  } catch (e) {
    // missing directory -> initialize empty
    _byId = new Map();
    _byFile = new Map();
    _loaded = true;
    return { ok: true, count: 0, warning: 'countries dir not found' };
  }

  const names = await fs.readdir(COUNTRIES_DIR);
  _byId = new Map();
  _byFile = new Map();

  for (const fn of names) {
    if (!fn.toLowerCase().endsWith('.json')) continue;
    const full = path.join(COUNTRIES_DIR, fn);
    try {
      const { raw, summary } = await _readCountryFile(full, fn);
      const keyId = _safeLower(summary.id);
      const keyFile = _safeLower(path.basename(fn, '.json'));

      // store canonical entry object (summary + raw)
      const entry = { summary, raw };

      _byId.set(keyId, entry);
      _byFile.set(keyFile, entry);

      // also index by name (lowercase) for quick lookup by name
      if (summary.name) _byId.set(_safeLower(summary.name), entry); // name as key too
    } catch (e) {
      // ignore single-file errors but log to console (helpful during dev in Termux)
      try { console.warn('countries: failed to parse', fn, e && e.message ? e.message : e); } catch {}
    }
  }

  _loaded = true;
  return { ok: true, count: _byId.size };
}

/** getCountryById(id) - async; matches id or name or filename */
export async function getCountryById(id) {
  if (!id) return null;
  if (!_loaded) await loadAll();
  const key = _safeLower(String(id));
  return _byId.get(key) || null;
}

/** getCountryByFileName(filename) - async */
export async function getCountryByFileName(filename) {
  if (!filename) return null;
  if (!_loaded) await loadAll();
  const key = _safeLower(String(filename).replace(/\.json$/i, ''));
  return _byFile.get(key) || null;
}

/** getAllSummaries() - async => array of summary objects */
export async function getAllSummaries() {
  if (!_loaded) await loadAll();
  const seen = new Set();
  const out = [];
  for (const [k, entry] of _byId) {
    const id = entry.summary.id;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(entry.summary);
  }
  return out;
}

/** findCountry(query) - fuzzy by id, filename, or name (case-insensitive) */
export async function findCountry(query) {
  if (!query) return null;
  if (!_loaded) await loadAll();
  const q = _safeLower(String(query));
  if (_byId.has(q)) return _byId.get(q);
  if (_byFile.has(q)) return _byFile.get(q);

  // try substring match on name
  for (const entry of _byId.values()) {
    try {
      if (entry.summary.name && _safeLower(entry.summary.name).includes(q)) return entry;
    } catch (e) {}
  }
  return null;
}

/** refreshCache() - convenience to force reload from disk */
export async function refreshCache() {
  return loadAll(true);
}

/** load synchronously (small helper) - reads STATE of cache if present, else tries quick sync load */
export function loadSync() {
  // return the in-memory cache if loaded
  if (_loaded) {
    const arr = [];
    const seen = new Set();
    for (const entry of _byId.values()) {
      const id = entry.summary.id;
      if (seen.has(id)) continue;
      seen.add(id);
      arr.push(entry.summary);
    }
    return arr;
  }

  // fallback: attempt synchronous directory read/parsing (best-effort)
  try {
    const files = fsSync.readdirSync(COUNTRIES_DIR);
    const out = [];
    for (const fn of files) {
      if (!fn.toLowerCase().endsWith('.json')) continue;
      try {
        const raw = fsSync.readFileSync(path.join(COUNTRIES_DIR, fn), 'utf8');
        const parsed = JSON.parse(raw || '{}');
        const summary = _extractSummary(parsed, fn);
        out.push(summary);
      } catch (e) {
        // ignore single-file errors
      }
    }
    return out;
  } catch (e) {
    return [];
  }
}

/** default export: convenience object */
export default {
  loadAll,
  getCountryById,
  getCountryByFileName,
  getAllSummaries,
  findCountry,
  refreshCache,
  loadSync
};

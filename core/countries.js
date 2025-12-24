// core/countries.js
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

let countriesCache = null;

/**
 * Build countries cache from:
 *  - map/world/countries/*.json  (preferred)
 *  - fallback: map/world/<continent>/*.json
 *
 * @param {string} baseDir - base directory (usually __dirname from server.js). Defaults to process.cwd().
 */
async function buildCountriesCache(baseDir = process.cwd()) {
  try {
    const worldDir = path.join(baseDir, "map", "world");
    const countriesDir = path.join(worldDir, "countries");

    const list = [];

    // prefer flat structure map/world/countries/*.json
    if (fsSync.existsSync(countriesDir)) {
      try {
        const files = await fs.readdir(countriesDir);
        for (const f of files) {
          if (!f.toLowerCase().endsWith(".json")) continue;
          const filePath = path.join(countriesDir, f);
          let parsed = null;
          try {
            const txt = await fs.readFile(filePath, "utf8");
            parsed = JSON.parse(txt || "null");
          } catch (e) {
            parsed = null;
          }

          const id = parsed?.id ? String(parsed.id).trim() : path.basename(f, ".json");
          const name = (parsed && (parsed.name || parsed.common)) || id;

          list.push({
            id,
            name,
            file: `/map/world/countries/${f}`,
            continent: parsed?.continent || null,
            meta: parsed?.meta || null,
            last_update: parsed?.last_update || null,
          });
        }
      } catch (e) {
        console.warn("buildCountriesCache: failed reading map/world/countries:", e);
      }
    }

    // fallback: iterate continents map/world/<continent>/*.json
    if (list.length === 0) {
      try {
        // If worldDir doesn't exist, readdir will throw — catch below
        const dirEntries = await fs.readdir(worldDir, { withFileTypes: true });
        const continents = dirEntries.filter(d => d.isDirectory()).map(d => d.name);
        for (const cont of continents) {
          const contDir = path.join(worldDir, cont);
          try {
            const files = await fs.readdir(contDir);
            for (const f of files) {
              if (!f.toLowerCase().endsWith(".json")) continue;
              const filePath = path.join(contDir, f);
              let parsed = null;
              try {
                const txt = await fs.readFile(filePath, "utf8");
                parsed = JSON.parse(txt || "null");
              } catch (e) {
                parsed = null;
              }

              const id = path.basename(f, ".json");
              const name = (parsed && (parsed.name || parsed.common)) || id;

              list.push({
                id,
                name,
                file: `/map/world/${cont}/${f}`,
                continent: cont,
                meta: parsed?.meta || null,
                last_update: parsed?.last_update || null,
              });
            }
          } catch (e) {
            // ignore per-continent errors but continue with others
          }
        }
      } catch (e) {
        console.error("buildCountriesCache (continent fallback) error:", e);
      }
    }

    // sort alpha by name (fallback to id)
    list.sort((a, b) => ((a.name || a.id) || '').localeCompare((b.name || b.id) || ''));

    countriesCache = list;
  } catch (err) {
    console.error("buildCountriesCache failed:", err);
    countriesCache = [];
  }
}

/**
 * Return the in-memory countries cache (may be null if not built yet).
 * @returns {Array|null}
 */
function getCountriesCache() {
  return countriesCache;
}

/**
 * Force-clear the cache (useful for tests / dev reload)
 */
function clearCountriesCache() {
  countriesCache = null;
}

export { buildCountriesCache, getCountriesCache, clearCountriesCache };

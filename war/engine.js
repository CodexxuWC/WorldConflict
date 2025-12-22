// war/engine.js
import fs from 'fs';
import path from 'path';

const STATE_PATH = path.resolve('./war/state.json');
const LEDGER_PATH = path.resolve('./war/ledger.json');
const COUNTRIES_DIR = path.resolve('./map/world/countries');

// --------------------
// Utils
// --------------------
function loadJSON(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJSON(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function now() {
  return new Date().toISOString();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function rnd(min, max) {
  return Math.random() * (max - min) + min;
}

// --------------------
// Countries
// --------------------
function loadCountry(id) {
  const file = path.join(COUNTRIES_DIR, `${id}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveCountry(id, data) {
  const file = path.join(COUNTRIES_DIR, `${id}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// --------------------
// War Engine
// --------------------
export function declareWar(attacker, defender) {
  const state = loadJSON(STATE_PATH, { wars: [] });

  const id = `war_${attacker}_${defender}_${Date.now()}`;

  const war = {
    id,
    attackers: [attacker],
    defenders: [defender],
    status: 'active',
    startedAt: now(),
    endedAt: null,
    intensity: 0.2,
    casualties: {},
    economyImpact: {}
  };

  state.wars.push(war);
  saveJSON(STATE_PATH, state);

  // update countries
  for (const c of [attacker, defender]) {
    const country = loadCountry(c);
    country.war.atWar = true;
    country.war.wars.push(id);
    saveCountry(c, country);
  }

  logEvent('DECLARE_WAR', { attacker, defender, warId: id });

  return war;
}

export function tickWars() {
  const state = loadJSON(STATE_PATH, { wars: [] });

  for (const war of state.wars) {
    if (war.status !== 'active') continue;

    war.intensity = clamp(
      war.intensity + rnd(0.01, 0.05),
      0,
      1
    );

    for (const side of [...war.attackers, ...war.defenders]) {
      const country = loadCountry(side);

      const loss = Math.floor((country.population || 10_000_000) * war.intensity * 0.000005);

      war.casualties[side] = (war.casualties[side] || 0) + loss;

      country.population = Math.max(0, (country.population || 10_000_000) - loss);

      country.war.warExhaustion = clamp(
        country.war.warExhaustion + war.intensity * 0.03,
        0,
        1
      );

      saveCountry(side, country);
    }

    logEvent('WAR_TICK', {
      warId: war.id,
      intensity: war.intensity
    });

    // End condition
    const exhausted = [...war.attackers, ...war.defenders]
      .some(c => loadCountry(c).war.warExhaustion >= 0.95);

    if (exhausted) endWar(war.id, 'exhaustion');
  }

  saveJSON(STATE_PATH, state);
}

export function endWar(warId, reason) {
  const state = loadJSON(STATE_PATH, { wars: [] });
  const war = state.wars.find(w => w.id === warId);
  if (!war) return;

  war.status = 'ended';
  war.endedAt = now();

  for (const c of [...war.attackers, ...war.defenders]) {
    const country = loadCountry(c);
    country.war.atWar = false;
    country.war.wars = country.war.wars.filter(w => w !== warId);
    country.war.warExhaustion = 0;
    saveCountry(c, country);
  }

  logEvent('END_WAR', { warId, reason });
  saveJSON(STATE_PATH, state);
}

// --------------------
// Ledger
// --------------------
function logEvent(type, details) {
  const ledger = loadJSON(LEDGER_PATH, []);
  ledger.push({ ts: now(), type, details });
  saveJSON(LEDGER_PATH, ledger);
}

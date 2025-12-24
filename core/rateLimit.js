// core/rateLimit.js
// Gestion simple du rate limiting en mémoire (maps + utilitaire checkRate)

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes (même valeur que dans l'ancien server.js)
const RATE_LIMIT_MAX = { login: 8, checkEmail: 30, resendVerify: 4 };

// maps de rate limiting (source de vérité en mémoire)
const rateMaps = {
  login: new Map(),       // ip -> { count, firstAt }
  checkEmail: new Map(),
  resendVerify: new Map(),
};

/**
 * checkRate(map, ip, max)
 * - map: une Map (p.ex. rateMaps.login)
 * - ip: chaîne (adresse IP ou clé)
 * - max: nombre maximal de requêtes autorisées pendant la fenêtre
 *
 * Retourne true si la requête est autorisée, false si le plafond est atteint.
 * Gère automatiquement le reset après WINDOW_MS.
 */
function checkRate(map, ip, max) {
  const now = Date.now();
  const entry = map.get(ip) || { count: 0, firstAt: now };

  if (now - entry.firstAt > RATE_LIMIT_WINDOW_MS) {
    // fenêtre expirée -> réinitialise
    entry.count = 1;
    entry.firstAt = now;
    map.set(ip, entry);
    return true;
  }

  entry.count++;
  map.set(ip, entry);
  return entry.count <= max;
}

/**
 * Optional helpers (pratiques en debug/tests)
 */
function resetRateMap(mapName) {
  if (rateMaps[mapName] && typeof rateMaps[mapName].clear === "function") {
    rateMaps[mapName].clear();
  }
}

export {
  rateMaps,
  checkRate,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  resetRateMap,
};

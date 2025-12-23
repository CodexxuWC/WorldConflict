// server.js (ESM) — backend amélioré & plus professionnel (fix sessions behind proxy)
import express from "express";
import bodyParser from "body-parser";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import fsSync from "fs";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import marketApi from './economy/market_api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

const app = express();

// Important: trust the first proxy (Render, Heroku, etc.) so req.ip and req.secure are correct
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-worldconflict-secret";

// small rate limiter (in-memory)
const rate = {
  login: new Map(), // ip -> { count, firstAt }
  checkEmail: new Map(),
};
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 min
const RATE_LIMIT_MAX = { login: 8, checkEmail: 30 };

function checkRate(map, ip, max) {
  const now = Date.now();
  const entry = map.get(ip) || { count: 0, firstAt: now };
  if (now - entry.firstAt > RATE_LIMIT_WINDOW_MS) {
    entry.count = 1;
    entry.firstAt = now;
    map.set(ip, entry);
    return true;
  }
  entry.count++;
  map.set(ip, entry);
  return entry.count <= max;
}

// utils
const normalize = (s) => (typeof s === "string" ? s.trim().toLowerCase() : "");
const safeTrim = (s, max = 200) => (typeof s === "string" ? s.trim().slice(0, max) : "");

// persistence helpers
async function ensureDataDir() {
  if (!fsSync.existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}
let users = [];
async function loadUsers() {
  try {
    await ensureDataDir();
    if (!fsSync.existsSync(USERS_FILE)) {
      users = [];
      await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
      return;
    }
    const txt = await fs.readFile(USERS_FILE, "utf8");
    users = JSON.parse(txt || "[]");
  } catch (e) {
    console.error("loadUsers failed:", e);
    users = [];
  }
}
async function saveUsers() {
  try {
    await ensureDataDir();
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
  } catch (e) {
    console.error("saveUsers failed:", e);
  }
}

await loadUsers();

function findUserByEmail(email) {
  if (!email) return null;
  const n = normalize(email);
  return users.find((u) => normalize(u.email) === n) || null;
}
function findUserByUsername(username) {
  if (!username) return null;
  const n = normalize(username);
  return users.find((u) => normalize(u.username) === n) || null;
}
function findUserByLogin(id) {
  if (!id) return null;
  const n = normalize(id);
  return users.find((u) => normalize(u.username) === n || normalize(u.email) === n) || null;
}

// middleware setup
app.use(bodyParser.json({ limit: "2mb" }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  session({
    name: "wc_sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // only send cookie over HTTPS in production
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
    // default MemoryStore is fine for small hobby projects; replace for production multi-instance setups
  })
);

// mount APIs that may rely on sessions after session middleware
app.use('/api/market', marketApi);

app.use(express.static(__dirname));

// --- /api/countries (cache en mémoire après 1ère lecture) ---
let countriesCache = null;
async function buildCountriesCache() {
  try {
    const worldDir = path.join(__dirname, "map", "world");
    const countriesDir = path.join(worldDir, "countries");

    const list = [];

    // If map/world/countries exists, prefer that flat structure
    if (fsSync.existsSync(countriesDir)) {
      try {
        const files = await fs.readdir(countriesDir);
        for (const f of files) {
          if (!f.toLowerCase().endsWith(".json")) continue;
          const filePath = path.join(countriesDir, f);
          let parsed = null;
          try { parsed = JSON.parse(await fs.readFile(filePath, "utf8")); } catch (e) { parsed = null; }
          const id = parsed?.id
            ? String(parsed.id).trim()
            : path.basename(f, ".json");
          const name = (parsed && (parsed.name || parsed.common)) || id;
          list.push({
            id,
            name,
            file: `/map/world/countries/${f}`,
            continent: parsed && parsed.continent ? parsed.continent : null,
            meta: parsed && parsed.meta ? parsed.meta : null,
            last_update: parsed && parsed.last_update ? parsed.last_update : null,
          });
        }
      } catch (e) {
        // can't read countries folder — fallthrough to try continents
        console.warn("buildCountriesCache: failed reading map/world/countries:", e);
      }
    }

    // If we have no items from the flat countries dir, try the older continent/<country>.json structure
    if (list.length === 0) {
      try {
        const dirEntries = await fs.readdir(worldDir, { withFileTypes: true });
        const continents = dirEntries.filter((d) => d.isDirectory()).map((d) => d.name);
        for (const cont of continents) {
          const contDir = path.join(worldDir, cont);
          try {
            const files = await fs.readdir(contDir);
            for (const f of files) {
              if (!f.toLowerCase().endsWith(".json")) continue;
              const filePath = path.join(contDir, f);
              let parsed = null;
              try { parsed = JSON.parse(await fs.readFile(filePath, "utf8")); } catch (e) { parsed = null; }
              const id = path.basename(f, ".json");
              const name = (parsed && (parsed.name || parsed.common)) || id;
              list.push({
                id,
                name,
                file: `/map/world/${cont}/${f}`,
                continent: cont,
                meta: parsed && parsed.meta ? parsed.meta : null,
                last_update: parsed && parsed.last_update ? parsed.last_update : null,
              });
            }
          } catch (e) {
            // ignore per-continent errors
          }
        }
      } catch (e) {
        // worldDir might not exist or be unreadable
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
await buildCountriesCache();

// helper to save session then send JSON response (ensures cookie is set)
function saveSessionAndSend(req, res, payload) {
  try {
    if (!req.session) {
      return res.json(payload);
    }
    req.session.save((err) => {
      if (err) console.warn("session save error:", err);
      return res.json(payload);
    });
  } catch (e) {
    console.error("saveSessionAndSend error:", e);
    return res.json(payload);
  }
}

// ---------- API ----------
app.get("/api/countries", (req, res) => {
  try {
    if (!countriesCache) {
      return res.json({ ok: true, countries: [] });
    }
    return res.json({ ok: true, countries: countriesCache });
  } catch (err) {
    console.error("GET /api/countries error:", err);
    return res.status(500).json({ ok: false, error: "Impossible de récupérer la liste des pays" });
  }
});

// check-email with basic rate limiting
app.post("/api/check-email", (req, res) => {
  try {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    if (!checkRate(rate.checkEmail, ip, RATE_LIMIT_MAX.checkEmail)) {
      return res.status(429).json({ ok: false, error: "Trop de requêtes, réessaye plus tard" });
    }
    const email = safeTrim(req.body?.email || "", 200);
    if (!email || !email.includes("@")) return res.status(400).json({ ok: false, error: "Email invalide" });
    const exists = !!findUserByEmail(email);
    return res.json({ ok: true, available: !exists });
  } catch (err) {
    console.error("POST /api/check-email:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

// register
app.post("/api/register", async (req, res) => {
  try {
    const username = safeTrim(req.body?.username || "", 60);
    const email = safeTrim(req.body?.email || "", 200);
    const password = String(req.body?.password || "");
    if (!username || !email || !password) return res.status(400).json({ ok: false, error: "Champs manquants" });

    if (findUserByEmail(email)) return res.json({ ok: false, error: "Email déjà utilisé" });
    if (findUserByUsername(username)) return res.json({ ok: false, error: "Nom d’utilisateur déjà pris" });

const password_hash = await bcrypt.hash(password, 12);

const user = {
  username,
  email,
  password_hash,
  email_verified: false, // 🔒 PHASE 2
  rp: { joined: false },
  createdAt: new Date().toISOString(),
};
    users.push(user);
    await saveUsers();

    // set session and ensure it's saved before responding
    req.session.user = { username: user.username, email: user.email };
    return saveSessionAndSend(req, res, { ok: true });
  } catch (err) {
    console.error("POST /api/register error:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    if (!checkRate(rate.login, ip, RATE_LIMIT_MAX.login)) {
      return res.status(429).json({ ok: false, error: "Trop de tentatives, réessaye plus tard" });
    }

    const userId = safeTrim(req.body?.user || "", 200);
    const password = String(req.body?.password || "");
    if (!userId || !password) return res.status(400).json({ ok: false, error: "Champs manquants" });

    const found = findUserByLogin(userId);
    if (!found) return res.status(401).json({ ok: false, error: "Identifiants invalides" });

    // --- upgrade auto pour anciens comptes SHA256 ---
    if (found.password && !found.password_hash) {
      if (found.password === crypto.createHash("sha256").update(password).digest("hex")) {
        found.password_hash = await bcrypt.hash(password, 12);
        delete found.password;
        await saveUsers(); // persiste la mise à jour
      } else {
        return res.status(401).json({ ok: false, error: "Identifiants invalides" });
      }
    }

    // Vérification standard avec bcrypt
    const ok = await bcrypt.compare(password, found.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: "Identifiants invalides" });

    if (!found.email_verified) {
      return res.status(403).json({ ok: false, error: "Email non vérifié" });
    }

    req.session.user = { username: found.username, email: found.email };
    return saveSessionAndSend(req, res, { ok: true, username: found.username, rp: found.rp });

  } catch (err) {
    console.error("POST /api/login error:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

// logout
app.post("/api/logout", (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.warn("session destroy err", err);
        return res.status(500).json({ ok: false, error: "Erreur lors de la déconnexion" });
      }
      // clear cookie with same options to ensure deletion
      res.clearCookie("wc_sid", {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
      return res.json({ ok: true });
    });
  } catch (err) {
    console.error("POST /api/logout:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

// session
app.get("/api/session", (req, res) => {
  try {
    const s = req.session.user;
    if (!s) return res.json({ ok: false });
    const user = findUserByEmail(s.email) || findUserByUsername(s.username) || null;
    return res.json({ ok: true, username: s.username, email: s.email, rp: user?.rp || { joined: false } });
  } catch (err) {
    console.error("GET /api/session:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

// join-rp: logic leader / pending & persistence
app.post("/api/user/join-rp", async (req, res) => {
  try {
    const s = req.session.user;
    if (!s) return res.status(401).json({ ok: false, error: "Non authentifié" });

    const country_id = safeTrim(req.body?.country_id || "", 200);
    const country_name = safeTrim(req.body?.country_name || "", 200) || null;
    const displayName = safeTrim(req.body?.displayName || "", 60) || null;

    if (!country_id) return res.status(400).json({ ok: false, error: "country_id manquant" });

    const user = findUserByEmail(s.email) || findUserByUsername(s.username) || null;
    if (!user) return res.status(404).json({ ok: false, error: "Utilisateur introuvable" });

    // count existing joined users for that country
    const members = users.filter((u) => u.rp && u.rp.joined && String(u.rp.country_id) === String(country_id));
    if (members.length === 0) {
      // assign leader
      user.rp = {
        joined: true,
        country_id: String(country_id),
        country_name,
        role: "leader",
        displayName,
        joinedAt: new Date().toISOString(),
      };
      await saveUsers();
      req.session.user = { username: user.username, email: user.email };
      return saveSessionAndSend(req, res, { ok: true, rp: user.rp, assigned: "leader" });
    } else {
      // others -> pending
      user.rp = {
        joined: true,
        country_id: String(country_id),
        country_name,
        role: "pending",
        displayName,
        joinedAt: new Date().toISOString(),
      };
      await saveUsers();
      req.session.user = { username: user.username, email: user.email };
      return saveSessionAndSend(req, res, { ok: true, rp: user.rp, next: "/choose-role.html" });
    }
  } catch (err) {
    console.error("POST /api/user/join-rp:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

// assign-role
app.post("/api/user/assign-role", async (req, res) => {
  try {
    const s = req.session.user;
    if (!s) return res.status(401).json({ ok: false, error: "Non authentifié" });
    const role = safeTrim(req.body?.role || "", 40);
    const job = safeTrim(req.body?.job || "", 80) || null;

    const user = findUserByEmail(s.email) || findUserByUsername(s.username) || null;
    if (!user) return res.status(404).json({ ok: false, error: "Utilisateur introuvable" });
    if (!user.rp || !user.rp.joined) return res.status(400).json({ ok: false, error: "Utilisateur n'a pas rejoint le RP" });

    // leader stays leader
    if (user.rp.role === "leader") return res.json({ ok: true, rp: user.rp });

    if (role === "minister" || role === "official") {
      user.rp.role = "official";
      user.rp.job = job;
    } else if (role === "citizen" || role === "civil") {
      user.rp.role = "citizen";
      user.rp.job = job;
    } else {
      return res.status(400).json({ ok: false, error: "role invalide" });
    }

    await saveUsers();
    req.session.user = { username: user.username, email: user.email };
    return saveSessionAndSend(req, res, { ok: true, rp: user.rp });
  } catch (err) {
    console.error("POST /api/user/assign-role:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

// fallback for /api
app.use("/api", (req, res) => {
  return res.status(404).json({ ok: false, error: "Route API introuvable", requested: req.originalUrl });
});

// start
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend ESM running on port ${PORT} (environment: ${process.env.NODE_ENV || 'development'})`);
  console.log(`Serving static files from: ${__dirname}`);
});

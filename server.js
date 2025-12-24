// server.js — Bootstrap (version plus robuste / defensive imports)
import express from "express";
import session from "express-session";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fsSync from "fs";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------------------------------------------------------
// Paths
// -----------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------------------------------------------------------
// Middlewares globaux
// -----------------------------------------------------------------------------
app.set("trust proxy", 1);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// -----------------------------------------------------------------------------
// Sessions (défaut existant, léger warning si MemoryStore en prod)
// -----------------------------------------------------------------------------
if (process.env.NODE_ENV === "production" && (!process.env.SESSION_STORE || process.env.SESSION_STORE === "memory")) {
  console.warn("Session: MemoryStore détecté en production — prévoir un store persistant (Redis, etc.).");
}

app.use(
  session({
    name: "wc_sid",
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 jours
    },
  })
);

// -----------------------------------------------------------------------------
// Static files (front-end)
// -----------------------------------------------------------------------------
app.use(express.static(path.join(__dirname)));

// -----------------------------------------------------------------------------
// Safe API mounting helper (imports modules dynamically and mounts safely)
// -----------------------------------------------------------------------------
function isProbablyRouter(obj) {
  // Express Router is a function with stack array usually — basic heuristic
  return !!obj && (typeof obj === "function" || (typeof obj === "object" && Array.isArray(obj.stack)));
}

async function safeImportAndMount(spec) {
  // spec: { file: './api/auth.api.js', mountPath: '/api' }
  const { file, mountPath } = spec;
  try {
    const mod = await import(file);
    const exported = mod && (mod.default || mod);
    if (!exported) {
      console.warn(`API module ${file} imported but exported value is empty — skipping mount.`);
      return { ok: false, reason: "empty export" };
    }
    if (!isProbablyRouter(exported)) {
      // still try to mount if it's a function (some modules export a factory)
      if (typeof exported === "function") {
        try {
          app.use(mountPath, exported);
          console.log(`Mounted function export from ${file} at ${mountPath}`);
          return { ok: true };
        } catch (e) {
          console.error(`Failed to mount function export from ${file} at ${mountPath}:`, e && e.message ? e.message : e);
          return { ok: false, reason: e };
        }
      }

      console.warn(`API module ${file} does not appear to be an Express Router (type=${typeof exported}) — skipping mount.`);
      return { ok: false, reason: "not-router" };
    }

    // Try to mount and catch path-to-regexp / Layer errors
    try {
      app.use(mountPath, exported);
      console.log(`Mounted ${file} at ${mountPath}`);
      return { ok: true };
    } catch (e) {
      console.error(`Error mounting ${file} at ${mountPath}:`, e && e.stack ? e.stack : e);
      return { ok: false, reason: e };
    }
  } catch (err) {
    console.error(`Failed to import API module ${file}:`, err && err.stack ? err.stack : err);
    return { ok: false, reason: err };
  }
}

// -----------------------------------------------------------------------------
// Fallback SPA / index (servir seulement si index existe, et uniquement pour GET/HTML)
// -----------------------------------------------------------------------------
function spaFallbackHandler(req, res) {
  // Serve index.html only for GET requests that accept HTML
  if (req.method !== "GET" || !req.accepts || !req.accepts("html")) {
    return res.status(404).end();
  }
  const indexPath = path.join(__dirname, "index.html");
  if (!fsSync.existsSync(indexPath)) {
    return res.status(404).send("index.html introuvable");
  }
  return res.sendFile(indexPath);
}

// -----------------------------------------------------------------------------
// Init & Start
// -----------------------------------------------------------------------------
async function start() {
  try {
    // Pré-charges / initialisation métier
    // Note: ces imports restent statiques car ce sont des fonctions internes au core
    // (s'assurer qu'ils ne lancent pas d'exceptions non gérées)
    const { loadUsers } = await import("./core/store.js");
    const { buildCountriesCache } = await import("./core/countries.js");

    await loadUsers();
    buildCountriesCache();

    // Monte les APIs de façon défensive
    const apisToMount = [
      { file: "./api/auth.api.js", mountPath: "/api" },
      { file: "./api/user.api.js", mountPath: "/api/user" },
      { file: "./api/countries.api.js", mountPath: "/api" },
    ];

    for (const spec of apisToMount) {
      const result = await safeImportAndMount(spec);
      if (!result.ok) {
        console.warn(`Warning: mounting ${spec.file} failed — server continues but endpoints from this module may be unavailable.`);
      }
    }

    // Fallback SPA — doit être après le montage des APIs
app.get(/^(?!\/api).*$/, spaFallbackHandler);

    app.listen(PORT, () => {
      console.log(`WorldConflict backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server (fatal):", err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

start();

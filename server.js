// server.js — Bootstrap uniquement (aucune logique métier)

import express from "express";
import session from "express-session";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// APIs
import authApi from "./api/auth.api.js";
import userApi from "./api/user.api.js";
import countriesApi from "./api/countries.api.js";

// core init
import { loadUsers } from "./core/store.js";
import { buildCountriesCache } from "./core/countries.js";

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
// Sessions
// -----------------------------------------------------------------------------
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
app.use(express.static(path.join(__dirname, "public")));

// -----------------------------------------------------------------------------
// APIs
// -----------------------------------------------------------------------------
app.use("/api", authApi);
app.use("/api/user", userApi);
app.use("/api", countriesApi);

// -----------------------------------------------------------------------------
// Fallback SPA / index
// -----------------------------------------------------------------------------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// -----------------------------------------------------------------------------
// Init & Start
// -----------------------------------------------------------------------------
async function start() {
  try {
    await loadUsers();
    buildCountriesCache();

    app.listen(PORT, () => {
      console.log(`WorldConflict backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();

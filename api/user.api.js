// api/user.api.js
import express from "express";

import {
  saveUsers,
  findUserByEmail,
  findUserByUsername,
  getUsers,
} from "../core/store.js";

const router = express.Router();

// petits helpers locaux
const safeTrim = (s, max = 200) => (typeof s === "string" ? s.trim().slice(0, max) : "");

/**
 * Save session then send JSON (assure que le cookie de session est écrit).
 */
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

/**
 * POST /join-rp
 * Body: { country_id, country_name?, displayName? }
 * - Doit être monté sur /api/user (server.js : app.use('/api/user', userApi))
 */
router.post("/join-rp", async (req, res) => {
  try {
    const s = req.session?.user;
    if (!s) return res.status(401).json({ ok: false, error: "Non authentifié" });

    const country_id = safeTrim(req.body?.country_id || "", 200);
    const country_name = safeTrim(req.body?.country_name || "", 200) || null;
    const displayName = safeTrim(req.body?.displayName || "", 60) || null;

    if (!country_id) return res.status(400).json({ ok: false, error: "country_id manquant" });

    const user = findUserByEmail(s.email) || findUserByUsername(s.username) || null;
    if (!user) return res.status(404).json({ ok: false, error: "Utilisateur introuvable" });

    // count existing joined users for that country
    const members = getUsers().filter((u) => u.rp && u.rp.joined && String(u.rp.country_id) === String(country_id));
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
      if (req.session) req.session.user = { username: user.username, email: user.email };
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
      if (req.session) req.session.user = { username: user.username, email: user.email };
      return saveSessionAndSend(req, res, { ok: true, rp: user.rp, next: "/choose-role.html" });
    }
  } catch (err) {
    console.error("POST /user/join-rp:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

/**
 * POST /assign-role
 * Body: { role, job? }
 * - role can be "minister"|"official" -> official, or "citizen"|"civil" -> citizen
 * - leader cannot be demoted by this route
 */
router.post("/assign-role", async (req, res) => {
  try {
    const s = req.session?.user;
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
    if (req.session) req.session.user = { username: user.username, email: user.email };
    return saveSessionAndSend(req, res, { ok: true, rp: user.rp });
  } catch (err) {
    console.error("POST /user/assign-role:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

export default router;

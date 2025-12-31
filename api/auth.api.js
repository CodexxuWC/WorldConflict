// api/auth.api.js
import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";

import {
  loadUsers,
  saveUsers,
  findUserByEmail,
  findUserByUsername,
  findUserByLogin,
  getUsers,
  addUser,
} from "../core/store.js";

import { rateMaps, checkRate, RATE_LIMIT_MAX } from "../core/rateLimit.js";
import { sendVerificationEmail, sendMail } from "../utils/mailer.js";

const router = express.Router();

// local helpers
const safeTrim = (s, max = 200) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const normalize = (s) => (typeof s === "string" ? s.trim().toLowerCase() : "");

// Base URL used to build verification links (falls back to a sensible default)
const BASE_URL = process.env.BASE_URL || `https://worldconflict.onrender.com`;

/**
 * Save session and send JSON (ensures cookie is written before response when session exists)
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
 * POST /check-email
 * Body: { email }
 * Returns: { ok: true, available: boolean }
 */
router.post("/check-email", (req, res) => {
  try {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    if (!checkRate(rateMaps.checkEmail, ip, RATE_LIMIT_MAX.checkEmail)) {
      return res.status(429).json({ ok: false, error: "Trop de requêtes, réessaye plus tard" });
    }

    const email = safeTrim(req.body?.email || "", 200);
    if (!email || !email.includes("@")) return res.status(400).json({ ok: false, error: "Email invalide" });

    const exists = !!findUserByEmail(email);
    return res.json({ ok: true, available: !exists });
  } catch (err) {
    console.error("POST /check-email:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

/**
 * POST /register
 * Body: { username, email, password }
 * Creates user, issues verification token, sends email (best-effort).
 */
router.post("/register", async (req, res) => {
  try {
    const username = safeTrim(req.body?.username || "", 60);
    const email = safeTrim(req.body?.email || "", 200);
    const password = String(req.body?.password || "");

    if (!username || !email || !password) return res.status(400).json({ ok: false, error: "Champs manquants" });

    if (findUserByEmail(email)) return res.json({ ok: false, error: "Email déjà utilisé" });
    if (findUserByUsername(username)) return res.json({ ok: false, error: "Nom d’utilisateur déjà pris" });

    const password_hash = await bcrypt.hash(password, 12);

      // email verification token (À FAIRE)
   // const emailToken = crypto.randomBytes(32).toString("hex");
   // const emailTokenExpires = Date.now() + 1000 * 60 * 60 * 24; // 24 hours

    const user = {
      username,
      email,
      password_hash,
      email_verified: true,
      email_verify_token: emailToken,
      email_verify_expires: emailTokenExpires,
      rp: { joined: false },
      createdAt: new Date().toISOString(),
    };

    // persist via store
    await addUser(user);

    // set session (saved by saveSessionAndSend)
    if (req.session) req.session.user = { username: user.username, email: user.email };

   // const verifyUrl = `${BASE_URL.replace(/\/$/, "")}/api/verify-email?token=${encodeURIComponent(emailToken)}`;

    try {
      // sendVerificationEmail lives in utils/mailer and handles fallback logging
     // await sendVerificationEmail(email, verifyUrl);

      const respPayload = { ok: true };
      if (process.env.NODE_ENV !== "production" || !process.env.MAIL_HOST || !process.env.MAIL_USER) {
        respPayload.preview_verify_url = verifyUrl;
      }
      return saveSessionAndSend(req, res, respPayload);
    } catch (e) {
      console.error("Failed to send verification email:", e && e.message ? e.message : e);
      const respPayload = {
        ok: true,
        warning: "Impossible d'envoyer l'email de vérification. Vérifie les logs.",
        preview_verify_url: verifyUrl,
      };
      return saveSessionAndSend(req, res, respPayload);
    }
  } catch (err) {
    console.error("POST /register error:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

/**
 * POST /login
 * Body: { user, password } where user is username or email
 */
router.post("/login", async (req, res) => {
  try {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    if (!checkRate(rateMaps.login, ip, RATE_LIMIT_MAX.login)) {
      return res.status(429).json({ ok: false, error: "Trop de tentatives, réessaye plus tard" });
    }

    const userId = safeTrim(req.body?.user || "", 200);
    const password = String(req.body?.password || "");
    if (!userId || !password) return res.status(400).json({ ok: false, error: "Champs manquants" });

    const found = findUserByLogin(userId);
    if (!found) return res.status(401).json({ ok: false, error: "Identifiants invalides" });

    // upgrade old SHA256 => bcrypt if needed
    if (found.password && !found.password_hash) {
      if (found.password === crypto.createHash("sha256").update(password).digest("hex")) {
        found.password_hash = await bcrypt.hash(password, 12);
        delete found.password;
        await saveUsers();
      } else {
        return res.status(401).json({ ok: false, error: "Identifiants invalides" });
      }
    }

    const ok = await bcrypt.compare(password, found.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: "Identifiants invalides" });

    if (req.session) req.session.user = { username: found.username, email: found.email };
    return saveSessionAndSend(req, res, { ok: true, username: found.username, rp: found.rp });
  } catch (err) {
    console.error("POST /login error:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

/**
 * POST /resend-verify
 * Accepts logged-in session or body.email.
 * Uses sendMail wrapper from utils/mailer.js to send the message (so transport logic is centralized).
 */
router.post("/resend-verify", async (req, res) => {
  try {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    if (!checkRate(rateMaps.resendVerify, ip, RATE_LIMIT_MAX.resendVerify)) {
      return res.status(429).json({ ok: false, error: "Trop de requêtes, réessaye plus tard" });
    }

    let user = null;
    if (req.session && req.session.user && req.session.user.email) {
      user = findUserByEmail(req.session.user.email);
    } else {
      const email = safeTrim(req.body?.email || "", 200);
      if (!email || !email.includes("@")) return res.status(400).json({ ok: false, error: "Email invalide" });
      user = findUserByEmail(email);
    }

    if (!user) return res.status(404).json({ ok: false, error: "Utilisateur introuvable" });
    if (user.email_verified) return res.json({ ok: true, message: "Email déjà vérifié" });

    // new token and expiry
    const token = crypto.randomBytes(32).toString("hex");
    user.email_verify_token = token;
    user.email_verify_expires = Date.now() + 1000 * 60 * 60 * 24;

    await saveUsers();

    const verifyUrl = `${BASE_URL.replace(/\/$/, "")}/api/verify-email?token=${encodeURIComponent(token)}`;

    try {
      // use generic sendMail wrapper (mailer handles fallback)
      await sendMail({
        from: process.env.MAIL_FROM || process.env.EMAIL_FROM,
        to: user.email,
        subject: "Renvoyer le lien de vérification — WorldConflict",
        text: `Voici votre lien de vérification:\n\n${verifyUrl}`,
        html: `<p>Voici votre lien de vérification:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
      });

      const resp = { ok: true };
      if (process.env.NODE_ENV !== "production" || !process.env.MAIL_HOST || !process.env.MAIL_USER) {
        resp.preview_verify_url = verifyUrl;
      }
      return res.json(resp);
    } catch (e) {
      console.error("Failed to resend verification email:", e && e.message ? e.message : e);
      return res.status(500).json({ ok: false, error: "Impossible d'envoyer l'email" });
    }
  } catch (err) {
    console.error("POST /resend-verify error:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

/**
 * GET /verify-email
 * Query: token
 * Marks the user as verified and shows a simple confirmation response.
 */
router.get("/verify-email", async (req, res) => {
  try {
    const token = req.query.token || "";
    if (!token) {
      return res.status(400).send("<h1>Token manquant</h1>");
    }

    const user = getUsers().find(
      (u) => u.email_verify_token === token && u.email_verify_expires && Number(u.email_verify_expires) > Date.now()
    );

    if (!user) {
      return res.status(400).send("<h1>Lien invalide ou expiré</h1><p>Demande un nouveau lien depuis la page de connexion.</p>");
    }

    user.email_verified = true;
    delete user.email_verify_token;
    delete user.email_verify_expires;

    await saveUsers();

    // Simple confirmation page (client can redirect to app)
    return res.send(`
      <html>
        <head><meta charset="utf-8" /><title>Email vérifié</title></head>
        <body style="font-family: Arial, sans-serif; padding:24px;">
          <h1>Email vérifié ✅</h1>
          <p>Ton adresse email a bien été vérifiée. Tu peux maintenant te connecter.</p>
          <p><a href="/">Retour à l'accueil</a></p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("GET /verify-email error:", err);
    return res.status(500).send("<h1>Erreur serveur</h1>");
  }
});

/**
 * POST /logout
 */
router.post("/logout", (req, res) => {
  try {
    if (!req.session) return res.json({ ok: true });
    req.session.destroy((err) => {
      if (err) {
        console.warn("session destroy err", err);
        return res.status(500).json({ ok: false, error: "Erreur lors de la déconnexion" });
      }
      // clear cookie
      res.clearCookie("wc_sid", {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
      return res.json({ ok: true });
    });
  } catch (err) {
    console.error("POST /logout:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

/**
 * GET /session
 */
router.get("/session", (req, res) => {
  try {
    const s = req.session?.user;
    if (!s) return res.json({ ok: false });
    const user = findUserByEmail(s.email) || findUserByUsername(s.username) || null;
    return res.json({ ok: true, username: s.username, email: s.email, rp: user?.rp || { joined: false } });
  } catch (err) {
    console.error("GET /session:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

export default router;

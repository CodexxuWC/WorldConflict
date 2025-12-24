// api/countries.api.js
import express from "express";
import { getCountriesCache } from "../core/countries.js";

const router = express.Router();

/**
 * GET /countries
 * - Mounté sur /api (server.js : app.use('/api', countriesApi))
 * Returns: { ok: true, countries: [...] }
 */
router.get("/countries", (req, res) => {
  try {
    const countriesCache = getCountriesCache();
    if (!countriesCache) {
      return res.json({ ok: true, countries: [] });
    }
    return res.json({ ok: true, countries: countriesCache });
  } catch (err) {
    console.error("GET /countries error:", err);
    return res.status(500).json({ ok: false, error: "Impossible de récupérer la liste des pays" });
  }
});

export default router;

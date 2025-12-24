// core/store.js
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

// internal users array (source de vérité en mémoire)
let users = [];

/**
 * Ensure data directory exists
 */
async function ensureDataDir() {
  if (!fsSync.existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

/**
 * Load users from disk into memory (popule `users`).
 * Safe to call multiple fois.
 */
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
    console.error("store.loadUsers failed:", e);
    users = [];
  }
}

/**
 * Persist current in-memory `users` to disk.
 */
async function saveUsers() {
  try {
    await ensureDataDir();
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
  } catch (e) {
    console.error("store.saveUsers failed:", e);
  }
}

/* Helpers locaux */
const normalize = (s) => (typeof s === "string" ? s.trim().toLowerCase() : "");
const safeTrim = (s, max = 200) => (typeof s === "string" ? s.trim().slice(0, max) : "");

/* Recherches (utilisées par l'API) */
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

/* Utilitaires pratiques pour éviter d'exposer trop l'array directement */
function getUsers() {
  return users;
}
async function addUser(user) {
  users.push(user);
  await saveUsers();
}
async function replaceUser(predicateFn, updaterFn) {
  const idx = users.findIndex(predicateFn);
  if (idx === -1) return null;
  users[idx] = updaterFn(users[idx]);
  await saveUsers();
  return users[idx];
}

export {
  loadUsers,
  saveUsers,
  findUserByEmail,
  findUserByUsername,
  findUserByLogin,
  getUsers,
  addUser,
  replaceUser,
  // on exporte l'array uniquement si tu veux l'utiliser directement :
  users as _users_internal,
};

import crypto from "node:crypto";
import db from "./db.js";

const SESSION_DAYS = 7;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString().replace("T", " ").slice(0, 19);
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(hashToken(token), userId, expiresAt);
  return { token, expires_at: expiresAt };
}

function tokenFromRequest(req) {
  const header = req.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

function publicUser(user) {
  return { id: user.id, email: user.email, display_name: user.display_name, role: user.role };
}

function requireAuth(req, res, next) {
  const token = tokenFromRequest(req);
  if (!token) return res.status(401).json({ error: "sign in required" });
  const user = db.prepare(`SELECT u.* FROM sessions s
                           JOIN users u ON u.id = s.user_id
                           WHERE s.token_hash = ? AND s.expires_at > datetime('now')`).get(hashToken(token));
  if (!user) return res.status(401).json({ error: "session expired" });
  req.user = user;
  req.token = token;
  next();
}

export {
  hashPassword,
  verifyPassword,
  hashToken,
  createSession,
  tokenFromRequest,
  publicUser,
  requireAuth,
};

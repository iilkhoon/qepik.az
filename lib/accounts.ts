// Accounts and sign-in sessions kept in the site's own database. Passwords are stored as scrypt
// hashes; the browser holds a random session token and the database only its SHA-256 digest.
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { db } from "./db";

export const SESSION_COOKIE = "qepik_session";
const SESSION_DAYS = 30;
export type Account = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  city: string | null;
  role: string;
};
type Row = Account & { password_hash: string };

const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const derive = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 }, (e, key) =>
      e ? reject(e) : resolve(key),
    ),
  );

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await derive(password, Buffer.from(salt, "hex"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
// Azerbaijani mobile and Baku landline numbers, stored as +994XXXXXXXXX.
export function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "").replace(/^(994|0)/, "");
  return /^(10|12|50|51|55|60|70|77|99)\d{7}$/.test(digits) ? "+994" + digits : null;
}

const publicAccount = (r: Row): Account => ({
  id: r.id,
  email: r.email,
  name: r.name,
  phone: r.phone,
  city: r.city,
  role: r.role,
});

export async function createAccount(input: {
  name: string;
  email: string;
  password: string;
  phone?: string | null;
  city?: string | null;
}) {
  const email = normalizeEmail(input.email);
  const existing = await db().prepare("SELECT id FROM users WHERE email=?").bind(email).first();
  if (existing) return null;
  const id = "u_" + randomBytes(12).toString("hex");
  await db()
    .prepare(
      "INSERT INTO users (id,email,phone,name,password_hash,role,city,created_at) VALUES (?,?,?,?,?,?,?,?)",
    )
    .bind(
      id,
      email,
      input.phone || null,
      input.name.trim(),
      await hashPassword(input.password),
      "user",
      input.city || null,
      Date.now(),
    )
    .run();
  return (await accountById(id))!;
}

export async function accountById(id: string) {
  const row = await db().prepare("SELECT * FROM users WHERE id=?").bind(id).first<Row>();
  return row ? publicAccount(row) : null;
}

// A fixed hash keeps the response time the same whether or not the e-mail exists.
let decoy: Promise<string> | undefined;
export async function checkCredentials(email: string, password: string) {
  const row = await db()
    .prepare("SELECT * FROM users WHERE email=?")
    .bind(normalizeEmail(email))
    .first<Row>();
  decoy ??= hashPassword(randomBytes(12).toString("hex"));
  const ok = await verifyPassword(password, row?.password_hash || (await decoy));
  return row && ok ? publicAccount(row) : null;
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await db().batch([
    db().prepare("DELETE FROM sessions WHERE expires_at<?").bind(now),
    db()
      .prepare("INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)")
      .bind(digest(token), userId, now + SESSION_DAYS * 86400000, now),
  ]);
  return token;
}
export async function endSession(token: string) {
  await db().prepare("DELETE FROM sessions WHERE token_hash=?").bind(digest(token)).run();
}
export async function accountForToken(token: string | undefined | null) {
  if (!token || token.length > 200) return null;
  const row = await db()
    .prepare(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
    )
    .bind(digest(token), Date.now())
    .first<Row>();
  return row ? publicAccount(row) : null;
}

export function sessionCookie(token: string | null, secure: boolean) {
  return (
    `${SESSION_COOKIE}=${token || ""}; Path=/; HttpOnly; SameSite=Lax` +
    (secure ? "; Secure" : "") +
    `; Max-Age=${token ? SESSION_DAYS * 86400 : 0}`
  );
}

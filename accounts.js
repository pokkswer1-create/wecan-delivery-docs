const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveDataRoot } = require("./data-root");

const COOKIE = "wecan_sess";

function userDir(root, sub) {
  const id = String(sub || "").trim();
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("구글 계정 식별자가 올바르지 않습니다.");
  }
  return path.join(resolveDataRoot(root), "users", id);
}

function listUserIds(root) {
  const dir = path.join(resolveDataRoot(root), "users");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^[a-zA-Z0-9_-]+$/.test(d.name))
    .map((d) => d.name)
    .sort();
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function migrateLegacyIfFirstUser(root, sub) {
  const dest = userDir(root, sub);
  fs.mkdirSync(dest, { recursive: true });
  if (listUserIds(root).filter((id) => id !== String(sub)).length > 0) {
    return dest;
  }
  if (fs.existsSync(path.join(dest, "supplier.json"))) return dest;
  const live = resolveDataRoot(root);
  const seed = path.join(root, "data");
  const legacy = fs.existsSync(path.join(live, "supplier.json")) ? live : seed;
  copyIfExists(path.join(legacy, "supplier.json"), path.join(dest, "supplier.json"));
  copyIfExists(path.join(legacy, "presets.json"), path.join(dest, "presets.json"));
  copyIfExists(path.join(legacy, "seal.png"), path.join(dest, "seal.png"));
  copyIfExists(path.join(legacy, "biz_reg.png"), path.join(dest, "biz_reg.png"));
  copyIfExists(path.join(legacy, "bank.png"), path.join(dest, "bank.png"));
  copyIfExists(path.join(legacy, "mail-log.json"), path.join(dest, "mail-log.json"));
  return dest;
}

function keyFromSecret(secret) {
  return crypto.createHash("sha256").update(String(secret || "")).digest();
}

function signSession(payload, secret) {
  const body = Buffer.from(
    JSON.stringify({
      sub: payload.sub,
      email: payload.email || "",
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    }),
    "utf8"
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", keyFromSecret(secret)).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function getCookie(cookieHeader, name) {
  return parseCookies(cookieHeader)[name] || "";
}

function parseCookies(header) {
  const out = {};
  String(header || "")
    .split(";")
    .forEach((part) => {
      const i = part.indexOf("=");
      if (i < 1) return;
      const k = part.slice(0, i).trim();
      out[k] = part.slice(i + 1).trim();
    });
  return out;
}

function readSession(cookieHeader, secret) {
  const raw = parseCookies(cookieHeader)[COOKIE];
  if (!raw || !raw.includes(".")) return null;
  const [body, sig] = raw.split(".");
  const expect = crypto.createHmac("sha256", keyFromSecret(secret)).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!data.sub || data.exp < Date.now()) return null;
    return { sub: String(data.sub), email: String(data.email || "") };
  } catch (_) {
    return null;
  }
}

function sessionCookie(token, { secure } = {}) {
  const parts = [
    `${COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=2592000",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function encryptSecret(plain, secret) {
  const iv = crypto.randomBytes(12);
  const key = keyFromSecret(secret);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

function decryptSecret(packed, secret) {
  const buf = Buffer.from(String(packed || ""), "base64url");
  if (buf.length < 29) throw new Error("토큰이 손상되었습니다.");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

function tokenPath(dir) {
  return path.join(dir, "tokens.json");
}

function saveGoogleTokens(dir, tokens, secret) {
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    refresh: tokens.refresh_token ? encryptSecret(tokens.refresh_token, secret) : "",
    access: tokens.access_token || "",
    expiry: tokens.expiry_date || 0,
    email: tokens.email || "",
  };
  const prev = loadGoogleTokens(dir, secret) || {};
  if (!payload.refresh && prev.refresh_token) {
    payload.refresh = encryptSecret(prev.refresh_token, secret);
  }
  fs.writeFileSync(tokenPath(dir), JSON.stringify(payload, null, 2), "utf8");
}

function loadGoogleTokens(dir, secret) {
  try {
    const raw = JSON.parse(fs.readFileSync(tokenPath(dir), "utf8"));
    return {
      refresh_token: raw.refresh ? decryptSecret(raw.refresh, secret) : "",
      access_token: raw.access || "",
      expiry_date: raw.expiry || 0,
      email: raw.email || "",
    };
  } catch (_) {
    return null;
  }
}

module.exports = {
  COOKIE,
  userDir,
  listUserIds,
  migrateLegacyIfFirstUser,
  signSession,
  readSession,
  sessionCookie,
  clearSessionCookie,
  encryptSecret,
  decryptSecret,
  saveGoogleTokens,
  loadGoogleTokens,
  getCookie,
};

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MAGIC = Buffer.from("WEC1");

function keyFromSecret(secret) {
  return crypto.createHash("sha256").update(String(secret || "")).digest();
}

function fileSecret(env = process.env) {
  return String(env.SESSION_SECRET || env.GOOGLE_CLIENT_SECRET || "").trim();
}

function isEncrypted(buf) {
  return Boolean(
    buf &&
      buf.length >= MAGIC.length + 12 + 16 &&
      buf.subarray(0, MAGIC.length).equals(MAGIC)
  );
}

function encryptBytes(plain, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, enc]);
}

function decryptBytes(buf, secret) {
  if (!buf || !buf.length) return buf;
  if (!isEncrypted(buf)) return buf;
  const iv = buf.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = buf.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const enc = buf.subarray(MAGIC.length + 28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

function readMaybeEncryptedFile(filePath, secret) {
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  return decryptBytes(buf, secret || fileSecret());
}

function writeEncryptedFile(filePath, plain, secret) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const key = secret || fileSecret();
  const out = key ? encryptBytes(plain, key) : plain;
  fs.writeFileSync(filePath, out);
}

module.exports = {
  isEncrypted,
  encryptBytes,
  decryptBytes,
  fileSecret,
  readMaybeEncryptedFile,
  writeEncryptedFile,
};

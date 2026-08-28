const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  userDir,
  listUserIds,
  migrateLegacyIfFirstUser,
  signSession,
  readSession,
  encryptSecret,
  decryptSecret,
} = require("./accounts");

test("userDir keeps google sub safe", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wecan-acc-"));
  const dir = userDir(root, "1234567890");
  assert.equal(path.basename(dir), "1234567890");
  assert.ok(dir.includes("users"));
});

test("userDir rejects empty or pathy ids", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wecan-acc-"));
  assert.throws(() => userDir(root, "../etc"));
  assert.throws(() => userDir(root, ""));
});

test("first google user copies legacy supplier.json", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wecan-acc-"));
  const data = path.join(root, "data");
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, "supplier.json"), JSON.stringify({ name: "위캔" }), "utf8");
  const dest = migrateLegacyIfFirstUser(root, "sub1");
  const copied = JSON.parse(fs.readFileSync(path.join(dest, "supplier.json"), "utf8"));
  assert.equal(copied.name, "위캔");
  assert.deepEqual(listUserIds(root), ["sub1"]);
  const dest2 = migrateLegacyIfFirstUser(root, "sub2");
  assert.equal(fs.existsSync(path.join(dest2, "supplier.json")), false);
});

test("session roundtrip", () => {
  const secret = "test-secret-for-hmac";
  const token = signSession({ sub: "1", email: "a@b.c" }, secret);
  const parsed = readSession("wecan_sess=" + token, secret);
  assert.equal(parsed.sub, "1");
  assert.equal(parsed.email, "a@b.c");
});

test("bad session is null", () => {
  assert.equal(readSession("wecan_sess=nope", "secret"), null);
});

test("token encrypt roundtrip", () => {
  const secret = "another-secret-value";
  const enc = encryptSecret("refresh-token-value", secret);
  assert.notEqual(enc, "refresh-token-value");
  assert.equal(decryptSecret(enc, secret), "refresh-token-value");
});

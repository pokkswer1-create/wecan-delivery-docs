const test = require("node:test");
const assert = require("node:assert/strict");
const {
  encryptBytes,
  decryptBytes,
  isEncrypted,
} = require("./file-crypto");

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

test("encryptBytes roundtrip", () => {
  const secret = "test-session-secret-value";
  const enc = encryptBytes(png, secret);
  assert.equal(isEncrypted(enc), true);
  assert.notEqual(enc[0], 0x89);
  assert.deepEqual(decryptBytes(enc, secret), png);
});

test("decryptBytes leaves legacy plaintext images alone", () => {
  assert.equal(isEncrypted(png), false);
  assert.deepEqual(decryptBytes(png, "any-secret"), png);
});

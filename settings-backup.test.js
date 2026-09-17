const test = require("node:test");
const assert = require("node:assert/strict");
const {
  filledCount,
  shouldRestoreSupplier,
  missingFileKinds,
  scrubPhoneFiles,
} = require("./public/settings-backup");

test("should restore when server is empty and phone has a backup", () => {
  assert.equal(
    shouldRestoreSupplier({}, { name: "위캔", phone: "010", account: "123" }),
    true,
  );
});

test("should not restore when server already has more filled fields", () => {
  assert.equal(
    shouldRestoreSupplier(
      { name: "위캔", phone: "010", account: "123", email: "a@b.c" },
      { name: "위캔" },
    ),
    false,
  );
});

test("should restore seal when server lost the file", () => {
  assert.deepEqual(
    missingFileKinds({ seal: false, biz: false, bank: false }, { seal: "data:image/png;base64,xx" }),
    ["seal"],
  );
});

test("restores business license and bank copy from the phone when the server lost them", () => {
  assert.deepEqual(
    missingFileKinds(
      { seal: false, biz: false, bank: false },
      { seal: "s", biz: "b", bank: "k" },
    ),
    ["seal", "biz", "bank"],
  );
});

test("scrubPhoneFiles keeps seal, business license, and bank copy", () => {
  assert.deepEqual(
    scrubPhoneFiles({ seal: "s", biz: "b", bank: "k" }),
    { seal: "s", biz: "b", bank: "k" },
  );
});

test("filledCount ignores blanks", () => {
  assert.equal(filledCount({ name: "위캔", phone: "  ", email: "" }), 1);
});

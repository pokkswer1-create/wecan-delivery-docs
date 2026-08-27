const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  emptySupplier,
  normalizeSupplier,
  isComplete,
  missingFields,
  loadSupplier,
  saveSupplier,
  docFilePrefix,
} = require("./supplier");

const sample = {
  name: "테스트상호",
  nameEn: "testco",
  ceo: "홍길동",
  bizNo: "123-45-67890",
  address: "서울시 테스트구 1",
  phone: "010-0000-0000",
  email: "test@example.com",
  bank: "테스트은행",
  account: "111-22-3333",
  accountHolder: "홍길동",
};

test("empty supplier is not complete", () => {
  assert.equal(isComplete(emptySupplier()), false);
  assert.ok(missingFields(emptySupplier()).includes("name"));
});

test("normalize trims and fills all keys", () => {
  const n = normalizeSupplier({ name: "  에이  ", extra: 1 });
  assert.equal(n.name, "에이");
  assert.equal(n.ceo, "");
  assert.equal(n.extra, undefined);
});

test("complete sample passes", () => {
  assert.equal(isComplete(sample), true);
  assert.deepEqual(missingFields(sample), []);
});

test("docFilePrefix uses english name then korean", () => {
  assert.equal(docFilePrefix(sample), "testco");
  assert.equal(docFilePrefix({ name: "한글상호" }), "한글상호");
  assert.equal(docFilePrefix({}), "docs");
});

test("save then load roundtrip in a temp data dir", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wecan-sup-"));
  fs.mkdirSync(path.join(root, "data"));
  saveSupplier(root, sample);
  const loaded = loadSupplier(root);
  assert.equal(loaded.name, "테스트상호");
  assert.equal(loaded.bizNo, "123-45-67890");
  assert.equal(isComplete(loaded), true);
});

test("load missing file returns empty not throw", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wecan-sup-"));
  const loaded = loadSupplier(root);
  assert.equal(loaded.name, "");
  assert.equal(isComplete(loaded), false);
});

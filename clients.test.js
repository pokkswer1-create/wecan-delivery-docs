const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  normalizeClient,
  cleanClients,
  loadClients,
  saveClients,
  upsertClient,
} = require("./clients");

test("normalizeClient trims name and email", () => {
  const c = normalizeClient({ name: "  한빛체육  ", email: " a@b.c ", phone: " 010 " });
  assert.equal(c.name, "한빛체육");
  assert.equal(c.email, "a@b.c");
  assert.equal(c.phone, "010");
});

test("cleanClients drops nameless rows and keeps last of the same name", () => {
  const list = cleanClients([
    { name: "", email: "x@y.z" },
    { name: "한빛", email: "old@test.com" },
    { name: "한빛", email: "new@test.com", phone: "010" },
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "한빛");
  assert.equal(list[0].email, "new@test.com");
  assert.equal(list[0].phone, "010");
});

test("save then load roundtrip in a temp dir", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wecan-cli-"));
  const saved = saveClients(dir, [
    { name: "수신처A", email: "a@test.com" },
    { name: "수신처B", phone: "02-1" },
  ]);
  assert.equal(saved.length, 2);
  const loaded = loadClients(dir);
  assert.equal(loaded[0].name, "수신처A");
  assert.equal(loaded[0].email, "a@test.com");
  assert.equal(loaded[1].name, "수신처B");
  assert.equal(loaded[1].phone, "02-1");
});

test("upsertClient updates the same name and keeps id", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wecan-cli-"));
  const first = upsertClient(dir, { name: "한빛", email: "old@test.com" });
  const id = first[0].id;
  const second = upsertClient(dir, { name: "한빛", email: "new@test.com" });
  assert.equal(second.length, 1);
  assert.equal(second[0].id, id);
  assert.equal(second[0].email, "new@test.com");
});

test("load missing file returns empty list", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wecan-cli-"));
  assert.deepEqual(loadClients(dir), []);
});

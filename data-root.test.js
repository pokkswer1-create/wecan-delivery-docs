const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolveDataRoot } = require("./data-root");
const { packUserDir, restoreUserDir } = require("./user-bundle");
const { memoryDurableStore } = require("./durable-store");

test("resolveDataRoot uses DATA_DIR when set", () => {
  const app = path.join(os.tmpdir(), "wecan-app");
  assert.equal(
    resolveDataRoot(app, { DATA_DIR: "/var/data" }),
    path.resolve("/var/data"),
  );
  assert.equal(resolveDataRoot(app, {}), path.join(app, "data"));
});

test("pack then restore survives wiping the user folder", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wecan-user-"));
  fs.writeFileSync(
    path.join(dir, "supplier.json"),
    JSON.stringify({ name: "위캔", email: "a@b.c" }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "seal.png"), Buffer.from("png-bytes"));
  const bundle = packUserDir(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
  restoreUserDir(dir, bundle);
  const supplier = JSON.parse(fs.readFileSync(path.join(dir, "supplier.json"), "utf8"));
  assert.equal(supplier.name, "위캔");
  assert.equal(fs.readFileSync(path.join(dir, "seal.png")).toString(), "png-bytes");
});

test("missingPackedFiles finds images gone from disk", () => {
  const { missingPackedFiles } = require("./user-bundle");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wecan-miss-"));
  fs.writeFileSync(
    path.join(dir, "supplier.json"),
    JSON.stringify({ name: "위캔" }),
    "utf8",
  );
  const bundle = {
    files: {
      "supplier.json": { encoding: "utf8", content: "{\"name\":\"위캔\"}" },
      "seal.png": { encoding: "base64", content: Buffer.from("seal").toString("base64") },
      "biz_reg.png": { encoding: "base64", content: Buffer.from("biz").toString("base64") },
    },
  };
  assert.deepEqual(missingPackedFiles(dir, bundle).sort(), ["biz_reg.png", "seal.png"]);
});

test("durable store roundtrip after empty local dir", async () => {
  const store = memoryDurableStore();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wecan-dur-"));
  fs.writeFileSync(
    path.join(dir, "supplier.json"),
    JSON.stringify({ name: "위캔", phone: "010" }),
    "utf8",
  );
  await store.save("sub1", packUserDir(dir));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
  const bundle = await store.load("sub1");
  restoreUserDir(dir, bundle);
  const supplier = JSON.parse(fs.readFileSync(path.join(dir, "supplier.json"), "utf8"));
  assert.equal(supplier.name, "위캔");
  assert.equal(supplier.phone, "010");
});

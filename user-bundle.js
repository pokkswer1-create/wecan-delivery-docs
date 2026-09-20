const fs = require("fs");
const path = require("path");

const TEXT_FILES = ["supplier.json", "presets.json", "clients.json", "mail-log.json", "tokens.json"];
const BIN_FILES = ["seal.png", "biz_reg.png", "bank.png"];

function packUserDir(dir) {
  const files = {};
  for (const name of TEXT_FILES) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) continue;
    files[name] = { encoding: "utf8", content: fs.readFileSync(p, "utf8") };
  }
  for (const name of BIN_FILES) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) continue;
    files[name] = {
      encoding: "base64",
      content: fs.readFileSync(p).toString("base64"),
    };
  }
  return { files, savedAt: Date.now() };
}

function restoreUserDir(dir, bundle) {
  if (!bundle || !bundle.files) return;
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, row] of Object.entries(bundle.files)) {
    if (!row || !row.content) continue;
    const dest = path.join(dir, path.basename(name));
    if (row.encoding === "base64") {
      fs.writeFileSync(dest, Buffer.from(row.content, "base64"));
    } else {
      fs.writeFileSync(dest, row.content, "utf8");
    }
  }
}

function hasSupplier(dir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "supplier.json"), "utf8"));
    return Boolean(raw && (raw.name || raw.phone || raw.account));
  } catch (_) {
    return false;
  }
}

function missingPackedFiles(dir, bundle) {
  if (!bundle || !bundle.files) return [];
  return Object.keys(bundle.files).filter((name) => {
    const row = bundle.files[name];
    if (!row || !row.content) return false;
    return !fs.existsSync(path.join(dir, path.basename(name)));
  });
}

module.exports = {
  TEXT_FILES,
  BIN_FILES,
  packUserDir,
  restoreUserDir,
  hasSupplier,
  missingPackedFiles,
};

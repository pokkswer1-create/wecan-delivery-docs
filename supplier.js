const fs = require("fs");
const path = require("path");

const KEYS = [
  "name",
  "nameEn",
  "ceo",
  "bizNo",
  "address",
  "phone",
  "email",
  "bank",
  "account",
  "accountHolder",
];

const REQUIRED = KEYS.filter((k) => k !== "nameEn");

function emptySupplier() {
  return KEYS.reduce((o, k) => {
    o[k] = "";
    return o;
  }, {});
}

function normalizeSupplier(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = emptySupplier();
  for (const k of KEYS) {
    out[k] = String(src[k] == null ? "" : src[k]).trim();
  }
  return out;
}

function missingFields(supplier) {
  const s = normalizeSupplier(supplier);
  return REQUIRED.filter((k) => !s[k]);
}

function isComplete(supplier) {
  return missingFields(supplier).length === 0;
}

function supplierPath(rootDir) {
  return path.join(rootDir, "data", "supplier.json");
}

function loadSupplierFromDataDir(dataDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, "supplier.json"), "utf8"));
    return normalizeSupplier(raw);
  } catch (_) {
    return emptySupplier();
  }
}

function saveSupplierToDataDir(dataDir, data) {
  fs.mkdirSync(dataDir, { recursive: true });
  const normalized = normalizeSupplier(data);
  fs.writeFileSync(path.join(dataDir, "supplier.json"), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function loadSupplier(rootDir) {
  return loadSupplierFromDataDir(path.join(rootDir, "data"));
}

function saveSupplier(rootDir, data) {
  return saveSupplierToDataDir(path.join(rootDir, "data"), data);
}

function docFilePrefix(supplier) {
  const s = normalizeSupplier(supplier);
  const raw = s.nameEn || s.name || "docs";
  return raw.replace(/[\\/:*?"<>|]/g, "_").trim() || "docs";
}

module.exports = {
  KEYS,
  REQUIRED,
  emptySupplier,
  normalizeSupplier,
  isComplete,
  missingFields,
  loadSupplier,
  loadSupplierFromDataDir,
  saveSupplier,
  saveSupplierToDataDir,
  docFilePrefix,
  supplierPath,
};

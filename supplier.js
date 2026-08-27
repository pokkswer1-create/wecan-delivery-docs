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

function loadSupplier(rootDir) {
  const p = supplierPath(rootDir);
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return normalizeSupplier(raw);
  } catch (_) {
    return emptySupplier();
  }
}

function saveSupplier(rootDir, data) {
  const dir = path.join(rootDir, "data");
  fs.mkdirSync(dir, { recursive: true });
  const normalized = normalizeSupplier(data);
  fs.writeFileSync(supplierPath(rootDir), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
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
  saveSupplier,
  docFilePrefix,
  supplierPath,
};

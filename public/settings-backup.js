const FIELDS = [
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
const FILE_KINDS = ["seal", "biz", "bank"];

function filledCount(supplier) {
  const s = supplier || {};
  return FIELDS.filter((k) => String(s[k] || "").trim()).length;
}

function shouldRestoreSupplier(server, backup) {
  return filledCount(backup) > filledCount(server);
}

function missingFileKinds(serverFiles, backupFiles) {
  const server = serverFiles || {};
  const backup = backupFiles || {};
  return FILE_KINDS.filter((k) => Boolean(backup[k]) && !server[k]);
}

const api = {
  KEY: "wecan_supplier_backup_v1",
  FIELDS,
  filledCount,
  shouldRestoreSupplier,
  missingFileKinds,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof window !== "undefined") {
  window.SettingsBackup = api;
}

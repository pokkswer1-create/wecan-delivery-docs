(function () {
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
  const PHONE_FILE_KINDS = ["seal"];

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
    return PHONE_FILE_KINDS.filter((k) => Boolean(backup[k]) && !server[k]);
  }

  function scrubPhoneFiles(files) {
    const src = files || {};
    const out = {};
    for (const k of PHONE_FILE_KINDS) {
      if (src[k]) out[k] = src[k];
    }
    return out;
  }

  const api = {
    KEY: "wecan_supplier_backup_v1",
    FILE_KINDS,
    PHONE_FILE_KINDS,
    filledCount,
    shouldRestoreSupplier,
    missingFileKinds,
    scrubPhoneFiles,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof window !== "undefined") {
    window.SettingsBackup = api;
  }
})();

const path = require("path");

function resolveDataRoot(appRoot, env = process.env) {
  const custom = String(env.DATA_DIR || "").trim();
  if (custom) return path.resolve(custom);
  return path.join(appRoot, "data");
}

module.exports = { resolveDataRoot };

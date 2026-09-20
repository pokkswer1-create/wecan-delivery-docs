const fs = require("fs");
const path = require("path");

function clientsPath(dir) {
  return path.join(dir, "clients.json");
}

function normalizeClient(raw, i) {
  const src = raw && typeof raw === "object" ? raw : {};
  const id = String(src.id || "").trim() || `client_${Date.now()}_${i || 0}`;
  return {
    id,
    name: String(src.name || "").trim(),
    email: String(src.email || "").trim(),
    phone: String(src.phone || "").trim(),
  };
}

function cleanClients(list) {
  const out = [];
  const indexByName = new Map();
  (Array.isArray(list) ? list : []).forEach((row, i) => {
    const c = normalizeClient(row, i);
    if (!c.name) return;
    const key = c.name.toLowerCase();
    const existing = indexByName.get(key);
    if (existing == null) {
      indexByName.set(key, out.length);
      out.push(c);
      return;
    }
    out[existing] = { ...c, id: out[existing].id };
  });
  return out;
}

function loadClients(dir) {
  try {
    const raw = JSON.parse(fs.readFileSync(clientsPath(dir), "utf8"));
    const list = Array.isArray(raw) ? raw : raw && raw.clients;
    return cleanClients(list);
  } catch (_) {
    return [];
  }
}

function saveClients(dir, list) {
  const clients = cleanClients(list);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(clientsPath(dir), JSON.stringify({ clients }, null, 2), "utf8");
  return clients;
}

function upsertClient(dir, raw) {
  const next = normalizeClient(raw);
  if (!next.name) throw new Error("거래처 상호가 필요합니다.");
  const list = loadClients(dir);
  const i = list.findIndex(
    (c) => c.id === next.id || c.name.toLowerCase() === next.name.toLowerCase()
  );
  if (i >= 0) {
    next.id = list[i].id;
    list[i] = next;
  } else {
    list.push(next);
  }
  return saveClients(dir, list);
}

module.exports = {
  clientsPath,
  normalizeClient,
  cleanClients,
  loadClients,
  saveClients,
  upsertClient,
};

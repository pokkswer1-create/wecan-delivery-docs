function memoryDurableStore(seed = {}) {
  const map = { ...seed };
  return {
    kind: "memory",
    async save(sub, bundle) {
      map[String(sub)] = bundle;
    },
    async load(sub) {
      return map[String(sub)] || null;
    },
  };
}

function tursoArgs(values) {
  return values.map((v) => {
    if (typeof v === "number") return { type: "integer", value: String(v) };
    return { type: "text", value: String(v) };
  });
}

function createTursoStore(env, fetchImpl = fetch) {
  const url = String(env.WECAN_TURSO_URL || "").replace(/\/$/, "");
  const token = String(env.WECAN_TURSO_AUTH_TOKEN || env.WECAN_TURSO_TOKEN || "").trim();
  if (!url || !token) return null;

  async function exec(sql, values = []) {
    const res = await fetchImpl(`${url}/v2/pipeline`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            type: "execute",
            stmt: { sql, args: tursoArgs(values) },
          },
          { type: "close" },
        ],
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((data && data.error) || `Turso HTTP ${res.status}`);
    }
    return data;
  }

  let ready = null;
  function ensureTable() {
    if (!ready) {
      ready = exec(
        `CREATE TABLE IF NOT EXISTS user_bundles (
          sub TEXT PRIMARY KEY,
          bundle TEXT NOT NULL,
          saved_at INTEGER NOT NULL
        )`,
      );
    }
    return ready;
  }

  return {
    kind: "turso",
    async save(sub, bundle) {
      await ensureTable();
      const savedAt = Number(bundle.savedAt || Date.now());
      await exec(
        `INSERT INTO user_bundles (sub, bundle, saved_at) VALUES (?, ?, ?)
         ON CONFLICT(sub) DO UPDATE SET bundle=excluded.bundle, saved_at=excluded.saved_at`,
        [String(sub), JSON.stringify(bundle), savedAt],
      );
    },
    async load(sub) {
      await ensureTable();
      const data = await exec(
        `SELECT bundle FROM user_bundles WHERE sub = ? LIMIT 1`,
        [String(sub)],
      );
      const rows =
        data &&
        data.results &&
        data.results[0] &&
        data.results[0].response &&
        data.results[0].response.result &&
        data.results[0].response.result.rows;
      const row = Array.isArray(rows) && rows[0];
      const cell = row && (Array.isArray(row) ? row[0] : row.bundle);
      const text =
        cell && typeof cell === "object" && cell.value != null ? cell.value : cell;
      if (!text) return null;
      try {
        return JSON.parse(String(text));
      } catch (_) {
        return null;
      }
    },
  };
}

function createDurableStore(env = process.env, fetchImpl = fetch) {
  return createTursoStore(env, fetchImpl);
}

function isDurableConfigured(env = process.env) {
  return Boolean(
    String(env.WECAN_TURSO_URL || "").trim() &&
      String(env.WECAN_TURSO_AUTH_TOKEN || env.WECAN_TURSO_TOKEN || "").trim(),
  ) || Boolean(String(env.DATA_DIR || "").trim());
}

module.exports = {
  memoryDurableStore,
  createTursoStore,
  createDurableStore,
  isDurableConfigured,
};

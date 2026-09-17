process.env.SESSION_SECRET = "test-secret-for-hmac-api-me";
process.env.PORT = "0";

const test = require("node:test");
const assert = require("node:assert/strict");
const { COOKIE, signSession } = require("./accounts");

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test("/api/me is not cacheable", async () => {
  const { app } = require("./server");
  const server = await listen(app);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/me`);
    const cache = String(res.headers.get("cache-control") || "");
    assert.match(cache, /no-store/i);
    const body = await res.json();
    assert.equal(body.loggedIn, false);
  } finally {
    await close(server);
  }
});

test("/api/me with session cookie reports logged in", async () => {
  const { app } = require("./server");
  const server = await listen(app);
  try {
    const { port } = server.address();
    const token = signSession(
      { sub: "12345", email: "owner@example.com" },
      process.env.SESSION_SECRET
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/me`, {
      headers: { cookie: `${COOKIE}=${token}` },
      cache: "no-store",
    });
    const cache = String(res.headers.get("cache-control") || "");
    assert.match(cache, /no-store/i);
    const body = await res.json();
    assert.equal(body.loggedIn, true);
    assert.equal(body.email, "owner@example.com");
  } finally {
    await close(server);
  }
});

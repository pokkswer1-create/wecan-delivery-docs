const test = require("node:test");
const assert = require("node:assert/strict");
const { SCOPES } = require("./google-oauth");

test("google login asks for gmail send on the same account", () => {
  assert.ok(SCOPES.includes("openid"));
  assert.ok(SCOPES.some((s) => s.includes("userinfo.email")));
  assert.ok(SCOPES.includes("https://www.googleapis.com/auth/gmail.send"));
});

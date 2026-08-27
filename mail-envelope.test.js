const test = require("node:test");
const assert = require("node:assert/strict");
const { mailEnvelope } = require("./mail-envelope");

const supplier = {
  name: "한빛체육",
  nameEn: "hanbit",
  email: "owner@hanbit.test",
};

test("fromName is supplier, never hardcoded wecan", () => {
  const m = mailEnvelope(supplier, { MAIL_FROM: "noreply@docs.test" });
  assert.equal(m.fromName, "한빛체육(hanbit)");
  assert.equal(m.fromName.includes("위캔"), false);
});

test("fromName falls back to 납품서류 when empty", () => {
  const m = mailEnvelope({}, { MAIL_FROM: "noreply@docs.test" });
  assert.equal(m.fromName, "납품서류");
});

test("fromEmail is service MAIL_FROM not supplier email", () => {
  const m = mailEnvelope(supplier, { MAIL_FROM: "noreply@docs.test" });
  assert.equal(m.fromEmail, "noreply@docs.test");
});

test("SMTP_FROM is accepted as service from", () => {
  const m = mailEnvelope(supplier, { SMTP_FROM: "noreply@docs.test" });
  assert.equal(m.fromEmail, "noreply@docs.test");
});

test("fromEmail does not use supplier personal mail", () => {
  const m = mailEnvelope(supplier, {});
  assert.equal(m.fromEmail, "");
  assert.notEqual(m.fromEmail, supplier.email);
});

test("replyTo is supplier email even if MAIL_REPLY_TO is set", () => {
  const m = mailEnvelope(supplier, {
    MAIL_FROM: "noreply@docs.test",
    MAIL_REPLY_TO: "locked@wecan.test",
  });
  assert.equal(m.replyTo, "owner@hanbit.test");
});

test("replyTo empty supplier uses nothing from old MAIL_REPLY_TO", () => {
  const m = mailEnvelope({ name: "빈칸" }, {
    MAIL_FROM: "noreply@docs.test",
    MAIL_REPLY_TO: "locked@wecan.test",
  });
  assert.equal(m.replyTo, "");
});

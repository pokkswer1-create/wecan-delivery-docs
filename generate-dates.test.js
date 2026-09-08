const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveCtx, makeDocSheet } = require("./generate");

const samplePkg = {
  title: "테스트품목",
  totalIncl: 11000,
  useSupplyLines: false,
  note: "비고 한 줄",
  items: [
    {
      name: "배구공",
      spec: "",
      unit: "개",
      qty: 1,
      unitPriceIncl: 11000,
    },
  ],
};

test("resolveCtx uses quoteDate and deliveryDate separately", () => {
  const ctx = resolveCtx({
    client: "수신처",
    quoteDate: "2026-09-01",
    deliveryDate: "2026-09-08",
  });
  assert.equal(ctx.quoteDate, "2026-09-01");
  assert.equal(ctx.deliveryDate, "2026-09-08");
  assert.equal(ctx.quoteDateKr, "2026년 09월 01일");
  assert.equal(ctx.deliveryDateKr, "2026년 09월 08일");
});

test("resolveCtx falls back to date for both when split dates are missing", () => {
  const ctx = resolveCtx({ date: "2026-03-15" });
  assert.equal(ctx.quoteDate, "2026-03-15");
  assert.equal(ctx.deliveryDate, "2026-03-15");
});

test("견적서 HTML uses quote date, 납품서 HTML uses delivery date", () => {
  const ctx = resolveCtx({
    client: "수신처",
    quoteDate: "2026-09-01",
    deliveryDate: "2026-09-08",
  });
  const quote = makeDocSheet(samplePkg, "quote", ctx);
  const delivery = makeDocSheet(samplePkg, "delivery", ctx);
  const statement = makeDocSheet(samplePkg, "statement", ctx);

  assert.match(quote, /2026년 09월 01일/);
  assert.doesNotMatch(quote, /2026년 09월 08일/);
  assert.match(delivery, /2026년 09월 08일/);
  assert.doesNotMatch(delivery, /2026년 09월 01일/);
  assert.match(statement, /2026년 09월 08일/);
  assert.doesNotMatch(statement, /2026년 09월 01일/);
});

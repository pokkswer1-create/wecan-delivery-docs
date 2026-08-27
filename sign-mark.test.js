const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadSealDataUri, signHtml } = require("./sign-mark");

test("no uploaded seal means empty data uri", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wecan-sign-"));
  assert.equal(loadSealDataUri(root), "");
});

test("uploaded png becomes a data uri", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wecan-sign-"));
  const dir = path.join(root, "data");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "seal.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]));
  const uri = loadSealDataUri(root);
  assert.match(uri, /^data:image\/png;base64,/);
});

test("sign html omits img when no seal", () => {
  const html = signHtml({ name: "테스트상호", ceo: "홍길동", sealDataUri: "" });
  assert.equal(html.includes("<img"), false);
  assert.match(html, /테스트상호/);
  assert.match(html, /홍길동/);
});

test("sign html includes uploaded mark", () => {
  const html = signHtml({
    name: "테스트상호",
    ceo: "홍길동",
    sealDataUri: "data:image/png;base64,abc",
  });
  assert.match(html, /<img class="sign-mark"/);
  assert.match(html, /data:image\/png;base64,abc/);
});

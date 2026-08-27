const fs = require("fs");
const path = require("path");

function sealPath(rootDir) {
  return path.join(rootDir, "data", "seal.png");
}

function mimeFromBuffer(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return "image/png";
}

function loadSealDataUri(rootDir) {
  const p = sealPath(rootDir);
  if (!fs.existsSync(p)) return "";
  const buf = fs.readFileSync(p);
  if (buf.length < 8) return "";
  return `data:${mimeFromBuffer(buf)};base64,${buf.toString("base64")}`;
}

function signHtml({ name, ceo, sealDataUri }) {
  const img = sealDataUri
    ? `<img class="sign-mark" src="${sealDataUri}" alt="" />`
    : "";
  return `
  <div class="sign">
    <div class="who">
      <div>상호 : ${name}</div>
      <div>대표자 : ${ceo}</div>
    </div>
    ${img}
  </div>`;
}

module.exports = {
  sealPath,
  mimeFromBuffer,
  loadSealDataUri,
  signHtml,
};

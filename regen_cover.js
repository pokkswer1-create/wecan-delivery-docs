const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { PDFDocument } = require("pdf-lib");

// Reuse generate.js by temporarily filtering packages
const genPath = path.join(__dirname, "generate.js");
const src = fs.readFileSync(genPath, "utf8");

// Ensure only cover photo (no box photo)
let patched = src.replace(
  /id: "2_지주커버",[\s\S]*?photos: \[[^\]]*\],/,
  (m) => m.replace(/photos: \[[^\]]*\],/, 'photos: ["photo_cover.png"],')
);

// Only build package 2
patched = patched.replace(
  /for \(const pkg of PACKAGES\) \{[\s\S]*?console\.log\(JSON\.stringify\(results, null, 2\)\);/,
  `const pkg = PACKAGES.find(p => p.id === "2_지주커버");
  const p = await buildPackage(pkg);
  const st = fs.statSync(p);
  console.log("OK", p, st.size);
  const pdf = await PDFDocument.load(fs.readFileSync(p));
  console.log("pages", pdf.getPageCount());`
);

const outJs = path.join(__dirname, "_regen_tmp.js");
fs.writeFileSync(outJs, patched);
execFileSync(process.execPath, [outJs], { stdio: "inherit", cwd: __dirname });
fs.unlinkSync(outJs);

const desktop = path.join(process.env.USERPROFILE, "Desktop", "2_지주커버_369만원_납품서류.pdf");
const built = path.join(__dirname, "out", "2_지주커버_369만원_납품서류.pdf");
fs.copyFileSync(built, desktop);
console.log("copied to", desktop);

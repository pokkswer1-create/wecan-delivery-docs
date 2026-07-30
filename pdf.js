const fs = require("fs");
const path = require("path");

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const puppeteer = require("puppeteer");
      const launchOpts = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--font-render-hinting=none",
          "--no-first-run",
          "--no-default-browser-check",
        ],
      };
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      }
      return puppeteer.launch(launchOpts);
    })().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

/** 서버 기동 시 브라우저를 미리 켜 두면 첫 요청이 빨라짐 */
function warmBrowser() {
  getBrowser().catch((err) => console.warn("browser warm failed", err.message));
}

async function htmlToPdf(htmlPath, pdfPath) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 });
    const fileUrl = "file:///" + path.resolve(htmlPath).replace(/\\/g, "/");
    // networkidle0 대신 load — 구글폰트 대기 때문에 느리던 부분 완화
    await page.goto(fileUrl, { waitUntil: "load", timeout: 45000 });
    await Promise.race([
      page.evaluate(async () => {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
      }),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await page.close().catch(() => {});
  }
}

async function htmlToPdfMany(jobs, concurrency = 2) {
  const list = [...jobs];
  let idx = 0;
  async function worker() {
    while (idx < list.length) {
      const i = idx++;
      const job = list[i];
      await htmlToPdf(job.html, job.pdf);
    }
  }
  const n = Math.max(1, Math.min(concurrency, list.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
}

async function closeBrowser() {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch (_) {
    /* ignore */
  }
  browserPromise = null;
}

function assetDataUri(fileName) {
  const p = path.join(__dirname, "assets", fileName);
  const buf = fs.readFileSync(p);
  const ext = path.extname(fileName).toLowerCase();
  const mime =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".webp"
        ? "image/webp"
        : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

module.exports = {
  htmlToPdf,
  htmlToPdfMany,
  closeBrowser,
  assetDataUri,
  getBrowser,
  warmBrowser,
};

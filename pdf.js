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
          "--font-render-hinting=none",
        ],
      };
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      }
      return puppeteer.launch(launchOpts);
    })();
  }
  return browserPromise;
}

async function htmlToPdf(htmlPath, pdfPath) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const fileUrl = "file:///" + htmlPath.replace(/\\/g, "/");
    await page.goto(fileUrl, { waitUntil: "networkidle0", timeout: 60000 });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await page.close();
  }
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

module.exports = { htmlToPdf, closeBrowser, assetDataUri, getBrowser };

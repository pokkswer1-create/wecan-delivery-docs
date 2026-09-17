process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-hmac-api-me";
process.env.PORT = "0";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { COOKIE, signSession, authEstablishHtml } = require("./accounts");

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

function chromePath() {
  let bundled = "";
  try {
    bundled = require("puppeteer").executablePath();
  } catch (_) {}
  const candidates = [
    bundled,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || "";
}

async function launchBrowser(exe) {
  const puppeteer = require("puppeteer");
  return puppeteer.launch({
    headless: "new",
    executablePath: exe,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

test("settings page hides Google login when session cookie is present", async (t) => {
  const exe = chromePath();
  if (!exe) {
    t.skip("Chrome/Edge not available");
    return;
  }
  const { app } = require("./server");
  const server = await listen(app);
  const browser = await launchBrowser(exe);
  try {
    const { port } = server.address();
    const origin = `http://127.0.0.1:${port}`;
    const token = signSession(
      { sub: "12345", email: "owner@example.com" },
      process.env.SESSION_SECRET
    );
    const page = await browser.newPage();
    await page.goto(origin + "/settings.html", { waitUntil: "domcontentloaded" });
    await page.setCookie({
      name: COOKIE,
      value: token,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const form = document.getElementById("form");
        return form && !form.classList.contains("hidden");
      },
      { timeout: 8000 }
    );
    const state = await page.evaluate(() => {
      const login = document.getElementById("loginCard");
      const form = document.getElementById("form");
      return {
        loginHidden: login ? login.classList.contains("hidden") : null,
        formHidden: form ? form.classList.contains("hidden") : null,
        email: (document.getElementById("userEmail") || {}).textContent || "",
      };
    });
    assert.equal(state.loginHidden, true, JSON.stringify(state));
    assert.equal(state.formHidden, false, JSON.stringify(state));
    assert.equal(state.email, "owner@example.com");
  } finally {
    await browser.close();
    await close(server);
  }
});

test("auth establish page posts session then shows settings form", async (t) => {
  const exe = chromePath();
  if (!exe) {
    t.skip("Chrome/Edge not available");
    return;
  }
  const { app } = require("./server");
  const server = await listen(app);
  const browser = await launchBrowser(exe);
  try {
    const { port } = server.address();
    const origin = `http://127.0.0.1:${port}`;
    const token = signSession(
      { sub: "12345", email: "owner@example.com" },
      process.env.SESSION_SECRET
    );
    const page = await browser.newPage();
    await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
    await page.setContent(authEstablishHtml(token, "/settings.html"), {
      waitUntil: "networkidle0",
    });
    await page.waitForFunction(
      () => location.pathname === "/settings.html",
      { timeout: 8000 }
    );
    await page.waitForFunction(
      () => {
        const form = document.getElementById("form");
        return form && !form.classList.contains("hidden");
      },
      { timeout: 8000 }
    );
    const state = await page.evaluate(() => {
      const login = document.getElementById("loginCard");
      const form = document.getElementById("form");
      return {
        href: location.href,
        loginHidden: login ? login.classList.contains("hidden") : null,
        formHidden: form ? form.classList.contains("hidden") : null,
        email: (document.getElementById("userEmail") || {}).textContent || "",
      };
    });
    assert.match(state.href, /settings\.html/);
    assert.equal(state.loginHidden, true, JSON.stringify(state));
    assert.equal(state.formHidden, false, JSON.stringify(state));
    assert.equal(state.email, "owner@example.com");
  } finally {
    await browser.close();
    await close(server);
  }
});

require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const {
  getSupplier,
  setActiveDataDir,
  resetBizBankCache,
  DEFAULT_CLIENT,
  PACKAGE_TEMPLATES,
  OUT,
  buildFromRequest,
  todayISO,
  fmt,
} = require("./generate");
const { saveSupplierToDataDir, isComplete, missingFields } = require("./supplier");
const { mailEnvelope } = require("./mail-envelope");
const {
  userDir,
  listUserIds,
  migrateLegacyIfFirstUser,
  signSession,
  readSession,
  sessionCookie,
  clearSessionCookie,
  saveGoogleTokens,
  loadGoogleTokens,
  getCookie,
} = require("./accounts");
const {
  isGoogleConfigured,
  googleAuthUrl,
  exchangeGoogleCode,
  sendViaGmailApi,
} = require("./google-oauth");

const PORT = Number(process.env.PORT || 3780);
const ROOT_DATA = path.join(__dirname, "data");
const RECEIPTS_DIR = path.join(ROOT_DATA, "receipts");
const app = express();

function sessionSecret() {
  return String(process.env.SESSION_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim();
}

function requireUser(req, res, next) {
  if (!req.user || !req.userDir) {
    return res.status(401).json({ ok: false, error: "구글 로그인이 필요합니다." });
  }
  next();
}

function mailLogPath(dir) {
  return path.join(dir || ROOT_DATA, "mail-log.json");
}

function presetsPath(dir) {
  return path.join(dir || ROOT_DATA, "presets.json");
}

app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  next();
});
app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  lastModified: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.set("Cache-Control", "no-store");
    }
  },
}));
app.use((req, _res, next) => {
  setActiveDataDir(ROOT_DATA);
  const secret = sessionSecret();
  const user = secret ? readSession(req.headers.cookie, secret) : null;
  if (user) {
    try {
      req.user = user;
      req.userDir = userDir(__dirname, user.sub);
      setActiveDataDir(req.userDir);
    } catch (_) {
      /* ignore bad sub */
    }
  }
  next();
});
app.use("/downloads", express.static(OUT));

const PUBLIC_DIR = path.join(__dirname, "public");
const APP_VERSION = "2026-07-31-no-receipt-body";

app.get(["/stamp", "/stamp.html"], (_req, res) => {
  res.redirect(301, "/settings.html");
});

app.get("/history", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(PUBLIC_DIR, "history.html"));
});

app.get("/history.html", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(PUBLIC_DIR, "history.html"));
});

app.get("/settings", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(PUBLIC_DIR, "settings.html"));
});

app.get("/settings.html", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(PUBLIC_DIR, "settings.html"));
});

function lanAddresses() {
  const nets = os.networkInterfaces();
  const list = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) list.push(net.address);
    }
  }
  return list;
}

function isSmtpReady() {
  const pass = String(process.env.SMTP_PASS || "").trim();
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      pass &&
      !/여기|비밀번호|password|changeme/i.test(pass)
  );
}

function isEmailReady() {
  return Boolean(
    process.env.GAS_MAIL_URL ||
      process.env.RESEND_API_KEY ||
      process.env.BREVO_API_KEY ||
      process.env.SENDGRID_API_KEY ||
      isSmtpReady()
  );
}

function emailProviderName() {
  if (process.env.GAS_MAIL_URL) return "gmail-apps-script";
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.BREVO_API_KEY) return "brevo";
  if (process.env.SENDGRID_API_KEY) return "sendgrid";
  if (isSmtpReady()) return "smtp";
  return "none";
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = String(process.env.SMTP_PASS || "").trim();
  if (!isSmtpReady()) {
    throw new Error("SMTP 설정이 없습니다.");
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false") === "true";
  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: { rejectUnauthorized: false },
  });
}

function buildMailContent({
  client,
  date,
  quoteDate,
  deliveryDate,
  titles,
  totalSum,
  subject,
  fileName,
  filePath,
  emailTo,
  emailCc,
  receiptUrl,
}) {
  const s = getSupplier();
  const env = {
    MAIL_FROM: process.env.MAIL_FROM,
    SMTP_FROM: process.env.SMTP_FROM,
  };
  const { fromName, fromEmail: serviceFrom, replyTo } = mailEnvelope(s, env);
  const fromEmail = serviceFrom || process.env.SMTP_USER || "";
  const mailSubject =
    subject || `[${fromName}] ${titles} 납품서류 (${fmt(totalSum)}원)`;
  const ask = s.email || replyTo || fromEmail;
  const textLines = [
    `${client || DEFAULT_CLIENT} 귀중`,
    "",
    `${fromName} 납품서류를 보내드립니다.`,
    `품목: ${titles}`,
    `합계(부가세포함): ${fmt(totalSum)}원`,
    `견적일: ${quoteDate || date || todayISO()}`,
    `납품일: ${deliveryDate || date || todayISO()}`,
    "",
    `입금계좌: ${s.bank} ${s.account}`,
    `예금주: ${s.accountHolder}`,
    `문의: ${s.phone} / ${ask}`,
  ];
  const text = textLines.join("\n");
  const html = [
    `<p>${client || DEFAULT_CLIENT} 귀중</p>`,
    `<p>${fromName} 납품서류를 보내드립니다.</p>`,
    `<p>품목: ${titles}<br>합계(부가세포함): ${fmt(totalSum)}원<br>견적일: ${quoteDate || date || todayISO()}<br>납품일: ${deliveryDate || date || todayISO()}</p>`,
    `<p>입금계좌: ${s.bank} ${s.account}<br>예금주: ${s.accountHolder}<br>문의: ${s.phone} / ${ask}</p>`,
  ].join("");
  const pdfBase64 = fs.readFileSync(filePath).toString("base64");
  return {
    fromName,
    fromEmail,
    replyTo,
    mailSubject,
    text,
    html,
    emailTo,
    emailCc,
    fileName,
    pdfBase64,
    filePath,
    receiptUrl,
  };
}

function readMailLog(dir) {
  try {
    const raw = fs.readFileSync(mailLogPath(dir), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeMailLog(list, dir) {
  const p = mailLogPath(dir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(list, null, 2), "utf8");
}

function upsertMailLog(entry, dir) {
  const list = readMailLog(dir);
  const idx = list.findIndex((x) => x.id === entry.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...entry };
  else list.unshift(entry);
  writeMailLog(list.slice(0, 500), dir);
  return entry;
}

function findMailLog(id) {
  const dirs = [ROOT_DATA, ...listUserIds(__dirname).map((sub) => userDir(__dirname, sub))];
  for (const dir of dirs) {
    const hit = readMailLog(dir).find((x) => x.id === id);
    if (hit) return { entry: hit, dir };
  }
  return { entry: null, dir: ROOT_DATA };
}

function publicBase(req) {
  if (process.env.PUBLIC_URL) return String(process.env.PUBLIC_URL).replace(/\/$/, "");
  const proto = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("x-forwarded-host") || req.get("host");
  return `${proto}://${host}`;
}

function googleRedirectUri(req) {
  return `${publicBase(req)}/auth/google/callback`;
}

app.get("/auth/google", (req, res) => {
  if (!isGoogleConfigured() || !sessionSecret()) {
    return res
      .status(503)
      .send("구글 로그인이 아직 설정되지 않았습니다. GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET을 Render/로컬 환경변수에 넣으세요.");
  }
  const state = crypto.randomBytes(16).toString("hex");
  res.append(
    "Set-Cookie",
    `wecan_oauth=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
  );
  res.redirect(googleAuthUrl(googleRedirectUri(req), state));
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const expected = getCookie(req.headers.cookie, "wecan_oauth");
    if (!req.query.code || !req.query.state || req.query.state !== expected) {
      throw new Error("로그인 확인 값이 맞지 않습니다. 다시 눌러 주세요.");
    }
    const result = await exchangeGoogleCode(googleRedirectUri(req), String(req.query.code));
    if (!result.sub) throw new Error("구글 계정 정보를 읽지 못했습니다.");
    const dir = migrateLegacyIfFirstUser(__dirname, result.sub);
    saveGoogleTokens(
      dir,
      { ...result.tokens, email: result.email },
      sessionSecret()
    );
    const token = signSession({ sub: result.sub, email: result.email }, sessionSecret());
    const secure = req.secure || req.get("x-forwarded-proto") === "https";
    res.append("Set-Cookie", sessionCookie(token, { secure }));
    res.append("Set-Cookie", "wecan_oauth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    res.redirect("/");
  } catch (err) {
    res.redirect("/?auth_error=" + encodeURIComponent(err.message || "로그인 실패"));
  }
});

app.get("/auth/logout", (_req, res) => {
  res.append("Set-Cookie", clearSessionCookie());
  res.redirect("/");
});

app.get("/api/me", (req, res) => {
  if (!req.user) {
    return res.json({
      ok: false,
      loggedIn: false,
      googleConfigured: isGoogleConfigured() && Boolean(sessionSecret()),
    });
  }
  const tokens = loadGoogleTokens(req.userDir, sessionSecret());
  res.json({
    ok: true,
    loggedIn: true,
    email: req.user.email,
    googleConfigured: true,
    gmailReady: Boolean(tokens && tokens.refresh_token),
  });
});

async function sendViaGas(mail) {
  const url = String(process.env.GAS_MAIL_URL || "").trim();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: mail.emailTo,
      cc: mail.emailCc || "",
      subject: mail.mailSubject,
      text: mail.text,
      html: mail.html,
      fileName: mail.fileName,
      pdfBase64: mail.pdfBase64,
      fromName: mail.fromName,
      replyTo: mail.replyTo || undefined,
    }),
  });
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch (_) {
    body = { raw: text };
  }
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || text.slice(0, 300) || `GAS ${res.status}`);
  }
}

async function sendViaResend(mail) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${mail.fromName} <${mail.fromEmail}>`,
      to: [mail.emailTo],
      cc: mail.emailCc ? [mail.emailCc] : undefined,
      reply_to: mail.replyTo || undefined,
      subject: mail.mailSubject,
      text: mail.text,
      html: mail.html,
      attachments: [
        { filename: mail.fileName, content: mail.pdfBase64 },
      ],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || body.name || `Resend ${res.status}`);
  }
}

async function sendViaBrevo(mail) {
  const payload = {
    sender: { name: mail.fromName, email: mail.fromEmail },
    to: [{ email: mail.emailTo }],
    replyTo: mail.replyTo ? { email: mail.replyTo } : undefined,
    subject: mail.mailSubject,
    textContent: mail.text,
    htmlContent: mail.html,
    attachment: [{ name: mail.fileName, content: mail.pdfBase64 }],
  };
  if (mail.emailCc) payload.cc = [{ email: mail.emailCc }];

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || JSON.stringify(body) || `Brevo ${res.status}`);
  }
}

async function sendViaSendgrid(mail) {
  const personalizations = [
    {
      to: [{ email: mail.emailTo }],
      ...(mail.emailCc ? { cc: [{ email: mail.emailCc }] } : {}),
    },
  ];
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.SENDGRID_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations,
      from: { email: mail.fromEmail, name: mail.fromName },
      reply_to: mail.replyTo ? { email: mail.replyTo } : undefined,
      subject: mail.mailSubject,
      content: [
        { type: "text/plain", value: mail.text },
        { type: "text/html", value: mail.html },
      ],
      attachments: [
        {
          content: mail.pdfBase64,
          filename: mail.fileName,
          type: "application/pdf",
          disposition: "attachment",
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body.slice(0, 300) || `SendGrid ${res.status}`);
  }
}

async function sendViaSmtp(mail) {
  const transporter = createTransport();
  await transporter.sendMail({
    from: `"${mail.fromName}" <${mail.fromEmail}>`,
    to: mail.emailTo,
    cc: mail.emailCc || undefined,
    replyTo: mail.replyTo || undefined,
    subject: mail.mailSubject,
    text: mail.text,
    html: mail.html,
    attachments: [{ filename: mail.fileName, path: mail.filePath }],
  });
}

async function sendDeliveryEmail(opts, req) {
  const mail = buildMailContent(opts);
  const tokens =
    req && req.userDir ? loadGoogleTokens(req.userDir, sessionSecret()) : null;
  if (tokens && tokens.refresh_token && req.user && req.user.email) {
    mail.fromEmail = req.user.email;
    return sendViaGmailApi(tokens, mail, googleRedirectUri(req));
  }
  if (!isEmailReady()) {
    throw new Error(
      "구글 로그인이 필요합니다. 로그인하면 그 지메일로 발송됩니다."
    );
  }
  if (!mail.fromEmail) {
    throw new Error(
      "MAIL_FROM에 서비스 발신 메일을 넣으세요. 회신은 설정의 공급자 메일입니다."
    );
  }
  if (process.env.GAS_MAIL_URL) return sendViaGas(mail);
  if (process.env.RESEND_API_KEY) return sendViaResend(mail);
  if (process.env.BREVO_API_KEY) return sendViaBrevo(mail);
  if (process.env.SENDGRID_API_KEY) return sendViaSendgrid(mail);
  return sendViaSmtp(mail);
}

app.get("/api/meta", (req, res) => {
  const loggedIn = Boolean(req.user);
  const tokens =
    loggedIn && req.userDir ? loadGoogleTokens(req.userDir, sessionSecret()) : null;
  const gmailReady = Boolean(tokens && tokens.refresh_token);
  const supplier = loggedIn ? getSupplier() : { email: "" };
  const env = mailEnvelope(supplier, process.env);
  res.json({
    version: APP_VERSION,
    clientDefault: DEFAULT_CLIENT,
    dateDefault: todayISO(),
    loggedIn,
    googleConfigured: isGoogleConfigured() && Boolean(sessionSecret()),
    userEmail: loggedIn ? req.user.email : "",
    supplierEmail: supplier.email || "",
    mailFromName: env.fromName,
    mailFromAddress: gmailReady && req.user ? req.user.email : env.fromEmail,
    mailReplyTo: env.replyTo,
    supplierComplete: loggedIn ? isComplete(supplier) : false,
    packages: loggedIn
      ? readPresets(req.userDir).presets.map((p) => ({
          id: p.id,
          title: p.title,
          items: [
            {
              name: p.name,
              spec: p.spec || "",
              unit: p.unit || "식",
              qty: Number(p.qty) || 1,
              unitPriceIncl: Number(p.unitPriceIncl) || 0,
            },
          ],
        }))
      : [],
    emailConfigured: gmailReady || isEmailReady(),
    emailProvider: gmailReady ? "gmail" : emailProviderName(),
  });
});

function defaultPresetsFromPackages() {
  return PACKAGE_TEMPLATES.map((t) => {
    const sample =
      t.id === "3_지주대임대"
        ? t.build({ dailyIncl: t.defaultDailyIncl, days: t.defaultDays })
        : t.build(t.defaultTotalIncl);
    const it = sample.items[0];
    return {
      id: t.id,
      title: t.title,
      name: it.name,
      spec: it.spec || "",
      unit: it.unit || "식",
      qty: it.qty || 1,
      unitPriceIncl: it.unitPriceIncl || 0,
    };
  });
}

function readPresets(dir) {
  try {
    const raw = fs.readFileSync(presetsPath(dir), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      return { updatedAt: null, presets: parsed };
    }
    if (parsed && Array.isArray(parsed.presets) && parsed.presets.length) {
      return {
        updatedAt: parsed.updatedAt || null,
        presets: parsed.presets,
      };
    }
  } catch (_) {
    /* use defaults */
  }
  return { updatedAt: null, presets: defaultPresetsFromPackages() };
}

function writePresets(list, dir) {
  const p = presetsPath(dir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const payload = {
    updatedAt: new Date().toISOString(),
    presets: list,
  };
  fs.writeFileSync(p, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

app.get("/api/presets", requireUser, (req, res) => {
  const data = readPresets(req.userDir);
  res.json({ ok: true, updatedAt: data.updatedAt, presets: data.presets });
});

app.put("/api/presets", requireUser, (req, res) => {
  try {
    const { presets } = req.body || {};
    if (!Array.isArray(presets)) {
      return res.status(400).json({ ok: false, error: "presets 배열이 필요합니다." });
    }
    const cleaned = presets
      .map((p, i) => ({
        id: String(p.id || `custom_${Date.now()}_${i}`),
        title: String(p.title || p.name || "").trim(),
        name: String(p.name || p.title || "").trim(),
        spec: String(p.spec || "").trim(),
        unit: String(p.unit || "식").trim() || "식",
        qty: Number(p.qty) > 0 ? Number(p.qty) : 1,
        unitPriceIncl: Number(p.unitPriceIncl) || 0,
      }))
      .filter((p) => p.title && p.name);
    const saved = writePresets(cleaned, req.userDir);
    res.json({ ok: true, updatedAt: saved.updatedAt, presets: cleaned });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "저장 실패" });
  }
});

const { mimeFromBuffer } = require("./sign-mark");

app.get("/api/supplier-file", requireUser, (req, res) => {
  const names = { seal: "seal.png", biz: "biz_reg.png", bank: "bank.png" };
  const file = names[req.query.kind];
  if (!file) {
    return res.status(400).json({ ok: false, error: "kind는 seal, biz, bank 중 하나여야 합니다." });
  }
  const dest = path.join(req.userDir, file);
  if (!fs.existsSync(dest)) {
    return res.status(404).json({ ok: false, error: "파일이 없습니다." });
  }
  const buf = fs.readFileSync(dest);
  res.set("Cache-Control", "no-store");
  res.type(mimeFromBuffer(buf)).send(buf);
});

function supplierFiles(dir) {
  return {
    seal: fs.existsSync(path.join(dir, "seal.png")),
    biz: fs.existsSync(path.join(dir, "biz_reg.png")),
    bank: fs.existsSync(path.join(dir, "bank.png")),
  };
}

app.get("/api/supplier", requireUser, (req, res) => {
  const supplier = getSupplier();
  res.json({
    ok: true,
    supplier,
    complete: isComplete(supplier),
    missing: missingFields(supplier),
    files: supplierFiles(req.userDir),
  });
});

app.put("/api/supplier", requireUser, (req, res) => {
  try {
    const { supplier } = req.body || {};
    const saved = saveSupplierToDataDir(req.userDir, supplier);
    res.json({
      ok: true,
      supplier: saved,
      complete: isComplete(saved),
      missing: missingFields(saved),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "저장 실패" });
  }
});

app.put("/api/supplier-file", requireUser, (req, res) => {
  try {
    const { kind, image } = req.body || {};
    const names = { seal: "seal.png", biz: "biz_reg.png", bank: "bank.png" };
    const file = names[kind];
    if (!file) {
      return res.status(400).json({ ok: false, error: "kind는 seal, biz, bank 중 하나여야 합니다." });
    }
    const m = String(image || "").match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
    if (!m) {
      return res.status(400).json({ ok: false, error: "이미지(data URL)가 필요합니다." });
    }
    const buf = Buffer.from(m[2], "base64");
    if (buf.length < 200 || buf.length > 6_000_000) {
      return res.status(400).json({ ok: false, error: "이미지 크기가 올바르지 않습니다." });
    }
    const dest = path.join(req.userDir, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    if (kind !== "seal") resetBizBankCache();
    res.json({ ok: true, files: supplierFiles(req.userDir) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "파일 저장 실패" });
  }
});

app.delete("/api/supplier-file", requireUser, (req, res) => {
  try {
    const { kind } = req.body || {};
    const names = { seal: "seal.png", biz: "biz_reg.png", bank: "bank.png" };
    const file = names[kind];
    if (!file) {
      return res.status(400).json({ ok: false, error: "kind는 seal, biz, bank 중 하나여야 합니다." });
    }
    const dest = path.join(req.userDir, file);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    if (kind !== "seal") resetBizBankCache();
    res.json({ ok: true, files: supplierFiles(req.userDir) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "삭제 실패" });
  }
});

app.post("/api/generate", requireUser, async (req, res) => {
  try {
    const {
      packageIds,
      customItems,
      title,
      note,
      photoPackageIds,
      client,
      date,
      quoteDate,
      deliveryDate,
      totals,
      rentalDailyIncl,
      rentalDays,
      emailTo,
      emailCc,
      subject,
      sendEmail,
    } = req.body || {};

    const hasCustom = Array.isArray(customItems) && customItems.length > 0;
    const hasPackages = Array.isArray(packageIds) && packageIds.length > 0;
    if (!hasCustom && !hasPackages) {
      return res.status(400).json({ ok: false, error: "품목을 1개 이상 입력하세요." });
    }

    const result = await buildFromRequest({
      packageIds: hasCustom ? undefined : packageIds,
      customItems: hasCustom ? customItems : undefined,
      title,
      note,
      photoPackageIds,
      client: client || DEFAULT_CLIENT,
      date: date || todayISO(),
      quoteDate: quoteDate || date || todayISO(),
      deliveryDate: deliveryDate || date || todayISO(),
      totals: totals || {},
      rentalDailyIncl,
      rentalDays,
      mode: hasCustom
        ? "single"
        : packageIds.length > 1
          ? "combined"
          : "single",
    });

    const fileName = path.basename(result.outPath);
    const downloadUrl = `/downloads/${encodeURIComponent(fileName)}`;
    const totalSum = result.packages.reduce((s, p) => s + p.totalIncl, 0);
    const titles = result.packages.map((p) => p.title).join(", ");

    let emailed = false;
    let emailError = "";
    let receiptId = "";
    let receiptUrl = "";
    if (sendEmail) {
      if (!emailTo) {
        return res.status(400).json({ ok: false, error: "받는 이메일 주소를 입력하세요." });
      }
      try {
        receiptId = crypto.randomBytes(16).toString("hex");
        fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
        const receiptPath = path.join(RECEIPTS_DIR, `${receiptId}.pdf`);
        fs.copyFileSync(result.outPath, receiptPath);
        receiptUrl = `${publicBase(req)}/r/${receiptId}`;
        const mailSubject =
          subject || `[${getSupplier().name || "납품서류"}] ${titles} 납품서류 (${fmt(totalSum)}원)`;
        await sendDeliveryEmail(
          {
            client: client || DEFAULT_CLIENT,
            date: quoteDate || date || todayISO(),
            quoteDate: quoteDate || date || todayISO(),
            deliveryDate: deliveryDate || date || todayISO(),
            titles,
            totalSum,
            subject,
            fileName,
            filePath: result.outPath,
            emailTo,
            emailCc,
            receiptUrl,
          },
          req
        );
        emailed = true;
        try {
          upsertMailLog(
            {
              id: receiptId,
              to: emailTo,
              cc: emailCc || "",
              subject: mailSubject,
              titles,
              totalSum,
              fileName,
              client: client || DEFAULT_CLIENT,
              sentAt: new Date().toISOString(),
              status: "sent",
              downloadedAt: null,
              downloadCount: 0,
              receiptUrl,
            },
            req.userDir
          );
        } catch (logErr) {
          console.error("mail log write failed", logErr);
        }
      } catch (mailErr) {
        console.error("email failed", mailErr);
        emailError =
          mailErr.code === "ETIMEDOUT" || /timeout/i.test(mailErr.message || "")
            ? "메일 서버 연결 시간 초과. PDF는 생성됐습니다."
            : `메일 발송 실패: ${mailErr.message}. PDF는 생성됐습니다.`;
      }
    }

    res.json({
      ok: true,
      fileName,
      downloadUrl,
      emailed,
      emailError,
      receiptId,
      receiptUrl,
      packages: result.packages.map((p) => ({
        id: p.id,
        title: p.title,
        totalIncl: p.totalIncl,
      })),
      totalSum,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      ok: false,
      error: err.message || "생성 중 오류가 발생했습니다.",
    });
  }
});

app.get("/r/:id", (req, res) => {
  try {
    const id = String(req.params.id || "").replace(/[^a-f0-9]/gi, "");
    if (!id) return res.status(404).send("링크가 올바르지 않습니다.");
    const filePath = path.join(RECEIPTS_DIR, `${id}.pdf`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("서류를 찾을 수 없습니다. 링크가 만료되었을 수 있습니다.");
    }
    const found = findMailLog(id);
    const entry = found.entry;
    const now = new Date().toISOString();
    upsertMailLog(
      {
        ...(entry || { id, fileName: `${id}.pdf`, to: "", subject: "" }),
        id,
        downloadedAt: (entry && entry.downloadedAt) || now,
        downloadCount: Number((entry && entry.downloadCount) || 0) + 1,
        lastDownloadAt: now,
        status: "received",
        receiptConfirmed: true,
      },
      found.dir
    );
    const name = (entry && entry.fileName) || `납품서류_${id}.pdf`;
    res.download(filePath, name);
  } catch (err) {
    console.error(err);
    res.status(500).send("다운로드 중 오류가 발생했습니다.");
  }
});

app.get("/api/mail-log", requireUser, (req, res) => {
  res.json({ ok: true, items: summarizeMailLog(req.userDir) });
});

app.post("/api/mail-log", requireUser, (req, res) => {
  res.json({ ok: true, items: summarizeMailLog(req.userDir) });
});

function summarizeMailLog(dir) {
  return readMailLog(dir).map((e) => ({
    id: e.id,
    to: e.to,
    cc: e.cc || "",
    subject: e.subject,
    titles: e.titles || "",
    totalSum: e.totalSum || 0,
    fileName: e.fileName,
    client: e.client || "",
    sentAt: e.sentAt,
    downloadedAt: e.downloadedAt || null,
    downloadCount: e.downloadCount || 0,
    lastDownloadAt: e.lastDownloadAt || null,
    status: e.downloadedAt || e.receiptConfirmed ? "received" : e.status || "sent",
    receiptConfirmed: Boolean(e.downloadedAt || e.receiptConfirmed),
    receiptUrl: e.receiptUrl || "",
  }));
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ ok: false, error: err.message || "서버 오류" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`위캔 납품서류 웹폼 실행 중`);
  console.log(`  PC:   http://localhost:${PORT}`);
  for (const ip of lanAddresses()) {
    console.log(`  폰:   http://${ip}:${PORT}`);
  }
  console.log(`  GOOGLE: ${isGoogleConfigured() && sessionSecret() ? "on" : "off"}`);
  console.log(`  EMAIL: ${emailProviderName()}`);
  if (process.env.PUBLIC_URL) {
    console.log(`  공개: ${process.env.PUBLIC_URL}`);
  }
  try {
    require("./pdf").warmBrowser();
  } catch (_) {}
});

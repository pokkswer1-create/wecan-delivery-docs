require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const {
  SUPPLIER,
  DEFAULT_CLIENT,
  PACKAGE_TEMPLATES,
  OUT,
  buildFromRequest,
  todayISO,
  fmt,
} = require("./generate");

const PORT = Number(process.env.PORT || 3780);
const FORM_PIN = process.env.FORM_PIN || "515050";
const RECEIPTS_DIR = path.join(__dirname, "data", "receipts");
const MAIL_LOG_PATH = path.join(__dirname, "data", "mail-log.json");
const app = express();

app.use(express.json({ limit: "1mb" }));
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
app.use("/downloads", express.static(OUT));

const PUBLIC_DIR = path.join(__dirname, "public");
const APP_VERSION = "2026-07-30-history-fix";

app.get("/stamp", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(PUBLIC_DIR, "stamp.html"));
});

app.get("/stamp.html", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(PUBLIC_DIR, "stamp.html"));
});

app.get("/history", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(PUBLIC_DIR, "history.html"));
});

app.get("/history.html", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(PUBLIC_DIR, "history.html"));
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
  titles,
  totalSum,
  subject,
  fileName,
  filePath,
  emailTo,
  emailCc,
  receiptUrl,
}) {
  const fromName = "위캔(wecan)";
  const fromEmail =
    process.env.MAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    SUPPLIER.email;
  const replyTo = process.env.MAIL_REPLY_TO || fromEmail;
  const mailSubject =
    subject || `[위캔] ${titles} 납품서류 (${fmt(totalSum)}원)`;
  const textLines = [
    `${client || DEFAULT_CLIENT} 귀중`,
    "",
    "위캔 납품서류를 보내드립니다.",
    `품목: ${titles}`,
    `합계(부가세포함): ${fmt(totalSum)}원`,
    `작성일: ${date || todayISO()}`,
    "",
  ];
  if (receiptUrl) {
    textLines.push(
      "【수신확인】 아래 링크로 PDF를 받으시면 수신확인이 완료됩니다.",
      receiptUrl,
      ""
    );
  }
  textLines.push(
    "(첨부 PDF도 함께 보내드립니다.)",
    "",
    `입금계좌: ${SUPPLIER.bank} ${SUPPLIER.account}`,
    `예금주: ${SUPPLIER.accountHolder}`,
    `문의: ${SUPPLIER.phone} / ${fromEmail}`
  );
  const text = textLines.join("\n");
  const html = [
    `<p>${client || DEFAULT_CLIENT} 귀중</p>`,
    `<p>위캔 납품서류를 보내드립니다.</p>`,
    `<p>품목: ${titles}<br>합계(부가세포함): ${fmt(totalSum)}원<br>작성일: ${date || todayISO()}</p>`,
    receiptUrl
      ? `<p style="margin:20px 0"><a href="${receiptUrl}" style="display:inline-block;padding:12px 18px;background:#1f8a70;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">PDF 받고 수신확인</a></p><p style="font-size:13px;color:#555">링크: ${receiptUrl}</p>`
      : "",
    `<p style="font-size:13px;color:#555">첨부 PDF도 함께 보내드립니다.</p>`,
    `<p>입금계좌: ${SUPPLIER.bank} ${SUPPLIER.account}<br>예금주: ${SUPPLIER.accountHolder}<br>문의: ${SUPPLIER.phone} / ${fromEmail}</p>`,
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

function readMailLog() {
  try {
    const raw = fs.readFileSync(MAIL_LOG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeMailLog(list) {
  fs.mkdirSync(path.dirname(MAIL_LOG_PATH), { recursive: true });
  fs.writeFileSync(MAIL_LOG_PATH, JSON.stringify(list, null, 2), "utf8");
}

function upsertMailLog(entry) {
  const list = readMailLog();
  const idx = list.findIndex((x) => x.id === entry.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...entry };
  else list.unshift(entry);
  writeMailLog(list.slice(0, 500));
  return entry;
}

function findMailLog(id) {
  return readMailLog().find((x) => x.id === id) || null;
}

function publicBase(req) {
  if (process.env.PUBLIC_URL) return String(process.env.PUBLIC_URL).replace(/\/$/, "");
  const proto = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("x-forwarded-host") || req.get("host");
  return `${proto}://${host}`;
}

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
      replyTo: mail.replyTo,
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
      reply_to: mail.replyTo,
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
    replyTo: { email: mail.replyTo },
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
      reply_to: { email: mail.replyTo },
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
    replyTo: mail.replyTo,
    subject: mail.mailSubject,
    text: mail.text,
    html: mail.html,
    attachments: [{ filename: mail.fileName, path: mail.filePath }],
  });
}

async function sendDeliveryEmail(opts) {
  if (!isEmailReady()) {
    throw new Error(
      "이메일 설정이 없습니다. RESEND_API_KEY / BREVO_API_KEY / SENDGRID_API_KEY 또는 SMTP를 설정하세요."
    );
  }
  const mail = buildMailContent(opts);
  if (process.env.GAS_MAIL_URL) return sendViaGas(mail);
  if (process.env.RESEND_API_KEY) return sendViaResend(mail);
  if (process.env.BREVO_API_KEY) return sendViaBrevo(mail);
  if (process.env.SENDGRID_API_KEY) return sendViaSendgrid(mail);
  return sendViaSmtp(mail);
}

app.get("/api/meta", (_req, res) => {
  res.json({
    version: APP_VERSION,
    clientDefault: DEFAULT_CLIENT,
    dateDefault: todayISO(),
    supplierEmail: process.env.MAIL_FROM || process.env.SMTP_FROM || SUPPLIER.email,
    packages: readPresets().presets.map((p) => ({
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
    })),
    emailConfigured: isEmailReady(),
    emailProvider: emailProviderName(),
  });
});

const PRESETS_PATH = path.join(__dirname, "data", "presets.json");

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

function readPresets() {
  try {
    const raw = fs.readFileSync(PRESETS_PATH, "utf8");
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

function writePresets(list) {
  fs.mkdirSync(path.dirname(PRESETS_PATH), { recursive: true });
  const payload = {
    updatedAt: new Date().toISOString(),
    presets: list,
  };
  fs.writeFileSync(PRESETS_PATH, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

app.post("/api/auth", (req, res) => {
  const { pin } = req.body || {};
  if (String(pin || "") !== String(FORM_PIN)) {
    return res.status(401).json({ ok: false, error: "접속 비밀번호가 올바르지 않습니다." });
  }
  res.json({ ok: true });
});

app.get("/api/presets", (_req, res) => {
  const data = readPresets();
  res.json({ ok: true, updatedAt: data.updatedAt, presets: data.presets });
});

app.put("/api/presets", (req, res) => {
  try {
    const { pin, presets } = req.body || {};
    if (String(pin || "") !== String(FORM_PIN)) {
      return res.status(401).json({ ok: false, error: "접속 비밀번호가 올바르지 않습니다." });
    }
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
    const saved = writePresets(cleaned);
    res.json({ ok: true, updatedAt: saved.updatedAt, presets: cleaned });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "저장 실패" });
  }
});

const SEAL_PATH = path.join(__dirname, "data", "seal.png");

app.put("/api/seal", (req, res) => {
  try {
    const { pin, image } = req.body || {};
    if (String(pin || "") !== String(FORM_PIN)) {
      return res.status(401).json({ ok: false, error: "접속 비밀번호가 올바르지 않습니다." });
    }
    const m = String(image || "").match(/^data:image\/png;base64,(.+)$/);
    if (!m) {
      return res.status(400).json({ ok: false, error: "PNG 도장 이미지가 필요합니다." });
    }
    const buf = Buffer.from(m[1], "base64");
    if (buf.length < 200 || buf.length > 2_000_000) {
      return res.status(400).json({ ok: false, error: "도장 이미지 크기가 올바르지 않습니다." });
    }
    fs.mkdirSync(path.dirname(SEAL_PATH), { recursive: true });
    fs.writeFileSync(SEAL_PATH, buf);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "도장 저장 실패" });
  }
});

app.delete("/api/seal", (req, res) => {
  try {
    const { pin } = req.body || {};
    if (String(pin || "") !== String(FORM_PIN)) {
      return res.status(401).json({ ok: false, error: "접속 비밀번호가 올바르지 않습니다." });
    }
    if (fs.existsSync(SEAL_PATH)) fs.unlinkSync(SEAL_PATH);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "도장 복원 실패" });
  }
});

app.post("/api/generate", async (req, res) => {
  try {
    const {
      pin,
      packageIds,
      customItems,
      title,
      note,
      photoPackageIds,
      client,
      date,
      totals,
      rentalDailyIncl,
      rentalDays,
      emailTo,
      emailCc,
      subject,
      sendEmail,
    } = req.body || {};

    if (String(pin || "") !== String(FORM_PIN)) {
      return res.status(401).json({ ok: false, error: "접속 비밀번호가 올바르지 않습니다." });
    }

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
          subject || `[위캔] ${titles} 납품서류 (${fmt(totalSum)}원)`;
        await sendDeliveryEmail({
          client: client || DEFAULT_CLIENT,
          date: date || todayISO(),
          titles,
          totalSum,
          subject,
          fileName,
          filePath: result.outPath,
          emailTo,
          emailCc,
          receiptUrl,
        });
        emailed = true;
        try {
          upsertMailLog({
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
          });
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
    const entry = findMailLog(id);
    const now = new Date().toISOString();
    upsertMailLog({
      ...(entry || { id, fileName: `${id}.pdf`, to: "", subject: "" }),
      id,
      downloadedAt: (entry && entry.downloadedAt) || now,
      downloadCount: Number((entry && entry.downloadCount) || 0) + 1,
      lastDownloadAt: now,
      status: "received",
      receiptConfirmed: true,
    });
    const name = (entry && entry.fileName) || `납품서류_${id}.pdf`;
    res.download(filePath, name);
  } catch (err) {
    console.error(err);
    res.status(500).send("다운로드 중 오류가 발생했습니다.");
  }
});

app.get("/api/mail-log", (req, res) => {
  const pin = req.query.pin || req.headers["x-form-pin"];
  if (String(pin || "") !== String(FORM_PIN)) {
    return res.status(401).json({ ok: false, error: "접속 비밀번호가 올바르지 않습니다." });
  }
  res.json({ ok: true, items: summarizeMailLog() });
});

app.post("/api/mail-log", (req, res) => {
  const { pin } = req.body || {};
  if (String(pin || "") !== String(FORM_PIN)) {
    return res.status(401).json({ ok: false, error: "접속 비밀번호가 올바르지 않습니다." });
  }
  res.json({ ok: true, items: summarizeMailLog() });
});

function summarizeMailLog() {
  return readMailLog().map((e) => ({
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
// ensure mail log file exists
if (!fs.existsSync(MAIL_LOG_PATH)) {
  writeMailLog([]);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`위캔 납품서류 웹폼 실행 중`);
  console.log(`  PC:   http://localhost:${PORT}`);
  for (const ip of lanAddresses()) {
    console.log(`  폰:   http://${ip}:${PORT}`);
  }
  console.log(`  PIN:  ${FORM_PIN}`);
  console.log(`  EMAIL: ${emailProviderName()}`);
  if (process.env.PUBLIC_URL) {
    console.log(`  공개: ${process.env.PUBLIC_URL}`);
  }
});

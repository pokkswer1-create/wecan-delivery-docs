require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
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
const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/downloads", express.static(OUT));

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
    process.env.RESEND_API_KEY ||
      process.env.BREVO_API_KEY ||
      process.env.SENDGRID_API_KEY ||
      isSmtpReady()
  );
}

function emailProviderName() {
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
}) {
  const fromName = "위캔(wecan)";
  const fromEmail =
    process.env.MAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    SUPPLIER.email;
  const replyTo = process.env.MAIL_REPLY_TO || SUPPLIER.email;
  const mailSubject =
    subject || `[위캔] ${titles} 납품서류 (${fmt(totalSum)}원)`;
  const text = [
    `${client || DEFAULT_CLIENT} 귀중`,
    "",
    "위캔 납품서류를 첨부합니다.",
    `품목: ${titles}`,
    `합계(부가세포함): ${fmt(totalSum)}원`,
    `작성일: ${date || todayISO()}`,
    "",
    `입금계좌: ${SUPPLIER.bank} ${SUPPLIER.account}`,
    `예금주: ${SUPPLIER.accountHolder}`,
    `문의: ${SUPPLIER.phone} / ${SUPPLIER.email}`,
  ].join("\n");
  const pdfBase64 = fs.readFileSync(filePath).toString("base64");
  return {
    fromName,
    fromEmail,
    replyTo,
    mailSubject,
    text,
    emailTo,
    emailCc,
    fileName,
    pdfBase64,
    filePath,
  };
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
      content: [{ type: "text/plain", value: mail.text }],
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
  if (process.env.RESEND_API_KEY) return sendViaResend(mail);
  if (process.env.BREVO_API_KEY) return sendViaBrevo(mail);
  if (process.env.SENDGRID_API_KEY) return sendViaSendgrid(mail);
  return sendViaSmtp(mail);
}

app.get("/api/meta", (_req, res) => {
  res.json({
    clientDefault: DEFAULT_CLIENT,
    dateDefault: todayISO(),
    supplierEmail: SUPPLIER.email,
    packages: PACKAGE_TEMPLATES.map((t) => {
      const sample =
        t.id === "3_지주대임대"
          ? t.build({
              dailyIncl: t.defaultDailyIncl,
              days: t.defaultDays,
            })
          : t.build(t.defaultTotalIncl);
      return {
        id: t.id,
        title: t.title,
        defaultTotalIncl: t.defaultTotalIncl || null,
        defaultDailyIncl: t.defaultDailyIncl || null,
        defaultDays: t.defaultDays || null,
        items: sample.items,
      };
    }),
    emailConfigured: isEmailReady(),
    emailProvider: emailProviderName(),
  });
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
    if (sendEmail) {
      if (!emailTo) {
        return res.status(400).json({ ok: false, error: "받는 이메일 주소를 입력하세요." });
      }
      try {
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
        });
        emailed = true;
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

fs.mkdirSync(OUT, { recursive: true });

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

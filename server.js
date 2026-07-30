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
const FORM_PIN = process.env.FORM_PIN || "wecan2026";
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
  const pass = process.env.SMTP_PASS || "";
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      pass &&
      !/여기|비밀번호|password|changeme/i.test(pass)
  );
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!isSmtpReady()) {
    throw new Error(
      "이메일 설정이 없습니다. .env에 SMTP_HOST / SMTP_USER / SMTP_PASS를 넣어주세요."
    );
  }
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== "false",
    auth: { user, pass },
  });
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
    emailConfigured: isSmtpReady(),
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
    if (sendEmail) {
      if (!emailTo) {
        return res.status(400).json({ ok: false, error: "받는 이메일 주소를 입력하세요." });
      }
      const transporter = createTransport();
      const from = process.env.SMTP_FROM || process.env.SMTP_USER;
      await transporter.sendMail({
        from: `"위캔(wecan)" <${from}>`,
        to: emailTo,
        cc: emailCc || undefined,
        subject:
          subject ||
          `[위캔] ${titles} 납품서류 (${fmt(totalSum)}원)`,
        text: [
          `${client || DEFAULT_CLIENT} 귀중`,
          "",
          `위캔 납품서류를 첨부합니다.`,
          `품목: ${titles}`,
          `합계(부가세포함): ${fmt(totalSum)}원`,
          `작성일: ${date || todayISO()}`,
          "",
          `입금계좌: ${SUPPLIER.bank} ${SUPPLIER.account}`,
          `예금주: ${SUPPLIER.accountHolder}`,
          `문의: ${SUPPLIER.phone} / ${SUPPLIER.email}`,
        ].join("\n"),
        attachments: [
          {
            filename: fileName,
            path: result.outPath,
          },
        ],
      });
      emailed = true;
    }

    res.json({
      ok: true,
      fileName,
      downloadUrl,
      emailed,
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
  if (!process.env.SMTP_USER || !isSmtpReady()) {
    console.log("  (이메일: .env의 SMTP_PASS 설정 필요)");
  }
  if (process.env.PUBLIC_URL) {
    console.log(`  공개: ${process.env.PUBLIC_URL}`);
  }
});

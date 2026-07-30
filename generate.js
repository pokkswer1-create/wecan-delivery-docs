const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const { htmlToPdf, assetDataUri } = require("./pdf");

const ROOT = __dirname;
const OUT = path.join(ROOT, "out");
const TMP = path.join(ROOT, "tmp");

const SUPPLIER = {
  name: "위캔",
  nameEn: "wecan",
  ceo: "김강선",
  bizNo: "690-21-00190",
  address: "서울특별시 동작구 동작대로29길 119, 105동 202호",
  phone: "010-9314-0382",
  fax: "050-7702-3076",
  email: "pokkswer1@naver.com",
  bank: "카카오뱅크",
  account: "3333-14-7259532",
  accountHolder: "김강선(위캔(wecan))",
};

const DEFAULT_CLIENT = "대한배구협회";

function fmt(n) {
  return Math.round(n).toLocaleString("ko-KR");
}

function splitVat(totalIncl) {
  const supply = Math.round(totalIncl / 1.1);
  const vat = totalIncl - supply;
  return { supply, vat, total: totalIncl };
}

function koreanAmount(n) {
  const known = {
    4800000: "사백팔십만원정",
    3960000: "삼백구십육만원정",
    3690000: "삼백육십구만원정",
    7700000: "칠백칠십만원정",
  };
  if (known[n]) return known[n];
  return fmt(n) + "원정";
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDateKr(iso) {
  const [y, m, d] = iso.split("-");
  return `${y}년 ${m}월 ${d}일`;
}

const PACKAGE_TEMPLATES = [
  {
    id: "1_심판대",
    title: "심판대",
    defaultTotalIncl: 4800000,
    photos: ["photo_referee.png"],
    build(totalIncl) {
      const man = Math.round(totalIncl / 10000);
      return {
        id: this.id,
        title: this.title,
        fileName: `1_심판대_${man}만원_납품서류.pdf`,
        totalIncl,
        items: [
          {
            name: "배구 심판대",
            spec: "이동식 메탈 프레임 / 좌석·발판 포함",
            unit: "식",
            qty: 1,
            unitPriceIncl: totalIncl,
          },
        ],
        photos: this.photos,
        note: "납품 품목: 배구 심판대 1식. 부가세 포함 금액입니다.",
      };
    },
  },
  {
    id: "2_지주커버",
    title: "지주커버",
    defaultTotalIncl: 3960000,
    photos: ["photo_cover.png"],
    build(totalIncl) {
      const man = Math.round(totalIncl / 10000);
      return {
        id: this.id,
        title: this.title,
        fileName: `2_지주커버_${man}만원_납품서류.pdf`,
        totalIncl,
        items: [
          {
            name: "배구 지주커버",
            spec: "Senoh / FIVB / 보호패드 1조(2본)",
            unit: "조",
            qty: 1,
            unitPriceIncl: totalIncl,
          },
        ],
        photos: this.photos,
        note: "납품 품목: 배구 지주커버 1조(2본). 부가세 포함 금액입니다.",
      };
    },
  },
  {
    id: "3_지주대임대",
    title: "지주대 임대",
    defaultDailyIncl: 1100000,
    defaultDays: 7,
    photos: ["photo_posts_box.png"],
    build({ dailyIncl, days }) {
      const totalIncl = dailyIncl * days;
      const man = Math.round(totalIncl / 10000);
      return {
        id: this.id,
        title: this.title,
        fileName: `3_지주대_임대_${man}만원_납품서류.pdf`,
        totalIncl,
        items: [
          {
            name: "배구 지주대 임차료 (BG-2105)",
            spec: `지주·경기용 네트·안테나·보호패드 포함 / 일 ${fmt(dailyIncl)}원 × ${days}일`,
            unit: "일",
            qty: days,
            unitPriceIncl: dailyIncl,
          },
        ],
        photos: this.photos,
        note: `임대 기간 ${days}일 기준. 지주임차료 ${fmt(dailyIncl)}원/일 × ${days}일. 부가세 포함 총액 ${fmt(totalIncl)}원.`,
      };
    },
  },
  {
    id: "4_전사유니폼상의",
    title: "전사 유니폼 상의",
    defaultTotalIncl: 25000,
    photos: [],
    build(totalIncl) {
      const man = Math.round(totalIncl / 10000);
      return {
        id: this.id,
        title: this.title,
        fileName: `4_전사유니폼상의_${man}만원_납품서류.pdf`,
        totalIncl,
        items: [
          {
            name: "전사 유니폼 상의",
            spec: "열전사 / 팀로고·번호 포함",
            unit: "매",
            qty: 1,
            unitPriceIncl: totalIncl,
          },
        ],
        photos: this.photos,
        note: "납품 품목: 전사 유니폼 상의. 부가세 포함 금액입니다.",
      };
    },
  },
  {
    id: "5_전사유니폼하의",
    title: "전사 유니폼 하의",
    defaultTotalIncl: 20000,
    photos: [],
    build(totalIncl) {
      const man = Math.round(totalIncl / 10000);
      return {
        id: this.id,
        title: this.title,
        fileName: `5_전사유니폼하의_${man}만원_납품서류.pdf`,
        totalIncl,
        items: [
          {
            name: "전사 유니폼 하의",
            spec: "열전사 / 팀로고 포함",
            unit: "매",
            qty: 1,
            unitPriceIncl: totalIncl,
          },
        ],
        photos: this.photos,
        note: "납품 품목: 전사 유니폼 하의. 부가세 포함 금액입니다.",
      };
    },
  },
  {
    id: "6_전사유니폼세트",
    title: "전사 유니폼 세트",
    defaultTotalIncl: 40000,
    photos: [],
    build(totalIncl) {
      const man = Math.round(totalIncl / 10000);
      return {
        id: this.id,
        title: this.title,
        fileName: `6_전사유니폼세트_${man}만원_납품서류.pdf`,
        totalIncl,
        items: [
          {
            name: "전사 유니폼 세트",
            spec: "상의+하의 / 열전사 / 팀로고·번호 포함",
            unit: "세트",
            qty: 1,
            unitPriceIncl: totalIncl,
          },
        ],
        photos: this.photos,
        note: "납품 품목: 전사 유니폼 세트(상의+하의). 부가세 포함 금액입니다.",
      };
    },
  },
];

const PACKAGES = PACKAGE_TEMPLATES.map((t) => {
  if (t.id === "3_지주대임대") {
    return t.build({
      dailyIncl: t.defaultDailyIncl,
      days: t.defaultDays,
    });
  }
  return t.build(t.defaultTotalIncl);
});

function fontHead() {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap" rel="stylesheet">`;
}

function docCss() {
  return `
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Noto Sans KR", "Malgun Gothic", "맑은 고딕", sans-serif;
    color: #111;
    font-size: 11px;
  }
  .page { width: 100%; }
  h1 {
    text-align: center;
    font-size: 28px;
    letter-spacing: 12px;
    margin: 0 0 14px;
    border-bottom: 2px solid #111;
    padding-bottom: 8px;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .box {
    border: 1px solid #333;
    padding: 8px 10px;
    flex: 1;
  }
  .box h3 {
    margin: 0 0 6px;
    font-size: 12px;
    background: #222;
    color: #fff;
    display: inline-block;
    padding: 2px 8px;
  }
  .box table { width: 100%; border-collapse: collapse; }
  .box td { padding: 2px 0; vertical-align: top; }
  .box td.k { width: 72px; color: #444; }
  .receiver {
    font-size: 14px;
    font-weight: 700;
    margin: 8px 0 4px;
  }
  .amount-line {
    border: 1px solid #333;
    padding: 8px 10px;
    margin: 8px 0 12px;
    font-size: 13px;
  }
  .amount-line strong { font-size: 15px; }
  table.items {
    width: 100%;
    border-collapse: collapse;
    margin-top: 6px;
  }
  table.items th, table.items td {
    border: 1px solid #333;
    padding: 6px 4px;
    text-align: center;
  }
  table.items th { background: #f0f0f0; font-weight: 700; }
  table.items td.name { text-align: left; padding-left: 8px; }
  table.items td.num { text-align: right; padding-right: 8px; }
  .totals {
    width: 280px;
    margin-left: auto;
    margin-top: 8px;
    border-collapse: collapse;
  }
  .totals td {
    border: 1px solid #333;
    padding: 6px 8px;
  }
  .totals td.k { background: #f5f5f5; width: 120px; }
  .totals tr.grand td { background: #e8f0ff; font-weight: 700; }
  .notes {
    margin-top: 14px;
    border: 1px solid #999;
    padding: 8px 10px;
    min-height: 70px;
  }
  .notes h4 { margin: 0 0 6px; font-size: 12px; }
  .sign {
    margin-top: 18px;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
  }
  .sign .who { text-align: right; line-height: 1.5; }
  .seal {
    width: 72px;
    height: 72px;
    object-fit: contain;
  }
  .footer-bank {
    margin-top: 16px;
    font-size: 11px;
    color: #333;
  }
  `;
}

function supplierBoxHtml() {
  return `
  <div class="box">
    <h3>공급자</h3>
    <table>
      <tr><td class="k">상호</td><td>${SUPPLIER.name} (${SUPPLIER.nameEn})</td></tr>
      <tr><td class="k">대표자</td><td>${SUPPLIER.ceo}</td></tr>
      <tr><td class="k">등록번호</td><td>${SUPPLIER.bizNo}</td></tr>
      <tr><td class="k">사업장</td><td>${SUPPLIER.address}</td></tr>
      <tr><td class="k">연락처</td><td>${SUPPLIER.phone} / ${SUPPLIER.email}</td></tr>
    </table>
  </div>`;
}

function clientBoxHtml(ctx) {
  return `
  <div class="box">
    <h3>수신</h3>
    <table>
      <tr><td class="k">상호</td><td>${ctx.client}</td></tr>
      <tr><td class="k">작성일자</td><td>${ctx.dateKr}</td></tr>
      <tr><td class="k">유효기간</td><td>견적일 기준 30일</td></tr>
    </table>
  </div>`;
}

function itemsTableHtml(pkg) {
  const rows = pkg.items
    .map((it, i) => {
      const lineTotal = pkg.useSupplyLines
        ? it.supply
        : it.unitPriceIncl * it.qty;
      const unitPrice = pkg.useSupplyLines ? it.supply : it.unitPriceIncl;
      return `<tr>
        <td>${i + 1}</td>
        <td class="name">${it.name}<div style="color:#555;font-size:10px;margin-top:2px">${it.spec || ""}</div></td>
        <td>${it.unit}</td>
        <td>${it.qty}</td>
        <td class="num">${fmt(unitPrice)}</td>
        <td class="num">${fmt(lineTotal)}</td>
      </tr>`;
    })
    .join("");

  const empty = Array.from({ length: Math.max(0, 5 - pkg.items.length) })
    .map(
      (_, i) =>
        `<tr><td>${pkg.items.length + i + 1}</td><td></td><td></td><td></td><td></td><td></td></tr>`
    )
    .join("");

  const priceLabel = pkg.useSupplyLines ? "공급가액" : "단가(부가세포함)";
  const sumLabel = pkg.useSupplyLines ? "공급가액" : "합계금액";

  return `
  <table class="items">
    <thead>
      <tr>
        <th style="width:36px">No</th>
        <th>품명 및 규격</th>
        <th style="width:48px">단위</th>
        <th style="width:48px">수량</th>
        <th style="width:100px">${priceLabel}</th>
        <th style="width:100px">${sumLabel}</th>
      </tr>
    </thead>
    <tbody>${rows}${empty}</tbody>
  </table>`;
}

function totalsHtml(pkg) {
  let supply, vat, total;
  if (pkg.useSupplyLines) {
    supply = pkg.items.reduce((s, it) => s + it.supply, 0);
    vat = Math.round(supply * 0.1);
    total = supply + vat;
  } else {
    ({ supply, vat, total } = splitVat(pkg.totalIncl));
  }
  return `
  <table class="totals">
    <tr><td class="k">공급가액</td><td style="text-align:right">${fmt(supply)} 원</td></tr>
    <tr><td class="k">부가세 (10%)</td><td style="text-align:right">${fmt(vat)} 원</td></tr>
    <tr class="grand"><td class="k">합계 (VAT 포함)</td><td style="text-align:right">${fmt(total)} 원</td></tr>
  </table>`;
}

function signHtml() {
  return `
  <div class="sign">
    <div class="who">
      <div>상호 : ${SUPPLIER.name}</div>
      <div>대표자 : ${SUPPLIER.ceo}</div>
    </div>
    <img class="seal" src="${assetDataUri("seal_clear.png")}" />
  </div>
  <div class="footer-bank">
    입금계좌 : ${SUPPLIER.bank} ${SUPPLIER.account} (예금주: ${SUPPLIER.accountHolder})<br/>
    계산서 발행메일 : ${SUPPLIER.email}
  </div>`;
}

function makeDocHtml(pkg, docType, ctx) {
  const titles = {
    quote: "견 적 서",
    delivery: "납 품 서",
    statement: "거래명세서",
  };
  const intros = {
    quote: "아래와 같이 견적합니다.",
    delivery: "아래와 같이 납품합니다.",
    statement: "아래와 같이 거래하였음을 확인합니다.",
  };
  const totalForDisplay = pkg.totalIncl;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<title>${titles[docType]} - ${pkg.title}</title>
${fontHead()}
<style>${docCss()}</style>
</head>
<body>
  <div class="page">
    <h1>${titles[docType]}</h1>
    <div class="meta">
      ${clientBoxHtml(ctx)}
      ${supplierBoxHtml()}
    </div>
    <div class="receiver">${ctx.client} 귀중</div>
    <div class="amount-line">
      일금 <strong>${koreanAmount(totalForDisplay)}</strong>
      &nbsp;&nbsp;(₩ ${fmt(totalForDisplay)}) &nbsp;&nbsp;※ 부가세 포함
    </div>
    <div>${intros[docType]}</div>
    ${itemsTableHtml(pkg)}
    ${totalsHtml(pkg)}
    <div class="notes">
      <h4>참고사항</h4>
      <div>1. ${pkg.note}</div>
      <div>2. 작성일자: ${ctx.dateKr}</div>
      <div>3. 문서종류: ${titles[docType]} / 품목: ${pkg.title}</div>
    </div>
    ${signHtml()}
  </div>
</body>
</html>`;
}

function makeImageHtml(imageFiles, caption) {
  const imgs = imageFiles
    .map(
      (f) =>
        `<div class="shot"><img src="${assetDataUri(f)}"/></div>`
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"/>
${fontHead()}
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: "Noto Sans KR", "Malgun Gothic", sans-serif; margin:0; }
  h1 { text-align:center; font-size:20px; margin:0 0 12px; letter-spacing:4px; }
  .shot { page-break-inside: avoid; page-break-after: always; }
  .shot:last-child { page-break-after: auto; }
  .shot img {
    width: 100%;
    max-height: 250mm;
    object-fit: contain;
    border: 1px solid #ccc;
    display: block;
    margin: 0 auto;
  }
</style></head>
<body>
  <h1>${caption}</h1>
  ${imgs}
</body></html>`;
}

function makeEmbedImageHtml(imageFile, caption) {
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"/>
${fontHead()}
<style>
  @page { size: A4; margin: 10mm; }
  body { margin:0; font-family: "Noto Sans KR", "Malgun Gothic", sans-serif; }
  h1 { text-align:center; font-size:18px; margin:0 0 8px; letter-spacing:3px; }
  .wrap { display:flex; align-items:center; justify-content:center; height: 250mm; }
  img { max-width:100%; max-height:100%; object-fit:contain; border:1px solid #ddd; }
</style></head>
<body>
  <h1>${caption}</h1>
  <div class="wrap"><img src="${assetDataUri(imageFile)}"/></div>
</body></html>`;
}

async function mergePdfs(paths, outPath) {
  const merged = await PDFDocument.create();
  for (const p of paths) {
    const bytes = fs.readFileSync(p);
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((pg) => merged.addPage(pg));
  }
  fs.writeFileSync(outPath, await merged.save());
}

async function writeBizBankPdfs(dir) {
  const bizHtml = path.join(dir, "04_biz.html");
  const bizPdf = path.join(dir, "04_biz.pdf");
  fs.writeFileSync(
    bizHtml,
    makeEmbedImageHtml("biz_reg.png", "사업자등록증"),
    "utf8"
  );
  await htmlToPdf(bizHtml, bizPdf);

  const bankHtml = path.join(dir, "05_bank.html");
  const bankPdf = path.join(dir, "05_bank.pdf");
  fs.writeFileSync(
    bankHtml,
    makeEmbedImageHtml("bank.png", "사업자통장 (계좌개설확인서)"),
    "utf8"
  );
  await htmlToPdf(bankHtml, bankPdf);

  return [bizPdf, bankPdf];
}

function resolveCtx(options = {}) {
  const date = options.date || todayISO();
  return {
    client: options.client || DEFAULT_CLIENT,
    date,
    dateKr: toDateKr(date),
  };
}

function resolvePackages(selection = {}) {
  // 자유 입력 품목
  if (Array.isArray(selection.customItems) && selection.customItems.length > 0) {
    const items = selection.customItems.map((it, i) => {
      const name = String(it.name || "").trim();
      const qty = Number(it.qty);
      const unitPriceIncl = Number(it.unitPriceIncl);
      if (!name) throw new Error(`${i + 1}번 품명을 입력하세요.`);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error(`${name}: 수량을 확인하세요.`);
      if (!Number.isFinite(unitPriceIncl) || unitPriceIncl < 0) {
        throw new Error(`${name}: 단가를 확인하세요.`);
      }
      return {
        name,
        spec: String(it.spec || "").trim(),
        unit: String(it.unit || "식").trim() || "식",
        qty,
        unitPriceIncl,
      };
    });
    const totalIncl = items.reduce((s, it) => s + it.unitPriceIncl * it.qty, 0);
    const title = String(selection.title || "납품").trim() || "납품";
    const man = Math.round(totalIncl / 10000);
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, "_");
    const photoSet = new Set();
    for (const id of selection.photoPackageIds || []) {
      const tpl = PACKAGE_TEMPLATES.find((t) => t.id === id);
      (tpl?.photos || []).forEach((p) => photoSet.add(p));
    }
    return [
      {
        id: "custom",
        title,
        fileName: `위캔_${safeTitle}_${man}만원_납품서류.pdf`,
        totalIncl,
        items,
        photos: [...photoSet],
        note:
          selection.note ||
          `납품 품목 ${items.length}건. 부가세 포함 총액 ${fmt(totalIncl)}원.`,
      },
    ];
  }

  const ids = selection.packageIds || PACKAGE_TEMPLATES.map((t) => t.id);
  const packages = [];

  for (const id of ids) {
    const tpl = PACKAGE_TEMPLATES.find((t) => t.id === id);
    if (!tpl) throw new Error(`알 수 없는 품목: ${id}`);

    if (id === "3_지주대임대") {
      const dailyIncl = Number(
        selection.rentalDailyIncl ?? tpl.defaultDailyIncl
      );
      const days = Number(selection.rentalDays ?? tpl.defaultDays);
      if (!dailyIncl || !days) throw new Error("지주대 임대 단가/일수를 확인하세요.");
      packages.push(tpl.build({ dailyIncl, days }));
    } else {
      const totalIncl = Number(
        selection.totals?.[id] ?? tpl.defaultTotalIncl
      );
      if (!totalIncl) throw new Error(`${tpl.title} 금액을 확인하세요.`);
      packages.push(tpl.build(totalIncl));
    }
  }

  return packages;
}

async function buildPackage(pkg, options = {}) {
  const ctx = resolveCtx(options);
  const dir = path.join(TMP, pkg.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  const parts = [];
  const includeBizBank = options.includeBizBank !== false;

  for (const [key, type] of [
    ["01_quote", "quote"],
    ["02_delivery", "delivery"],
    ["03_statement", "statement"],
  ]) {
    const html = path.join(dir, `${key}.html`);
    const pdf = path.join(dir, `${key}.pdf`);
    fs.writeFileSync(html, makeDocHtml(pkg, type, ctx), "utf8");
    await htmlToPdf(html, pdf);
    parts.push(pdf);
  }

  if (includeBizBank) {
    parts.push(...(await writeBizBankPdfs(dir)));
  }

  if (pkg.photos && pkg.photos.length) {
    const html = path.join(dir, "06_photos.html");
    const pdf = path.join(dir, "06_photos.pdf");
    fs.writeFileSync(
      html,
      makeImageHtml(pkg.photos, `${pkg.title} 관련 사진`),
      "utf8"
    );
    await htmlToPdf(html, pdf);
    parts.push(pdf);
  }

  const outPath = path.join(OUT, pkg.fileName);
  await mergePdfs(parts, outPath);
  return outPath;
}

async function buildCombined(packages, options = {}) {
  const ctx = resolveCtx(options);
  const dir = path.join(TMP, "combined");
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const parts = [];

  for (const pkg of packages) {
    const pkgDir = path.join(TMP, pkg.id);
    fs.mkdirSync(pkgDir, { recursive: true });

    for (const [key, type] of [
      ["01_quote", "quote"],
      ["02_delivery", "delivery"],
      ["03_statement", "statement"],
    ]) {
      const html = path.join(pkgDir, `${key}.html`);
      const pdf = path.join(pkgDir, `${key}.pdf`);
      fs.writeFileSync(html, makeDocHtml(pkg, type, ctx), "utf8");
      await htmlToPdf(html, pdf);
      parts.push(pdf);
    }

    if (pkg.photos && pkg.photos.length) {
      const photoHtml = path.join(pkgDir, "06_photos.html");
      const photoPdf = path.join(pkgDir, "06_photos.pdf");
      fs.writeFileSync(
        photoHtml,
        makeImageHtml(pkg.photos, `${pkg.title} 관련 사진`),
        "utf8"
      );
      await htmlToPdf(photoHtml, photoPdf);
      parts.push(photoPdf);
    }
  }

  parts.push(...(await writeBizBankPdfs(dir)));

  const titles = packages.map((p) => p.title).join("_");
  const fileName = `위캔_납품서류_통합_${titles.replace(/\s+/g, "")}.pdf`;
  const outPath = path.join(OUT, fileName);
  await mergePdfs(parts, outPath);
  return outPath;
}

async function buildFromRequest(req) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(TMP, { recursive: true });

  const packages = resolvePackages(req);
  const options = {
    client: req.client,
    date: req.date,
  };

  if (req.mode === "combined" || packages.length > 1) {
    const outPath = await buildCombined(packages, options);
    return { outPath, packages, mode: "combined" };
  }

  const outPath = await buildPackage(packages[0], options);
  return { outPath, packages, mode: "single" };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(TMP, { recursive: true });

  const results = [];

  if (process.env.COMBINED === "1") {
    const p = await buildCombined(PACKAGES);
    const st = fs.statSync(p);
    results.push({ file: path.basename(p), bytes: st.size });
    console.log("OK", p, st.size);
    const pdf = await PDFDocument.load(fs.readFileSync(p));
    console.log("pages", pdf.getPageCount());
  } else {
    const targets = process.env.ONLY
      ? PACKAGES.filter((p) => p.id === process.env.ONLY)
      : PACKAGES;
    for (const pkg of targets) {
      const p = await buildPackage(pkg);
      const st = fs.statSync(p);
      results.push({ file: path.basename(p), bytes: st.size });
      console.log("OK", p, st.size);
      const pdf = await PDFDocument.load(fs.readFileSync(p));
      console.log("pages", pdf.getPageCount());
    }
  }
  console.log(JSON.stringify(results, null, 2));
}

module.exports = {
  SUPPLIER,
  DEFAULT_CLIENT,
  PACKAGE_TEMPLATES,
  PACKAGES,
  OUT,
  buildPackage,
  buildCombined,
  buildFromRequest,
  resolvePackages,
  todayISO,
  fmt,
};

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

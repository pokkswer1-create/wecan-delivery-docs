/**
 * Wecan delivery mail relay (Google Apps Script)
 *
 * ★ 반드시 이 파일 전체로 다시 배포하세요 (새 배포).
 * 예전 스크립트는 본문에 수신확인 URL을 넣을 수 있습니다.
 *
 * 1) https://script.google.com
 * 2) 이 파일 내용으로 교체
 * 3) 배포 → 새 배포 → 웹 앱
 * 4) GAS_MAIL_URL 갱신 (URL이 바뀌면 Render 환경변수도 수정)
 */
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents || "{}");
    if (!d.to || !d.subject || !d.pdfBase64 || !d.fileName) {
      return json_({ ok: false, error: "missing fields" });
    }
    var blob = Utilities.newBlob(
      Utilities.base64Decode(d.pdfBase64),
      "application/pdf",
      d.fileName
    );

    // 본문은 서버에서 받은 text/html만 사용 (수신확인 URL 추가 금지)
    var text = String(d.text || "");
    var html =
      d.html && String(d.html).trim()
        ? String(d.html)
        : text.replace(/\n/g, "<br>");

    // 안전장치: 예전 수신확인 문구가 섞여 있으면 제거
    text = stripReceiptNoise_(text);
    html = stripReceiptNoise_(html);

    var options = {
      attachments: [blob],
      name: d.fromName || "위캔(wecan)",
      htmlBody: html,
    };
    if (d.replyTo) options.replyTo = d.replyTo;
    if (d.cc) options.cc = d.cc;
    GmailApp.sendEmail(d.to, d.subject, text, options);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function stripReceiptNoise_(s) {
  return String(s || "")
    .replace(/【수신확인】[^\n<]*/g, "")
    .replace(/\(첨부 PDF도 함께 보내드립니다\.\)/g, "")
    .replace(/https?:\/\/[^\s"'<>]*\/r\/[a-f0-9]+/gi, "")
    .replace(/링크:\s*/g, "")
    .replace(/(<br>\s*){3,}/g, "<br><br>")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function doGet() {
  return ContentService.createTextOutput("wecan-mail-ok");
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

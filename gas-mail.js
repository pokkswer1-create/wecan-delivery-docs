/**
 * 위캔 납품서류 메일 중계 (Google Apps Script)
 *
 * 사용법:
 * 1) https://script.google.com 접속
 * 2) 새 프로젝트 → 이 파일 내용 전체 붙여넣기
 * 3) 배포 → 새 배포 → 유형: 웹 앱
 *    - 실행 계정: 나
 *    - 액세스 권한: 모든 사용자
 * 4) 배포 후 나온 URL을 채팅에 보내주세요
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
    var options = {
      attachments: [blob],
      name: d.fromName || "위캔(wecan)",
      htmlBody: (d.text || "").replace(/\n/g, "<br>"),
    };
    if (d.replyTo) options.replyTo = d.replyTo;
    if (d.cc) options.cc = d.cc;
    GmailApp.sendEmail(d.to, d.subject, d.text || "", options);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return ContentService.createTextOutput("wecan-mail-ok");
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

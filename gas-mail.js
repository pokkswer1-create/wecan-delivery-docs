/**
 * Wecan delivery mail relay (Google Apps Script)
 *
 * 1) https://script.google.com
 * 2) New project -> paste this whole file
 * 3) Deploy -> New deployment -> Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4) Copy the Web app URL into GAS_MAIL_URL
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
    var html = d.html || String(d.text || "").replace(/\n/g, "<br>");
    var options = {
      attachments: [blob],
      name: d.fromName || "위캔(wecan)",
      htmlBody: html,
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

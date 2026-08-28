const { OAuth2Client } = require("google-auth-library");
const nodemailer = require("nodemailer");

const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.send",
];

function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function oauthClient(redirectUri) {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

function googleAuthUrl(redirectUri, state) {
  return oauthClient(redirectUri).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  });
}

async function exchangeGoogleCode(redirectUri, code) {
  const client = oauthClient(redirectUri);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload() || {};
  return {
    sub: payload.sub,
    email: payload.email || "",
    name: payload.name || "",
    tokens,
  };
}

async function sendViaGmailApi(tokens, mail, redirectUri) {
  const client = oauthClient(redirectUri);
  client.setCredentials({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expiry_date: tokens.expiry_date,
  });
  const at = await client.getAccessToken();
  const access = at && at.token ? at.token : tokens.access_token;
  if (!access) throw new Error("구글 메일 권한이 없습니다. 다시 로그인해 주세요.");

  const transporter = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix",
  });
  const built = await transporter.sendMail({
    from: `"${mail.fromName}" <${mail.fromEmail}>`,
    to: mail.emailTo,
    cc: mail.emailCc || undefined,
    replyTo: mail.replyTo || undefined,
    subject: mail.mailSubject,
    text: mail.text,
    html: mail.html,
    attachments: mail.filePath
      ? [{ filename: mail.fileName, path: mail.filePath }]
      : undefined,
  });
  const raw = built.message.toString("base64url");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + access,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error && body.error.message ? body.error.message : `Gmail ${res.status}`);
  }
}

module.exports = {
  SCOPES,
  isGoogleConfigured,
  googleAuthUrl,
  exchangeGoogleCode,
  sendViaGmailApi,
};

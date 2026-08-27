function trim(v) {
  return String(v == null ? "" : v).trim();
}

function fromName(supplier) {
  const name = trim(supplier && supplier.name);
  const nameEn = trim(supplier && supplier.nameEn);
  if (name && nameEn) return `${name}(${nameEn})`;
  return name || "납품서류";
}

function fromEmail(env) {
  const e = env || {};
  return trim(e.MAIL_FROM || e.SMTP_FROM);
}

function replyTo(supplier) {
  return trim(supplier && supplier.email);
}

function mailEnvelope(supplier, env) {
  return {
    fromName: fromName(supplier),
    fromEmail: fromEmail(env),
    replyTo: replyTo(supplier),
  };
}

module.exports = {
  fromName,
  fromEmail,
  replyTo,
  mailEnvelope,
};

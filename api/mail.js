// Outbound email as legal.os@zameen.com — SMTP, no npm dependencies.
//
// SMTP is a line protocol, so a correct client is a short state machine rather
// than a library. Ports 587 (STARTTLS) and 465 (implicit TLS) are both open
// from this host; 587 is the default.
//
// Credentials come from config/legalos.config.json and are never logged. The
// sent log records recipients and subjects only — never the body, never the
// password.
const net = require("net");
const tls = require("tls");
const fs = require("fs");
const path = require("path");
const { load, ROOT } = require("./config");

const LOG_FILE = path.join(ROOT, "config", ".mail-log.json");

function readLine(socket, expectCodes) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (d) => {
      buf += d.toString("utf8");
      // A multiline reply is "250-first\r\n250 last\r\n": the final line has a
      // SPACE after the code. Waiting for it is what stops us from sending the
      // next command into the middle of a greeting.
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1];
      if (!last || !/^\d{3}[ ]/.test(last)) return;
      cleanup();
      const code = parseInt(last.slice(0, 3), 10);
      if (expectCodes && !expectCodes.includes(code)) {
        return reject(new Error("SMTP expected " + expectCodes.join("/") + " got: " + lines.join(" | ")));
      }
      resolve({ code, text: buf });
    };
    const onErr = (e) => { cleanup(); reject(e); };
    const onEnd = () => { cleanup(); reject(new Error("SMTP connection closed early: " + buf)); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("SMTP timeout waiting for reply")); }, 30000);
    function cleanup() {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onErr);
      socket.removeListener("end", onEnd);
    }
    socket.on("data", onData);
    socket.on("error", onErr);
    socket.on("end", onEnd);
  });
}

function send(socket, line) {
  return new Promise((resolve, reject) => {
    socket.write(line + "\r\n", (e) => (e ? reject(e) : resolve()));
  });
}

// RFC 2047 — a Subject with non-ASCII must be encoded or it arrives as mojibake.
function encodeHeader(s) {
  const v = String(s || "");
  return /^[\x20-\x7E]*$/.test(v) ? v : "=?UTF-8?B?" + Buffer.from(v, "utf8").toString("base64") + "?=";
}

function buildMessage({ from, fromName, to, cc, subject, text, html }) {
  const boundary = "legalos_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const headers = [
    "From: " + (fromName ? '"' + encodeHeader(fromName) + '" <' + from + ">" : from),
    "To: " + to.join(", "),
    cc && cc.length ? "Cc: " + cc.join(", ") : null,
    "Subject: " + encodeHeader(subject),
    "Date: " + new Date().toUTCString(),
    "Message-ID: <" + boundary + "@zameen.com>",
    "MIME-Version: 1.0",
    "X-Mailer: LegalOS",
  ].filter(Boolean);

  if (html) {
    headers.push('Content-Type: multipart/alternative; boundary="' + boundary + '"');
    const body = [
      "--" + boundary,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(text || "", "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
      "--" + boundary,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(html, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
      "--" + boundary + "--",
      "",
    ].join("\r\n");
    return headers.join("\r\n") + "\r\n\r\n" + body;
  }
  headers.push("Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64");
  const body = Buffer.from(text || "", "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  return headers.join("\r\n") + "\r\n\r\n" + body;
}

// Dot-stuffing: a line consisting of a single "." would otherwise terminate the
// DATA block early and truncate the message.
function dotStuff(msg) {
  return msg.split(/\r?\n/).map((l) => (l.startsWith(".") ? "." + l : l)).join("\r\n");
}

async function connect(cfg) {
  const { host, port } = cfg.mail;
  if (Number(port) === 465) {
    const socket = tls.connect({ host, port: 465, servername: host });
    await new Promise((res, rej) => {
      socket.once("secureConnect", res);
      socket.once("error", rej);
    });
    await readLine(socket, [220]);
    await send(socket, "EHLO legalos.zameen.com");
    await readLine(socket, [250]);
    return socket;
  }
  // 587 — plain connect then STARTTLS upgrade.
  const plain = net.connect({ host, port: Number(port) || 587 });
  await new Promise((res, rej) => {
    plain.once("connect", res);
    plain.once("error", rej);
  });
  await readLine(plain, [220]);
  await send(plain, "EHLO legalos.zameen.com");
  await readLine(plain, [250]);
  await send(plain, "STARTTLS");
  await readLine(plain, [220]);
  const secure = tls.connect({ socket: plain, servername: host });
  await new Promise((res, rej) => {
    secure.once("secureConnect", res);
    secure.once("error", rej);
  });
  await send(secure, "EHLO legalos.zameen.com");
  await readLine(secure, [250]);
  return secure;
}

async function sendMail({ to, cc = [], subject, text, html }) {
  const cfg = load();
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) throw new Error("no recipient");
  if (!cfg.mail.pass) { const e = new Error("no mailbox credential configured"); e.code = "NO_MAIL_CREDENTIAL"; throw e; }

  // The safety catch: until mail.enabled is true nothing leaves the building.
  // Everything above this line still runs, so a misconfiguration surfaces
  // before it can reach a real inbox.
  if (!cfg.mail.enabled) {
    const rec = { at: new Date().toISOString(), to: recipients, cc, subject, delivered: false, note: "mail.enabled is false — not sent" };
    appendLog(rec);
    return rec;
  }

  const socket = await connect(cfg);
  try {
    await send(socket, "AUTH LOGIN");
    await readLine(socket, [334]);
    await send(socket, Buffer.from(cfg.mail.user, "utf8").toString("base64"));
    await readLine(socket, [334]);
    await send(socket, Buffer.from(cfg.mail.pass, "utf8").toString("base64"));
    await readLine(socket, [235]);

    await send(socket, "MAIL FROM:<" + cfg.mail.user + ">");
    await readLine(socket, [250]);
    for (const r of recipients.concat(cc)) {
      await send(socket, "RCPT TO:<" + r + ">");
      await readLine(socket, [250, 251]);
    }
    await send(socket, "DATA");
    await readLine(socket, [354]);
    const msg = buildMessage({ from: cfg.mail.user, fromName: cfg.mail.fromName, to: recipients, cc, subject, text, html });
    await send(socket, dotStuff(msg) + "\r\n.");
    const done = await readLine(socket, [250]);
    await send(socket, "QUIT");
    socket.end();
    const rec = { at: new Date().toISOString(), to: recipients, cc, subject, delivered: true, response: done.text.trim().slice(0, 200) };
    appendLog(rec);
    return rec;
  } catch (e) {
    try { socket.end(); } catch (_) {}
    appendLog({ at: new Date().toISOString(), to: recipients, cc, subject, delivered: false, error: e.message });
    throw e;
  }
}

function appendLog(rec) {
  try {
    let log = [];
    try { log = JSON.parse(fs.readFileSync(LOG_FILE, "utf8")); } catch (e) { log = []; }
    log.unshift(rec);
    fs.writeFileSync(LOG_FILE, JSON.stringify(log.slice(0, 500), null, 2), { mode: 0o640 });
  } catch (e) { /* logging must never break sending */ }
}

function recentLog(n = 50) {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, "utf8")).slice(0, n); } catch (e) { return []; }
}

// Prove the credential and the route without emailing a person.
async function verifyConnection() {
  const cfg = load();
  if (!cfg.mail.pass) return { ok: false, reason: "no mailbox credential configured" };
  let socket;
  try {
    socket = await connect(cfg);
    await send(socket, "AUTH LOGIN");
    await readLine(socket, [334]);
    await send(socket, Buffer.from(cfg.mail.user, "utf8").toString("base64"));
    await readLine(socket, [334]);
    await send(socket, Buffer.from(cfg.mail.pass, "utf8").toString("base64"));
    await readLine(socket, [235]);
    await send(socket, "QUIT");
    socket.end();
    return { ok: true, host: cfg.mail.host, port: cfg.mail.port, user: cfg.mail.user };
  } catch (e) {
    try { if (socket) socket.end(); } catch (_) {}
    return { ok: false, reason: e.message };
  }
}

module.exports = { sendMail, verifyConnection, recentLog };

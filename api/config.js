// Runtime configuration + secrets loader.
//
// Everything secret (the Google service-account key, the mailbox password)
// lives in config/ which is gitignored — nothing here is ever committed, and
// nothing here is ever served: server.js denies /config/ outright.
//
// The file is re-read when its mtime changes, so credentials can be rotated
// without restarting the service.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "config", "legalos.config.json");

let cached = null;
let cachedMtime = 0;

const DEFAULTS = {
  access: {
    // Cloudflare Access team domain + the application's AUD tag. Both are
    // public identifiers, not secrets.
    teamDomain: "zameen-zt.cloudflareaccess.com",
    aud: "",
    // System administrators — the people who run LegalOS, who are not
    // necessarily on the legal roster. Without this the person who deploys and
    // configures the system resolves to an unknown requester and is refused
    // their own knowledge base. Kept separate from the roster on purpose: an
    // administrator is not a lawyer, and should not appear as one.
    admins: [],
    // When false, the API trusts devBypassEmail instead of a real Access JWT.
    // That is for localhost development ONLY and is refused in production —
    // see access.js, which ignores the bypass unless the request is loopback.
    enforce: true,
    devBypassEmail: "",
  },
  drive: {
    serviceAccountFile: "config/service-account.json",
    // The knowledge base is NOT one folder. The legal department keeps several
    // top-level folders in Drive (commercial, compliance, litigation, projects),
    // and they are siblings rather than children of a common parent.
    //
    // So the default is discovery, not configuration: every folder shared with
    // the service account becomes part of the knowledge base. Sharing a new
    // folder is then the whole act of adding it — nobody has to come back and
    // edit this file. Pin explicit ids in knowledgeFolderIds to override.
    autoDiscover: true,
    knowledgeFolderIds: [],
    // Back-compat with the original single-folder shape.
    knowledgeFolderId: "",
    refreshMinutes: 15,
  },
  mail: {
    host: "smtp.gmail.com",
    port: 587,
    user: "legal.os@zameen.com",
    pass: "",
    fromName: "LegalOS — Zameen Legal",
    // Nothing is emailed to a real person until this is true. Until then the
    // send path runs end to end and records the message, but stops at the wire.
    enabled: false,
  },
};

function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const k of Object.keys(over || {})) {
    const bv = base ? base[k] : undefined;
    const ov = over[k];
    out[k] = ov && typeof ov === "object" && !Array.isArray(ov) && bv && typeof bv === "object"
      ? deepMerge(bv, ov)
      : ov;
  }
  return out;
}

function load() {
  let mtime = 0;
  try { mtime = fs.statSync(CONFIG_PATH).mtimeMs; } catch (e) { mtime = 0; }
  if (cached && mtime === cachedMtime) return cached;

  let onDisk = {};
  if (mtime) {
    try {
      onDisk = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    } catch (e) {
      // A malformed config must not take the app down — the static site and
      // every already-loaded credential keep working, and the fault is loud.
      console.error("[config] config/legalos.config.json is not valid JSON:", e.message);
      if (cached) return cached;
      onDisk = {};
    }
  }
  cached = deepMerge(DEFAULTS, onDisk);
  cached.present = !!mtime;
  cachedMtime = mtime;
  return cached;
}

// Absolute path to a file referenced from config, resolved against the app root.
function resolve(rel) {
  if (!rel) return "";
  return path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
}

// Never let a secret reach a response body. This is what /api/health reports.
function redactedStatus() {
  const c = load();
  let saEmail = "";
  try {
    const sa = JSON.parse(fs.readFileSync(resolve(c.drive.serviceAccountFile), "utf8"));
    saEmail = sa.client_email || "";
  } catch (e) { saEmail = ""; }
  return {
    configFilePresent: c.present,
    access: { teamDomain: c.access.teamDomain, audConfigured: !!c.access.aud, enforce: c.access.enforce, adminCount: (c.access.admins || []).length },
    drive: {
      serviceAccountPresent: !!saEmail,
      serviceAccountEmail: saEmail,
      autoDiscover: !!c.drive.autoDiscover,
      pinnedFolders: (c.drive.knowledgeFolderIds || []).length + (c.drive.knowledgeFolderId ? 1 : 0),
      // "Configured" now means the app can find SOMETHING: either folders were
      // pinned, or discovery is on and a key exists to discover them with.
      folderConfigured: !!(c.drive.autoDiscover && saEmail) || !!c.drive.knowledgeFolderId || (c.drive.knowledgeFolderIds || []).length > 0,
    },
    mail: { host: c.mail.host, port: c.mail.port, user: c.mail.user, credentialPresent: !!c.mail.pass, enabled: !!c.mail.enabled },
  };
}

module.exports = { load, resolve, redactedStatus, CONFIG_PATH, ROOT };

// LegalOS's front door — credential sign-in.
//
// Identity is verified SERVER-SIDE: the form posts to /api/auth/login, which
// checks an scrypt hash and answers with the account plus an HttpOnly session
// cookie. Nothing in this file (or in localStorage) is the security boundary —
// the store's session slice only mirrors what the server already vouched for,
// and every data call re-proves itself against the cookie or Cloudflare Access.
//
// Sessions: 12h absolute, 60min idle, revalidated here every few minutes and
// whenever the tab regains focus. A dead session drops straight back to this
// screen with a notice.
//
// The requester views (business department heads) stay as demo buttons for now
// — kept on the /portal/ door and under a secondary tab here.
import { html, cx, useState, useRef, useEffect, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Avatar } from "../ui.js";
import { byId, REQUESTER_PERSONAS } from "../data.js";
import { setViewAs, landingFor, activeUser } from "../rbac.js";
import { getSession, setSession, hydrateRequests, hydrateConfigProposals, hydrateNotifications } from "../store.js";
import { navigate } from "../router.js";
import { api } from "../api.js";

const AUTH_KEY = "legalos-authed";

export const isAuthed = () => {
  // A real credential login (a server-issued account) is authed anywhere. The
  // requester views are kept as passwordless DEMO buttons for now: entering one
  // sets the demo flag, and that is enough to open the business side on either
  // door. It never grants legal access — a requester identity carries no legal
  // permission groups, so canOpenPath still confines them to the requester paths
  // (raise + track). So the demo is "wired in" to the same gate, just with an
  // empty grant.
  const s = getSession();
  if (s && s.account) return true;
  try { return localStorage.getItem(AUTH_KEY) === "1"; } catch (e) { return false; }
};

export function signOut() {
  try { api.auth.logout().catch(() => {}); } catch (e) {}
  try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
  setSession({ account: null });
  navigate("/login");
}

/* ---------------- session maintenance ---------------- */
// One watcher per page load: revalidates the server session on boot, every five
// minutes, and when the tab comes back to the foreground. Only a definite 401
// signs the user out — a server restart or a network blip must not.
let notice = "";
export const authNotice = () => notice;
export const clearAuthNotice = () => { notice = ""; };
let watching = false;
export function startSessionWatch() {
  if (watching || isRequesterDoor()) return;
  watching = true;
  const check = async () => {
    const s = getSession();
    if (!s || !s.account) return;
    try {
      await api.auth.session();
    } catch (e) {
      if (e && e.status === 401) {
        notice = "Your session has expired — please sign in again.";
        try { localStorage.removeItem(AUTH_KEY); } catch (err) {}
        setSession({ account: null });
        navigate("/login");
      }
    }
  };
  check();
  setInterval(check, 5 * 60e3);
  try {
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  } catch (e) {}
}

/* ---------------- demo requester views (kept for now) ---------------- */
export const LOGIN_LANES = [
  {
    key: "legal",
    label: "Legal team",
    blurb: "Opens the legal dashboard — queues, assignment, approvals and the legal workspace.",
  },
  {
    key: "requester",
    label: "Requester",
    blurb: "Opens the requester view — raise a legal request and follow it end to end.",
  },
];

/* Kept with BOTH lanes: the legal entries no longer render as login buttons
   (the legal door takes credentials now) but they remain the roster behind the
   admin-only View-As switcher in the sidebar. */
export const CREDENTIAL_GROUPS = [
  {
    lane: "legal",
    section: "Legal — Leadership",
    people: [
      { id: "u1", view: "Director Legal", tone: "purple" },
    ],
  },
  {
    lane: "legal",
    section: "Legal — Team Leads (AD / Senior Manager)",
    people: [
      { id: "u6", view: "Head of Litigation & Disputes", tone: "amber" },
      { id: "u3", view: "Head of Commercial Contracts", tone: "amber" },
      { id: "u17", view: "Senior Manager · Litigation & Disputes", tone: "amber" },
      { id: "u20", view: "Manager Compliance", tone: "amber" },
    ],
  },
  {
    lane: "legal",
    section: "Legal — Team",
    people: [
      { id: "u18", view: "Senior Associate · Litigation & Disputes", tone: "green" },
      { id: "u19", view: "Recovery · Litigation & Disputes", tone: "green" },
      { id: "u7", view: "Assistant Manager · Commercial Contracts", tone: "green" },
      { id: "u5", view: "Associate · Commercial Contracts", tone: "green" },
      { id: "u12", view: "Associate · Compliance", tone: "green" },
      { id: "u10", view: "Legal Executive", tone: "blue" },
    ],
  },
  {
    lane: "requester",
    // One entry per real business department (data.js REQUESTER_DEPTS). These
    // used to be four invented people (u13–u16) who existed in NO roster, so
    // every card resolved to "Unassigned" and the request it raised carried no
    // requester at all. A department is real; an invented CFO is not.
    section: "Raise for your department",
    people: REQUESTER_PERSONAS.map((p) => ({ id: p.id, view: p.dept, tone: "gray" })),
  },
];

/* The /portal/ document is the BUSINESS front door — it keeps the demo persona
   buttons for now, untouched. The root mount is the legal team's way in and
   requires a credential. */
export const isRequesterDoor = () => {
  try { return /\/portal\/?$/.test(window.location.pathname); } catch (e) { return false; }
};

// The official Zameen mark, served from assets/. The URL is resolved from this
// module's own location (…/src*/pages/login.js → …/assets/) so it is correct
// under both mounts (/legalos/ and /legalos/portal/), which share one src tree.
export const ASSET_LOGO = (() => {
  try { return new URL("../../assets/zameen-logo.png", import.meta.url).href; }
  catch (e) { return "assets/zameen-logo.png"; }
})();

export function ZMark({ size = 40, className = "" }) {
  return html`<img class=${cx("zmark", className)} src=${ASSET_LOGO} width=${size} height=${size} alt="Zameen" decoding="async" />`;
}

function Brand({ compact = false }) {
  return html`<div class=${cx("login__brand", compact && "login__brand--sm")}>
    <${ZMark} size=${compact ? 38 : 46} />
    <div>
      <div class="login__name">LegalOS</div>
      <div class="login__sub">Enterprise Legal Operations · Zameen Group</div>
    </div>
  </div>`;
}

const HERO_FEATURES = [
  ["file", "Contracts & lifecycle", "The live register, renewals and expiry, all in one book."],
  ["gavel", "Litigation & disputes", "Cases, hearings and recovery tracked end to end."],
  ["shield", "Compliance & licensing", "Licences, renewals and regulatory deadlines."],
  ["inbox", "Requests & approvals", "Intake, assignment and sign-off across every department."],
];

function Hero() {
  return html`<aside class="login__hero">
    <div class="login__hero-top">
      <${ZMark} size=${46} className="login__hero-badge" />
      <div>
        <div class="login__hero-name">LegalOS</div>
        <div class="login__hero-sub">Zameen Group</div>
      </div>
    </div>
    <div class="login__hero-mid">
      <h1 class="login__hero-head">Run the legal function on one system.</h1>
      <ul class="login__hero-feats">
        ${HERO_FEATURES.map(([icon, title, desc]) => html`<li key=${title} class="login__feat">
          <span class="login__feat-ic"><${Icon} name=${icon} size=16 /></span>
          <div><div class="login__feat-t">${title}</div><div class="login__feat-d">${desc}</div></div>
        </li>`)}
      </ul>
    </div>
    <div class="login__hero-foot">
      <${Icon} name="lock" size=12 /> Secured by Cloudflare Access · ${new Date().getFullYear()} Zameen Group
    </div>
  </aside>`;
}

function RequesterCards({ busy, onEnter }) {
  const groups = CREDENTIAL_GROUPS.filter((g) => g.lane === "requester");
  return html`${groups.map((g) => html`<div key=${g.section} class="login__group">
    <div class="login__label">${g.section}</div>
    <div class="login__grid">
      ${g.people.map((pp) => {
        const u = byId(pp.id);
        return html`<button key=${pp.id} class=${cx("login__card", busy === pp.id && "busy")} onClick=${() => onEnter(pp.id)}>
          <${Avatar} name=${u.name} size="md" />
          <div class="login__meta">
            <div class="login__who">${u.name}</div>
            <div class="login__view">${pp.view}</div>
            <div class="login__role">${u.role || "Demo requester view"}</div>
          </div>
          <span class="login__go">${busy === pp.id ? html`<${Icon} name="check" size=15 />` : html`<${Icon} name="arrowRight" size=15 />`}</span>
        </button>`;
      })}
    </div>
  </div>`)}`;
}

export default function Login() {
  const door = isRequesterDoor();

  const [busy, setBusy] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(false);
  const expired = authNotice();

  // Demo requester entry — the old flow, kept as-is for now.
  const enterDemo = (id) => {
    setBusy(id);
    try { localStorage.setItem(AUTH_KEY, "1"); } catch (e) {}
    setViewAs(id);
    setTimeout(() => navigate(landingFor(byId(id))), 180);
  };

  /* WHAT HAPPENS AFTER A SUCCESSFUL SIGN-IN, whichever door it came through.
     The password path already did all of this; the Google path must do exactly
     the same or a Google user lands with an empty request queue and no
     notifications, which reads as a broken account rather than a second door. */
  const afterSignIn = (account) => {
    try { localStorage.setItem(AUTH_KEY, "1"); } catch (err) {}
    setSession({ viewAsId: account.id || "admin", account });
    try { hydrateRequests(); } catch (err) {}
    try { hydrateConfigProposals(); } catch (err) {}
    try { hydrateNotifications(); } catch (err) {}
    navigate(landingFor(activeUser()));
  };

  /* SIGN IN WITH GOOGLE.
     Drawn only when the server says a client id is configured — a button that
     cannot work is worse than no button. Google Identity Services renders it
     and hands back an ID token; the server verifies that token against
     Google's keys and then decides whether the person is on the legal roster.
     Nothing is trusted here in the browser. */
  const [google, setGoogle] = useState(null);
  const gproxy = useRef(null);      // Google's real button, hidden
  const [gready, setGready] = useState(false);
  useEffect(() => {
    let alive = true;
    api.auth.config().then((c) => alive && setGoogle((c && c.google) || { enabled: false }),
      () => alive && setGoogle({ enabled: false }));
    return () => { alive = false; };
  }, []);

  /* OUR OWN BUTTON, NOT GOOGLE'S IFRAME.
     Google's rendered button is an iframe: it cannot take this page's type,
     radius, height or green, so it always looks like something bolted on. So
     LegalOS draws the button — matching the Sign in control directly above it —
     and Google's real button is rendered into a hidden node and clicked
     programmatically. The sign-in that happens is the genuine Google flow; only
     the pixels are ours.

     The button is drawn whether or not a client id is configured, because a
     login page missing half its sign-in options looks broken. Without one it is
     visibly unavailable and says why, rather than failing when pressed. */
  useEffect(() => {
    if (!google || !google.enabled || !google.clientId || !gproxy.current) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || !window.google || !window.google.accounts || !gproxy.current) return;
      try {
        window.google.accounts.id.initialize({
          client_id: google.clientId,
          callback: async (resp) => {
            setError(""); setSigning(true);
            try {
              const r = await api.auth.google(resp.credential);
              afterSignIn(r.account);
            } catch (err) {
              setSigning(false);
              /* The server distinguishes "we could not verify you" from "you
                 are not on the legal team"; say which, because they need
                 different things done about them. */
              setError((err.payload && err.payload.detail) || err.message || "Google sign-in did not work.");
            }
          },
        });
        gproxy.current.innerHTML = "";
        window.google.accounts.id.renderButton(gproxy.current,
          { theme: "outline", size: "large", width: 320, text: "signin_with" });
        setGready(true);
      } catch (e) { setGready(false); }
    };
    if (window.google && window.google.accounts) { render(); return () => { cancelled = true; }; }
    const tag = document.createElement("script");
    tag.src = "https://accounts.google.com/gsi/client";
    tag.async = true; tag.defer = true;
    tag.onload = render;
    document.head.appendChild(tag);
    return () => { cancelled = true; };
  }, [google]);

  /* Press Google's real button on the user's behalf. Clicking the inner
     element is what actually opens the account chooser; clicking the wrapper
     does nothing. */
  const pressGoogle = () => {
    if (signing) return;
    /* WITH A CLIENT ID: press Google's real button on the user's behalf.
       Clicking the inner element is what opens the account chooser; clicking
       the wrapper does nothing. */
    if (gready) {
      const host = gproxy.current;
      if (!host) return;
      const target = host.querySelector('div[role="button"]') || host.querySelector("div > div") || host.firstElementChild;
      if (target) target.click();
      return;
    }
    /* WITHOUT ONE: the button cannot sign anybody in — Google will not issue a
       token for an application it has not registered — so rather than sit there
       dead it fills in the address and moves to the password. The password is
       still required and still verified on the server. Nothing here is a way
       past the login; it saves typing. */
    const addr = (google && google.prefillEmail) || "";
    if (addr) setEmail(addr);
    setError("");
    setTimeout(() => {
      const pw = document.querySelector('input[name="password"]');
      if (pw) pw.focus();
      else { const em = document.querySelector('input[name="email"]'); if (em) em.focus(); }
    }, 0);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (signing) return;
    setError("");
    clearAuthNotice();
    setSigning(true);
    try {
      const r = await api.auth.login(email.trim(), password);
      /* afterSignIn pulls the server-held intake queue, the config proposals
         and the notifications. At boot nobody is signed in, so those fetches
         401 and the queue stays empty; nothing re-ran them after a successful
         sign-in, and a legal user landed in the Workspace with an empty queue.
         Both doors go through it now, so they cannot drift apart. */
      afterSignIn(r.account);
    } catch (err) {
      setSigning(false);
      if (err && err.status === 401) setError("That email or password is not right.");
      else if (err && err.status === 429) setError(err.message || "Too many attempts — try again in a few minutes.");
      else if (err && err.status === 400) setError("Enter both the email and the password.");
      else setError("The sign-in service is unreachable right now — try again in a moment.");
    }
  };

  // The /portal/ door: demo requester picker on a centred card.
  if (door) {
    return html`<div class="login login--center">
      <div class="login__panel">
        <${Brand} />
        <div class="login__lead">Sign in to raise a legal request and follow it end to end. Pick the
          department you are raising for — the form, the routing and the turnaround all follow it.</div>
        <${RequesterCards} busy=${busy} onEnter=${enterDemo} />
        <div class="login__foot">
          <${Icon} name="lock" size=12 />
          <span>Requester demo views — no passwords for now. The legal team signs in with credentials at the main door.</span>
        </div>
      </div>
    </div>`;
  }

  return html`<div class="login login--split">
    <${Hero} />
    <main class="login__main">
      <div class="login__panel">
        <div class="login__mobrand"><${Brand} compact=${true} /></div>

        <div class="login__welcome">Welcome back</div>

        <div class="login__lead">Sign in with your LegalOS account. Everything follows the credential —
          navigation, queues, approvals and what each person is allowed to see. The business
          requester portal is a separate address.</div>

        ${expired && html`<div class="login__notice"><${Icon} name="clock" size=13 /> ${expired}</div>`}
        ${error && html`<div class="login__err"><${Icon} name="alertTriangle" size=13 /> ${error}</div>`}

        <form class="login__form" onSubmit=${submit}>
          <label class="login__field">
            <span class="login__flabel">Email</span>
            <input class="login__input" type="email" name="email" autocomplete="username" autoFocus
              placeholder="you@zameen.com" value=${email}
              onInput=${(e) => setEmail(e.target.value)} />
          </label>
          <label class="login__field">
            <span class="login__flabel">Password</span>
            <div class="login__pwwrap">
              <input class="login__input" type=${showPw ? "text" : "password"} name="password" autocomplete="current-password"
                placeholder="Your password" value=${password}
                onInput=${(e) => setPassword(e.target.value)} />
              <button type="button" class="login__pwtoggle" tabIndex=-1
                onClick=${() => setShowPw(!showPw)}>${showPw ? "Hide" : "Show"}</button>
            </div>
          </label>
          <button class="btn btn--primary login__submit" type="submit" disabled=${signing}>
            ${signing ? "Signing in…" : "Sign in"}
          </button>
          ${/* The second door. It sits BELOW the password form, separated, so
                the primary path stays the obvious one and this reads as an
                alternative rather than a competing prompt. It appears only
                when the server has a client id — a Google button that cannot
                complete a sign-in is worse than no button at all. */ ""}
          ${google && html`<${Fragment}>
            <div class="login__or"><span>${"or"}</span></div>
            ${/* Google's real button, rendered but never shown — pressGoogle()
                  clicks it. Kept in the layout (not display:none) because GSI
                  refuses to render into a node with no box. */ ""}
            <div class="login__gproxy" ref=${gproxy} aria-hidden="true"></div>
            <button type="button" class="gbtn" disabled=${signing}
              title=${gready ? "Sign in with your Zameen Google account"
                : "Not connected to Google yet — this fills in the address; the password is still needed"}
              onClick=${pressGoogle}>
              <span class="gbtn__mark" aria-hidden="true">
                <svg viewBox="0 0 18 18" width="18" height="18">
                  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"/>
                  <path fill="#FBBC05" d="M3.96 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z"/>
                  <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.65 3.58 9 3.58z"/>
                </svg>
              </span>
              <span class="gbtn__label">${"Sign in with Google"}</span>
            </button>
            <div class="login__ghint">
              ${gready
                ? "Legal team accounts only"
                  + (google.domains && google.domains.length ? " · " + google.domains.join(" or ") : "")
                : (google.prefillEmail
                  ? "Not connected to Google yet — this fills in " + google.prefillEmail + ", then enter the password."
                  : "Not connected to Google yet — sign in with your email and password.")}
            </div>
          </${Fragment}>`}
        </form>

        <!-- This door is the LEGAL team's. A business requester has no credential
             here, so instead of letting them dead-end on a password they will
             never have, point them at their own door. Kept as a plain link (not
             a tab) because it is a different mount, not a different view. -->
        <a class="login__alt" href="portal/#/login">
          <span class="login__alt-ic"><${Icon} name="inbox" size=15 /></span>
          <span class="login__alt-tx">
            <b>Not in the Legal team?</b>
            <span>Raise a legal request in the requester portal — no password needed.</span>
          </span>
          <${Icon} name="arrowRight" size=15 />
        </a>

        <div class="login__policy">Sessions are verified server-side and expire after 12 hours — or 60 minutes idle. Signing out ends the session immediately.</div>

        <div class="login__foot">
          <${Icon} name="lock" size=12 />
          <span>Credential sign-in, verified server-side. Forgotten password? An administrator can reset it.</span>
        </div>
      </div>
    </main>
  </div>`;
}

// The credential picker — LegalOS's front door.
//
// A demo-grade "login": every persona the system is built around is a card,
// grouped by where they sit (legal leadership, team leads, associates and
// paralegals, and the business departments). Picking one signs you in as that
// identity — nav, queues, privilege and approvals all follow — and the same
// screen is reachable any time from Sign out to cycle between views.
import { html, cx, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Avatar, Pill } from "../ui.js";
import { byId } from "../data.js";
import { setViewAs, landingFor } from "../rbac.js";
import { navigate } from "../router.js";

const AUTH_KEY = "legalos-authed";
export const isAuthed = () => {
  // Automation (headless test runs) bypasses the gate; humans sign in once.
  try { if (navigator.webdriver) return true; } catch (e) {}
  try { return localStorage.getItem(AUTH_KEY) === "1"; } catch (e) { return false; }
};
export function signOut() {
  try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
  navigate("/login");
}

/* The credential roster — label is the VIEW the user asked for; sub is the
   person's actual title so the mapping stays honest to the org. */
/* A deliberately SMALL testing roster — one credential per distinct experience,
   so a tester can cycle every behaviour in seven clicks:
   Director · one Lead per team · Associate · Paralegal · Requester.

   The roster is split into two TABS by where a credential lands, not by job
   title: `legal` credentials open the legal dashboard, `requester` credentials
   open the requester view (/raise). The flat {section, people} shape is a
   contract — the sidebar's View-As switcher flattens it, and the routing tests
   walk it — so `lane` is additive and nothing downstream needs to know about
   the tabs. */
/* The two mounts are separate front doors with separate rosters. There is no
   tab and no override: /legalos/ offers legal identities, /legalos/portal/
   offers requesters. Which lane you get is decided by the mount alone, so the
   legal mount can never present the requester view (and vice versa). */
export const LOGIN_LANES = [
  {
    key: "legal",
    label: "Legal team",
    blurb: "Opens the legal dashboard \u2014 queues, triage, approvals and the matter workspace.",
  },
  {
    key: "requester",
    label: "Requester",
    blurb: "Opens the requester view \u2014 raise a legal request and follow it end to end.",
  },
];

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
    // Department heads, one per business function. All four are rbac "bizHead",
    // so each lands on /raise and sees only its own department's requests.
    section: "Business — department heads",
    people: [
      { id: "u16", view: "Finance — CFO", tone: "gray" },
      { id: "u13", view: "Procurement — VP", tone: "gray" },
      { id: "u14", view: "HR — Head of HR", tone: "gray" },
      { id: "u15", view: "Sales & Marketing — Director", tone: "gray" },
    ],
  },
];

/* The /portal/ document is the BUSINESS front door. A requester who signs out
   there must not be offered legal identities, so that mount locks the roster to
   the requester lane and drops the tab bar entirely — sign out lands back on a
   requester-only screen because the pathname survives a hash navigation. The
   root mount keeps both tabs; that is the legal team's way in. */
export const isRequesterDoor = () => {
  try { return /\/portal\/?$/.test(window.location.pathname); } catch (e) { return false; }
};

export default function Login() {
  const [busy, setBusy] = useState(null);
  const door = isRequesterDoor();
  const laneKey = door ? "requester" : "legal";
  const groups = CREDENTIAL_GROUPS.filter((g) => g.lane === laneKey);
  const enter = (id) => {
    setBusy(id);
    try { localStorage.setItem(AUTH_KEY, "1"); } catch (e) {}
    setViewAs(id);
    // A beat so the card's pressed state reads, then land on the role's home.
    setTimeout(() => navigate(landingFor(byId(id))), 180);
  };

  return html`<div class="login">
    <div class="login__panel">
      <div class="login__brand">
        <svg class="login__logo" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0d7a3f"/><path d="M9 22V10h2.6c3 0 4.8 1.9 4.8 4.8v.2c0 2.9-1.8 4.8-4.8 4.8H11v2H9Zm9 0V10h2v10h5v2h-7Z" fill="white"/></svg>
        <div>
          <div class="login__name">LegalOS</div>
          <div class="login__sub">Enterprise Legal Operations · Zameen Group</div>
        </div>
      </div>
      <div class="login__lead">
        ${door
          ? html`Sign in to raise a legal request and follow it end to end. Pick the
              department you are raising for — the form, the routing and the turnaround
              all follow it.`
          : html`Choose an identity to sign in. Everything follows the credential — navigation,
              queues, approvals, privilege and what the requester is allowed to see.`}
      </div>

      ${groups.map((g) => html`<div key=${g.section} class="login__group">
        <div class="login__label">${g.section}</div>
        <div class="login__grid">
          ${g.people.map((pp) => {
            const u = byId(pp.id);
            if (!u) return null;
            return html`<button key=${pp.id} class=${cx("login__card", busy === pp.id && "busy")} onClick=${() => enter(pp.id)}>
              <${Avatar} name=${u.name} size="md" />
              <div class="login__meta">
                <div class="login__who">${u.name}</div>
                <div class="login__view">${pp.view}</div>
                <div class="login__role">${u.role}${u.country ? " · " + u.country : ""}</div>
              </div>
              <span class="login__go">${busy === pp.id ? html`<${Icon} name="check" size=15 />` : html`<${Icon} name="arrowRight" size=15 />`}</span>
            </button>`;
          })}
        </div>
      </div>`)}

      <div class="login__foot">
        <${Icon} name="lock" size=12 />
        <span>Demo credentials — no passwords. In production this screen is single sign-on from the official email.</span>
      </div>
    </div>
  </div>`;
}

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
   Director · one Lead per team · Associate · Paralegal · Requester. */
export const CREDENTIAL_GROUPS = [
  {
    section: "Legal — Leadership",
    people: [
      { id: "u1", view: "Director Legal", tone: "purple" },
    ],
  },
  {
    section: "Legal — Team Leads (AD / Senior Manager)",
    people: [
      { id: "u3", view: "Team Lead · Commercial & Risk", tone: "amber" },
      { id: "u6", view: "Team Lead · Litigation & Disputes", tone: "amber" },
      { id: "u20", view: "Team Lead · Compliance", tone: "amber" },
    ],
  },
  {
    section: "Legal — Team",
    people: [
      { id: "u5", view: "Legal Associate · Commercial", tone: "green" },
      { id: "u10", view: "Paralegal / Legal Executive", tone: "blue" },
    ],
  },
  {
    section: "Business (requester)",
    people: [
      { id: "u16", view: "Finance — CFO", tone: "gray" },
    ],
  },
];

export default function Login() {
  const [busy, setBusy] = useState(null);
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
          <div class="login__sub">Enterprise Legal Operations · Northwind Global Holdings</div>
        </div>
      </div>
      <div class="login__lead">
        Choose an identity to sign in. Everything follows the credential — navigation,
        queues, approvals, privilege and what the requester is allowed to see.
      </div>

      ${CREDENTIAL_GROUPS.map((g) => html`<div key=${g.section} class="login__group">
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

// SPRINT 4 — requester sign-in.
//
// Lightweight by design: email + name, plus the auto-captured SOURCE (which
// company / site / department the request is being raised from). That identifies
// who raised it and where from, and both values stamp every request and every
// chat message.
//
// // SSO / auth seam
// No password logic in the prototype. A real deployment puts SSO in front of
// this screen and takes the verified email (and usually the department) straight
// from the token — findOrCreateRequester() is then called with those claims and
// the rest of the portal is unchanged.
import { html, cx, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Field, Input, Pill } from "../ui.js";
import { findOrCreateRequester, setPortalSession, requesterByEmail } from "../store.js";
import { PORTAL_SOURCES, DEPARTMENTS, BUSINESS_UNITS } from "../data.js";

export function LoginScreen({ cfg, theme, onTheme, onSignedIn }) {
  const brand = cfg.branding || {};
  const companies = (cfg.companies || []).filter((c) => c.enabled);
  const [f, setF] = useState({
    email: "", name: "",
    company: (companies[0] || {}).key || "",
    source: PORTAL_SOURCES[0],
    department: DEPARTMENTS[0],
    unit: BUSINESS_UNITS[0],
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [errors, setErrors] = useState([]);

  // Recognise a returning requester as soon as the email matches, and pre-fill.
  const known = useMemo(() => requesterByEmail(f.email), [f.email]);
  const effective = known
    ? { ...f, name: f.name || known.name, company: f.company || known.company, department: known.department, unit: known.unit }
    : f;

  const signIn = () => {
    const res = findOrCreateRequester({
      email: effective.email,
      name: effective.name || (known && known.name),
      company: effective.company,
      source: effective.source,
      department: effective.department,
      unit: effective.unit,
    });
    if (!res.ok) { setErrors(res.errors); return; }
    setPortalSession(res.requester.id, effective.source);
    onSignedIn({ requesterId: res.requester.id, source: effective.source });
  };

  return html`<div class="plogin">
    <button class="iconbtn plogin__theme" title="Toggle theme" onClick=${() => onTheme(theme === "dark" ? "light" : "dark")}>
      <${Icon} name=${theme === "dark" ? "sun" : "moon"} size=18 />
    </button>

    <div class="plogin__card">
      <div class="plogin__brand">
        <span class="plogin__logo">${brand.logoText || "NW"}</span>
        <div style="min-width:0">
          <div class="plogin__name">${brand.name || "Legal Requests"}</div>
          <div class="plogin__tag">${brand.tagline || "Raise a legal request and follow it end to end."}</div>
        </div>
      </div>

      <div class="col" style="gap:15px">
        <${Field} label="Work email" hint="We use this to track your requests and to reach you.">
          <${Input} type="email" placeholder="you@northwind.com" value=${f.email}
            onInput=${(e) => { set("email", e.target.value); setErrors([]); }}
            onKeyDown=${(e) => { if (e.key === "Enter") signIn(); }} />
        </${Field}>

        ${known
          ? html`<div class="banner banner--info" style="padding:10px 13px">
              <${Icon} name="checkcircle" size=16 />
              <span class="tiny">Welcome back, <b>${known.name}</b> — ${known.department}${known.source ? " · " + known.source : ""}.</span>
            </div>`
          : html`<${Field} label="Your name">
              <${Input} placeholder="e.g. Ravi Menon" value=${f.name}
                onInput=${(e) => { set("name", e.target.value); setErrors([]); }}
                onKeyDown=${(e) => { if (e.key === "Enter") signIn(); }} />
            </${Field}>`}

        <div class="divider"></div>
        <div>
          <div class="fpop__lbl">Where are you raising this from?</div>
          <div class="tiny muted" style="margin-bottom:10px">
            Captured automatically with every request so legal knows the entity and site it came from.
          </div>
          <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
            <${Field} label="Company / entity">
              <select class="select" value=${f.company} onChange=${(e) => set("company", e.target.value)}>
                ${companies.map((c) => html`<option key=${c.key} value=${c.key}>${c.label}</option>`)}
              </select>
            </${Field}>
            <${Field} label="Site / office">
              <select class="select" value=${f.source} onChange=${(e) => set("source", e.target.value)}>
                ${PORTAL_SOURCES.map((s) => html`<option key=${s}>${s}</option>`)}
              </select>
            </${Field}>
            ${!known && html`<${Field} label="Your department">
              <select class="select" value=${f.department} onChange=${(e) => set("department", e.target.value)}>
                ${DEPARTMENTS.map((d) => html`<option key=${d}>${d}</option>`)}
              </select>
            </${Field}>`}
            ${!known && html`<${Field} label="Business unit">
              <select class="select" value=${f.unit} onChange=${(e) => set("unit", e.target.value)}>
                ${BUSINESS_UNITS.map((b) => html`<option key=${b}>${b}</option>`)}
              </select>
            </${Field}>`}
          </div>
        </div>

        ${errors.length > 0 && html`<div class="banner banner--warn" style="padding:10px 13px">
          <${Icon} name="alertCircle" size=16 /><span class="tiny">${errors.join(" · ")}</span>
        </div>`}

        <${Btn} variant="primary" size="lg" iconRight="arrowRight" onClick=${signIn}>Continue</${Btn}>

        <div class="tiny muted" style="text-align:center;line-height:1.6">
          Single sign-on will replace this screen in production — your email would come
          straight from your corporate identity.
        </div>
      </div>
    </div>

    <div class="plogin__foot">
      <span class="tiny muted">Requests raised here appear in the legal department's queue immediately.</span>
    </div>
  </div>`;
}

export default LoginScreen;

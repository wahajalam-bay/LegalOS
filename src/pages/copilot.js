// AI Copilot — full workspace.
import { html, cx, useState, useEffect, useRef } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill } from "../ui.js";

const CAPS = [
  { icon: "file", t: "Draft & generate", d: "NDAs, MSAs, SOWs from templates", color: "#0d7a3f" },
  { icon: "scan", t: "Review contracts", d: "Extract terms, flag risk, find gaps", color: "#0891b2" },
  { icon: "gitbranch", t: "Compare versions", d: "Word-level redline diffs", color: "#1d6cb0" },
  { icon: "shield", t: "Assess risk", d: "Score clauses against playbook", color: "#f59e0b" },
  { icon: "library", t: "Search knowledge", d: "Precedents, clauses, past deals", color: "#22c55e" },
  { icon: "users", t: "Recommend actions", d: "Approvers, owners, next steps", color: "#8b5cf6" },
];
const PROMPTS = [
  "Summarize everything that needs my attention today",
  "Which contracts are auto-renewing in the next 30 days?",
  "Draft a mutual NDA for a UAE counterparty",
  "Compare the AWS MSA against our standard playbook",
  "What's our total exposure across open litigation?",
  "Recommend an approver for the Neom Solar PPA",
];
const CANNED = [
  { q: /renew|expir/i, a: "**23 contracts** expire within 30 days. Three will auto-renew unless you opt out:\n\n• **Salesforce** — $2.2M · opt-out closes in 5 days\n• **Oracle NetSuite** — $1.35M · opt-out in 28 days\n• **Adobe CC** — $290K · opt-out in 12 days\n\nCombined uplift on auto-renewal is **+$310K**. Want me to draft opt-out notices for all three?" },
  { q: /attention|today|summar/i, a: "Here's your priority read for today:\n\n1. **Neom Solar PPA** (critical) — counterparty redlines v3 landed; change-in-law clause needs your escalation before the call.\n2. **2 reviews breaching SLA** — ACWA PPA and STC exclusivity terms.\n3. **12 approvals pending** — 2 are high-value (Neom term sheet, DHL framework).\n4. **Export Controls compliance** dropped to Non-Compliant (58/100).\n\nTAT is down to 3.4 days — best in 12 months." },
  { q: /nda/i, a: "I'll generate a **Mutual NDA** from template T-01 (v4.2). For a UAE counterparty I'll insert:\n\n• Governing law: **DIFC / English law**\n• Confidentiality term: **3 years**\n• Dispute resolution: **DIFC-LCIA arbitration**\n\nShall I pre-fill the counterparty details and send it to your drafts?" },
  { q: /litigation|exposure/i, a: "Open litigation exposure totals **~$8.6M** across 6 active matters. Largest:\n\n• Falcon Contractors dispute — SAR 4.2M (Discovery)\n• IBM termination claim — $2.8M (Mediation)\n• Data protection inquiry (SG) — $900K\n\nThe IBM matter has a settlement window closing in 9 days." },
];
function respond(t) {
  const hit = CANNED.find((c) => c.q.test(t));
  return hit ? hit.a : "I can help with that. I have live context across your 1,284 contracts, 12 open matters, clause library and playbooks. I can draft, review, compare, assess risk, or recommend the next action — just say the word.";
}
function render(t) {
  return t.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => p.startsWith("**") ? html`<b key=${j}>${p.slice(2, -2)}</b>` : p);
    return html`<div key=${i} style=${line.trim() === "" ? "height:8px" : "margin-bottom:2px"}>${parts}</div>`;
  });
}

export default function Copilot() {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const scRef = useRef(null);
  useEffect(() => { if (scRef.current) scRef.current.scrollTop = scRef.current.scrollHeight; }, [msgs]);
  const send = (text) => {
    const t = (text || input).trim();
    if (!t) return;
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setTimeout(() => setMsgs((m) => [...m, { role: "ai", text: respond(t) }]), 500);
  };
  const started = msgs.length > 0;

  return html`<div class="page page--wide fade-in" style="height:calc(100vh - 60px);display:flex;flex-direction:column;padding-bottom:20px">
    <div class="grid" style="grid-template-columns:300px 1fr;gap:20px;flex:1;min-height:0">
      <div class="col" style="gap:16px;overflow-y:auto">
        <div class="ai-card"><div class="ai-card__inner">
          <div class="row" style="gap:10px;margin-bottom:8px">
            <div class="metric__icon" style="background:linear-gradient(135deg,#0d7a3f,#0891b2);color:#fff"><${Icon} name="sparkles" size=18 /></div>
            <div><div class="strong">Legal Copilot</div><div class="tiny muted">GPT-class · your data only</div></div>
          </div>
          <div class="tiny dim">Grounded on 1,284 contracts, 12 matters, 14 clauses and your playbooks. Nothing leaves your tenant.</div>
        </div></div>
        <div class="card card--pad col" style="gap:8px">
          <span class="strong tiny" style="text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)">Capabilities</span>
          ${CAPS.map((c) => html`<div key=${c.t} class="row clickable" style="gap:10px;padding:6px 4px" onClick=${() => send(c.t)}>
            <div class="notif__ico" style=${`width:32px;height:32px;background:${c.color}1a;color:${c.color}`}><${Icon} name=${c.icon} size=16 /></div>
            <div style="min-width:0"><div class="strong tiny">${c.t}</div><div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.d}</div></div>
          </div>`)}
        </div>
      </div>

      <div class="card" style="display:flex;flex-direction:column;min-height:0">
        <div class="chat" ref=${scRef} style="flex:1">
          ${!started ? html`<div class="col center" style="flex:1;text-align:center;gap:20px;padding:20px">
            <div class="metric__icon" style="width:60px;height:60px;border-radius:18px;background:linear-gradient(135deg,#0d7a3f,#0891b2);color:#fff"><${Icon} name="sparkles" size=28 /></div>
            <div><div style="font-size:22px;font-weight:750;letter-spacing:-.02em">How can I help, Maryam?</div><div class="muted" style="margin-top:6px">Ask about your matters, contracts, risk or compliance — or start a task.</div></div>
            <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;max-width:620px;width:100%;margin-top:6px">
              ${PROMPTS.map((p) => html`<button key=${p} class="card card--hover card--pad" style="text-align:left;font-size:13px;font-weight:500;cursor:pointer" onClick=${() => send(p)}>
                <${Icon} name="sparkles" size=14 style=${{ color: "var(--accent-500)", display: "inline", verticalAlign: "-2px", marginRight: "8px" }} />${p}
              </button>`)}
            </div>
          </div>` : msgs.map((m, i) => html`<div key=${i} class=${cx("msg", `msg--${m.role}`)} style="max-width:74%">
            ${m.role === "ai" && html`<div class="metric__icon" style="width:30px;height:30px;flex:none;background:var(--accent-soft);color:var(--accent-500)"><${Icon} name="sparkles" size=15 /></div>`}
            <div class="msg__bubble" style="font-size:13.5px">${render(m.text)}</div>
          </div>`)}
        </div>
        <div class="chat__input" style="padding:14px 16px">
          <textarea class="textarea" rows=1 placeholder="Message Legal Copilot…" style="min-height:42px;max-height:140px" value=${input}
            onInput=${(e) => setInput(e.target.value)}
            onKeyDown=${(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}></textarea>
          <${Btn} variant="primary" icon="send" onClick=${() => send()}>Send</${Btn}>
        </div>
      </div>
    </div>
  </div>`;
}

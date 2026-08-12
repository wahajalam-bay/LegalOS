// Negotiations — redline workspace.
import { html, cx, fmt, useState, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Risk, Pill, Status, Tabs, Modal, Field, Input, Timeline, AICard, Comment, Section } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { nameOf } from "../data.js";
import { useCollection, updateItem } from "../store.js";

const ROUNDS = { "CTR-1186": 2, "CTR-1185": 3, "CTR-1184": 4 };
const roundCount = (d) => (d.rounds && d.rounds.length) || ROUNDS[d.id] || 0;

/* ---- Feature 4: history tab + log-round ---- */
function RoundRow({ r, counterparty }) {
  const [open, setOpen] = useState(false);
  const sent = r.direction === "sent";
  return html`<div class="card card--pad col" style="gap:8px">
    <div class="row clickable" style="gap:10px" onClick=${() => setOpen((o) => !o)}>
      <div class="notif__ico" style=${`width:32px;height:32px;background:${sent ? "var(--brand-soft)" : "var(--warning-bg)"};color:${sent ? "var(--brand)" : "var(--warning)"}`}><${Icon} name="gitbranch" size=15 /></div>
      <div style="flex:1;min-width:0"><div class="strong tiny">Round ${r.round} · ${r.versionLabel}</div><div class="tiny muted">${sent ? "Sent by us · " + nameOf(r.by) : "Received from " + (r.by || counterparty)} · ${fmt.date(r.date)}</div></div>
      <${Pill} tone=${sent ? "blue" : "amber"}>${sent ? "Sent" : "Received"}</${Pill}>
      <${Icon} name=${open ? "chevronUp" : "chevronDown"} size=16 style=${{ color: "var(--text-3)" }} />
    </div>
    ${open && html`<div class="col" style="gap:8px;padding-left:42px">
      <div class="tiny" style="line-height:1.5">${r.summary}</div>
      ${(r.clausesChanged || []).map((ch, i) => html`<div key=${i} class="row wrap" style="gap:8px;align-items:flex-start">
        <span class="tiny strong" style="width:150px;flex:none;color:var(--brand)">${ch.clause}</span>
        <span class="clause-risk tiny">${ch.from || "—"}</span>
        <${Icon} name="arrowRight" size=13 style=${{ color: "var(--text-3)", flex: "none", marginTop: "2px" }} />
        <span class="clause-hl tiny">${ch.to || "—"}</span>
        ${ch.fallbackLevel ? html`<${Pill} tone="red">${ch.fallbackLevel}</${Pill}>` : ""}
      </div>`)}
      ${r.attachmentName ? html`<div class="tiny muted"><${Icon} name="paperclip" size=12 style=${{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />${r.attachmentName}</div>` : ""}
    </div>`}
  </div>`;
}

function NegHistory({ deal }) {
  const rounds = [...(deal.rounds || [])].sort((a, b) => b.round - a.round);
  if (!rounds.length) return html`<div class="empty" style="padding:40px"><${Icon} name="layers" size=36 /><div>No rounds logged yet. Use "Log round" to record the first exchange.</div></div>`;
  return html`<${Section} title="Negotiation history" icon="layers" sub=${rounds.length + " rounds · newest first"} bodyClass="col">
    ${rounds.map((r) => html`<${RoundRow} key=${r.id} r=${r} counterparty=${deal.counterparty} />`)}
  </${Section}>`;
}

function LogRoundModal({ deal, onClose }) {
  const existing = deal.rounds || [];
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), direction: "received", versionLabel: "", summary: "" });
  const [changes, setChanges] = useState([{ clause: "", from: "", to: "" }]);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setChange = (i, k, v) => setChanges((cs) => cs.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)));
  const submit = () => {
    const round = existing.length + 1;
    const cc = changes.filter((c) => c.clause.trim());
    const entry = {
      id: deal.id + "-R" + round + "-" + Date.now().toString().slice(-4), round,
      date: new Date(f.date + "T00:00:00").toISOString(), direction: f.direction,
      versionLabel: f.versionLabel.trim() || "v" + round + " — " + (f.direction === "sent" ? "our draft" : "counterparty redline"),
      summary: f.summary.trim() || "Round logged.", clausesChanged: cc,
      by: f.direction === "sent" ? "u1" : deal.counterparty, attachmentName: null,
    };
    updateItem("contracts", deal.id, { rounds: [...existing, entry] });
    onClose();
  };
  return html`<${Modal} title="Log negotiation round" icon="gitbranch" width=${580} onClose=${onClose}
    footer=${html`<${Btn} variant="ghost" onClick=${onClose}>Cancel</${Btn}><${Btn} variant="primary" icon="check" onClick=${submit}>Log round ${existing.length + 1}</${Btn}>`}>
    <div class="col" style="gap:16px">
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
        <${Field} label="Date"><${Input} type="date" value=${f.date} onInput=${(e) => set("date", e.target.value)} /></${Field}>
        <${Field} label="Direction"><select class="select" value=${f.direction} onChange=${(e) => set("direction", e.target.value)}><option value="received">Received (from counterparty)</option><option value="sent">Sent (our position)</option></select></${Field}>
      </div>
      <${Field} label="Version label"><${Input} placeholder=${"e.g. v" + (existing.length + 1) + " — their redline"} value=${f.versionLabel} onInput=${(e) => set("versionLabel", e.target.value)} /></${Field}>
      <${Field} label="Summary"><textarea class="textarea" rows=2 placeholder="What changed this round?" value=${f.summary} onInput=${(e) => set("summary", e.target.value)}></textarea></${Field}>
      <div>
        <div class="row" style="margin-bottom:8px"><span class="strong tiny" style="text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)">Clause changes (optional)</span><div class="spacer"></div><button class="tiny" style="color:var(--brand);font-weight:600" onClick=${() => setChanges((cs) => [...cs, { clause: "", from: "", to: "" }])}>+ Add row</button></div>
        <div class="col" style="gap:8px">
          ${changes.map((c, i) => html`<div key=${i} class="grid" style="grid-template-columns:1fr 1fr 1fr;gap:8px">
            <${Input} placeholder="Clause" value=${c.clause} onInput=${(e) => setChange(i, "clause", e.target.value)} />
            <${Input} placeholder="From" value=${c.from} onInput=${(e) => setChange(i, "from", e.target.value)} />
            <${Input} placeholder="To" value=${c.to} onInput=${(e) => setChange(i, "to", e.target.value)} />
          </div>`)}
        </div>
      </div>
    </div>
  </${Modal}>`;
}

const REDLINES = {
  ours: [
    { c: "Limitation of Liability", t: "Aggregate liability capped at ", hl: "1× fees paid in the prior 12 months", after: ", with a supercap of 2× for data-breach claims." },
    { c: "Change in Law", t: "Pricing ", hl: "adjusts only for changes in law after the Effective Date", after: ", subject to good-faith renegotiation." },
    { c: "Termination", t: "Either party may terminate ", hl: "for convenience on 90 days' notice", after: "." },
  ],
  theirs: [
    { c: "Limitation of Liability", t: "Aggregate liability capped at ", risk: "0.5× fees paid in the prior 12 months", after: "; no data-breach supercap." },
    { c: "Change in Law", t: "Customer ", risk: "bears all cost of any change in law", after: " over the 25-year term." },
    { c: "Termination", t: "Termination for convenience ", risk: "only after year 5, on 180 days' notice", after: "." },
  ],
};

export default function Negotiations() {
  const deals = useCollection("contracts").filter((c) => c.status === "In Negotiation");
  const [sel, setSel] = useState(deals[0] ? deals[0].id : null);
  const deal = deals.find((d) => d.id === sel) || deals[0];
  const [comment, setComment] = useState("");
  const [tab, setTab] = useState("workspace");
  const [logOpen, setLogOpen] = useState(false);
  const totalVal = deals.reduce((s, d) => s + (d.currency === "USD" ? d.value : d.value * 0.27), 0);

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Negotiations" sub="Track counterparty redlines, compare versions and close the gap — with AI-suggested positions." />
    <${StatStrip} stats=${[
      { value: deals.length, label: "Active negotiations" },
      { value: "3.2", label: "Avg. rounds" },
      { value: 4, label: "In your court", trend: "▲", trendDir: "up" },
      { value: fmt.money(totalVal), label: "Value under negotiation" },
    ]} />

    <div class="grid" style="grid-template-columns:320px 1fr;align-items:start">
      <div class="col" style="gap:10px">
        ${deals.map((d) => html`<div key=${d.id} class=${cx("card card--pad card--hover clickable")} style=${`border-color:${sel === d.id ? "var(--brand)" : ""}`} onClick=${() => setSel(d.id)}>
          <div class="row" style="margin-bottom:8px"><span class="mono tiny muted">${d.id}</span><div class="spacer"></div><${Pill} tone="amber">Round ${roundCount(d)}</${Pill}></div>
          <div class="panel__title" style="line-height:1.35;margin-bottom:8px">${d.title}</div>
          <div class="row"><span class="tiny muted">${d.counterparty}</span><div class="spacer"></div><span class="tiny strong">${fmt.money(d.value, d.currency)}</span></div>
          <div class="row" style="gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)"><${Avatar} name=${nameOf(d.owner)} size="sm" /><span class="tiny muted">${nameOf(d.owner).split(" ")[0]}</span><div class="spacer"></div><${Risk} level=${d.risk} /></div>
        </div>`)}
      </div>

      ${deal && html`<div class="col" style="gap:16px">
        <div class="row wrap" style="gap:8px">
          <div><div class="pagehead__title" style="font-size:19px">${deal.title}</div><div class="tiny muted" style="margin-top:3px">${deal.counterparty} · ${deal.jurisdiction} · ${fmt.moneyFull(deal.value, deal.currency)}</div></div>
          <div class="spacer"></div>
          <${Pill} tone="amber">Round ${roundCount(deal)} · with counterparty</${Pill}>
          <${Status} value=${deal.status} />
          <${Btn} variant="ghost" icon="gitbranch" style="margin-left:8px" onClick=${() => setLogOpen(true)}>Log round</${Btn}>
          <${Btn} variant="primary" icon="send" style="margin-left:6px">Send counter</${Btn}>
        </div>
        <${Tabs} active=${tab} onChange=${setTab} tabs=${[{ key: "workspace", label: "Workspace", icon: "columns" }, { key: "history", label: "History", icon: "layers", count: roundCount(deal) }]} />
        ${logOpen && html`<${LogRoundModal} deal=${deal} onClose=${() => setLogOpen(false)} />`}

        ${tab === "history" && html`<${NegHistory} deal=${deal} />`}
        ${tab === "workspace" && html`<${Fragment}>

        <${Section} title="Redline comparison" icon="gitbranch" sub=${"Round " + roundCount(deal) + " · 3 clauses in disagreement"}>
          <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
            <div class="col" style="gap:12px">
              <div class="row" style="gap:8px"><${Avatar} name="Northwind Legal" color="#0d7a3f" size="sm" /><span class="strong tiny">Our position</span></div>
              ${REDLINES.ours.map((r, i) => html`<div key=${i} style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px">
                <div class="tiny strong" style="margin-bottom:6px;color:var(--brand)">${r.c}</div>
                <div class="tiny" style="line-height:1.6">${r.t}<span class="clause-hl">${r.hl}</span>${r.after}</div>
              </div>`)}
            </div>
            <div class="col" style="gap:12px">
              <div class="row" style="gap:8px"><${Avatar} name=${deal.counterparty} size="sm" /><span class="strong tiny">${deal.counterparty}</span></div>
              ${REDLINES.theirs.map((r, i) => html`<div key=${i} style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px">
                <div class="tiny strong" style="margin-bottom:6px;color:var(--danger)">${r.c}</div>
                <div class="tiny" style="line-height:1.6">${r.t}<span class="clause-risk">${r.risk}</span>${r.after}</div>
              </div>`)}
            </div>
          </div>
        </${Section}>

        <div class="grid" style="grid-template-columns:1fr 1fr">
          <${Section} title="Version history" icon="layers" bodyClass="col">
            ${[{ v: "v3.0", w: deal.owner, t: "counterparty redlines", when: "Today", tone: "amber" }, { v: "v2.0", w: "u11", t: "our counter", when: "3 days ago", tone: "blue" }, { v: "v1.0", w: deal.owner, t: "initial draft", when: "11 days ago", tone: "gray" }].map((v) => html`<div key=${v.v} class="feed__item" style="align-items:center">
              <div class="notif__ico" style="width:32px;height:32px;background:var(--surface-3);color:var(--text-2)"><${Icon} name="gitbranch" size=15 /></div>
              <div style="flex:1"><div class="strong tiny">${v.v} · ${v.t}</div><div class="tiny muted">${nameOf(v.w)} · ${v.when}</div></div>
              <${Btn} variant="ghost" size="sm">Compare</${Btn}>
            </div>`)}
          </${Section}>
          <${AICard} title="Suggested response">Hold firm on the <b>1× liability cap</b> — 82% of comparable deals settled here. Offer to concede the <b>180-day termination notice</b> as a trade. The <b>change-in-law</b> allocation is the real risk on a 25-year term; propose a shared-cost mechanism above a threshold.</${AICard}>
        </div>

        <${Section} title="Discussion" icon="message" bodyClass="col">
          <${Comment} author=${nameOf(deal.owner)} time="2h ago" text="Their liability position is a non-starter. Countering at 1× with a data-breach supercap." />
          <${Comment} author="Layla Al-Rashid" time="1h ago" text="Agreed. Trade the termination notice period if you must, but the change-in-law clause needs a cost-sharing cap." />
          <div class="row" style="gap:10px;margin-top:10px;align-items:flex-end">
            <${Avatar} name="Layla Al-Rashid" size="md" />
            <textarea class="textarea" rows=1 placeholder="Add a comment…" style="min-height:38px" value=${comment} onInput=${(e) => setComment(e.target.value)}></textarea>
            <${Btn} variant="primary" icon="send" onClick=${() => setComment("")} />
          </div>
        </${Section}>
        </${Fragment}>`}
      </div>`}
    </div>
  </div>`;
}

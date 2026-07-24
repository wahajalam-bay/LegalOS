// Workflow Builder — node-based automation canvas.
import { html, cx, useState, useRef, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Toggle, Field, Input } from "../ui.js";
import { PageHead } from "../parts.js";

const NODE_TYPES = [
  { type: "trigger", label: "Trigger", icon: "zap", color: "#0d7a3f", desc: "New request submitted" },
  { type: "condition", label: "Condition", icon: "gitbranch", color: "#6d28d9", desc: "Branch on a field" },
  { type: "ai", label: "AI Action", icon: "sparkles", color: "#0e7490", desc: "Draft / review / score" },
  { type: "document", label: "Generate Doc", icon: "file", color: "#1d6cb0", desc: "From template" },
  { type: "approval", label: "Approval", icon: "checksquare", color: "#f59e0b", desc: "Route for sign-off" },
  { type: "assignment", label: "Assign", icon: "user", color: "#22c55e", desc: "Owner / team" },
  { type: "notification", label: "Notify", icon: "bell", color: "#ec4899", desc: "Email / Slack" },
  { type: "delay", label: "Delay / SLA", icon: "clock", color: "#64748b", desc: "Wait or escalate" },
  { type: "escalation", label: "Escalate", icon: "flag", color: "#ef4444", desc: "On breach" },
  { type: "webhook", label: "Webhook", icon: "share", color: "#0891b2", desc: "External system" },
];
const TYPE = Object.fromEntries(NODE_TYPES.map((n) => [n.type, n]));

const INIT_NODES = [
  { id: "n1", type: "trigger", x: 40, y: 60, title: "Vendor Agreement requested", sub: "Intake form submitted" },
  { id: "n2", type: "ai", x: 320, y: 60, title: "AI risk pre-score", sub: "Score & summarize" },
  { id: "n3", type: "condition", x: 600, y: 60, title: "Value > $1M?", sub: "Route by contract value" },
  { id: "n4", type: "document", x: 320, y: 250, title: "Generate from template", sub: "Vendor Agreement v5.0" },
  { id: "n5", type: "approval", x: 880, y: 20, title: "CFO approval", sub: "High-value deals" },
  { id: "n6", type: "approval", x: 880, y: 170, title: "Legal Director approval", sub: "Standard route" },
  { id: "n7", type: "notification", x: 620, y: 300, title: "Notify requester", sub: "Draft ready for review" },
];
const EDGES = [["n1", "n2"], ["n2", "n3"], ["n3", "n5"], ["n3", "n6"], ["n2", "n4"], ["n4", "n7"]];
const W = 232, H = 74;

export default function Automation() {
  const [nodes, setNodes] = useState(INIT_NODES);
  const [sel, setSel] = useState("n3");
  const [live, setLive] = useState(false);
  const drag = useRef(null);
  const canvasRef = useRef(null);

  const onDown = (e, id) => {
    const n = nodes.find((x) => x.id === id);
    drag.current = { id, ox: e.clientX - n.x, oy: e.clientY - n.y };
    setSel(id);
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const { id, ox, oy } = drag.current;
    setNodes((ns) => ns.map((n) => n.id === id ? { ...n, x: Math.max(0, e.clientX - ox), y: Math.max(0, e.clientY - oy) } : n));
  };
  const onUp = () => { drag.current = null; };

  const center = (n) => ({ x: n.x + W / 2, y: n.y + H / 2 });
  const nodeById = (id) => nodes.find((n) => n.id === id);
  const selNode = nodeById(sel);

  return html`<div class="page page--wide fade-in" style="padding-bottom:20px">
    <${PageHead} title="Workflow Builder" sub="Automate any legal process — no code. Triggers, conditions, AI, approvals and SLAs."
      actions=${html`
        <div class="row" style="gap:8px;margin-right:6px"><span class="tiny muted">Live</span><${Toggle} on=${live} onChange=${setLive} /></div>
        <${Btn} variant="ghost" icon="play">Test run</${Btn}>
        <${Btn} variant="primary" icon="save">Publish</${Btn}>`} />

    <div class="row" style="gap:8px;margin-bottom:14px">
      <${Pill} tone="blue" dot=${true}>Vendor Onboarding — Auto-route</${Pill}>
      <span class="tiny muted">7 nodes · ${EDGES.length} connections · ${live ? "running" : "draft"}</span>
    </div>

    <div class="grid" style="grid-template-columns:196px 1fr 300px;gap:16px;align-items:start">
      <div class="card card--pad col" style="gap:6px;position:sticky;top:16px">
        <span class="tiny strong" style="text-transform:uppercase;letter-spacing:.05em;color:var(--text-3);margin-bottom:2px">Nodes</span>
        ${NODE_TYPES.map((t) => html`<div key=${t.type} class="row clickable" draggable=${true} style="gap:9px;padding:7px 8px;border-radius:8px;border:1px solid var(--border)"
          onClick=${() => {
            const nn = { id: "n" + (nodes.length + 1) + Date.now().toString().slice(-3), type: t.type, x: 120, y: 120, title: t.label, sub: t.desc };
            setNodes((ns) => [...ns, nn]); setSel(nn.id);
          }}>
          <div class="notif__ico" style=${`width:28px;height:28px;background:${t.color}1a;color:${t.color}`}><${Icon} name=${t.icon} size=15 /></div>
          <span class="tiny strong">${t.label}</span>
        </div>`)}
      </div>

      <div class="card" ref=${canvasRef} onMouseMove=${onMove} onMouseUp=${onUp} onMouseLeave=${onUp}
        style="height:560px;overflow:auto;position:relative;background-image:radial-gradient(var(--border) 1px, transparent 1px);background-size:22px 22px;cursor:default">
        <div style="position:relative;width:1200px;height:520px">
          <svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible">
            ${EDGES.map(([a, b]) => {
              const na = nodeById(a), nb = nodeById(b);
              if (!na || !nb) return null;
              const p1 = { x: na.x + W, y: na.y + H / 2 };
              const p2 = { x: nb.x, y: nb.y + H / 2 };
              const mx = (p1.x + p2.x) / 2;
              return html`<path key=${a + b} d=${`M ${p1.x} ${p1.y} C ${mx} ${p1.y} ${mx} ${p2.y} ${p2.x} ${p2.y}`} fill="none" stroke="var(--border-strong)" stroke-width="2" marker-end="url(#arrow)" />`;
            })}
            <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="var(--border-strong)" /></marker></defs>
          </svg>
          ${nodes.map((n) => {
            const t = TYPE[n.type];
            return html`<div key=${n.id} onMouseDown=${(e) => onDown(e, n.id)} onClick=${() => setSel(n.id)}
              style=${`position:absolute;left:${n.x}px;top:${n.y}px;width:${W}px;background:var(--surface);border:1.5px solid ${sel === n.id ? t.color : "var(--border)"};border-radius:12px;box-shadow:${sel === n.id ? "var(--shadow-md)" : "var(--shadow-xs)"};cursor:grab;user-select:none`}>
              <div class="row" style=${`gap:9px;padding:10px 12px;border-bottom:1px solid var(--border)`}>
                <div class="notif__ico" style=${`width:28px;height:28px;background:${t.color}1a;color:${t.color}`}><${Icon} name=${t.icon} size=15 /></div>
                <div style="min-width:0"><div class="strong tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${n.title}</div><div class="tiny muted">${t.label}</div></div>
              </div>
              <div class="tiny muted" style="padding:8px 12px">${n.sub}</div>
            </div>`;
          })}
        </div>
      </div>

      <div class="card card--pad col" style="gap:14px;position:sticky;top:16px">
        ${selNode ? html`<${Fragment}>
          <div class="row" style="gap:9px">
            <div class="notif__ico" style=${`width:34px;height:34px;background:${TYPE[selNode.type].color}1a;color:${TYPE[selNode.type].color}`}><${Icon} name=${TYPE[selNode.type].icon} size=17 /></div>
            <div><div class="strong">${TYPE[selNode.type].label}</div><div class="tiny muted">${selNode.id}</div></div>
          </div>
          <${Field} label="Node title"><${Input} value=${selNode.title} onInput=${(e) => setNodes((ns) => ns.map((n) => n.id === sel ? { ...n, title: e.target.value } : n))} /></${Field}>
          ${selNode.type === "condition" && html`<div class="col" style="gap:10px">
            <${Field} label="Field"><select class="select"><option>Contract value</option><option>Risk score</option><option>Business unit</option><option>Country</option></select></${Field}>
            <${Field} label="Operator"><select class="select"><option>is greater than</option><option>equals</option><option>contains</option></select></${Field}>
            <${Field} label="Value"><${Input} value="1,000,000" /></${Field}>
          </div>`}
          ${selNode.type === "approval" && html`<div class="col" style="gap:10px">
            <${Field} label="Approver role"><select class="select"><option>CFO</option><option>General Counsel</option><option>Legal Director</option><option>VP Procurement</option></select></${Field}>
            <${Field} label="SLA (hours)"><${Input} value="12" /></${Field}>
            <div class="row"><span class="tiny dim" style="flex:1">Escalate on breach</span><${Toggle} on=${true} onChange=${() => {}} /></div>
          </div>`}
          ${selNode.type === "ai" && html`<div class="col" style="gap:10px">
            <${Field} label="AI action"><select class="select"><option>Risk pre-score</option><option>Summarize</option><option>Extract terms</option><option>Suggest clauses</option></select></${Field}>
            <div class="banner banner--info" style="font-size:12px"><${Icon} name="sparkles" size=15 />Runs on your tenant model. Avg. 4s.</div>
          </div>`}
          ${!["condition", "approval", "ai"].includes(selNode.type) && html`<${Field} label="Description"><${Input} value=${selNode.sub} onInput=${(e) => setNodes((ns) => ns.map((n) => n.id === sel ? { ...n, sub: e.target.value } : n))} /></${Field}>`}
          <div class="divider"></div>
          <${Btn} variant="ghost" size="sm" icon="trash" onClick=${() => { setNodes((ns) => ns.filter((n) => n.id !== sel)); setSel(null); }}>Delete node</${Btn}>
        </${Fragment}>` : html`<div class="empty" style="padding:30px 10px"><${Icon} name="workflow" size=34 /><div>Select a node to configure it.</div></div>`}
      </div>
    </div>
  </div>`;
}

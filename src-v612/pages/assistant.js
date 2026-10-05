/* THE ASSISTANT.
 *
 * Claude, answering questions about the registers this account can already
 * open. It runs on the organisation's own Claude plan through the CLI, not on a
 * metered API key.
 *
 * WHAT THIS SCREEN HAS TO BE HONEST ABOUT, because a confident paragraph is
 * exactly the thing a person will act on:
 *
 *   SCOPE      the answer is drawn only from registers this user may read. A
 *              Compliance-only account gets compliance answers; contracts were
 *              never in the payload, so no phrasing of the question reaches
 *              them.
 *   SAMPLE     the model sees a slice of each register, not all of it. The true
 *              size travels with the sample and is shown here, so "357
 *              matters" is never quietly replaced by "120".
 *   NO TEXT    the contents of documents are not sent. This answers "which
 *              leases expire in March"; it cannot answer "what does clause 7
 *              say", and the screen says so rather than letting someone
 *              discover it by being misled once.
 */
import { html, cx, useState, useEffect, useRef } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Section, Input } from "../ui.js";
import { PageHead } from "../parts.js";
import { api } from "../api.js";

const SUGGESTIONS = [
  "Which contracts have no agreement date recorded?",
  "How many litigation matters are open, and in which courts?",
  "List the loans by lender and currency.",
  "Which projects have the most documents attached?",
  "Summarise the licences and their issuing authorities.",
];

export default function Assistant() {
  const [status, setStatus] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState([]);
  const endRef = useRef(null);

  useEffect(() => { api.assistant.status().then(setStatus).catch(() => setStatus({ installed: false })); }, []);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns.length, busy]);

  const send = async (text) => {
    const question = String(text == null ? q : text).trim();
    if (!question || busy) return;
    setQ("");
    setTurns((t) => [...t, { role: "you", text: question }]);
    setBusy(true);
    try {
      const r = await api.assistant.ask(question);
      setTurns((t) => [...t, r.ok
        ? { role: "claude", text: r.answer, considered: r.considered, totals: r.registerTotals, partial: r.partial, redactions: r.redactions }
        : { role: "error", text: r.error || "The assistant could not answer." }]);
    } catch (e) {
      setTurns((t) => [...t, { role: "error", text: (e && e.message) || "The assistant is unavailable." }]);
    } finally { setBusy(false); }
  };

  const offline = status && (!status.installed || !status.signedIn);

  return html`<div class="page fade-in">
    <${PageHead} title="Assistant"
      sub="Ask about your registers. Answers come from record facts — never from the contents of documents." />

    ${offline && html`<${Section} title="Not connected" icon="alertTriangle">
      <div class="tiny">
        ${!status.installed
    ? "The Claude CLI is not installed on the server."
    : "The server has no Claude credentials. Sign in once as the service user (" + (status.serviceUser || "the service account") + ") by running `claude` on the server."}
      </div>
    </${Section}>`}

    <div class="row wrap" style="gap:8px;align-items:center;margin-bottom:12px">
      <${Pill} tone=${offline ? "red" : "green"}>${offline ? "Offline" : "On your Claude plan"}</${Pill}>
      <${Pill} tone="gray" title="The bodies of agreements are never transmitted. Ask about records, dates, parties and counts.">Structured facts only</${Pill}>
      <${Pill} tone="gray" title="Answers are drawn only from registers your permissions already allow.">Scoped to your access</${Pill}>
    </div>

    <div class="col" style="gap:10px;max-width:900px">
      ${turns.length === 0 && html`<div class="col" style="gap:8px">
        <div class="tiny muted">Try one of these:</div>
        <div class="row wrap" style="gap:6px">
          ${SUGGESTIONS.map((s) => html`<button key=${s} class="chip" style="cursor:pointer" onClick=${() => send(s)}>${s}</button>`)}
        </div>
      </div>`}

      ${turns.map((t, i) => html`<div key=${i} class=${cx("feed__item")} style="align-items:flex-start">
        <div class="notif__ico" style=${"width:30px;height:30px;background:" + (t.role === "you" ? "var(--bg-soft)" : t.role === "error" ? "var(--red-soft,#fee)" : "var(--brand-soft)") + ";color:" + (t.role === "claude" ? "var(--brand)" : "inherit")}>
          <${Icon} name=${t.role === "you" ? "user" : t.role === "error" ? "alertTriangle" : "cpu"} size=14 />
        </div>
        <div style="flex:1;min-width:0">
          <div class="tiny" style="white-space:pre-wrap">${t.text}</div>
          ${t.role === "claude" && t.considered && html`<div class="tiny muted" style="padding-top:6px">
            ${/* The provenance line. Without it an answer about a 120-row sample
                 reads exactly like an answer about the whole register. */ ""}
            Answered from ${Object.entries(t.considered).map(([k, v]) =>
    v + " of " + ((t.totals && t.totals[k]) != null ? t.totals[k] : v) + " " + k).join(" · ")}
            ${t.partial ? " — a sample, not the whole register" : ""}
            ${t.redactions && t.redactions.values
    ? " · " + t.redactions.values + " long free-text field(s) withheld (" + t.redactions.fields.join(", ") + ")"
    : ""}
          </div>`}
        </div>
      </div>`)}

      ${busy && html`<div class="tiny muted">Thinking…</div>`}
      <div ref=${endRef}></div>

      <div class="row" style="gap:8px;align-items:center;position:sticky;bottom:0;padding-top:8px;background:var(--bg)">
        <div style="flex:1"><${Input} placeholder="Ask about your contracts, matters, loans, licences…"
          value=${q} disabled=${offline}
          onInput=${(e) => setQ(e.target.value)}
          onKeyDown=${(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} /></div>
        <${Btn} icon="send" disabled=${offline || busy || !q.trim()} onClick=${() => send()}>Ask</${Btn}>
      </div>
      <div class="tiny muted">
        This assistant cannot read the contents of your documents. It answers from record fields —
        parties, dates, types, statuses and counts. For what a document says, open the document.
      </div>
    </div>
  </div>`;
}

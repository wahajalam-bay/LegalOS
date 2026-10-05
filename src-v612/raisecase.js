// RAISE A CASE — the litigation intake wizard.
//
// The point of this screen is NOT to collect forty fields. It is to avoid
// asking for anything LegalOS can already prove.
//
//   a legal notice knows the parties, the subject and the dates
//   a contract knows the entity, the counterparty and the value
//   a court document states the case number, the forum and the hearing
//
// So the wizard reads those first and shows the lawyer what is already known,
// what it is unsure about, and what is genuinely missing. What is left to type
// is usually the risk and the owner.
//
// THREE RULES THIS SCREEN KEEPS
//   1. Nothing is filled in without saying where it came from. Every
//      auto-filled field shows its source, and extracted ones show the line of
//      the document they were read from.
//   2. A low-confidence value is a SUGGESTION, not a value. It is not written
//      into the field until the lawyer accepts it, because a prefilled field
//      is a field nobody re-reads.
//   3. The system does not decide law. It will not compute a limitation date,
//      and it will not set risk on its own — it can say what the claim is and
//      let the lawyer decide what that means.
import { html, useState, useEffect, useMemo, useRef, Fragment } from "./core.js";
import { Btn, Pill, Modal, Field, Input, Chip, Picker, DateInput } from "./ui.js";
import { Icon } from "./icons.js";
import { api } from "./api.js";
import { navigate } from "./router.js";

const STEPS = ["Source", "Case", "Parties & forum", "Dates & exposure", "Documents", "Counsel & review"];

const cx = (...a) => a.filter(Boolean).join(" ");
const isHigh = (c) => String(c || "").toLowerCase() === "high";

/* A value the lawyer has not yet accepted. Shown, explained, and applied only
   when they say so. */
function Suggestion({ label, value, source, snippet, onAccept, onReject }) {
  if (value === "" || value == null) return null;
  return html`<div class="card card--pad" style="background:var(--brand-soft);border-color:var(--brand);margin-bottom:8px">
    <div class="row" style="gap:8px;align-items:flex-start">
      <div style="flex:1">
        <div class="tiny strong">${label}: ${String(value)}</div>
        ${source && html`<div class="tiny muted">Suggested from ${source}</div>`}
        ${snippet && html`<div class="tiny muted" style="font-style:italic;margin-top:4px">“${snippet}”</div>`}
      </div>
      <${Btn} size="sm" variant="primary" onClick=${onAccept}>Use</${Btn}>
      <${Btn} size="sm" variant="ghost" onClick=${onReject}>Dismiss</${Btn}>
    </div>
  </div>`;
}

/* A field that was filled in for the lawyer, with the receipt attached. */
function Sourced({ prov }) {
  if (!prov) return null;
  return html`<div class="tiny muted" style="margin-top:3px">
    <${Icon} name="check" size=11 /> Auto-filled from ${prov.source || prov.sourceType}
    ${prov.confidence && !isHigh(prov.confidence) ? " · needs review" : ""}
    ${prov.snippet ? html`<div style="font-style:italic">“${String(prov.snippet).slice(0, 140)}”</div>` : null}
  </div>`;
}

/* Every option control on this screen is the one Picker from the design
   system: searchable, keyboard-driven, and rendered so the modal's
   `overflow:hidden` cannot clip it. The wizard no longer defines controls of
   its own -- two components meant two behaviours and only one of them was
   ever tested. */

export function RaiseCase({ moduleKey = "cases", moduleLabel = "Litigation", source, onClose, onCreated }) {
  const [step, setStep] = useState(source ? 1 : 0);
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [dups, setDups] = useState(null);
  const [draftId, setDraftId] = useState(null);

  const [f, setF] = useState({
    title: "", courtCaseNumber: "", caseType: "", nature: "", direction: "",
    summary: "", entity: "",
    court: { name: "", jurisdiction: "", city: "", bench: "" },
    dates: { incident: "", noticeIssued: "", noticeReceived: "", filing: "", service: "", nextHearing: "" },
    /* ONE AMOUNT, ONE CURRENCY -- per figure.
       The register's SOURCE genuinely carries both a PKR and a USD column, and
       those stay exactly as they are for cases read from Drive. But a person
       raising a case states one figure in one currency, so the form asks for
       one, and the currency is chosen explicitly rather than assumed. Nothing
       is converted: the amount is written to the column for the currency
       picked, and the other is left empty. */
    financial: { claimed: "", exposure: "", exposureCurrency: "PKR", recoverable: "", recoverableCurrency: "PKR" },
    risk: "", priority: "", ownership: { owner: "", ownerName: "", backup: "" },
    counsel: { lead: "" },
    links: {}, status: "Open",
  });
  const [parties, setParties] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [deadlines, setDeadlines] = useState([]);
  const [provenance, setProvenance] = useState({});
  const [suggestions, setSuggestions] = useState([]);   // {key,label,value,source,snippet,apply}
  const [extracting, setExtracting] = useState(false);
  const [readNotes, setReadNotes] = useState([]);

  const set = (k) => (e) => setF((d) => ({ ...d, [k]: e.target.value }));
  const setIn = (grp, k) => (e) => setF((d) => ({ ...d, [grp]: { ...d[grp], [k]: e.target.value } }));

  /* LOADING, LOADED AND FAILED ARE THREE DIFFERENT STATES.
     The previous build collapsed all three into `{ caseTypes: [], suggest: {} }`,
     so a 404 from the API rendered as "0 entities in the register" next to a
     register holding 37 of them. A zero is a statement about the business and
     must never be how a broken endpoint looks. */
  const [metaState, setMetaState] = useState("loading");   // loading | ready | failed
  const [metaErr, setMetaErr] = useState("");

  const loadMeta = () => {
    setMetaState("loading"); setMetaErr("");
    api.litigation.meta().then(
      (m) => { setMeta(m); setMetaState("ready"); },
      (e) => { setMeta(null); setMetaErr((e && e.message) || "The option lists could not be loaded."); setMetaState("failed"); });
  };
  useEffect(loadMeta, []);

  /* One accessor for every menu, so a list is never read two different ways.
     `status` travels WITH the options: a list that failed on the server says so
     even when the request itself succeeded. */
  const L = (key) => {
    if (metaState === "loading") return { options: [], status: "loading", count: 0 };
    if (metaState === "failed") return { options: [], status: "failed", count: 0 };
    const l = (meta && meta.lists && meta.lists[key]) || null;
    if (!l) return { options: [], status: "ok", count: 0 };
    return { options: l.options || [], status: l.status || "ok", count: l.count || 0, label: l.label, source: l.source };
  };
  const opts = (key) => L(key).options;
  const pick = (key, extra) => Object.assign({
    options: opts(key), status: L(key).status, onRetry: loadMeta,
  }, extra || {});
  /* "28 in the register" is only ever printed once the list has actually
     arrived; while loading or failed the Picker prints its own state. */
  const PLURAL = { category: "categories", entity: "entities", court: "courts", role: "roles", name: "names" };
  const inRegister = (noun) => (n) => n + " " + (n === 1 ? noun : (PLURAL[noun] || noun + "s")) + " in the register";

  const sug = (meta && meta.suggest) || {};

  /* The broad family a category benchmarks under is DERIVED. It is shown so the
     lawyer can see how the case will be grouped, and it is never a second thing
     to fill in — the server derives the same value from the same category. */
  /* CHANGING THE COURT RECALCULATES WHAT THE COURT IMPLIES.
     A stale city left over from the previously selected forum is worse than an
     empty one: it is a wrong fact that looks reviewed. City and jurisdiction
     are refreshed whenever the forum changes, and anything the lawyer typed
     themselves (__derived === false) is left alone. */
  /* A DRAFT STORES THE KEY, NOT ONLY THE LABEL.
     "Zameen Media (Private) Limited" is one of four spellings of one company.
     A draft resumed a month later has to resolve to the same entity even if
     the registry's display name has been tidied since. */
  const setEntity = (name) => setF((d) => {
    const e = (opts("entities") || []).find((x) => x.name === name);
    return { ...d, entity: name, links: { ...d.links, entityId: (e && e.key) || null } };
  });

  /* One derivation, used by the menu, by prefill and by document extraction --
     three ways of choosing a forum must not produce three different records. */
  const applyCourtMeta = (draft, name) => {
    const m = (meta && meta.courtMeta && meta.courtMeta[name]) || null;
    if (!m || draft.court.__derived === false) return;
    draft.court.city = m.city || draft.court.city || "";
    draft.court.jurisdiction = m.jurisdiction || draft.court.jurisdiction || "";
    draft.court.courtType = m.courtType || "";
    draft.court.__derived = true;
  };

  const setCourt = (name) => setF((d) => {
    const m = (meta && meta.courtMeta && meta.courtMeta[name]) || null;
    const keep = d.court.__derived === false;
    return { ...d, court: {
      ...d.court, name,
      city: m && !keep ? (m.city || "") : d.court.city,
      jurisdiction: m && !keep ? (m.jurisdiction || "") : d.court.jurisdiction,
      courtType: m ? (m.courtType || "") : "",
      __derived: !!(m && !keep),
    } };
  });

  /* THERE IS NO OWNER FIELD TO FILL IN.
     The litigation register has no owner column: a case belongs to whoever
     raised it until it is reassigned, and the engine records that without
     anybody typing it. Asking for it here produced "Salman", "S. Rashid" and
     an empty box for one person. Reassignment happens on the case itself,
     where there is something to reassign. */


  const familyHint = useMemo(() => {
    const c = String(f.nature || "");
    if (!c || !meta || !meta.families) return "";
    return meta.families[c] || "";
  }, [f.nature, meta]);

  /* A source record hands over everything it knows before the lawyer sees a
     single empty box. */
  useEffect(() => {
    if (!source || !source.type || !source.id) return;
    setBusy("Reading " + source.type + "…");
    api.litigation.prefill(source.type, source.id).then((r) => {
      applyPrefill(r, source.type);
      setBusy("");
    }, (e) => { setBusy(""); setErr(e.message || "That source could not be read."); });
  }, [source && source.type, source && source.id]);

  function applyPrefill(r, sourceType) {
    const prov = {};
    setF((d) => {
      const n = { ...d, court: { ...d.court }, dates: { ...d.dates }, financial: { ...d.financial }, links: { ...d.links, ...(r.links || {}) } };
      for (const [k, v] of Object.entries(r.fields || {})) {
        if (!v || v.value === "" || v.value == null) continue;
        /* Only high-confidence values are written in. Anything less is offered
           as a suggestion, so a guess never lands silently in a live record. */
        if (!isHigh(v.confidence)) continue;
        prov[k] = { sourceType: v.sourceType, sourceId: v.sourceId, source: v.source, confidence: v.confidence, method: "prefill" };
        if (k === "noticeDate") n.dates.noticeIssued = v.value;
        else if (k === "claimed") n.financial.claimed = v.value;
        else if (k === "counselLead") n.counsel = { ...n.counsel, lead: v.value };
        else if (k in n) n[k] = v.value;
      }
      return n;
    });
    setProvenance((p) => ({ ...p, ...prov }));
    const sugg = Object.entries(r.fields || {})
      .filter(([, v]) => v && !isHigh(v.confidence) && v.value !== "" && v.value != null)
      .map(([k, v]) => ({ key: k, label: labelFor(k), value: v.value, source: v.source, snippet: v.snippet }));
    setSuggestions((s) => s.concat(sugg));
    if ((r.parties || []).length) setParties((ps) => ps.concat(r.parties.map((p) => ({ ...p, kind: "Entity" }))));
    if ((r.documents || []).length) setDocuments((ds) => mergeDocs(ds, r.documents));
    if ((r.warnings || []).length) setReadNotes((w) => w.concat(r.warnings));
  }

  /* A document is read the moment it is chosen, so the lawyer reviews facts
     rather than typing them. */
  async function onFile(file) {
    if (!file) return;
    setExtracting(true); setErr("");
    try {
      const r = await api.litigation.extract(file);
      setDocuments((ds) => mergeDocs(ds, [{ name: r.name, uploadId: r.uploadId, kind: r.documentKind || "Case document", source: "upload" }]));
      const prov = {}; const sugg = [];
      const fields = r.fields || {};
      setF((d) => {
        const n = { ...d, court: { ...d.court }, dates: { ...d.dates }, financial: { ...d.financial } };
        const take = (key, apply) => {
          const v = fields[key];
          if (!v || v.value === "" || v.value == null) return;
          if (isHigh(v.confidence)) {
            apply(n, v.value);
            prov[key] = { sourceType: "document", documentId: r.uploadId, source: r.name, confidence: v.confidence, snippet: v.snippet, method: "extracted" };
          } else {
            sugg.push({ key, label: labelFor(key), value: v.value, source: r.name, snippet: v.snippet });
          }
        };
        take("caseNumber", (x, v) => { x.courtCaseNumber = v; });
        take("firNumber", (x, v) => { x.courtCaseNumber = x.courtCaseNumber || v; });
        /* An extracted court goes through the SAME derivation a picked one
           does, so reading "Lahore High Court" off a petition fills in the city
           exactly as choosing it from the menu would. §25: extraction feeds the
           real controls, not a parallel suggestion object. */
        take("court", (x, v) => { x.court.name = v; applyCourtMeta(x, v); });
        take("city", (x, v) => { x.court.city = v; x.court.__derived = false; });
        take("caseTitle", (x, v) => { if (!x.title) x.title = v; });
        take("caseType", (x, v) => { x.caseType = v; });
        take("filingDate", (x, v) => { x.dates.filing = v; });
        take("nextHearing", (x, v) => { x.dates.nextHearing = v; });
        take("claimAmount", (x, v) => { x.financial.claimed = v; });
        return n;
      });
      setProvenance((p) => ({ ...p, ...prov }));
      setSuggestions((s) => s.concat(sugg));
      if ((r.parties || []).length) {
        setParties((ps) => {
          const have = new Set(ps.map((x) => (x.name || "").toLowerCase()));
          return ps.concat(r.parties.filter((p) => !have.has((p.name || "").toLowerCase()))
            .map((p) => ({ name: p.name, role: p.role, kind: "Entity", confidence: p.confidence })));
        });
      }
      if ((r.warnings || []).length) setReadNotes((w) => w.concat(r.warnings));
      if (!Object.keys(fields).length && !(r.parties || []).length) {
        setReadNotes((w) => w.concat(["Nothing could be read from " + r.name + " — please enter the details by hand."]));
      }
    } catch (e) {
      setErr(e.message || "That document could not be read.");
    }
    setExtracting(false);
  }

  const acceptSuggestion = (s) => {
    setF((d) => {
      const n = { ...d, court: { ...d.court }, dates: { ...d.dates }, financial: { ...d.financial } };
      if (s.key === "caseNumber" || s.key === "firNumber") n.courtCaseNumber = s.value;
      else if (s.key === "court") { n.court.name = s.value; applyCourtMeta(n, s.value); }
      else if (s.key === "city") { n.court.city = s.value; n.court.__derived = false; }
      else if (s.key === "caseTitle") n.title = s.value;
      else if (s.key === "caseType") n.caseType = s.value;
      else if (s.key === "filingDate") n.dates.filing = s.value;
      else if (s.key === "nextHearing") n.dates.nextHearing = s.value;
      else if (s.key === "noticeDate") n.dates.noticeIssued = s.value;
      else if (s.key === "claimAmount" || s.key === "claimed") n.financial.claimed = s.value;
      else if (s.key === "direction") n.direction = s.value;
      else if (s.key in n) n[s.key] = s.value;
      return n;
    });
    setProvenance((p) => ({ ...p, [s.key]: { sourceType: "document", source: s.source, confidence: "accepted by " + "legal", snippet: s.snippet, method: "accepted" } }));
    setSuggestions((list) => list.filter((x) => x !== s));
  };

  /* What is still missing, computed from the record rather than from a list of
     required fields — this is the panel that replaces reading a long form. */
  const readiness = useMemo(() => {
    const confirmed = [], needs = [];
    const push = (ok, label) => (ok ? confirmed : needs).push(label);
    push(!!f.title.trim(), "Case title");
    push(!!f.entity.trim(), "Internal entity");
    push(!!f.nature, "Case category");
    push(!!f.court.name.trim(), "Court / forum");
    push(!!f.courtCaseNumber.trim(), "Court case number");
    push(parties.length >= 1, "Parties");
    push(!!f.risk, "Risk");
    push(!!(f.counsel.lead || "").trim(), "Counsel");
    return { confirmed, needs };
  }, [f, parties]);

  const canCreate = !!f.title.trim();

  async function create(allowDuplicate) {
    setBusy("Creating…"); setErr(""); setDups(null);
    /* The chosen currency decides which existing column the figure lands in.
       No conversion, and the column for the other currency is left empty
       rather than filled with a guess. */
    const fin = f.financial || {};
    const financial = {
      claimed: fin.claimed,
      exposurePKR: fin.exposureCurrency === "USD" ? "" : fin.exposure,
      exposureUSD: fin.exposureCurrency === "USD" ? fin.exposure : "",
      recoverablePKR: fin.recoverableCurrency === "USD" ? "" : fin.recoverable,
      recoverableUSD: fin.recoverableCurrency === "USD" ? fin.recoverable : "",
    };
    const payload = {
      ...f, financial, moduleKey, parties, documents, deadlines, provenance,
      sourceType: source ? source.type : "manual",
      sourceLabel: source ? source.label || source.type : "",
      allowDuplicate: !!allowDuplicate, draftId,
    };
    try {
      const r = await api.litigation.create(payload);
      setBusy("");
      onCreated && onCreated(r.id, r.case);
      navigate("/rec/litigation/" + r.id);
    } catch (e) {
      setBusy("");
      const p = e.payload || {};
      if (p.error === "possible_duplicate") { setDups(p.duplicates || []); return; }
      setErr((p.errors && p.errors.join(" · ")) || e.message || "The case could not be created.");
    }
  }

  const saveDraft = async (opts) => {
    const quiet = opts && opts.quiet;
    try {
      const r = await api.litigation.saveDraft({ draftId, payload: { f, parties, documents, deadlines, provenance, moduleKey } });
      setDraftId(r.draftId);
      setSavedAt(new Date());
      if (!quiet) setReadNotes((w) => w.concat(["Draft saved — you can close this and come back to it."]));
      return r;
    } catch (e) {
      /* An autosave that failed must not throw an error banner over a form the
         user is still typing into; it says so quietly and keeps trying. */
      if (quiet) { setSaveState("failed"); return null; }
      setErr(e.message || "The draft could not be saved.");
      return null;
    }
  };

  /* NOTHING TYPED INTO THIS WINDOW IS LOST BY CLOSING IT.
     Raising a case is six steps of real work, and the draft only existed if
     somebody noticed the "Save draft" button and pressed it. Close the window
     -- or click the backdrop, or reload -- and all of it was gone.

     So the draft saves itself, a second and a half after typing stops. The
     debounce is deliberate: saving on every keystroke would write a draft per
     character, and saving only on step change would lose the step you are on.
     It starts only once the form holds something worth keeping, so opening the
     wizard and closing it again creates nothing. */
  const [savedAt, setSavedAt] = useState(null);
  const [saveState, setSaveState] = useState("");
  const autoRef = useRef({ last: "", timer: null, busy: false });
  const worthSaving = !!(f.title || f.summary || f.entity || f.caseType || f.nature
    || (parties || []).length || (documents || []).length);

  useEffect(() => {
    if (!worthSaving) return undefined;
    const snapshot = JSON.stringify({ f, parties, documents, deadlines, moduleKey });
    if (snapshot === autoRef.current.last) return undefined;
    clearTimeout(autoRef.current.timer);
    autoRef.current.timer = setTimeout(async () => {
      if (autoRef.current.busy) return;
      autoRef.current.busy = true;
      setSaveState("saving");
      const r = await saveDraft({ quiet: true });
      autoRef.current.busy = false;
      if (r) { autoRef.current.last = snapshot; setSaveState("saved"); }
    }, 1500);
    return () => clearTimeout(autoRef.current.timer);
  }, [f, parties, documents, deadlines, moduleKey, worthSaving, draftId]);

  /* And if the tab goes away mid-keystroke -- before the 1.5s debounce has
     fired -- the draft is flushed on the way out.

     NOT a beforeunload prompt. "Changes you made may not be saved" blocks the
     navigation until somebody answers it, and it fires on every reload whether
     or not there is anything to lose -- which is both a worse experience than
     simply saving, and a thing that hangs any automated journey through this
     form. `pagehide` cannot block; `keepalive` lets the request outlive the
     page. The work is saved rather than the user being asked about it. */
  useEffect(() => {
    const onHide = () => {
      if (!worthSaving || saveState === "saved") return;
      try {
        const body = JSON.stringify({ draftId, payload: { f, parties, documents, deadlines, provenance, moduleKey } });
        fetch(api.base + "litigation/drafts", {
          method: "POST", credentials: "same-origin", keepalive: true,
          headers: { "Content-Type": "application/json" }, body,
        }).catch(() => {});
      } catch (e) { /* leaving anyway */ }
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [worthSaving, saveState, f, parties, documents, deadlines, provenance, moduleKey, draftId]);

  const stepBody = () => {
    if (step === 0) return html`<${Fragment}>
      <div class="tiny muted" style="margin-bottom:10px">How is this case being raised? Anything you pick here is read first, so you are reviewing facts rather than typing them.</div>
      <div class="grid grid--2" style="gap:10px">
        ${[["manual", "From scratch", "file"], ["notice", "From a legal notice", "mail"],
           ["request", "From a legal request", "inbox"], ["contract", "From a contract", "file"],
           ["document", "From a court document", "upload"]].map(([k, label, icon]) => html`
          <button key=${k} type="button" class="card card--hover card--pad cardbtn" onClick=${() => setStep(k === "document" ? 4 : 1)}>
            <div class="row" style="gap:8px"><${Icon} name=${icon} size=16 /><div class="strong" style="font-size:13px">${label}</div></div>
          </button>`)}
      </div>
      ${source && html`<div class="card card--pad" style="margin-top:12px;background:var(--brand-soft);border-color:var(--brand)">
        <div class="tiny strong">Raising from ${source.label || source.type}</div>
        <div class="tiny muted">Its details have been carried across.</div></div>`}
    </${Fragment}>`;

    if (step === 1) return html`<${Fragment}>
      <div class="modeditgrid">
        <${Field} label="Case title *">
          <${Input} value=${f.title} onInput=${set("title")} />
          <${Sourced} prov=${provenance.title || provenance.caseTitle} />
        </${Field}>
        <${Field} label="Court case number" hint="The court's own reference — LegalOS keeps its own id separately">
          <${Input} value=${f.courtCaseNumber} onInput=${set("courtCaseNumber")} />
          <${Sourced} prov=${provenance.caseNumber || provenance.firNumber} />
        </${Field}>
        <${Field} label="Case category *" hint="How this business classifies its cases — the same list the register is filed under">
          <${Picker} ...${pick("categories", { placeholder: "e.g. Employee Dispute", describe: inRegister("category") })}
            value=${f.nature} onChange=${(v) => setF((d) => ({ ...d, nature: v }))} />
          <${Sourced} prov=${provenance.nature || provenance.caseType} />
          ${f.nature && familyHint && html`<div class="tiny muted" style="margin-top:3px">Benchmarked as <strong>${familyHint}</strong></div>`}
        </${Field}>
        <${Field} label="Direction" hint="Sets where the case starts in the workflow">
          <${Picker} ...${pick("directions", { allowCustom: false, placeholder: "Select…", describe: () => "Whether we brought this case or it was brought against us" })}
            value=${f.direction} onChange=${(v) => setF((d) => ({ ...d, direction: v }))} />
          <${Sourced} prov=${provenance.direction} />
        </${Field}>
        <${Field} label="Internal entity" hint="From the group entity registry, not free text">
          <${Picker} ...${pick("entities", { placeholder: "Type to search, e.g. Zameen Med…", describe: inRegister("entity") })}
            value=${f.entity} onChange=${setEntity} />
          <${Sourced} prov=${provenance.entity} />
        </${Field}>
        <${Field} label="Priority" hint="How urgently it needs attention — not the same as risk">
          <${Picker} ...${pick("priorities", { allowCustom: false, placeholder: "Normal" })}
            value=${f.priority} onChange=${(v) => setF((d) => ({ ...d, priority: v }))} />
        </${Field}>
      </div>
      <div class="tiny muted" style="margin:2px 0 10px">
        Initial status: <strong>Open</strong> — every new case starts here, and the status moves as the case does.
      </div>
      <${Field} label="Summary">
        <textarea class="input" rows="4" value=${f.summary} onInput=${set("summary")}></textarea>
        <${Sourced} prov=${provenance.summary} />
      </${Field}>
    </${Fragment}>`;

    if (step === 2) return html`<${Fragment}>
      <div class="tiny strong" style="margin-bottom:6px">Parties</div>
      ${parties.length === 0 && html`<div class="tiny muted">None yet. Add the parties, or upload the pleading and they will be read from it.</div>`}
      ${parties.map((p, i) => html`<div key=${i} class="card card--pad" style="margin-bottom:8px">
        <div class="modeditgrid">
          <${Field} label="Type" hint="An entity is picked from the registry; a person is typed">
            <${Picker} ...${pick("partyKinds", { allowCustom: false, placeholder: "Entity" })}
              value=${p.kind || ""}
              onChange=${(v) => setParties((ps) => ps.map((x, j) => j === i ? { ...x, kind: v } : x))} />
          </${Field}>
          <${Field} label="Name" hint=${p.kind === "Individual" ? "A person's name" : "Entities already known to LegalOS are offered"}>
            ${p.kind === "Individual"
              ? html`<${Input} value=${p.name}
                  onInput=${(e) => setParties((ps) => ps.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />`
              : html`<${Picker} ...${pick("entities", { placeholder: "Type to search…", describe: inRegister("entity") })}
                  value=${p.name}
                  onChange=${(v) => setParties((ps) => ps.map((x, j) => j === i ? { ...x, name: v } : x))} />`}
          </${Field}>
          <${Field} label="Role">
            <${Picker} ...${pick("positions", { placeholder: "e.g. Defendant", describe: inRegister("role") })}
              value=${p.role}
              onChange=${(v) => setParties((ps) => ps.map((x, j) => j === i ? { ...x, role: v } : x))} />
          </${Field}>
        </div>
        <div class="row" style="gap:8px;margin-top:6px;align-items:center">
          <label class="tiny"><input type="checkbox" checked=${!!p.isUs}
            onChange=${(e) => setParties((ps) => ps.map((x, j) => j === i ? { ...x, isUs: e.target.checked } : x))} /> This is us</label>
          ${p.confidence && !isHigh(p.confidence) && html`<${Pill} tone="amber">needs review</${Pill}>`}
          <div class="spacer"></div>
          <${Btn} size="sm" variant="ghost" onClick=${() => setParties((ps) => ps.filter((_, j) => j !== i))}>Remove</${Btn}>
        </div>
      </div>`)}
      <${Btn} size="sm" variant="ghost" icon="plus" onClick=${() => setParties((ps) => ps.concat([{ name: "", role: "Defendant", kind: "Entity" }]))}>Add a party</${Btn}>

      <div class="tiny strong" style="margin:16px 0 6px">Court / forum</div>
      <div class="modeditgrid">
        <${Field} label="Court / forum" hint="Picking a forum fills in what that forum already tells us">
          <${Picker} ...${pick("courts", { placeholder: "e.g. Civil Court, Lahore", describe: inRegister("court") })}
            value=${f.court.name} onChange=${setCourt} />
          <${Sourced} prov=${provenance.court} />
        </${Field}>
        <${Field} label="City" hint=${f.court.__derived ? "From the court you picked — you can change it" : ""}>
          <${Picker} ...${pick("cities", { placeholder: "e.g. Lahore" })}
            value=${f.court.city} onChange=${(v) => setF((d) => ({ ...d, court: { ...d.court, city: v, __derived: false } }))} />
          <${Sourced} prov=${provenance.city} />
        </${Field}>
        ${/* NEITHER JURISDICTION NOR BENCH IS ASKED FOR HERE.
              Jurisdiction was derived from the court the user had just picked
              and then presented as a question, so the form asked twice for one
              fact and let the two answers disagree. Bench/judge is not known
              when a case is raised. Both still travel on the record where the
              court supplies them -- see how `court` is submitted below -- they
              are simply no longer a box to fill in. */ ""}
      </div>
    </${Fragment}>`;

    if (step === 3) return html`<${Fragment}>
      <div class="modeditgrid">
        <${Field} label="Filing date"><${DateInput} value=${f.dates.filing} onInput=${setIn("dates", "filing")} /><${Sourced} prov=${provenance.filingDate} /></${Field}>
        <${Field} label="Next hearing"><${DateInput} value=${f.dates.nextHearing} onInput=${setIn("dates", "nextHearing")} /><${Sourced} prov=${provenance.nextHearing} /></${Field}>
        ${/* Issued and received are different days, and which one you have is
              the difference between counting a limitation period from the
              right date and the wrong one. */ ""}
        <${Field} label="Notice issuance date" hint="The date printed on the notice">
          <${DateInput} value=${f.dates.noticeIssued} onInput=${setIn("dates", "noticeIssued")} /></${Field}>
        <${Field} label="Notice receiving date" hint="The date it reached the company">
          <${DateInput} value=${f.dates.noticeReceived} onInput=${setIn("dates", "noticeReceived")} /></${Field}>
      </div>
      <div class="tiny muted" style="margin:4px 0 12px">
        LegalOS does not calculate limitation periods. Any statutory deadline is one you enter, and it is tracked from there.
      </div>
      <div class="modeditgrid">
        <${Field} label="Claimed amount" hint="What the other side is asking for">
          <${Input} value=${f.financial.claimed} onInput=${setIn("financial", "claimed")} /><${Sourced} prov=${provenance.claimAmount} />
        </${Field}>
        <${Field} label="Exposure" hint="Set separately — a claim is not an exposure">
          <div class="row" style="gap:8px">
            <${Input} value=${f.financial.exposure} onInput=${setIn("financial", "exposure")} />
            <select class="input" style="width:104px;flex:none" id="rc-exposure-ccy" aria-label="Exposure currency"
              value=${f.financial.exposureCurrency}
              onChange=${(e) => { const v = e.target.value; setF((d) => ({ ...d, financial: { ...d.financial, exposureCurrency: v } })); }}>
              ${["PKR", "USD"].map((c) => html`<option key=${c} value=${c} selected=${f.financial.exposureCurrency === c}>${c}</option>`)}
            </select>
          </div>
        </${Field}>
        <${Field} label="Recoverable">
          <div class="row" style="gap:8px">
            <${Input} value=${f.financial.recoverable} onInput=${setIn("financial", "recoverable")} />
            <select class="input" style="width:104px;flex:none" id="rc-recoverable-ccy" aria-label="Recoverable currency"
              value=${f.financial.recoverableCurrency}
              onChange=${(e) => { const v = e.target.value; setF((d) => ({ ...d, financial: { ...d.financial, recoverableCurrency: v } })); }}>
              ${["PKR", "USD"].map((c) => html`<option key=${c} value=${c} selected=${f.financial.recoverableCurrency === c}>${c}</option>`)}
            </select>
          </div>
        </${Field}>
        <${Field} label="Risk" hint="Your call, not the system's — how bad it is if this goes against us">
          <${Picker} ...${pick("risks", { allowCustom: false, placeholder: "Select…" })}
            value=${f.risk} onChange=${(v) => setF((d) => ({ ...d, risk: v }))} />
        </${Field}>
      </div>
    </${Fragment}>`;

    if (step === 4) return html`<${Fragment}>
      <div class="card card--pad" style="margin-bottom:12px">
        <div class="tiny strong" style="margin-bottom:6px">Upload a court document</div>
        <div class="tiny muted" style="margin-bottom:8px">A plaint, petition, summons, FIR or order. It is read here on the server and nothing is sent anywhere else.</div>
        <input class="input" type="file" accept=".pdf,.doc,.docx,.txt" onChange=${(e) => onFile(e.target.files && e.target.files[0])} />
        ${extracting && html`<div class="tiny muted" style="margin-top:8px">Reading the document…</div>`}
      </div>
      ${documents.length === 0 && html`<div class="tiny muted">No documents yet. A case may be raised without any.</div>`}
      ${documents.map((d, i) => html`<div key=${i} class="row card card--pad" style="gap:8px;margin-bottom:6px;align-items:center">
        <${Icon} name="file" size=14 />
        <div style="flex:1">
          <div class="tiny strong">${d.name}</div>
          <div class="tiny muted">${[d.source, d.suggested ? "suggested" : ""].filter(Boolean).join(" · ")}</div>
          <div style="margin-top:4px;max-width:260px">
            <${Picker} ...${pick("documentTypes", { allowCustom: false, placeholder: "What kind of document?" })}
              value=${d.kind || ""}
              onChange=${(v) => setDocuments((ds) => ds.map((x, j) => j === i ? { ...x, kind: v } : x))} />
          </div>
        </div>
        <${Btn} size="sm" variant="ghost" onClick=${() => setDocuments((ds) => ds.filter((_, j) => j !== i))}>Remove</${Btn}>
      </div>`)}
    </${Fragment}>`;

    return html`<${Fragment}>
      <div class="modeditgrid">
        <${Field} label="Counsel" hint="Who is acting — the register keeps one counsel per case">
          <${Picker} ...${pick("counsel", { placeholder: "e.g. Hamza Haider", describe: inRegister("name") })}
            value=${f.counsel.lead} onChange=${(v) => setF((d) => ({ ...d, counsel: { ...d.counsel, lead: v } }))} />
        </${Field}>
      </div>

      <div class="card card--pad" style="margin-top:14px">
        <div class="tiny strong" style="margin-bottom:6px">Ready to create</div>
        ${readiness.confirmed.map((c) => html`<div key=${c} class="tiny" style="color:var(--success)">✓ ${c}</div>`)}
        ${readiness.needs.map((c) => html`<div key=${c} class="tiny" style="color:var(--warning)">! ${c} — not set</div>`)}
        <div class="tiny muted" style="margin-top:8px">
          Only a case title is required. Anything still missing can be added later, and the case is marked as needing information.
        </div>
      </div>
    </${Fragment}>`;
  };

  return html`<${Modal} title=${"Add a case — " + moduleLabel} icon="gavel" width=${900} onClose=${onClose}
    footer=${html`<${Fragment}>
      <${Btn} variant="ghost" onClick=${() => saveDraft()}>Save draft</${Btn}>
      ${/* Says so, so nobody has to wonder whether closing this loses their
            work. Silent until there is actually something saved. */ ""}
      ${saveState === "saving" ? html`<span class="tiny muted">Saving…</span>`
    : saveState === "failed" ? html`<span class="tiny" style="color:var(--warning-text)">Could not save the draft — it is still here, keep going</span>`
      : savedAt ? html`<span class="tiny muted">Draft saved — you can close this and come back</span>` : null}
      <div class="spacer"></div>
      ${step > 0 && html`<${Btn} onClick=${() => setStep(step - 1)}>Back</${Btn}>`}
      ${step < STEPS.length - 1
        ? html`<${Btn} variant="primary" onClick=${() => setStep(step + 1)}>Next</${Btn}>`
        : html`<${Btn} variant="primary" icon="check" disabled=${!canCreate || !!busy} onClick=${() => create(false)}>${busy || "Create case"}</${Btn}>`}
    </${Fragment}>`}>

    <div class="row wrap" style="gap:6px;margin-bottom:12px">
      ${STEPS.map((s, i) => html`<${Chip} key=${s} active=${i === step} onClick=${() => setStep(i)}>${i + 1}. ${s}</${Chip}>`)}
    </div>

    ${metaState === "loading" && html`<div class="tiny muted" style="margin-bottom:8px">Loading the option lists…</div>`}
    ${metaState === "failed" && html`<div class="card card--pad" style="background:var(--danger-bg);border-color:var(--danger);margin-bottom:10px">
      <div class="row" style="gap:8px;align-items:center">
        <div style="flex:1">
          <div class="tiny strong">The option lists could not be loaded.</div>
          <div class="tiny muted">${metaErr} — the menus below are empty because of this, not because the register is.</div>
        </div>
        <${Btn} size="sm" variant="primary" onClick=${loadMeta}>Retry</${Btn}>
      </div></div>`}

    ${busy && html`<div class="tiny muted" style="margin-bottom:8px">${busy}</div>`}
    ${err && html`<div class="card card--pad" style="background:var(--danger-bg);border-color:var(--danger);margin-bottom:10px">
      <div class="tiny strong">${err}</div></div>`}

    ${readNotes.map((n, i) => html`<div key=${i} class="card card--pad" style="background:var(--warning-bg);border-color:var(--warning);margin-bottom:8px">
      <div class="tiny">${n}</div></div>`)}

    ${suggestions.map((s, i) => html`<${Suggestion} key=${i} label=${s.label} value=${s.value} source=${s.source} snippet=${s.snippet}
      onAccept=${() => acceptSuggestion(s)} onReject=${() => setSuggestions((l) => l.filter((x) => x !== s))} />`)}

    ${dups && html`<div class="card card--pad" style="background:var(--warning-bg);border-color:var(--warning);margin-bottom:10px">
      <div class="tiny strong">This may already exist</div>
      ${dups.map((d) => html`<div key=${d.id} class="row" style="gap:8px;margin-top:6px;align-items:center">
        <div style="flex:1"><div class="tiny strong">${d.id} · ${d.title}</div>
          <div class="tiny muted">${[d.court, d.courtCaseNumber].filter(Boolean).join(" · ")} — ${d.score}% match (${d.why.join(", ")}), from ${d.source}</div></div>
        ${/^LIT-/.test(d.id) && html`<${Btn} size="sm" onClick=${() => { onClose && onClose(); navigate("/rec/litigation/" + d.id); }}>Open</${Btn}>`}
      </div>`)}
      <div class="row" style="margin-top:10px"><div class="spacer"></div>
        <${Btn} size="sm" variant="primary" onClick=${() => create(true)}>Create anyway</${Btn}></div>
    </div>`}

    ${stepBody()}
  </${Modal}>`;
}

function labelFor(k) {
  return ({
    caseNumber: "Case number", firNumber: "FIR number", court: "Court", city: "City",
    caseTitle: "Case title", caseType: "Case type", filingDate: "Filing date",
    nextHearing: "Next hearing", claimAmount: "Claimed amount", claimed: "Claimed amount",
    noticeDate: "Notice issuance date", direction: "Direction", entity: "Entity", title: "Case title",
    summary: "Summary",
  })[k] || k;
}

function mergeDocs(existing, incoming) {
  const key = (d) => d.driveFileId || d.uploadId || String(d.name || "").toLowerCase();
  const have = new Set(existing.map(key));
  return existing.concat((incoming || []).filter((d) => !have.has(key(d))));
}

export default RaiseCase;

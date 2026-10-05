// Loan Agreements — register, record detail, and the legal actions that run
// from a loan.
//
// The register shows LOAN AGREEMENTS, not tracker rows. The FDI tracker's
// per-entity sheets are a loan's rollover history, not 113 separate loans, so
// they appear in each loan's timeline instead of tripling the register (see
// api/compliance-model.js for the reconciliation).
//
// An action never edits the loan. "+ Amendment" creates a child record with its
// own lifecycle, documents, signatories and audit trail, and the loan's ORIGINAL
// terms stay exactly as the source recorded them while CURRENT EFFECTIVE terms
// are computed from the chain.
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Modal, Field, Input, Textarea, Section, Pill, Status, Empty, AICard } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { RegisterShell, RegisterTabs } from "../register.js";
import { useFilterLink } from "../filters.js";
import { navigate, useQuery } from "../router.js";
import { openRecord, registerReturnPath, useRecordTab } from "../compliancenav.js";
import { LegalDocuments } from "../legaldocuments.js";
import { api } from "../api.js";
import { toast } from "../toast.js";
import { useLoans, useLoan } from "../compliancedata.js";
import { loanCategoryLabel, loanFields, loanColumns, loanViews, loanSearchKeys, SbpPill, OriginTag } from "../compliancedefs.js";
import { ActionPanel, UnifiedTimeline, FieldGrid, Select } from "../complianceui.js";

const money = (v, ccy) => (v == null || v === "" ? "—" : (ccy ? ccy + " " : "") + Number(v).toLocaleString());
const dash = (v) => (v == null || v === "" ? "—" : v);
const today = () => new Date().toISOString().slice(0, 10);

/* ================================================================ REGISTER */

export function LoanRegister({ config }) {
  const { data, loading, error, reload } = useLoans();
  const drill = useFilterLink("loan");
  const rows = (data && data.loans) || [];

  const counts = useMemo(() => {
    const c = { fdi: 0, fcy: 0, inter: 0, sbpPending: 0, sbpReg: 0, overdue: 0, closed: 0 };
    const t = today();
    for (const r of rows) {
      if (r.category === "fdi" || r.category === "international") c.fdi++;
      else if (r.category === "fcy") c.fcy++;
      else c.inter++;
      if (r.sbp && (r.sbp.key === "PENDING" || r.sbp.key === "SUBMITTED")) c.sbpPending++;
      if (r.sbp && r.sbp.key === "REGISTERED") c.sbpReg++;
      const due = r.current && r.current.repaymentDue;
      if (due && due < t && !r.closed) c.overdue++;
      if (r.closed) c.closed++;
    }
    return c;
  }, [rows]);

  const anyFilter = loanFields.some((f) => drill.active(f.key).length > 0) || drill.active("q").length > 0;

  if (error) return html`<div class="empty" style="padding:34px"><${Icon} name="alertTriangle" size=32 />
    <div>${error.message || "The loan register could not be read."}</div></div>`;
  if (loading && !rows.length) return html`<div class="tiny muted" style="padding:20px 2px">Reading the loan register…</div>`;

  const summary = html`<div class="regsum">
    <div class="regsum__i"><span class="regsum__v">${rows.length}</span><span class="regsum__l">Loan agreements</span></div>
    ${data.reconciliation && html`<div class="regsum__i">
      <span class="regsum__v">${data.reconciliation.historyRows}</span>
      <span class="regsum__l">Historical events across these loans</span></div>`}
    ${data.reconciliation && data.reconciliation.driveOnlyAgreements > 0 && html`<div class="regsum__i">
      <span class="regsum__v">${data.reconciliation.driveOnlyAgreements}</span>
      <span class="regsum__l">Found in Drive with no tracker row</span></div>`}
  </div>`;

  return html`<div>
    <${StatStrip} stats=${[
      { value: rows.length, label: "Loan agreements", active: !anyFilter,
        onClick: () => drill.clearAll(loanFields),
        title: anyFilter ? "Clear every filter and show all loans" : "Showing all loans" },
      { value: counts.fdi, label: "FDI Loans", onClick: () => drill.set("category", ["FDI Loans"]) },
      /* FCY IS DEFINED AND MAY BE EMPTY, ON PURPOSE. Every loan on the FDI
         tracker happens to be in AED or USD, so splitting by currency alone
         would empty the FDI register into this one — a category boundary
         invented by the UI rather than decided by the business. It fills when
         a source actually classifies a loan as FCY. */
      { value: counts.fcy, label: "FCY Loans", onClick: () => drill.set("category", ["FCY Loans"]),
        title: counts.fcy ? "Foreign-currency loans that are not foreign direct investment"
          : "No source distinguishes a foreign-currency loan from an FDI loan yet. The category exists; nothing is classified into it by currency alone." },
      { value: counts.inter, label: "Intercompany PK Loans", onClick: () => drill.set("category", ["Intercompany PK Loans"]) },
      { value: counts.sbpPending, label: "SBP pending", tone: counts.sbpPending ? "amber" : "",
        onClick: () => drill.set("sbp", ["Pending registration", "Submitted"]) },
      { value: counts.sbpReg, label: "SBP registered", onClick: () => drill.set("sbp", ["Registered"]) },
      { value: counts.overdue, label: "Repayment overdue", tone: counts.overdue ? "red" : "",
        onClick: () => drill.set("repay", ["overdue"]) },
    ]} />

    <${RegisterShell}
      tabId="loans" ns="loan" rows=${rows}
      fields=${loanFields}
      columns=${(f) => loanColumns(f, {
        onOpen: (r) => openRecord("/compliance/loans/" + encodeURIComponent(r.id), { tab: "documents" }) })}
      views=${loanViews} searchKeys=${loanSearchKeys}
      searchPlaceholder="Search loans, borrowers, lenders, LRN…"
      noun=${["loan agreement", "loan agreements"]}
      onRow=${(r) => openRecord("/compliance/loans/" + encodeURIComponent(r.id))}
      exportName="loan-agreements" emptyIcon="dollar"
      defaultSort=${{ key: "effective", dir: "asc" }}
      summary=${summary} />
  </div>`;
}

/* ================================================================== DETAIL */

export function LoanDetail({ id, config }) {
  const { data, loading, error, reload } = useLoan(id);
  const [action, setAction] = useState(null);
  const [openRec, setOpenRec] = useState(null);
  const [query, patchQ] = useQuery();
  const [tab, setTab] = useRecordTab("overview", query, patchQ);
  const caps = (config && config.capabilities) || {};

  if (error) return html`<div class="page page--wide"><${Empty} icon="alertTriangle" title="Loan not found"
    text=${error.message || "This loan could not be read."}
    action=${html`<${Btn} variant="primary" onClick=${() => navigate("/compliance/loans")}>Back to loans</${Btn}>`} /></div>`;
  if (loading || !data) return html`<div class="page page--wide"><div class="tiny muted" style="padding:20px">Reading the loan…</div></div>`;

  const l = data.loan;
  const bal = l.balance || {};
  const canAct = caps["compliance.create"];
  const canRepay = caps["compliance.repayment.record"];

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "documents", label: "Documents", count: (l.driveFiles || []).length },
    { id: "timeline", label: "Timeline", count: (l.timeline || []).length },
  ];

  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${l.borrower || l.title || l.id}
      sub=${[l.lender ? "Lender: " + l.lender : null, l.refText || l.ref, loanCategoryLabel(l)].filter(Boolean).join(" · ")}
      actions=${html`
        <${Btn} variant="ghost" icon="arrowLeft"
          onClick=${() => navigate(registerReturnPath({ path: "/compliance/loans" }, query))}>Loans</${Btn}>
        ${canAct && html`<${Btn} variant="ghost" icon="edit" onClick=${() => setAction("amendment")}>+ Amendment</${Btn}>`}
        ${canAct && html`<${Btn} variant="ghost" icon="repeat" onClick=${() => setAction("novation")}>+ Novation</${Btn}>`}
        ${canAct && html`<${Btn} variant="ghost" icon="x" onClick=${() => setAction("termination")}>+ Termination</${Btn}>`}
        ${canRepay && html`<${Btn} variant="primary" icon="dollar" onClick=${() => setAction("repayment")}>Record repayment</${Btn}>`}` } />

    <${StatStrip} stats=${[
      { value: l.principal != null ? money(l.principal, l.currency) : dash(l.principalText), label: "Original principal" },
      { value: bal.outstanding != null ? money(bal.outstanding, l.currency) : "—", label: "Outstanding",
        tone: bal.fullyRepaid ? "" : (bal.outstanding ? "amber" : "") },
      { value: bal.repayments || 0, label: "Repayments recorded" },
      { value: (l.current && l.current.amendmentCount) || 0, label: "Amendments / rollovers" },
      { value: l.sbp ? l.sbp.label : "—", label: "SBP registration" },
    ]} />

    ${/* The shared tab strip. The hand-rolled copies that used to be here
          looked identical and behaved differently: no roving tabindex, so Tab
          walked through every tab rather than the selected one, and no arrow
          keys, so a keyboard user could not move between tabs at all. */ ""}
    <${RegisterTabs} tabs=${tabs} active=${tab} onChange=${setTab} ariaLabel="Loan record" />

    ${tab === "overview" && html`<div class="col" style="gap:16px">
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
        <${Section} title="Original terms" icon="file"
          sub="As the source recorded them. An amendment never overwrites these.">
          <${FieldGrid} rows=${[
            ["Loan ID", l.id],
            ["Loan reference / LRN", dash(l.refText || l.ref)],
            ["Borrower", dash(l.borrower)],
            ["Lender", dash(l.lender)],
            ["Category", loanCategoryLabel(l)],
            ["Agreement date", l.original && l.original.agreementDate ? fmt.date(l.original.agreementDate) : dash(l.agreementDateText)],
            ["Principal", l.principal != null ? money(l.principal, l.currency) : dash(l.principalText)],
            ["Currency", dash(l.currency)],
            ["Interest", dash(l.interest)],
            ["Term", dash(l.term)],
            ["Original repayment date", l.original && l.original.repaymentDue ? fmt.date(l.original.repaymentDue) : "—"],
          ]} />
        </${Section}>

        <${Section} title="Current effective terms" icon="activity"
          sub=${l.current && l.current.changed ? "Changed from the original by the history below." : "Unchanged from the original."}>
          <${FieldGrid} rows=${[
            ["Status", dash(l.status)],
            ["Source status text", dash(l.sourceStatus)],
            ["Current repayment date", l.current && l.current.repaymentDue ? fmt.date(l.current.repaymentDue) : dash(l.current && l.current.repaymentDueText)],
            ["Time to repayment", l.current && l.current.repaymentDue && !l.closed ? fmt.until(l.current.repaymentDue) : "\u2014"],
            ["Recorded amendments", String((l.current && l.current.amendmentCount) || 0)],
            ["Outstanding principal", bal.outstanding != null ? money(bal.outstanding, l.currency) : "—"],
            ["Repaid to date", bal.repaid ? money(bal.repaid, l.currency) : "—"],
          ]} />
          <div style="padding-top:10px">
            <div class="tiny muted" style="margin-bottom:4px">SBP registration</div>
            <${SbpPill} sbp=${l.sbp} />
            ${l.sbp && (l.sbp.reason || l.sbp.note) && html`<div class="tiny muted" style="margin-top:6px">${l.sbp.reason || l.sbp.note}</div>`}
          </div>
        </${Section}>
      </div>

      ${(l.children || []).length > 0 && html`<${Section} title=${"Legal actions (" + l.children.length + ")"} icon="gitBranch"
        sub="Amendments, novations, terminations and repayments raised against this loan.">
        <div class="col" style="gap:0">
          ${l.children.map((c) => html`<button key=${c.id} type="button" class="feed__item clickable" style="text-align:left;width:100%"
            onClick=${() => setOpenRec(c.id)}>
            <div class="row" style="gap:10px;align-items:center;width:100%">
              <span class="cell-mono tiny" style="width:104px;flex:none">${c.id}</span>
              <div style="flex:1;min-width:0">
                <div class="tiny strong">${(c.subtype || "action").replace(/^\w/, (m) => m.toUpperCase())}
                  ${c.fields && c.fields.amendmentType ? " · " + c.fields.amendmentType : ""}
                  ${c.fields && c.fields.amount != null ? " · " + money(c.fields.amount, c.fields.currency) : ""}</div>
                <div class="tiny muted">${c.createdBy ? c.createdBy.name : ""} · ${fmt.date(c.createdAt)}</div>
              </div>
              <${Status} value=${c.statusLabel} />
              ${c.documents ? html`<${Pill} tone="indigo">${c.documents} doc${c.documents === 1 ? "" : "s"}</${Pill}>` : ""}
            </div></button>`)}
        </div>
      </${Section}>`}

      ${l.driveFolder && l.driveFolder.path && html`<${Section} title="Source" icon="folder">
        <${FieldGrid} rows=${[
          ["Drive folder", l.driveFolder.name],
          ["Full path", l.driveFolder.path],
          ["Matched on", (l.driveFolder.matchedOn || []).join("; ")],
          ["Tracker file", (l.__source && l.__source.file) || "—"],
          ["Tracker sheet", (l.__source && l.__source.sheet) || "—"],
          ["Source quality", dash(l.__quality)],
        ]} />
      </${Section}>`}
    </div>`}

    ${tab === "documents" && html`<${Section} title=${"Documents (" + (l.driveFiles || []).length + ")"} icon="paperclip"
      sub="Read them here. Google Drive remains the source of truth \u2014 LegalOS never alters a file.">
      ${(l.driveFiles || []).length === 0
        ? html`<${Empty} icon="paperclip"
            title=${l.documentsRestricted ? "No documents you can open" : "No documents"}
            text=${l.documentsRestricted
              ? "No Compliance-accessible documents are available for this loan."
              : "No documents are currently linked to this loan."} />`
        : html`<${LegalDocuments} files=${l.driveFiles} recordType="loan" />`}
    </${Section}>`}

    ${tab === "timeline" && html`<${Section} title="Chronological history" icon="activity"
      sub="Tracker rows, Drive documents and LegalOS actions in one chronology — each tagged with its source.">
      <${UnifiedTimeline} items=${l.timeline || []}
        onOpenRecord=${(rid) => setOpenRec(rid)}
        onOpenDoc=${(f) => f && f.id && navigate("/compliance/document/" + encodeURIComponent(f.id))} />
    </${Section}>`}

    ${action && action !== "repayment" && html`<${LoanActionModal} loan=${l} kind=${action}
      onClose=${() => setAction(null)} onDone=${(rec) => { setAction(null); reload(); setOpenRec(rec.id); }} />`}
    ${action === "repayment" && html`<${RepaymentModal} loan=${l}
      onClose=${() => setAction(null)} onDone=${() => { setAction(null); reload(); }} />`}
    ${openRec && html`<${ActionPanel} recordId=${openRec} caps=${caps} config=${config}
      onClose=${() => setOpenRec(null)} onChanged=${reload} />`}
  </div>`;
}

/* ============================================================ LOAN ACTIONS */

const AMENDMENT_TYPES = [
  "Rollover / Extension",
  "Conversion to Equity",
  "Repayment Date Change",
  "Interest / Pricing Change",
  "Principal Change",
  "Other Change in Terms",
];

export function LoanActionModal({ loan, kind, onClose, onDone }) {
  const [f, setF] = useState({
    amendmentType: kind === "amendment" ? AMENDMENT_TYPES[0] : "",
    effectiveDate: today(),
    revisedRepaymentDate: "",
    revisedPrincipal: "",
    revisedInterest: "",
    newLender: "",
    newBorrower: "",
    terminationDate: kind === "termination" ? today() : "",
    reason: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });

  const TITLE = { amendment: "New amendment", novation: "New novation", termination: "New termination" }[kind] || "New action";

  const go = async () => {
    setBusy(true);
    try {
      const r = await api.compliance.loanAction(loan.id, { subtype: kind, fields: f });
      toast(TITLE + " created as " + r.record.id + ".", "success");
      onDone(r.record);
    } catch (e) { toast(e.message || "The action could not be created.", "error"); }
    finally { setBusy(false); }
  };

  // Auto-populated from the loan so nobody retypes it, and nobody mistypes it.
  const existing = [
    ["Borrower", dash(loan.borrower)],
    ["Lender", dash(loan.lender)],
    ["Agreement date", loan.original && loan.original.agreementDate ? fmt.date(loan.original.agreementDate) : dash(loan.agreementDateText)],
    ["Principal", loan.principal != null ? money(loan.principal, loan.currency) : dash(loan.principalText)],
    ["Current repayment date", loan.current && loan.current.repaymentDue ? fmt.date(loan.current.repaymentDue) : "—"],
    ["Interest", dash(loan.interest)],
    ["Outstanding", loan.balance && loan.balance.outstanding != null ? money(loan.balance.outstanding, loan.currency) : "—"],
  ];

  return html`<${Modal} title=${TITLE} icon="edit" width=${680} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy} onClick=${go}>Create ${kind}</${Btn}>`}>
    <div class="col" style="gap:14px">
      <${Section} title="Existing loan" icon="info" sub="Carried over automatically — you do not retype it.">
        <${FieldGrid} rows=${existing} />
      </${Section}>

      <${Section} title="Revised terms" icon="edit">
        <div class="col" style="gap:10px">
          ${kind === "amendment" && html`<${Field} label="Amendment type">
            <${Select} value=${f.amendmentType} onChange=${(v) => setF({ ...f, amendmentType: v })} options=${AMENDMENT_TYPES} />
          </${Field}>`}
          <${Field} label="Effective date"><${Input} type="date" value=${f.effectiveDate} onInput=${set("effectiveDate")} /></${Field}>

          ${kind === "amendment" && html`<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
            <${Field} label="Revised repayment date"><${Input} type="date" value=${f.revisedRepaymentDate} onInput=${set("revisedRepaymentDate")} /></${Field}>
            <${Field} label="Revised principal" hint="Leave blank if unchanged"><${Input} type="number" value=${f.revisedPrincipal} onInput=${set("revisedPrincipal")} /></${Field}>
            <${Field} label="Revised interest / pricing"><${Input} value=${f.revisedInterest} onInput=${set("revisedInterest")} placeholder=${loan.interest || "e.g. 3-Month KIBOR + 2%"} /></${Field}>
          </div>`}

          ${kind === "novation" && html`<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
            <${Field} label="New lender"><${Input} value=${f.newLender} onInput=${set("newLender")} placeholder=${loan.lender || ""} /></${Field}>
            <${Field} label="New borrower"><${Input} value=${f.newBorrower} onInput=${set("newBorrower")} placeholder=${loan.borrower || ""} /></${Field}>
          </div>`}

          ${kind === "termination" && html`<${Field} label="Termination date">
            <${Input} type="date" value=${f.terminationDate} onInput=${set("terminationDate")} /></${Field}>`}

          <${Field} label="Reason"><${Input} value=${f.reason} onInput=${set("reason")} /></${Field}>
          <${Field} label="Notes"><${Textarea} rows=${3} value=${f.notes} onInput=${set("notes")} /></${Field}>
        </div>
      </${Section}>

      <${AICard} title="What happens next">
        This creates a child record under ${loan.id} with its own status, documents and audit trail.
        The loan's original terms are untouched. From the action you can generate a document from an
        approved template, send it for legal review, finalize, collect signatures and mark it executed.
      </${AICard}>
    </div>
  </${Modal}>`;
}

/* ============================================================= REPAYMENTS */

export function RepaymentModal({ loan, onClose, onDone }) {
  const bal = loan.balance || {};
  const [type, setType] = useState("partial");
  const [f, setF] = useState({
    repaymentDate: today(),
    amount: "",
    currency: loan.currency || "PKR",
    paymentReference: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Mirrors the server rule so the person sees the problem before submitting;
  // the server still enforces it, because this check is a convenience.
  const amt = Number(f.amount);
  const tooMuch = bal.outstanding != null && isFinite(amt) && amt > bal.outstanding;
  const fullMismatch = type === "full" && bal.outstanding != null && isFinite(amt) && Math.abs(amt - bal.outstanding) > 0.005;

  const go = async () => {
    setBusy(true);
    try {
      const r = await api.compliance.repayment(loan.id, { ...f, repaymentType: type, amount: amt });
      toast("Repayment recorded. Outstanding is now " +
        (r.balance.outstanding != null ? money(r.balance.outstanding, loan.currency) : "—") + ".", "success");
      onDone(r);
    } catch (e) { toast(e.message || "The repayment could not be recorded.", "error"); }
    finally { setBusy(false); }
  };

  return html`<${Modal} title="Record repayment" icon="dollar" width=${600} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy || !f.amount || tooMuch || fullMismatch} onClick=${go}>Record repayment</${Btn}>`}>
    <div class="col" style="gap:14px">
      <${FieldGrid} rows=${[
        ["Original principal", loan.principal != null ? money(loan.principal, loan.currency) : "—"],
        ["Repaid to date", bal.repaid ? money(bal.repaid, loan.currency) : money(0, loan.currency)],
        ["Outstanding", bal.outstanding != null ? money(bal.outstanding, loan.currency) : "—"],
        ["Repayments on record", String(bal.repayments || 0)],
      ]} />

      <${Field} label="Repayment type">
        <div class="row" style="gap:16px">
          <label class="row" style="gap:6px;align-items:center;cursor:pointer">
            <input type="radio" name="rtype" checked=${type === "partial"} onChange=${() => setType("partial")} />
            <span class="tiny">Partial repayment</span></label>
          <label class="row" style="gap:6px;align-items:center;cursor:pointer">
            <input type="radio" name="rtype" checked=${type === "full"}
              onChange=${() => { setType("full"); if (bal.outstanding != null) setF({ ...f, amount: String(bal.outstanding) }); }} />
            <span class="tiny">Full repayment</span></label>
        </div>
      </${Field}>

      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <${Field} label="Repayment date"><${Input} type="date" value=${f.repaymentDate} onInput=${set("repaymentDate")} /></${Field}>
        <${Field} label="Amount"><${Input} type="number" value=${f.amount} onInput=${set("amount")} /></${Field}>
        <${Field} label="Currency"><${Input} value=${f.currency} onInput=${set("currency")} /></${Field}>
        <${Field} label="Payment reference"><${Input} value=${f.paymentReference} onInput=${set("paymentReference")} /></${Field}>
      </div>
      <${Field} label="Notes"><${Textarea} rows=${2} value=${f.notes} onInput=${set("notes")} /></${Field}>

      ${tooMuch && html`<div class="tiny" style="color:var(--danger-text)">
        That is more than the outstanding balance of ${money(bal.outstanding, loan.currency)}.
        Record the actual amount, or raise an amendment first if the principal changed.</div>`}
      ${fullMismatch && !tooMuch && html`<div class="tiny" style="color:var(--warning-text)">
        A full repayment must clear the outstanding balance of ${money(bal.outstanding, loan.currency)}.</div>`}
      <div class="tiny muted">Prior repayments and the original principal are preserved — the outstanding
        balance is computed from the repayment history, never stored over it.</div>
    </div>
  </${Modal}>`;
}

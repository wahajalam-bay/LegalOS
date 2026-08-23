import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import { REQUESTER_CATEGORIES, requesterCategoryLabel } from "@/domain/categories";
import type { RequesterCategoryKey } from "@/domain/categories";
import { conditionalFieldsFor, URGENCY_HELP, URGENCY_NOTE } from "@/domain/intake";
import type { IntakeField } from "@/domain/intake";
import { BUSINESS_URGENCIES, JURISDICTIONS, JURISDICTION_LABELS } from "@/domain/models/enums";
import type { BusinessUrgency, Jurisdiction } from "@/domain/models/enums";
import type { DraftAttachment, FieldError, NewRequestInput } from "@/lib/validation";
import { validateConditional, validateNewRequest } from "@/lib/validation";
import { Button, Card, Field, PageHeader, Select, Stepper, TextArea, TextInput } from "@/ui/components";
import { Icon } from "@/ui/icons";
import { formatBytes } from "@/ui/util";
import { useToast } from "@/ui/toast";

const STEP_LABELS = ["About", "Type", "Details", "Attachments", "Review"];
const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg";
const ALLOWED_EXT = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "png", "jpg", "jpeg"]);
const MAX_STEP = STEP_LABELS.length - 1;

const emptyForm = (jurisdiction: Jurisdiction): NewRequestInput => ({
  requesterCategory: "",
  description: "",
  businessContext: "",
  businessUrgency: "Important",
  neededByDate: null,
  neededByJustification: null,
  jurisdiction,
  intakeDetails: {},
  attachments: [],
});

export function NewRequestPage() {
  const { services, repos, currentUser, reload } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const draftKey = `legalos.intake.draft.${currentUser.id}`;

  // Restore a saved draft (if any) for this user.
  const [restored, setRestored] = useState(false);
  const [form, setForm] = useState<NewRequestInput>(() => {
    try {
      const raw = localStorage.getItem(`legalos.intake.draft.${currentUser.id}`);
      if (raw) { const d = JSON.parse(raw) as NewRequestInput; return { ...emptyForm(currentUser.jurisdiction), ...d }; }
    } catch { /* ignore */ }
    return emptyForm(currentUser.jurisdiction);
  });
  useEffect(() => { try { if (localStorage.getItem(draftKey)) setRestored(true); } catch { /* ignore */ } }, [draftKey]);

  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const set = <K extends keyof NewRequestInput>(k: K, v: NewRequestInput[K]) => {
    setDirty(true);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const setDetail = (key: string, v: string) => {
    setDirty(true);
    setForm((f) => ({ ...f, intakeDetails: { ...(f.intakeDetails ?? {}), [key]: v } }));
  };
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;

  const details = form.intakeDetails ?? {};
  const attachments = form.attachments ?? [];
  const tight = useMemo(() => services.requests.previewTight(form), [services, form]);
  const department = repos.departments.get(currentUser.departmentId)?.name ?? "—";
  const conditionalFields = conditionalFieldsFor(form.requesterCategory);

  // Persist draft as the requester works; clear once submitted.
  useEffect(() => {
    if (submitted) return;
    if (!dirty) return;
    try { localStorage.setItem(draftKey, JSON.stringify(form)); } catch { /* ignore */ }
  }, [form, dirty, submitted, draftKey]);

  // Warn on navigating away with unsaved changes.
  useEffect(() => {
    if (!dirty || submitted) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, submitted]);

  // Move focus to the step heading on step change (accessibility / keyboard).
  useEffect(() => { headingRef.current?.focus(); }, [step, submitted]);

  const clearDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } };

  const discardDraft = () => {
    clearDraft();
    setForm(emptyForm(currentUser.jurisdiction));
    setErrors([]); setDirty(false); setRestored(false); setStep(0);
  };

  // ---- per-step validation ----
  function validateStep(s: number): FieldError[] {
    if (s === 0) return validateNewRequest(form).filter((e) => e.field === "description" || e.field === "businessContext");
    if (s === 1) {
      const e: FieldError[] = [];
      if (!form.requesterCategory) e.push({ field: "requesterCategory", message: "Choose the option that best describes your request." });
      return [...e, ...validateConditional(form.requesterCategory, details)];
    }
    if (s === 2) return tight && !form.neededByJustification?.trim()
      ? [{ field: "neededByJustification", message: "This date is tighter than standard — a short justification is required." }]
      : [];
    return [];
  }

  const next = () => {
    const problems = validateStep(step);
    setErrors(problems);
    if (problems.length === 0) setStep((s) => Math.min(MAX_STEP, s + 1));
  };
  const back = () => { setErrors([]); setStep((s) => Math.max(0, s - 1)); };
  const goto = (s: number) => { setErrors([]); setStep(s); };

  const submit = () => {
    const problems = [
      ...validateNewRequest(form, { requiresJustification: tight }),
      ...validateConditional(form.requesterCategory, details),
    ];
    if (problems.length) {
      setErrors(problems);
      // Jump to the earliest step that owns a problem.
      const f = problems[0].field;
      if (f === "description" || f === "businessContext") setStep(0);
      else if (f === "requesterCategory" || conditionalFields.some((cf) => cf.key === f)) setStep(1);
      else if (f === "neededByJustification") setStep(2);
      else setStep(4);
      return;
    }
    const res = services.requests.create(form, currentUser.id);
    if (!res.ok) { toast.push(res.error, "error"); return; }
    clearDraft();
    setDirty(false);
    setSubmitted({ id: res.value.id });
    reload();
    toast.push("Request submitted", "success");
  };

  // ---------- confirmation ----------
  if (submitted) {
    return (
      <div className="page page--narrow">
        <Card>
          <div className="confirm">
            <div className="confirm__icon"><Icon name="check" size={30} /></div>
            <h1 className="confirm__title" ref={headingRef} tabIndex={-1}>Request submitted successfully</h1>
            <p className="muted">Your reference number is <b className="mono">{submitted.id}</b>. Keep it for your records.</p>
            <div className="kv" style={{ textAlign: "left" }}>
              <div><span>Reference number</span><b className="mono">{submitted.id}</b></div>
              <div><span>Submitted</span><b>{new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</b></div>
              <div><span>Status</span><b>Submitted — awaiting triage</b></div>
              <div><span>Expected response</span><b>Legal will confirm your turnaround shortly</b></div>
            </div>
            <p className="callout">Legal will review and confirm the turnaround (SLA) once your request is triaged. You'll be notified of any updates.</p>
            <div className="actions actions--start" style={{ flexWrap: "wrap" }}>
              <Link to={`/requests/${submitted.id}`}><Button variant="primary" iconRight="arrowRight">Track your request</Button></Link>
              <Link to="/requests"><Button variant="ghost">Back to requests</Button></Link>
              <Button variant="ghost" onClick={() => { setSubmitted(null); setForm(emptyForm(currentUser.jurisdiction)); setStep(0); }}>Raise another</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <PageHeader title="Raise a legal request" subtitle="Describe what you need in plain language — Legal works out the category." />

      {restored && (
        <div className="callout" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Icon name="clock" size={15} />
          <span style={{ flex: 1 }}>We restored your saved draft.</span>
          <button className="linkbtn" onClick={discardDraft}>Start over</button>
        </div>
      )}

      <div style={{ margin: "8px 0 18px" }}><Stepper steps={STEP_LABELS} current={step} /></div>

      <Card>
        {/* STEP 0 — ABOUT */}
        {step === 0 && (
          <section aria-labelledby="step-h">
            <h2 id="step-h" className="card__title" ref={headingRef} tabIndex={-1}>About your request</h2>
            <Field label="What do you need help with?" htmlFor="desc"
              hint="Tell us what you're trying to achieve. You don't need to use legal terminology." error={errorFor("description")}>
              <TextArea id="desc" rows={4} value={form.description} autoFocus
                aria-invalid={!!errorFor("description")}
                placeholder="e.g. We want to sign a services agreement with a new supplier."
                onChange={(e) => set("description", e.target.value)} />
            </Field>
            <Field label="Business context / background" htmlFor="ctx"
              hint="What is the commercial objective? Who is the counterparty? What has been agreed so far?" error={errorFor("businessContext")}>
              <TextArea id="ctx" rows={5} value={form.businessContext} aria-invalid={!!errorFor("businessContext")}
                onChange={(e) => set("businessContext", e.target.value)} />
            </Field>
          </section>
        )}

        {/* STEP 1 — TYPE + CONDITIONAL */}
        {step === 1 && (
          <section aria-labelledby="step-h">
            <h2 id="step-h" className="card__title" ref={headingRef} tabIndex={-1}>Which best describes what you're trying to do?</h2>
            {errorFor("requesterCategory") && <div className="field__error" role="alert">{errorFor("requesterCategory")}</div>}
            <div className="optiongrid" role="radiogroup" aria-label="Request type">
              {REQUESTER_CATEGORIES.map((c) => (
                <button key={c.key} type="button" role="radio" aria-checked={form.requesterCategory === c.key}
                  className={`option${form.requesterCategory === c.key ? " is-on" : ""}`}
                  onClick={() => set("requesterCategory", c.key as RequesterCategoryKey)}>
                  {c.label}
                </button>
              ))}
            </div>

            {conditionalFields.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div className="page__sub" style={{ marginBottom: 8 }}>A few more details</div>
                <div className="grid2">
                  {conditionalFields.map((f) => (
                    <ConditionalField key={f.key} field={f} value={details[f.key] ?? ""}
                      error={errorFor(f.key)} onChange={(v) => setDetail(f.key, v)} />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* STEP 2 — DETAILS (requester + urgency + needed-by) */}
        {step === 2 && (
          <section aria-labelledby="step-h">
            <h2 id="step-h" className="card__title" ref={headingRef} tabIndex={-1}>Your details & timing</h2>

            <div className="readonly-grid" aria-label="Your details">
              <ReadonlyField label="Requester" value={currentUser.name} />
              <ReadonlyField label="Email" value={currentUser.email} />
              <ReadonlyField label="Employee ID" value={currentUser.employeeId} />
              <ReadonlyField label="Department" value={department} />
            </div>

            <Field label="Jurisdiction" htmlFor="jur" hint="Determines the working-day calendar for the SLA.">
              <Select id="jur" value={form.jurisdiction} onChange={(e) => set("jurisdiction", e.target.value as Jurisdiction)}>
                {JURISDICTIONS.map((j) => <option key={j} value={j}>{JURISDICTION_LABELS[j]}</option>)}
              </Select>
            </Field>

            <Field label="How urgent is this?" hint={URGENCY_NOTE}>
              <div className="optiongrid" role="radiogroup" aria-label="Business urgency">
                {BUSINESS_URGENCIES.map((u) => (
                  <button key={u} type="button" role="radio" aria-checked={form.businessUrgency === u}
                    className={`option${form.businessUrgency === u ? " is-on" : ""}`}
                    onClick={() => set("businessUrgency", u as BusinessUrgency)}>
                    <div>{u}</div>
                    <div className="small muted" style={{ fontWeight: 500 }}>{URGENCY_HELP[u]}</div>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Needed by" htmlFor="need" hint="When do you need this resolved?">
              <TextInput id="need" type="date" value={form.neededByDate?.slice(0, 10) ?? ""}
                onChange={(e) => set("neededByDate", e.target.value ? new Date(`${e.target.value}T00:00:00.000Z`).toISOString() : null)} />
            </Field>

            {tight && (
              <Field label="Why is this needed sooner?" htmlFor="just" error={errorFor("neededByJustification")}
                hint="Your needed-by date is tighter than the standard turnaround — Legal reviews expedite requests.">
                <TextArea id="just" rows={2} value={form.neededByJustification ?? ""} aria-invalid={!!errorFor("neededByJustification")}
                  onChange={(e) => set("neededByJustification", e.target.value)} />
              </Field>
            )}
          </section>
        )}

        {/* STEP 3 — ATTACHMENTS */}
        {step === 3 && (
          <section aria-labelledby="step-h">
            <h2 id="step-h" className="card__title" ref={headingRef} tabIndex={-1}>Attachments</h2>
            <p className="muted">Add anything that helps Legal — drafts, term sheets, correspondence. Optional.</p>
            <AttachmentsField
              attachments={attachments}
              onAdd={(added) => set("attachments", [...attachments, ...added])}
              onRemove={(i) => set("attachments", attachments.filter((_, idx) => idx !== i))}
            />
          </section>
        )}

        {/* STEP 4 — REVIEW */}
        {step === 4 && (
          <section aria-labelledby="step-h">
            <h2 id="step-h" className="card__title" ref={headingRef} tabIndex={-1}>Review & submit</h2>
            <p className="muted">Check everything below, then submit. You can edit any section.</p>

            <ReviewSection title="What you need" onEdit={() => goto(0)}>
              <ReviewRow label="Description" value={form.description || "—"} />
              <ReviewRow label="Business context" value={form.businessContext || "—"} />
            </ReviewSection>

            <ReviewSection title="Request type" onEdit={() => goto(1)}>
              <ReviewRow label="Type" value={form.requesterCategory ? requesterCategoryLabel(form.requesterCategory) : "—"} />
              {conditionalFields.map((f) => (
                <ReviewRow key={f.key} label={f.label} value={details[f.key]?.trim() || "—"} />
              ))}
            </ReviewSection>

            <ReviewSection title="Your details & timing" onEdit={() => goto(2)}>
              <ReviewRow label="Requester" value={`${currentUser.name} · ${currentUser.email}`} />
              <ReviewRow label="Department" value={department} />
              <ReviewRow label="Jurisdiction" value={JURISDICTION_LABELS[form.jurisdiction]} />
              <ReviewRow label="Business urgency" value={form.businessUrgency} />
              <ReviewRow label="Needed by" value={form.neededByDate ? new Date(form.neededByDate).toLocaleDateString() : "No fixed date"} />
              {form.neededByJustification?.trim() && <ReviewRow label="Justification" value={form.neededByJustification} />}
            </ReviewSection>

            <ReviewSection title="Attachments" onEdit={() => goto(3)}>
              {attachments.length === 0 ? <ReviewRow label="Files" value="None" /> : (
                <ul className="filelist">
                  {attachments.map((a, i) => (
                    <li key={i} className="filerow"><Icon name="file" size={15} /><span style={{ flex: 1 }}>{a.name}</span><span className="muted small">{formatBytes(a.sizeBytes)}</span></li>
                  ))}
                </ul>
              )}
            </ReviewSection>
          </section>
        )}

        {/* footer nav */}
        <div className="actions" style={{ justifyContent: "space-between", marginTop: 20 }}>
          <div>
            {step > 0 ? <Button variant="ghost" icon="arrowLeft" onClick={back}>Back</Button>
              : <Button variant="ghost" onClick={() => navigate("/requests")}>Cancel</Button>}
          </div>
          <div className="actions" style={{ margin: 0 }}>
            <span className="muted small" style={{ marginRight: 8 }}>Step {step + 1} of {STEP_LABELS.length}</span>
            {step < MAX_STEP
              ? <Button variant="primary" iconRight="arrowRight" onClick={next}>Continue</Button>
              : <Button variant="primary" icon="check" onClick={submit}>Submit request</Button>}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ---------- sub-components ---------- */

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="readonly-field">
      <span className="readonly-field__label">{label}</span>
      <span className="readonly-field__value">{value}</span>
    </div>
  );
}

function ConditionalField({ field, value, error, onChange }: {
  field: IntakeField; value: string; error?: string; onChange: (v: string) => void;
}) {
  const id = `cf-${field.key}`;
  const full = field.type === "textarea";
  return (
    <div style={full ? { gridColumn: "1 / -1" } : undefined}>
      <Field label={field.label + (field.required ? "" : " (optional)")} htmlFor={id} hint={field.hint} error={error}>
        {field.type === "textarea" ? (
          <TextArea id={id} rows={3} value={value} placeholder={field.placeholder} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} />
        ) : field.type === "select" ? (
          <Select id={id} value={value} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)}>
            <option value="">Select…</option>
            {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        ) : field.type === "yesno" ? (
          <div className="segmented" role="radiogroup" aria-label={field.label}>
            {["Yes", "No"].map((o) => (
              <button key={o} type="button" role="radio" aria-checked={value === o}
                className={value === o ? "active" : ""} onClick={() => onChange(o)}>{o}</button>
            ))}
          </div>
        ) : (
          <TextInput id={id} type={field.type === "date" ? "date" : "text"} value={value}
            placeholder={field.placeholder} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} />
        )}
      </Field>
    </div>
  );
}

function AttachmentsField({ attachments, onAdd, onRemove }: {
  attachments: DraftAttachment[]; onAdd: (a: DraftAttachment[]) => void; onRemove: (i: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<string[]>([]);

  const handle = (fileList: FileList | null) => {
    if (!fileList) return;
    const good: DraftAttachment[] = [];
    const bad: string[] = [];
    for (const f of Array.from(fileList)) {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (ALLOWED_EXT.has(ext)) good.push({ name: f.name, sizeBytes: f.size, contentType: f.type || null });
      else bad.push(f.name);
    }
    if (good.length) onAdd(good);
    setRejected(bad);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <input ref={inputRef} type="file" multiple accept={ACCEPT} style={{ display: "none" }}
        onChange={(e) => handle(e.target.files)} />
      <div className="fileupload" role="button" tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handle(e.dataTransfer.files); }}>
        <Icon name="upload" size={20} />
        <div><b>Click to upload</b> or drag & drop</div>
        <div className="small muted">PDF, DOC(X), XLS(X), PPT(X), PNG, JPG</div>
      </div>

      {rejected.length > 0 && (
        <div className="field__error" role="alert" style={{ marginTop: 8 }}>
          Couldn't add {rejected.join(", ")} — unsupported file type.
        </div>
      )}

      {attachments.length > 0 && (
        <ul className="filelist" style={{ marginTop: 12 }}>
          {attachments.map((a, i) => (
            <li key={i} className="filerow">
              <Icon name="file" size={15} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
              <span className="muted small">{formatBytes(a.sizeBytes)}</span>
              <Button variant="ghost" size="sm" icon="x" aria-label={`Remove ${a.name}`} onClick={() => onRemove(i)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="review-section">
      <div className="review-section__head">
        <b>{title}</b>
        <button className="linkbtn" onClick={onEdit}>Edit</button>
      </div>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="review-row">
      <span className="review-row__label">{label}</span>
      <span className="review-row__value">{value}</span>
    </div>
  );
}

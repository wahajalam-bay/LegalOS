import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import { REQUESTER_CATEGORIES } from "@/domain/categories";
import { BUSINESS_URGENCIES, JURISDICTIONS, JURISDICTION_LABELS } from "@/domain/models/enums";
import type { BusinessUrgency, Jurisdiction } from "@/domain/models/enums";
import type { RequesterCategoryKey } from "@/domain/categories";
import type { NewRequestInput, FieldError } from "@/lib/validation";
import { validateNewRequest } from "@/lib/validation";
import { Button, Card, Field, PageHeader, Select, TextArea, TextInput } from "@/ui/components";

export function NewRequestPage() {
  const { services, currentUser, reload } = useApp();
  const navigate = useNavigate();

  const [form, setForm] = useState<NewRequestInput>({
    requesterCategory: "",
    description: "",
    businessContext: "",
    businessUrgency: "Important",
    neededByDate: null,
    neededByJustification: null,
    jurisdiction: currentUser.jurisdiction,
  });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = <K extends keyof NewRequestInput>(k: K, v: NewRequestInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const errorFor = (field: keyof NewRequestInput) => errors.find((e) => e.field === field)?.message;

  const tight = useMemo(() => services.requests.previewTight(form), [services, form]);

  const submit = () => {
    const problems = validateNewRequest(form, { requiresJustification: tight });
    setErrors(problems);
    if (problems.length) return;
    const res = services.requests.create(form, currentUser.id);
    if (!res.ok) { setSubmitError(res.error); return; }
    reload();
    navigate(`/requests/${res.value.id}`);
  };

  return (
    <div className="page page--narrow">
      <PageHeader title="Raise a legal request" subtitle="Describe what you need in plain language — Legal works out the category." />

      <Card>
        <Field label="Which best describes this?" error={errorFor("requesterCategory")}>
          <div className="optiongrid" role="radiogroup" aria-label="Request type">
            {REQUESTER_CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={form.requesterCategory === c.key}
                className={`option${form.requesterCategory === c.key ? " is-on" : ""}`}
                onClick={() => set("requesterCategory", c.key as RequesterCategoryKey)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="What do you need?" htmlFor="desc" error={errorFor("description")}>
          <TextInput id="desc" value={form.description} placeholder="e.g. Signing a deal with a new supplier"
            onChange={(e) => set("description", e.target.value)} />
        </Field>

        <Field label="A bit of context" htmlFor="ctx" hint="Commercial objective, counterparty, what's agreed so far." error={errorFor("businessContext")}>
          <TextArea id="ctx" rows={4} value={form.businessContext} onChange={(e) => set("businessContext", e.target.value)} />
        </Field>

        <div className="grid2">
          <Field label="How urgent is this?" htmlFor="urg">
            <Select id="urg" value={form.businessUrgency} onChange={(e) => set("businessUrgency", e.target.value as BusinessUrgency)}>
              {BUSINESS_URGENCIES.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>
          <Field label="Needed by" htmlFor="need">
            <TextInput id="need" type="date" value={form.neededByDate?.slice(0, 10) ?? ""}
              onChange={(e) => set("neededByDate", e.target.value ? new Date(`${e.target.value}T00:00:00.000Z`).toISOString() : null)} />
          </Field>
        </div>

        <Field label="Jurisdiction" htmlFor="jur" hint="Determines the working-day calendar for the SLA.">
          <Select id="jur" value={form.jurisdiction} onChange={(e) => set("jurisdiction", e.target.value as Jurisdiction)}>
            {JURISDICTIONS.map((j) => <option key={j} value={j}>{JURISDICTION_LABELS[j]}</option>)}
          </Select>
        </Field>

        {tight && (
          <Field label="Business justification" htmlFor="just" error={errorFor("neededByJustification")}
            hint="Your needed-by date is tighter than the standard turnaround — Legal reviews expedite requests.">
            <TextArea id="just" rows={2} value={form.neededByJustification ?? ""}
              onChange={(e) => set("neededByJustification", e.target.value)} />
          </Field>
        )}

        {submitError && <div className="field__error" role="alert">{submitError}</div>}

        <div className="actions">
          <Button variant="ghost" onClick={() => navigate("/requests")}>Cancel</Button>
          <Button variant="primary" onClick={submit}>Submit request</Button>
        </div>
      </Card>
    </div>
  );
}

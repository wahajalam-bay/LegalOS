import { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { can } from "@/permissions/permissions";
import { legalCategoryFor, requesterCategoryLabel } from "@/domain/categories";
import type { RequesterCategoryKey } from "@/domain/categories";
import { LEGAL_CATEGORIES, PRIORITIES } from "@/domain/models/enums";
import type { BusinessUrgency, LegalCategory, Priority } from "@/domain/models/enums";
import type { UserId } from "@/domain/models/ids";
import { Badge, Button, Card, EmptyState, Field, PageHeader, Select, TextArea } from "@/ui/components";

const URGENCY_PRIORITY: Record<BusinessUrgency, Priority> = { Emergency: "Urgent", "Time-critical": "High", Important: "Medium", Routine: "Low" };

export function TriagePage() {
  const { repos, services, currentUser, reload } = useApp();
  const queue = repos.requests.list().filter((r) => r.status === "Submitted");
  const [selectedId, setSelectedId] = useState<string | null>(queue[0]?.id ?? null);

  const lawyers = useMemo(() => repos.users.list().filter((u) => u.role !== "requester"), [repos]);

  if (!can(currentUser, "request.triage")) {
    return <div className="page"><EmptyState title="Triage is a lead's queue" message="Categorisation and assignment are done by the Director or an AD / Senior Manager." /></div>;
  }

  const current = queue.find((r) => r.id === selectedId) ?? queue[0] ?? null;

  return (
    <div className="page">
      <PageHeader title="Triage" subtitle="Confirm the category, priority and owner. Overrides are logged." />
      {queue.length === 0 ? (
        <Card><EmptyState title="Triage queue is clear" message="New requests appear here for categorisation." /></Card>
      ) : (
        <div className="detailgrid">
          <div className="detailgrid__side">
            <Card className="card--flush">
              <ul className="queue">
                {queue.map((r) => (
                  <li key={r.id}>
                    <button className={`queue__row${current?.id === r.id ? " is-on" : ""}`} onClick={() => setSelectedId(r.id)}>
                      <span className="mono">{r.id}</span>
                      <span className="queue__title">{r.description}</span>
                      <Badge tone="amber">{r.businessUrgency}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <div className="detailgrid__main">
            {current && <TriagePanel key={current.id}
              request={current}
              proposedCategory={legalCategoryFor(current.requesterCategory)}
              proposedPriority={URGENCY_PRIORITY[current.businessUrgency]}
              lawyers={lawyers.map((l) => ({ id: l.id, name: l.name }))}
              onDecide={(d) => {
                const res = services.requests.applyTriage(current.id, {
                  legalCategory: d.legalCategory, priority: d.priority,
                  assignedLawyerId: d.assignedLawyerId as UserId, overrideReason: d.overrideReason,
                }, currentUser.id);
                if (res.ok) { reload(); setSelectedId(null); }
                return res;
              }}
            />}
          </div>
        </div>
      )}
    </div>
  );
}

function TriagePanel(props: {
  request: { id: string; description: string; businessContext: string; requesterCategory: RequesterCategoryKey };
  proposedCategory: LegalCategory;
  proposedPriority: Priority;
  lawyers: { id: string; name: string }[];
  onDecide: (d: { legalCategory: LegalCategory; priority: Priority; assignedLawyerId: string; overrideReason: string | null }) => { ok: boolean; error?: string };
}) {
  const { request, proposedCategory, proposedPriority, lawyers, onDecide } = props;
  const [category, setCategory] = useState<LegalCategory>(proposedCategory);
  const [priority, setPriority] = useState<Priority>(proposedPriority);
  const [assignee, setAssignee] = useState<string>(lawyers[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const changed = category !== proposedCategory || priority !== proposedPriority;

  const decide = () => {
    if (!assignee) { setError("Choose an owner."); return; }
    if (changed && !reason.trim()) { setError("An override reason is required."); return; }
    const res = onDecide({ legalCategory: category, priority, assignedLawyerId: assignee, overrideReason: changed ? reason.trim() : null });
    if (!res.ok) setError(res.error ?? "Failed");
  };

  return (
    <Card>
      <div className="mono muted">{request.id}</div>
      <h2 className="card__title">{request.description}</h2>
      <p className="muted">{request.businessContext}</p>
      <p className="callout">System proposal — <b>{proposedCategory}</b> · <b>{proposedPriority}</b> (from “{requesterCategoryLabel(request.requesterCategory)}”)</p>

      <div className="grid2">
        <Field label="Legal category">
          <Select value={category} onChange={(e) => setCategory(e.target.value as LegalCategory)}>
            {LEGAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Assign to">
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          {lawyers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </Field>
      {changed && (
        <Field label="Override reason" hint="Logged against the request.">
          <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
      {error && <div className="field__error" role="alert">{error}</div>}
      <div className="actions">
        <Button variant="primary" onClick={decide}>{changed ? "Save override & assign" : "Accept & assign"}</Button>
      </div>
    </Card>
  );
}

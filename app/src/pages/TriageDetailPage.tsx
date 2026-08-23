import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import { brandId, type RequestId, type UserId } from "@/domain/models/ids";
import { can, canViewRequest } from "@/permissions/permissions";
import { canTransition } from "@/domain/lifecycle";
import { requesterCategoryLabel } from "@/domain/categories";
import { conditionalFieldsFor } from "@/domain/intake";
import { proposeTriage, computeFlags, similarMatters, ASSIGNABLE_ROLES } from "@/domain/triage";
import { LEGAL_CATEGORIES, PRIORITIES } from "@/domain/models/enums";
import type { LegalCategory, Priority } from "@/domain/models/enums";
import type { Request } from "@/domain/models/request";
import { Badge, Button, Card, ErrorState, Field, PageHeader, Select, TextArea } from "@/ui/components";
import { Icon } from "@/ui/icons";
import { ConfirmDialog } from "@/ui/overlays";
import { formatBytes } from "@/ui/util";
import { useToast } from "@/ui/toast";

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

export function TriageDetailPage() {
  const { repos, currentUser } = useApp();
  const params = useParams();
  const id = brandId<"RequestId">(params.id ?? "") as RequestId;
  const req = repos.requests.get(id);

  if (!can(currentUser, "request.triage")) {
    return <div className="page"><ErrorState title="No access" message="Triage is restricted to the Director and designated managers." /></div>;
  }
  if (!req || !canViewRequest(currentUser, req)) {
    return <div className="page"><ErrorState title="Request not found" message={`No request with id ${params.id}.`} /></div>;
  }
  return <TriageWorkspace key={req.id} req={req} />;
}

function TriageWorkspace({ req }: { req: Request }) {
  const { repos, services, currentUser, reload } = useApp();
  const navigate = useNavigate();
  const toast = useToast();

  const all = repos.requests.list();
  const users = repos.users.list();
  const proposal = useMemo(() => proposeTriage(req, users, all), [req, users, all]);
  const flags = useMemo(() => computeFlags(req, all, Date.now()), [req, all]);
  const similar = similarMatters(req);
  const assignable = users.filter((u) => u.active && ASSIGNABLE_ROLES.includes(u.role));

  const [category, setCategory] = useState<LegalCategory>(proposal.category);
  const [priority, setPriority] = useState<Priority>(proposal.priority);
  const [assignee, setAssignee] = useState<string>(proposal.assigneeId ?? assignable[0]?.id ?? "");
  const [slaOverride, setSlaOverride] = useState<string>(""); // YYYY-MM-DD, empty = use calculated
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [rmiOpen, setRmiOpen] = useState(false);
  const [rmiMsg, setRmiMsg] = useState("");

  const sla = services.requests.previewSla(req, category, priority);
  const paused = req.pausePeriods.some((p) => p.end === null);
  const changed =
    category !== proposal.category ||
    priority !== proposal.priority ||
    assignee !== (proposal.assigneeId ?? "") ||
    slaOverride !== "";

  const dept = repos.departments.get(req.departmentId)?.name ?? "—";
  const conditional = conditionalFieldsFor(req.requesterCategory).filter((f) => req.intakeDetails[f.key]?.trim());
  const canConvert = can(currentUser, "request.convertToMatter") && canTransition(req.status, "Converted to Matter");

  const submit = () => {
    if (!assignee) { setError("Choose an owner."); return; }
    if (changed && !reason.trim()) { setError("A reason is required to override the system proposal."); return; }
    const res = services.requests.applyTriage(req.id, {
      legalCategory: category, priority, assignedLawyerId: assignee as UserId,
      categoryReason: category !== proposal.category ? reason.trim() : null,
      priorityReason: priority !== proposal.priority ? reason.trim() : null,
      assigneeReason: assignee !== (proposal.assigneeId ?? "") ? reason.trim() : null,
      slaDueDateOverride: slaOverride ? new Date(`${slaOverride}T00:00:00.000Z`).toISOString() : null,
      slaReason: slaOverride ? reason.trim() : null,
    }, currentUser.id);
    if (!res.ok) { setError(res.error); toast.push(res.error, "error"); return; }
    toast.push(changed ? "Triaged with overrides — logged" : "Triaged & assigned", "success");
    reload();
    navigate("/requests/triage");
  };

  const doConvert = () => {
    const res = services.requests.convertToMatter(req.id, currentUser.id);
    setConfirmConvert(false);
    if (!res.ok) { toast.push(res.error, "error"); return; }
    toast.push("Converted to a matter", "success");
    reload();
    navigate(`/requests/${req.id}`);
  };

  const doRmi = () => {
    const res = services.requests.requestMoreInfo(req.id, rmiMsg, currentUser.id);
    setRmiOpen(false);
    if (!res.ok) { toast.push(res.error, "error"); return; }
    toast.push("Sent back to the requester for more information", "success");
    reload();
    navigate("/requests/triage");
  };

  return (
    <div className="page">
      <PageHeader title={`Triage ${req.id}`} subtitle={req.description}
        actions={<Button variant="ghost" icon="arrowLeft" onClick={() => navigate("/requests/triage")}>Back to queue</Button>} />

      {flags.length > 0 && (
        <div className="flagbar">
          {flags.map((f, i) => (
            <div key={i} className={`flag flag--${f.severity}`}>
              <Icon name={f.severity === "info" ? "alert" : "alertTriangle"} size={15} />
              <div>
                <b>{f.label}</b> — {f.detail}
                <div className="flag__src">Source: {f.source}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="triagegrid">
        {/* LEFT — original request */}
        <div className="triagegrid__col">
          <Card>
            <h3 className="card__title">Original request</h3>
            <div className="kv">
              <div><span>What they need</span><b>{req.description}</b></div>
              <div><span>Request type</span><b>{requesterCategoryLabel(req.requesterCategory)}</b></div>
              <div><span>Requester</span><b>{repos.users.get(req.requesterId)?.name ?? req.requesterId}</b></div>
              <div><span>Department</span><b>{dept}</b></div>
              <div><span>Business urgency</span><b>{req.businessUrgency}</b></div>
              <div><span>Needed by</span><b>{req.neededByDate ? new Date(req.neededByDate).toLocaleDateString() : "No fixed date"}</b></div>
              <div><span>Jurisdiction</span><b>{req.jurisdiction}</b></div>
              <div><span>Submitted</span><b>{fmtDate(req.submittedAt)}</b></div>
            </div>
            <div className="field__label" style={{ marginTop: 12 }}>Business context</div>
            <p className="muted" style={{ marginTop: 4 }}>{req.businessContext}</p>
            {req.neededByJustification && <p className="callout">Expedite justification: {req.neededByJustification}</p>}

            {conditional.length > 0 && (
              <>
                <div className="field__label" style={{ marginTop: 12 }}>Details provided</div>
                <div className="kv">
                  {conditional.map((f) => <div key={f.key}><span>{f.label}</span><b>{req.intakeDetails[f.key]}</b></div>)}
                </div>
              </>
            )}

            {req.attachments.length > 0 && (
              <>
                <div className="field__label" style={{ marginTop: 12 }}>Attachments</div>
                <ul className="filelist" style={{ marginTop: 6 }}>
                  {req.attachments.map((a) => (
                    <li key={a.id} className="filerow"><Icon name="file" size={15} /><span style={{ flex: 1 }}>{a.name}</span><span className="muted small">{formatBytes(a.sizeBytes)}</span></li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card>
            <h3 className="card__title">Similar past matters</h3>
            {similar.length === 0 ? (
              <p className="muted">No similar past matters found.</p>
            ) : (
              <>
                <p className="muted small">{similar.length} similar past request{similar.length === 1 ? "" : "s"} — illustrative retrieval; each carries a reference.</p>
                <ul className="precedents">
                  {similar.map((m) => (
                    <li key={m.reference} className="precedent">
                      <div className="precedent__head"><span className="mono">{m.reference}</span><Badge tone={m.status === "Completed" ? "green" : "gray"}>{m.status}</Badge></div>
                      <div className="precedent__title">{m.title}</div>
                      <div className="muted small">{m.reason}</div>
                      <div className="precedent__src">Source: {m.source}</div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>

        {/* RIGHT — system proposal + decision */}
        <div className="triagegrid__col">
          <Card>
            <h3 className="card__title">System proposal</h3>
            <p className="muted small">The system proposes; you confirm or override. Overrides require a reason and are logged.</p>

            <ProposalRow label="Legal category" system={proposal.category} rationale={proposal.categoryRationale}
              overridden={category !== proposal.category} onReset={() => setCategory(proposal.category)}>
              <Select value={category} onChange={(e) => setCategory(e.target.value as LegalCategory)}>
                {LEGAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </ProposalRow>

            <ProposalRow label="Priority" system={proposal.priority} rationale={proposal.priorityRationale}
              overridden={priority !== proposal.priority} onReset={() => setPriority(proposal.priority)}>
              <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </ProposalRow>

            {/* SLA */}
            <div className="proposal">
              <div className="proposal__label">SLA</div>
              <div className="proposal__system">
                {sla.businessDays != null
                  ? <>Target <b>{sla.businessDays} business days</b> · due <b>{slaOverride ? new Date(`${slaOverride}T00:00:00.000Z`).toLocaleDateString() : fmtDate(sla.dueDate)}</b></>
                  : <span className="muted">No SLA configured for this category/priority.</span>}
                <span className={`pill pill--${slaOverride ? "amber" : paused ? "gray" : "green"}`} style={{ marginLeft: 8 }}>
                  {slaOverride ? "Overridden" : paused ? "Clock paused" : "Clock running"}
                </span>
              </div>
              <div className="sla-override">
                <Field label="Override due date" htmlFor="slaov" hint="Leave blank to use the calculated date.">
                  <input id="slaov" type="date" className="input" value={slaOverride} onChange={(e) => setSlaOverride(e.target.value)} />
                </Field>
                {slaOverride && <button className="linkbtn" onClick={() => setSlaOverride("")}>Reset to calculated</button>}
              </div>
            </div>

            <ProposalRow label="Suggested assignee" system={proposal.assigneeId ? (repos.users.get(proposal.assigneeId)?.name ?? "—") : "None available"}
              rationale={proposal.assigneeRationale}
              overridden={assignee !== (proposal.assigneeId ?? "")} onReset={() => setAssignee(proposal.assigneeId ?? "")}>
              <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Unassigned</option>
                {assignable.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </ProposalRow>

            {changed && (
              <Field label="Reason for override" hint="Recorded against the request (old value, new value, you, timestamp).">
                <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!error && changed && !reason.trim()} />
              </Field>
            )}

            {error && <div className="field__error" role="alert">{error}</div>}

            <div className="actions actions--start" style={{ flexWrap: "wrap", marginTop: 14 }}>
              <Button variant="primary" icon={changed ? "alertTriangle" : "check"} onClick={submit}>
                {changed ? "Override & assign" : "Accept & assign"}
              </Button>
              <Button variant="ghost" icon="arrowRight" onClick={() => setRmiOpen(true)}>Request more information</Button>
              <Button variant="ghost" icon="folder" onClick={() => setConfirmConvert(true)} disabled={!canConvert}
                title={canConvert ? undefined : "Available once the request can be converted"}>Convert to matter</Button>
            </div>
          </Card>
        </div>
      </div>

      {confirmConvert && (
        <ConfirmDialog title="Convert to matter" confirmLabel="Convert"
          message="This creates a matter from the request. Requests are not converted automatically — confirm this is intended."
          onConfirm={doConvert} onCancel={() => setConfirmConvert(false)} />
      )}

      {rmiOpen && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Request more information"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setRmiOpen(false); }}
          style={{ alignItems: "flex-start", justifyContent: "center", paddingTop: "9vh" }}>
          <div className="modal" style={{ width: 480 }}>
            <div className="modal__head"><div className="modal__title">Request more information</div>
              <Button variant="ghost" size="sm" icon="x" aria-label="Close" onClick={() => setRmiOpen(false)} /></div>
            <div className="modal__body">
              <Field label="Message to the requester" hint="Sent to the requester; pauses the SLA clock until they respond.">
                <TextArea rows={3} value={rmiMsg} onChange={(e) => setRmiMsg(e.target.value)} placeholder="What do you need from them to proceed?" />
              </Field>
            </div>
            <div className="modal__foot">
              <Button variant="ghost" onClick={() => setRmiOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={doRmi} disabled={!rmiMsg.trim()}>Send</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProposalRow({ label, system, rationale, overridden, onReset, children }: {
  label: string; system: string; rationale: string; overridden: boolean; onReset: () => void; children: ReactNode;
}) {
  return (
    <div className="proposal">
      <div className="proposal__label">{label}</div>
      <div className="proposal__system">System proposed: <b>{system}</b> <span className="muted">— {rationale}</span></div>
      {children}
      <div className="proposal__foot">
        {overridden
          ? <><Badge tone="amber">Overridden</Badge> <button className="linkbtn" onClick={onReset}>Accept proposal</button></>
          : <Badge tone="green">Accepted</Badge>}
      </div>
    </div>
  );
}

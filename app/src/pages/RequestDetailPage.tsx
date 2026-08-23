import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import { brandId, type RequestId } from "@/domain/models/ids";
import { canViewInternal, canViewRequest, can, allowedTransitionsFor } from "@/permissions/permissions";
import { requesterCategoryLabel } from "@/domain/categories";
import { conditionalFieldsFor } from "@/domain/intake";
import { escalationLevelFor } from "@/domain/escalation";
import type { RequestStatus } from "@/domain/models/enums";
import { Badge, Button, Card, ErrorState, Field, PageHeader, SlaIndicator, StatusTimeline, TextArea, slaStateOf } from "@/ui/components";
import { Icon } from "@/ui/icons";
import { formatBytes } from "@/ui/util";
import { useToast } from "@/ui/toast";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const RISK_LABEL = { none: "Low", warning: "At risk", breach: "Breached" } as const;

export function RequestDetailPage() {
  const params = useParams();
  const { repos, services, currentUser, reload } = useApp();
  const [comment, setComment] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const toast = useToast();

  const id = brandId<"RequestId">(params.id ?? "") as RequestId;
  const req = repos.requests.get(id);

  if (!req) return <div className="page"><ErrorState title="Request not found" message={`No request with id ${params.id}.`} /></div>;
  if (!canViewRequest(currentUser, req)) return <div className="page"><ErrorState title="No access" message="You don't have permission to view this request." /></div>;

  const internalVisible = canViewInternal(currentUser, req);
  const isOwnRequester = !internalVisible && req.requesterId === currentUser.id;
  const owner = req.assignment ? repos.users.get(req.assignment.lawyerId) : null;
  const sla = services.requests.slaStatusFor(req);
  const ageDays = Math.max(0, Math.round((Date.now() - new Date(req.submittedAt).getTime()) / 86_400_000));
  const delivered = req.status === "Delivered" || req.status === "Closed";

  const run = (fn: () => { ok: boolean; error?: string }) => {
    const r = fn();
    if (!r.ok) { setActionError(r.error ?? "Action failed"); toast.push(r.error ?? "Action failed", "error"); }
    else { setActionError(null); reload(); toast.push("Request updated", "success"); }
  };

  const moves = allowedTransitionsFor(currentUser, req.status);
  const timelineSteps = req.statusHistory.map((h) => ({ status: h.to, at: h.at, reason: h.reason }));

  return (
    <div className="page">
      <PageHeader
        title={req.id}
        subtitle={requesterCategoryLabel(req.requesterCategory)}
        actions={<Link to="/requests"><Button variant="ghost">Back to list</Button></Link>}
      />

      <div className="detailgrid">
        <div className="detailgrid__main">
          <Card>
            <h2 className="card__title">{req.description}</h2>
            <p className="muted">{req.businessContext}</p>
            <div className="kv">
              <div><span>Type</span><b>{requesterCategoryLabel(req.requesterCategory)}</b></div>
              <div><span>Status</span><b>{req.status}</b></div>
              <div><span>Submitted</span><b>{new Date(req.submittedAt).toLocaleDateString()}</b></div>
              <div><span>Urgency</span><b>{req.businessUrgency}</b></div>
              <div><span>Needed by</span><b>{req.neededByDate ? new Date(req.neededByDate).toLocaleDateString() : "—"}</b></div>
              {req.slaDueDate && <div><span>Expected completion</span><b>{new Date(req.slaDueDate).toLocaleDateString()}</b></div>}
              {/* Internal-only fields — never shown to the requester (PRD §3.2 privacy) */}
              {internalVisible && <div><span>Legal category</span><b>{req.legalCategory}</b></div>}
              {internalVisible && <div><span>Priority</span><b>{req.priority}</b></div>}
              {internalVisible && <div><span>Owner</span><b>{owner ? owner.name : "Unassigned"}</b></div>}
            </div>
            {req.neededByJustification && <p className="callout">Expedite justification: {req.neededByJustification}</p>}
            {isOwnRequester && req.status === "Submitted" && (
              <p className="callout">Your request has been received and is awaiting triage. Legal will confirm the turnaround shortly.</p>
            )}
            {isOwnRequester && req.status === "Awaiting Requester" && (
              <p className="callout callout--warn"><b>Legal needs information from you.</b> Reply below to continue — your request is on hold until then.</p>
            )}
            {delivered && (
              <p className="callout callout--ok"><b>{req.status === "Delivered" ? "Delivered." : "Closed."}</b> {isOwnRequester ? "You can review the outcome in the conversation below." : "The requester has been notified."}</p>
            )}
            {req.matterId && <p className="callout callout--ok">Converted to matter <span className="mono">{req.matterId}</span></p>}
          </Card>

          {conditionalFieldsFor(req.requesterCategory).some((f) => req.intakeDetails[f.key]?.trim()) && (
            <Card>
              <h3 className="card__title">Details provided</h3>
              <div className="kv">
                {conditionalFieldsFor(req.requesterCategory)
                  .filter((f) => req.intakeDetails[f.key]?.trim())
                  .map((f) => <div key={f.key}><span>{f.label}</span><b>{req.intakeDetails[f.key]}</b></div>)}
              </div>
            </Card>
          )}

          {req.attachments.length > 0 && (
            <Card>
              <h3 className="card__title">Attachments</h3>
              <ul className="filelist">
                {req.attachments.map((a) => (
                  <li key={a.id} className="filerow">
                    <Icon name="file" size={15} />
                    <span style={{ flex: 1 }}>{a.name}</span>
                    <span className="muted small">{formatBytes(a.sizeBytes)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h3 className="card__title">Status timeline</h3>
            <StatusTimeline steps={timelineSteps} />
          </Card>

          <Card>
            <h3 className="card__title">Conversation</h3>
            {req.internal.comments.filter((c) => internalVisible || !c.internal).length === 0 && <p className="muted">No messages yet.</p>}
            {req.internal.comments.filter((c) => internalVisible || !c.internal).map((c) => (
              <div key={c.id} className="comment">
                <div className="comment__head">
                  {repos.users.get(c.authorId)?.name ?? "Unknown"}
                  {c.internal && <Badge tone="amber">internal</Badge>}
                  <span className="muted">{fmt(c.at)}</span>
                </div>
                <div>{c.body}</div>
              </div>
            ))}
            <Field label={isOwnRequester && req.status === "Awaiting Requester" ? "Reply to Legal" : "Add a message"}>
              <TextArea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Message the requester, or add an internal note…" />
            </Field>
            <div className="actions actions--start">
              {internalVisible && (
                <label className="check"><input type="checkbox" checked={internalNote} onChange={(e) => setInternalNote(e.target.checked)} /> internal note</label>
              )}
              <Button variant="primary" onClick={() => { if (comment.trim()) { run(() => services.requests.addComment(id, comment, internalVisible && internalNote, currentUser.id)); setComment(""); } }}>Post</Button>
            </div>
          </Card>
        </div>

        <aside className="detailgrid__side">
          {internalVisible && (
            <Card>
              <h3 className="card__title">SLA &amp; TAT</h3>
              <div style={{ marginBottom: 10 }}><SlaIndicator state={slaStateOf(req)} /></div>
              {sla ? (
                <div className="kv">
                  <div><span>Target</span><b>{sla.target} business days</b></div>
                  <div><span>Consumed</span><b>{sla.consumedBusinessDays} bd</b></div>
                  <div><span>Remaining</span><b>{sla.remainingBusinessDays} bd</b></div>
                  <div><span>Due date</span><b>{sla.dueDate.toLocaleDateString()}</b></div>
                  <div><span>Age</span><b>{ageDays} days</b></div>
                  <div><span>Paused</span><b>{sla.pausedBusinessDays} bd</b></div>
                  <div><span>Breach risk</span><b>{RISK_LABEL[escalationLevelFor(sla)]}</b></div>
                  <div><span>Owner</span><b>{owner ? owner.name : "Unassigned"}</b></div>
                </div>
              ) : <p className="muted">The SLA is set when the request is triaged.</p>}
            </Card>
          )}

          <Card>
            <h3 className="card__title">Actions</h3>
            {actionError && <div className="field__error" role="alert">{actionError}</div>}
            {req.status === "Submitted" && can(currentUser, "request.triage") && (
              <Link to={`/requests/triage/${req.id}`}><Button variant="primary">Open in triage</Button></Link>
            )}
            {moves.filter((m) => m !== "Converted to Matter").map((m: RequestStatus) => (
              <Button key={m} onClick={() => run(() => services.requests.transition(id, m, currentUser.id))}>Move to {m}</Button>
            ))}
            {can(currentUser, "request.convertToMatter") && moves.includes("Converted to Matter") && (
              <Button variant="primary" onClick={() => run(() => services.requests.convertToMatter(id, currentUser.id))}>Convert to matter</Button>
            )}
            {moves.length === 0 && req.status !== "Submitted" && <p className="muted">No actions available for your role.</p>}
          </Card>

          {internalVisible && (
            <Card>
              <h3 className="card__title">Audit trail</h3>
              <ol className="audit">
                {repos.audit.list(req.id).map((e) => (
                  <li key={e.id}>
                    <b>{e.action.replace("request.", "")}</b>
                    <span className="muted"> — {repos.users.get(e.actorId)?.name ?? e.actorId} · {fmt(e.at)}</span>
                    {(e.previousValue || e.newValue) && <div className="muted small">{e.previousValue ?? "—"} → {e.newValue ?? "—"}{e.reason ? ` (${e.reason})` : ""}</div>}
                  </li>
                ))}
                {repos.audit.list(req.id).length === 0 && <li className="muted">No audit events.</li>}
              </ol>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

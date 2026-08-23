import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import { brandId, type RequestId } from "@/domain/models/ids";
import { canViewInternal, canViewRequest, can } from "@/permissions/permissions";
import { nextStatuses } from "@/domain/lifecycle";
import { requesterCategoryLabel } from "@/domain/categories";
import type { RequestStatus } from "@/domain/models/enums";
import { Badge, Button, Card, ErrorState, Field, PageHeader, TextArea } from "@/ui/components";
import { useToast } from "@/ui/toast";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

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
  const owner = req.assignment ? repos.users.get(req.assignment.lawyerId) : null;

  const run = (fn: () => { ok: boolean; error?: string }) => {
    const r = fn();
    if (!r.ok) { setActionError(r.error ?? "Action failed"); toast.push(r.error ?? "Action failed", "error"); }
    else { setActionError(null); reload(); toast.push("Request updated", "success"); }
  };

  const moves = nextStatuses(req.status);

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
              <div><span>Legal category</span><b>{req.legalCategory}</b></div>
              <div><span>Priority</span><b>{req.priority}</b></div>
              <div><span>Status</span><b>{req.status}</b></div>
              <div><span>Jurisdiction</span><b>{req.jurisdiction}</b></div>
              <div><span>Urgency</span><b>{req.businessUrgency}</b></div>
              <div><span>Needed by</span><b>{req.neededByDate ? new Date(req.neededByDate).toLocaleDateString() : "—"}</b></div>
              <div><span>SLA due</span><b>{fmt(req.slaDueDate)}</b></div>
              <div><span>Owner</span><b>{owner ? owner.name : "Unassigned"}</b></div>
            </div>
            {req.neededByJustification && <p className="callout">Expedite justification: {req.neededByJustification}</p>}
            {req.matterId && <p className="callout callout--ok">Converted to matter <span className="mono">{req.matterId}</span></p>}
          </Card>

          <Card>
            <h3 className="card__title">Timeline</h3>
            <ol className="timeline">
              {req.statusHistory.map((h) => (
                <li key={h.id}><b>{h.to}</b><span className="muted"> — {fmt(h.at)}{h.reason ? ` · ${h.reason}` : ""}</span></li>
              ))}
            </ol>
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
            <Field label="Add a message">
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
          <Card>
            <h3 className="card__title">Actions</h3>
            {actionError && <div className="field__error" role="alert">{actionError}</div>}
            {req.status === "Submitted" && can(currentUser, "request.triage") && (
              <Link to="/requests/triage"><Button variant="primary">Triage this request</Button></Link>
            )}
            {can(currentUser, "request.changeStatus") && moves.filter((m) => m !== "Converted to Matter").map((m: RequestStatus) => (
              <Button key={m} onClick={() => run(() => services.requests.transition(id, m, currentUser.id))}>Move to {m}</Button>
            ))}
            {can(currentUser, "request.convertToMatter") && moves.includes("Converted to Matter") && (
              <Button variant="primary" onClick={() => run(() => services.requests.convertToMatter(id, currentUser.id))}>Convert to matter</Button>
            )}
            {!can(currentUser, "request.changeStatus") && req.status !== "Submitted" && <p className="muted">No actions available for your role.</p>}
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

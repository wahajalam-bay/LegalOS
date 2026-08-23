import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import { canViewRequest } from "@/permissions/permissions";
import { requesterCategoryLabel } from "@/domain/categories";
import type { Priority, RequestStatus } from "@/domain/models/enums";
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from "@/ui/components";

const PRIORITY_TONE: Record<Priority, "gray" | "blue" | "amber" | "red"> = { Low: "gray", Medium: "blue", High: "amber", Urgent: "red" };
const STATUS_TONE: Record<RequestStatus, "gray" | "blue" | "green" | "amber" | "purple"> = {
  Submitted: "amber", Categorised: "blue", Assigned: "blue", "In Progress": "blue",
  "Awaiting Requester": "amber", "Awaiting Approval": "purple", Delivered: "green", Closed: "gray", "Converted to Matter": "purple",
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

export function RequestsListPage() {
  const { repos, currentUser, version } = useApp();
  // The repository is the async seam — model a loading state even though the
  // local implementation resolves synchronously.
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 0); return () => clearTimeout(t); }, []);

  const rows = repos.requests.list().filter((r) => canViewRequest(currentUser, r));
  void version;

  return (
    <div className="page">
      <PageHeader
        title="Requests"
        subtitle={currentUser.role === "requester" ? "Your requests" : "The request queue"}
        actions={<Link to="/new"><Button variant="primary">New request</Button></Link>}
      />
      {loading ? (
        <Card><Spinner /></Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No requests yet"
            message="Raise the first request to see it here."
            action={<Link to="/new"><Button variant="primary">New request</Button></Link>}
          />
        </Card>
      ) : (
        <Card className="card--flush">
          <table className="table">
            <thead>
              <tr><th>ID</th><th>Type</th><th>Legal category</th><th>Priority</th><th>Status</th><th>SLA due</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono"><Link to={`/requests/${r.id}`}>{r.id}</Link></td>
                  <td>{requesterCategoryLabel(r.requesterCategory)}</td>
                  <td>{r.legalCategory}</td>
                  <td><Badge tone={PRIORITY_TONE[r.priority]}>{r.priority}</Badge></td>
                  <td><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge></td>
                  <td>{fmtDate(r.slaDueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

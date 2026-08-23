import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import { canViewRequest, isLegalRole } from "@/permissions/permissions";
import { requesterCategoryLabel } from "@/domain/categories";
import type { Request } from "@/domain/models/request";
import {
  Button, Card, EmptyState, PriorityBadge, SlaIndicator, Spinner, StatusBadge, Table, slaStateOf, type Column,
} from "@/ui/components";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

export function RequestsListPage({ scope }: { scope: "mine" | "all" | "assigned" }) {
  const { repos, currentUser, version } = useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 0); return () => clearTimeout(t); }, []);
  void version;

  const visible = repos.requests.list().filter((r) => canViewRequest(currentUser, r));
  const rows =
    scope === "mine" ? visible.filter((r) => r.requesterId === currentUser.id)
    : scope === "assigned" ? visible.filter((r) => r.assignment?.lawyerId === currentUser.id)
    : visible;

  const heading = scope === "mine" ? "My Requests" : scope === "assigned" ? "Assigned to Me" : "All Requests";

  const columns: Column<Request>[] = [
    { key: "id", header: "ID", render: (r) => <Link to={`/requests/${r.id}`} className="mono">{r.id}</Link> },
    { key: "type", header: "Type", render: (r) => requesterCategoryLabel(r.requesterCategory) },
    { key: "cat", header: "Legal category", render: (r) => r.legalCategory },
    { key: "prio", header: "Priority", render: (r) => <PriorityBadge priority={r.priority} /> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "sla", header: "SLA", render: (r) => <SlaIndicator state={slaStateOf(r)} /> },
    { key: "due", header: "SLA due", render: (r) => fmtDate(r.slaDueDate) },
  ];

  const canRaise = !isLegalRole(currentUser.role); // raising a request is a requester action

  return (
    <div>
      <div className="page__head">
        <div><h1 className="page__title">{heading}</h1></div>
        {canRaise && <Link to="/requests/new"><Button variant="primary" icon="plus">New request</Button></Link>}
      </div>

      {loading ? (
        <Card><Spinner /></Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState title="Nothing here yet" icon="inbox"
            message={scope === "mine" ? (canRaise ? "You haven't raised any requests." : "You haven't raised any requests. Legal requests are raised by business teams.") : "No requests match this view."}
            action={canRaise ? <Link to="/requests/new"><Button variant="primary">New request</Button></Link> : undefined} />
        </Card>
      ) : (
        <Card className="card--flush">
          <Table columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/requests/${r.id}`)} />
        </Card>
      )}
    </div>
  );
}

import { useNavigate } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import { can, canViewRequest } from "@/permissions/permissions";
import { requesterCategoryLabel } from "@/domain/categories";
import { proposeTriage } from "@/domain/triage";
import type { Request } from "@/domain/models/request";
import { Badge, Card, EmptyState, PageHeader, PriorityBadge, StatusBadge, Table, type Column } from "@/ui/components";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const daysAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));

interface Row {
  req: Request;
  requester: string;
  department: string;
  category: string;
  priority: Request["priority"];
  slaLabel: string;
  assignee: string;
}

export function TriageQueuePage() {
  const { repos, services, currentUser, version } = useApp();
  const navigate = useNavigate();
  void version;

  if (!can(currentUser, "request.triage")) {
    return <Card><EmptyState title="Triage is a lead's queue" icon="lock"
      message="Categorisation and assignment are done by the Director or an AD / Senior Manager." /></Card>;
  }

  const all = repos.requests.list();
  const users = repos.users.list();
  const queue = all.filter((r) => r.status === "Submitted" && canViewRequest(currentUser, r));

  const rows: Row[] = queue.map((req) => {
    const p = proposeTriage(req, users, all);
    const sla = services.requests.previewSla(req, p.category, p.priority);
    return {
      req,
      requester: repos.users.get(req.requesterId)?.name ?? req.requesterId,
      department: repos.departments.get(req.departmentId)?.name ?? "—",
      category: p.category,
      priority: p.priority,
      slaLabel: sla.businessDays != null ? `${sla.businessDays} bd` : "—",
      assignee: p.assigneeId ? (repos.users.get(p.assigneeId)?.name ?? "—") : "—",
    };
  });

  const columns: Column<Row>[] = [
    { key: "id", header: "Request", render: (r) => <span className="mono">{r.req.id}</span> },
    { key: "requester", header: "Requester", render: (r) => r.requester },
    { key: "dept", header: "Department", render: (r) => r.department },
    { key: "summary", header: "Summary", render: (r) => <span className="cell-clamp" title={r.req.description}>{r.req.description}</span> },
    { key: "type", header: "Requester type", render: (r) => <span className="cell-clamp">{requesterCategoryLabel(r.req.requesterCategory)}</span> },
    { key: "submitted", header: "Submitted", render: (r) => shortDate(r.req.submittedAt) },
    { key: "pcat", header: "Proposed category", render: (r) => <Badge tone="gray">{r.category}</Badge> },
    { key: "pprio", header: "Proposed priority", render: (r) => <PriorityBadge priority={r.priority} /> },
    { key: "sla", header: "Suggested SLA", render: (r) => r.slaLabel },
    { key: "assignee", header: "Suggested assignee", render: (r) => r.assignee },
    { key: "age", header: "Age", render: (r) => `${daysAgo(r.req.submittedAt)}d` },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.req.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Triage" subtitle="Assisted proposals — a lead confirms or overrides. Every override is logged." />
      {rows.length === 0 ? (
        <Card><EmptyState title="Triage queue is clear" icon="check" message="New requests appear here for categorisation." /></Card>
      ) : (
        <Card className="card--flush">
          <div className="tablewrap">
            <Table columns={columns} rows={rows} rowKey={(r) => r.req.id} onRowClick={(r) => navigate(`/requests/triage/${r.req.id}`)} />
          </div>
        </Card>
      )}
    </div>
  );
}

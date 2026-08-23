import { Link } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import { canViewRequest, can } from "@/permissions/permissions";
import { Button, Card, DataCard, PageHeader, StatusBadge, EmptyState } from "@/ui/components";

export function HomePage() {
  const { repos, currentUser, version } = useApp();
  void version;
  const all = repos.requests.list().filter((r) => canViewRequest(currentUser, r));
  const open = all.filter((r) => r.status !== "Closed" && r.status !== "Converted to Matter");
  const awaiting = all.filter((r) => r.status === "Awaiting Requester");
  const untriaged = all.filter((r) => r.status === "Submitted");
  const recent = [...all].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 5);

  return (
    <div className="page">
      <PageHeader
        title={`Welcome, ${currentUser.name.split(" ")[0]}`}
        subtitle="Legal request intake & management"
        actions={<Link to="/requests/new"><Button variant="primary" icon="plus">New request</Button></Link>}
      />

      <div className="cardgrid" style={{ marginBottom: 16 }}>
        <DataCard label="Open requests" value={open.length} hint="Not yet closed" />
        <DataCard label="Awaiting requester" value={awaiting.length} hint="Clock paused" />
        {can(currentUser, "request.triage") && <DataCard label="Needs triage" value={untriaged.length} hint="In the triage queue" />}
        <DataCard label="Total visible" value={all.length} hint="Across your access" />
      </div>

      <Card>
        <div className="card__head" style={{ marginBottom: 8, display: "flex", alignItems: "center" }}>
          <div className="card__title">Recent requests</div>
          <span style={{ flex: 1 }} />
          <Link to="/requests">View all</Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState title="No requests yet" message="Raise the first request to get started." icon="inbox"
            action={<Link to="/requests/new"><Button variant="primary">New request</Button></Link>} />
        ) : (
          <ul className="timeline">
            {recent.map((r) => (
              <li key={r.id}>
                <Link to={`/requests/${r.id}`} className="mono">{r.id}</Link> — {r.description}{" "}
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

import { Link } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import type { Request } from "@/domain/models/request";
import { Button, Card, DataCard, EmptyState, PageHeader, StatusBadge } from "@/ui/components";
import { isActive, shortDate } from "./parts";

function RequestRow({ r }: { r: Request }) {
  return (
    <Link to={`/requests/${r.id}`} className="oprow">
      <span className="oprow__id mono">{r.id}</span>
      <span className="oprow__title">{r.description}</span>
      <StatusBadge status={r.status} />
      <span className="oprow__meta">Submitted {shortDate(r.submittedAt)}</span>
      <span className="oprow__meta">Expected {shortDate(r.slaDueDate)}</span>
      <span className="oprow__meta">Updated {shortDate(r.updatedAt)}</span>
    </Link>
  );
}

export function RequesterHome() {
  const { repos, currentUser, version } = useApp();
  void version;
  const mine = repos.requests.list().filter((r) => r.requesterId === currentUser.id);
  const awaiting = mine.filter((r) => r.status === "Awaiting Requester");
  const open = mine.filter((r) => isActive(r) && r.status !== "Awaiting Requester");
  const delivered = mine.filter((r) => !isActive(r)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  return (
    <div className="page">
      <PageHeader title="My Requests" subtitle="Track everything you've raised with Legal."
        actions={<Link to="/requests/new"><Button variant="primary" icon="plus">New Request</Button></Link>} />

      <div className="cardgrid" style={{ marginBottom: 16 }}>
        <DataCard label="Open requests" value={open.length} hint="In progress with Legal" to="/requests" />
        <DataCard label="Awaiting my response" value={awaiting.length} hint="Action needed from you" to="/requests" />
        <DataCard label="Recently delivered" value={delivered.length} hint="Completed" to="/requests" />
      </div>

      {awaiting.length > 0 && (
        <Card>
          <h3 className="card__title">Awaiting your response</h3>
          <div className="oplist">{awaiting.map((r) => <RequestRow key={r.id} r={r} />)}</div>
        </Card>
      )}

      <Card>
        <h3 className="card__title">Open requests</h3>
        {open.length === 0 ? (
          <EmptyState title="Nothing open" icon="inbox" message="You have no requests in progress."
            action={<Link to="/requests/new"><Button variant="primary">New Request</Button></Link>} />
        ) : <div className="oplist">{open.map((r) => <RequestRow key={r.id} r={r} />)}</div>}
      </Card>

      {delivered.length > 0 && (
        <Card>
          <h3 className="card__title">Recently delivered</h3>
          <div className="oplist">{delivered.map((r) => <RequestRow key={r.id} r={r} />)}</div>
        </Card>
      )}
    </div>
  );
}

import { useApp } from "@/state/AppContext";
import { Card, DataCard, EmptyState, PageHeader, slaStateOf } from "@/ui/components";
import { QueueTable, isActive, isDueToday } from "./parts";

export function AssociateHome() {
  const { repos, currentUser, version } = useApp();
  void version;

  const mine = repos.requests.list().filter((r) => r.assignment?.lawyerId === currentUser.id && isActive(r));
  const state = (r: (typeof mine)[number]) => slaStateOf(r);
  const dueToday = mine.filter(isDueToday);
  const dueSoon = mine.filter((r) => state(r) === "duesoon");
  const atRisk = mine.filter((r) => state(r) === "atrisk" || state(r) === "breached");
  const awaiting = mine.filter((r) => r.status === "Awaiting Requester");

  return (
    <div className="page">
      <PageHeader title="My Queue" subtitle="Everything assigned to you, ordered by what needs attention." />

      <div className="cardgrid" style={{ marginBottom: 16 }}>
        <DataCard label="Assigned to me" value={mine.length} hint="Active" />
        <DataCard label="Due today" value={dueToday.length} hint="SLA due today" />
        <DataCard label="Due soon" value={dueSoon.length} hint="Within ~3 business days" />
        <DataCard label="At risk" value={atRisk.length} hint="At risk or breached" />
        <DataCard label="Awaiting requester" value={awaiting.length} hint="Clock paused" />
      </div>

      <Card className="card--flush">
        {mine.length === 0
          ? <div style={{ padding: 8 }}><EmptyState title="Your queue is clear" icon="check" message="Nothing is assigned to you right now." /></div>
          : <QueueTable rows={mine} />}
      </Card>
    </div>
  );
}

import { Link, useNavigate } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import { canViewRequest } from "@/permissions/permissions";
import { Card, DataCard, EmptyState, PageHeader, StatusBadge, slaStateOf } from "@/ui/components";
import { QueueTable, isActive, ageDays } from "./parts";
import { useSlaChecks } from "./useSlaChecks";

export function TeamHome() {
  useSlaChecks();
  const { repos, currentUser, version } = useApp();
  const navigate = useNavigate();
  void version;

  const team = repos.requests.list().filter((r) => canViewRequest(currentUser, r) && isActive(r));
  const unassigned = team.filter((r) => !r.assignment);
  const awaitingAssignment = team.filter((r) => r.status === "Submitted");
  const atRisk = team.filter((r) => slaStateOf(r) === "atrisk");
  const breached = team.filter((r) => slaStateOf(r) === "breached");

  return (
    <div className="page">
      <PageHeader title="My Team" subtitle="Your portfolio — assignment, triage and SLA oversight." />

      <div className="cardgrid" style={{ marginBottom: 16 }}>
        <DataCard label="Team requests" value={team.length} hint="Active" to="/requests/all" />
        <DataCard label="Unassigned" value={unassigned.length} hint="No owner yet" />
        <DataCard label="Awaiting assignment" value={awaitingAssignment.length} hint="In the triage queue" to="/requests/triage" />
        <DataCard label="At risk" value={atRisk.length} hint="Approaching breach" />
        <DataCard label="SLA breached" value={breached.length} hint="Past due" />
      </div>

      <Card>
        <div className="card__head" style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <div className="card__title">Awaiting assignment</div><span style={{ flex: 1 }} />
          <Link to="/requests/triage">Open triage</Link>
        </div>
        {awaitingAssignment.length === 0 ? <p className="muted">Nothing waiting to be assigned.</p> : (
          <div className="oplist">
            {awaitingAssignment.map((r) => (
              <button key={r.id} className="oprow" onClick={() => navigate(`/requests/triage/${r.id}`)}>
                <span className="oprow__id mono">{r.id}</span>
                <span className="oprow__title">{r.description}</span>
                <StatusBadge status={r.status} />
                <span className="oprow__meta">{ageDays(r.submittedAt)}d old</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="card--flush">
        <div style={{ padding: "12px 14px 0" }}><b>Needs attention (at risk / breached / unassigned)</b></div>
        {[...new Set([...breached, ...atRisk, ...unassigned])].length === 0
          ? <div style={{ padding: 8 }}><EmptyState title="Portfolio healthy" icon="check" message="Nothing at risk or unassigned." /></div>
          : <QueueTable rows={[...new Set([...breached, ...atRisk, ...unassigned])]} />}
      </Card>
    </div>
  );
}

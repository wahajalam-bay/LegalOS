import { Link, useNavigate } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import { canViewRequest } from "@/permissions/permissions";
import type { LegalCategory } from "@/domain/models/enums";
import { Card, DataCard, PageHeader, StatusBadge, slaStateOf } from "@/ui/components";
import { BarList, isActive, ageDays } from "./parts";
import { useSlaChecks } from "./useSlaChecks";

export function DirectorHome() {
  useSlaChecks();
  const { repos, currentUser, version } = useApp();
  const navigate = useNavigate();
  void version;

  const all = repos.requests.list().filter((r) => canViewRequest(currentUser, r));
  const active = all.filter(isActive);
  const state = (r: (typeof all)[number]) => slaStateOf(r);

  const kpi = {
    open: active.length,
    unassigned: active.filter((r) => !r.assignment).length,
    atRisk: active.filter((r) => state(r) === "atrisk").length,
    breached: active.filter((r) => state(r) === "breached").length,
    awaitingRequester: active.filter((r) => r.status === "Awaiting Requester").length,
    awaitingApproval: active.filter((r) => r.status === "Awaiting Approval").length,
  };

  // Workload distribution — active requests per owner.
  const owners = repos.users.list().filter((u) => u.active && u.role !== "requester");
  const workload = owners
    .map((u) => ({ label: u.name.split(" ")[0], value: active.filter((r) => r.assignment?.lawyerId === u.id).length }))
    .filter((w) => w.value > 0)
    .sort((a, b) => b.value - a.value);

  // SLA performance across active requests.
  const sla = [
    { label: "On track", value: active.filter((r) => state(r) === "ontrack").length, tone: "var(--success)" },
    { label: "Due soon", value: active.filter((r) => state(r) === "duesoon").length, tone: "#1d6cb0" },
    { label: "At risk", value: kpi.atRisk, tone: "var(--warning)" },
    { label: "Breached", value: kpi.breached, tone: "var(--danger)" },
    { label: "Paused", value: active.filter((r) => state(r) === "paused").length, tone: "var(--text-3)" },
  ].filter((s) => s.value > 0);

  // Request volume by category.
  const byCat = new Map<LegalCategory, number>();
  for (const r of active) byCat.set(r.legalCategory, (byCat.get(r.legalCategory) ?? 0) + 1);
  const volume = [...byCat.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  // Ageing buckets.
  const ageing = [
    { label: "0–2 days", value: active.filter((r) => ageDays(r.submittedAt) <= 2).length },
    { label: "3–5 days", value: active.filter((r) => ageDays(r.submittedAt) >= 3 && ageDays(r.submittedAt) <= 5).length },
    { label: "6+ days", value: active.filter((r) => ageDays(r.submittedAt) >= 6).length },
  ];

  const escalations = active
    .filter((r) => r.escalationLevel === "breach" || r.escalationLevel === "warning" || state(r) === "breached" || state(r) === "atrisk")
    .sort((a, b) => (state(b) === "breached" ? 1 : 0) - (state(a) === "breached" ? 1 : 0));

  return (
    <div className="page">
      <PageHeader title="Legal Operations" subtitle="Operational health of the legal function." />

      <div className="cardgrid" style={{ marginBottom: 16 }}>
        <DataCard label="Open requests" value={kpi.open} hint="Active" to="/requests/all" />
        <DataCard label="Unassigned" value={kpi.unassigned} hint="No owner" />
        <DataCard label="At risk" value={kpi.atRisk} hint="Approaching breach" />
        <DataCard label="SLA breached" value={kpi.breached} hint="Past due" />
        <DataCard label="Awaiting requester" value={kpi.awaitingRequester} hint="Clock paused" />
        <DataCard label="Awaiting approval" value={kpi.awaitingApproval} hint="Pending sign-off" />
      </div>

      <div className="grid2">
        <Card><h3 className="card__title">Workload distribution</h3><BarList items={workload} /></Card>
        <Card><h3 className="card__title">SLA performance</h3><BarList items={sla} /></Card>
      </div>
      <div className="grid2">
        <Card><h3 className="card__title">Request volume by category</h3><BarList items={volume} /></Card>
        <Card><h3 className="card__title">Ageing</h3><BarList items={ageing} /></Card>
      </div>

      <Card>
        <h3 className="card__title">Escalations requiring attention</h3>
        {escalations.length === 0 ? <p className="muted">No escalations — everything is within SLA.</p> : (
          <div className="oplist">
            {escalations.map((r) => (
              <button key={r.id} className="oprow" onClick={() => navigate(`/requests/${r.id}`)}>
                <span className="oprow__id mono">{r.id}</span>
                <span className="oprow__title">{r.description}</span>
                <StatusBadge status={r.status} />
                <span className={`pill pill--${state(r) === "breached" ? "red" : "amber"}`}>{state(r) === "breached" ? "Breached" : "At risk"}</span>
                <span className="oprow__meta">{r.assignment ? repos.users.get(r.assignment.lawyerId)?.name : "Unassigned"}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <p className="muted small" style={{ marginTop: 4 }}><Link to="/requests/all">Open the full request register →</Link></p>
    </div>
  );
}

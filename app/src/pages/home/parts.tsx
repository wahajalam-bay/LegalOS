import { useNavigate } from "react-router-dom";
import type { Request } from "@/domain/models/request";
import { PriorityBadge, SlaIndicator, StatusBadge, Table, slaStateOf, type Column } from "@/ui/components";
import { useApp } from "@/state/AppContext";

export const DAY = 86_400_000;
export const ageDays = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / DAY));
export const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—";

export const isActive = (r: Request) => r.status !== "Delivered" && r.status !== "Closed" && r.status !== "Converted to Matter";
export const isDueToday = (r: Request) => {
  if (!r.slaDueDate) return false;
  const due = new Date(r.slaDueDate); const now = new Date();
  return due.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
};

/** A restrained horizontal bar list — for operational distributions, not charts. */
export function BarList({ items }: { items: { label: string; value: number; tone?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="muted small">No data yet.</p>;
  return (
    <div className="barlist">
      {items.map((i) => (
        <div key={i.label} className="barrow">
          <span className="barrow__label" title={i.label}>{i.label}</span>
          <span className="barrow__track"><span className="barrow__fill" style={{ width: `${(i.value / max) * 100}%`, background: i.tone }} /></span>
          <span className="barrow__val">{i.value}</span>
        </div>
      ))}
    </div>
  );
}

/** The operational queue table (Request / Department / Category / Priority / SLA / Age / Status). */
export function QueueTable({ rows }: { rows: Request[] }) {
  const { repos } = useApp();
  const navigate = useNavigate();
  const columns: Column<Request>[] = [
    { key: "id", header: "Request", render: (r) => <span className="mono">{r.id}</span> },
    { key: "dept", header: "Department", render: (r) => repos.departments.get(r.departmentId)?.name ?? "—" },
    { key: "cat", header: "Category", render: (r) => r.legalCategory },
    { key: "prio", header: "Priority", render: (r) => <PriorityBadge priority={r.priority} /> },
    { key: "sla", header: "SLA", render: (r) => <SlaIndicator state={slaStateOf(r)} /> },
    { key: "age", header: "Age", render: (r) => `${ageDays(r.submittedAt)}d` },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];
  return (
    <div className="tablewrap">
      <Table columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/requests/${r.id}`)} />
    </div>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import { can, canViewRequest } from "@/permissions/permissions";
import { LEGAL_CATEGORIES, PRIORITIES, REQUEST_STATUSES, JURISDICTIONS, JURISDICTION_LABELS } from "@/domain/models/enums";
import type { Request } from "@/domain/models/request";
import {
  Button, Card, EmptyState, PriorityBadge, Select, SlaIndicator, StatusBadge, Table, TextInput, slaStateOf, type Column,
} from "@/ui/components";
import { Icon } from "@/ui/icons";
import { EMPTY_FILTERS, activeFilterCount, filterRequests, type RequestFilters } from "./allRequestsFilters";

const PAGE_SIZE = 10;
const PRIORITY_ORDER: Record<string, number> = { Low: 0, Medium: 1, High: 2, Urgent: 3 };
const SLA_OPTIONS = ["ontrack", "duesoon", "atrisk", "breached", "paused", "completed"] as const;
const SLA_LABELS: Record<string, string> = { ontrack: "On track", duesoon: "Due soon", atrisk: "At risk", breached: "Breached", paused: "Paused", completed: "Completed" };
type SortKey = "id" | "submitted" | "priority" | "sla" | "status";

interface SavedFilter { name: string; filters: RequestFilters }

export function AllRequestsPage() {
  const { repos, currentUser, version } = useApp();
  const navigate = useNavigate();
  void version;

  const users = repos.users.list();
  const departments = repos.departments.list();
  const assignable = users.filter((u) => u.role !== "requester");
  const userName = (idv: string) => users.find((u) => u.id === idv)?.name ?? idv;
  const deptName = (idv: string) => departments.find((d) => d.id === idv)?.name ?? idv;

  const savedKey = `legalos.savedfilters.${currentUser.id}`;
  const [filters, setFilters] = useState<RequestFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "submitted", dir: -1 });
  const [page, setPage] = useState(0);
  const [saved, setSaved] = useState<SavedFilter[]>(() => {
    try { return JSON.parse(localStorage.getItem(savedKey) ?? "[]") as SavedFilter[]; } catch { return []; }
  });
  const [saveName, setSaveName] = useState("");

  const set = <K extends keyof RequestFilters>(k: K, v: RequestFilters[K]) => { setFilters((f) => ({ ...f, [k]: v })); setPage(0); };

  const allowed = can(currentUser, "request.viewAll") || can(currentUser, "request.viewTeam");
  const base = repos.requests.list().filter((r) => canViewRequest(currentUser, r));
  const filtered = useMemo(
    () => filterRequests(base, filters, {
      userName: (idv) => users.find((u) => u.id === idv)?.name ?? idv,
      deptName: (idv) => departments.find((d) => d.id === idv)?.name ?? idv,
    }),
    [base, filters, users, departments],
  );

  const sorted = useMemo(() => {
    const key = (r: Request): string | number => {
      switch (sort.key) {
        case "id": return r.id;
        case "submitted": return r.submittedAt;
        case "priority": return PRIORITY_ORDER[r.priority] ?? 0;
        case "sla": return r.slaDueDate ?? "9999";
        case "status": return r.status;
      }
    };
    return [...filtered].sort((a, b) => {
      const ka = key(a), kb = key(b);
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * sort.dir;
    });
  }, [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));
  const sortIcon = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "");

  const persist = (next: SavedFilter[]) => { setSaved(next); try { localStorage.setItem(savedKey, JSON.stringify(next)); } catch { /* ignore */ } };
  const saveCurrent = () => { if (!saveName.trim()) return; persist([...saved.filter((s) => s.name !== saveName.trim()), { name: saveName.trim(), filters }]); setSaveName(""); };

  if (!allowed) {
    return <Card><EmptyState title="Not available" icon="lock" message="The full request register is for legal users." /></Card>;
  }

  const columns: Column<Request>[] = [
    { key: "id", header: <button className="th-sort" onClick={() => toggleSort("id")}>Request{sortIcon("id")}</button>, render: (r) => <span className="mono">{r.id}</span> },
    { key: "requester", header: "Requester", render: (r) => userName(r.requesterId) },
    { key: "dept", header: "Department", render: (r) => deptName(r.departmentId) },
    { key: "cat", header: "Category", render: (r) => r.legalCategory },
    { key: "prio", header: <button className="th-sort" onClick={() => toggleSort("priority")}>Priority{sortIcon("priority")}</button>, render: (r) => <PriorityBadge priority={r.priority} /> },
    { key: "sla", header: <button className="th-sort" onClick={() => toggleSort("sla")}>SLA{sortIcon("sla")}</button>, render: (r) => <SlaIndicator state={slaStateOf(r)} /> },
    { key: "assignee", header: "Assignee", render: (r) => (r.assignment ? userName(r.assignment.lawyerId) : "—") },
    { key: "submitted", header: <button className="th-sort" onClick={() => toggleSort("submitted")}>Submitted{sortIcon("submitted")}</button>, render: (r) => new Date(r.submittedAt).toLocaleDateString() },
    { key: "status", header: <button className="th-sort" onClick={() => toggleSort("status")}>Status{sortIcon("status")}</button>, render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div>
      <div className="page__head">
        <div><h1 className="page__title">All Requests</h1><div className="page__sub">The full legal request register.</div></div>
      </div>

      <Card>
        <div className="filterbar">
          <div className="searchfield">
            <Icon name="search" size={15} />
            <input className="searchfield__input" placeholder="Search ID, requester, department, counterparty…" value={filters.q} onChange={(e) => set("q", e.target.value)} />
          </div>
          <Select value={filters.status} onChange={(e) => set("status", e.target.value)} aria-label="Status"><option value="">All statuses</option>{REQUEST_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
          <Select value={filters.category} onChange={(e) => set("category", e.target.value)} aria-label="Category"><option value="">All categories</option>{LEGAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          <Select value={filters.priority} onChange={(e) => set("priority", e.target.value)} aria-label="Priority"><option value="">All priorities</option>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</Select>
          <Select value={filters.department} onChange={(e) => set("department", e.target.value)} aria-label="Department"><option value="">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
          <Select value={filters.assignee} onChange={(e) => set("assignee", e.target.value)} aria-label="Assignee"><option value="">Any assignee</option><option value="__unassigned">Unassigned</option>{assignable.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
          <Select value={filters.jurisdiction} onChange={(e) => set("jurisdiction", e.target.value)} aria-label="Jurisdiction"><option value="">All jurisdictions</option>{JURISDICTIONS.map((j) => <option key={j} value={j}>{JURISDICTION_LABELS[j]}</option>)}</Select>
          <Select value={filters.slaState} onChange={(e) => set("slaState", e.target.value)} aria-label="SLA state"><option value="">Any SLA state</option>{SLA_OPTIONS.map((s) => <option key={s} value={s}>{SLA_LABELS[s]}</option>)}</Select>
          <TextInput type="date" aria-label="Submitted from" value={filters.dateFrom} onChange={(e) => set("dateFrom", e.target.value)} style={{ maxWidth: 150 }} />
          <TextInput type="date" aria-label="Submitted to" value={filters.dateTo} onChange={(e) => set("dateTo", e.target.value)} style={{ maxWidth: 150 }} />
          {activeFilterCount(filters) > 0 && <Button variant="ghost" size="sm" icon="x" onClick={() => { setFilters(EMPTY_FILTERS); setPage(0); }}>Clear ({activeFilterCount(filters)})</Button>}
        </div>

        <div className="filterbar" style={{ marginTop: -6 }}>
          <span className="muted small">Saved views:</span>
          {saved.length === 0 && <span className="muted small">none yet</span>}
          {saved.map((s) => (
            <span key={s.name} className="savedchip">
              <button className="linkbtn" onClick={() => { setFilters(s.filters); setPage(0); }}>{s.name}</button>
              <button className="savedchip__x" aria-label={`Delete ${s.name}`} onClick={() => persist(saved.filter((x) => x.name !== s.name))}>×</button>
            </span>
          ))}
          <span style={{ flex: 1 }} />
          <TextInput placeholder="Name this view…" value={saveName} onChange={(e) => setSaveName(e.target.value)} style={{ maxWidth: 170 }} />
          <Button variant="soft" size="sm" onClick={saveCurrent} disabled={!saveName.trim() || activeFilterCount(filters) === 0}>Save view</Button>
        </div>
      </Card>

      <div className="muted small" style={{ margin: "10px 2px" }}>{sorted.length} request{sorted.length === 1 ? "" : "s"}</div>

      {sorted.length === 0 ? (
        <Card><EmptyState title="No matches" icon="search" message="No requests match these filters." /></Card>
      ) : (
        <>
          <Card className="card--flush"><div className="tablewrap"><Table columns={columns} rows={pageRows} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/requests/${r.id}`)} /></div></Card>
          <div className="pager">
            <Button variant="ghost" size="sm" icon="arrowLeft" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
            <span className="muted small">Page {page + 1} of {pageCount}</span>
            <Button variant="ghost" size="sm" iconRight="arrowRight" disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>Next</Button>
          </div>
        </>
      )}
    </div>
  );
}

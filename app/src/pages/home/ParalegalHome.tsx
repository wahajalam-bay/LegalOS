import { useNavigate } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import type { Task, TaskStatus } from "@/domain/models/task";
import { Card, DataCard, EmptyState, PageHeader, Select, Table, type Column } from "@/ui/components";
import { shortDate } from "./parts";

export function ParalegalHome() {
  const { repos, services, currentUser, reload, version } = useApp();
  const navigate = useNavigate();
  void version;

  const mine = repos.tasks.list().filter((t) => t.assigneeId === currentUser.id);
  const openTasks = mine.filter((t) => t.status !== "Done");
  const documents = mine.filter((t) => t.kind === "document");

  const setStatus = (t: Task, status: TaskStatus) => {
    const res = services.tasks.setStatus(t.id, status, currentUser.id);
    if (res.ok) reload();
  };

  const columns: Column<Task>[] = [
    { key: "title", header: "Task", render: (t) => <span>{t.kind === "document" ? "📄 " : ""}{t.title}</span> },
    { key: "req", header: "Request", render: (t) => <button className="linkbtn mono" onClick={() => navigate(`/requests/${t.requestId}`)}>{t.requestId}</button> },
    { key: "owner", header: "Created by", render: (t) => repos.users.get(t.createdBy)?.name ?? "—" },
    { key: "due", header: "Due", render: (t) => shortDate(t.dueDate) },
    { key: "status", header: "Status", render: (t) => (
      <Select value={t.status} onChange={(e) => setStatus(t, e.target.value as TaskStatus)} style={{ maxWidth: 150 }}>
        <option>To Do</option><option>In Progress</option><option>Done</option>
      </Select>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="My Tasks" subtitle="Execution and document handling assigned to you." />

      <div className="cardgrid" style={{ marginBottom: 16 }}>
        <DataCard label="Open tasks" value={openTasks.length} hint="Not yet done" />
        <DataCard label="Documents" value={documents.length} hint="Contract / document handling" />
        <DataCard label="Completed" value={mine.length - openTasks.length} hint="Done" />
      </div>

      <Card className="card--flush">
        {mine.length === 0
          ? <div style={{ padding: 8 }}><EmptyState title="No tasks assigned" icon="check" message="Tasks assigned to you will appear here." /></div>
          : <div className="tablewrap"><Table columns={columns} rows={mine} rowKey={(t) => t.id} /></div>}
      </Card>
    </div>
  );
}

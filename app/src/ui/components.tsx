import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./icons";
import { colorFor, initials } from "./util";
import type { RequestStatus, Priority, BusinessUrgency } from "@/domain/models/enums";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------- Button ---------- */
type BtnVariant = "primary" | "ghost" | "soft" | "danger";
export function Button(
  { variant = "ghost", size, icon, iconRight, children, className, ...rest }:
  { variant?: BtnVariant; size?: "sm"; icon?: string; iconRight?: string } & ButtonHTMLAttributes<HTMLButtonElement>,
) {
  return (
    <button className={cx("btn", `btn--${variant}`, size && `btn--${size}`, !children && "btn--icon", className)} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 14 : 16} />}
    </button>
  );
}

/* ---------- Card ---------- */
export function Card({ children, className = "", pad, hover }: { children: ReactNode; className?: string; pad?: boolean; hover?: boolean }) {
  return <div className={cx("card", pad && "card--pad", hover && "card--hover", className)}>{children}</div>;
}

/* ---------- Pill / Badge ---------- */
type Tone = "gray" | "blue" | "green" | "amber" | "red" | "purple" | "indigo";
export function Pill({ tone = "gray", dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return <span className={cx("pill", `pill--${tone}`, className)}>{dot && <span className="pill__dot" />}{children}</span>;
}
export const Badge = Pill;

/* ---------- Request visual language ---------- */
const STATUS_TONE: Record<RequestStatus, Tone> = {
  Submitted: "blue", Categorised: "purple", Assigned: "blue", "In Progress": "amber",
  "Awaiting Requester": "amber", "Awaiting Approval": "purple", Delivered: "green", Closed: "gray", "Converted to Matter": "purple",
};
export function StatusBadge({ status }: { status: RequestStatus }) {
  return <Pill tone={STATUS_TONE[status] ?? "gray"} dot>{status}</Pill>;
}

const PRIORITY_CLS: Record<Priority, string> = { Low: "low", Medium: "med", High: "high", Urgent: "urgent" };
const PRIORITY_ICON: Record<Priority, string> = { Low: "arrowDown", Medium: "minus", High: "arrowUp", Urgent: "arrowUp" };
export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={cx("prio", `prio--${PRIORITY_CLS[priority]}`)}><Icon name={PRIORITY_ICON[priority]} size={13} />{priority}</span>;
}

const URGENCY_TONE: Record<BusinessUrgency, Tone> = { Routine: "gray", Important: "blue", "Time-critical": "amber", Emergency: "red" };
export function UrgencyBadge({ urgency }: { urgency: BusinessUrgency }) {
  return <Pill tone={URGENCY_TONE[urgency] ?? "gray"}>{urgency}</Pill>;
}

export type SlaState = "ontrack" | "duesoon" | "atrisk" | "breached" | "paused" | "none";
export function slaStateOf(
  req: { status: RequestStatus; pausePeriods?: readonly { end: string | null }[]; slaDueDate: string | null },
  now: Date = new Date(),
): SlaState {
  if (req.status === "Awaiting Requester" || (req.pausePeriods ?? []).some((p) => p.end === null)) return "paused";
  if (!req.slaDueDate) return "none";
  const ms = new Date(req.slaDueDate).getTime() - now.getTime();
  if (ms < 0) return "breached";
  const days = ms / 86_400_000;
  if (days <= 1) return "atrisk";
  if (days <= 3) return "duesoon";
  return "ontrack";
}
const SLA_LABEL: Record<SlaState, string> = { ontrack: "On track", duesoon: "Due soon", atrisk: "At risk", breached: "Breached", paused: "Paused", none: "—" };
export function SlaIndicator({ state }: { state: SlaState }) {
  if (state === "none") return <span className="muted">—</span>;
  return <span className={cx("sla", `sla--${state}`)}><span className="sla__dot" />{SLA_LABEL[state]}</span>;
}

/* ---------- Avatar ---------- */
export function Avatar({ name = "?", size = "md" }: { name?: string; size?: "xs" | "sm" | "md" }) {
  return <span className={cx("avatar", `avatar--${size}`)} style={{ background: colorFor(name) }} title={name}>{initials(name)}</span>;
}

/* ---------- Tooltip ---------- */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return <span className="tt" tabIndex={0}>{children}<span className="tt__bubble" role="tooltip">{label}</span></span>;
}

/* ---------- Forms ---------- */
export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor?: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <div className="field__hint">{hint}</div>}
      {error && <div className="field__error" role="alert">{error}</div>}
    </div>
  );
}
export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) { return <input className="input" {...props} />; }
export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className="textarea" {...props} />; }
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select className="select" {...props} />; }
export function DatePicker(props: InputHTMLAttributes<HTMLInputElement>) { return <input type="date" className="input" {...props} />; }
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button type="button" className={cx("toggle", on && "on")} aria-pressed={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function FileUpload({ onFiles, files, onRemove }: { onFiles: (names: string[]) => void; files: string[]; onRemove: (i: number) => void }) {
  const [drag, setDrag] = useState(false);
  const pick = () => {
    const el = document.createElement("input");
    el.type = "file"; el.multiple = true;
    el.onchange = () => onFiles([...(el.files ?? [])].map((f) => f.name));
    el.click();
  };
  return (
    <div>
      <div className={cx("fileupload", drag && "is-drag")} role="button" tabIndex={0}
        onClick={pick} onKeyDown={(e) => { if (e.key === "Enter") pick(); }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles([...(e.dataTransfer.files ?? [])].map((f) => f.name)); }}>
        <Icon name="upload" size={20} />
        <div>Drop files here, or <b>browse</b></div>
      </div>
      {files.map((f, i) => (
        <div key={i} className="filerow">
          <Icon name="file" size={15} /><span style={{ flex: 1, minWidth: 0 }}>{f}</span>
          <Button variant="ghost" size="sm" icon="x" aria-label="Remove" onClick={() => onRemove(i)} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Tabs / Segmented ---------- */
export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string; count?: number }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.key} className={cx("tab", active === t.key && "active")} onClick={() => onChange(t.key)}>
          {t.label}{t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function FilterBar({ children }: { children: ReactNode }) { return <div className="filterbar">{children}</div>; }

/* ---------- Breadcrumbs ---------- */
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {i > 0 && <span className="crumbs__sep">/</span>}
          {it.href ? <a href={it.href}>{it.label}</a> : <b>{it.label}</b>}
        </span>
      ))}
    </nav>
  );
}

/* ---------- Skeleton ---------- */
export function Skeleton({ width = "100%", height = 14, radius }: { width?: number | string; height?: number | string; radius?: number }) {
  return <span className="skeleton" style={{ display: "block", width, height, borderRadius: radius }} aria-hidden />;
}

/* ---------- Data card / stat ---------- */
export function DataCard({ label, value, hint, to }: { label: string; value: ReactNode; hint?: string; to?: string }) {
  const inner = <div className="datacard"><div className="datacard__label">{label}</div><div className="datacard__value">{value}</div>{hint && <div className="datacard__hint">{hint}</div>}</div>;
  if (to) return <Link to={to} className="datacard-link"><Card className="card--pad">{inner}</Card></Link>;
  return <Card className="card--pad">{inner}</Card>;
}

/* ---------- Table ---------- */
export interface Column<T> { key: string; header: ReactNode; render: (row: T) => ReactNode; }
export function Table<T>({ columns, rows, rowKey, onRowClick }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void }) {
  return (
    <table className="table">
      <thead><tr>{columns.map((c) => <th key={c.key}>{c.header}</th>)}</tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={rowKey(r)} className={onRowClick ? "is-clickable" : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}>
            {columns.map((c) => <td key={c.key}>{c.render(r)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------- Timeline ---------- */
export function Timeline({ items }: { items: { key: string; title: ReactNode; meta?: ReactNode }[] }) {
  return <ul className="timeline">{items.map((i) => <li key={i.key}><b>{i.title}</b>{i.meta && <span className="muted"> — {i.meta}</span>}</li>)}</ul>;
}

/* ---------- Stepper ---------- */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="stepper">
      {steps.map((s, i) => (
        <div key={s} className={cx("step", i < current && "step--done", i === current && "step--active")}>
          {i > 0 && <div className="step__line" />}
          <div className="step__dot">{i < current ? <Icon name="check" size={12} /> : i + 1}</div>
          <div className="step__label">{s}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- States ---------- */
export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div className="state" role="status"><div className="spinner" aria-hidden />{label}</div>;
}
export function EmptyState({ title, message, icon = "inbox", action }: { title: string; message?: string; icon?: string; action?: ReactNode }) {
  return <div className="state"><div className="state__icon"><Icon name={icon} size={22} /></div><div className="state__title">{title}</div>{message && <div className="state__msg">{message}</div>}{action}</div>;
}
export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return <div className="state state--error" role="alert"><div className="state__icon"><Icon name="alert" size={22} /></div><div className="state__title">{title}</div>{message && <div className="state__msg">{message}</div>}{onRetry && <Button variant="primary" onClick={onRetry}>Retry</Button>}</div>;
}

/* ---------- Page header ---------- */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page__head">
      <div style={{ minWidth: 0 }}>
        <h1 className="page__title">{title}</h1>
        {subtitle && <div className="page__sub">{subtitle}</div>}
      </div>
      {actions && <div style={{ flex: "none", display: "flex", gap: 8 }}>{actions}</div>}
    </div>
  );
}

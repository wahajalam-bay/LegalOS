import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import { canViewRequest } from "@/permissions/permissions";
import { Icon } from "./icons";

const NAV_TARGETS = [
  { label: "Home", to: "/", icon: "home" },
  { label: "Requests", to: "/requests", icon: "inbox" },
  { label: "New request", to: "/requests/new", icon: "plus" },
  { label: "Triage", to: "/requests/triage", icon: "filter" },
];

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { repos, currentUser } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const ql = q.trim().toLowerCase();
  const navMatches = NAV_TARGETS.filter((n) => !ql || n.label.toLowerCase().includes(ql));
  const requestMatches = useMemo(
    () => repos.requests.list()
      .filter((r) => canViewRequest(currentUser, r))
      .filter((r) => !ql || r.id.toLowerCase().includes(ql) || r.description.toLowerCase().includes(ql))
      .slice(0, 6),
    [repos, currentUser, ql],
  );

  const go = (to: string) => { navigate(to); onClose(); };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Command palette"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh" }}>
      <div className="cmdk">
        <input className="cmdk__input" autoFocus placeholder="Search requests or jump to…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="cmdk__list">
          <div className="cmdk__group">Go to</div>
          {navMatches.map((n) => (
            <div key={n.to} className="cmdk__item" onClick={() => go(n.to)}>
              <div className="cmdk__ico"><Icon name={n.icon} size={15} /></div>{n.label}
            </div>
          ))}
          {requestMatches.length > 0 && <div className="cmdk__group">Requests</div>}
          {requestMatches.map((r) => (
            <div key={r.id} className="cmdk__item" onClick={() => go(`/requests/${r.id}`)}>
              <div className="cmdk__ico"><Icon name="file" size={15} /></div>
              <span className="mono" style={{ marginRight: 8 }}>{r.id}</span>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</span>
            </div>
          ))}
          {navMatches.length === 0 && requestMatches.length === 0 && <div className="cmdk__item" style={{ color: "var(--text-3)" }}>No matches</div>}
        </div>
      </div>
    </div>
  );
}

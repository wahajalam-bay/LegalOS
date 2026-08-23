import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import type { Notification, NotificationKind } from "@/domain/models/notification";
import type { User } from "@/domain/models/user";
import { Icon } from "./icons";
import { timeAgo } from "./util";

/** Notifications visible to a user: those addressed to them, or to their department queue. */
export function notificationsFor(user: User, all: readonly Notification[]): Notification[] {
  return all
    .filter((n) => n.recipientUserId === user.id || (n.recipientDepartmentId != null && n.recipientDepartmentId === user.departmentId))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const KIND_ICON: Record<NotificationKind, string> = {
  "request.submitted": "inbox",
  "request.assigned": "user",
  "request.status_changed": "arrowRight",
  "request.awaiting_requester": "alert",
  "request.delivered": "check",
  "sla.near_breach": "clock",
  "sla.breached": "alertTriangle",
};

export function NotificationsBell() {
  const { repos, currentUser, version, reload } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  void version;

  const items = notificationsFor(currentUser, repos.notifications.list());
  const unread = items.filter((n) => !n.read).length;

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);

  const openItem = (n: Notification) => {
    if (!n.read) { repos.notifications.markRead(n.id); reload(); }
    setOpen(false);
    if (n.entityId.startsWith("REQ-")) navigate(`/requests/${n.entityId}`);
  };

  const markAll = () => {
    items.filter((n) => !n.read).forEach((n) => repos.notifications.markRead(n.id));
    reload();
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="iconbtn" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-haspopup="true"
        aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" size={18} />
        {unread > 0 && <span className="notif-badge" aria-hidden>{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel__head">
            <b>Notifications</b>
            {unread > 0 && <button className="linkbtn" onClick={markAll}>Mark all read</button>}
          </div>
          <div className="notif-panel__list">
            {items.length === 0 ? (
              <div className="state" style={{ padding: "28px 16px" }}>
                <div className="state__icon"><Icon name="bell" size={18} /></div>
                <div className="state__title">You're all caught up</div>
                <div className="state__msg">Updates on your requests will appear here.</div>
              </div>
            ) : (
              items.map((n) => (
                <button key={n.id} className={`notif-item${n.read ? "" : " is-unread"}`} onClick={() => openItem(n)}>
                  <span className="notif-item__ico"><Icon name={KIND_ICON[n.kind] ?? "bell"} size={15} /></span>
                  <span className="notif-item__body">
                    <span className="notif-item__title">{n.title}</span>
                    <span className="notif-item__text">{n.body}</span>
                    <span className="notif-item__time">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.read && <span className="notif-item__dot" aria-label="unread" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

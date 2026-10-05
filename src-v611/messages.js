// SPRINT 4 — the two-way communication bridge.
//
// One `messages` slice keyed by request id, and one <ChatThread /> component,
// used by BOTH apps:
//   • the requester portal renders it on their request detail
//   • LegalOS renders it on the matter / workspace record ("Requester" tab)
//
// Because both read and write the same slice, a message sent from either side
// appears on the other immediately. Every message carries the sender's role and,
// for requesters, the email + source captured at portal login.
//
// // portal ↔ LegalOS API seam — postMessage() becomes
// POST /api/requests/:id/messages and threadFor() becomes a GET/subscribe.
import { html, cx, fmt, useState, useEffect, useRef, useMemo } from "./core.js";
import { Icon } from "./icons.js";
import { Btn, Avatar, Pill, Empty } from "./ui.js";
import {
  getCollection, addItem, updateItem, nextId, nowIso, useCollection,
  personName, personRole,
} from "./store.js";

/* ---------------- slice helpers ---------------- */
export const threadFor = (requestId, messages) =>
  (messages || getCollection("messages") || [])
    .filter((m) => m.requestId === requestId)
    .sort((a, b) => new Date(a.at) - new Date(b.at));

// Anyone we might need to name: an internal user (u*) or a portal requester (RQ-*).
export const senderName = personName;
export const senderRole = personRole;

export function postMessage({ requestId, from, role, text, attachments }) {
  const body = String(text || "").trim();
  if (!requestId || !from || !body) return { ok: false };
  const msg = {
    id: nextId("messages", "MSG-"),
    requestId,
    from,
    role: role === "legal" ? "legal" : "requester",
    text: body,
    attachments: attachments || [],
    at: nowIso(),
    readBy: [from],
  };
  addItem("messages", msg);
  // Keep the denormalised counter on the request in step so lists can badge
  // without walking the whole thread.
  const req = (getCollection("requests") || []).find((r) => r.id === requestId);
  if (req) updateItem("requests", requestId, { messagesCount: threadFor(requestId).length });
  return { ok: true, message: msg };
}

// Unread = messages this viewer has not read AND did not send.
export const unreadFor = (requestId, viewerId, messages) =>
  threadFor(requestId, messages).filter((m) => m.from !== viewerId && !(m.readBy || []).includes(viewerId));

export const unreadCount = (requestId, viewerId, messages) => unreadFor(requestId, viewerId, messages).length;

// Unread across a set of requests, for a shell-level badge.
export function unreadTotal(requestIds, viewerId, messages) {
  const all = messages || getCollection("messages") || [];
  return requestIds.reduce((n, id) => n + unreadCount(id, viewerId, all), 0);
}

export function markThreadRead(requestId, viewerId) {
  if (!viewerId) return;
  unreadFor(requestId, viewerId).forEach((m) => {
    updateItem("messages", m.id, { readBy: [...(m.readBy || []), viewerId] });
  });
}

/* ---------------- the shared component ---------------- */
/**
 * ChatThread — the same thread, rendered from either side.
 *
 * @param requestId  which request this thread belongs to
 * @param viewer     the sender id: an internal user id, or an RQ- requester id
 * @param role       "legal" | "requester" — decides bubble side and labelling
 * @param counterpartLabel  what to call the other side in the empty state
 * @param compact    drop the header (when the tab already provides one)
 * @param height     scroll area height
 */
export function ChatThread({ requestId, viewer, role, counterpartLabel, compact, height = 340, onSend }) {
  const messages = useCollection("messages");
  const thread = useMemo(() => threadFor(requestId, messages), [requestId, messages]);
  const [text, setText] = useState("");
  const scRef = useRef(null);

  // Mark read on open and whenever new traffic arrives while we are looking.
  useEffect(() => { markThreadRead(requestId, viewer); }, [requestId, viewer, thread.length]);
  useEffect(() => { if (scRef.current) scRef.current.scrollTop = scRef.current.scrollHeight; }, [thread.length]);

  const send = () => {
    const res = postMessage({ requestId, from: viewer, role, text });
    if (res.ok) { setText(""); onSend && onSend(res.message); }
  };

  const other = counterpartLabel || (role === "legal" ? "the requester" : "the legal team");

  return html`<div class="chatpanel">
    ${!compact && html`<div class="row" style="margin-bottom:10px">
      <span class="strong">Messages</span>
      <div class="spacer"></div>
      <span class="tiny muted">${thread.length} message${thread.length === 1 ? "" : "s"} · shared with ${other}</span>
    </div>`}

    <div class="chatpanel__scroll" style=${`max-height:${height}px`} ref=${scRef}>
      ${thread.length === 0
        ? html`<div class="empty" style="padding:26px 12px">
            <${Icon} name="message" size=30 />
            <div>No messages yet — anything you write here is visible to ${other}.</div>
          </div>`
        : thread.map((m) => {
            const mine = m.from === viewer;
            return html`<div key=${m.id} class=${cx("cmsg", mine && "cmsg--mine")}>
              ${!mine && html`<${Avatar} name=${senderName(m.from)} size="sm" />`}
              <div class="cmsg__body">
                <div class="cmsg__head">
                  <span class="cmsg__who">${mine ? "You" : senderName(m.from)}</span>
                  <${Pill} tone=${m.role === "legal" ? "green" : "blue"}>${m.role === "legal" ? "Legal" : "Requester"}</${Pill}>
                  <span class="cmsg__time">${fmt.rel(m.at)}</span>
                </div>
                <div class="cmsg__bubble">${m.text}</div>
                ${(m.attachments || []).length > 0 && html`<div class="row wrap" style="gap:5px;margin-top:6px">
                  ${m.attachments.map((a, i) => html`<span key=${i} class="tagchip"><${Icon} name="paperclip" size=11 />${a.name}</span>`)}
                </div>`}
              </div>
            </div>`;
          })}
    </div>

    <div class="chatpanel__input">
      <textarea class="textarea" rows=1 placeholder=${`Message ${other}…`} style="min-height:38px;max-height:110px"
        value=${text}
        onInput=${(e) => setText(e.target.value)}
        onKeyDown=${(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}></textarea>
      <${Btn} variant="primary" icon="send" onClick=${send} disabled=${!text.trim()} />
    </div>
  </div>`;
}

export default ChatThread;

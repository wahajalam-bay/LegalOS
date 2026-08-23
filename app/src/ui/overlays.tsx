import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./icons";
import { Button } from "./components";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
}

export function Modal({ title, onClose, children, footer, width }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number;
}) {
  useEscape(onClose);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ alignItems: "flex-start", justifyContent: "center", paddingTop: "9vh" }}>
      <div className="modal" style={width ? { width } : undefined}>
        <div className="modal__head">
          <div className="modal__title">{title}</div>
          <Button variant="ghost" size="sm" icon="x" aria-label="Close" onClick={onClose} />
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEscape(onClose);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ justifyContent: "flex-end" }}>
      <div className="drawer">
        <div className="modal__head">
          <div className="modal__title">{title}</div>
          <Button variant="ghost" size="sm" icon="x" aria-label="Close" onClick={onClose} />
        </div>
        <div className="modal__body" style={{ flex: 1 }}>{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel} width={440}
      footer={<>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
      </>}>
      <p className="muted" style={{ margin: 0 }}>{message}</p>
    </Modal>
  );
}

export function Dropdown({ trigger, children, align = "left", width = 220, up = true }: {
  trigger: ReactNode; children: ReactNode; align?: "left" | "right"; width?: number;
  /** Open upward (default, for footer menus) or downward (topbar menus). */
  up?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEscape(() => setOpen(false));
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const pos: CSSProperties = up
    ? { bottom: "calc(100% + 6px)" }
    : { top: "calc(100% + 6px)" };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div className="menu" onClick={() => setOpen(false)}
          style={{ position: "absolute", ...pos, [align]: 0, width, maxHeight: "70vh", overflowY: "auto", zIndex: 80 } as CSSProperties}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, active }: { icon?: string; children: ReactNode; onClick?: () => void; active?: boolean }) {
  return <button className={cx("menu__item", active && "is-active")} onClick={onClick} style={{ width: "100%", textAlign: "left", border: 0, background: "transparent", font: "inherit", cursor: "pointer" }}>
    {icon && <Icon name={icon} size={15} />}{children}
  </button>;
}

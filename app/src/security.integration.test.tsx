import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "@/App";
import { AppProvider } from "@/state/AppContext";
import { ToastProvider } from "@/ui/toast";
import { clearPersisted } from "@/data/localRepository";

afterEach(() => { cleanup(); clearPersisted(); });

// Render the REAL app (router + shell + pages) at a path as a given user, so we
// exercise route-level access control — not just component props.
function renderApp(path: string, userId: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider initialUserId={userId}>
        <ToastProvider><App /></ToastProvider>
      </AppProvider>
    </MemoryRouter>,
  );
}

describe("security — a requester hitting restricted routes directly", () => {
  it("cannot open the triage queue (/requests/triage)", () => {
    renderApp("/requests/triage", "USR-REQ");
    expect(screen.getByText(/Triage is a lead's queue/i)).toBeInTheDocument();
    // and the submitted request in the queue is not exposed
    expect(screen.queryByText("REQ-2026-00002")).toBeNull();
  });

  it("cannot open a triage workspace (/requests/triage/:id)", () => {
    renderApp("/requests/triage/REQ-2026-00002", "USR-REQ");
    expect(screen.getByText(/No access/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /System proposal/ })).toBeNull();
  });

  it("cannot open the full request register (/requests/all)", () => {
    renderApp("/requests/all", "USR-REQ");
    expect(screen.getByText(/for legal users/i)).toBeInTheDocument();
  });

  it("cannot see internal content on their own request (no SLA/category/audit/internal-note)", () => {
    renderApp("/requests/REQ-2026-00001", "USR-REQ");
    // Their own request IS visible…
    expect(screen.getByRole("heading", { name: "REQ-2026-00001" })).toBeInTheDocument();
    // …but nothing internal leaks.
    expect(screen.queryByRole("heading", { name: /SLA & TAT/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Audit trail/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /^Tasks$/ })).toBeNull();
    expect(screen.queryByText("Legal category")).toBeNull();
    expect(screen.queryByText(/internal note/i)).toBeNull();
  });
});

describe("security — positive controls (a Director may access the same routes)", () => {
  it("sees the triage queue", () => {
    renderApp("/requests/triage", "USR-DIR");
    expect(screen.getByRole("heading", { name: "Triage" })).toBeInTheDocument();
    expect(screen.getByText("REQ-2026-00002")).toBeInTheDocument();
  });

  it("sees the triage workspace", () => {
    renderApp("/requests/triage/REQ-2026-00002", "USR-DIR");
    expect(screen.getByRole("heading", { name: /System proposal/ })).toBeInTheDocument();
  });

  it("sees the register and internal content", () => {
    renderApp("/requests/all", "USR-DIR");
    expect(screen.getByRole("heading", { name: "All Requests" })).toBeInTheDocument();
    cleanup();
    renderApp("/requests/REQ-2026-00001", "USR-DIR");
    expect(screen.getByRole("heading", { name: /SLA & TAT/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Audit trail/ })).toBeInTheDocument();
  });
});

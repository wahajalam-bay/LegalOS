import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "@/pages/HomePage";
import { AppProvider } from "@/state/AppContext";
import { ToastProvider } from "@/ui/toast";
import { clearPersisted } from "@/data/localRepository";

afterEach(() => { cleanup(); clearPersisted(); });

function renderHome(userId: string) {
  return render(
    <MemoryRouter>
      <AppProvider initialUserId={userId}>
        <ToastProvider><HomePage /></ToastProvider>
      </AppProvider>
    </MemoryRouter>,
  );
}

describe("role-based landing workspaces", () => {
  it("requester lands on My Requests", () => {
    renderHome("USR-REQ");
    expect(screen.getByRole("heading", { name: "My Requests" })).toBeInTheDocument();
  });
  it("senior associate lands on My Queue", () => {
    renderHome("USR-ASSOC");
    expect(screen.getByRole("heading", { name: "My Queue" })).toBeInTheDocument();
  });
  it("manager/AM also lands on My Queue", () => {
    renderHome("USR-MGR");
    expect(screen.getByRole("heading", { name: "My Queue" })).toBeInTheDocument();
  });
  it("paralegal lands on My Tasks", () => {
    renderHome("USR-PARA");
    expect(screen.getByRole("heading", { name: "My Tasks" })).toBeInTheDocument();
  });
  it("AD / Senior Manager lands on My Team", () => {
    renderHome("USR-AD");
    expect(screen.getByRole("heading", { name: "My Team" })).toBeInTheDocument();
  });
  it("director lands on Legal Operations", () => {
    renderHome("USR-DIR");
    expect(screen.getByRole("heading", { name: "Legal Operations" })).toBeInTheDocument();
  });

  it("does not leak internal operations language into the requester landing", () => {
    renderHome("USR-REQ");
    expect(screen.queryByText(/Unassigned/i)).toBeNull();
    expect(screen.queryByText(/SLA breached/i)).toBeNull();
    expect(screen.queryByText(/Workload distribution/i)).toBeNull();
    expect(screen.queryByText(/Legal category/i)).toBeNull();
  });
});

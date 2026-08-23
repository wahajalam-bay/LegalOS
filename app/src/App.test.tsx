import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "@/App";
import { AppProvider } from "@/state/AppContext";
import { ToastProvider } from "@/ui/toast";
import { clearPersisted } from "@/data/localRepository";

afterEach(() => { cleanup(); clearPersisted(); });

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AppProvider>
    </MemoryRouter>,
  );
}

describe("Application shell", () => {
  it("renders the brand, primary nav and Home landing", () => {
    renderAt("/");
    expect(screen.getAllByText("LegalOS").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /Legal Operations/ })).toBeInTheDocument();
    // Primary nav present (Requests is the functional area)
    expect(screen.getAllByText("Requests").length).toBeGreaterThan(0);
  });

  it("marks unimplemented modules as coming soon", () => {
    renderAt("/matters");
    expect(screen.getByRole("heading", { name: "Matters" })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it("shows the requests list under the Requests area", () => {
    renderAt("/requests");
    // My Requests subnav tab + the New request action
    expect(screen.getByRole("heading", { name: "My Requests" })).toBeInTheDocument();
  });
});

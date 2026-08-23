import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { TriageQueuePage } from "./TriageQueuePage";
import { TriageDetailPage } from "./TriageDetailPage";
import { AppProvider } from "@/state/AppContext";
import { ToastProvider } from "@/ui/toast";
import { clearPersisted } from "@/data/localRepository";

afterEach(() => { cleanup(); clearPersisted(); });

function renderQueue(userId: string) {
  return render(
    <MemoryRouter initialEntries={["/requests/triage"]}>
      <AppProvider initialUserId={userId}>
        <ToastProvider>
          <Routes><Route path="/requests/triage" element={<TriageQueuePage />} /></Routes>
        </ToastProvider>
      </AppProvider>
    </MemoryRouter>,
  );
}

function renderDetail(userId: string, id = "REQ-2026-00002") {
  return render(
    <MemoryRouter initialEntries={[`/requests/triage/${id}`]}>
      <AppProvider initialUserId={userId}>
        <ToastProvider>
          <Routes><Route path="/requests/triage/:id" element={<TriageDetailPage />} /></Routes>
        </ToastProvider>
      </AppProvider>
    </MemoryRouter>,
  );
}

describe("Triage — permission restrictions", () => {
  it("shows the queue to a triage-authorised lead (Director)", () => {
    renderQueue("USR-DIR");
    expect(screen.getByRole("heading", { name: "Triage" })).toBeInTheDocument();
    // seeded Submitted requests are listed
    expect(screen.getByText("REQ-2026-00002")).toBeInTheDocument();
  });

  it("hides the triage queue from a requester", () => {
    renderQueue("USR-REQ");
    expect(screen.getByText(/Triage is a lead's queue/i)).toBeInTheDocument();
    expect(screen.queryByText("REQ-2026-00002")).not.toBeInTheDocument();
  });

  it("opens the triage workspace for a lead", () => {
    renderDetail("USR-DIR");
    expect(screen.getByRole("heading", { name: /System proposal/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Original request/ })).toBeInTheDocument();
  });

  it("denies the triage workspace to a requester", () => {
    renderDetail("USR-REQ");
    expect(screen.getByText(/No access/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /System proposal/ })).not.toBeInTheDocument();
  });
});

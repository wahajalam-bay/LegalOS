import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "@/App";
import { AppProvider } from "@/state/AppContext";
import { clearPersisted } from "@/data/localRepository";

afterEach(() => { cleanup(); clearPersisted(); });

describe("App shell", () => {
  it("renders the request queue at the index route", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppProvider>
          <App />
        </AppProvider>
      </MemoryRouter>,
    );
    // PageHeader renders immediately (outside the loading branch)
    expect(screen.getByRole("heading", { name: "Requests" })).toBeInTheDocument();
    // Primary nav is present (sidebar + header both link to New request)
    expect(screen.getAllByRole("link", { name: "New request" }).length).toBeGreaterThan(0);
  });
});

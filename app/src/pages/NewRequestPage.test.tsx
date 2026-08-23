import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { NewRequestPage } from "./NewRequestPage";
import { AppProvider } from "@/state/AppContext";
import { ToastProvider } from "@/ui/toast";
import { clearPersisted } from "@/data/localRepository";

afterEach(() => { cleanup(); clearPersisted(); try { localStorage.clear(); } catch { /* ignore */ } });

function setup() {
  return render(
    <MemoryRouter initialEntries={["/requests/new"]}>
      <AppProvider>
        <ToastProvider>
          <Routes>
            <Route path="/requests/new" element={<NewRequestPage />} />
            <Route path="/requests/:id" element={<div>REQUEST DETAIL PAGE</div>} />
            <Route path="/requests" element={<div>REQUEST LIST PAGE</div>} />
          </Routes>
        </ToastProvider>
      </AppProvider>
    </MemoryRouter>,
  );
}

const cont = () => fireEvent.click(screen.getByRole("button", { name: /^Continue$/ }));
const submit = () => fireEvent.click(screen.getByRole("button", { name: /Submit request/ }));
const type = (label: string, value: string) => fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value } });
const select = (label: string, value: string) => fireEvent.change(screen.getByRole("combobox", { name: label }), { target: { value } });
const pickRadio = (name: RegExp) => fireEvent.click(screen.getByRole("radio", { name }));

function fillAbout(desc = "We want to sign a services deal with a new supplier.", ctx = "New SaaS vendor for marketing; need it reviewed before month end.") {
  type("What do you need help with?", desc);
  type("Business context / background", ctx);
  cont();
}

// Advance the remaining steps (Details → Attachments → Review) and submit.
function finishAndSubmit() {
  cont(); // Details → Attachments
  cont(); // Attachments → Review
  submit();
}

function expectSubmitted() {
  expect(screen.getByText(/Request submitted successfully/)).toBeInTheDocument();
  expect(screen.getAllByText(/REQ-2026-\d{5}/).length).toBeGreaterThan(0);
}

describe("Requester intake wizard", () => {
  it("1. submits a normal (advice) request end to end", () => {
    setup();
    fillAbout("Can we run a prize draw promotion?", "Marketing wants a regional prize draw next quarter.");
    pickRadio(/advice on whether we can do something/i);
    type("What's the question?", "Is a prize draw permitted in KSA?");
    cont(); // Type → Details
    finishAndSubmit();
    expectSubmitted();
  });

  it("2. submits a contract (agreement) request with conditional details", () => {
    setup();
    fillAbout();
    pickRadio(/entering into an agreement/i);
    type("Counterparty name", "Acme Cloud Ltd");
    cont();
    finishAndSubmit();
    expectSubmitted();
  });

  it("3. submits a dispute (threat) request", () => {
    setup();
    fillAbout("A supplier is threatening legal action.", "They sent a letter alleging breach of contract.");
    pickRadio(/threatening or has commenced action/i);
    type("Who is the other party?", "Acme Cloud Ltd");
    type("What is the claim or threat?", "Alleged breach of the services agreement.");
    cont();
    finishAndSubmit();
    expectSubmitted();
  });

  it("4. submits a compliance (allowed) request", () => {
    setup();
    fillAbout("Can we launch this product feature?", "New payments feature; unsure about regulatory approval.");
    pickRadio(/check if this is allowed/i);
    type("Which product or activity?", "In-app wallet top-ups");
    cont();
    finishAndSubmit();
    expectSubmitted();
  });

  it("5. submits an IP (protect) request via a select", () => {
    setup();
    fillAbout("We need to protect our new brand name.", "Launching a new product line and want the brand protected.");
    pickRadio(/protect something we've created/i);
    select("What are we protecting?", "Trademark / Brand");
    cont();
    finishAndSubmit();
    expectSubmitted();
  });

  it("6. submits an emergency-urgency request", () => {
    setup();
    fillAbout();
    pickRadio(/entering into an agreement/i);
    type("Counterparty name", "Acme Cloud Ltd");
    cont(); // → Details
    pickRadio(/Emergency/);
    finishAndSubmit();
    expectSubmitted();
  });

  it("7. requires a justification when the needed-by date is tighter than SLA", () => {
    setup();
    fillAbout();
    pickRadio(/entering into an agreement/i);
    type("Counterparty name", "Acme Cloud Ltd");
    cont(); // → Details
    // A near-term date is tighter than the standard turnaround.
    fireEvent.change(screen.getByLabelText("Needed by"), { target: { value: "2026-08-24" } });
    cont(); // attempt to advance — should block
    expect(screen.getByText(/tighter than standard/i)).toBeInTheDocument();
    type("Why is this needed sooner?", "Counterparty deadline to sign this week.");
    cont(); // now advances → Attachments
    cont(); // → Review
    submit();
    expectSubmitted();
  });

  it("8. accepts multiple attachments and rejects unsupported types", () => {
    const { container } = setup();
    fillAbout();
    pickRadio(/entering into an agreement/i);
    type("Counterparty name", "Acme Cloud Ltd");
    cont(); // → Details
    cont(); // → Attachments
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const good1 = new File(["a"], "term-sheet.pdf", { type: "application/pdf" });
    const good2 = new File(["b"], "pricing.xlsx", { type: "application/vnd.ms-excel" });
    const bad = new File(["c"], "notes.exe", { type: "application/octet-stream" });
    fireEvent.change(fileInput, { target: { files: [good1, good2, bad] } });
    expect(screen.getByText("term-sheet.pdf")).toBeInTheDocument();
    expect(screen.getByText("pricing.xlsx")).toBeInTheDocument();
    expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument();
    cont(); // → Review
    expectReviewShowsAttachment();
    submit();
    expectSubmitted();
  });

  it("9. shows validation errors and blocks advancing when required fields are empty", () => {
    setup();
    cont(); // step 0 with nothing filled
    expect(screen.getByText(/Tell us in a sentence/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /What do you need help with/ })).toBeInTheDocument(); // still on step 0
    // Fill about, advance, then try to skip the type selection
    fillAbout();
    cont(); // no type chosen
    expect(screen.getByText(/Choose the option that best describes/)).toBeInTheDocument();
    // Choose a type that requires a conditional field but leave it empty
    pickRadio(/entering into an agreement/i);
    cont();
    expect(screen.getByText(/Counterparty name is required/)).toBeInTheDocument();
  });

  it("10. lets the requester edit a section from the review screen before submitting", () => {
    setup();
    fillAbout();
    pickRadio(/entering into an agreement/i);
    type("Counterparty name", "Acme Cloud Ltd");
    cont(); // → Details
    cont(); // → Attachments
    cont(); // → Review
    expect(screen.getByRole("heading", { name: /Review & submit/ })).toBeInTheDocument();
    // Edit the "What you need" section
    const section = screen.getByText("What you need").closest(".review-section") as HTMLElement;
    fireEvent.click(within(section).getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: /What do you need help with/ })).toBeInTheDocument();
  });
});

function expectReviewShowsAttachment() {
  const section = screen.getByText("Attachments", { selector: ".review-section__head b" }).closest(".review-section") as HTMLElement;
  expect(within(section).getByText("term-sheet.pdf")).toBeInTheDocument();
}

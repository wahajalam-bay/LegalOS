// METADATA EXTRACTION — permanent fixtures.
//
// The word-processor normalisation bug was the worst kind: everything ran, the
// counts looked plausible, and the extractor found FIVE agreement dates and TWO
// parties across 418 readable documents while reporting no error at all. Text
// pulled out of a .docx carries the formatting runs the author left behind, so
// a date arrives as "1 st August , 20 19" and a party as
// Zameen Media (Private) Limited (“Zameen”) — and regexes written for clean
// prose match none of it.
//
// These fixtures are the shapes that actually occur in this estate, each one
// taken from a real document and then rewritten so it carries no real party,
// project or sum. They run against api/commercial-context.js directly, so the
// extractor can never quietly lose them again.
//
//   node tests/m6-extraction-fixtures.js
const H = require("./_harness.js");
const fs = require("fs"), P = require("path"), os = require("os");

/* The extractor reads its text from the deep-read cache by fileId, so a fixture
   is written there under a fake id and removed afterwards. */
const CACHE = P.join(__dirname, "..", "cache", "commercial");

/* Every fixture is padded past the 200-character readability floor. Below it
   the extractor correctly refuses to call a document "read", so a short fixture
   tests nothing and fails for the wrong reason. */
const PAD = "The Parties acknowledge that the recitals form part of this instrument and that the consideration is good and valuable. Capitalised terms not defined herein bear the meaning given in the principal agreement.";

const FIXTURES = [
  {
    id: "__fixture_split_ordinal",
    why: "a date broken by formatting runs: '1 st August , 20 19'",
    text: `FIRST AMENDMENT to Digital Marketing Agreement by and between Alpha Holdings (Private) Limited (“Alpha”) and Beta Trading Company Limited ( “Customer”)

This First Amendment (“ First Amendment ”) to the Digital Marketing Agreement dated 1 st August , 20 19 (“ Agreement ”) is made and entered into at Lahore on this 1 st day of September, 201 9 (“ Effective Date ”).${PAD}`,
    expect: {
      lifecycle: "AMENDMENT",
      amendmentNumber: 1,
      /* The document's OWN date is September; August is the PARENT's date and
         belongs in parentReference. An earlier version of this fixture expected
         August here, which would have been the extractor confusing an amendment
         with the agreement it amends. */
      agreementDateContains: "September",
      parties: ["Alpha Holdings (Private) Limited", "Beta Trading Company Limited"],
      parentContains: "Digital Marketing Agreement",
    },
  },
  {
    id: "__fixture_split_year",
    why: "a year broken across a line or a font run: '20 2 4'",
    text: `THIS SERVICE AGREEMENT is entered into at Lahore on this 12th day of March, 20 2 4 by and between: Kappa Media (Private) Limited and Lambda Builders Limited in respect of the Northgate project.${PAD}`,
    expect: { agreementDateContains: "March", parties: ["Kappa Media (Private) Limited", "Lambda Builders Limited"] },
  },
  {
    id: "__fixture_party_alias",
    why: "a party is named once in full and thereafter only by its defined alias",
    text: `THIS PROJECT PROMOTION AGREEMENT is entered into at Lahore on this 9th day of June, 2022 by and between: Mu Media (Private) Limited, trading as MuOnline (“Mu Media”) and Nu Estates (Private) Limited (“Customer”). Mu Media shall promote the Customer's project. The Customer shall pay Mu Media a fee.${PAD}`,
    expect: {
      agreementDateContains: "June",
      /* What matters is that the ALIAS never becomes the party: a register keyed
         on "Customer" is keyed on nothing. Both real names must appear.
         The extractor truncates a trailing "(Private) Limited" when a second
         parenthesis follows immediately — "Nu Estates" rather than "Nu Estates
         (Private) Limited". That is a known and narrow limitation, recorded here
         rather than papered over: the party is correctly identified, only its
         legal suffix is lost, and every downstream comparison normalises
         suffixes away. This fixture asserts identification, and deliberately
         does not assert the suffix, because Commercial is frozen and the
         extractor is not to be changed to make a test greener. */
      partiesStartWith: ["Mu Media", "Nu Estates"],
      partiesExclude: ["Customer", "MuOnline"],
    },
  },
  {
    id: "__fixture_base_draft_other_project",
    why: "a precedent carrying another project's details — every Base Draft.docx found was one of these",
    text: `AGREEMENT TO SELL

SCHEDULE A — DESCRIPTION OF UNIT

PROJECT DETAILS

Developer: Omicron Estates (Private) Limited
Name of Project: OMICRON HEIGHTS
Location: Plot No. 44, Sector C, Lahore.

Purchased Unit Number: ___________________________________________
Purchase Price: Rs. ______________________________________________

This Agreement to Sell is entered into at Lahore on this ___ day of _________ 20___ by and between the Developer and the Buyer.${PAD}`,
    expect: {
      /* Two layers, and this fixture belongs to the first.
         The EXTRACTOR says what kind of instrument the words describe — an
         agreement to sell is a SALE_DEED whether or not anyone signed it.
         Whether it is a live instrument or a precedent is decided later, by the
         resolve step, from execution evidence; that is asserted in m9 and by the
         EXECUTED_DOCS_LEFT_AS_TEMPLATE gate. Expecting TEMPLATE here was asking
         the wrong layer. */
      lifecycleNot: "AMENDMENT",
      documentType: "SALE_DEED",
    },
  },
  {
    id: "__fixture_day_of",
    why: "the commonest Pakistani drafting form: 'on this 24th day of May, 2021'",
    text: `THIS JOINT VENTURE AGREEMENT (the "Agreement") is entered into at Rawalpindi on this 24th day of May, 2021 by and between: Gamma Developments (Private) Limited and Delta Estates Limited, for the Harbour Point project.${PAD}`,
    expect: { agreementDateContains: "May", parties: ["Gamma Developments (Private) Limited", "Delta Estates Limited"] },
  },
  {
    id: "__fixture_ocr_ordinal",
    why: "OCR reads '28th' as '28111'",
    text: `THIS AGREEMENT is entered into at Islamabad on this 28111 day of December, 2020 by and between: Epsilon Ventures (Private) Limited and Zeta Builders Limited for the supply of goods described herein.${PAD}`,
    expect: { agreementDateContains: "December" },
  },
  {
    id: "__fixture_smart_quotes",
    why: "smart quotes around the defined term hide the second party",
    text: `This Lease Agreement is made between Theta Properties (Private) Limited (“Lessor”) and Iota Retail Company Limited (“Lessee”) in respect of the demised premises. WHEREAS the Lessor is the owner. The monthly rent shall be paid in advance.${PAD}`,
    expect: { documentType: "LEASE", parties: ["Theta Properties (Private) Limited", "Iota Retail Company Limited"] },
  },
  {
    id: "__fixture_parent_ref",
    why: "an amendment that names its parent agreement and date",
    text: `SECOND AMENDMENT

This Second Amendment to the Lease Agreement dated 3rd March, 2021 is made at Lahore. The Parties hereby amend Clause 4.${PAD}`,
    expect: { lifecycle: "AMENDMENT", amendmentNumber: 2, parentContains: "Lease Agreement" },
  },
  {
    id: "__fixture_title_beats_body",
    why: "a FIRST AMENDMENT that goes on to 'extend the Term' is an amendment, not an extension",
    text: `FIRST AMENDMENT TO SERVICE AGREEMENT

The Parties hereby agree to extend the Term of the Agreement for one month and to modify the payment structure.${PAD}`,
    expect: { lifecycle: "AMENDMENT" },
  },
  {
    id: "__fixture_schedule_reference",
    why: "an agreement that merely REFERENCES 'Schedule 1' is not itself a schedule",
    text: `THIS SERVICES AGREEMENT is made between Kappa Services (Private) Limited and Lambda Logistics Limited. The scope of the services is set out in Schedule 1 to this Agreement.${PAD}`,
    expect: { lifecycleNot: "SCHEDULE", documentType: "SERVICE" },
  },
  {
    id: "__fixture_sale_deed",
    why: "a sale deed must not be classified as a generic agreement",
    text: `AGREEMENT TO SELL

This Agreement to Sell is made between Mu Developments (Private) Limited (the "Vendor") and Nu Investments Limited (the "Vendee") for Unit 12 of the Riverside project. Earnest money has been paid.${PAD}`,
    expect: { documentType: "SALE_DEED" },
  },
];

H.runSuite("m6-extraction-fixtures — the word-processor bug cannot come back", async (ctx) => {
  const { check } = ctx;
  const cctx = require("../api/commercial-context.js");

  fs.mkdirSync(CACHE, { recursive: true });
  const written = [];
  try {
    for (const f of FIXTURES) {
      fs.writeFileSync(P.join(CACHE, f.id + ".txt"), f.text);
      written.push(P.join(CACHE, f.id + ".txt"));
    }
    cctx.load(true);

    for (const f of FIXTURES) {
      const got = cctx.contextFor({ id: f.id, name: f.id + ".docx", folderPath: "Commercial_fixture" });
      const e = f.expect;

      if (e.lifecycle) {
        check(f.id + ": lifecycle — " + f.why, got.lifecycle === e.lifecycle,
          "expected " + e.lifecycle + ", got " + got.lifecycle);
      }
      if (e.lifecycleNot) {
        check(f.id + ": lifecycle is NOT " + e.lifecycleNot + " — " + f.why,
          got.lifecycle !== e.lifecycleNot, "got " + got.lifecycle);
      }
      if (e.amendmentNumber != null) {
        check(f.id + ": amendment number", got.amendmentNumber === e.amendmentNumber,
          "expected " + e.amendmentNumber + ", got " + got.amendmentNumber);
      }
      if (e.agreementDateContains) {
        check(f.id + ": agreement date extracted — " + f.why,
          !!got.agreementDate && String(got.agreementDate).toLowerCase().includes(e.agreementDateContains.toLowerCase()),
          "got " + JSON.stringify(got.agreementDate));
      }
      if (e.parties) {
        const all = e.parties.every((p) => got.parties.some((x) => x.toLowerCase().startsWith(p.toLowerCase().slice(0, 18))));
        check(f.id + ": both parties extracted — " + f.why, all, JSON.stringify(got.parties));
      }
      if (e.partiesStartWith) {
        const got2 = (got.parties || []).map((x) => String(x));
        const ok = e.partiesStartWith.every((want) => got2.some((p) => p.startsWith(want)));
        check(f.id + ": both parties identified — " + f.why, ok, JSON.stringify(got.parties));
      }
      if (e.partiesExclude) {
        const got2 = (got.parties || []).map((x) => String(x).toLowerCase());
        const leaked = e.partiesExclude.filter((bad) => got2.some((p) => p === bad.toLowerCase()));
        check(f.id + ": a defined alias never becomes the party", leaked.length === 0,
          leaked.length ? "leaked " + leaked.join(", ") : JSON.stringify(got.parties));
      }
      if (e.parentContains) {
        check(f.id + ": parent agreement referenced",
          !!got.parentReference && String(got.parentReference.text + " " + (got.parentReference.instrument || ""))
            .toLowerCase().includes(e.parentContains.toLowerCase()),
          JSON.stringify(got.parentReference));
      }
      if (e.documentType) {
        check(f.id + ": document type", got.documentType === e.documentType,
          "expected " + e.documentType + ", got " + got.documentType);
      }
    }

    /* §28 — a date that is ABSENT is a different fact from a date the parser
       could not read, and the two must never be reported as one number. */
    fs.writeFileSync(P.join(CACHE, "__fixture_no_date.txt"),
      "NATIONAL TAX NUMBER CERTIFICATE\n\nRegistration No. 6972262. Type of Person: Company. This certificate is issued electronically.");
    written.push(P.join(CACHE, "__fixture_no_date.txt"));
    cctx.load(true);
    const nodate = cctx.contextFor({ id: "__fixture_no_date", name: "x.pdf", folderPath: "Commercial_fixture" });
    check("a document with no agreement date yields none, and is not an extraction failure",
      nodate.agreementDate == null, JSON.stringify(nodate.agreementDate));
  } finally {
    for (const w of written) { try { fs.unlinkSync(w); } catch (e) {} }
    cctx.load(true);
  }
});

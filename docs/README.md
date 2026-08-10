# LegalOS documentation

Three documents and a folder of templates. Read them in order.

| File | What it is | Who reads it |
|---|---|---|
| **[03-ORG-ARCHITECTURE-BUILD.md](03-ORG-ARCHITECTURE-BUILD.md)** | **Newest.** The department's Functional Requirements Document, section by section, mapped to what is now built — the three teams, twelve modules, TAT v2 with intra-dept holds, cost tracking, RBAC — with the demo click-path for the review meeting. | You, going back to the department after their review. |
| **[01-SYSTEM-FUNCTIONALITY.md](01-SYSTEM-FUNCTIONALITY.md)** | Inventory of the pre-FRD system (sprints 1–5): the requester portal, the five engines (turnaround, spine, reminders, extraction, filters), every field in every data slice, and what is real versus seam. Still accurate for those layers. | Anyone joining the project. |
| **[02-DATA-COLLECTION-PACK.md](02-DATA-COLLECTION-PACK.md)** | The twelve things to ask the legal department for, in three phases, with formats, priorities, owners, ready-to-send emails, a 45-minute meeting agenda, the confidentiality answers you will need, and an honest list of gaps to disclose. | You, going into the conversation with legal. |
| **[collection-templates/](collection-templates/)** | Twelve CSVs, pre-filled with the current draft registers so the department **corrects** rather than starts from blank. Attach the relevant ones to each email. | The legal department. |

## The templates

| File | Ask | Pre-filled? |
|---|---|---|
| `01-legal-entities.csv` | Entity structure | Yes, 15 entities to keep / rename / delete |
| `02-legal-team.csv` | Team roster and capacity | Desks pre-listed, people blank |
| `03-contract-types.csv` | Contract type register | Yes, all 21 types to mark up |
| `04-company-contract-type-matrix.csv` | Which entity can request which type | Yes, the current grid pre-ticked |
| `05-turnaround-matrix.csv` | Turnaround by type and risk | Yes, all 22 rows plus the three questions to settle |
| `06-desks-categories-locations.csv` | Desks, categories, physical locations, sites | Yes, all four lists |
| `07-contract-register.csv` | **The contract register** | Header plus two worked example rows |
| `08-licence-register.csv` | Licence register | Header plus two worked example rows |
| `09-required-documents.csv` | What legal always has to chase, per type | Yes, 20 checklists to correct |
| `10-current-request-backlog.csv` | What is on their plate now | Header plus one worked example |
| `11-document-storage-questions.csv` | Where files live, and can we have samples | 10 questions with an owner each |
| `12-historical-volumes.csv` | Monthly volumes and turnaround | 12 months, blank |

## Start here

1. Skim `01` section 1 and 2 so you can describe the system in two minutes.
2. Read `02` Part 1 (the three phases) and Part 5 (the meeting agenda).
3. Print `01` section 7 (the registers) and section 4.2 (the turnaround matrix), or
   send the matching CSVs.
4. Book 45 minutes with the General Counsel.

## The one thing to get right

Phase 1 is six asks and almost no documents. It is mostly **decisions**: which
entities, which contract types, which desk, how many days. Land those and every
screen stops looking like a demo and starts looking like their department. That is
what earns you the contract register in phase 2.

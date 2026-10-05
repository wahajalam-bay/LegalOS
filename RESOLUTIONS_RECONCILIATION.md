# Board resolutions — reconciliation

Generated 2026-09-23T19:28:03.851Z by `tools/resolutions-reconcile.js`.

## The estate

| | |
|---|---|
| Source roots | `Entities data for secp filing`, `Compliance Data _LegalOS` |
| Resolution entity folders | 47 |
| Source files | 886 |
| Document files | 837 |
| Tracker spreadsheets | 49 |

Resolution folders live under **two** roots: `Compliance Data _LegalOS / Resolutions`
and each company's own `<entity>-Resolutions & Authorizations` folder inside the SECP
root. The document sweep was restricted to the compliance root, so every resolution filed
in the other one resolved to no document at all.

## Records

| | |
|---|---|
| Individual resolutions | **965** |
| Indexed by a tracker sheet | 933 |
| Derived from the folder alone | 32 |
| Entities represented | 47 |
| Documents on records | 977 |
| Resolutions carrying more than one document | 12 |
| Resolutions with no document found | 1 |

An entity folder is a container, not a record. Each numbered resolution inside it is its
own record, and carries every document filed under that number — the resolution, the board
minute, the notice, the signed copy, the acknowledgement. The matcher previously attached
the first file it found and stopped.

**A tracker is not required for a record to exist.** Companies that file resolutions in
Drive without maintaining the summary sheet had no records at all: Dubizzle Labs' entire
board-resolution history and eight of Zameen Medallion's, 32
documents in total. Those are now folder-derived records, marked
`SOURCE_ONLY_NO_TRACKER_ROW` so nobody mistakes them for tracker-indexed ones.

The register number grammar is the company's own: `002`, `02`, `99.1` (a sub-number)
and `129A` (a companion document filed under resolution 129) all belong to their
resolution, and sort in the company's own register order rather than by date.

## Disposition

| | |
|---|---|
| Document files | 837 |
| Reaching a record | 837 |
| **Without disposition** | **0** |
| Held by another register family | 1 |

A document sitting in a resolutions folder does not always belong to the resolutions
register: one is
claimed by Commercial — a "Novation & Renewal" agreement is a contract, not a board
resolution — and the stronger claim wins rather than the file being listed twice or lost.

## Gates

| Gate | Value | Result |
|---|---|---|
| FILES WITHOUT DISPOSITION | 0 | PASS |
| RECORDS WITHOUT SOURCE LINEAGE | 0 | PASS |
| BROKEN DRIVE LINKS | 0 | PASS |

## Provenance

Every record retains, unmodified:

- `sourceEntityFolder` — the exact Drive folder name, suffix and all
- `sourceFolderId`, `parentFolderId`, `sourceRootId`, `sourceRootName`
- `fullDrivePath`
- every document's `driveFileId` and exact filename

The display entity is canonical ("Zameen Axis"); the source folder stays verbatim
("Zameen Axis(SMC-Pvt)Ltd_Resolutions & Authorizations"). Normalization decides what is
shown, never where the source lives.

## Artifacts

- `audit/resolutions-source-inventory.json`
- `audit/resolutions-records.json`
- `audit/resolutions-file-disposition.json`
- `audit/resolutions-final-summary.json`

Regression: `node tests/m23-resolutions-source.js`, `node tests/m22-drive-readonly.js`.

No write of any kind was made to the Drive source.

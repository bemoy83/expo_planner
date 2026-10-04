# First Executable MVP Acceptance Pack v0.1

**Document:** First Executable MVP Acceptance Pack  
**Version:** 0.1  
**Status:** Accepted Fixture and Verification Baseline  
**Date:** 2026-09-29  
**Product Authority:** Resource Planning Application PRD v0.8  
**Technical Authority:** Architecture Decision - Browser-Local First Executable MVP Application Stack v0.1  
**Interaction Authority:** First Executable MVP Technical / Continuous Planning Workspace v0.1  
**Booking-Demand Authority:** Booking Demand Conversion and Review Contract v0.1  
**Documentation Map:** Documentation Map v0.1

**Revision note:** v0.1 defines the deterministic fixtures, expected results, mutations, workbook-fixture construction requirements and verification matrix for first executable MVP acceptance. The demand-conversion alignment retains the original workspace fixture while adding explicit acceptance traceability for raw Visma conversion, persistent Venyoo/mapping/KPI configuration, review and publication under Booking Demand Conversion and Review Contract v0.1. The decision-register refresh confirms B1-B20 as the accepted operational baseline, including authoritative signed `Totalt antall` aggregation and five-digit Project Occurrence/Series identity. The capacity refresh replaces fixture-relative competence capacity with application-maintained pooled permanent capacity, generated Norwegian workdays, audited overrides and negative-delta warnings. It does not expand scheduling scope.

---

# 1. Purpose and Authority

This pack makes the current first executable MVP acceptance criteria objectively testable. It is authoritative for fixture realization and expected results.

The authority order remains:

1. the PRD is authoritative for product scope and outcomes;
2. the Architecture Decision is authoritative for technical acceptance criteria;
3. the Workspace Design is authoritative for interaction behavior;
4. the Booking Demand Conversion and Review Contract is authoritative for source-to-demand domain behavior;
5. this Acceptance Pack is authoritative for fixtures, scenarios and expected results.

If this pack conflicts with an upstream document, the conflict must be recorded and the pack must not reinterpret the upstream requirement. Acceptance is blocked for the affected scenario until the authoritative document or this pack is corrected.

The current Architecture Decision contains criteria A1 through A23. The current Workspace Design contains criteria W1 through W23. Booking Demand Conversion and Review Contract v0.1 contains acceptance scenarios B1 through B20, corresponding to its Sections 15.1 through 15.20. This pack maps every current criterion explicitly.

---

# 2. Evidentiary Boundary

The deterministic fixture uses:

- source-backed VVS and overlapping-event names, aliases, locations and phase dates;
- deterministic fixture-owned canonical IDs;
- synthetic Accepted Demand PH, manual Daily Resource Allocations, application-maintained permanent-capacity settings and dependency data.

The deterministic canonical core validates workspace, projection, persistence and arithmetic behavior. The booking-demand fixture track validates raw Visma staging, persistent configuration reuse, conversion lineage, review, publication and replacement without changing the canonical core's hand-verifiable totals.

It does not:

- reproduce or validate the actual 891.486 PH VVS planning baseline;
- represent an approved operational plan;
- validate the VVS scheduling contract;
- infer the business meaning of organization values from fixture contents; operational `Avdeling` routing is accepted only through the approved source-specific mapping workflow;
- validate skill-specific capacity, absence, overtime or hired-help availability;
- test automatic schedule generation.

Synthetic PH in this pack must never be described as source-backed VVS demand. A fixture canonical ID is not a source identity. Actual source labels and known source IDs are retained separately in provenance.

---

# 3. Fixture Layers

Acceptance uses five separate fixture layers:

1. **Deterministic canonical core fixture:** small exact records and hand-verifiable results for correctness.
2. **Legacy workbook compatibility fixtures:** purpose-built ordered and reordered `tabell_venyou` / `Tabell_oppgaver` workbooks retained to verify the earlier planner adapter boundary; they are not the operational demand source.
3. **Mutation and failure fixtures:** controlled changes to the canonical core or staged import.
4. **Generated scale fixture:** deterministic synthetic volume for performance characterization, never operational truth.
5. **Booking-demand conversion fixtures:** sanitized Venyoo, raw Visma, mapping and KPI workbooks that exercise the authoritative source-to-demand contract without publishing real operational data.

Correctness acceptance uses the canonical core and mutation fixtures. The generated scale fixture characterizes performance and verifies virtualization correctness without setting release timing thresholds.

---

# 4. Legacy Planner Workbook Inspection Snapshot

The workbook evidence below is an inspection snapshot, not a frozen import contract.

| Field | Snapshot value |
|---|---|
| Inspected filename | `Bemanning_Behov_24 måneder – Kopi.xlsx` |
| SHA-256 | `1bb81f033edcc773776c2464e942cccf70903e3a9fb67ef352437631880d0e82` |
| File size | 1,814,373 bytes |
| File modified | 2026-09-26 13:19:17 +0200 |
| Inspection date | 2026-09-27 |
| Inspection mode | Read-only workbook structure and cached-value inspection |

Any workbook change requires a new evidence snapshot with a new checksum, inspection date and observed-structure report before a sanitized compatibility fixture can be frozen.

## 4.1 Observed Structures and Counts

| Sheet or table | Observed range | Observed records or purpose |
|---|---|---|
| `tabell_venyou` / `Tabell2` | `A1:T862` | 861 source rows; 520 rows and 142 distinct event names for 2026; 19 locations in 2026 |
| `Tabell_oppgaver` sheet | `A1:AA5668` | 5,667 source rows; 2,046 rows, 51 nonblank project numbers and 22 competence labels for 2026; 82 VVS 2026 rows |
| `Kalender` / `Tabell_datoer` | `Q4:ABR6` | 730 dates from 2026-01-01 through 2027-12-31 |
| `Kalender` / `tabell_messeoversikt` | `Q8:ABR35` | Derived event-location calendar presentation |
| `Kalender` / `Tabell_fte_normaltid` | `Q37:ABR49` | Derived or entered staffing context; not approved capacity input |
| `Kalender` / `Tabell_overtid` | `Q51:ABR55` | Overtime presentation context |
| `Kalender` / `Tabell_fte_utilgjengelig` | `Q58:ABR60` | Unavailable-capacity presentation context |
| `Kalender` / `Tabell_fte_dagsbehov` | `Q62:ABR62` | Derived daily need presentation |
| `Kalender` / `Tabell_planlagt_bemanning` | `Q63:ABR63` | Derived available-staffing presentation |
| `Kalender` / `Tabell_differanse_behov` | `Q64:ABR65` | Derived variance presentation |
| `Kalender` / `tabell_ressursallokering` | `A67:ABR89` | 22 current VVS allocation rows across 730 date columns |

The 2026 task-source combinations produce 1,050 observed non-zero project × source-grouping × competence × phase candidates. This count informs only the generated scale fixture; it is not a claim that all candidates are accepted canonical demand.

## 4.2 Verified Headers

Verified `tabell_venyou` headers are:

`Locations`, `Event name`, `Assembly start date`, `Assembly end date`, `Moving in start date`, `Moving in end date`, `Event start date`, `Event end date`, `Moving out start date`, `Moving out end date`, `Dismantle start date`, `Dismantle end date`, `Status`, `Hjelpekolonne`, `hjelpekolonne2`, `E_start_dato`, `E_slutt_dato`, `Årstall`, `Filter`, `Exclude`.

Verified `Tabell_oppgaver` headers are:

`REG.DATO`, `EVENTÅR`, `PROSJEKTNR`, `PROSJEKT/ ARRANGEMENT`, `OPPDRAGSGIVER/ KILDE`, `FAKTURA-MOTTAKER`, `ARBEIDSOPPGAVER/ GJØREMÅL`, `ANTALL`, `ENHET`, `BESKREIVELSE`, `STAND/OMRÅDE`, `HALL/ LOKASJON`, `NØKKELOMRÅDER`, `DATAGRUNNLAG`, `EFFEKT`, `MONTERING`, `DEMONTERING`, `KOMMENTAR`, `SUM ESTIMAT`, `workType`, `Nøkkelfilter`, `Nøkkelfilter2`, `Prosjekt_ID`, `Prosjekt_ÅR`, `Prosjekt_NR`, `Kontroll`, `Prosjekt_NAVN`.

Verified leading `tabell_ressursallokering` headers are:

`PROSJEKT`, `PROSJEKT_NR`, `PROSJEKT_ID`, `PROSJEKT_DATA`, `DATA FRA`, `NØKKELOMRÅDER`, `ARBEIDSFASE`, `DATAGRUNNLAG`, `HJELPEKOLONNE`, `TIMER`, `PLANLAGT START`, `PLANLAGT SLUTT`, `BESKRIVELSE`, `FTE BEHOV`, `FTE PLAN`, `DELTA BEHOV`.

Its remaining table columns use generic `Kolonne...` headers and obtain date meaning from the separate calendar date row. That relationship is observed but not frozen as an import contract.

---

# 5. Deterministic Canonical Core Fixture

## 5.1 Workspace Configuration

| Field | Exact value |
|---|---|
| `workspaceId` | `WS-ACCEPT-01` |
| `schemaVersion` | `acceptance-core-0.1` |
| `displayHoursPerFteDay` | `7.5` |
| Resource comparison dates | 2026-10-12 through 2026-10-15 inclusive |
| Venyoo ledger coverage | 2026-01-01 through 2026-12-31 inclusive for the operational `location_format` fixture |
| Permanent crew count | `17` |
| Permanent hours per workday | `7.5` |
| Permanent capacity scope | `date`, pooled across all competences |
| Workday calendar | Europe/Oslo; weekdays excluding Norwegian national public holidays, with audited manual date overrides |
| Fixture generator | `acceptance-core-generator/0.1` |
| Fixture seed | `20260927` |

## 5.2 Events

Canonical IDs in this table are deterministic fixture identities.

| Fixture Event ID | Fixture display label | Known source ID | Source-backed evidence | Origin/status |
|---|---|---|---|---|
| `EVT-VVS-26970` | VVS 2026 | Project `26970`; series `970` retained as provenance only | Planner label `VVS 2026`; venue rows 413–414 use `VVS DAGENE 2026` | fixture identity; valid; reviewed; active |
| `EVT-OMS-2026` | OSLO MOTOR SHOW 2026 | Not established | venue rows 429–430 for C and D1 | fixture identity; valid; reviewed; active |

## 5.3 Event Aliases

| Fixture Alias ID | Source label | Fixture Event ID | Source reference |
|---|---|---|---|
| `ALIAS-VVS-PLANNER` | `VVS 2026` | `EVT-VVS-26970` | workbook `Kalender`, `tabell_ressursallokering`; known project label and source ID retained separately |
| `ALIAS-VVS-VENYOU` | `VVS DAGENE 2026` | `EVT-VVS-26970` | workbook `tabell_venyou`, rows 413–414 |
| `ALIAS-OMS-VENYOU` | `OSLO MOTOR SHOW 2026` | `EVT-OMS-2026` | workbook `tabell_venyou`, rows 429–430 |

The alias bindings are fixture-reviewed bindings. Their canonical fixture IDs were not read from the workbook.

## 5.4 Locations

| Fixture Location ID | Source label | Source references | Origin/status |
|---|---|---|---|
| `LOC-C` | `C` | `tabell_venyou` rows 413 and 429 | fixture identity with workbook-backed label; valid; reviewed; active |
| `LOC-D1` | `D1` | `tabell_venyou` rows 414 and 430 | fixture identity with workbook-backed label; valid; reviewed; active |

## 5.5 Event Phase Intervals

| Fixture Phase ID | Event | Location | Phase | Start | End | Source row |
|---|---|---|---|---|---|---:|
| `PHASE-VVS-C-A` | VVS | C | Assembly | 2026-09-28 | 2026-10-07 | 413 |
| `PHASE-VVS-C-MI` | VVS | C | Moving in | 2026-10-08 | 2026-10-13 | 413 |
| `PHASE-VVS-C-E` | VVS | C | Event | 2026-10-14 | 2026-10-16 | 413 |
| `PHASE-VVS-C-MO` | VVS | C | Moving out | 2026-10-17 | 2026-10-19 | 413 |
| `PHASE-VVS-C-D` | VVS | C | Dismantling | 2026-10-20 | 2026-10-21 | 413 |
| `PHASE-VVS-D1-A` | VVS | D1 | Assembly | 2026-09-28 | 2026-10-07 | 414 |
| `PHASE-VVS-D1-MI` | VVS | D1 | Moving in | 2026-10-08 | 2026-10-13 | 414 |
| `PHASE-VVS-D1-E` | VVS | D1 | Event | 2026-10-14 | 2026-10-16 | 414 |
| `PHASE-VVS-D1-MO` | VVS | D1 | Moving out | 2026-10-17 | 2026-10-19 | 414 |
| `PHASE-VVS-D1-D` | VVS | D1 | Dismantling | 2026-10-20 | 2026-10-21 | 414 |
| `PHASE-OMS-C-A` | OMS | C | Assembly | 2026-10-13 | 2026-10-20 | 429 |
| `PHASE-OMS-D1-A` | OMS | D1 | Assembly | 2026-10-13 | 2026-10-20 | 430 |

The intervals are fixture records whose labels and dates are backed by the inspection snapshot. They expose overlap context in C and D1 without classifying or enforcing a conflict.

## 5.6 Planning Competence Areas

| Fixture Competence ID | Label | Workbook evidence | Origin/status |
|---|---|---|---|
| `COMP-FOGA` | FOGA | observed `NØKKELOMRÅDER` and planner row label | fixture identity; valid; reviewed; active |
| `COMP-PRINT` | Print | observed `NØKKELOMRÅDER` and planner row label | fixture identity; valid; reviewed; active |
| `COMP-SNEKKER` | Snekker | observed `NØKKELOMRÅDER` and planner row label | fixture identity; valid; reviewed; active |

These records are flat Nøkkelområde demand buckets. They do not represent competence levels, worker eligibility or individual skills.

## 5.7 Legacy Compatibility Organization Fixture

| Fixture Organization ID | Preserved source field/value | Evidence | Origin/status |
|---|---|---|---|
| `ORG-32` | `FAKTURA-MOTTAKER=32` | `Tabell_oppgaver!F5559` and other VVS rows | fixture identity; valid; unverified meaning; active |
| `ORG-65` | `FAKTURA-MOTTAKER=65` | `Tabell_oppgaver!F5597` and other VVS rows | fixture identity; valid; unverified meaning; active |

The fixture uses legacy `Fakturamottaker` values only to test canonical Organization grouping through explicit fixture bindings. It does not make `Fakturamottaker` equivalent to operational raw Visma `Avdeling` or approve its business meaning.

## 5.8 Accepted Demand Scopes

All PH in this table are synthetic fixture values. Every record has `originType=fixture`, `validationStatus=valid`, `assuranceStatus=reviewed`, `recordLifecycle=active`, `ownership=system` and `sourceRef=acceptance-core-v0.1`.

| Demand Scope ID | Event | Location | Phase | Organization | Competence | Accepted Demand PH |
|---|---|---|---|---|---|---:|
| `DS-VVS-F` | VVS | C | Assembly | 32 | FOGA | 18 |
| `DS-VVS-P` | VVS | D1 | Assembly | 65 | Print | 12 |
| `DS-VVS-S` | VVS | C | Assembly | 32 | Snekker | 7.5 |
| `DS-OMS-F` | OMS | C | Assembly | 65 | FOGA | 12 |
| `DS-OMS-P` | OMS | D1 | Assembly | 32 | Print | 10 |
| **Total** | | | | | | **59.5** |

These are Work-Demand Phases. The Venyoo intervals in Section 5.5 remain separate Venue Phases. The dated manual allocations below may intersect moving-in or event intervals without changing the Demand Scope phase.

## 5.9 Daily Resource Allocations

Every record has `originType=manual`, `validationStatus=valid`, `assuranceStatus=reviewed`, `recordLifecycle=active`, `ownership=user`, `actorId=fixture-planner` and `auditRef=AUDIT-MANUAL-SEED-01`.

| Allocation ID | Demand Scope | Date | Allocated PH |
|---|---|---|---:|
| `ALLOC-VVS-F-20261012` | `DS-VVS-F` | 2026-10-12 | 8 |
| `ALLOC-VVS-F-20261013` | `DS-VVS-F` | 2026-10-13 | 10 |
| `ALLOC-VVS-P-20261012` | `DS-VVS-P` | 2026-10-12 | 5 |
| `ALLOC-VVS-P-20261013` | `DS-VVS-P` | 2026-10-13 | 5 |
| `ALLOC-VVS-S-20261014` | `DS-VVS-S` | 2026-10-14 | 4.125 |
| `ALLOC-VVS-S-20261015` | `DS-VVS-S` | 2026-10-15 | 3.375 |
| `ALLOC-OMS-F-20261013` | `DS-OMS-F` | 2026-10-13 | 8 |
| `ALLOC-OMS-F-20261014` | `DS-OMS-F` | 2026-10-14 | 4 |
| `ALLOC-OMS-P-20261013` | `DS-OMS-P` | 2026-10-13 | 4 |
| `ALLOC-OMS-P-20261014` | `DS-OMS-P` | 2026-10-14 | 6 |
| **Total** | | | **57.5** |

## 5.10 Permanent Crew Capacity

The workspace owns versioned settings `permanentCrewCount=17` and `permanentHoursPerWorkday=7.5`. The active Norwegian calendar rule classifies all four comparison dates as workdays. No manual date override applies in the base fixture.

| Date | Workday source | Permanent Capacity PH | Total Daily Allocated PH | Permanent Capacity Delta PH | Additional PH Required |
|---|---|---:|---:|---:|---:|
| 2026-10-12 | generated weekday | 127.5 | 13 | 114.5 | 0 |
| 2026-10-13 | generated weekday | 127.5 | 27 | 100.5 | 0 |
| 2026-10-14 | generated weekday | 127.5 | 14.125 | 113.375 | 0 |
| 2026-10-15 | generated weekday | 127.5 | 3.375 | 124.125 | 0 |
| **Period result** | | **510** | **57.5** | **452.5** | **0** |

Capacity is pooled and has no competence, Event, Organization, Location or Work Type dimension. The period delta is informational; dates with negative delta must always remain individually visible and must never be hidden through period netting.

## 5.11 Read-Only Dependency

| Dependency ID | Predecessor | Successor | Behavior | Provenance |
|---|---|---|---|---|
| `DEP-VVS-C-MI-E` | `PHASE-VVS-C-MI` | `PHASE-VVS-C-E` | read-only visual sequence; no eligibility or enforcement effect | synthetic fixture; valid; reviewed; active |

## 5.12 Provenance Sets

| Provenance ID | Applies to | Origin | Validation | Assurance | Lifecycle | Ownership | Source reference |
|---|---|---|---|---|---|---|---|
| `PROV-WB-SNAPSHOT-01` | source-backed labels, aliases, locations and phase attributes | workbook | valid | reviewed | active | source | filename, checksum, sheet and row recorded in Sections 4 and 5 |
| `PROV-FIXTURE-CORE-01` | fixture canonical IDs and synthetic demand | fixture | valid | reviewed | active | system | `acceptance-core-v0.1`, seed `20260927` |
| `PROV-MANUAL-ALLOC-01` | ten allocation records | manual | valid | reviewed | active | user | actor `fixture-planner`, audit `AUDIT-MANUAL-SEED-01` |
| `PROV-CAPACITY-01` | crew settings and generated workday classifications | manual and derived | valid | approved for planning | active | user/system | settings version plus Norwegian calendar-rule version; no date overrides in base fixture |
| `PROV-DERIVED-01` | projections, overlap context, balances and variance | derived | valid | reviewed | active | system | named formula and source-record IDs |

Permanent-capacity settings are operational planning inputs. They do not establish skill availability, named-worker feasibility, absence, overtime or hired-help capacity.

## 5.13 Audit Baseline

| Audit ID | Action | Actor | Expected record effect |
|---|---|---|---|
| `AUDIT-MANUAL-SEED-01` | install reviewed manual allocation fixture | `fixture-planner` | creates exactly the ten allocations in Section 5.9; preserves exact PH and provenance |

## 5.14 Expected Base Issues

| Issue ID | Severity/lifecycle | Applies to | Exact expected outcome |
|---|---|---|---|
| `ISSUE-ORG-SEMANTICS-01` | warning/open | `ORG-32`, `ORG-65` | UI states that source values are provisional groupings with unapproved business meaning |
| `ISSUE-OVERLAP-CONTEXT-01` | information/open | VVS and OMS phase intervals in C and D1 | overlap is visible as unclassified context; no invalidity, blocking or enforced resolution is inferred |

Unallocated PH is a visible balance but is not automatically classified as an Issue by this pack.

---

# 6. Expected Calculations and Invariants

## 6.1 Demand Reconciliation

| Demand Scope | Accepted PH | Total Allocated PH | Unallocated PH | Overallocated PH |
|---|---:|---:|---:|---:|
| `DS-VVS-F` | 18 | 18 | 0 | 0 |
| `DS-VVS-P` | 12 | 10 | 2 | 0 |
| `DS-VVS-S` | 7.5 | 7.5 | 0 | 0 |
| `DS-OMS-F` | 12 | 12 | 0 | 0 |
| `DS-OMS-P` | 10 | 10 | 0 | 0 |
| **Total** | **59.5** | **57.5** | **2** | **0** |

For every scope and the compatible aggregate:

	Accepted Demand PH + Overallocated PH
	= Total Allocated PH + Unallocated PH

## 6.2 Viewports

| Viewport | Visible Allocated PH | Accepted PH | Total Allocated PH | Unallocated PH | Overallocated PH |
|---|---:|---:|---:|---:|---:|
| 2026-10-12 through 2026-10-13 | 40 | 59.5 | 57.5 | 2 | 0 |
| 2026-10-14 through 2026-10-15 | 17.5 | 59.5 | 57.5 | 2 | 0 |

Changing the viewport changes only Visible Allocated PH and the stated capacity-summary period.

## 6.3 Required Projections

Event -> Competence produces:

| Event | Accepted PH | Allocated PH | Unallocated PH |
|---|---:|---:|---:|
| VVS | 37.5 | 35.5 | 2 |
| OMS | 22 | 22 | 0 |
| **Total** | **59.5** | **57.5** | **2** |

Event -> Organization -> Competence produces:

| Event | Organization | Accepted PH | Allocated PH | Unallocated PH |
|---|---|---:|---:|---:|
| VVS | 32 | 25.5 | 25.5 | 0 |
| VVS | 65 | 12 | 10 | 2 |
| OMS | 32 | 10 | 10 | 0 |
| OMS | 65 | 12 | 12 | 0 |
| **Total** | | **59.5** | **57.5** | **2** |

Both projections use the same facts. Pooled permanent capacity appears once as shared date-level context and is not repeated in Event, Organization or competence branches.

## 6.4 Permanent Capacity

For every date:

	Permanent Capacity PH = Workday ? 17 × 7.5 : 0
	Permanent Capacity Delta PH = Permanent Capacity PH - Total Daily Allocated PH
	Additional PH Required = max(0, -Permanent Capacity Delta PH)

The base period has `510 PH` permanent capacity, `57.5 PH` allocated and `0 PH` Additional PH Required. Mutation scenarios verify weekend, public-holiday, override and negative-delta behavior.

## 6.5 Display FTE

At `displayHoursPerFteDay=7.5` and deterministic half-up rounding to one decimal:

| Exact PH | Display FTE-day equivalent |
|---:|---:|
| 57.5 | 7.7 |
| 40 | 5.3 |
| 17.5 | 2.3 |
| 4.125 | 0.6 |
| 3.375 | 0.5 |
| 7.5 | 1.0 |

The two rounded Snekker daily values, `0.6` and `0.5`, are not summed. Exact PH is summed first, so `4.125 + 3.375 = 7.5 PH`, which converts once to `1.0`.

---

# 7. Workbook Fixtures and Source Tracks

The repository contains both legacy compatibility workbooks and sanitized booking-demand conversion fixtures. They serve different purposes and must not be treated as interchangeable operational sources.

## 7.1 Legacy Purpose-Built Verified-Header Workbooks

The two semantically identical compatibility workbooks are:

- `mvp-import-contract-ordered.xlsx`;
- `mvp-import-contract-reordered.xlsx`.

They contain:

1. `tabell_venyou` with table name `Tabell2`, the verified headers from Section 4.2 and the four source-backed venue rows corresponding to snapshot rows 413, 414, 429 and 430;
2. `Tabell_oppgaver` with the verified headers from Section 4.2 and a small sanitized set of source-like rows sufficient to preserve source labels, VVS project identity, legacy organization source values and competence labels;
3. no inferred canonical demand fields and no operational capacity data.

The reordered variant changes header order without changing labels or row values. Both variants must produce semantically identical staged source records, issues and proposed identity bindings.

The adapter may preserve `MONTERING` and `DEMONTERING` as source values, but these compatibility fixtures do not define the operational raw-Visma conversion pathway. Test review input supplies the exact fixture Demand Scope and Accepted Demand PH decisions explicitly and links them to retained source references.

## 7.2 Proposed Sanitized Compatibility Extract

A sanitized extract of the inspected current planner is proposed to test compatibility with:

- the actual `tabell_venyou` table shape;
- the `Tabell_oppgaver` worksheet shape;
- the separate calendar date row;
- the leading `tabell_ressursallokering` fields and wide daily-cell layout.

It remains an unfrozen legacy compatibility extract pending planner confirmation and sanitization review. Optional workbook-allocation adoption cannot become a required compatibility assertion until the authoritative row set, date-column interpretation, unit conversion, rounding, source identity and blank-versus-zero rules are approved.

## 7.3 Workbook Acceptance Workflow

The workbook fixtures must prove:

1. profile detection does not depend on column order;
2. additional irrelevant columns do not change detection, parsed semantics or profile version;
3. the source file need not contain or declare a format version;
4. a missing, duplicate or incompatible application-used field produces explicit structural failure without changing active data;
5. original source labels, values and references are preserved;
6. parsing creates a staged envelope and does not publish directly;
7. identity bindings are explicit review decisions;
8. accepted demand is adopted explicitly rather than inferred from structural validity;
9. any workbook allocation adoption is a separate explicit action with workbook provenance;
10. reviewed publication is atomic.

The application records the internally selected profile identifier and version. A new profile version is introduced only when a source change affects a field or structure used by the application. Prior versions remain available for older compatible exports.

Stable source identity for changed-file reimport remains a freeze condition. Identical-file idempotence may be tested by checksum and profile before a changed-row source-key contract exists.

## 7.4 Authoritative Booking-Demand Fixture Track

The first-executable-MVP operational demand pathway is exercised through sanitized fixtures under `fixtures/import/actual-source` representing:

1. a persistent Venyoo Location Format dataset;
2. a complete raw Visma booking snapshot;
3. versioned product, Work Type, amount/unit and Nøkkelområde mapping evidence;
4. versioned phase-specific productivity KPI evidence.

The first accepted fixture bundle establishes persistent Venyoo, mapping and KPI configuration. A routine subsequent scenario uploads only a new raw Visma snapshot and proves that unchanged approved configuration is reused. Mapping, KPI or Venyoo workbooks are supplied again only when the corresponding configuration or context changes.

`Tabell_oppgaver` is not an input to this authoritative fixture track. It remains legacy converted-planner evidence and may be used only for compatibility or comparison tests that are explicitly labelled as such.

---

# 8. Mutation and Failure Fixtures

Each mutation starts from the exact published base fixture unless stated otherwise.

| ID | Exact mutation | Publication result and Issue | Retained data and user-visible result |
|---|---|---|---|
| M01 | Reimport identical source checksum with the same profile | Idempotent no-op; no duplicate active facts or new planning Issue | IDs, counts, manual allocations, active checksum and planning audit history unchanged |
| M02 | Change `DS-VVS-P` Accepted Demand PH from 12 to 9 | Staged until explicit adoption; adoption publishes a new demand version and creates/updates a 1 PH over-allocation Issue | Global Accepted `56.5`, Allocated `57.5`, Unallocated `0`, Overallocated `1`; all allocations retained and editable |
| M03 | Mark an operational Visma import as partial for one of its present Project IDs | Demand publication is blocked because operational `utskrift_visma` coverage is complete per present Project ID | Existing active source-owned and user-owned records remain unchanged; staged evidence stays reviewable |
| M04 | Remove the source row supporting `DS-VVS-P` while the VVS Project ID remains present in the new Visma export | Reviewed replacement retires the absent source-owned work within covered VVS; affected manual records are disclosed | OMS and every other absent project remain untouched; allocation records remain; after VVS demand becomes inactive, behavior follows M14 |
| M05 | Make source alias `VVS 2026` resolve equally to two fixture Events | Affected binding is invalid and excluded; atomic publication containing it is rejected; ambiguous-identity Issue remains visible | Existing binding and active workspace unchanged; no silent first-match join |
| M06 | Propose moving `ALIAS-VVS-VENYOU` from `EVT-VVS-26970` to another fixture Event | Explicit identity-reconciliation command required; review lists every affected demand and allocation record | Existing identity and manual records remain until reviewed publication succeeds |
| M07 | Set `PHASE-VVS-C-MI` start to 2026-10-14 and end to 2026-10-13 | Invalid interval cannot enter published selection; atomic attempt containing it is rejected with no active change | A new reviewed selection may publish valid facts only by explicitly excluding it; exclusion and Issue remain visible |
| M08 | Set one Accepted Demand or allocation PH value, permanent crew count, or hours-per-workday setting to text, non-finite or negative | Invalid fact or setting cannot enter the active workspace; atomic attempt is rejected and the Issue records the original value | Existing valid demand, allocation and capacity settings remain unchanged; invalid numeric input is never converted to zero |
| M09 | Add a second active crew-setting version for the same effective date | Command rejected; conflict Issue identifies both versions | Existing 17 × 7.5 settings and every derived date remain unchanged |
| M10 | Add two active workday overrides for the same date | Command rejected atomically | Existing calendar classification remains unchanged; no first-match selection occurs |
| M11 | Allocate `2 PH` on Saturday 2026-10-17 and on Norwegian public holiday 2026-12-25 | Commands succeed; each date has `0 PH` permanent capacity, `-2 PH` delta and `2 PH` Additional PH Required warning | Allocations remain editable and no overtime or hired-help record is invented |
| M12 | Starting from M11, manually override 2026-12-25 to a workday | Audited override succeeds | Permanent capacity becomes `127.5 PH`, delta becomes `125.5 PH`, Additional PH Required becomes `0`, and the prior warning resolves |
| M13 | Add `ALLOC-VVS-P-20261015-M13` with 3 PH to `DS-VVS-P` | Manual command succeeds; over-allocation Issue is created/updated | Global Accepted `59.5`, Allocated `60.5`, Unallocated `0`, Overallocated `1`; Oct 15 total allocation becomes `6.375 PH`, permanent-capacity delta `121.125 PH` |
| M14 | Make `DS-VVS-P` inactive while retaining its two allocations totaling 10 PH | Inactive-demand Issue identifies both allocations | Active-demand reconciliation becomes Accepted `47.5`, Allocated `47.5`, Unallocated `0`, Overallocated `0`; pooled capacity consumption remains `57.5 PH` because all dated allocations remain |
| M15 | Make the competence reference on `ALLOC-VVS-P-20261013` unresolved while its Demand Scope remains resolvable | Unresolved-competence Issue; allocation retained | Demand reconciliation still includes its 5 PH; Oct 13 Total Daily Allocated remains `27 PH`, permanent-capacity delta remains `100.5 PH`, and no skill-specific capacity inference is attempted |
| M16 | Inject failure after staged validation but before atomic publication commits | Transaction rolls back; publication-failed Issue or operation result retains diagnostic without a partial publish | Canonical IDs, active record counts, active checksum and existing audit history remain byte-for-byte/logically unchanged; staged import remains reviewable |
| M17 | Restore backup with unsupported newer schema version | Restore rejected before active replacement; incompatible-schema result shown | Canonical IDs, active record counts, active checksum and audit history remain unchanged |

---

# 9. Generated Scale Fixture

The scale fixture uses generator version `scale-fixture-generator/0.1` and seed `20260927`. It is synthetic and exists only for performance characterization and virtualization correctness.

## 9.1 Evidence-Based Volumes

| Measure | Generated minimum | Derivation from inspection snapshot |
|---|---:|---|
| Planning horizon | 730 dates | `Tabell_datoer` date row spans 2026-01-01 through 2027-12-31 |
| Venue events | 142 | distinct 2026 `Event name` values in `tabell_venyou` |
| Venue intervals | 520 | 2026 rows in `tabell_venyou` |
| Resource event nodes | 52 | 51 nonblank 2026 project numbers plus one unresolved-event fixture bucket |
| Event/organization nodes | 113 | observed distinct 2026 project × preserved source-grouping combinations |
| Canonical leaf rows | 1,050 | observed non-zero 2026 project × source grouping × competence × phase combinations, converted to synthetic stable fixture rows |
| Daily allocations | 1,050 minimum | one deterministic dated allocation per synthetic leaf, distributed across the 730-day horizon |
| Dense allocation characterization | 10,500 | separate ten-dates-per-leaf generated run; not a correctness minimum |
| Competence buckets | 12 | distinct competence row labels in current VVS `tabell_ressursallokering` |
| Permanent-capacity settings versions | 1 active default | application-owned `17 × 7.5`; no materialized daily or competence capacity facts |
| Workday overrides | 0 in base scale fixture | generated Norwegian calendar supplies effective workday status until an audited override exists |
| Fully expanded projection nodes | 1,215 | 52 event + 113 event/organization + 1,050 leaf nodes |
| Collapsed resource rows | 52 | one row per generated resource event node |

The observed combinations inform shape and volume only. They are not treated as accepted canonical demand or operational capacity.

## 9.2 Characterization Record

Every run records:

- fixture generator version and seed;
- application version or commit identifier;
- browser name and version;
- operating system, CPU, memory and other available hardware information;
- import and publication duration separately;
- IndexedDB write and read duration separately;
- backup and restore duration separately;
- initial render duration;
- repeated horizontal and vertical interaction measurements;
- leaf edit latency through committed persistence;
- DOM node count at defined collapsed and expanded states;
- peak memory where the browser exposes it;
- correctness failures and console errors.

No release timing threshold is defined in v0.1.

A8 and W16 pass only when:

1. all 730 expected dates and all expected rows are reachable;
2. date headers remain aligned with rendered cells after repeated horizontal and vertical scrolling in both directions;
3. no persistent blank row or date band remains after scrolling settles;
4. virtualization, expansion and collapse do not change any planning fact or expected total;
5. no uncaught console error occurs during the scenario.

---

# 10. Verification Scenarios

Test-class labels are:

- **Domain/unit**;
- **Adapter integration**;
- **Persistence/transaction**;
- **Browser interaction**;
- **Visual/manual review**;
- **Performance characterization**.

## 10.1 Scenario Definitions

| Scenario | Given / When / Then | Primary classes |
|---|---|---|
| `S01-BROWSER-LOCAL` | Given a production build and blocked network, when the app loads and the core workflow is used, then no remote database, paid runtime service or remote application dependency is required | Browser interaction |
| `S02-LEGACY-IMPORT-COMPATIBILITY` | Given the two purpose-built legacy column-order variants, when each is parsed, then staged records, original labels, references and issues are semantically identical and the active workspace checksum is unchanged; this scenario does not establish operational demand publication | Adapter integration; Browser interaction; Persistence/transaction |
| `S03-PERSIST-BACKUP` | Given the published core fixture, when the browser reloads and a backup is exported and restored into an empty workspace, then canonical IDs, exact values, settings, Issues and Audit Entries match | Persistence/transaction; Browser interaction |
| `S04-SHARED-AXIS` | Given the core fixture, when the date axis scrolls and changes supported scale, then venue phases, allocations and capacity resolve to the same date columns and identifying columns remain visible | Browser interaction; Visual/manual review |
| `S05-VIRTUALIZATION` | Given the generated scale fixture, when first/last dates and rows are reached repeatedly in both directions, then all five A8/W16 conditions in Section 9.2 pass | Browser interaction; Performance characterization |
| `S06-PROJECTIONS` | Given the core fixture, when switching and expanding the two required projections, then totals remain `59.5/57.5/2/0`, pooled permanent capacity remains one shared date-level context, and no planning facts are written | Domain/unit; Browser interaction |
| `S07-ALLOCATION-EDIT` | Given an eligible leaf, when it is edited through an application command and an aggregate edit is attempted, then the leaf creates one exact allocation version and audit, while the aggregate attempt creates no allocation; reimport preserves the manual record | Domain/unit; Persistence/transaction; Browser interaction |
| `S08-CAPACITY-CONTEXT` | Given the 17 × 7.5 permanent-crew settings and generated workday calendar, when capacity is displayed, then all Section 5.10 values appear once as pooled operational context with settings and calendar provenance | Domain/unit; Browser interaction; Visual/manual review |
| `S09-VISUAL-CONTEXT` | Given the overlap and dependency records, when overlays are enabled, then both are inspectable, can be hidden, and neither blocks edits nor claims dependency enforcement or conflict classification | Browser interaction; Visual/manual review |
| `S10-ADAPTER-BOUNDARY` | Given architecture tests and a mock repository, when domain dependencies and use cases run, then domain code imports neither ExcelJS nor Dexie and the mock satisfies the same application interfaces | Domain/unit; Adapter integration |
| `S11-VIEWPORT-RECONCILIATION` | Given the two specified viewports, when switching between them, then Visible Allocated PH changes `40 ↔ 17.5` while Accepted, Total Allocated, Unallocated and Overallocated remain `59.5/57.5/2/0` | Domain/unit; Browser interaction |
| `S12-CAPACITY-CALENDAR` | Given M09 through M12, when settings, generated non-workdays and overrides are evaluated, then conflicts roll back, weekend and holiday allocation warns, and the audited workday override recomputes capacity exactly | Domain/unit; Persistence/transaction; Browser interaction |
| `S13-UNRESOLVED-ALLOCATION` | Given M14 and M15, when projections recalculate, then retained allocations affect active-demand reconciliation and capacity exactly as stated in those mutations | Domain/unit; Persistence/transaction; Browser interaction |
| `S14-OVERALLOCATION` | Given M13, when the command commits, then Accepted/Allocated/Unallocated/Overallocated are `59.5/60.5/0/1`, the allocation remains editable and the Issue is active | Domain/unit; Browser interaction |
| `S15-NEGATIVE-CAPACITY-DELTA` | Given a date whose Total Daily Allocated PH exceeds Permanent Capacity PH, when capacity is projected, then delta is negative, Additional PH Required equals its magnitude and a visible warning remains until resolved | Domain/unit; Browser interaction |
| `S16-PH-FIRST-FTE` | Given the Snekker allocations, when Display FTE is derived, then daily displays are `0.6` and `0.5`, while exact total `7.5 PH` converts once to `1.0` | Domain/unit; Browser interaction |
| `S17-BOOKING-DEMAND-CHAIN` | Given sanitized raw Visma, approved mapping and KPI data with reordered and irrelevant extra columns, when conversion runs, then structural detection selects the same internal profile without source-declared version metadata; every booking line is retained; each mapping exposes one Work Type label; and every result exposes the complete Work Type, rate, PH, Nøkkelområde and provenance chain | Domain/unit; Adapter integration; Browser interaction |
| `S18-PERSISTENT-REFERENCE-REUSE` | Given accepted Venyoo, mapping and KPI versions, when the application reloads or a later Visma-only snapshot is staged, then the same approved versions are reused; updating one reference dataset replays the retained Visma snapshot without requiring unchanged workbooks again | Adapter integration; Persistence/transaction; Browser interaction |
| `S19-UNRESOLVED-WORK-REVIEW` | Given calculated and unknown PH with resolved, review-required and explicit-placeholder routes, when the planner reviews Publish, Flag for review, Exclude and Not applicable outcomes, then every source line remains possible work unless explicitly excluded or Not applicable; no Undecided or review-required route is published; flagged calculated work retains exact PH; flagged unknown PH uses an explicit `0 PH` placeholder; and every placeholder, Issue, reason and source reference remains inspectable | Domain/unit; Browser interaction; Persistence/transaction |
| `S20-COMPLETE-SNAPSHOT-REPLACEMENT` | Given Visma exports containing different explicit source Project ID sets, when replacement is reviewed and published, then all prior Visma-owned work for projects present in the new export is superseded atomically, projects absent from that export remain untouched, unrelated facts and manual allocations remain, and identical republication is a no-op | Domain/unit; Persistence/transaction; Browser interaction |
| `S21-LOCATION-RESOLUTION` | Given a dated Venyoo ledger and booking halls that match, fail to match or become invalid, when the planner reviews location routing, then only locations associated with the mapped project are eligible, `Undetermined` remains available, approved mappings persist, and Venyoo never changes Visma demand coverage | Domain/unit; Adapter integration; Browser interaction |
| `S22-SIGNED-QUANTITY-AGGREGATION` | Given positive, offsetting negative and invalid net-negative rows, when the current Visma snapshot is converted, then signed `Totalt antall` is summed only by `Prosjekt × Work Anchor × Avdeling × Art.nr`; positive aggregates calculate normally, zero aggregates retain cancellation evidence without active demand, negative aggregates remain reviewable without negative demand, and no distinct-count exception changes the result | Domain/unit; Adapter integration; Browser interaction |
| `S23-PROJECT-OCCURRENCE-SERIES` | Given Visma Project IDs `26970` and `24970`, when identity and replacement coverage are derived, then they remain separate 2026 and 2024 Project Occurrences in recurring series `970`; replacing one occurrence leaves the other unchanged; and a malformed Project ID remains reviewable and blocks affected publication without guessed identity | Domain/unit; Adapter integration; Persistence/transaction |

---

# 11. Criterion Traceability

## 11.1 Architecture Criteria A1-A23

| Criterion | Scenario | Criterion-specific pass condition | Classification |
|---|---|---|---|
| A1 | S01 | Static browser build is produced and loaded successfully | Browser interaction |
| A2 | S01 | Workflow completes with network blocked and no required remote database or paid service | Browser interaction |
| A3 | S17-S23 | Raw Visma coverage is the exact present five-digit Project Occurrence ID set; Project Series is derived without merging years; signed quantity aggregation follows the authoritative source key; Venyoo supplies only dated eligible-location context; `Avdeling` uses source-specific Organization bindings; two work phases remain separate from five venue phases; reviewed demand publishes without invented mappings | Adapter integration; Browser interaction |
| A4 | S19-S20 | Reviewed canonical records publish atomically to IndexedDB and invalid or Undecided selections do not publish | Adapter integration; Persistence/transaction |
| A5 | S03 | Reload restores the exact active workspace and settings | Persistence/transaction; Browser interaction |
| A6 | S03, M17 | Compatible backup round-trip is exact; incompatible schema leaves active workspace unchanged | Persistence/transaction |
| A7 | S04 | Venue occupancy and allocations share the same rendered date coordinate system | Browser interaction; Visual/manual review |
| A8 | S05 | Every reachability, alignment, blank-band, invariant and console condition in Section 9.2 passes | Browser interaction; Performance characterization |
| A9 | S06 | Event -> Competence and Event -> Organization -> Competence return the exact Section 6 totals | Domain/unit; Browser interaction |
| A10 | S06 | Collapse and expansion preserve totals and Issue indicators | Browser interaction |
| A11 | S07 | One leaf edit creates one exact allocation version and Audit Entry; manual allocation stays authoritative | Domain/unit; Persistence/transaction; Browser interaction |
| A12 | S07 | Direct aggregate edit is rejected and creates no allocation record | Domain/unit; Browser interaction |
| A13 | S08 | Pooled Permanent Capacity PH, Delta and Additional PH Required appear once by date with settings and calendar provenance | Domain/unit; Browser interaction; Visual/manual review |
| A14 | S09 | Dependency renders read-only without replacing the grid or implying enforcement | Browser interaction; Visual/manual review |
| A15 | S10 | Automated dependency rule proves ExcelJS and Dexie are absent from domain imports | Domain/unit |
| A16 | S10 | Mock persistence adapter runs the same application commands and queries successfully | Domain/unit; Adapter integration |
| A17 | S11 | Viewport changes only Visible Allocated PH; reconciliation remains exact | Domain/unit; Browser interaction |
| A18 | S06 | Allocation and pooled capacity-period totals remain invariant; capacity appears once outside branches | Domain/unit; Browser interaction |
| A19 | S12 | Conflicting active settings or date overrides reject atomically; generated and overridden workday classifications are deterministic | Domain/unit; Persistence/transaction; Browser interaction |
| A20 | S13 | Unresolved allocation is retained, excluded from active demand only when demand is inactive, and its dated PH consumes pooled permanent capacity | Domain/unit; Persistence/transaction; Browser interaction |
| A21 | S14 | Manual over-allocation commits, Issue remains active and conservation invariant holds | Domain/unit; Browser interaction |
| A22 | S15 | Negative delta creates the exact Additional PH Required warning without inventing overtime or hired-help capacity | Domain/unit; Browser interaction |
| A23 | S16, S08 | PH is authoritative, Display FTE derives after aggregation, and capacity settings/calendar provenance is visible | Domain/unit; Browser interaction; Visual/manual review |

## 11.2 Workspace Criteria W1-W23

| Criterion | Scenario | Criterion-specific pass condition | Classification |
|---|---|---|---|
| W1 | S04, S18, S21 | Persistent dated Venyoo ledger stages, publishes and renders five venue phases by canonical location while supplying only project-eligible real location choices | Adapter integration; Browser interaction |
| W2 | S04 | Venue occupancy renders on a continuous horizontal date axis | Browser interaction; Visual/manual review |
| W3 | S04 | Undated Accepted Demand PH and dated Daily Allocated PH appear on the same planning surface | Browser interaction; Visual/manual review |
| W4 | S04 | Venue, resource and capacity layers retain one synchronized horizontal position | Browser interaction |
| W5 | S04 | Identifying columns remain visible while dates scroll | Browser interaction; Visual/manual review |
| W6 | S09 | Overlap is visible without being classified automatically as invalid | Browser interaction; Visual/manual review |
| W7 | S06 | Event -> Competence renders the exact fixture rows and totals | Domain/unit; Browser interaction |
| W8 | S06 | Event -> Organization -> Competence renders the same facts without a second plan | Domain/unit; Browser interaction |
| W9 | S06 | Expansion and collapse preserve totals and all three base Issue indicators | Browser interaction |
| W10 | S11 | Adopted demand and reconciliation measures retain exact provenance and viewport-independent totals | Domain/unit; Browser interaction |
| W11 | S08, S12 | Complete daily allocation shows exact pooled Permanent Capacity PH, Delta and Additional PH Required | Domain/unit; Browser interaction |
| W12 | S07 | Eligible leaf allocation cell edits through traceable command writeback | Persistence/transaction; Browser interaction |
| W13 | S07 | Ambiguous direct aggregate edit is prevented with no data change | Domain/unit; Browser interaction |
| W14 | S09 | Dependency indicator is read-only and does not replace the daily grid or imply enforcement | Browser interaction; Visual/manual review |
| W15 | S07, S13 | Reimport preserves manual allocation and keeps imported provenance separate from application audit history | Persistence/transaction; Browser interaction |
| W16 | S05 | All Section 9.2 virtualization correctness conditions pass across the 730-day generated horizon | Browser interaction; Performance characterization |
| W17 | S06 | Grouping, sorting and expansion over the same fact set preserve demand, allocation and pooled capacity totals without duplication | Domain/unit; Browser interaction |
| W18 | S12 | Conflicting settings/overrides reject; generated Norwegian non-workdays and audited overrides recompute deterministically | Domain/unit; Persistence/transaction; Browser interaction |
| W19 | S13 | Inactive-demand and unresolved-competence allocations remain visible and affect reconciliation while every dated PH consumes pooled capacity | Domain/unit; Persistence/transaction; Browser interaction |
| W20 | S14 | Overallocated PH `1` and active Issue are visible while the allocation remains editable | Domain/unit; Browser interaction |
| W21 | S15 | A negative permanent-capacity delta displays its exact magnitude as Additional PH Required and produces a warning | Domain/unit; Browser interaction |
| W22 | S16 | PH-first conversion displays `1.0`, not summed rounded `1.1`, with 7.5 PH/day visible | Domain/unit; Browser interaction |
| W23 | S08 | Crew settings, Norwegian calendar-rule version and manual override provenance appear wherever permanent capacity or delta is shown | Browser interaction; Visual/manual review |

## 11.3 Booking-Demand Criteria B1-B20

`B1` through `B20` correspond in order to Booking Demand Conversion and Review Contract v0.1 Sections 15.1 through 15.20.

| Criterion | Scenario | Criterion-specific pass condition | Classification |
|---|---|---|---|
| B1 | S18 | A previously approved source-product mapping resolves a later Visma-only import without another mapping-workbook upload | Adapter integration; Persistence/transaction |
| B2 | S17 | One booking line produces independent assembly and dismantling work with separate rates, PH and timing | Domain/unit |
| B3 | S19 | Possible work with unknown PH or a review-required route remains visible and Undecided without changing active demand | Domain/unit; Browser interaction |
| B4 | S19 | Flag for review publishes `0 PH` only for unknown PH; calculated PH is retained exactly under any planner-selected placeholder route, with separate Issues and provenance | Domain/unit; Browser interaction |
| B5 | S19 | Exclude publishes no active work and retains reason, history and source evidence | Domain/unit; Persistence/transaction |
| B6 | S20 | A later complete snapshot replaces prior Visma-owned demand without matching source rows across exports | Domain/unit; Persistence/transaction |
| B7 | S18 | Mapping or KPI updates replay the retained Visma snapshot without requiring another Visma upload or changing active demand before publication | Adapter integration; Persistence/transaction |
| B8 | S17, S19 | Every booking line and both phase outcomes reconcile across PH calculation, routing and disposition states; only explicit exclusion or Not applicable removes possible work | Domain/unit |
| B9 | S18 | Accepted Venyoo context survives reload and later Visma-only imports until explicitly replaced | Persistence/transaction |
| B10 | S21 | An unmatched hall has Review-required routing until mapped to a valid project location or deliberately to `Undetermined`; independently calculated PH is unchanged and the approved mapping is reused | Domain/unit; Browser interaction |
| B11 | S19, S21 | Explicit Location `Undetermined` permits flagged publication, retains exact known PH and remains visibly identified by an open routing Issue | Domain/unit; Browser interaction |
| B12 | S19 | Explicit competence `Unresolved` permits flagged publication, retains exact known PH and remains visibly identified by an open routing Issue | Domain/unit; Browser interaction |
| B13 | S21 | A Venyoo replacement that invalidates a location mapping returns affected work to review without silent fallback or PH loss | Adapter integration; Browser interaction |
| B14 | S17 | A published competence-demand result exposes complete booking-line-to-PH-and-flat-Nøkkelområde derivation without levels or worker-skill inference | Domain/unit; Browser interaction |
| B15 | S17 | Mapping review exposes one editable Work Type label, derives combined Work Type-and-unit display text, preserves rate bindings across label renames and requires rate review after unit changes | Domain/unit; Browser interaction; Persistence/transaction |
| B16 | S20 | A Visma export replaces prior Visma-owned work for exactly its present source Project IDs; projects absent from the export remain unchanged regardless of Venyoo coverage | Domain/unit; Persistence/transaction; Browser interaction |
| B17 | S17, S19 | Operational `Avdeling` resolves through a persistent source-specific Organization binding or explicit `Undetermined`; legacy `Fakturamottaker` does not merge automatically | Domain/unit; Adapter integration; Browser interaction |
| B18 | S04, S17 | Work-demand phase is only assembly or dismantling, Venyoo independently renders all five venue phases, and allocation dates do not relabel demand | Domain/unit; Adapter integration; Browser interaction |
| B19 | S22 | Signed `Totalt antall` is aggregated by the exact approved source key; positive, zero and negative results follow the accepted behavior and no distinct-count exception is applied | Domain/unit; Adapter integration; Browser interaction |
| B20 | S23 | Five-digit Visma Project IDs resolve to separate annual occurrences and a derived three-digit recurring series; replacement remains occurrence-specific and malformed IDs are never guessed | Domain/unit; Adapter integration; Persistence/transaction |

---

# 12. Decision and Evidence Register

## 12.1 Accepted Operational Baseline

The operational booking-demand decisions exercised by B1-B20 are closed for first executable MVP acceptance. In particular:

- every retained Visma booking line is possible work unless an approved rule marks it Not applicable or the planner explicitly excludes it;
- PH calculation, canonical routing and planner disposition are independent;
- explicit placeholder routes retain known PH and remain visibly flagged;
- approved product, KPI, Organization and Location/Hall mappings and the accepted Venyoo dataset persist and are reusable;
- one Visma import replaces prior Visma-owned work for exactly the source Project IDs present in that export;
- each five-digit Project ID is one annual occurrence in `[YY][PPP]` form; `PPP` relates recurring occurrences without merging their demand or replacement scope;
- Venyoo supplies persistent dated project/location context and eligible real Location/Hall choices, not booking-demand coverage;
- work-demand phases are Assembly and Dismantling, independently from the five Venyoo venue phases;
- `Totalt antall` is the signed demand measure, aggregated by `Prosjekt × Work Anchor × Avdeling × Art.nr` with no distinct-count exception;
- Nøkkelområde is one flat demand grouping, including explicit `Unresolved`, with no competence levels or worker-skill inference;
- pooled permanent capacity is maintained in the application at 17 crew × 7.5 hours per generated or manually overridden workday, and negative daily delta creates an Additional PH Required warning.

These decisions are not open questions in this pack. A failed acceptance scenario must be treated as an implementation defect or an upstream contract conflict, not as permission to reinterpret the behavior.

## 12.2 Deferred Operational Capabilities and Decisions

The following capabilities or remaining decisions are outside the current acceptance baseline:

- manual PH entry for work whose PH cannot be calculated;
- event-specific product-mapping or KPI overrides;
- adoption of a future authoritative immutable Visma booking-line identifier;
- effective dating beyond explicit mapping/KPI version selection;
- API-based replacement of workbook acquisition;
- the future dedicated Demand Management page, including Venyoo-triggered planning entries, review of occurrences with no discovered demand, audited `No demand to plan` confirmation, reopening when later Visma demand appears, review-only basis suggestions, sticky approved selections, non-mutating candidate comparison, readiness warnings and Demand Adjustments;
- skill-aware capacity, absence, hired-help and overtime representation beyond the pooled permanent crew.

Until implemented or further decided, these items must follow the conservative behavior in Booking Demand Conversion and Review Contract v0.1 and must not weaken possible-work visibility, provenance or explicit exclusion. Documented future behavior does not make a capability part of first-MVP acceptance.

## 12.3 Optional Legacy Compatibility Evidence

The following evidence remains unresolved and prevents freezing the optional sanitized legacy-planner compatibility workbook. It does not block the authoritative raw Visma conversion fixture track:

- confirmation that the inspected file and checksum represent the intended planner baseline;
- stable source keys for legacy `tabell_venyou`, `Tabell_oppgaver` and allocation rows;
- whether `Hjelpekolonne`, `hjelpekolonne2` or another composite is a trustworthy source identity;
- exact accepted-demand row selection and whether `MONTERING` and `DEMONTERING` are authoritative PH at the required scope;
- the role of `SUM ESTIMAT` relative to phase-specific values;
- final meaning of `FAKTURA-MOTTAKER` values and their relationship to `Avdeling`;
- legacy competence normalization, including `Skilting`, `Profilering` and zero-demand Design/Service rows; any apparent levels remain legacy evidence and are not first-MVP Nøkkelområde semantics;
- authoritative allocation rows in `tabell_ressursallokering`;
- whether daily allocation cells are authoritative FTE, the applicable PH conversion, rounding and blank-versus-zero semantics;
- the source and meaning of planned start/end and `FTE PLAN` totals;
- complete-snapshot versus partial-extract rules for each legacy planner workbook source;
- location-alias freeze rules;
- sanitization requirements for customer, event and commercial data;
- handling of formulas, cached values, external links and broken defined names in an extracted fixture.

Until these are confirmed, the legacy compatibility extract remains documented but unfrozen. It is not an operational publication dependency. Operational booking-demand acceptance is governed by B1-B20 and the accepted baseline in Section 12.1.

---

# 13. Explicit Exclusions

This Acceptance Pack excludes:

- automatic schedule generation;
- worker-level feasibility;
- personnel assignment;
- dependency enforcement;
- conflict classification;
- skill-specific capacity or worker-feasibility approval;
- scheduler-derived Residual Additional Resource Need;
- demand editing, Demand Adjustments, demand-candidate comparison, current/historical basis selection and phase-readiness decisions in the main Planning Workspace.

Additional PH Required is arithmetic against pooled permanent capacity. It is not skill-specific shortage, named-worker infeasibility or scheduler-derived residual need.

# 14. Release-Candidate Evidence Reconciliation — 2026-10-01

The S01–S23 definitions remain current. Sections 11.1–11.3 map every A1–A23, W1–W23 and B1–B20 criterion to those scenarios; the following register supplies the current executable or manual evidence behind each scenario. A criterion inherits the evidence of every scenario named in its Section 11 row.

| Scenarios | Current evidence | Result |
|---|---|---|
| S01 | `npm run build`; browser inspection of production-shaped local assets; no external script, link or image assets | Pass |
| S02 | `src/adapters/import/sampleConvertedPlanner/profile.test.ts`; `src/adapters/indexeddb/StagedImportPersistence.test.ts` | Pass; historical adapter compatibility only |
| S03 | `src/adapters/indexeddb/IndexedDbRepositories.test.ts`; `src/application/permanentCapacity.test.ts`; current browser reload | Pass |
| S04 | `src/features/workspace/PlanningWorkspace.test.tsx`; desktop and mobile browser inspection | Pass |
| S05 | `src/test/fixtures/scaleFixture.test.ts`; `src/features/workspace/PlanningWorkspace.test.tsx` scale and final-date tests | Pass; no timing threshold claimed |
| S06 | `src/domain/acceptance.test.ts`; `src/features/workspace/PlanningWorkspace.test.tsx` | Pass |
| S07 | `src/application/editLeafAllocation.test.ts`; `src/features/workspace/PlanningWorkspace.test.tsx` | Pass |
| S08 | `src/domain/acceptance.test.ts`; `src/application/permanentCapacity.test.ts`; desktop/mobile browser inspection | Pass |
| S09 | `src/domain/venueContext.test.ts`; `src/features/workspace/PlanningWorkspace.test.tsx` | Pass |
| S10 | `src/domain/dependencyBoundary.test.ts`; `src/domain/acceptance.test.ts` using the in-memory repository | Pass |
| S11 | `src/domain/acceptance.test.ts`; `src/features/workspace/PlanningWorkspace.test.tsx` | Pass |
| S12 | `src/application/permanentCapacity.test.ts`; `src/domain/acceptance.test.ts`; `src/features/data/WorkspaceData.test.tsx` | Pass |
| S13 | `src/domain/acceptance.test.ts`; `src/application/editLeafAllocation.test.ts` | Pass |
| S14 | `src/application/editLeafAllocation.test.ts`; browser base-value inspection | Pass |
| S15 | `src/application/permanentCapacity.test.ts`; `src/features/workspace/PlanningWorkspace.test.tsx` | Pass |
| S16 | `src/domain/acceptance.test.ts`; browser base-value inspection | Pass |
| S17 | `src/adapters/import/actualSource/profiles.test.ts`; `src/features/import/ImportReviewPanel.test.tsx` | Pass |
| S18 | `src/application/mappingRegistryService.test.ts`; `src/application/venyooVenueLedger.test.ts`; `src/adapters/indexeddb/StagedImportPersistence.test.ts` | Pass |
| S19 | `src/adapters/import/actualSource/profiles.test.ts`; `src/application/operationalWorkspace.test.ts`; `src/features/import/ImportReviewPanel.test.tsx` | Pass |
| S20 | `src/application/demandPublication.test.ts`; `src/application/editLeafAllocation.test.ts` | Pass |
| S21 | `src/application/venyooVenueLedger.test.ts`; `src/features/import/ImportReviewPanel.test.tsx` | Pass |
| S22 | `src/adapters/import/actualSource/profiles.test.ts`; current conversion no longer writes counted occurrences | Pass |
| S23 | `src/domain/projectOccurrence.test.ts`; `src/application/demandPublication.test.ts`; IndexedDB migration tests | Pass |
| S24 | `src/application/demandReviewAggregation.test.ts`; `src/features/import/ImportReviewPanel.test.tsx` | Compatible Visma phase results aggregate for review; incompatible state remains separate; quantities, PH and complete raw lineage reconcile; bulk decisions expand to constituents without changing publication semantics | Pass |
| S25 | `src/application/projectRegister.test.ts`; `src/application/venyooVenueLedger.test.ts`; backup and IndexedDB tests | Project-register detection ignores filename/column order, validates assigned/provisional IDs, resolves only unique normalized names or approved aliases, permits reasoned partial Venyoo acceptance, retains deferred evidence, preserves project-qualified location eligibility and rolls back persistence failure | Pass |

The supplied operational evidence is characterized, not hardcoded: `Prosjekt.xlsx` contains 623 source rows and 382 distinct valid Project IDs; the supplied Venyoo export contains 138 distinct Event names, of which 52 have a unique normalized-name match, one normalized name maps to multiple IDs and 85 have no exact normalized match. Tests recalculate these figures from the workbooks. The workbooks remain unmodified and uncommitted.

The canonical base remains unchanged: Accepted Demand `59.5 PH`, Total Allocated `57.5 PH`, Unallocated `2 PH`, Overallocated `0 PH`. For 2026-10-12 through 2026-10-15 the clean browser workspace shows Permanent Capacity `510 PH`, Complete Allocation `57.5 PH`, Capacity Delta `452.5 PH`, and Additional PH Required `0 PH`.

The former competence-capacity and distinct-occurrence publication assertions are not acceptance evidence. Fixture values remain explicitly synthetic and are never described as operational data.

---

**End of First Executable MVP Acceptance Pack v0.1**

# Documentation Map

**Document:** Documentation Map  
**Version:** 0.1  
**Status:** Current Non-Normative Navigation Aid  
**Last Alignment Date:** 2026-10-01

---

# 1. Purpose and Non-Authority

This map identifies the current document families, their scoped authority, dependencies and superseded versions. It is a navigation and governance aid only. It does not define product scope, domain meaning, implementation behavior, formulas, fixtures or acceptance scenarios.

If this map conflicts with a document that is authoritative within the relevant scope, that document wins and this map must be corrected.

---

# 2. Scoped Authority Model

## 2.1 First-Executable-MVP Branch

1. Resource Planning Application PRD v0.8 defines product outcomes, the roadmap and first-executable-MVP scope.
2. Architecture Decision - Browser-Local First Executable MVP Application Stack v0.1 defines the implementation boundary and technical criteria.
3. Booking Demand Conversion and Review Contract v0.1 defines source-to-demand domain behavior within the first-executable-MVP boundary.
4. First Executable MVP Technical / Continuous Planning Workspace v0.1 defines interaction behavior.
5. First Executable MVP Acceptance Pack v0.1 defines fixture realization and expected results only.

The Acceptance Pack applies only to its first-executable-MVP fixture remit. It has no authority relationship above or below scheduling-evaluation documents.

## 2.2 Scheduling-Evaluation Branch

1. Resource Planning Application PRD v0.8 establishes Phase E scope and target product direction.
2. First-Plan Contract v0.3 is authoritative for Phase E scheduling-domain meaning.
3. Scheduling Technical Design v0.3 - Scheduling Run technically elaborates the domain contract without changing it.
4. VVS 2026 First-Plan Validation Case v0.2 records evidence, coverage and unresolved inputs; it is never normative authority.
5. Automatic First-Plan Capability Gap Analysis v0.3 provides supporting source and workflow evidence; it is never normative authority.

First Executable MVP Technical / Continuous Planning Workspace v0.1 also constrains how scheduling may integrate with the workspace. No scheduling-evaluation document may expand first-executable-MVP acceptance.

## 2.3 Booking-Demand Conversion Branch

1. Resource Planning Application PRD v0.8 defines the broader demand-import outcome and release boundary.
2. Booking Demand Conversion and Review Contract v0.1 is authoritative for Visma snapshot semantics, persistent Venyoo context, mappings and KPIs, booking-line and phase meaning, possible-work inclusion, PH calculation status, per-dimension routing status, planner disposition, review, publication and replacement.
3. First Executable MVP Technical / Continuous Planning Workspace v0.1 defines how published demand is presented and manually allocated.

The conversion contract governs the source-to-demand portion of the first executable MVP without expanding scheduling, personnel, workforce feasibility or operational-capacity scope.

---

# 3. Current First-Executable-MVP Register

| Exact title | Filename | Version | Status | Role |
|---|---|---:|---|---|
| Resource Planning Application — Product Requirements Document | `Resource Planning Application PRD v0.8.md` | 0.8 | Working Draft | Product outcomes, roadmap and release scope |
| Architecture Decision — Browser-Local First Executable MVP Application Stack | `Architecture Decision - Browser-Local MVP Stack v0.1.md` | 0.1 | Accepted Technical Direction - Scope, Data Contract and Capacity Semantics Aligned | Implementation boundary and technical criteria |
| Booking Demand Conversion and Review Contract | `Booking Demand Conversion and Review Contract v0.1.md` | 0.1 | Authoritative Working Domain Contract | Raw Visma conversion, persistent reference configuration, review, publication and replacement semantics |
| First Executable MVP Technical / Continuous Planning Workspace v0.1 | `MVP Technical - Continuous Planning Workspace v0.1.md` | 0.1 | Working Technical Baseline - Scope, Data Contract and Capacity Semantics Aligned | Workspace interaction behavior |
| First Executable MVP Acceptance Pack v0.1 | `First Executable MVP Acceptance Pack v0.1.md` | 0.1 | Accepted Fixture and Verification Baseline | Fixture realization and expected results |
| Selective Rebuild Final Validation | `Selective Rebuild Final Validation v0.1.md` | 0.1 | Release-candidate evidence report | Non-normative implementation validation, compatibility register and release recommendation |

Dependency flow:

    PRD v0.8
        -> Architecture v0.1
        -> Booking Demand Conversion Contract v0.1
        -> Workspace v0.1
        -> Acceptance Pack v0.1

The arrows show scoped dependency, not a global authority chain.

## 3.1 Current Booking-Demand Conversion Register

| Exact title | Filename | Version | Status | Role |
|---|---|---:|---|---|
| Booking Demand Conversion and Review Contract | `Booking Demand Conversion and Review Contract v0.1.md` | 0.1 | Authoritative Working Domain Contract | Visma snapshot, persistent Venyoo/mapping/KPI context, Location/Hall resolution, phase work, review, publication and replacement semantics |

Dependency flow:

    PRD v0.8 demand-import direction
        -> Booking Demand Conversion and Review Contract v0.1
        -> Workspace v0.1 allocation interaction

The conversion contract governs its declared source-to-demand workflow inside the first-executable-MVP branch. It does not redefine the scheduling branch.

---

# 4. Current Scheduling-Evaluation Register

| Exact title | Filename | Version | Status | Role |
|---|---|---:|---|---|
| Resource Planning Application — Product Requirements Document | `Resource Planning Application PRD v0.8.md` | 0.8 | Working Draft | Establishes Phase E direction and boundary |
| First-Plan Contract | `First-Plan Contract v0.3.md` | 0.3 | Working Phase E Scheduling Domain Contract - Scope Aligned | Authoritative scheduling-domain meaning |
| Scheduling Technical Design v0.3 — Scheduling Run | `MVP Technical - Scheduling Design v0.3 - Scheduling Run.md` | 0.3 | Optional Scheduling-Evaluation Baseline - Scope and Shared Data Contract Aligned | Technical elaboration of the contract |
| VVS 2026 First-Plan Validation Case | `VVS 2026 First-Plan Validation Case v0.2.md` | 0.2 | Incomplete - Workforce Fixture and Occupancy Classification Evidence Missing | Evidence, coverage and unresolved inputs |

Dependency flow:

    PRD v0.8 Phase E direction
        -> First-Plan Contract v0.3
        -> Scheduling Technical Design v0.3
        -> VVS Validation Case v0.2 evidence

The Workspace Design constrains integration alongside this flow. The VVS case reports evidence and never changes upstream meaning.

---

# 5. Supporting Evidence Register

| Artifact | Filename | Status or treatment | Role |
|---|---|---|---|
| Automatic First-Plan Capability Gap Analysis | `Automatic First-Plan Capability Gap Analysis v0.3.md` | Supporting Phase E Evidence and Gap Analysis - Not First-Executable-MVP Authority | Source/workflow findings and capability gaps |
| Current Excel planner | `Bemanning_Behov_24 måneder – Kopi.xlsx` | Operational evidence; not an application contract | Existing continuous workspace, demand, allocation and capacity evidence |
| KPI workbook | `Kpier.xlsx` | Supporting source evidence | KPI and conversion evidence |
| Visma template | `Nøkkeltall Visma (mal) 2.0 – Kopi.xlsx` | Supporting source evidence | Source-structure evidence |
| Visma export | `utskrift_visma_21.09.26.xlsx` | Supporting source evidence | VVS source evidence |
| Venyoo Location Format export | `location_format_from-2026-01-01_to-2026-12-31.xlsx` | Supporting source evidence | Persistent event, project, calendar and Location/Hall reference evidence |
| Test dataset | `dataset_test.xlsx` | Unclassified test evidence | Must not be treated as authoritative without explicit review |

Evidence may support an authoritative document but cannot silently redefine it.

---

# 6. Historical and Superseded Register

The following files remain unchanged historical records:

- `Resource Planning Application PRD v0.1.md` through `Resource Planning Application PRD v0.7.md`;
- `First-Plan Contract v0.1.md` and `First-Plan Contract v0.2.md`;
- `MVP Technical - Scheduling Design v0.1 - Scheduling Run.md` and `MVP Technical - Scheduling Design v0.2 - Scheduling Run.md`;
- `Automatic First-Plan Capability Gap Analysis v0.2.md`;
- `VVS 2026 First-Plan Validation Case v0.1.md`, retained as the validation case against First-Plan Contract v0.1.

Historical files are evidence of earlier decisions. They are not current authority and should not be rewritten to match later terminology.

---

# 7. Conflict Resolution

1. Identify whether the conflict concerns product/release scope, first-MVP implementation, booking-demand conversion, workspace interaction, Phase E domain meaning, scheduling technical behavior, or fixture expectations.
2. Apply the authority for that scope only; do not construct one global linear hierarchy.
3. The PRD wins on roadmap and release scope.
4. The First-Plan Contract wins on Phase E scheduling-domain meaning; the Scheduling Design may clarify but not change it.
5. The Workspace Design wins on workspace interaction and constrains scheduling integration.
6. The Acceptance Pack wins only for realization of approved first-MVP fixtures and expected results. It cannot expand upstream scope.
7. Validation cases and gap analyses report evidence or missing evidence. They never override normative documents.
8. Record unresolved conflicts instead of silently reconciling incompatible meanings.
9. The Booking Demand Conversion and Review Contract wins on Visma snapshot replacement, persistent Venyoo, mapping and KPI behavior, booking-line and phase semantics, possible-work inclusion, PH calculation status, per-dimension routing status, planner disposition, unresolved-work visibility and publication.

---

# 8. Terminology Disambiguation

| Term | Scoped meaning |
|---|---|
| Accepted Demand PH | Explicitly adopted, undated person-hour total at one Demand Scope |
| Daily Allocated PH | Canonical first-executable-MVP fact for person-hours manually placed on a date |
| Scheduled PH | Phase E scheduling output: person-hours placed by a scheduling run |
| Target Planning PH | Phase E planning amount derived before final scheduling adjustments, with its KPI provenance retained |
| Permanent Capacity PH | Pooled permanent crew count times hours per workday on a generated or manually overridden workday; zero otherwise |
| Permanent Capacity Delta PH | Permanent Capacity PH minus complete Total Daily Allocated PH for one date |
| Additional PH Required | Magnitude of negative Permanent Capacity Delta; a visible resolution warning, not skill shortage or scheduler residual need |
| Residual Additional Resource Need | Phase E demand unsupported only after valid redistribution and worker-feasibility evaluation |
| Historical fixture capacity | Superseded test or workbook evidence; it does not populate the operational pooled permanent-capacity calendar |
| Scheduling worker-feasible capacity | Phase E capacity derived from worker availability, eligibility and absence without producing named assignments |
| Authoritative manual allocation | Planner-entered Daily Allocated PH that is authoritative in the first executable MVP |
| Generated proposal | Phase E scheduling output offered for review; not first-executable-MVP authoritative allocation |
| Booking Snapshot | One complete current Visma export whose coverage is exactly the unique source Project IDs present in that export |
| Project Occurrence ID | Complete five-digit Visma `Prosjekt` value in `[YY][PPP]` form; identifies one annual occurrence and is the demand-replacement boundary |
| Project Series ID | Final three digits `PPP` of a Project Occurrence ID, preserving leading zeroes; relates recurring projects across years without merging them |
| Demand Candidate | Current or retained historical Visma demand available for one target occurrence, Work Type and Phase, visibly labelled with its source occurrence and year |
| Historical Demand Basis | A later explicit selection of demand from another Project Occurrence in the same Project Series, independently by target occurrence, Work Type and Phase; never an automatic import substitution |
| Demand Basis Suggestion | Review-only current-year or most-recent-historical proposal used only when no basis is selected; never active before approval |
| Phase Readiness Warning | Consolidated project-phase warning raised seven calendar days before a Venyoo Assembly or Dismantling start when historical demand remains selected |
| No Demand Recorded | Review-required Venyoo planning entry for which no current or historical demand candidate was found; not proof of zero work |
| No Demand to Plan | Audited planner confirmation that may hide an occurrence from active work-demand planning while preserving its Venyoo calendar entry and history; later discovered Visma demand reopens review |
| Booking Line | One row of source demand evidence and the parent of separate assembly and dismantling phase work items |
| Work Type | Stable application-owned work classification with one editable human-readable label, currently evidenced by `forenklet type` |
| Work Type Amount | Derived operational work quantity and unit produced from booking-line evidence before any KPI converts it to PH |
| KPI Mapping | Versioned association from stable Work Type identity, unit and phase to one compatible productivity rate and approved Nøkkelområde route |
| Shared KPI definition | Deprecated duplicate UI term when it repeats the Work Type label; not a separate planner-managed label or classification |
| Competence/Skill Demand PH | Calculated phase PH grouped under one flat first-MVP Nøkkelområde; worker skills and levels are later concepts |
| Possible Work | Every retained booking line and applicable phase, visible by default unless an approved rule marks it Not applicable or the planner explicitly excludes it |
| PH Calculation Status | System-derived statement that phase PH is Calculated, Unresolved or Not applicable; it does not include canonical routing |
| Routing Status | Independent status for Event/Project, Location/Hall, Organization and Nøkkelområde/competence: Resolved, Review required or Explicit placeholder |
| Planner Disposition | Explicit planner decision: Undecided, Publish, Flag for review or Exclude |
| Flagged work | Visible published possible work with an open Issue; it retains exact calculated PH, or uses an explicit `0 PH` placeholder only when PH itself is unknown |
| Venyoo Location Dataset | Persistent accepted `location_format` calendar and project/location reference, retained until a subsequent Venyoo dataset is accepted |
| Location/Hall Mapping | Versioned mapping from a booking-line Location/Hall value and project context to a canonical project location |
| Undetermined location | Explicit canonical publishable location selected by the planner; not an unresolved or automatic fallback value |
| Explicit routing placeholders | Planner-selected canonical Event/Project `Undetermined`, Location `Undetermined`, Organization `Undetermined`, or competence `Unresolved`; publishable with known PH through Flag for review and never selected automatically |
| Organization | Canonical planning grouping resolved through source-specific bindings; operational Visma uses `Avdeling`, while legacy `Fakturamottaker` remains separate evidence |
| Work-Demand Phase | `Assembly` or `Dismantling`; owns booking-derived phase rate and PH |
| Venyoo Venue Phase | `Assembly`, `Moving in`, `Event`, `Moving out` or `Dismantling`; dated calendar context, not booking demand |
| Project/Location Calendar | Upper pane of the primary planning workspace, showing projects or events, Locations/Halls, occupancy and phases on the shared date axis |
| Resource Allocation Matrix | Lower pane of the primary planning workspace, showing demand and authoritative editable daily allocations on the shared date axis |

---

# 9. Versioning and Supersession

- Create a new version when scope, domain meaning, acceptance requirements, evidence coverage or expected results change materially.
- Metadata, spelling and reference-only corrections may remain within the current version when repository convention and review history permit.
- Never rewrite historical versions to adopt later terminology.
- A new current version supersedes the prior version only for its declared document family and scope.
- Cross-document references should use the exact current document title and version; filenames may retain legacy wording for repository stability.
- A validation revision must state the contract version it evaluates and must not imply unsupported coverage.

---

# 10. Decision and Evidence Register

## 10.1 Closed First-MVP Booking-Demand Decisions

Booking Demand Conversion and Review Contract v0.1 fixes possible-work retention, separate PH/routing/disposition states, persistent reusable mappings and datasets, exact five-digit Visma Project-Occurrence replacement coverage, derived three-digit Project Series identity, authoritative signed `Totalt antall` aggregation, Venyoo's ledger role, operational `Avdeling` Organization routing, explicit placeholder routes, one Work Type label, flat Nøkkelområde demand grouping and the separate work-demand and venue-phase vocabularies. Historical demand from another occurrence in the same series is a later explicit planner choice made independently per target occurrence, Work Type and Phase; it is never substituted automatically or double counted with current demand. Candidate comparison, basis selection, readiness decisions and Demand Adjustments belong to a future dedicated Demand Management page, while the first-MVP Planning Workspace consumes approved demand read-only. The PRD, Architecture and Workspace documents additionally fix pooled permanent capacity at 17 crew × 7.5 hours per generated or overridden workday. These are accepted decisions, not unresolved questions.

## 10.2 Open First-MVP Operational Inputs

No unresolved operational input currently blocks the documented first executable MVP. Source workbooks do not declare format versions. The application detects compatible structures and records its own internal profile version; column reordering and irrelevant extra columns remain compatible, while changes to application-used fields or structures require a new internal profile version.

The selective rebuild is complete. `Selective Rebuild Final Validation v0.1.md` records the evidence-based release-candidate decision without becoming a new source of product or domain authority.

## 10.3 Deferred Booking-Demand Enhancements

Deferred enhancements include a dedicated Demand Management page for candidate discovery, source-year comparison, basis selection, no-demand decisions, phase-readiness review and controlled Demand Adjustments. Other deferred enhancements are manual PH entry for unknown-PH work, event-specific mapping or KPI overrides, a future authoritative Visma line identity, effective dating beyond explicit version selection, API-based source replacement, and skill-aware capacity including absence, overlapping competences, hired help and overtime.

## 10.4 Optional Legacy Compatibility Evidence

The legacy planner workbook still requires evidence for its source keys, accepted-demand rows, allocation rows, FTE/date-cell semantics, `Fakturamottaker` meaning, location aliases, sanitization and formula handling. Those questions affect only an optional legacy compatibility fixture; they do not block the authoritative raw Visma and Venyoo workflow.

## 10.5 Phase E Evidence Gaps

Current Phase E evidence gaps include worker eligibility and absence fixtures, occupancy classification, competing-event allocation, generation-order independence, Planning Locks, affected-horizon recalculation, dynamic and downstream scarcity behavior, split-day worker-hour conservation, progressive KPI/PH release, redistribution before residual need, output decomposition, lock-preserving rebalancing, and partial-plan explanations.

---

# 11. Change-Impact Guide

| Proposed change | Documents to review |
|---|---|
| Product outcome, roadmap phase or release boundary | PRD, then both affected branches and this map |
| First-MVP implementation boundary or technical criterion | Architecture, Acceptance Pack, Workspace where interaction is affected, and this map |
| Workspace behavior or scheduling integration | Workspace, Architecture, Acceptance Pack, Scheduling Design, and this map |
| Phase E scheduling-domain meaning | First-Plan Contract, Scheduling Design, VVS case, Gap Analysis, PRD where roadmap language is affected, and this map |
| Scheduling algorithm or technical behavior | Scheduling Design, VVS case, Contract for semantic compatibility, and this map |
| First-MVP fixture or expected result | Acceptance Pack and affected upstream first-MVP authority; scheduling documents only if shared facts change |
| Visma or Venyoo coverage, Organization binding, phase vocabulary, Location/Hall mapping, product mapping, KPI conversion, unresolved review, demand publication or replacement | Booking Demand Conversion and Review Contract, PRD for scope compatibility, Workspace where presentation or allocation changes, Acceptance Pack, and this map |
| VVS evidence or coverage | VVS case, Scheduling Design references, Gap Analysis disposition, and this map |
| Document version or status | All current cross-references and this map |

---

**End of Documentation Map v0.1**

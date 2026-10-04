# Automatic First-Plan Capability Gap Analysis

**Document:** Capability Gap Analysis  
**Version:** 0.3  
**Status:** Supporting Phase E Evidence and Gap Analysis - Not First-Executable-MVP Authority  
**Date:** 2026-09-27  
**Related PRD:** Resource Planning Application PRD v0.8  
**Documentation Map:** Documentation Map v0.1

**Revision note:** v0.3 recognizes the continuous, synchronized event-location and resource calendar as a capability to preserve. Gantt behavior enhances this workspace, and query-like grouping provides alternate projections of one canonical plan.

---

# 1. Purpose

This document compares the current validated planning capabilities with the target workflow for generating an automatic first resource plan.

It supports the target automatic first-plan workflow in roadmap Phase E. It is source and workflow evidence, not normative authority, and it does not define first-executable-MVP scope or acceptance.

The existing spreadsheets are treated as evidence of domain behavior, operational decisions and source-data limitations. Their formulas, helper columns and fixed storage layout are not implementation requirements. The continuous date-aligned interaction between venue occupancy and resource planning is a required workflow capability.

The target is:

	Visma Import
	     ↓
	Canonical Event and Booking Data
	     ↓
	Operational Work and Person-Hours
	     ↓
	Venue and Planning Constraints
	     ↓
	Planner-Supplied Dependencies
	     ↓
	Automatic First Plan
	     ↓
	Continuous Planning Workspace
	     ↓
	Warnings, Review and Manual Override

The first plan is a competence-level daily allocation. Assignment of named personnel is a later product layer.

---

# 2. Evidence Reviewed

The analysis is grounded in:

- Resource Planning Application PRD v0.8;
- the current Visma VVS 2026 export;
- the KPI workbook and Conversion Profile;
- `Bemanning_Behov_24 måneder – Kopi.xlsx`;
- workbook tables, named ranges and formulas in the current 24-month planner;
- `Tabell_oppgaver!A1:AA5668` as the legacy 24-month planner's mixed demand ledger and conversion evidence, not the application's operational publication source;
- `tabell_venyou!A1:T862` as the legacy planner's venue and event-phase evidence, superseded for application operation by the accepted persistent Venyoo Location Format dataset;
- `Kalender!A2:ABR89` as the current continuous event-location, resource-allocation and capacity workspace;
- `Kalender!A67:ABR89` as the VVS 2026 allocation table;
- `Sum oppgaver!A1:AI55`, `status_bemanning_uke!A1:DD18` and `Timebudsjett!A1:G384` as planning summary and reporting evidence.

---

# 3. Executive Finding

The current workflow proves that the application can be built around a coherent chain from imported booking data to competence-level resource planning.

The strongest validated foundations are:

- annual Event ID as canonical identity;
- derived cross-year Event Series identity;
- source alias resolution;
- versioned conversion from booking quantities to person-hours;
- phase-specific mounting and dismantling demand;
- venue dates by location and event phase;
- person-hours as canonical demand and FTE-days as allocation;
- daily capacity comparison;
- explicit use of current, planned and historical demand bases;
- manual planner adjustments where the model is incomplete.

The direct workbook review also adds four important nuances:

- the planner keeps known demand visible even when no daily allocation has been entered;
- some rows represent manual demand additions, not merely schedule overrides;
- planning windows may begin before venue assembly and dismantling work may occur during move-out, so venue phases require Work Type rules rather than direct one-to-one mapping;
- daily capacity review compares the planned allocation against staffing capacity and exposes both surplus and shortage days.

The workspace review adds a fifth conclusion: the direct visual alignment of venue phases, overlapping events and resource allocations is not merely spreadsheet formatting. It removes manual date comparison from the planner's core reasoning and must remain a product-level invariant.

The largest remaining gap is not spreadsheet import. It is the planning-policy layer needed to turn calculated demand and venue dates into a credible schedule.

The principal first-plan blockers are:

1. work-specific planning-window rules;
2. structured dependencies;
3. crew-size and parallelism rules;
4. demand-basis precedence and approval;
5. canonical location mapping;
6. competence-level capacity rules;
7. scheduling objectives and trade-offs;
8. a controlled distinction between demand adjustments and schedule overrides.

---

# 4. Capability Status

The following status terms are used:

- **Validated:** demonstrated sufficiently for first implementation.
- **Partial:** demonstrated, but material rules or coverage remain unresolved.
- **Missing:** not represented in a reusable form today.
- **Decision Required:** several valid behaviors exist and a product rule must be chosen.

| ID | Capability | Current evidence | Target capability | Status | First-plan impact |
|---|---|---|---|---|---|
| C01 | Event occurrence identity | Source Event ID is unique per year | Use Event ID as the canonical join key | Validated | Required foundation |
| C02 | Cross-year event identity | `PROSJEKT_ID` derives the recurring series suffix | Store a derived Event Series ID separately from Event ID | Validated | Enables historical reference |
| C03 | Event alias resolution | `Prosjekt` maps inconsistent source names | Event Identity Registry with review for unmatched aliases | Partial | Required for sources without Event ID |
| C04 | Visma ingestion | Current Excel export profile is understood | Excel adapter now, Visma API adapter later, same canonical model | Partial | Required foundation |
| C05 | Booking-to-work conversion | Conversion Profile selects operational unit and KPI | Versioned, testable mapping and quantity derivation | Partial | Required foundation |
| C06 | Demand-quality handling | Unmatched, zero and negative source rows are identifiable | Preserve known demand and expose unresolved demand without silent loss | Partial | Warning-capable blocker |
| C07 | Phase-specific person-hours | Mounting and dismantling hours are calculated | Canonical competence demand by event and phase | Validated | Required foundation |
| C08 | Demand Basis | Calendar selects current, planned or historical demand per area | Explicit basis with precedence, approval and provenance | Decision Required | Hard blocker |
| C09 | Historical reference | Reference year plus Event Series derives `PROSJEKT_DATA` | Explicit target and Reference Event IDs | Validated | Required where current demand is incomplete |
| C10 | Demand Adjustment | Design, Service and planned FOGA show direct planner knowledge | Separate, traceable adjustment to calculated demand | Partial | Hard blocker for exceptions |
| C11 | Venue phase dates | Assembly, move-in, event, move-out and dismantling are available by location | Canonical phase windows linked to Event ID | Partial | Required foundation |
| C12 | Location identity | Booking and venue sources use different location labels | Canonical location registry and source aliases | Missing | Hard blocker for location-aware planning |
| C13 | Work planning windows | Planner manually sets starts and finishes; some work starts before assembly and some dismantling occurs during move-out | Derive earliest start, deadline and allowed dates by Work Type and phase | Missing | Hard blocker |
| C14 | Dependencies | Sequence is held in planner knowledge | Structured dependency input with progressive overlap where needed | Missing | Hard blocker |
| C15 | Crew and parallelism | Current schedule implies practical crew choices | Minimum crew, useful maximum crew, divisibility and concurrent fronts | Missing | Hard blocker |
| C16 | Working-time calendar | Weekends, holidays and 7.5-hour normal day are represented | Configurable working days, shifts and event exceptions | Partial | Required foundation |
| C17 | Competence capacity | Calendar compares daily FTE demand and capacity | Capacity by competence, date and workforce type | Partial | Hard blocker |
| C18 | Multi-competence capacity | PRD identifies shared personnel pools | Prevent the same flexible capacity being counted twice | Missing | Can be phased after single-competence plan |
| C19 | Automatic allocation | Current daily allocations are manual | Generate daily competence allocation automatically | Missing | Core product gap |
| C20 | Scheduling objective | Current planner applies experience implicitly | Define priorities and trade-offs for feasible alternatives | Decision Required | Hard blocker |
| C21 | Shortage handling | Calendar exposes daily variance and rows with known demand but no allocation | Return unscheduled demand and explain the limiting constraint | Partial | Required for safe output |
| C22 | Schedule Override | Daily cells can be changed manually; current rows blur schedule edits and manual demand additions | Preserve generated baseline, override and reason separately | Partial | Required for review workflow |
| C23 | Explainability | Source basis and calculation labels exist | Explain demand, eligibility, placement, warnings and shortages | Partial | Required for trust |
| C24 | Recalculation and versioning | Spreadsheet values can be refreshed or overwritten | Reproducible plan runs with input and rule versions | Missing | Required for auditability |
| C25 | Named-person assignment | Outside the current first-plan calculation | Assign actual people after competence plan approval | Deferred | Not a first-plan blocker |

---

# 5. Required First-Plan Inputs

A credible automatic first plan requires the following minimum inputs.

## 5.1 Event and Source Identity

- target Event ID;
- Event Series ID;
- source-specific event aliases where needed;
- optional Reference Event ID;
- source profile and import version.

## 5.2 Demand

- Work Requirements;
- derived operational quantity and unit;
- competence;
- mounting or dismantling phase;
- calculated person-hours;
- selected Demand Basis;
- whether the row is calculated demand, manual demand addition, unallocated known demand or schedule allocation;
- unresolved-demand status;
- approved Demand Adjustments.

## 5.3 Time and Location

- canonical event locations;
- venue phase windows for each location;
- Work Type rules connecting work to venue phases;
- working-day and shift calendar;
- deadlines and no-work periods.

## 5.4 Operational Rules

- planner-supplied dependencies;
- progressive-overlap rule where a dependency need not complete fully;
- minimum and useful maximum crew;
- whether work can split across days;
- whether work can run in parallel across locations;
- preferred sequence and continuity rules.

## 5.5 Capacity

- available FTE or person-hours by date and competence;
- hired and overtime capacity where approved;
- unavailable capacity;
- rules for shared multi-competence personnel where included.

---

# 6. Required First-Plan Outputs

The planning engine should produce:

- daily FTE or person-hours by event, competence and phase;
- planned start and finish for each allocation row;
- source demand and selected Demand Basis;
- applied planning windows and dependencies;
- scheduled and unscheduled person-hours;
- daily competence-capacity variance;
- unallocated known demand where the planner has accepted demand but not scheduled it;
- manual demand additions separately from schedule overrides;
- warnings for unresolved or proxy data;
- explanations for material placement decisions;
- a preserved generated baseline for later overrides.

The engine must never make unresolved demand disappear merely to produce a feasible-looking schedule. A first-MVP `0 PH` unknown-PH placeholder remains possible work requiring review; it is not evidence that demand is zero. Calculated PH routed through an explicit placeholder remains known demand.

---

# 7. Blocking Domain Decisions

## 7.1 Planning Windows

Venue dates do not by themselves say when each Work Type may occur.

The VVS 2026 rows demonstrate this directly. Some mounting work is planned before the venue assembly period begins, while several dismantling allocations fall in the move-out period rather than the later dismantling period. These are not necessarily errors. They show that the product needs explicit Work Type rules and approved lead-time behavior.

The product needs a rule such as:

	Work Type + Phase + Location Context
	                 ↓
	Allowed Venue Phases and Date Window

Examples requiring confirmation include:

- which work may begin during assembly;
- which work must finish before move-in;
- which work may continue during move-in;
- which dismantling work begins during move-out;
- which work must wait until visitors or exhibitors have left.

The rule must also distinguish pre-event preparation work from location-bound venue work. A date may be valid for preparation while still invalid for work that physically consumes a venue location.

## 7.2 Dependencies

Dependencies are expected to be the principal recurring manual planning input.

The minimum dependency model should identify:

- predecessor and successor;
- applicable event and optional location;
- relationship type;
- lag where applicable;
- whether overlap is allowed;
- the predecessor progress threshold that releases successor work;
- whether the rule is hard or preferred.

## 7.3 Crew and Parallelism

Person-hours alone cannot determine a realistic duration.

The engine needs to know whether a Work Requirement:

- requires a minimum crew;
- has a useful maximum crew;
- can split between locations;
- can run on several fronts simultaneously;
- loses productivity when fragmented;
- must maintain continuity once started.

## 7.4 Demand-Basis Precedence

The current planner deliberately mixes current Visma demand, planned demand, historical hours and other estimates.

In the VVS 2026 allocation table, most rows use current `visma per reg. dato`, FOGA uses `Planlagt`, Ekstra uses historical `Historikk Timer` from 2024, and Gangtepper uses historical `visma_totaloversikt` from 2024. Design and Service have zero calculated hours but non-zero planned FTE, which means the current workbook is also carrying manual demand additions in the allocation layer.

The product must define:

- the default basis when several are available;
- when historical demand may replace or supplement current demand;
- who approves a manual basis change;
- when newer imported data supersedes a reference;
- how the planner sees differences between bases;
- whether basis selection applies by event, competence, phase, location or Work Type.

The product must separately define how manual demand additions are approved and how they differ from changing the daily allocation of already-calculated demand.

## 7.5 Scheduling Objective

When several valid schedules exist, the engine needs an ordered objective.

Candidate objectives include:

- meet all hard deadlines;
- avoid location conflicts;
- avoid competence-capacity shortages;
- minimize overtime and hired capacity;
- minimize fragmented work;
- maintain preferred sequence;
- avoid unnecessary idle days;
- retain contingency before deadlines;
- minimize changes after a plan has been reviewed.

The objective order must be explicit enough that the planner can understand why one feasible schedule was chosen over another.

---

# 8. Data Gaps Versus Planning Gaps

The application should distinguish these categories.

## 8.1 Data Gaps

Examples:

- unmatched product type `0`;
- unresolved zero quantity;
- ambiguous negative correction;
- missing customer anchor;
- unrecognized event or location alias;
- missing KPI;
- missing venue dates.

Data gaps affect whether demand or constraints are complete.

## 8.2 Planning Gaps

Examples:

- dependency not supplied;
- crew limit unknown;
- no rule connecting a Work Type to venue phases;
- demand basis not selected;
- scheduling objective conflict;
- capacity source not approved;
- known demand accepted but not allocated to dates.

Planning gaps affect whether known demand can be allocated credibly.

Both should be visible, but they require different ownership and resolution workflows.

---

# 9. Spreadsheet Behavior to Preserve

The application should preserve:

- traceability from source to calculated work;
- target and historical Reference Event distinction;
- competence and phase demand;
- demand-basis selection;
- visibility of accepted but unallocated demand;
- venue phase visibility;
- locations as visible rows in the event-location calendar;
- one continuous date axis shared by venue and resource layers;
- synchronized horizontal navigation and date scale;
- expandable and collapsible event and work hierarchies;
- optional dependency and summary-span overlays over the daily grid;
- query-like filtering and grouping over one canonical plan, including Event -> Competence and Event -> Avdeling -> Competence;
- pre-event and move-out work where Work Type rules allow it;
- daily allocation and capacity comparison;
- daily surplus and shortage reporting;
- warnings without unnecessary blocking;
- manual planner control;
- cross-event resource visibility.

---

# 10. Spreadsheet Mechanisms to Retire

The application should not reproduce:

- event-name joins as identity logic;
- helper columns used only to emulate relationships;
- a fixed two-year grid as the data model, while still preserving a flexible continuous calendar as the planning interaction;
- formulas copied across hundreds of date columns;
- flattened snapshots as the authoritative venue model;
- silent overwriting of generated or imported values;
- using daily allocation cells as the only place to represent manual demand changes;
- manual reconstruction of every schedule from blank daily cells;
- duplicated dropdown lists as reference-data governance.

These are consequences of the current tool, not desired product behavior.

---

# 11. Minimum Acceptance Criteria

An initial automatic first-plan capability is acceptable when it can:

1. import a supported Visma workbook without relying on column order;
2. identify the target Event ID and resolve known aliases;
3. calculate traceable person-hours for all matched demand;
4. retain unresolved demand and warnings without treating an unknown-PH placeholder as zero demand or zeroing calculated PH because routing is unresolved;
5. select or request the Demand Basis for each required planning scope;
6. retrieve an approved historical Reference Event where selected;
7. capture approved manual demand additions separately from schedule overrides;
8. resolve booking and venue locations to canonical locations;
9. derive allowed planning windows from venue phases, pre-event preparation rules and Work Type rules;
10. accept planner-supplied dependencies;
11. apply working-time, crew and capacity constraints;
12. generate a daily competence-level allocation;
13. expose unscheduled demand and the limiting constraint;
14. compare daily scheduled demand with available capacity and report surplus or shortage;
15. preserve the generated baseline when the planner overrides it;
16. recalculate predictably when source data, rules or overrides change;
17. explain the source, rule version and major constraints behind the result.
18. render venue occupancy and resource planning on one synchronized date axis;
19. expand, collapse, filter and regroup planning rows without changing the underlying plan;
20. preserve daily allocation cells as authoritative when Gantt spans or grouped totals are displayed.

The first plan does not need to assign named people.

---

# 12. Historical Recommended Work Sequence and Current Disposition

This sequence records how the Phase E analysis was originally expected to progress. Current disposition is:

| Work item | Current disposition |
|---|---|
| First-Plan Contract | Completed as First-Plan Contract v0.3; further changes require domain review |
| Scheduling Technical Design | Completed as Scheduling Technical Design v0.3 - Scheduling Run |
| Planning-rule catalogue and demand governance | Partially represented; unresolved evidence remains explicit |
| Canonical location and continuous workspace foundations | Defined for the first executable MVP; broader Phase E rules remain subject to validation |
| Deterministic first-plan prototype | Not started; must not be treated as validated before required VVS evidence exists |
| Cross-event capacity, override and replanning behavior | Not evaluated; covered by missing VVS scheduling-evaluation scenarios |

## Step 1 - First-Plan Contract

Define the exact input and output records for one planning run, including Event ID, demand scope, venue windows, dependencies, capacity and warnings.

## Step 2 - Planning-Rule Catalogue

Capture Work Type planning windows, dependency patterns, crew rules and parallelism limits with experienced planners.

## Step 3 - Demand Governance

Define demand-basis precedence, historical reference approval, Demand Adjustments and correction semantics.

This step should explicitly model manual demand additions, accepted-but-unallocated demand and daily schedule overrides as separate states.

## Step 4 - Canonical Location Model

Map booking, venue and planner location names to stable location identities and availability periods.

## Step 4A - Continuous Workspace Projection

Render event-location occupancy, resource demand, allocation and capacity against one shared date axis. Support governed query-like grouping and hierarchy without persisting a separate plan per view.

## Step 5 - Deterministic First-Plan Prototype

Generate a rule-based plan for one event before introducing advanced optimization. Return unscheduled demand rather than weakening hard constraints.

## Step 6 - Cross-Event Capacity

Plan several overlapping events against shared competence capacity and verify shortage reporting.

## Step 7 - Override and Replanning

Preserve the generated baseline, apply manual changes and recalculate downstream effects without losing provenance.

---

# 13. Current Evidence Need

The next Phase E analysis step is to complete VVS 2026 First-Plan Validation Case v0.2 evidence for the missing scheduling-evaluation scenarios. Required evidence includes workforce eligibility and absence fixtures, occupancy classification, competing-event allocation, generation-order independence, Planning Locks, affected-horizon recalculation, dynamic and downstream scarcity behavior, split-day allocation with overlapping eligibility, worker-hour conservation, progressive KPI/PH-based work-front release, redistribution before residual need, permanently-coverable plus residual decomposition, lock-preserving rebalancing, and partial-plan status and explanations.

Implementation evaluation must not be presented as validated before the required evidence or explicitly approved synthetic or anonymized fixtures are available.

---

**End of Automatic First-Plan Capability Gap Analysis v0.3**

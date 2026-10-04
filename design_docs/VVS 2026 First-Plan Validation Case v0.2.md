# VVS 2026 First-Plan Validation Case

**Document:** Scheduling-Evaluation Validation Case  
**Version:** 0.2  
**Status:** Incomplete - Workforce Fixture and Occupancy Classification Evidence Missing  
**Date:** 2026-09-27  
**Authoritative Domain Contract:** First-Plan Contract v0.3  
**Related Scheduling Design:** Scheduling Technical Design v0.3 - Scheduling Run  
**Documentation Map:** Documentation Map v0.1

**Revision note:** v0.2 aligns the VVS evidence case with First-Plan Contract v0.3. It retains verified v0.1 source and domain evidence, removes superseded supplier, overtime and competence-preference requirements, updates output terminology, treats venue overlap as unclassified until the required rule inputs exist, and records explicit coverage against all 41 scheduling-evaluation requirements.

---

# 1. Purpose, Scope and Evidence Rule

This document evaluates whether available VVS 2026 evidence supports the Phase E scheduling-domain meaning defined by First-Plan Contract v0.3.

It is a scheduling-evaluation case, not first-executable-MVP acceptance and not normative authority. The PRD determines roadmap and release scope. The First-Plan Contract defines Phase E scheduling-domain meaning. The Scheduling Technical Design elaborates that contract. This case records evidence, coverage and unresolved inputs only.

Version 0.1 remains historical evidence against First-Plan Contract v0.1. This revision does not claim that a scheduling run has occurred. A requirement is marked `Supported by evidence` only where a section below contains direct source or reviewed domain evidence. Contract text alone is never evidence.

---

# 2. Event Identity Evidence

| Field | Value | Evidence classification |
|---|---|---|
| Target Event ID | `26970` | Derived from reviewed source |
| Event Series ID | `970` | Derived from reviewed source identity rule |
| Historical Reference Event ID | `24970` | Derived for the selected historical reference |
| Booking/planning name | VVS 2026 | Source alias |
| Venue name | VVS DAGENE 2026 | Source alias |
| Canonical identity | Event ID `26970` | Reviewed reference-data mapping |

The name difference is a source-data inconsistency resolved by the Event Identity Registry. It is not a workbook error.

---

# 3. Source Import Evidence

| Measure | Value | Evidence classification |
|---|---:|---|
| Booking rows | 784 | Derived |
| Source product types | 31 | Derived |
| Matched rows | 708 | Derived |
| Row mapping coverage | 90.31% | Derived |
| Unmatched rows | 76 | Derived issue |
| Unmatched product type | `0` | Derived issue |
| Zero-quantity rows | 8 | Derived issue |
| Negative-quantity rows | 16 | Derived issue |

All 76 unmatched rows use product type `0` and contain several meanings. They must not receive one generic mapping. These findings support source-quality and issue-retention behavior, but no reordered-header import test or complete source-line provenance audit has been executed.

---

# 4. Venue and Phase Evidence

Canonical VVS venue locations are `C` and `D1`.

| Phase | Start | End | Evidence classification |
|---|---|---|---|
| Assembly | 2026-09-28 | 2026-10-07 | Derived |
| Moving in | 2026-10-08 | 2026-10-13 | Derived |
| Event | 2026-10-14 | 2026-10-16 | Derived |
| Moving out | 2026-10-17 | 2026-10-19 | Derived |
| Dismantling | 2026-10-20 | 2026-10-21 | Derived |

The phase dates are supported. Complete candidate planning windows are not: approved Work Type rules for pre-assembly preparation, mounting during moving in, and dismantling during moving out have not been supplied as VVS evidence.

---

# 5. Demand Candidate Evidence

## 5.1 Alternative Calculated Candidate

| Candidate | Person-hours | Treatment |
|---|---:|---|
| Current source calculation | 942.285 | Preserved alternative candidate and provenance value |

## 5.2 Selected Planning Baseline

| Measure | Person-hours |
|---|---:|
| Active internal planning demand | **891.486** |
| Alternative calculated candidate | 942.285 |
| Selected-versus-alternative variance | **-50.799** |

The active total is a reviewed expected result of current source data, Conversion Profiles and selected planning-basis rules. It must not be hard-coded as a VVS-specific constant. The values support candidate and variance evidence; application behavior for approving a basis switch has not been evaluated.

---

# 6. Selected Internal Demand Evidence

Rounded values are displayed to three decimals. Totals are calculated from unrounded source values.

| Competence | Mounting PH | Dismantling PH | Total PH | Active basis |
|---|---:|---:|---:|---|
| Banner | 95.574 | 41.813 | 137.386 | Current selected Visma conversion |
| Ekstra | 77.917 | 16.500 | 94.417 | Historical Extra plus 12-hour fallback |
| Engangstepper | 33.270 | 0.000 | 33.270 | Current selected Visma conversion |
| FOGA | 137.152 | 83.312 | 220.464 | Manually planned candidate |
| Innredning | 13.949 | 10.134 | 24.083 | Current selected Visma conversion |
| Møbler | 51.722 | 36.097 | 87.819 | Current selected Visma conversion |
| Print | 51.868 | 8.000 | 59.868 | Current conversion plus Skilting and Profilering mappings |
| Snekker | 13.326 | 11.639 | 24.965 | Current selected Visma conversion |
| Teppefliser | 125.942 | 83.271 | 209.214 | Current selected Visma conversion |
| **Total** | **600.719** | **290.767** | **891.486** | Selected planning baseline |

## 6.1 Competence Decisions

- `Arbeidstimer` cannot be mapped reliably from source data.
- Its 12 hours default to Ekstra with a warning and require planner review.
- `Skilting` maps to Print for this scheduling evaluation.
- `Profilering` maps to Print for this scheduling evaluation.
- Source Work Type and provenance remain preserved.

These are demand-mapping decisions. They do not establish worker competence preference or eligibility.

---

# 7. Fulfillment Evidence

| Demand | Person-hours | Fulfillment | Internal-capacity effect |
|---|---:|---|---|
| Gangtepper | 137.929 | Externally fulfilled | None |

Gangtepper remains visible in total event demand but contributes no internal competence demand. This distinction is general and must not be implemented as a Gangtepper-specific exception.

---

# 8. Location Evidence

## 8.1 Confirmed Aliases

| Booking label | Canonical location | Treatment |
|---|---|---|
| Hall C | C | Location-specific planning |
| sceneomr hall C | C | Preserve source detail; plan under C |
| Pergola hall C | C | Preserve source detail; plan under C |
| Hall D | D1 | Location-specific planning |
| cafe hall D | D1 | Preserve source detail; plan under D1 |

## 8.2 Dataset Errors and Event-Level Fallback

`Hall C og D`, `Møterom hall E1`, `Gang mot møterom E1`, `Hall F`, `Inng øst`, `Gulvfolie` and blank labels remain event-level demand with location issues. They do not create canonical locations automatically.

## 8.3 Internal Demand by Planning Scope

| Planning scope | Person-hours | Share |
|---|---:|---:|
| C | 337.772 | 37.9% |
| D1 | 399.815 | 44.8% |
| Event-level with location issues | 153.899 | 17.3% |
| **Total** | **891.486** | **100.0%** |

---

# 9. Dependency Evidence

The reviewed default stage chain applies independently to C and D1:

1. Flooring: Engangstepper and Teppefliser.
2. Booth build: FOGA.
3. Finishing and fit-out: Banner, Print and Snekker.
4. Furniture: Møbler and Innredning.

Dismantling uses the reverse order. Planner evidence says the relationships are progressive rather than whole-demand finish-to-start. No generated schedule demonstrates same-day release, KPI/PH-based work-front release, preferred-dependency relaxation or planner-edit behavior.

---

# 10. Provisional Useful-Crew Evidence

| Competence | Maximum simultaneous FTE per location | Classification |
|---|---:|---|
| Ekstra | 4.0 | Provisional reference data |
| Engangstepper | 2.0 | Provisional reference data |
| Teppefliser | 8.0 | Provisional reference data |
| FOGA | 4.0 | Provisional reference data |
| Banner | 4.0 | Provisional reference data |
| Print | 2.0 | Provisional reference data |
| Snekker | 1.0 | Provisional reference data |
| Møbler | 4.8 | Provisional reference data |
| Innredning | 2.5 | Provisional reference data |

The values were inferred from observed VVS allocations and approved only as provisional validation inputs. The default Minimum Useful Crew is one worker. The maximum is an efficiency ceiling, not capacity. No scheduling run has evaluated fractional Daily FTE Demand against these values and workforce availability together.

---

# 11. Workforce Evidence Gap

Confirmed policy evidence is limited to a 7.5-hour standard workday, weekday standard schedules, binary worker-to-competence eligibility, and the rule that one worker's available hours must not be double-counted across competencies.

The required permanent-worker table, binary worker-to-competence fixture and worker-specific absence fixture do not exist. The workbook's aggregate `Faste` value cannot substitute for worker-feasible capacity because it does not show whether the same workers are being counted in competing competence pools.

Primary-versus-secondary preference, supplier flags and overtime are not baseline inputs for First-Plan Contract v0.3 and are not required to continue this validation.

---

# 12. Venue-Overlap Evidence and Classification Gap

The venue source shows overlapping dated occupancy in C and D1:

- HYROX moving out on 2026-09-28 and dismantling through 2026-09-29 overlaps the start of VVS assembly.
- Oslo Motor Show assembly from 2026-10-13 through 2026-10-20 overlaps VVS moving in, Event, moving out and dismantling phases.

These overlaps are supported source evidence. They are not yet confirmed blocking conflicts under Contract v0.3. Classification requires canonical location scope, both events' phases, access requirements and available timestamps. Those inputs and an approved occupancy-rule outcome have not been supplied. Until classification, the dates remain visible possible-conflict context and cannot support a validated automatic allocation decision.

---

# 13. Required Scheduling Output Semantics

When sufficient evidence and fixtures exist, the VVS scheduling evaluation must report by event, date, location and competence:

| Output | Contract meaning | Current evidence state |
|---|---|---|
| Planned PH | Generated competence allocation on the date | No generated run |
| Daily FTE Demand | Planned PH divided by configured daily hours | Display rule known; no generated run |
| Permanently Coverable Demand | Planned demand supportable by feasible permanent capacity | Blocked by workforce fixture |
| Residual Additional Resource Need | Demand unsupported after valid redistribution | Not evaluated |
| Lock state | Whether recalculation may move the aggregate allocation | Not evaluated |
| Demand Basis and Issues | Selected basis, warnings, assumptions and conflicts | Source evidence exists; run explanation not evaluated |

The required identity is:

    Planned Demand
    = Permanently Coverable Demand
    + Residual Additional Resource Need

The identity and terminology are contract requirements, not evidence that the VVS case currently satisfies them.

---

# 14. Current Status and Issues

The VVS scheduling evaluation status is **Incomplete** because worker-feasible capacity cannot be derived and venue overlaps cannot yet be classified.

Known evidence-backed issues include the historical basis for Extra, manually planned FOGA candidate, candidate variance, `Arbeidstimer` fallback, external Gangtepper fulfillment, unmatched product type `0`, zero and negative source quantities, event-level location fallback, provisional useful-crew maxima, adjacent occupancy, missing timestamps and missing workforce fixtures.

Issues remain independent of primary plan status. No Ready, Ready with warnings or Understaffed result has been established.

---

# 15. Contract v0.3 Coverage Matrix

| Req. | Requirement summary | Coverage | Evidence or gap |
|---:|---|---|---|
| 1 | Import without column-order dependency | Partially supported | Section 3 confirms source import results; reordered-header behavior was not tested |
| 2 | Preserve every source line and provenance | Partially supported | Section 3 preserves counts and issue classes; a complete line-level provenance audit was not run |
| 3 | Identify Event ID and derive Event Series | Supported by evidence | Section 2 |
| 4 | Resolve aliases without name-only joins | Supported by evidence | Section 2 |
| 5 | Calculate traceable candidates by competence and phase | Supported by evidence | Sections 5 and 6 |
| 6 | Preserve unresolved quantities and mapping errors | Supported by evidence | Sections 3 and 6.1 |
| 7 | Use historical demand where current data is immature | Supported by evidence | Sections 2, 5 and 6 show the Extra historical basis |
| 8 | Show candidate variance and approve basis switching | Partially supported | Section 5 supports the variance; switching behavior is not evaluated |
| 9 | Distinguish event, internal and external demand | Supported by evidence | Sections 6 and 7 |
| 10 | Reconcile Work Types to planning competencies | Supported by evidence | Section 6.1 |
| 11 | Preserve fallback competence warnings | Supported by evidence | Sections 3 and 6.1 |
| 12 | Map booking locations to canonical locations | Supported by evidence | Section 8.1 |
| 13 | Retain unmapped demand at event level | Supported by evidence | Sections 8.2 and 8.3 |
| 14 | Derive windows from phases and Work Type rules | Partially supported | Section 4 supports phases; approved VVS Work Type rules are missing |
| 15 | Display overlaps and classify confirmed versus possible conflicts | Blocked by missing input | Section 12; occupancy-rule inputs and outcomes are missing |
| 16 | Use timestamps to resolve same-day conflict | Blocked by missing input | Section 12; timestamps are missing |
| 17 | Apply progressive assembly and reverse dismantling dependencies | Supported by evidence | Section 9 supports the reviewed domain sequence |
| 18 | Allow valid same-day predecessor/successor overlap | Partially supported | Section 9 supports progressive intent; no schedule demonstrates behavior |
| 19 | Use KPI/PH progress for work-front release | Not evaluated | Section 16, gap G7 |
| 20 | Accept planner dependency edits | Partially supported | Section 9 records the expected planner role; no interaction or run was evaluated |
| 21 | Separate fractional FTE, useful crew and availability | Partially supported | Section 10 supports provisional crew inputs; combined behavior is untested |
| 22 | Derive capacity without worker double counting | Blocked by missing input | Section 11 |
| 23 | Deduct worker-specific absence correctly | Blocked by missing input | Section 11 |
| 24 | Evaluate combined overlapping-event demand | Blocked by missing input | Sections 11 and 16, gap G1 |
| 25 | Keep capacity constraints active during generation | Blocked by missing input | Section 11 |
| 26 | Apply dynamic scarcity and downstream influence | Not evaluated | Section 16, gaps G3 and G4 |
| 27 | Support split-day allocation and worker-hour conservation | Blocked by missing input | Sections 11 and 16, gaps G5 and G6 |
| 28 | Generate aggregate plan without named-worker schedule | Not evaluated | No scheduling run exists |
| 29 | Keep generated allocations unlocked by default | Not evaluated | Section 16, gap G2 |
| 30 | Default manual overrides to locked and allow lock changes | Not evaluated | Section 16, gap G2 |
| 31 | Preserve locked aggregate allocations | Not evaluated | Section 16, gap G11 |
| 32 | Recalculate affected horizon across events | Not evaluated | Section 16, gap G2 |
| 33 | Prevent generation-order bias | Not evaluated | Section 16, gap G1 |
| 34 | Calculate residual need only after redistribution | Not evaluated | Section 16, gap G9 |
| 35 | Decompose planned demand into coverable plus residual | Not evaluated | Sections 13 and 16, gap G10 |
| 36 | Return Understaffed only with complete inputs | Blocked by missing input | Sections 11 and 14 |
| 37 | Return a credible partial plan | Not evaluated | Section 16, gap G12 |
| 38 | Return Incomplete when required inputs are missing | Not evaluated | Section 14 records the evidence-case status; no engine status behavior was run |
| 39 | Preserve generated baseline after edits | Not evaluated | No generated baseline exists |
| 40 | Assign one primary status and independent issues | Partially supported | Section 14 models the distinction; application behavior is untested |
| 41 | Explain basis, versions, warnings and overrides | Partially supported | Sections 3, 5, 6 and 14 retain evidence; run explanations are untested |

Coverage totals:

- Supported by evidence: 11;
- Partially supported: 9;
- Not evaluated: 13;
- Blocked by missing input: 8.

---

# 16. Missing Scheduling Evidence

| Gap | Missing evidence |
|---|---|
| G1 | Competing-event allocation and generation-order independence |
| G2 | Planning Locks and affected-horizon recalculation |
| G3 | Dynamic competence scarcity |
| G4 | Downstream scarcity influence on prerequisite work |
| G5 | Split-day allocation with overlapping worker eligibility |
| G6 | Worker-hour conservation across competing competencies |
| G7 | Progressive KPI/PH-based work-front release |
| G8 | Occupancy classification using the required rule inputs |
| G9 | Redistribution before Residual Additional Resource Need |
| G10 | Permanently Coverable Demand plus residual decomposition |
| G11 | Lock-preserving rebalancing |
| G12 | Credible partial-plan status and explanations |

Evidence completion also requires an approved synthetic or anonymized permanent-worker eligibility and absence fixture, confirmed or replaced useful-crew values, and the missing occupancy-classification inputs. These fixtures may support scheduling evaluation but must not be presented as operational workforce truth.

Until those inputs and scenarios are evaluated, no VVS automatic schedule or full Scheduling Technical Design validation should be presented as complete.

---

**End of VVS 2026 First-Plan Validation Case v0.2**

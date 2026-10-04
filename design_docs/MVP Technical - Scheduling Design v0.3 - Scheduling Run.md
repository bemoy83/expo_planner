# Scheduling Technical Design v0.3 — Scheduling Run

**Document:** Scheduling Technical Design  
**Version:** 0.3  
**Focus:** Scheduling Run  
**Status:** Optional Scheduling-Evaluation Baseline - Scope and Shared Data Contract Aligned  
**Date:** 2026-09-27  
**Authoritative Domain Contract:** First-Plan Contract v0.3  
**Workspace Contract:** First Executable MVP Technical / Continuous Planning Workspace v0.1  
**Validation Case:** VVS 2026 First-Plan Validation Case v0.2  
**Documentation Map:** Documentation Map v0.1

**Revision note:** v0.3 preserves the v0.2 scheduling semantics while aligning candidate dates and conflict handling with the continuous planning workspace. Work Type rules may create normal planning windows outside nominal phase boundaries, and venue occupancy is classified before it becomes a blocking conflict. The scope-alignment revision reclassifies this design as an optional scheduling-evaluation baseline built on first executable MVP foundations; its semantics and scenarios are not first executable MVP acceptance requirements. The data-contract alignment identifies the stable shared canonical interfaces and keeps scheduling-only records outside the first executable MVP contract.

---

# 1. Purpose and Authority

This document defines the scheduling problem and the required behavior of one Resource Calendar scheduling run. It translates First-Plan Contract v0.3 into a technical baseline without selecting an optimization library, solver, programming language or persistence technology.

The domain contract remains authoritative. This design may make technical behavior more precise but must not change domain meaning.

The PRD is authoritative for product outcomes, the roadmap and first executable MVP scope. The architecture decision is authoritative for first-executable-MVP implementation boundaries and technical constraints. The workspace design is authoritative for first-executable-MVP interaction behavior and constrains scheduling integration. First-Plan Contract v0.3 is authoritative for Phase E scheduling-domain meaning. This document provides the technical elaboration of that contract when scheduling is evaluated or implemented and must not expand first-executable-MVP acceptance.

The scheduling run is not part of first executable MVP acceptance. It is an optional evaluation track built on the first executable MVP foundations. Production automatic scheduling remains roadmap Phase E.

VVS 2026 First-Plan Validation Case v0.2 records evidence and coverage against the domain contract. Its unresolved workforce-fixture, occupancy-classification and behavioral coverage keeps the VVS scheduling evaluation incomplete; the validation case is evidence, not normative authority, and does not establish that this design has been fully validated.

The run consumes versioned snapshots that reference the stable Event Occurrence, Canonical Location, Planning Competence Area and Demand Scope identities established by the application data contract. It does not own source import, accepted-demand adoption, identity reconciliation or manual-allocation audit history.

When evaluated or implemented, the scheduling run is one service used by the continuous planning workspace. It produces proposed daily allocations, issues and explanations; it does not define a fixed row hierarchy, replace the event-location calendar or persist visual row positions.

The scheduling run produces a credible aggregate Resource Calendar. It does not produce a Personnel Plan, named-worker assignments, intra-day rosters, stand-level execution plans or proof of mathematical optimality.

PH remains the authoritative scheduling and capacity unit, while authoritative workload is the conserved delivery quantity when approved KPI compression changes the PH required to deliver it. One important modeling limit is made explicit in Section 7: a daily aggregate plan can test worker-hour and competence feasibility, but exact simultaneous crew timing ultimately requires a time-specific Personnel Plan.

---

# 2. Scheduling Run Outcome

A scheduling run transforms a versioned snapshot of demand, calendar state, workforce state and planning rules into a reproducible proposed Resource Calendar.

Conceptually:

	All active event demand in the affected horizon
	+ valid dates, locations and phases
	+ required and preferred dependencies
	+ Minimum and Maximum Useful Crew
	+ worker availability, absence and binary competence eligibility
	+ existing allocations and Planning Locks
	+ planning KPI policy
	+ replacement difficulty and calendar cost policy
	        ->
	Calendar-wide capacity-aware scheduling run
	        ->
	Scheduled PH by event / date / location / competence / phase
	+ Permanently Coverable Scheduled PH
	+ Residual Additional Resource Need Scheduled PH
	+ derived display FTE
	+ status, issues and explanations

The run must conserve authoritative workload. It must preserve traceability through:

	Authoritative Workload
	-> Theoretical PH at 100% KPI achievement
	-> Target Planning PH at Planning KPI Target
	-> Scheduled PH at Required KPI Achievement

In this design, **Scheduled PH** is the domain contract's final **Planned PH**. PH remains the authoritative unit for calendar allocation and workforce capacity. FTE is always derived:

	Display FTE = Scheduled PH / configured standard daily hours

Display FTE is rounded to approximately one decimal place for visualization. Calculations and stored results must retain unrounded PH and must never use rounded display FTE as an input to later scheduling.

---

# 3. Terminology and Scheduling Granularity

| Term | Definition |
|---|---|
| Scheduling Run | One deterministic calculation against a versioned input snapshot and an explicit affected planning horizon |
| Planning Horizon | Inclusive date range whose unlocked allocations may be reconsidered |
| Demand Scope | The smallest aggregate schedulable demand unit, identified by event, phase, location, competence and applicable work-front/dependency scope |
| Authoritative Workload | Delivery quantity that must be conserved; represented with its source unit and provenance |
| Theoretical PH | PH required to deliver the workload at 100% KPI achievement |
| Planning KPI Target | Realistic expected KPI achievement used to derive Target Planning PH |
| Target Planning PH | Initial PH expectation derived from Theoretical PH and Planning KPI Target; not immutable when approved compression applies |
| Required KPI Achievement | KPI achievement implied by delivering the conserved workload in Scheduled PH |
| Scheduled PH | Final PH allocated to dates; corresponds to Planned PH in the domain contract |
| Permanently Coverable Scheduled PH | Scheduled PH supported by feasible permanent worker-hours |
| Residual Additional Resource Need Scheduled PH | Scheduled PH not supported by permanent capacity after valid redistribution |
| Daily FTE Demand | Scheduled PH divided by standard daily hours; may be fractional |
| Planning Lock | Hard protection preventing movement of an aggregate event/date/location/competence allocation |
| Candidate Date | A date on which some PH from a Demand Scope may legally be allocated |
| Work-Front Progress | Aggregate approximation of prerequisite completion based on PH/KPI progress |
| Replacement Difficulty | Low, Normal or High indication of how difficult or costly competence capacity is to replace externally |
| Feasibility Witness | Temporary proof that worker-hours could support an aggregate daily competence mix; never a persisted worker assignment |

`Competence` is the current planning label for person-hours grouped by competence area and potentially competence level. The scheduler may use a stable planning-competence identifier, but storage should keep area and level semantics separable until the final terminology and taxonomy are approved.

The primary scheduling resolution is one date. Same-day overlap and competence splitting are represented in PH, not clock times.

---

# 4. End-to-End Scheduling Run

The run consists of these logical stages. A later implementation may combine stages internally, but externally observable behavior must remain equivalent.

1. Capture and validate an immutable input snapshot.
2. Resolve the affected planning horizon and participating events.
3. Separate locked allocations from unlocked demand.
4. Normalize demand from authoritative workload through Theoretical PH and Target Planning PH while preserving KPI provenance.
5. Generate legal candidate dates for each Demand Scope.
6. Build required and preferred progressive work-front relationships.
7. Derive date-specific workforce availability and competence eligibility.
8. Assess dynamic scarcity and replacement difficulty.
9. Allocate Scheduled PH across candidate dates under hard constraints.
10. Improve continuity, crew stability, location continuity and weekday use.
11. Apply controlled KPI-tolerance fragment compression.
12. Rebalance unlocked demand across competing events and recheck aggregate feasibility.
13. Classify remaining uncovered workload and its required PH as Residual Additional Resource Need.
14. Apply deterministic tie-breaking and finalize the proposed calendar.
15. Emit results, status, issues, explanations and reproducibility metadata.

Stages 9 through 12 may iterate. Residual Additional Resource Need is not final until no valid redistribution in the affected horizon can improve permanent coverage without violating a hard constraint.

---

# 5. Scheduling Inputs and State

The shared application interface supplies stable canonical identities, accepted demand, venue context, authoritative manual allocations, provenance references and Issues. Planning Locks, generated-allocation state, worker-capacity fixtures, scheduler-derived residual need and scheduling-run input or output records are scheduling-evaluation extensions rather than first executable MVP records.

## 5.1 Run Definition

Each run requires:

| Input | Required content |
|---|---|
| Run identity | Unique run ID and creation timestamp |
| Trigger | Initial generation, event import, demand change, workforce change, absence change, rule change or planner-requested recalculation |
| Horizon | First and last date open to recalculation |
| Scope | Events and locations whose unlocked allocations may change |
| Snapshot versions | Demand, venue, workforce, absence, planning-rule and calendar versions |
| Prior calendar baseline | Existing allocations and their provenance before the run |
| Configuration version | Version of scheduling policy and technical parameters |

The run must operate on one internally consistent snapshot. Source changes arriving during the run belong to a later run.

## 5.2 Demand State

Each Demand Scope requires:

- Event ID and phase;
- canonical location or explicit event-level fallback;
- competence;
- selected Demand Basis and source provenance;
- authoritative workload quantity and unit;
- Theoretical PH at 100% KPI achievement;
- Planning KPI Target and Target Planning PH;
- internal or external fulfillment;
- earliest and latest legal dates, including approved extensions;
- required and preferred dependencies;
- Minimum and Maximum Useful Crew;
- applicable KPI provenance and planning target;
- replacement difficulty;
- existing generated or manually overridden allocations;
- lock state.

Externally fulfilled demand remains visible but is excluded from internal workforce consumption.

## 5.3 Workforce State

Scheduling evaluation may use synthetic or anonymized permanent-worker fixtures. Each fixture contributes:

- stable worker identity used only for capacity feasibility;
- binary competence eligibility;
- scheduled available hours by date;
- worker-specific absence by date;
- active employment state.

Available worker-hours are scheduled hours minus absence. Negative availability is invalid input and must produce an issue rather than additional capacity.

These fixtures exist to exercise the scheduling semantics and are not first executable MVP application records. Real personnel records, named-worker assignment and production worker-level feasibility remain outside the first executable MVP. A later production implementation may supply equivalent state through an approved personnel and capacity source.

## 5.4 Calendar and Venue State

The run requires:

- canonical locations and aliases;
- event phases and approved timestamps where supplied;
- venue occupancy intervals, phase classifications and derived conflict classifications;
- approved event-specific planning-window extensions;
- weekday/weekend classification and applicable cost policy;
- locked and unlocked existing allocations.

## 5.5 Planning KPI State

Three KPI concepts must remain separate:

| KPI concept | Meaning | Use in scheduling |
|---|---|---|
| Planning KPI Target | Realistic expected achievement used to plan work; for example 80% of theoretical KPI | Derives Target Planning PH |
| Required KPI Achievement | Productivity implied by completing authoritative workload within Scheduled PH | Derived during allocation and fragment compression |
| Actual Measured KPI Achievement | Observed operational result after work is performed | Not changed by a scheduling run; retained for later calibration and future reference data |

KPI achievement is represented as a dimensionless ratio to theoretical performance so the design is independent of whether a source KPI is expressed as units per hour or hours per unit.

For each Demand Scope:

	Target Planning PH = Theoretical PH / Planning KPI Target

For the final schedule:

	Scheduled PH = Theoretical PH / Required KPI Achievement

Equivalently:

	Required KPI Achievement = Theoretical PH / Scheduled PH

Example:

- Authoritative workload corresponds to 80 Theoretical PH at 100% achievement.
- Planning KPI Target is 80%.
- Target Planning PH is `80 / 0.80 = 100 PH`.
- A compressed schedule of 96 PH implies Required KPI Achievement of `80 / 96 = 83.3%`.
- The schedule is valid only when 83.3% is within the configured acceptable tolerance.

Where the selected Demand Basis already supplies Theoretical PH or Target Planning PH, the input must identify which stage it represents so the Planning KPI Target is not applied twice.

The source workload, Theoretical PH, target, Target Planning PH, final Scheduled PH and Required KPI Achievement must remain traceable. Actual Measured KPI Achievement remains observational and is never changed by scheduling.

---

# 6. Hard Constraints

A proposed calendar is invalid if it violates any hard constraint.

## 6.1 Demand and Conservation

- Authoritative workload must be preserved.
- Theoretical PH derived from that workload at 100% KPI achievement must remain traceable and conserved as theoretical-workload equivalent.
- Target Planning PH is a baseline expectation, not an immutable conservation quantity after approved KPI compression.
- Scheduled PH may differ from Target Planning PH only when its Required KPI Achievement remains within the configured acceptable tolerance.
- For every Demand Scope, Scheduled PH must correspond to the full authoritative workload at the recorded Required KPI Achievement.
- For every Demand Scope, Permanently Coverable Scheduled PH plus Residual Additional Resource Need Scheduled PH must equal Scheduled PH.
- External demand must not consume internal workforce capacity.
- Unresolved demand must remain visible and must not be converted to zero.

## 6.2 Dates, Locations and Phases

- New or moved allocation must use a legal candidate date.
- Confirmed blocking event-phase or location conflicts are prohibited unless the contract permits and the planner has approved the exception.
- Visible occupancy overlap that is not classified as blocking remains available as planning context and must not be rejected merely because two intervals overlap at daily resolution.
- Event-level fallback demand may use only dates safe for all applicable canonical event locations.
- Locked allocations remain on their locked event, date, location and competence coordinates.
- A pre-existing locked allocation that has become invalid is carried unchanged with a conflict issue; the run must not silently move it or describe it as valid.

## 6.3 Dependencies

- Required dependencies are hard constraints.
- Required successor progress must not exceed released work-front capacity.
- Same-day predecessor and successor progress is permitted under the aggregate progressive-release rule.
- Autocomplete may relax a preferred dependency without prior planner approval when doing so materially improves the plan under declared objectives.
- Preferred-dependency relaxation must never override a required dependency and must produce a visible warning recording the affected relationship, PH/date where relevant and reason.

## 6.4 Workforce and Competence

- Total permanently covered Scheduled PH on a date must have feasible aggregate worker-hour support.
- A worker's available daily hours may not be double-counted across competence demands.
- Where eligibility permits, a worker may theoretically support more than one competence within a date, such as 4 PH FOGA and 3.5 PH Banner, provided total available daily hours are not exceeded.
- Worker-hours may support only competencies for which that worker is eligible.
- Worker-specific absence must reduce the correct overlapping competence pools.
- No named-worker allocation may be persisted or presented as scheduling output.

## 6.5 Useful Crew

- If a Demand Scope has PH on a date, at least its Minimum Useful Crew must be available and eligible while the work is performed.
- Allocation must not imply more simultaneous workers than the Maximum Useful Crew for the applicable competence, work front and location.
- Fractional FTE is valid. Minimum Useful Crew is a simultaneous worker count, not a minimum daily FTE.

At daily resolution, useful-crew validation is an aggregate feasibility envelope. It verifies that the eligible worker count, worker-hours and permitted crew range could support the daily PH. It does not promise an exact intra-day crew roster. Any case whose feasibility depends on precise clock-time interleaving must be flagged for Personnel Plan validation rather than silently treated as proven.

## 6.6 Planning KPI

- Required KPI Achievement must not exceed the configured maximum acceptable achievement for the applicable scope.
- Fragment compression may reduce Scheduled PH relative to Target Planning PH but may not reduce authoritative workload or its Theoretical PH equivalent.
- No universal minimum PH allocation applies. A small allocation is not invalid merely because it contains few PH.
- If a fragment cannot be credibly compressed within tolerance, its workload and Scheduled PH must remain visible.
- Fragment compression may not conceal Residual Additional Resource Need.
- Actual Measured KPI Achievement must never be overwritten by a planned or required value.

---

# 7. Aggregate Workforce Feasibility

This is the central structural feasibility problem.

For one date, let:

- `H(w)` be available hours for worker `w` after absence;
- `E(w,c)` be 1 when worker `w` is eligible for competence `c`, otherwise 0;
- `C(c)` be permanently covered Scheduled PH proposed for competence `c` across all events and locations on that date.

The competence mix is feasible only if some temporary distribution of worker-hours could satisfy all competence totals such that:

1. worker-hours used for worker `w` do not exceed `H(w)` and are not double-counted across competence demands;
2. worker-hours flow only to eligible competencies;
3. total worker-hours supporting competence `c` cover `C(c)`;
4. overlapping competence pools are not added as if they were independent;
5. applicable aggregate useful-crew envelopes are satisfied.

The technical implementation may establish this existence condition through any correct method. This design does not select network flow, mathematical programming, constraint programming, matching or another approach.

## 7.1 Non-Persistence Rule

An implementation may internally derive a temporary Feasibility Witness using worker identities. That witness:

- exists only to prove or reject aggregate feasibility;
- does not include work-front tasks or exact clock times;
- must not be stored as a worker assignment;
- must not reserve a worker;
- must not be shown as the Personnel Plan;
- may be discarded immediately after aggregate results and diagnostics are derived.

Persisted scheduling output contains competence PH, capacity evidence and bottleneck explanations, not worker-to-competence allocations.

## 7.2 Feasibility Diagnostics

When a competence mix is infeasible, the run should report an aggregate bottleneck certificate where possible, such as:

- `Banner requires 30 PH; only 22.5 eligible worker-hours are feasible`;
- `Banner and Print jointly require 45 PH from an overlapping pool with 37.5 available hours`;
- `three absent workers remove 15 Banner-eligible hours`;
- `Maximum Useful Crew limits FOGA coverage at Hall C despite unused total workforce hours`.

Diagnostics should identify constrained competence sets without exposing an invented named-worker schedule.

## 7.3 Daily-Aggregate Limit

Worker-hour feasibility does not prove that every competence can be staffed at exact clock times with exact simultaneous crews. That stronger question belongs to the Personnel Planner. The Resource Calendar must flag tight aggregate cases that require time-specific validation.

This is a boundary of model resolution, not a contradiction in the domain contract.

---

# 8. Candidate-Date Generation

Candidate dates are generated before PH allocation and may be narrowed as dependencies progress.

For each Demand Scope:

1. begin with the planning window derived from venue phases and the applicable Work Type rule;
2. include approved event-specific extensions beyond that rule;
3. remove dates with confirmed blocking location conflicts or target Event phase rules;
4. apply canonical-location or event-level fallback rules;
5. retain dates compatible with required dependency reachability;
6. retain legally valid weekend dates, but mark permanent coverage as available only where configured worker schedules supply weekend capacity;
7. preserve the locked date for locked PH, even if it now produces an issue;
8. classify each remaining date with weekday/weekend cost, continuity context, prior allocation and current capacity context.

A locked allocation that has become invalid is not silently moved. It remains locked, receives a conflict issue and may cause the plan to be Incomplete or Understaffed according to the domain contract's status rules.

Candidate-date generation must not reject a date merely because current capacity appears full before calendar-wide rebalancing. Existing unlocked allocations may move.

---

# 9. Progressive Work-Front Release

## 9.1 Initial Proportional Model

The first implementation uses cumulative proportional PH/KPI progress as an aggregate work-front approximation.

Each dependency relationship identifies:

- predecessor Demand Scope;
- successor Demand Scope;
- required or preferred behavior;
- the successor workload covered by the relationship;
- direction for mounting or dismantling;
- location scope.

KPI compression must not distort progress. Progress therefore uses delivered theoretical-workload equivalent rather than comparing compressed Scheduled PH directly with Target Planning PH.

For a predecessor with total relevant Theoretical PH `P_total`, each scheduled allocation contributes:

	Delivered Theoretical PH Equivalent
	= Scheduled PH * Required KPI Achievement

Cumulative progress through date `d` is:

	Predecessor Progress(d)
	= cumulative Delivered Theoretical PH Equivalent through d / P_total

The result is bounded to the interval 0 through 1. Initially, the same proportion of the related successor workload is considered released:

	Released Successor Workload(d)
	= related successor workload * Predecessor Progress(d)

For a required dependency, cumulative delivered successor workload through date `d` must not exceed Released Successor Workload(d). Same-day predecessor work may contribute to same-day release, so this is an end-of-day aggregate constraint rather than an intra-day sequence.

For dismantling, the relationship direction is reversed according to the approved dependency chain.

## 9.2 Scope and Exceptions

The proportional rule applies only to the successor workload covered by that dependency. Independent FOGA, Banner or other work must remain schedulable without a false prerequisite.

Preferred dependency limits may be relaxed automatically, without prior planner approval, when doing so materially improves higher-order objectives or avoids Residual Additional Resource Need. Every relaxation must produce a warning and include the affected relationship, PH, date and reason.

The run does not infer stand-level releases or exact physical work fronts.

---

# 10. Dynamic Scarcity and Replacement Difficulty

Scarcity is recalculated during the run. It is not a permanent competence label.

Scarcity assessment must consider at least:

- remaining authoritative workload and its required Scheduled PH;
- remaining legal dates;
- feasible eligible worker-hours by date;
- overlap with other competence pools;
- known absence;
- required predecessor release;
- Minimum and Maximum Useful Crew;
- locked allocations consuming shared capacity;
- competing event demand.

Replacement Difficulty is competence-level reference data with the initial values:

- **Low:** capacity is relatively easy or inexpensive to replace;
- **Normal:** ordinary replacement conditions;
- **High:** capacity is relatively difficult or expensive to replace.

The categories are ordinal planning signals, not currency amounts and not fixed scarcity labels.

The scheduling evaluation baseline does not provide event-specific Replacement Difficulty overrides.

When scarce workers can perform several competencies, the run should protect the competence that is harder to replace when competing work can validly move or be covered externally. Downstream scarcity must also influence prerequisite work: scarce Banner capacity can justify earlier FOGA progress that releases Banner work.

Replacement Difficulty must not create event priority. It influences the operational cost of a competence-capacity decision.

The exact scarcity score and the numerical effect of Low, Normal and High remain technical design choices subject to validation against planner expectations.

---

# 11. PH Allocation and Objective Structure

## 11.1 Allocation Principle

Allocation places Scheduled PH, not FTE units. It may create fractional-day allocations and same-day allocations for several competencies.

For each Demand Scope:

	Total Theoretical PH
	= sum over dates of (Scheduled PH * Required KPI Achievement)

This equation conserves workload at its normalized 100%-KPI equivalent. It does not require total Scheduled PH to equal Target Planning PH after approved compression.

For each scheduled date:

	Scheduled PH
	= Permanently Coverable Scheduled PH
	+ Residual Additional Resource Need Scheduled PH

Residual Additional Resource Need remains provisional until rebalancing is exhausted.

## 11.2 Hard Feasibility Before Preference

No soft preference may violate a hard constraint. Within hard feasibility, the run should evaluate outcomes in this order of intent:

1. maximize valid demand covered by permanent capacity across the affected horizon;
2. honor required progressive dependencies and protect dynamically scarce, difficult-to-replace capacity;
3. reduce direct and operational cost, including avoidable weekend use and avoidable external need;
4. preserve stable, continuous event/location/work-front progress;
5. avoid unnecessary switching and fragmented daily allocations;
6. keep crew profiles reasonably stable across consecutive days;
7. complete work earlier where this does not materially damage continuity, cost or feasibility;
8. preserve preferred dependencies where practical;
9. minimize unnecessary change from existing unlocked allocations through a soft stability preference.

These are scheduling objectives, not a claim of one mathematically optimal ordering or a required weighted formula.

## 11.3 Event Neutrality

The run must optimize calendar cost and operational efficiency rather than favor a named event. Event ID, import order and previous generation order are not event-priority inputs.

Dates, deadlines, required dependencies, locks, replacement difficulty, continuity and plan commitment may legitimately produce different outcomes between events. The explanation output must attribute such outcomes to those factors rather than to an opaque event priority.

---

# 12. Continuity and Crew Stability

## 12.1 Work Continuity

Stable workload is preferred over maximum front-loading. The run should avoid placing all feasible work as early as possible when a smoother continuous profile provides equivalent coverage and preserves natural contingency.

Continuity preferences include:

- continue the same event, location and work front on adjacent dates;
- avoid isolated fragments separated by idle dates;
- avoid unnecessary movement between canonical locations;
- avoid frequent competence-demand spikes and collapses;
- preserve a useful work front for downstream scarce competencies.

## 12.2 Crew-Profile Stability

Crew stability is evaluated as stability of aggregate PH/FTE demand, not named teams.

For the same event, location and competence on consecutive dates, prefer reasonably similar Scheduled PH or FTE where feasible. A changing demand profile is valid when caused by dependencies, deadlines, capacity, absence, useful crew constraints or fragment compression.

The run must not manufacture unnecessary work merely to make a graph smoother.

## 12.3 Earlier Completion and Natural Contingency

Earlier completion is a preference after feasibility, cost and continuity. It creates contingency by leaving usable time before the deadline.

The design must not reserve an arbitrary fixed contingency buffer. The amount of natural contingency emerges from feasible early completion and the other objectives.

## 12.4 Weekdays and Weekends

Weekday permanent capacity is preferred over weekend capacity because weekend work has additional cost. Weekend allocation remains valid where needed and where configured schedules provide capacity.

The exact weekend cost representation is configurable and must not turn weekends into a hard prohibition unless the applicable calendar contains no valid weekend capacity.

---

# 13. KPI Tolerance and Fragment Compression

## 13.1 Purpose

Small tail fragments can be operationally meaningless. For example, adding a new day for 0.7 PH may be less credible than completing that work during the preceding contiguous allocation at slightly higher productivity.

Fragment compression may absorb such a fragment only when the Required KPI Achievement remains within a configured acceptable tolerance.

There is no universal minimum meaningful PH value. A fragment remains valid demand regardless of size. Compression is a credibility test based on workload, continuity and KPI tolerance, not a rule that discards allocations below an arbitrary PH threshold.

## 13.2 Compression Rule

For a candidate fragment:

1. identify an adjacent or otherwise contiguous allocation for the same compatible work scope;
2. preserve the fragment's authoritative workload and Theoretical PH equivalent;
3. combine that workload with the contiguous allocation without assuming Target Planning PH must be preserved;
4. calculate the Scheduled PH and Required KPI Achievement for the combined workload;
5. verify that required dependency behavior remains valid;
6. evaluate preferred dependencies and emit the required warning if compression relaxes one;
7. recheck useful crew and aggregate workforce feasibility;
8. verify that Required KPI Achievement does not exceed the configured maximum acceptable achievement;
9. accept compression only when it reduces fragmentation without creating a more important cost, continuity or feasibility problem;
10. record workload, Theoretical PH, Target Planning PH, final Scheduled PH, target, required achievement, tolerance used and absorbed fragment.

Conceptually:

	Maximum Acceptable Achievement
	= Planning KPI Target + configured acceptable tolerance

The configuration may also impose an absolute ceiling. This document does not set the target, tolerance or ceiling values.

## 13.3 Safeguards

Compression must not:

- delete or reduce authoritative workload or its Theoretical PH equivalent;
- treat Target Planning PH as an immutable total after approved compression;
- use rounded FTE;
- hide Residual Additional Resource Need;
- exceed an approved KPI tolerance;
- violate a required dependency;
- imply actual measured performance;
- create a named-worker or intra-day schedule.

Planning KPI Target is expected performance. Required KPI Achievement is the implication of the proposed plan. Actual Measured KPI Achievement remains an operational observation after execution.

---

# 14. Recalculation, Locks and Commitment

## 14.1 Recalculation Scope

The affected planning horizon must include every unlocked allocation that could exchange shared capacity with the triggering change. It therefore may include events other than the event that initiated the run.

The run must:

1. retain out-of-scope allocations as fixed capacity consumption;
2. preserve in-scope locked allocations;
3. release in-scope unlocked allocations back into the candidate pool;
4. schedule combined unlocked demand without favoring prior generation order;
5. compare the proposal with the prior calendar;
6. report moved PH and the reason for each material change.

## 14.2 Planning Locks

Planning Locks are sufficient for binary commitment:

- locked means autocomplete must not move the aggregate allocation;
- unlocked means autocomplete may move it when doing so improves the plan under declared rules.

Locks protect event/date/location/competence PH. They do not reserve workers.

## 14.3 Scheduling-Evaluation Commitment Rule

Planning maturity is distinct from inherent event priority.

Planning Locks are sufficient for the scheduling behavior evaluated by this design. The v0.3 scheduling run uses:

- Planning Locks as the only hard commitment mechanism;
- prior unlocked allocations as a soft stability baseline;
- no hidden event-priority field;
- no graduated planning-maturity field;
- deterministic explanations for every material movement.

Where an allocation has reached a genuine operational or financial commitment that must not be disturbed, the planner is responsible for locking it. Existing unlocked allocations remain recalculable and may move when that materially improves the plan under declared objectives.

---

# 15. Rebalancing Across Competing Events

Rebalancing prevents an older generated event from permanently consuming capacity that could be used more effectively across the shared calendar.

After an initial feasible allocation attempt, the run must search for valid improvements involving unlocked demand, including:

- moving work to another legal date with unused feasible capacity;
- exchanging date capacity between events;
- moving easier-to-replace work to preserve scarce competence capacity;
- advancing prerequisite work that unlocks scarce downstream work;
- replacing weekend work with weekday work where feasible;
- reducing fragmentation while preserving continuity;
- restoring preferred dependencies where this does not worsen a higher objective.

An exchange is valid only if all affected dates remain feasible after the complete move. A move must not rely on capacity freed by only half of an exchange.

Rebalancing ends when no considered valid move improves the declared objective structure, or when the selected computational approach reaches its documented stopping condition. Stopping behavior is technical metadata and must be visible in debug output.

---

# 16. Residual Additional Resource Need

Residual Additional Resource Need is calculated only after candidate-date generation, PH allocation, workforce feasibility checks, fragment compression and calendar-wide rebalancing.

For every residual item, output:

- event, phase, location and competence;
- date or unresolved date range;
- residual authoritative workload and Theoretical PH equivalent;
- Residual Additional Resource Need Scheduled PH and derived display FTE;
- applicable Planning KPI Target and Required KPI Achievement;
- blocking hard constraint or exhausted capacity set;
- whether weekend capacity was unavailable or merely more costly;
- relevant dependency or location restriction;
- aggregate competence-pool bottleneck;
- replacement difficulty;
- attempted redistribution summary.

Residual need must remain part of Scheduled PH and conserved workload:

	Scheduled PH
	= Permanently Coverable Scheduled PH
	+ Residual Additional Resource Need Scheduled PH

	Total Theoretical PH
	= covered theoretical-workload equivalent
	+ residual theoretical-workload equivalent

The run does not assign a supplier, named hired worker or overtime approval.

---

# 17. Determinism and Tie-Breaking

Given the same input snapshot and configuration version, the run must produce the same result.

When alternatives remain equivalent under hard constraints and declared objectives, apply tie-breaking in this order:

1. earlier completion;
2. less fragmentation;
3. stable deterministic fallback.

The fallback must use stable business identifiers and dates, never database retrieval order, memory order, random iteration or event import order. Its exact key sequence is a technical decision, must be versioned and must not be presented as event priority.

Rounding must not participate in tie-breaking. Compare full-precision Scheduled PH, KPI achievement and workload-equivalent values.

---

# 18. Explanation and Debug Output

## 18.1 Planner-Facing Explanation

Each proposed allocation and material change should be explainable through concise reason codes and supporting values, including:

- demand provenance and selected Demand Basis;
- authoritative workload, Theoretical PH and Target Planning PH;
- why the date was eligible;
- required and preferred dependency state;
- cumulative predecessor progress and successor release;
- Planning KPI Target, Scheduled PH and Required KPI Achievement;
- Permanently Coverable Scheduled PH and Residual Additional Resource Need Scheduled PH;
- dynamic scarcity context and Replacement Difficulty;
- continuity, location continuity or crew-stability effect;
- weekday/weekend cost effect;
- lock state and prior allocation delta;
- preferred-dependency relaxation or KPI-tolerance use;
- issue and status contribution.

## 18.2 Technical Run Trace

The reproducibility trace must include:

- run ID, trigger, horizon and scope;
- all input snapshot and configuration versions;
- deterministic ordering version;
- candidate dates accepted and rejected with reason codes;
- aggregate workforce-feasibility results;
- bottleneck competence sets without persisted worker assignment;
- allocation and rebalancing steps at an appropriate diagnostic level;
- stopping condition;
- workload and theoretical-workload-equivalent conservation checks;
- Target Planning PH to Scheduled PH variance and KPI-tolerance checks;
- final status and issues.

Debug detail may be stored separately from planner-facing explanations, but both must refer to stable reason codes.

Scheduling provenance extends rather than replaces the application provenance contract. Run snapshots retain the shared record origins and source references plus scheduling input and configuration versions. A scheduling run cannot change source-to-canonical identity bindings or reinterpret whether staged demand was adopted.

## 18.3 Required Invariants

Every completed run must verify and report:

- authoritative workload conservation by Demand Scope;
- conservation of Theoretical PH equivalent, including after fragment compression;
- traceability from workload through Theoretical PH, Planning KPI Target, Target Planning PH, Scheduled PH and Required KPI Achievement;
- no requirement that Scheduled PH equal Target Planning PH when approved compression applies;
- Permanently Coverable Scheduled PH plus Residual Additional Resource Need Scheduled PH equals Scheduled PH;
- no movement of locked allocations;
- no new or moved allocation outside legal dates, with any pre-existing locked exception carried and reported explicitly;
- no required-dependency violation;
- no permanently covered Scheduled PH above aggregate workforce feasibility;
- no worker-hour double counting in the feasibility test;
- no internal capacity consumed by external fulfillment;
- no KPI compression above configured tolerance;
- no change to Actual Measured KPI Achievement;
- deterministic result identity for the input/configuration snapshot.

## 18.4 Resource Calendar Result

The final proposed Resource Calendar contains one aggregate row per event, date, location, competence, phase and relevant demand scope, with at least:

| Field | Result semantics |
|---|---|
| Run ID | Scheduling run that produced the row |
| Event ID | Canonical annual event occurrence |
| Date | Resource Calendar date |
| Location | Canonical location or event-level fallback |
| Competence and phase | Aggregate work classification |
| Authoritative workload | Conserved delivery quantity and source unit represented by the row |
| Theoretical PH | Workload represented as PH at 100% KPI achievement |
| Target Planning PH | Baseline PH at Planning KPI Target |
| Scheduled PH | Final PH allocated to the row; corresponds to contract Planned PH |
| Permanently Coverable Scheduled PH | Scheduled PH supported by feasible permanent capacity |
| Residual Additional Resource Need Scheduled PH | Scheduled PH remaining after redistribution |
| Display FTE | Scheduled PH divided by daily hours and rounded for display only |
| Demand Basis | Selected candidate and provenance |
| Planning KPI Target | Expected achievement used to derive Target Planning PH |
| Required KPI Achievement | Implied achievement for final Scheduled PH |
| Actual Measured KPI Achievement | Read-only observation when available; never generated or changed by the scheduling run |
| Lock and override state | Recalculation protection and manual-change provenance |
| Prior allocation delta | PH added, removed or moved by this run |
| Reason codes | Explanation references |
| Issues | Warnings, conflicts, assumptions and relaxations |

The result also includes run-level primary status, issue summary, configuration versions and invariant outcomes. Unrounded Scheduled PH remains authoritative for calendar and capacity calculations; authoritative workload remains the conserved delivery quantity.

---

# 19. Run Status and Failure Behavior

The scheduling run uses the domain contract's primary statuses:

- **Ready:** all required demand is scheduled and hard constraints are satisfied;
- **Ready with warnings:** all required demand is scheduled, with non-blocking assumptions or relaxations;
- **Incomplete:** required planning input is missing, so feasibility cannot be determined;
- **Understaffed:** required inputs are complete and Residual Additional Resource Need remains after valid redistribution.

Conflict remains an issue, not a primary status.

The run should return the credible partial calendar whenever sufficient inputs exist. It must not fail solely because demand is understaffed. It must stop without publishing a new proposal when snapshot validation or a hard invariant fails, while preserving the prior calendar and reporting the failure.

---

# 20. Remaining Configuration and Planner Inputs

The scheduling behavior required for this freeze candidate is resolved. The following organization-specific values and reference data still require planner or organizational input and must not be invented:

1. **Planning KPI Target values:** Which targets apply by Work Type, competence, phase or other scope, and which source PH values already include them?
2. **KPI compression tolerance:** What additional achievement is acceptable, does an absolute ceiling apply, and may tolerance differ by Work Type or phase?
3. **Replacement Difficulty assignments:** Which competencies are Low, Normal or High? Scheduling-evaluation values are competence-level reference data with no event-specific override.
4. **Dependency-covered workload mapping:** What portion of successor workload is governed by each aggregate dependency when only some work requires the predecessor?
5. **Weekend cost parameters:** What organizational cost distinction should be represented between weekday and weekend capacity?
6. **Tight aggregate crew validation:** Which configured conditions should require explicit Personnel Plan validation before the Resource Calendar is treated as operationally credible?

These are configuration, reference-data and validation inputs rather than unresolved domain behavior. Missing values may make a specific run Incomplete. Workspace scope alignment is complete. The missing workforce fixture, occupancy classification and behavioral evidence recorded in VVS 2026 First-Plan Validation Case v0.2 must be addressed before this design or the VVS scheduling evaluation is described as fully validated or frozen.

---

# 21. Technical / Algorithmic Decisions for the Next Phase

These do not require domain reinterpretation and may be evaluated technically:

- computational approach for aggregate worker-hour feasibility;
- computational approach for calendar-wide allocation and rebalancing;
- representation and numerical precision of workload, Theoretical PH, Scheduled PH and KPI achievement;
- candidate-date pruning and search-space control;
- numerical scaling of soft objectives while preserving their declared intent;
- implementation of dynamic scarcity updates;
- implementation of the proportional release constraint;
- implementation of KPI-tolerance fragment detection and compression;
- stable fallback key sequence;
- stopping conditions and runtime limits;
- incremental versus full-horizon recalculation strategy;
- storage schema, transactional publication and rollback;
- debug-trace retention and performance instrumentation;
- comparative test harness for alternative approaches.

Alternative approaches should be evaluated against the same fixtures, hard invariants, objective behavior and explanation requirements before a library or technology is selected.

---

# 22. Scheduling-Evaluation Acceptance Scenarios

The scheduling technical design is ready for implementation evaluation when candidate approaches can be tested against at least these scenarios. These are scheduling-evaluation requirements, not first executable MVP application acceptance requirements:

1. fractional Scheduled PH and one-decimal display FTE without loss of PH precision;
2. overlapping worker competencies where independent capacity totals would double-count workers;
3. worker-specific absence removing a scarce competence combination;
4. same-day proportional release from Flooring to FOGA and from FOGA to Banner;
5. required dependency enforcement and automatic, visible, explained preferred-dependency relaxation without prior approval;
6. stable multi-day workload preferred over unnecessary front-loading;
7. event/location/work-front continuity preferred over avoidable switching;
8. stable aggregate crew profile across consecutive days;
9. weekday capacity preferred over otherwise equivalent weekend capacity;
10. scarce High-replacement-difficulty competence protected when movable Low-difficulty work competes for the same workers, using competence-level assignments only;
11. locked PH preserved while unlocked demand is redistributed across events;
12. prior event generation order having no effect after affected-horizon recalculation;
13. an 80-Theoretical-PH workload producing 100 Target Planning PH at an 80% target, then 96 Scheduled PH at approximately 83.3% Required KPI Achievement within tolerance;
14. a small tail fragment compressed within KPI tolerance, retained visibly when compression is not credible, and never discarded through a universal minimum-PH rule;
15. Planning KPI Target, Required KPI Achievement and Actual Measured KPI Achievement remaining distinct;
16. locked allocations treated as the only hard scheduling-run commitments while existing unlocked allocations receive only a soft stability preference;
17. Residual Additional Resource Need carrying conserved workload, Theoretical PH equivalent and Scheduled PH only after valid rebalancing is exhausted;
18. deterministic output and explanations from identical snapshots;
19. a tight useful-crew case flagged for Personnel Plan validation rather than represented as a hidden roster;
20. workload and Theoretical PH-equivalent conservation, KPI traceability and all hard invariants passing for VVS 2026 and overlapping-event fixtures.

---

# 23. Implementation Handoff

After the first executable MVP foundations are available, an optional scheduling-evaluation track may compare computational approaches against this problem definition. It should begin with aggregate workforce feasibility and a small calendar-wide synthetic or anonymized fixture before combining the full objective set.

Scheduling evaluation must use the canonical interfaces established by the first executable MVP and must be demonstrated without replacing authoritative manual daily allocation. A visually plausible standalone Gantt is not an alternative workspace architecture.

Those interfaces include stable canonical identities, accepted demand, venue and phase intervals, authoritative manual allocations, provenance references and Issues. Import envelopes, identity reconciliation and accepted-demand adoption remain application responsibilities defined by the architecture decision.

Scheduling evaluation output, generated states, functional Planning Locks, scheduler-derived residual-need semantics and scheduling writeback are not first executable MVP acceptance requirements.

No approach should be selected only because it can produce a visually plausible Gantt. It must demonstrate workload conservation, Theoretical PH-equivalent conservation, KPI traceability, overlapping-competence feasibility, lock safety, deterministic behavior, residual-need semantics and usable explanations.

---

**End of Scheduling Technical Design v0.3 — Scheduling Run**

# First-Plan Contract

**Document:** First-Plan Contract  
**Version:** 0.3  
**Status:** Working Phase E Scheduling Domain Contract - Scope Aligned  
**Date:** 2026-09-27  
**Related PRD:** Resource Planning Application PRD v0.8  
**Related Workspace Design:** First Executable MVP Technical / Continuous Planning Workspace v0.1  
**Validation Case:** VVS 2026 First-Plan Validation Case v0.2  
**Documentation Map:** Documentation Map v0.1

**Revision note:** v0.3 aligns planning windows and venue conflicts with the continuous planning workspace. Pre-assembly preparation and move-out dismantling may be ordinary Work Type behavior, and visible venue overlap is classified before it becomes a blocking allocation conflict.

---

# 1. Purpose

This contract defines the information and behavior required to import a real event and produce a credible, editable first competence-level resource plan.

This contract is authoritative for scheduling-domain meaning when roadmap Phase E is evaluated or implemented. It does not define first-executable-MVP scope or acceptance. Resource Planning Application PRD v0.8 remains authoritative for product outcomes, the roadmap and release scope, while the continuous workspace design constrains how scheduling may integrate with the primary workspace.

The resulting plan is presented within the continuous planning workspace, synchronized to the event-location calendar. Autocomplete produces or updates allocations; it does not replace the workspace or its venue context.

It defines the boundary between information the application can derive, reusable organizational knowledge, event-specific planner knowledge and information that remains unresolved.

It does not define the scheduling algorithm.

The contract is evaluated against VVS 2026, Event ID 26970, through VVS 2026 First-Plan Validation Case v0.2. That case remains incomplete and does not establish full validation of this contract.

---

# 2. Core Outcome

The Resource Calendar autocomplete is a calendar-wide, capacity-aware generator of the resource plan.

It must support this causal flow:

	All active event demand
	+ KPIs and calculated person-hours
	+ planning windows and locations
	+ progressive dependencies
	+ planning rules and useful crew limits
	+ worker-by-competence eligibility
	+ workforce availability and known absence
	+ planning locks
	        ->
	Calendar-wide capacity-aware autocomplete
	        ->
	Credible generated first plan according to the declared rules and priorities
	        ->
	Daily person-hours and FTE by event, date, location and competence
	+ residual additional resource need
	+ status and issues

Autocomplete must not first create an unconstrained daily competence profile and only then check whether capacity can support it. Shared workforce feasibility, competence overlap, scarcity and competing event demand influence how person-hours are distributed while the plan is generated.

The objective is a useful operational forecast that an experienced planner can review and edit. The contract does not imply mathematical optimality.

## 2.1 Three Separate Planning Concepts

### Event Demand

Event Demand answers:

> How much work must be delivered?

Example: Banner requires 60 person-hours.

### Resource Plan / Resource Calendar

The Resource Plan answers:

> On which dates should competence-hours approximately occur?

Autocomplete generates this capacity-aware distribution within the shared Resource Calendar. For example:

| Date | Banner person-hours |
|---|---:|
| Tuesday | 11.25 |
| Wednesday | 30.00 |
| Thursday | 18.75 |

### Personnel Plan

The Personnel Plan answers:

> Which named workers will satisfy the generated competence demand and, eventually, at what times?

Named-worker assignment is not part of the First-Plan module. The Resource Calendar may use worker identities internally to test whether a feasible allocation of the available workforce exists, but it must not allocate or reserve named workers.

## 2.2 Shared Calendar and Recalculation

Events supply demand, planning windows, locations, dependencies and event-specific constraints. Autocomplete operates against the shared Resource Calendar and shared workforce capacity rather than treating each event as an isolated plan.

When event planning windows overlap, autocomplete must evaluate their combined unlocked demand and shared workforce constraints. The order in which events were imported or previously generated must not permanently determine which event receives permanent capacity.

The planner may recalculate an affected planning horizon. During recalculation, autocomplete may redistribute eligible unlocked demand across events while respecting Planning Locks and all other constraints. This remains aggregate competence feasibility; it does not assign or reserve named workers.

---

# 3. Input Classifications

Every required contract input must use one of these classifications.

| Classification | Meaning |
|---|---|
| DERIVED | The application can determine the value reliably from source data and approved rules |
| REFERENCE DATA | Reusable organizational data or policy maintained independently of one event |
| PLANNER INPUT | Event-specific operational knowledge or approval supplied by a planner |
| UNRESOLVED | Required information or behavior that is not sufficiently defined or available |

A value may change classification over time. For example, a phase timestamp may initially be Planner Input and later become Derived when a venue source supplies it.

---

# 4. Contract Inputs

## 4.1 Event Identity

| Input | Classification | Requirement |
|---|---|---|
| Target Event ID | DERIVED | Canonical annual event occurrence ID from source data |
| Event Series ID | DERIVED | Cross-year suffix derived from the Event ID |
| Event name aliases | REFERENCE DATA | Source-specific names mapped to Event ID |
| Reference Event ID | DERIVED or PLANNER INPUT | Previous occurrence selected for historical demand |
| Source identity and profile version | DERIVED | Identifies the import adapter and format used |

Event names must never be used as canonical join keys.

## 4.2 Imported Source Records

| Input | Classification | Requirement |
|---|---|---|
| Immutable booking line | DERIVED | Preserves the source record and source row identity |
| Current source fields | DERIVED | Includes Event ID, customer, stand, article, description, quantity, product group, product type, department and available location detail |
| Inclusion or exclusion decision | REFERENCE DATA or PLANNER INPUT | Determines whether a source line participates in a calculation without deleting it |
| Source demand status | DERIVED | Quantified, unresolved, excluded, corrected or requires review |

The import must behave as a queryable source. Mapping and filtering must not overwrite or remove source records.

## 4.3 Demand Candidate

A Demand Candidate is one traceable calculation or estimate that may be selected as planning demand.

Required fields include:

- target Event ID;
- optional Reference Event ID;
- competence;
- mounting or dismantling phase;
- optional canonical location;
- person-hours;
- source or `DATAGRUNNLAG` equivalent;
- calculation and rule versions;
- demand-quality status;
- provenance references.

Candidate types include:

- current Visma-derived quantity demand;
- historical Visma-derived quantity demand;
- historical actual hours;
- manually planned demand;
- explicit manual estimate.

Classification varies by candidate source:

- source calculations are DERIVED;
- historical-selection policies are REFERENCE DATA;
- manual planned values are PLANNER INPUT.

## 4.4 Demand Basis Selection

The active Demand Basis selects which Demand Candidate supplies planning hours for a defined scope.

The selection scope may include:

- target event;
- competence;
- phase;
- location;
- Work Type where required.

The selection must preserve all alternative candidates and explain the variance between them.

Rules:

1. If no sufficiently mature current-year candidate exists, use the most recent suitable occurrence from the same Event Series as the initial basis.
2. Mark historical demand with its Reference Event ID.
3. When current demand becomes sufficiently mature, calculate and show the variance.
4. Propose a basis change for planner approval.
5. Never switch the active basis silently.

Current-data readiness and material variance thresholds are configurable REFERENCE DATA. Their initial values do not need to be fixed in this domain contract.

## 4.5 Internal and External Fulfillment

Every demand scope must distinguish:

- event demand;
- internal staffing demand;
- externally fulfilled demand.

Externally fulfilled work remains visible in the event summary and source traceability but never consumes internal competence capacity.

This is a general fulfillment rule, not a product-specific exception.

## 4.6 Competence Reconciliation

`Competence` remains a working planning term for person-hours grouped by competence area and, where relevant, competence level. It is not yet the final worker-skill taxonomy. Source and canonical models should therefore avoid collapsing area, level and worker eligibility into one irreversible field.

| Input | Classification | Requirement |
|---|---|---|
| Work Type to competence mapping | REFERENCE DATA | Maps operational work into planning competencies |
| Unmappable competence | DERIVED warning | Preserves demand and requests planner review |
| Default competence fallback | REFERENCE DATA | May provide a provisional competence with a warning |
| Planner competence decision | PLANNER INPUT | Confirms or changes the provisional mapping |

The original Work Type and source classification must remain traceable even where detailed source drill-down is deferred from the scheduling-evaluation UI.

## 4.7 Canonical Locations

| Input | Classification | Requirement |
|---|---|---|
| Event locations | DERIVED | Canonical locations supplied by the venue source |
| Booking-location alias | REFERENCE DATA | Maps source labels and sublocations to canonical venue locations |
| Original location label | DERIVED | Preserved for traceability |
| Location mapping error | DERIVED issue | Raised when a booking location cannot be resolved |

Rules:

1. Source labels must not create canonical locations automatically.
2. Known sublocations inherit their canonical parent for availability, dependencies and crew limits.
3. Unresolved locations remain in event-level demand.
4. Event-level fallback may schedule demand only on dates safe across all canonical event locations.
5. If no common safe date exists, the affected demand remains unscheduled with `Location required`.
6. A multi-location label remains event-level until assigned or split.

## 4.8 Venue Phases and Availability

Required venue phases are:

- assembly;
- moving in;
- event;
- moving out;
- dismantling.

Date-level phase data is DERIVED from the venue source.

Default planning windows are derived from venue phases and Work Type rules:

- ordinary mounting may use assembly dates;
- Work Type rules may allow preparation or prefabrication before assembly;
- Work Type rules may allow mounting to continue into moving in;
- dismantling may begin during moving out where that is normal for the Work Type;
- dismantling may continue through dismantling dates;
- exceptional extensions beyond the approved Work Type rule require location availability, a visible issue and planner approval.

The target event's Event phase blocks ordinary mounting and dismantling work.

At daily scheduling-evaluation resolution, overlapping occupancy is always visible but is not automatically identical to a blocking conflict. An explicit occupancy rule classifies the overlap using canonical location scope, both events' phases, access requirements and available timestamps. A confirmed blocking conflict prevents automatic allocation; a possible conflict remains visible for planner review. A planner may resolve a same-day handover by supplying timestamps.

Moving-in and moving-out conflicts are critical because they are governed by event contracts.

Phase timestamps may be:

- scheduling-evaluation planner input;
- DERIVED from an external venue source in the future.

## 4.9 Work Stages and Dependencies

Default assembly stages are REFERENCE DATA:

1. Flooring: Engangstepper, Teppefliser
2. Booth build: FOGA
3. Finishing and fit-out: Banner, Print, Snekker
4. Furniture: Møbler, Innredning

Default dismantling order is reversed.

These stages provide orientation and default precedence. They must not be interpreted as whole-demand finish-to-start dependencies.

The scheduling-evaluation baseline uses **Progressive Work-Front Dependencies**:

- predecessor and successor work may occur in the same location on the same day;
- prerequisite work should progress sufficiently to support downstream work;
- not all FOGA requires flooring;
- most Banner requires preceding FOGA;
- Carpentry and later custom-build work may depend on preceding work;
- several stages may therefore remain active simultaneously;
- default relationships apply independently by canonical location;
- event-level demand receives event-level relationships;
- the planner may confirm, add, remove or reorder relationships;
- the planner may select location scope and required versus preferred behavior;
- per-stand dependency planning remains outside this scheduling-evaluation baseline.

Where work-front availability must be approximated, autocomplete may use calculated KPI and person-hour progress. For example, sufficient planned FOGA progress may release part of Banner demand later on the same planning day.

This approximation supports resource forecasting and competence feasibility. It does not predict the exact stand that becomes available or replace the floor manager's operational sequencing decisions.

The exact progressive-release calculation is deferred to scheduling design, but same-day progressive overlap is required behavior.

## 4.10 Competence Allocation Limits

| Input | Classification | Requirement |
|---|---|---|
| Minimum Useful Crew | REFERENCE DATA | Minimum workers simultaneously present while work is performed; default is 1 worker |
| Maximum Useful Crew | REFERENCE DATA | Maximum productive simultaneous workers, user-defined by competence |
| Event or location override | PLANNER INPUT | Replaces the reusable default for an exception |

Daily FTE Demand, Minimum Useful Crew, Maximum Useful Crew and Competence Availability are separate concepts:

- **Daily FTE Demand:** person-hours allocated to a competence on a date divided by standard daily hours; this may be fractional;
- **Minimum Useful Crew:** the minimum number of workers who must be simultaneously present while the work is performed;
- **Competence Availability:** how many available workers are eligible to perform a competence;
- **Maximum Useful Crew:** how many people can work productively on one competence, work front and location at the same time.

For example, 3.75 person-hours is valid as 0.5 FTE-day and may represent one eligible worker performing approximately half a day of work. It does not violate a Minimum Useful Crew of 1 worker.

The Maximum Useful Crew:

- is the same for mounting and dismantling;
- applies separately to each canonical location;
- represents useful simultaneous allocation before efficiency loss;
- limits allocation but does not create capacity;
- must be present for every scheduled competence.

Missing maximums make a plan Incomplete.

Efficiency curves and task-switching penalties belong to a later scheduling phase.

## 4.11 Permanent Workforce Capacity

Required reference records:

- worker identity;
- binary eligibility for every relevant worker and competence combination;
- active employment status;
- standard weekday schedule of 7.5 hours.

Rules:

- available worker-hours may support multiple competence demands within a day where eligibility permits, provided total available worker-hours are not exceeded and overlapping competence capacity is not double-counted;
- overlapping competence pools must be evaluated together rather than summed independently;
- autocomplete evaluates whether the aggregate available workforce can feasibly support the generated competence mix;
- worker identity may be used internally for feasibility calculations;
- autocomplete must not allocate, reserve or display named-worker assignments;
- autocomplete must not imply that it constructs a hidden intra-day named-worker schedule;
- final named assignment belongs to the future Personnel Plan.

From these records and worker-specific absence, the application derives for each date:

- total permanent workforce availability;
- available capacity for each competence;
- feasible simultaneous combinations of competence demand;
- the effect of absence on scarce and overlapping competence pools.

Primary-versus-secondary preferences, competence levels, individual productivity and preferred worker or team allocation are outside this scheduling-evaluation baseline.

## 4.12 Absence

Absence is imported from a separate source and identifies:

- worker;
- date or time interval;
- absent hours.

Available worker hours equal scheduled hours minus absence.

The exact source format is UNRESOLVED, but worker identity is required so absence removes the correct competence capability. Aggregate date-level absence alone is insufficient for capacity-aware autocomplete.

## 4.13 Additional Resource Need

The target automatic first-plan capability generates the Resource Plan against permanent workforce availability shared by all active events in the affected planning horizon.

Planned Demand remains the full amount of work the event requires on a date. Conceptually:

	Planned Demand
	= Permanently Coverable Demand
	+ Residual Additional Resource Need

Autocomplete must first redistribute and rebalance eligible unlocked demand across valid dates and events while considering competence feasibility, progressive dependencies, Planning Locks and useful crew constraints. It must use unused feasible capacity where possible.

Residual Additional Resource Need is calculated only after this valid redistribution has been attempted. A local daily capacity gap must not be reported as Residual Additional Resource Need when the work can validly move to unused feasible capacity elsewhere in the affected planning horizon.

If valid demand remains uncovered, the output must show:

- date;
- competence;
- uncovered person-hours and FTE;
- the capacity or rule that prevented coverage.

This uncovered demand is the basis for visualizing Residual Additional Resource Need. It must not require named hired workers, supplier capacity or a supplier workflow.

Detailed hired-help handling, supplier communication, supplier response and overtime approval are later refinements unless a later validation proves them necessary for the core first plan.

Weekend demand may be covered only by permanent workers whose configured schedule supplies weekend capacity in the scheduling evaluation. Other weekend demand remains visible as Residual Additional Resource Need.

## 4.14 Manual Changes and Planning Locks

The contract distinguishes:

- **Demand Adjustment:** changes person-hour demand;
- **Demand Basis Selection:** chooses among alternative candidates;
- **Schedule Override:** changes generated allocation without changing demand;
- **Conflict Resolution:** supplies missing availability detail or approves an exception.

Each change preserves the generated or calculated value, changed value, planner, timestamp and reason.

A **Planning Lock** protects an aggregate allocation at event, date, location and competence level from movement during recalculation.

Default behavior:

- generated allocations are unlocked and recalculable;
- manually overridden allocations are locked;
- a planner may explicitly lock a generated allocation;
- a planner may explicitly unlock a manual or generated allocation.

For example, `Event A / Tuesday / Banner / 22.5 PH - Locked` preserves that aggregate Banner allocation during recalculation. It does not assign or reserve named workers.

When recalculating an affected planning horizon, autocomplete may redistribute all eligible unlocked demand across events while preserving locked allocations. Residual Additional Resource Need is determined only after feasible redistribution of unlocked demand has been considered.

---

# 5. Planning Priorities

Hard feasibility rules include:

- preserve valid demand;
- prevent worker-capacity double counting;
- respect competence eligibility and total worker-hours;
- respect Minimum and Maximum Useful Crew constraints;
- preserve locked allocations during recalculation;
- prevent unapproved Event-phase work;
- prevent unapproved location conflicts;
- retain unresolved demand rather than treating it as zero demand. A first-MVP `0 PH` unknown-PH placeholder remains unresolved possible work and is never schedulable proof that no work exists.

Among feasible alternatives, use this priority order:

1. Avoid residual uncovered valid demand across the affected planning horizon.
2. Preserve progressive build order.
3. Keep work continuous rather than fragmented.
4. Finish early enough to retain contingency.
5. Reduce Additional Resource Need by redistributing unlocked work across valid dates and events.

These priorities state required product behavior. They do not prescribe an optimization algorithm.

## 5.1 Dynamic Competence Scarcity

Autocomplete must recalculate competence scarcity as the plan develops. Scarcity is not a fixed competence label.

It is derived from the interaction of:

- remaining competence demand;
- remaining valid planning time;
- available permanent workers;
- overlapping worker eligibility across competencies;
- worker-specific absence;
- progressive work-front dependencies;
- Minimum and Maximum Useful Crew constraints.

A downstream competence that has little feasible capacity must influence upstream scheduling. For example, scarce Banner capacity may justify prioritizing the FOGA progress needed to release Banner work fronts, even where another feasible FOGA sequence would otherwise appear equivalent.

Pure worker-hour utilization is not always the desired outcome. Replacement cost or difficulty may differ by competence: Banner-capable capacity may be harder or more expensive to replace than Carpet capacity even where the same workers are eligible for both.

Scheduling design must consider both competence availability or scarcity and replacement resource cost or difficulty. The contract does not define a formula or scoring method. Planning Locks let the planner preserve an operational priority explicitly, such as protecting Banner allocation while accepting Additional Resource Need for Carpet.

The exact scarcity calculation, replacement-cost treatment, tie-breaking behavior and allocation method belong to scheduling design. The contract requires the behavior, not a specific formula or claim of optimality.

---

# 6. First-Plan Outputs

## 6.1 Daily Allocation

The output must provide, at minimum:

| Field | Meaning |
|---|---|
| Date | Allocation date |
| Event ID | Target event occurrence |
| Location | Canonical location or event-level scope |
| Competence | Required planning competence |
| Phase | Mounting or dismantling |
| Planned person-hours | Generated competence allocation on the date |
| Daily FTE Demand | Planned person-hours divided by configured daily hours; may be fractional |
| Permanently Coverable Demand | Planned demand supportable by feasible permanent capacity |
| Residual Additional Resource Need | Planned demand not supportable after valid redistribution of unlocked demand |
| Lock state | Whether autocomplete may move the aggregate allocation during recalculation |
| Demand Basis | Candidate selected for the demand |
| Issues | Warnings, assumptions, conflicts and overrides |

Person-hours are authoritative. FTE is a planning representation and may be fractional.

The output semantics are:

	Planned Demand
	= Permanently Coverable Demand
	+ Residual Additional Resource Need

Residual Additional Resource Need is reported only after autocomplete has considered valid redistribution to unused feasible capacity elsewhere in the affected planning horizon.

The plan must support split-day allocations. Available worker-hours may support multiple competence demands within a day where eligibility permits, provided total available worker-hours are not exceeded and overlapping competence capacity is not double-counted. For a 7.5-hour standard day, valid daily allocations include:

| Competence | Person-hours | FTE |
|---|---:|---:|
| Flooring | 22.50 | 3.0 |
| FOGA | 45.00 | 6.0 |
| Banner | 11.25 | 1.5 |

These values describe aggregate competence capacity and work demand. First-Plan does not create a hidden intra-day named-worker schedule. Actual named-worker and time allocation belongs to the future Personnel Planner.

## 6.2 Primary Plan Status

Exactly one primary status is assigned:

- **Ready:** all required demand is scheduled and required constraints are satisfied.
- **Ready with warnings:** all required demand is scheduled, but non-blocking warnings or assumptions remain.
- **Incomplete:** required planning input is missing, so the engine cannot determine whether demand can be fully covered.
- **Understaffed:** required inputs are complete and valid redistribution still leaves Residual Additional Resource Need.

## 6.3 Issues

Issues are independent of primary status and may include:

- dataset error;
- unresolved quantity;
- fallback competence;
- fallback location;
- historical or uncertain Demand Basis;
- phase extension;
- event or location conflict;
- dependency override;
- Demand Adjustment;
- Schedule Override;
- Planning Lock or unlock;
- external fulfillment;
- missing source maturity;
- missing Maximum Useful Crew;
- Residual Additional Resource Need;
- other accepted assumptions.

A plan may, for example, be Understaffed and also contain conflicts.

The engine must return the credible partial plan produced according to declared rules and priorities whenever sufficient inputs exist. It must not fail merely because demand is uncovered.

## 6.4 Resource Calendar Boundary

The Resource Calendar is not a floor-management or personnel-assignment system.

First-Plan does not schedule:

- named workers or teams;
- named hired workers;
- stand-by-stand execution;
- exact intra-day start and finish times;
- detailed floor tasks or work packages;
- individual productivity;
- the exact physical work front released at a particular moment.

Its purpose is to distribute approximate competence-level person-hours and FTE across the shared calendar, expose aggregate feasibility and residual additional resource need, and provide an editable starting point for planner review. It may use worker identity to evaluate capacity, but it neither creates a hidden named-worker schedule nor lets locks reserve people.

---

# 7. Remaining Inputs and Design Decisions

## 7.1 Validation Inputs Still Required

- The permanent worker-to-competence table does not exist.
- The absence source format has not been supplied.
- Actual VVS permanent competence capacity cannot yet be derived.
- The required Maximum Useful Crew table does not yet exist as approved reference data.

These make the current VVS case Incomplete for actual staffing validation. They do not leave the domain contract undefined.

## 7.2 Scheduling-Design Decisions

- exact progressive work-front release calculation;
- exact dynamic scarcity calculation or scoring;
- replacement-cost or replacement-difficulty representation;
- tie-breaking behavior;
- exact contingency implementation;
- mathematical or heuristic approach used to distribute work.

These are deliberately deferred to Scheduling Technical Design v0.3 - Scheduling Run. They do not prevent freezing the domain contract. That design must preserve progressive same-day overlap, dynamic scarcity awareness, downstream scarcity influencing prerequisite work, capacity-aware calendar-wide distribution, Planning Locks and residual shortage reporting after redistribution.

## 7.3 Source-Data Gaps and Warnings

- Product type `0` contains several meanings.
- Zero quantities may represent unresolved demand.
- Negative corrections require explicit customer-anchor behavior.
- Some booking locations do not map to venue locations.
- Phase timestamps are absent from the current venue source.

These do not justify discarding known demand. Routing uncertainty does not reduce calculated PH; an explicit placeholder route retains the known amount and its review Issue. An unknown-PH placeholder preserves possible work for review and must not be interpreted as confirmed zero demand.

## 7.4 Domain Freeze Decision

The core demand and allocation concepts remain stable. Workspace alignment reopens the exact classification of occupancy conflicts and the Work Type rules that derive planning windows. Missing reference datasets and configurable policy values must be supplied during implementation and validation. Algorithm and engineering choices belong to the next artifact.

---

# 8. Planner Rules Learned During Validation

1. Event ID is the source of truth; event names are aliases.
2. Event Series ID permits cross-year historical references.
3. Historical demand is the normal starting point before current bookings mature.
4. Current demand is shown with variance and requires approval before replacing history.
5. One event may retain several demand candidates simultaneously.
6. `DATAGRUNNLAG` represents the selected demand source for summation.
7. Manual planned demand is valid where Visma is incomplete, weak or incorrect.
8. Event demand and internal staffing demand are separate concepts.
9. Externally fulfilled work remains visible but consumes no internal capacity.
10. Source filtering is required, but source records must remain immutable.
11. Commercial on-site work normally follows venue phases.
12. Phase dates are nominal; free location dates may extend the window with approval.
13. Moving-in and moving-out conflicts are contract-sensitive and critical.
14. Same-day handovers require timestamps when daily data shows a conflict.
15. Build order is progressive and location-aware, not event-wide finish-to-start.
16. Predecessor and successor competencies may overlap on the same day.
17. KPI and person-hour progress may approximate released work fronts without claiming floor-level precision.
18. Minimum and Maximum Useful Crew constrain simultaneous execution and are distinct from fractional Daily FTE Demand and competence availability.
19. Permanent capacity constrains the plan while it is generated, not only after generation.
20. Multi-competence workers must not be counted twice.
21. Worker identity supports aggregate feasibility testing but does not create hidden named assignments, schedules or reservations.
22. Daily competence allocation may use fractional FTE and split-day capacity.
23. Dynamic scarcity must influence sequencing, including the prerequisite work needed by a scarce downstream competence.
24. Replacement cost or difficulty may make protection of a scarce competence preferable to pure worker-hour utilization.
25. Autocomplete operates across competing event demand in a shared planning horizon.
26. Previously generated unlocked work may be redistributed; import or generation order must not permanently consume capacity.
27. Planning Locks preserve aggregate allocations without reserving named workers.
28. Residual Additional Resource Need is reported only after valid redistribution to unused feasible capacity; supplier and overtime workflows are later concerns.
29. The planner reviews a generated proposal rather than building every plan from an empty grid.

---

# 9. Scheduling-Evaluation Boundary

## 9.1 In Scope

- Excel import through a versioned current Visma profile;
- immutable source records and query-like filtering;
- Event ID, aliases, Event Series and historical references;
- Conversion Profiles and phase-specific person-hours;
- alternative Demand Candidates and active Demand Basis;
- internal versus external fulfillment;
- competence reconciliation and warnings;
- canonical venue locations and booking-location aliases;
- venue phase dates and conservative daily conflict detection;
- manual timestamp conflict resolution;
- progressive work-front dependencies, same-day overlap and planner dependency edits;
- KPI/person-hour progress as an approximate work-front release signal;
- Minimum and Maximum Useful Crew by competence and location;
- permanent worker and binary competence reference data;
- worker-specific absence import;
- standard 7.5-hour weekday schedule;
- calendar-wide capacity-aware autocomplete using combined event demand and overlapping worker eligibility;
- recalculation of an affected planning horizon across events;
- Planning Locks at event, date, location and competence level;
- dynamic competence scarcity during generation;
- aggregate daily competence planning with fractional FTE and split-day allocation;
- residual Additional Resource Need after valid redistribution and Understaffed status;
- editable generated plan with preserved baseline;
- primary status and independent issues.

## 9.2 Out of Scope

- Visma API connector;
- supplier request and response workflow;
- named hired workers;
- supplier capacity commitments;
- overtime request and approval workflow;
- final named-person booking;
- primary or secondary competence preferences;
- competence levels, proficiency or productivity by worker;
- preferred workers or teams;
- efficiency curves during a day;
- task-switching penalties;
- custom-build Design calculations;
- Service coverage derived from opening hours;
- advanced pre-assembly production modeling beyond dated competence demand;
- department-specific exceptions not represented by Work Type planning-window rules;
- booth-area-based tiered move-in;
- automatic phase timestamps from an external source;
- per-stand dependency planning;
- exact intra-day execution and work-front tracking;
- hidden named-worker or team scheduling inside autocomplete;
- detailed floor tasks and work packages;
- a prescribed optimization, scarcity or replacement-cost formula;
- detailed source drill-down UI;
- automatic KPI learning.

---

# 10. Scheduling-Evaluation Acceptance Requirements

The scheduling evaluation passes these domain requirements when it can:

1. import a supported Visma workbook without depending on column order;
2. preserve every source line and its provenance;
3. identify the target Event ID and derive Event Series ID;
4. resolve known event aliases without joining by name alone;
5. calculate traceable Demand Candidates by competence and phase;
6. preserve unresolved quantities and mapping errors as issues;
7. use historical demand when current-year data is not sufficiently mature;
8. show current-versus-active demand variance and require approval before switching;
9. distinguish event demand, internal staffing demand and external fulfillment;
10. reconcile known Work Types to planning competencies;
11. preserve fallback competence warnings;
12. map known booking locations to canonical venue locations;
13. retain unmapped-location demand at event level without silently discarding it;
14. derive planning windows from venue phases and approved Work Type rules, including normal pre-assembly preparation and move-out dismantling where applicable;
15. display overlapping venue occupancy and classify confirmed versus possible conflicts at daily resolution;
16. accept planner phase timestamps to resolve a same-day conflict;
17. apply progressive assembly and reverse dismantling dependencies by location;
18. allow valid predecessor and successor work to overlap on the same day;
19. use KPI/person-hour progress as an explicit approximation for releasing downstream work fronts;
20. accept planner dependency edits without requiring per-stand tasks;
21. allow fractional Daily FTE Demand while enforcing Minimum Useful Crew and user-defined Maximum Useful Crew separately from competence availability;
22. derive permanent daily competence capacity from the binary worker-by-competence matrix without double-counting workers;
23. deduct worker-specific absence from the correct overlapping capacity pools;
24. evaluate combined demand from events with overlapping planning windows against shared workforce capacity;
25. generate the plan with capacity constraints active throughout autocomplete;
26. use dynamic competence scarcity to influence allocation and prerequisite sequencing;
27. support fractional FTE and split-day competence allocation without exceeding total available worker-hours or double-counting overlapping competence capacity;
28. generate a daily competence-level first plan without constructing, assigning or reserving a named-worker schedule;
29. preserve generated allocations as unlocked and recalculable by default;
30. lock manual overrides by default and allow planners to lock or unlock manual and generated allocations explicitly;
31. preserve locked aggregate event, date, location and competence allocations during recalculation without reserving named workers;
32. recalculate an affected planning horizon by redistributing eligible unlocked demand across events;
33. prevent event import or generation order from permanently deciding which event receives permanent capacity;
34. calculate Residual Additional Resource Need only after valid redistribution to unused feasible capacity has been considered;
35. report Planned Demand as Permanently Coverable Demand plus Residual Additional Resource Need by event, date, location and competence;
36. retain residual valid demand and assign Understaffed when required inputs are complete;
37. return a credible partial plan instead of failing when demand is uncovered;
38. assign Incomplete when required inputs such as a Maximum Useful Crew are missing;
39. preserve the generated baseline when a planner edits the schedule;
40. assign one primary plan status and any number of independent issues;
41. explain the selected Demand Basis, source versions, warnings and material overrides.

The scheduling evaluation does not pass these requirements merely by creating a technically valid schedule. The plan must respect the declared stage order, location availability, capacity and efficiency limits well enough to be useful for planner review.

---

# 11. Recommended Implementation Sequence

## Step 1 - Freeze Contract Fixtures

- preserve the current VVS source workbooks;
- serialize the expected demand candidates and selected 891.486-hour internal baseline;
- record the external 137.929-hour Gangtepper demand;
- record expected issues and location mappings;
- include overlapping-event calendar fixtures for shared-capacity validation.

## Step 2 - Canonical Source and Identity Layer

- implement source profiles;
- preserve source rows;
- implement Event Identity Registry, aliases and Event Series derivation;
- support query-like source inclusion and exclusion.

## Step 3 - Demand Foundation

- implement Conversion Profiles and Work Requirements;
- produce versioned Demand Candidates;
- implement Demand Basis selection and variance;
- implement internal and external fulfillment;
- implement competence reconciliation and demand issues.

## Step 4 - Venue and Location Layer

- import venue phases;
- implement canonical locations and aliases;
- detect daily conflicts;
- support event-level fallback and timestamp-based manual resolution.

## Step 5 - Workforce Capacity Layer

- create worker, competence and worker-competence reference data;
- import worker-specific absence;
- derive feasible capacity from overlapping binary competence eligibility;
- enforce total available worker-hours without creating named-worker schedules or assignments.

## Step 6 - Planning Rules

- implement stage reference data;
- implement planner dependency confirmation and edits;
- implement Minimum and Maximum Useful Crew constraints;
- implement working-time and Work Type planning-window rules;
- implement Planning Lock defaults and explicit lock or unlock behavior;
- design KPI/person-hour progressive work-front release;
- design dynamic competence scarcity, replacement-cost treatment, contingency and tie-breaking behavior.

## Step 7 - Calendar-Wide Capacity-Aware First-Plan Generation

- distribute combined unlocked event demand while permanent capacity, overlapping competence eligibility, absence, dependencies, locks and useful crew constraints are active;
- support affected-horizon recalculation without privileging previously generated events;
- support same-day progressive overlap and split-day fractional FTE;
- return Planned Demand, Permanently Coverable Demand, Residual Additional Resource Need, status and issues;
- preserve the generated baseline for editing.

## Step 8 - Validation

- validate VVS demand exactly;
- add the missing workforce fixture;
- compare generated VVS spans with planner expectations;
- test adjacent venue conflicts with HYROX and Oslo Motor Show;
- test combined demand from overlapping event planning windows;
- test that recalculation can redistribute unlocked work across events without moving locked allocations;
- test basis switching, worker-specific absence, overlapping competence eligibility, split-day allocation, scarcity behavior, extension approval and residual Additional Resource Need.

---

# 12. PRD v0.8 Candidates

The following should be considered for later PRD revisions from this contract:

1. Add Demand Candidate and Demand Basis as explicit product concepts.
2. Add historical-to-current basis transition with readiness, variance and approval.
3. Add event demand, internal staffing demand and external fulfillment as separate concepts.
4. Add query-like source filtering while preserving immutable source records.
5. Add canonical location aliases and event-level fallback behavior.
6. Replace fixed phase deadlines with nominal and approved elastic planning windows.
7. Add daily venue-conflict severity and timestamp-based resolution.
8. Formalize the default assembly and reverse dismantling stage taxonomy.
9. Define dependencies as progressive work-front relationships with same-day overlap and planner exception editing.
10. Define KPI/person-hour progress as an approximate work-front release signal rather than floor execution.
11. Separate fractional Daily FTE Demand, Minimum Useful Crew, Maximum Useful Crew and competence availability.
12. Bring the binary worker-by-competence matrix into first-plan scope without named assignment output.
13. Add worker-specific absence import.
14. Require capacity-aware autocomplete rather than unconstrained generation followed by capacity checking.
15. Add dynamic competence scarcity, replacement-resource considerations and overlapping eligibility to generation behavior without prescribing a formula.
16. Require fractional FTE and split-day competence allocation.
17. Define autocomplete as calendar-wide and event-agnostic across an affected planning horizon.
18. Add Planning Locks with recalculable generated allocations and locked manual overrides as defaults.
19. Report Residual Additional Resource Need only after valid redistribution to unused feasible capacity, without requiring supplier or overtime workflow.
20. Add primary plan status plus independent issues.
21. Require a credible partial-plan output when demand remains uncovered.
22. State that Resource Calendar is separate from Personnel Plan and floor management.
23. Update preliminary development phases so shared workforce capacity exists before automatic first-plan generation.
24. Define the target Phase E capability around importing event demand into a shared Resource Calendar and generating a credible editable first plan.
25. Keep algorithm choice outside the PRD and place it in Scheduling Technical Design v0.3 - Scheduling Run.

---

**End of First-Plan Contract v0.3**

# Resource Planning Application — Product Requirements Document

**Document:** PRD  
**Version:** 0.8  
**Status:** Working Draft  
**Last Updated:** 2026-09-29
**Documentation Map:** Documentation Map v0.1

**Revision note:** v0.8 restores the continuous event-location and resource calendar as the primary planning workspace. Gantt behavior enhances this workspace through hierarchy, collapse and expansion, spans and dependency visualization; it does not replace the date-aligned grid. The workspace also supports query-like filtering and grouping across governed planning dimensions. The scope-alignment revision defines the first executable MVP as the browser-local workspace while preserving automatic first-plan generation as the target product direction. The demand-conversion alignment includes staged raw Visma conversion, persistent mapping and KPI configuration, explicit review and atomic demand publication while leaving multi-source demand-basis selection, candidate comparison and Demand Adjustments to a future dedicated Demand Management page. The main MVP workspace consumes approved demand read-only. Automatic scheduling remains a later phase. The capacity alignment defines application-maintained pooled permanent capacity from 17 crew, a 7.5-hour workday, the Norwegian workday calendar and audited date overrides.

---

# 1. Purpose

The Resource Planning Application is a planning and decision-support system for managing labor requirements across events and projects.

The system should transform information about what has been booked and must be delivered into a structured resource plan.

At a high level, the application should answer:

1. What work must be performed?
2. How much work does that represent?
3. How many person-hours are required?
4. Which competencies are required?
5. When is that work eligible to be performed?
6. When should those competencies be scheduled?
7. Does available workforce capacity meet the demand?
8. Which people should ultimately be assigned?

The long-term goal is to move from largely manual, experience-driven planning toward structured, data-driven and increasingly automated resource planning.

This PRD is authoritative for product outcomes, the phase roadmap and the scope of the first executable MVP. Within the first-executable-MVP branch, the architecture decision is authoritative for implementation boundaries and technical constraints, Booking Demand Conversion and Review Contract v0.1 for source-to-demand domain behavior, the workspace design for interaction behavior, and the Acceptance Pack only for fixture realization and expected results. Within the scheduling-evaluation branch, First-Plan Contract v0.3 is authoritative for Phase E scheduling-domain meaning and Scheduling Technical Design v0.3 - Scheduling Run provides its technical elaboration. The workspace design also constrains how scheduling may integrate with the primary workspace.

---

# 2. Product Vision

The target product should create the following continuous planning chain. The first executable MVP implements the source-to-competence-demand portion plus authoritative manual planning. Automatic scheduling, production constraint enforcement, operational workforce feasibility and personnel assignment remain later capabilities:

	Booking Data
		 ↓
	Conversion Profile
		 ↓
	Work Requirements
		 ↓
	Productivity Calculation
		 ↓
	Required Person-Hours
		 ↓
	Planning Constraints
		 ↓
	Planning Eligibility
		 ↓
	Competence Demand
		 ↓
	Schedule Generation / Manual Planning
		 ↓
	Daily Resource Demand
		 ↓
	Capacity Comparison
		 ↓
	Personnel Assignment

The system should capture enough operational knowledge to generate a useful proposed work schedule while preserving human control over the final plan.

The target product is a web application that replaces the current manual spreadsheet workflow. Existing spreadsheets are evidence of domain concepts, decisions and operational needs; they are not a user-interface or technical blueprint that must be copied one-to-one.

The broad interaction model of the current `Kalender` sheet is intentional product evidence. The primary workspace must preserve a continuous horizontal calendar in which venue occupancy and resource planning share one date axis. The application should remove spreadsheet limits without removing the visual alignment that lets planners understand availability, overlapping phases, demand, allocation and capacity without manually comparing dates.

The target operating principle is:

> Automate everything that can be derived reliably, and ask the planner only for operational knowledge the system cannot yet infer.

Dependencies are expected to remain an important explicit planner input. Manual overrides remain available for experience or exceptional conditions not yet represented by rules, but they should be controlled exceptions to an automatically generated plan rather than the normal method of creating one.

The first executable MVP establishes the manual planning workspace needed to validate this direction. Its authoritative allocation is planner-entered daily allocation; production automatic schedule generation belongs to a later phase.

The application should therefore act as both:

- a resource planning tool;
- a decision-support system;
- a structured representation of operational planning knowledge;
- a foundation for automated schedule generation.

---

# 3. Product Boundary

The primary purpose of the application is **resource planning**.

It is not intended to become a detailed production-management system.

The system must retain enough information about underlying work to:

- calculate required labor;
- determine competence demand;
- determine when work is eligible;
- respect planning constraints;
- support schedule generation.

However, the planner should not be required to manage the execution of individual booking lines or individual work requirements.

This distinction is fundamental:

> The system must understand how many competence-hours are eligible to be scheduled without requiring the planner to specify which individual booking item's hours are being consumed.

---

# 4. Current Planning Problem

Resource planning is currently performed largely manually using tools such as Excel.

The planner combines information including:

- event dates;
- booking quantities;
- work types;
- productivity KPIs;
- locations;
- access dates;
- task sequencing;
- competence requirements;
- available working days;
- available workforce;
- operational experience.

Much of the actual planning logic currently exists as knowledge held by experienced planners.

This includes understanding:

- which work should happen first;
- which work can overlap;
- when downstream work can begin;
- realistic productivity;
- useful crew sizes;
- which competencies are interchangeable and which are not;
- where workers become redundant if work is sequenced poorly;
- how work should be distributed across available days;
- where resource shortages are likely to occur.

The application should progressively represent this knowledge through structured data, rules, constraints and planning preferences.

The current workbook separates three useful concerns:

- converted and manually curated demand with provenance and validation status;
- event-location availability across assembly, move-in, event, move-out and dismantling periods;
- a continuous date-aligned workspace that combines venue context, approved demand, daily FTE allocation and staffing-capacity comparison.

These concerns should inform both the application model and the primary workspace. Excel-specific helper columns, fixed two-year storage grids, copied formula chains and manual joins should not constrain the web application design. The continuous date-aligned calendar interaction is a required domain behavior even though the spreadsheet implementation of that calendar is not.

---

# 5. Event Identity

The source Event ID identifies one event occurrence in one year. Where supplied, it is the authoritative business key used to resolve the stable canonical Event Occurrence identity through:

	Booking
	   ↓
	Planning
	   ↓
	Execution
	   ↓
	Historical Reporting

Event names are not reliable identifiers. Human naming differences may cause the same event occurrence to appear under several names across source systems. Names must therefore be preserved as source-specific aliases and resolved to a stable canonical Event Occurrence through an Event Identity Registry. The source Event ID remains a source identity bound to that canonical occurrence.

Operational Visma Project IDs use exactly five digits in the form `[YY][PPP]`. The first two digits identify the occurrence year as `20YY`; the final three digits identify the recurring Project Series and must retain leading zeroes. The complete five-digit value identifies one annual Event Occurrence and remains the unit of Visma snapshot coverage and replacement. The derived three-digit series relationship permits cross-year comparison but never merges annual occurrences.

Example:

| Identity | Value | Meaning |
|---|---:|---|
| Source Event ID / Project Number | 26970 | VVS event occurrence in 2026 |
| Derived Event Series ID | 970 | Cross-year identity for recurring VVS events |
| Derived Reference Event ID | 24970 | VVS event occurrence selected from 2024 |

The derived Event Series ID corresponds to the current helper field `PROSJEKT_ID`. It is derived from the source Event ID and is not supplied by a source system.

The derived Reference Event ID corresponds to the current helper field `PROSJEKT_DATA`. It combines a planner-selected reference year with the Event Series ID and allows a current event plan to retrieve comparable demand from a previous occurrence. Historical Visma snapshots must therefore remain available as evidence. A later planning capability may let the planner select historical demand from another occurrence in the same series until sufficient current-year demand exists. That selection is explicit and user-controlled; the first executable MVP must not automatically substitute historical demand, infer that current-year data is sufficient, or change Visma replacement coverage from the complete five-digit Project ID to the series.

The system must distinguish between:

- **Target Event ID:** the event occurrence being planned;
- **Event Series ID:** the derived cross-year relationship;
- **Reference Event ID:** an event occurrence used as a historical or planning basis;
- **Event Name Alias:** a source-specific name mapped to an Event ID.

Cross-source joins must use the stable canonical Event Occurrence after source-identity resolution, never event name alone. The source Event ID is the preferred business key where available. Venyoo names and other source labels are aliases bound to a specific annual occurrence, not directly to the recurring series. Manual alias mapping remains available when a source does not provide the Event ID or uses an unrecognized naming convention. Unmapped or ambiguous aliases generate a review state without being silently joined. A malformed Visma Project ID is retained for review and blocks affected publication; its year, series or occurrence identity must not be guessed.

Canonical event, location, competence and demand-scope identities must remain stable across source reimports. Source facts may receive new versions, but an import must not silently recreate or replace the canonical identities referenced by manual allocations, audit history or workspace views. A changed source-to-canonical identity mapping requires explicit review and must disclose affected manual planning records before adoption.

---

# 6. Booking Import

The booking system represents what has been sold or must be delivered.

Booking data should be imported into the Resource Planning Application through an import and mapping layer.

This section describes the target product's Phase A booking-conversion capability. The first executable MVP performs the governed core of that conversion in the browser: it stages a complete raw Visma snapshot, applies persistent approved Work Type, KPI, Nøkkelområde and Location/Hall mappings, preserves unresolved work for review, and publishes only after an explicit planner decision. Advanced composite rules, manual PH entry for unresolved work and multi-source demand-basis selection remain deferred.

Each accepted `utskrift_visma` file is complete for every unique source Project ID present in that export. It may cover one project or many. Publication replaces prior Visma-owned demand for exactly those projects; projects absent from the export remain unchanged. Venyoo does not expand this replacement boundary.

Excel file upload is the initial Visma integration method. The import boundary must remain channel-independent so a future Visma API connector can supply the same canonical source records without changing downstream identity, conversion, calculation or planning logic.

Conceptually:

	Booking System
		 ↓
	Export
		 ↓
	Import
	     ↓
	Mapping and Quantity Derivation
	     ↓
	Internal Work Model

A booking line or booking classification may generate one or more operational Work Requirements.

The imported booking line should remain an immutable representation of the source record. Operational interpretation should occur through versioned mapping rules rather than by overwriting source values.

Booking information may include:

- Event ID;
- order ID;
- stand or location identifier;
- customer or exhibitor identifier;
- article ID;
- description;
- raw quantity;
- product group;
- product type;
- relevant event information.

The source quantity may not include a reliable measurement unit. The application must therefore preserve the raw quantity separately from the operational quantity and unit used for labor calculation.

The application should not depend directly on the booking system's internal structure.

Changes to booking data should primarily be handled through the import and mapping layer.

The import uses an application-owned, versioned Source Export Profile rather than fixed column positions. Source files do not need to contain or declare a format or profile version. A Source Export Profile defines:

- expected header names and accepted aliases;
- header-row and data-row detection;
- required and optional fields;
- data-type and value validation;
- exclusion rules for titles, summaries and footers;
- the internally selected profile identifier and version recorded for each import.

The application detects compatible source structures from headers and other structural characteristics. Column order and additional irrelevant columns do not affect compatibility and do not create a new format. Missing, duplicated or unrecognized required structures place the import in a review state rather than silently shifting or guessing values. A new internal profile version is introduced only when a source change affects fields or structures used by the application; prior profile versions remain available for compatible older exports.

The current Visma export profile contains these canonical source fields:

| Canonical field | Current source header |
|---|---|
| Source Project ID | Prosjekt |
| Stand | Stand |
| Transaction location or note | Trans.opplysn. 1 |
| Customer | Navn |
| Organization source value | Avdeling |
| Source order ID | Ordrenr |
| Carrier or package reference | Bærer |
| Article ID | Art.nr |
| Description | Beskrivelse |
| Raw quantity | Totalt antall |
| Product group | Varegr |
| Product type | Produkttype 2 |
| Event name | Navn2 |

Legacy aliases may be supported through a separate profile or explicit alias rules, but legacy layouts must not be allowed to redefine the canonical model implicitly.

Operational raw Visma `Avdeling` values resolve through persistent source-specific mappings to canonical Organization. New or ambiguous values require review and may be mapped to a real Organization or explicit `Undetermined`. `Fakturamottaker` belongs to legacy converted-planner evidence and is not automatically equivalent to `Avdeling`.

---

# 7. Work Requirements

Imported booking lines, classifications and event-level aggregates generate Work Requirements through operational mapping rules.

A Work Requirement represents something that must physically or operationally be delivered.

Examples may include:

- carpet;
- roll flooring;
- wall systems;
- custom construction;
- banners;
- furniture delivery.

A Work Requirement should retain relevant source and derivation information, including:

- Event ID;
- source booking line or source aggregate references;
- Work Type;
- mapping rule and mapping-rule version;
- raw source quantity where applicable;
- quantity derivation rule;
- derived operational quantity;
- operational unit;
- location;
- competence;
- applicable event phase;
- productivity KPI and KPI version;
- calculated labor requirement;
- applicable planning constraints.

One source booking line may contribute to several Work Requirements only where an explicit composite rule declares separate additive work components. The existence of several KPI rows for one product type does not by itself mean that all rows should be applied.

Derived Work Requirements must remain traceable to the source records and rules that produced them. Recalculation should not erase the source data used for audit and explanation.

Work Requirements remain available internally even when the planner works with aggregated competence demand.

For the first executable MVP, the equivalent derivation is represented by traceable Work Type Amounts and assembly or dismantling Phase Work Items under Booking Demand Conversion and Review Contract v0.1. The planner operates on aggregated competence demand, but the underlying booking-line, mapping, amount, KPI and phase lineage remains inspectable. Successful parsing or calculation alone does not make source demand accepted; publication is an explicit planning decision with a recorded actor, time, import batch and source references.

---

# 8. Work Types

Each Work Requirement belongs to a standardized Work Type.

A Work Type has one stable application identity and one editable human-readable label. In the current mapping evidence, `forenklet type` supplies that label. The application must not ask the planner to maintain a second identical task label, KPI label or `Shared KPI definition` label.

Examples include:

	Carpet tiles anthracite/black
		→ Modular Flooring

	Expo velour black
		→ Roll Flooring

	Frame system MDF-board
		→ Carpentry

	Framework completed with white Wallboard
		→ FOGA

A Work Type may define or reference one or more candidate operational mapping rules. Each rule may define:

- quantity derivation rule;
- operational unit;
- productivity KPI by event phase;
- competence;
- default planning behavior;
- applicable dependencies;
- minimum crew requirements where relevant.

Work Types form the translation layer between booked products and operational resource requirements.

The initial mapping key may use the imported product type classification. Future mappings may require article, product group, description or another controlled source attribute. Mapping precedence and fallbacks must be explicit and testable.

## 8.1 Operational Mapping Rule

An Operational Mapping Rule translates matching booking data into one Work Requirement definition.

Conceptually:

	Source Match
	     +
	Operational Work Type
	     +
	Quantity Derivation Rule
	     +
	Operational Unit
	     +
	Competence
	     +
	Phase-Specific KPI
	         ↓
	Work Requirement

Several candidate rules may exist for the same product type because the useful operational quantity is not yet settled. A Conversion Profile should select one active measurement strategy by default.

Multiple rules should generate additive Work Requirements only when they belong to an explicit Composite Work Rule. Candidate alternatives must not be added together merely because they share a source product type.

Each rule should have a stable identifier, effective version and status so historical calculations can be reproduced.

The current mapping workbook uses `Produkttype 2` as the source match and `forenklet type` as the human-readable Work Type label. `Søkekriterie` is legacy evidence only. All source-facing fields should remain available in import diagnostics, but neither `Produkttype 2` nor `Søkekriterie` becomes the canonical Work Type identity implicitly.

The mapping result for each source record or aggregate should be classified as:

- matched, when the expected operational rules apply;
- unmatched, when no active rule applies;
- selected, when one candidate rule is chosen by the active Conversion Profile;
- additive, when an explicit Composite Work Rule intentionally creates separate Work Requirements;
- ambiguous, when several rules match without an explicit additive relationship.

Unmatched and ambiguous results require review and must not silently produce incomplete or duplicated labor demand.

## 8.2 Quantity Derivation Rules

The latest Visma export is authoritative for the current booking lines of every source Project ID it contains. Operational quantity is the signed sum of `Totalt antall` under this exact source grouping key:

	Prosjekt
	+ Work Anchor: Stand, or Trans.opplysn. 1 when Stand is empty
	+ Avdeling
	+ Art.nr

`Totalt antall` is the measure being summed and is never part of the grouping key. Positive and negative rows in the same group therefore reconcile before Work Type and phase PH calculation. Every source row remains separately inspectable as evidence.

A positive aggregate produces the current Work Type Amount. A zero aggregate is an authoritative cancellation for that group and publishes no active demand while retaining its evidence. A negative aggregate contradicts the expected snapshot invariant and remains visible for review; negative demand is never published.

The rule applies to every operational Work Type. There is no distinct-customer, distinct-order or other distinct-count exception. Familiar unit labels such as `ordre` may remain display vocabulary, but they do not replace signed `Totalt antall` aggregation.

## 8.3 Conversion Profile

A Conversion Profile selects how each imported product type is converted into an operational quantity before a productivity KPI is applied.

The authoritative demand transformation is:

    Booking Line Item
        -> Work Type Mapping
        -> Work Type Amount + Unit
        -> Phase-Specific KPI Mapping
        -> Calculated Assembly or Dismantling PH
        -> Nøkkelområde / Competence Route
        -> Competence/Skill Demand PH

`Work Type Amount` is the derived operational quantity before labor conversion. It must remain distinguishable from raw booking quantity and from calculated PH. The KPI Mapping uses the stable Work Type identity, selected unit and phase to select one compatible productivity rate; applying that rate calculates phase PH. Nøkkelområde then groups that calculated PH into the competence or skill demand used for planning.

The implementation must preserve each stage and its provenance even where a workbook row currently stores Work Type, unit, rate reference and Nøkkelområde together. A convenient combined editor must not collapse these into one unexplained fact.

This separation does not justify duplicate human-readable label fields. The Work Type label is entered once. A display such as `FOGA-vegger - lm` is derived from that label and the selected unit. Assembly and dismantling are separate rates, not separate copies of the label.

The current conversion layer contains one selected unit and one competence area for each product type. Examples include:

	20 [Møbler]        → stk
	23 [Print]         → ordre
	9 [Duk i ramme]    → stk
	12 [FOGA-dragere]  → lm

The selected unit determines the compatible KPI row. Quantity always comes from the authoritative signed `Totalt antall` aggregation in Section 8.2.

For example, selecting `lm` for FOGA dragere means that the `FOGA-dragere - lm` KPI is used and the alternative `stk` KPI is not included in the same calculation.

The canonical productivity-rate key is `Work Type identity × Unit × Phase`. Renaming the Work Type label preserves the stable identity and rate binding. Changing the unit changes the key and requires the compatible assembly and dismantling rates to be reviewed rather than inherited automatically.

A Conversion Profile should retain:

- stable identifier and version;
- effective period;
- source product type;
- selected operational unit;
- source aggregation-rule version;
- selected KPI reference;
- competence area;
- scope, such as global default or event-specific override;
- reason or comment where the selection represents planner judgment.

Manual selection is valid where no predictive KPI has yet been established. Such selections must remain visible, auditable and replaceable without changing imported source data.

## 8.4 Source Demand Status

An aggregate quantity of zero is authoritative evidence that the current grouped work amount is cancelled. A malformed or non-numeric source quantity is different: it remains unresolved and must not be converted to zero.

Each source line should therefore have a demand status, including at least:

- quantified;
- unresolved quantity;
- explicitly no work;
- excluded source row;
- requires review.

Unresolved quantity should generate a visible warning and an incomplete-demand state. It should not silently reduce event demand to zero.

Source presence, PH calculation, canonical routing and planner disposition are independent. Every retained booking line is possible work by default. Only an approved `Not applicable` rule or an explicit planner exclusion with a reason may remove it from active-work publication accounting.

An unknown Event/Project, Location/Hall, Organization or Nøkkelområde must not change known calculated PH to zero. The item remains in review until the planner selects a real canonical target or deliberately selects the permitted publishable placeholder: Event/Project `Undetermined`, Location `Undetermined`, Organization `Undetermined`, or competence `Unresolved`. Placeholder-routed work retains its exact PH and an open review Issue. A `0 PH` placeholder is used only when PH itself cannot be calculated.

Negative quantities are preserved and summed with positive quantities inside the exact Section 8.2 key. They have no separate customer-anchor or distinct-count treatment.

---

# 9. Productivity KPIs

Productivity KPIs describe expected output per person-hour.

For example:

	Work quantity:       500 units
	Productivity:        25 units / person-hour

	Required labor:
	500 / 25 = 20 person-hours

Person-hours are the canonical labor unit used by the calculation model.

KPIs are currently maintained externally and manually audited.

The initial application should therefore treat KPI maintenance as controlled reference data rather than attempting to automatically modify KPIs based on completed work.

Different Work Types may have different productivity values.

For example, different wall systems may have different expected output per person-hour.

KPIs may also differ by Work-Demand Phase. The canonical values are:

- Assembly, sourced from labels such as `Montering` or mounting;
- Dismantling, sourced from labels such as `Demontering` or dismantle.

For each generated Work Requirement and phase:

	Required Person-Hours = Derived Operational Quantity / Productivity KPI

A KPI value of zero and a missing KPI value are distinct source conditions, but neither independently proves that the phase requires no work:

- zero means a rate was supplied but cannot be used as a positive productivity divisor and requires explicit review;
- missing means no rate was supplied and requires data correction or planner review;
- `Not applicable` is a separate approved phase outcome and is the only one of these states that establishes no calculated phase demand.

The application must preserve the exact condition and must not silently convert zero or missing rates into no work.

Future versions may provide analytical support for reviewing KPI accuracy.

Automatic KPI learning is not currently required.

---

# 10. Required Person-Hours

Required Person-Hours represent the calculated labor necessary to perform work.

They belong to the demand side of the system.

They should not depend on:

- workforce availability;
- personnel assignment;
- scheduling decisions;
- current staffing shortages.

For example:

	Required work: 80 person-hours

remains:

	Required work: 80 person-hours

regardless of whether the organization currently has enough workers to perform those hours.

This establishes the principle:

> Demand exists independently of capacity.

---

# 11. Competence Model

Each generated Work Requirement maps to a competence through its Operational Mapping Rule.

For the first executable MVP, `Nøkkelområde` is the flat planning grouping under which required person-hours are aggregated. It has no levels, subskills or worker-qualification semantics. `Unresolved` is an explicit flat Nøkkelområde for flagged work whose real route is not yet known.

Later personnel capabilities may define worker skills, overlapping skills and levels and may map one worker to several Nøkkelområder. Those capabilities do not change the first-MVP demand grouping.

Examples include:

- Modular Flooring;
- Roll Flooring;
- FOGA;
- Carpentry;
- Banner Installation;
- Furniture Delivery.

Multiple Work Types and Work Requirements may map to the same competence.

For example:

	Work Requirement A ─┐
	Work Requirement B ─┼──► Roll Flooring
	Work Requirement C ─┘

The planning interface should primarily operate on aggregated competence demand rather than individual Work Requirements.

This establishes a core product principle:

> **Plan competencies before people.**

---

# 12. Demand Transformation

The application should maintain a clear distinction between different forms of demand.

## 12.1 Commercial Demand

What has been booked or sold.

## 12.2 Work Demand

What must physically or operationally be delivered.

Work Demand includes both source quantities and derived operational quantities. These must remain distinguishable.

## 12.3 Labor Demand

How many person-hours are calculated to perform that work.

## 12.4 Eligible Labor Demand

How many of those person-hours are currently eligible to be scheduled given planning constraints.

## 12.5 Competence Demand

Required person-hours grouped by one flat first-MVP Nøkkelområde.

## 12.6 Scheduled Demand

Competence demand allocated to specific dates.

Scheduled Demand is a target scheduling term. In the first executable MVP, the canonical dated fact is Daily Allocated PH.

## 12.7 Personnel Demand

The workers required to satisfy the scheduled demand.

These concepts should remain distinguishable even where the user interface presents them together.

## 12.8 Phase Vocabularies

Booking-derived Work Demand has exactly two canonical phases: `Assembly` and `Dismantling`. They own independent productivity rates and PH. Source `Montering` is an alias for `Assembly`; source `Demontering` or `Dismantle` is an alias for `Dismantling`.

The Venyoo venue ledger has five canonical calendar phases: `Assembly`, `Moving in`, `Event`, `Moving out` and `Dismantling`. These describe dated venue context. They do not create additional booking-demand phases and do not relabel demand when manual allocation occurs during a different venue phase.

---

# 13. Planning Constraints

A Work Requirement may inherit or receive constraints from several sources.

Conceptually:

	Work Requirement
		   │
		   ├── Work Type Defaults
		   │
		   ├── Dependency Rules
		   │
		   ├── Location / Access Rules
		   │
		   └── Event-Specific Constraints
						│
						▼
				  Planning Window
						│
						▼
				Planning Eligibility

Planning constraints determine when work may or should occur.

They do not directly determine which person performs the work.

---

# 14. Work Type Defaults

Some planning behavior can be derived from the Work Type itself.

Examples may include:

- typical event phase;
- competence requirement;
- normal predecessor work;
- expected ordering;
- minimum useful crew requirement.

Defaults should reduce repetitive planner input while remaining overridable where appropriate.

---

# 15. Location and Access

Booking items may contain location identifiers.

Locations can have different availability and access windows.

For example:

	Hall A
	Available from Monday

	Hall B
	Available from Tuesday

Work associated with Hall B must therefore not become eligible before Tuesday even if the event itself begins earlier.

Location should be treated as an underlying planning dimension.

The accepted Venyoo `location_format` export is the dated venue ledger. Its declared date range and rows identify which projects occupy which locations on which dates and expose venue phases where available. It does not create booking demand or determine which projects a Visma publication replaces.

For a mapped Visma project, Venyoo supplies the eligible real Location/Hall choices. A booking-line location can map only to a location associated with that project in the active ledger, or the planner can explicitly select `Undetermined`. Missing venue context creates routing review; it never hides or zeros possible work.

The primary workspace must include an event-location calendar with locations represented as rows and venue phases represented across the shared date axis. This layer provides direct visibility of location occupancy, availability, handovers and possible conflicts.

Location also influences the amount of competence demand that becomes eligible on each date. Its role as a constraint does not replace its role as visible planning context.

The resource-planning rows must remain synchronized to the same date axis so the planner can interpret allocations against venue phases without manually reading and comparing dates.

---

# 16. Work Dependencies

Some work depends on progress in other work.

A typical high-level construction sequence may resemble:

	Flooring
		↓
	Booth Construction / Partition Walls
		↓
	Custom Construction / Carpentry
		↓
	Banner Installation
		↓
	Furniture Delivery

These relationships represent production flow rather than strict traditional finish-to-start dependencies.

For example:

	Flooring 100% complete
		↓
	Start all wall construction

is generally too restrictive.

Instead, sufficient flooring may be completed to allow wall construction to begin while flooring continues elsewhere.

The system should therefore support progressive overlap between dependent work.

---

# 17. Dependency Principle

Dependencies exist primarily between underlying work rather than between the aggregated rows displayed in a particular workspace projection.

The planning engine should use these relationships to determine how much downstream work can reasonably become eligible.

The system should not require the planner to manually allocate hours against individual Work Requirements.

Instead:

> Dependencies influence eligibility; the planner interacts with competence demand.

Detailed mathematical modeling of progressive dependencies is outside the scope of PRD v0.8.

---

# 18. Planning Eligibility

Planning Eligibility represents the amount of calculated work that may reasonably be scheduled on a given date.

Eligibility can be affected by:

- location access;
- event dates;
- Work Type rules;
- dependencies;
- predecessor progress;
- deadlines;
- event-specific constraints.

Example:

	Roll Flooring total demand: 40 h

	Monday:
	Eligible: 28 h

	Tuesday:
	Remaining 12 h becomes eligible

The system should prevent or warn against schedules that allocate more work than is currently eligible, depending on the nature of the constraint.

The system does not need to identify which exact booking lines are consumed by each allocation.

---

# 19. Constraint Classification

Not all planning rules should be treated equally.

The system should distinguish between at least three broad classes.

## 19.1 Hard Constraints

Conditions that should normally not be violated.

Example:

	Hall B is unavailable until Tuesday.

Work physically located in Hall B should not be scheduled Monday.

## 19.2 Operational Requirements

Conditions necessary for certain work to function correctly.

Example:

	A particular task requires a minimum crew of two people.

The schedule generator should not generate an allocation below the required minimum.

## 19.3 Planning Preferences

Rules describing preferred or efficient ways of working.

Examples:

- flooring should generally progress before wall construction;
- wall construction should generally progress before custom carpentry;
- unnecessary competence idle time should be avoided;
- excessive fragmentation of work should be avoided.

Planning preferences should guide automatic schedule generation but should generally remain overridable.

---

# 20. Manual Override

Experienced planners must retain control over generated schedules.

The system should therefore allow manual edits.

Where a manual edit violates a planning preference or soft rule, the application should generally:

1. show a warning;
2. explain the relevant rule where possible;
3. allow the planner to continue.

Hard physical constraints may require stronger handling.

The goal is to support planner judgment rather than prevent it.

The system should preserve the generated proposal when an override is made and record, at minimum:

- the affected event, competence, phase and dates;
- the value before and after the override;
- the planner and timestamp;
- an optional or required reason according to override severity;
- warnings or constraints accepted by the planner.

A schedule override changes allocation, not calculated demand. A planner who intentionally changes labor demand should do so through a separately identified Demand Adjustment with provenance, rather than by silently changing the generated hours.

---

# 21. Continuous Planning Workspace

The primary planning interface is a continuously scrollable, date-aligned workspace based on the broad interaction model of the current `Kalender` sheet. It is not a separate Gantt that replaces the current view.

The workspace contains synchronized visual layers:

1. **Event-location calendar:** locations as rows, with event phases and occupancy rendered across dates.
2. **Resource-planning calendar:** undated Accepted Demand PH, dated Allocated PH and relevant planning measures rendered in one planning context.
3. **Permanent-capacity context:** date-aligned Total Daily Allocated PH, pooled Permanent Capacity PH, Permanent Capacity Delta and Additional PH Required while planning.

These layers form one vertically split resource-allocation planning workspace. The upper pane is the **Project/Location Calendar**, showing projects or events, Locations/Halls, occupancy and phases. The lower pane is the **Resource Allocation Matrix**, where the planner reviews demand and edits dated resource allocations. Capacity and variance remain shared context associated with the allocation matrix rather than a third independent plan.

The upper calendar is the operational context for allocation decisions in the lower matrix. Both must be available within the same primary workspace; they must not be implemented as unrelated pages or independent calendars that force the planner to compare dates mentally. On narrow screens they may stack vertically, but the Project/Location Calendar remains conceptually above the Resource Allocation Matrix and both retain one synchronized date state.

All layers share the same date scale, selected period, horizontal scroll position and calendar semantics. A date column in the upper Project/Location Calendar aligns with the same date column in the lower Resource Allocation Matrix. Identifying columns remain visible while the date viewport moves.

Gantt capabilities enhance the workspace by allowing the planner to:

- expand and collapse events and their related work;
- view work and phase spans without losing the daily grid;
- display dependency relationships and dependency warnings;
- inspect planned intervals, milestones and conflicts;
- move between summary and detailed rows while preserving date alignment.

The Y-axis is a configurable row projection rather than one fixed hierarchy. The planner can filter, group and order data using governed dimensions. Supported examples include:

- Event -> Competence;
- Event -> Location -> Competence;
- Event -> Organization -> Competence;
- Event -> Phase -> Competence;
- Competence -> Event;
- Location -> Event.

The canonical planning dimension is Organization. Operational raw Visma uses `Avdeling` as its source field and resolves each normalized value through a persistent source-specific mapping. `Fakturamottaker` remains a separate field in legacy converted-planner evidence and is not merged with `Avdeling` automatically. Both retain original source provenance. Organization is a grouping and routing dimension; it is not Nøkkelområde/competence and does not divide shared capacity.

Changing the grouping changes how the same canonical planning data is presented. It must not duplicate, transform or silently reallocate the underlying demand.

Example:

| Event | Competence | Mon | Tue | Wed | Thu |
|---|---|---:|---:|---:|---:|
| Event A | Roll Flooring | 3 Display FTE | 2 Display FTE | — | — |
| Event A | FOGA | 1 Display FTE | 4 Display FTE | 5 Display FTE | 2 Display FTE |
| Event A | Carpentry | — | — | 2 Display FTE | 3 Display FTE |
| Event B | Roll Flooring | — | 2 Display FTE | 2 Display FTE | — |

The planner should interact primarily with competence allocations while retaining direct visual context from event occupancy, locations, phases and the selected grouping hierarchy.

Underlying Work Requirements and constraints support the schedule without requiring task-level micromanagement.

Daily cells remain the precise allocation surface. Summary spans, grouped totals and dependency lines are enhancements over those cells, not a second authoritative schedule.

Permanent capacity is shared pooled context. Event, Organization, Location, Work Type and competence branches must not receive copied or proportionally distributed capacity. It is shown once by date outside those branches and compared only with complete Total Daily Allocated PH. The visible comparison is labelled `Allocation vs permanent capacity` and uses `Permanent capacity delta` and `Additional PH required`.

The workspace discloses whether visible planning data is workbook-sourced, manually entered or derived, together with its review or approval state. Permanent capacity exposes the crew settings, generated Norwegian calendar rule and any manual date override used.

Imports must not silently delete or rewrite manual allocations. When accepted demand changes, affected allocations remain visible and issues identify unresolved demand scope or allocation above the newly accepted total until the planner reconciles the change.

---

# 22. FTE Representation

Person-hours are the canonical calculation, allocation and capacity unit.

FTE is a display conversion, not worker count and not an authoritative stored planning quantity.

Conceptually:

	Person-Hours
		 ↓
	Daily Working Hours
		 ↓
	FTE

The first executable MVP carries a versioned `displayHoursPerFteDay` workspace setting. The approved demonstration uses 7.5 hours:

	15 person-hours = 2.0 FTE
	18.75 person-hours = 2.5 FTE

Decimal FTE values must therefore be supported.

The display should be labelled `Display FTE` or `FTE-day equivalent` and disclose the PH-per-day value. Exact PH is summed before conversion, then Display FTE is rounded to one decimal using deterministic half-up rounding. Rounded daily FTE must never be summed or written back as authoritative data.

---

# 23. Allocation

Calculation and allocation must remain separate.

Calculation answers:

> How much labor is required?

Allocation answers:

> When should that labor occur?

For example:

	Required Carpentry:
	80 person-hours

may be allocated as:

	Monday       16 h
	Tuesday      24 h
	Wednesday    24 h
	Thursday     16 h

or another valid distribution.

Changing the allocation does not change the calculated demand.

For the first executable MVP:

- **Accepted Demand PH** is the explicitly adopted, undated total at one Demand Scope;
- **Daily Allocated PH** is the canonical amount manually assigned to one date;
- **Visible Allocated PH** is the allocation inside the displayed or selected dates;
- **Total Allocated PH** is the allocation across all active dates for the Demand Scope.

Unallocated and overallocated demand are reconciled against Total Allocated PH, not the current date viewport. Manual allocation may exceed Accepted Demand PH. The application must preserve the allocation, show zero Unallocated PH, report the excess as Overallocated PH and keep the Demand Scope visibly unresolved until its Issue is resolved or waived.

For one compatible active Demand Scope `s`:

	Total Allocated PH(s) = sum of active allocations across all dates resolving to s
	Raw Demand Balance PH(s) = Accepted Demand PH(s) - Total Allocated PH(s)
	Unallocated PH(s) = max(0, Raw Demand Balance PH(s))
	Overallocated PH(s) = max(0, -Raw Demand Balance PH(s))

The conservation invariant is:

	Accepted Demand PH + Overallocated PH
	= Total Allocated PH + Unallocated PH

The date viewport changes Visible Allocated PH, not Accepted Demand PH, Total Allocated PH, Unallocated PH or Overallocated PH.

An allocation that no longer resolves to active Accepted Demand remains stored, visible, editable and flagged. It is excluded from active-demand reconciliation but its dated PH still consumes pooled permanent capacity. Reimport or reconciliation must never silently delete, zero or detach it.

---

# 24. Competence Sharing Across Events

Available competence capacity is shared across multiple events on the same date.

For example:

	Available Carpentry Capacity:
	8 FTE

	Event A: 5 FTE
	Event B: 2 FTE
	Event C: 1 FTE

	Total:   8 FTE

The system should therefore aggregate Allocated PH across the complete included event portfolio before comparing it with shared capacity. Grouping by Event or Organization must not duplicate capacity or assign a hidden share to any branch.

Demand and allocation may be filtered by Event, Planning Competence Area, Organization, Work-Demand Phase, location, Demand Scope and applicable dates. Venyoo context may be filtered by Venue Phase. Capacity may be constrained only by dimensions present in its declared scope: date, Planning Competence Area, and capacity provenance or status. Grouping alone does not filter facts.

Permanent capacity has date-only pooled scope. It is compared with complete Total Daily Allocated PH across all competences and is never distributed downward across Events, Organizations, Locations, Work Types or competences. Filtered and grouped allocation subtotals remain visible but do not receive a proportional capacity comparison. Capacity-period totals remain invariant when grouping changes.

---

# 25. Crew Size

Some work requires a minimum useful crew size.

For example:

	Minimum crew: 2 people

Crew requirements are not assumed to apply universally.

Maximum crew sizes and efficiency limits may also exist, but they should not initially be modeled as rigid global rules.

Crew-size information should be capable of informing schedule generation and warnings where relevant.

---

# 26. Capacity Planning

The target product should eventually compare scheduled competence demand with skill-aware workforce capacity. The first executable MVP performs a simpler operational comparison between complete Total Daily Allocated PH and one pooled permanent crew.

For example:

	Tuesday — all allocated work

		Permanent crew:       17
		Hours per workday:    7.5
		Permanent capacity: 127.5 PH
		Daily allocated:    136.0 PH
		Capacity delta:      -8.5 PH
		Additional required:  8.5 PH

The negative delta is an operational warning that the pooled permanent crew does not cover the current daily allocation. It does not identify which skills are short, create hired-help or overtime capacity, prove worker-level feasibility, enforce a Phase C constraint or calculate scheduler-derived Residual Additional Resource Need.

For one date `d`:

	Permanent Capacity PH(d) = Workday(d) ? Permanent Crew Count × Hours per Workday : 0
	Permanent Capacity Delta PH(d) = Permanent Capacity PH(d) - Total Daily Allocated PH(d)
	Additional PH Required(d) = max(0, -Permanent Capacity Delta PH(d))

A negative delta creates a warning for that date. Period reporting must preserve the dates requiring resolution rather than hiding them through netting against positive-capacity dates.

---

# 27. Abstract Capacity

Before personnel booking, capacity is represented as one pooled permanent crew.

For example:

	17 permanent crew
	× 7.5 available hours
	= 127.5 person-hours capacity

on each workday.

The application stores the crew count and hours-per-workday settings. Saturdays, Sundays and Norwegian national public holidays are generated as non-workdays using Europe/Oslo dates and therefore have `0 PH` permanent capacity. The planner may make an audited manual override for a closure or exceptional workday.

This pooled capacity makes no claim that workers with a required competence are available. Allocation remains permitted on weekends, holidays and other zero-capacity dates; any positive allocation creates an Additional PH Required warning for later resolution through changed allocation, overtime or hired help.

---

# 28. Multi-Competence Personnel

A person may possess multiple competencies.

For example:

	Worker A
	  ├── FOGA
	  ├── Carpentry
	  └── Furniture Delivery

The same available working hours must not be counted simultaneously as full capacity in every competence.

The capacity model must therefore eventually account for shared personnel pools and overlapping competence capability.

This becomes particularly important during schedule generation and personnel booking.

---

# 29. Personnel Booking

Personnel Booking is a separate layer following resource planning.

Resource Planning answers:

> What competence is required, how much is required, and when?

Personnel Booking answers:

> Which people will satisfy that demand?

The personnel module may eventually include:

- employees;
- temporary personnel;
- availability;
- working hours;
- competencies;
- competence levels;
- absence;
- existing assignments.

Detailed personnel modeling remains outside the scope of v0.8.

---

# 30. Target Product Automatic Schedule Generation

Automatic schedule generation is a core long-term capability of the product.

It is not part of first executable MVP acceptance. It remains the intended target product workflow and is introduced in roadmap Phase E.

It is also the intended default planning workflow. The completed application should not require the planner to recreate every daily allocation from an empty resource grid.

The planning engine should be capable of generating an initial proposed allocation of competence demand across available dates.

Conceptually:

	Work Requirements
		  +
	Planning Constraints
		  +
	Planning Eligibility
		  +
	Competence Demand
		  +
	Available Capacity
		  +
	Planning Preferences
			  ↓
		Planning Engine
			  ↓
	 Proposed Resource Allocation

The generated schedule should represent a useful starting point for the planner.

It is not expected to remove the need for human review.

As the domain model matures, the principal manual planning inputs should be dependencies and exceptional operational knowledge that cannot yet be inferred. Known dates, location availability, quantities, KPIs, competencies, working-time rules and capacity should feed schedule generation automatically.

---

# 31. Schedule Generation Goals

The schedule generator should attempt to create a plan that:

- schedules required work within valid planning windows;
- respects hard constraints;
- respects minimum crew requirements where applicable;
- follows dependency relationships;
- allows sensible overlap between dependent work;
- considers competence availability;
- considers available time;
- distributes work across events;
- avoids unnecessary idle competence where possible;
- respects deadlines;
- follows preferred construction sequence where practical;
- exposes resource shortages;
- avoids scheduling more work than is currently eligible.

The precise optimization strategy is intentionally undefined in PRD v0.8.

---

# 32. Target Product Autocomplete Workflow

The intended planning workflow should eventually support:

	Import Event
		 ↓
	Calculate Work
		 ↓
	Calculate Person-Hours
		 ↓
	Determine Constraints
		 ↓
	Determine Eligibility
		 ↓
	Aggregate Competence Demand
		 ↓
	Generate Proposed Schedule
		 ↓
		Display in Continuous Planning Workspace
		 ↓
	Planner Reviews
		 ↓
	Manual Adjustments
		 ↓
	Warnings / Overrides
		 ↓
	Final Resource Plan

This workflow represents the target product experience. The first executable MVP workflow ends with manual daily allocation, visual review and audited persistence in the continuous planning workspace.

---

# 33. Explainability

Where practical, automatically generated planning decisions should be explainable.

For example, a planner should be able to understand why the system:

- delayed work until Tuesday;
- allocated fewer FTEs than expected;
- identified a shortage;
- started one competence before another;
- generated a warning.

Possible explanations could include:

	Hall B unavailable until Tuesday.

	Only 24 person-hours of Roll Flooring
	are eligible Monday.

	Carpentry requires predecessor work
	to progress further.

	Available FOGA capacity is fully allocated
	to another event.

Explainability is particularly important because the system is intended to support experienced human planners.

---

# 34. Historical Work Database

The application should preserve historical planning information.

Historical data should eventually support comparison between:

	Work Quantity
		 ↓
	Calculated Person-Hours
		 ↓
	Planned Person-Hours
		 ↓
	Personnel Assignment
		 ↓
	Actual Person-Hours

Historical records should remain associated with:

- Event ID;
- year;
- Work Type;
- competence;
- location where relevant;
- KPI version where relevant.

---

# 35. Actual Hours — Future Module

No current system exists for collecting actual hours at the required level.

Actual-hours registration should therefore be treated as a separate future module.

The initial resource planning system should not depend on actual-hours functionality.

Future implementation may allow:

- time registration;
- event attribution;
- competence attribution;
- planned-versus-actual analysis;
- productivity analysis;
- KPI auditing.

Automatic KPI adjustment based on actual work is not currently required.

---

# 36. Planning Maturity

The product can evolve through increasing levels of planning capability.

## Level 1 — Calculation

Convert booking data into person-hour and competence demand.

## Level 2 — Visualization

Display event-location occupancy, venue phases and competence demand on one continuous date axis.

## Level 3 — Manual Allocation

Allow planners to distribute competence demand across dates, expand and collapse row hierarchies, and use query-like filtering and grouping without changing canonical demand.

## Level 4 — Constraint Awareness

Identify eligibility, conflicts, shortages and rule violations.

## Level 5 — Automatic Schedule Generation

Generate an initial proposed resource allocation in the continuous planning workspace.

## Level 6 — Assisted Optimization

Improve schedules according to capacity, dependencies and planning preferences.

## Level 7 — Personnel Assignment

Match actual personnel to the resulting competence requirements.

These levels describe capability maturity rather than a fixed development roadmap.

The first executable MVP covers Levels 1 through 3:

- staged raw Visma import, persistent mapping and KPI reuse, traceable Work Type Amount and phase-PH calculation, unresolved-work review and explicit competence-demand publication;
- visualization in the continuous event-location and resource-planning workspace;
- authoritative manual daily allocation.

It also includes limited Level 4 context: visible occupancy overlap, dependency indicators, and operational pooled permanent-capacity warnings against complete Total Daily Allocated PH. This context does not imply skill eligibility, conflict classification, dependency enforcement, individual absence, overtime or hired-help modeling, worker-level feasibility or another Phase C constraint engine.

Levels 5 through 7 remain target product capabilities for later phases.

---

# 37. High-Level System Model

	┌─────────────────────────┐
	│     Booking System      │
	└────────────┬────────────┘
				 │
				 ▼
	┌─────────────────────────┐
	│ Import, Map & Derive    │
	└────────────┬────────────┘
				 │
				 ▼
	┌─────────────────────────┐
	│    Work Requirements    │
	└────────────┬────────────┘
				 │
				 ▼
	┌─────────────────────────┐
	│ Productivity / KPI Calc │
	└────────────┬────────────┘
				 │
				 ▼
	┌─────────────────────────┐
	│ Required Person-Hours   │
	└────────────┬────────────┘
				 │
				 ▼
	┌─────────────────────────┐
	│  Planning Constraints   │
	│                         │
	│ • Work Type defaults    │
	│ • Dependencies          │
	│ • Location / access     │
	│ • Event constraints     │
	└────────────┬────────────┘
				 │
				 ▼
	┌─────────────────────────┐
	│  Planning Eligibility   │
	└────────────┬────────────┘
				 │
				 ▼
	┌─────────────────────────┐
	│    Competence Demand    │
	└────────────┬────────────┘
				 │
				 ▼
	┌─────────────────────────┐
	│    Planning Engine      │
	└────────────┬────────────┘
				 │
				 ▼
		┌───────────────────────────────┐
		│ Proposed Resource Allocation  │
		└───────────────┬───────────────┘
				 │
				 ▼
		┌───────────────────────────────┐
		│ Continuous Planning Workspace │
		│ Venue + resources + capacity  │
		└───────────────┬───────────────┘
			   ┌───────┴───────┐
			   ▼               ▼
			Accept          Manual Edit
					   │
					   ▼
				Warnings / Override
					   │
					   ▼
	┌─────────────────────────┐
	│   Final Resource Plan   │
	└────────────┬────────────┘
				 │
				 ▼
		┌─────────────────────────┐
		│   Personnel Booking     │
	└─────────────────────────┘

---

# 38. Core Product Principles

## 38.1 Plan Competencies Before People

Determine required capabilities before assigning individuals.

## 38.2 Person-Hours Are Canonical

Person-hours represent underlying labor demand.

FTE is primarily a planning and visualization representation.

## 38.3 Demand Exists Independently of Capacity

Staffing shortages must not change calculated workload.

## 38.4 Calculation and Scheduling Are Separate

Calculation determines how much labor is required.

Scheduling determines when that labor should occur.

## 38.5 Tasks Inform Planning Without Becoming the Planning Interface

Underlying Work Requirements provide calculation and constraint information.

The planner primarily interacts with competence demand.

## 38.6 Eligibility Before Allocation

The system should understand how much work is eligible before attempting to schedule it.

## 38.7 Dependencies Permit Progressive Work

Dependencies should represent realistic production flow rather than assume every predecessor must reach 100% completion.

## 38.8 Location Is a Planning Input

Location and access determine when work becomes eligible and are also a primary visual dimension in the event-location layer of the planning workspace.

## 38.9 Automation Produces a Proposal

Automatic planning should generate a starting schedule rather than an irreversible decision.

## 38.10 Preserve Human Control

Experienced planners must be able to modify generated schedules.

## 38.11 Warn Before Blocking

Inefficient or unusual plans should generally generate warnings rather than hard blocks.

Physical impossibilities and genuine hard constraints may require stronger enforcement.

## 38.12 Avoid Needless Granularity

The application should model only the detail necessary to make useful resource-planning decisions.

It should not become a task execution or production-management system by accident.

## 38.13 Explain Automated Decisions

Where practical, generated schedules and warnings should be traceable to their underlying constraints or planning rules.

## 38.14 Preserve Source and Derivation Separately

Imported booking records remain source truth. Operational quantities, units and labor requirements are derived data with traceable rules and versions.

For the first executable MVP, versioned raw booking facts and persistent mapping, KPI and Venyoo configuration remain distinct from stable canonical identities and from the explicit decision to publish calculated or flagged demand. Reimport may supersede source facts, but canonical identity changes and accepted-demand changes require review and must not erase the planning history that depended on earlier versions.

## 38.15 One Booking Category May Create Multiple Work Requirements

The mapping model may support several candidate measurement strategies for one booking category. Exactly one strategy is active by default.

Several additive Work Requirements should be created only through an explicit Composite Work Rule, without duplicating the source booking line.

## 38.16 Warn Without Discarding Demand

Missing customer anchors, internal identity fallbacks, unresolved routing and unresolved quantities should remain visible without preventing all other valid demand from being calculated. Every source line is possible work unless an approved rule or explicit planner decision excludes it. Known PH must survive routing uncertainty; only genuinely unknown PH uses an explicitly labelled `0 PH` placeholder.

## 38.17 Event ID Drives Canonical Event Resolution

Event names are aliases. The source Event ID is the preferred authoritative business key and must resolve to a stable canonical Event Occurrence. Sources without that ID require an explicit reviewed alias binding.

## 38.18 Historical Reference Is Explicit

In a future dedicated Demand Management workspace, a current event may use a previous occurrence from the same Event Series as a demand basis. This capability is not part of the first executable MVP planning workspace. Every occurrence in the accepted Venyoo ledger is introduced into the planning horizon and triggers discovery of available Visma demand candidates; Venyoo does not create or select that demand. The demand ledger is searched first for candidates belonging to the target occurrence and may also expose retained candidates from earlier occurrences in the same Project Series. Selection is independent for each `Target Event Occurrence × Work Type × Phase`, so current-year Assembly, current-year Dismantling and their historical alternatives can transition separately as current evidence becomes usable. Each selection has exactly one effective basis; current and historical PH are not silently added together. Every candidate and selected result must visibly identify its source occurrence and source year. When several recorded years are available, the planner can select among them.

An occurrence for which discovery finds no current or historical demand remains visible as `No demand recorded - review required`. This state means only that no demand evidence was found; it is not confirmation that the event requires no work. The planner may later attach or select demand, or explicitly confirm `No demand to plan` with a reason. That confirmation may remove the occurrence from the active work-demand list, but it must not remove it from the Venyoo location calendar, source ledger, history or audit trail. If a later Visma snapshot introduces a demand candidate for that occurrence, the application reopens the occurrence for review and makes it visible in the work-demand list again. The prior confirmation and reason remain historical evidence; the new candidate is neither selected nor published automatically. The target event, selected basis, reference event and reason for using the reference must remain distinct and traceable.

Before a basis has been selected, the application may suggest current-year demand when available and otherwise the most recent recorded occurrence in the same Project Series. A suggestion contributes no PH until the planner approves it. Once selected, a Demand Basis is sticky: a later import never changes it and does not repeatedly recommend a newer year. New or materially changed current-year demand creates one non-blocking availability notice and becomes available for comparison. Acknowledging that notice suppresses it until the corresponding candidate version changes materially. The planner can compare PH and staffing pressure between candidate years without changing the selected basis.

Seven calendar days before the Venyoo start date of Assembly or Dismantling, the application checks whether any Work Type in that work-demand phase still uses historical demand. It creates one persistent project-phase readiness warning summarizing the affected Work Types, rather than one prompt per row. The warning offers comparison, selective switching, or explicit `Keep historical` confirmation with a reason. If current-year demand is unavailable, the warning states that fact instead of proposing a switch. `Keep historical` resolves the current warning until the corresponding current-year candidate changes materially, at which point review reopens. The application never switches the basis automatically or infers demand maturity from recency, sales budget, PH totals or proximity to the event. A missing Venyoo phase start remains an explicit data Issue because no readiness date can be derived safely.

## 38.19 Automate Derivable Planning Work

Imported demand, known constraints, eligibility, capacity and scheduling rules should produce an automatic proposal. Manual effort should concentrate on dependencies, unresolved operational knowledge and review.

## 38.20 Improve Beyond the Spreadsheet

The application should preserve useful domain behavior without copying Excel-specific structures or limitations. Helper columns, manual joins, copied formulas and a fixed two-year grid as the data model are implementation artifacts.

The continuous horizontal calendar, synchronized venue and resource layers, and visual alignment of dates are required product concepts. They should be implemented with a flexible date horizon and scalable rendering rather than recreated as a literal spreadsheet.

## 38.21 Import Channels Are Replaceable

Excel upload and a future Visma API are alternative source adapters. Downstream canonical data and planning behavior should not depend on which adapter supplied the records.

Adapters stage data and issues for review; they do not write directly into the active workspace. Publication is an explicit adoption action. Current adapter roles are persistent Venyoo venue context, raw Visma booking snapshots, mapping and KPI reference data, reviewed derived demand, optional adopted allocations and read-only dependency context. Pooled permanent capacity is maintained directly in the application.

## 38.22 One Canonical Plan, Many Projections

Filtering, grouping, hierarchy and aggregation are projections of the same canonical event, demand, allocation and capacity data. A view may reorganize rows for a planning question, but it must not create a separate plan or change source meaning implicitly.

---

# 39. Major Product Domains

The current product vision contains:

1. Event Occurrences
2. Event Identity Registry
3. Event Series and Historical References
4. Source Connectors and Booking Import
5. Booking Mapping
6. Conversion Profiles
7. Quantity Derivation
8. Source Demand Status
9. Locations and Availability
10. Work Types
11. Operational Mapping Rules
12. Work Requirements
13. Productivity KPIs
14. Competencies
15. Labor Calculation
16. Demand Basis and Adjustments
17. Planning Constraints
18. Dependencies
19. Planning Eligibility
20. Resource Planning
21. Continuous Planning Workspace
22. Capacity Planning
23. Schedule Generation
24. Manual Overrides
25. Personnel
26. Personnel Booking
27. Historical Analysis
28. Actual Hours
29. Planning Views, Filters and Grouping

These represent logical product domains rather than implementation order.

---

# 40. Preliminary Development Phases

## 40.1 First Executable MVP Boundary

The first executable MVP is the browser-local continuous planning workspace. It implements Planning Maturity Levels 1 through 3 plus limited Level 4 context: read-only occupancy/dependency indicators and an editable pooled permanent-capacity calendar with derived warnings.

Its allocation workflow is manual and authoritative. It does not require generated allocation states, functional Planning Locks, scheduler-derived Residual Additional Resource Need, scheduling writeback, real personnel records, named-worker assignment or production worker-level feasibility.

The first executable MVP performs governed browser-local Phase A conversion under Booking Demand Conversion and Review Contract v0.1. The active Venyoo Location Format dataset supplies persistent venue, project, Location/Hall and phase context. A complete raw `utskrift_visma` snapshot is converted through persistent approved mappings and KPI definitions, reviewed, and explicitly published. `Tabell_oppgaver` remains legacy converted-planner evidence and compatibility input; it is not the required operational demand source. `Kalender` remains primarily a derived presentation; its allocation data may seed a reviewed baseline, while its capacity ranges remain unverified.

The first executable MVP planning workspace consumes published Accepted Demand as read-only input. It contains no controls for editing calculated demand, choosing current versus historical demand, comparing alternative demand candidates, confirming phase-readiness demand choices or creating Demand Adjustments. Those capabilities belong to a future dedicated Demand Management workspace. Import review and explicit publication remain separate governed workflows and are not direct demand editing in the planning workspace.

Every retained booking line is possible work unless an approved rule marks a phase `Not applicable` or the planner explicitly excludes it. PH calculation and canonical routing are reviewed independently. Known PH remains authoritative when Event/Project, Location/Hall, Organization or Nøkkelområde routing uses a planner-selected placeholder; `0 PH` represents unknown PH only, never an unknown route.

First executable MVP capacity is maintained in the application as one pooled permanent crew. The accepted defaults are 17 crew and 7.5 hours per workday, producing `127.5 PH` on working days. Saturdays, Sundays and generated Norwegian national public holidays have `0 PH`, subject to audited manual date overrides. Capacity is compared only with complete Total Daily Allocated PH.

Accepted Demand PH is undated. The dated calendar measure is Allocated PH. Unallocated PH, Overallocated PH, Permanent Capacity PH, Permanent Capacity Delta, Additional PH Required and Display FTE are derived projections rather than imported demand facts.

Source reimport may version or supersede source facts, but must preserve stable canonical identities and user-owned manual allocations. Accepted-demand publication and any identity remapping require explicit review, adoption and disclosure of affected manual records.

Visible overlap, dependency and shortage context does not imply that the Phase C constraint engine or Phase D workforce-capacity model has been implemented.

The deterministic fixtures, expected results and verification scenarios for this boundary are defined in `First Executable MVP Acceptance Pack v0.1`. That pack realizes these requirements for testing and does not expand product scope or approve operational source semantics.

## 40.2 Product Roadmap

The broader target product retains the following progression. Later release composition remains iterative.

## Phase A — Demand Foundation

Establish:

- events;
- Event Identity Registry and aliases;
- derived Event Series identity;
- Excel source adapter with an API-compatible canonical boundary;
- booking import;
- mapping;
- mapping-rule versioning;
- conversion profiles;
- quantity derivation;
- unresolved-demand warnings;
- locations;
- Work Types;
- KPIs;
- competence mapping;
- person-hour calculation.

## Phase B — Resource Planning

Introduce:

- a dedicated Demand Management workspace separate from the main allocation workspace;
- explicit current and historical demand-basis selection by Work Type and phase;
- non-mutating demand-candidate comparison and phase-readiness review;
- controlled Demand Adjustments outside the main allocation workspace;
- competence aggregation;
- continuous event-location and resource-planning calendar;
- synchronized date axis and horizontal navigation;
- expandable and collapsible event/work hierarchy;
- query-like filtering and grouping over governed dimensions;
- FTE representation;
- manual daily allocation;
- date-aligned pooled permanent capacity, negative-delta warning and audited workday-calendar maintenance.

## Phase C — Constraint Awareness

Introduce:

- planning windows;
- location access;
- occupancy and conflict classification;
- dependencies;
- constraint-backed dependency visualization and enforcement in the planning workspace;
- eligibility;
- minimum crew requirements;
- warnings.

## Phase D — Capacity Planning

Introduce:

- workforce capacity;
- competence capacity;
- cross-event demand;
- richer shortage and surplus visualization;
- shared multi-competence capacity.

## Phase E — Schedule Generation

Introduce:

- automatic proposed allocations;
- constraint-aware scheduling;
- dependency-aware scheduling;
- capacity-aware scheduling;
- planning preferences;
- automatic first-plan generation;
- controlled manual override with audit history.

## Phase F — Personnel Booking

Introduce:

- personnel;
- competencies;
- availability;
- assignment;
- unfilled staffing demand.

## Phase G — Actuals and Feedback

Introduce:

- actual-hours registration;
- historical comparisons;
- KPI auditing;
- planning-performance analysis.

These phases remain provisional.

---

# 41. Key Terminology

| Term | Definition |
|---|---|
| Event Occurrence | Event/project in one year, identified by its unique complete five-digit source Event ID |
| Event ID | Canonical source identity for one annual Event Occurrence; Visma uses `[YY][PPP]`, currently represented by `PROSJEKT_NR` |
| Event Series ID | Derived cross-year identity for recurring event occurrences; the final three digits `PPP`, preserving leading zeroes, currently stored as `PROSJEKT_ID` |
| Reference Event ID | Derived Event ID for a historical occurrence selected as a planning basis; currently represented by `PROSJEKT_DATA` |
| Event Name Alias | Source-specific event name mapped to a canonical Event ID |
| Event Identity Registry | Controlled mapping of aliases and source identities to Event IDs |
| Booking Line | Individual booked product/service |
| Raw Quantity | Quantity received from the booking source without an inferred operational unit |
| Operational Mapping Rule | Versioned rule that converts matching booking data into a Work Requirement definition |
| Conversion Profile | Versioned selection of one active quantity strategy and compatible KPI for each source product type |
| Composite Work Rule | Explicit rule that creates several additive Work Requirements from the same source scope |
| Quantity Derivation Rule | Rule that determines the operational quantity and aggregation scope used for calculation |
| Derived Operational Quantity | Quantity produced by a derivation rule and used with a KPI |
| Operational Unit | Unit attached by the mapping rule, such as `stk`, `lm` or a stand-based order unit |
| Customer Anchor | Identity used to deduplicate customer-level work; currently represented by stand for exhibitor work |
| Internal Identity Proxy | Controlled location or customer identity used when internal work has no unique stand |
| Unresolved Demand | Work known to exist but whose source quantity is not yet usable for calculation |
| Work Requirement | Operational work generated from booking data |
| Work Type | Stable standardized classification of work with one editable human-readable label, currently evidenced by `forenklet type` |
| Work Quantity | Measurable quantity of required work |
| Productivity KPI | Versioned output-per-person-hour rate selected by stable Work Type identity, operational unit and phase; it does not own a duplicate Work Type label |
| Work-Demand Phase | `Assembly` or `Dismantling`, identifying separate booking-derived rates and PH |
| Venyoo Venue Phase | `Assembly`, `Moving in`, `Event`, `Moving out` or `Dismantling`, providing dated project-location context |
| Organization | Stable planning grouping resolved from operational Visma `Avdeling`; legacy `Fakturamottaker` requires its own explicit binding |
| Person-Hour | Canonical unit of labor demand |
| Nøkkelområde / Competence | Flat first-MVP demand grouping under which person-hours are aggregated; it has no levels or worker-qualification meaning |
| Planning Constraint | Rule affecting when/how work can occur |
| Planning Window | Period within which work may occur |
| Planning Eligibility | Amount of work currently eligible for scheduling |
| Competence Demand | Person-hours grouped by the flat Nøkkelområde planning definition |
| Demand Candidate | Current or retained historical demand available for one target Event Occurrence, Work Type and Phase, carrying its source occurrence and year |
| Demand Basis | The one effective selected source of labor demand for a target Event Occurrence, Work Type and Phase, such as current Visma calculation, planned value or historical occurrence |
| Demand Basis Suggestion | Non-authoritative current-year or most-recent-historical candidate proposed only when no basis has been selected; contributes no PH before approval |
| Phase Readiness Warning | One project-phase exception raised seven calendar days before its Venyoo phase start when any Work Type still uses historical demand |
| No Demand Recorded | Review-required state for a Venyoo occurrence with no discovered current or historical demand evidence; not confirmation of zero work |
| No Demand to Plan | Explicit audited planner confirmation that removes an occurrence from the active work-demand list without removing its Venyoo calendar entry or history; later discovered Visma demand reopens review |
| Demand Adjustment | Explicit, traceable planner change to calculated labor demand |
| Display FTE | Display-only PH conversion using the workspace's versioned PH-per-FTE-day setting; not worker count |
| Accepted Demand PH | Explicitly adopted, undated person-hour total at one Demand Scope |
| Daily Allocated PH | Canonical person-hours manually assigned to one date and Demand Scope |
| Visible Allocated PH | Allocated PH inside the displayed or selected dates |
| Total Allocated PH | Allocated PH across all active dates for a Demand Scope |
| Unallocated PH | Non-negative Accepted Demand PH not yet allocated across all dates |
| Overallocated PH | Allocated PH above Accepted Demand PH; produces an Issue |
| Allocation | Placement of Accepted Demand PH onto dates |
| Scheduled Demand | Target scheduling term for competence demand assigned to dates; in the first executable MVP, the canonical dated fact is Daily Allocated PH |
| Permanent Crew Count | Versioned pooled headcount maintained in the application; first-MVP default 17 |
| Permanent Hours per Workday | Versioned hours per permanent crew member; first-MVP default 7.5 |
| Workday Status | Generated Norwegian weekday/public-holiday classification plus an optional audited manual date override |
| Permanent Capacity PH | Pooled permanent crew count multiplied by hours per workday on a workday; zero otherwise |
| Permanent Capacity Delta PH | Permanent Capacity PH minus complete Total Daily Allocated PH for one date |
| Additional PH Required | Magnitude of a negative Permanent Capacity Delta; a warning, not hired-help, overtime or scheduler residual need |
| Planning Preference | Desired but generally overridable planning behavior |
| Hard Constraint | Condition that normally cannot be violated |
| Proposed Schedule | Automatically generated initial resource plan |
| Schedule Override | Traceable planner change to an automatically generated allocation without changing its underlying demand |
| Personnel Booking | Assignment of actual people to scheduled demand |

---

# 42. Open Questions

The accepted first-executable-MVP booking-demand baseline is not open for reinterpretation: every retained booking line is possible work by default; PH calculation, routing and planner disposition are separate; persistent approved mappings are reused; explicit placeholder routes are publishable and visibly flagged; Visma replacement coverage is the set of complete five-digit Project Occurrence IDs present in the export; the derived three-digit Project Series never merges annual occurrences; Venyoo is the persistent project/location ledger; and work-demand phases are Assembly and Dismantling.

The following product and source questions remain intentionally unresolved:

- Governance of event-name aliases and ambiguous identity mappings.
- Precedence between a selected basis and separately governed Demand Adjustments.
- Boundary between a Demand Adjustment and a Schedule Override.
- Canonical customer identity beyond the current stand-based customer anchor.
- Governance of internal identity proxies when no unique stand exists.
- Scope and approval of Conversion Profile overrides.
- Criteria for declaring candidate rules additive through a Composite Work Rule.
- Workflow for resolving source quantities recorded as zero or otherwise unknown.
- Mapping-key precedence across product type, product group, article and description.
- Policy extensions beyond the accepted visible review queue when no rule matches or several rules match unintentionally.
- Governance of mapping-rule ownership, approval roles and retirement beyond the accepted versioned registry behavior.
- Exact Work Type hierarchy.
- Later terminology and taxonomy connecting flat Nøkkelområder to worker skills and levels.
- KPI versioning strategy.
- Additional presentation conventions for zero, missing and Not-applicable phase-specific KPI values beyond their accepted distinct calculation states.
- Exact representation of progressive dependencies.
- How dependency progress translates into eligible downstream hours.
- Exact representation of planning windows.
- Governance of Location/Hall alias ownership and retirement beyond the accepted persistent project-scoped mapping workflow.
- Which dimensions and measures may be combined in user-configurable planning views.
- Editing behavior when a visible row is an aggregate rather than an editable leaf allocation.
- Saved-view ownership, sharing and default workspace layouts.
- Conflict semantics for overlapping occupancy, access restrictions and same-day handovers.
- Shift models beyond the approved 7.5-hour pooled workday.
- Representation and allocation of overtime or hired-help capacity.
- Exact FTE conversion rules across different working schedules.
- Governance of the versioned `displayHoursPerFteDay` setting after the approved 7.5-hour demonstration value.
- Future skill-aware capacity, individual absence and overlapping-competence behavior beyond the pooled permanent crew.
- Exact future Demand Scope behavior beyond the approved first-MVP explicit placeholders for missing Event/Project, Location, Organization or competence routing.
- Maximum useful crew-size modeling.
- Detailed warning severity model.
- Multi-competence capacity calculation.
- Schedule-generation optimization objectives.
- Personnel competence levels.
- External/temporary workforce model.
- Actual-hours collection method.
- Versioned header/profile compatibility rules for operational Venyoo, raw Visma, mapping and KPI imports as their real export formats evolve.
- Whether legacy `Tabell_oppgaver` compatibility remains useful after the raw Visma pathway is fully established; it is not an operational publication dependency.
- Business review policy for source-to-canonical identity remapping and accepted-demand reconciliation.

These should be resolved through continued domain modeling and testing against real event scenarios.

---

# 43. Product Success

The system succeeds when it can provide a traceable path from:

> **What have we promised to deliver?**

to:

> **What work does that create?**

to:

> **How many person-hours and which competencies are required?**

to:

> **When is that work actually eligible to happen?**

to:

> **How should those competence-hours be distributed across the available days?**

to:

> **Do we have enough capacity?**

and ultimately:

> **Which people should perform the work?**

The long-term ambition is for the system to generate a credible first resource plan automatically while allowing an experienced planner to understand, adjust and override that plan.

The primary measure of workspace success is whether the planner can understand the whole event and resource picture through visual date alignment, without manually reading dates across separate views or reconstructing relationships between venue occupancy and resource demand.

The goal is not simply to digitize the existing Excel process.

The goal is to capture enough of the underlying operational logic that planning knowledge currently held by experienced individuals becomes structured, reusable and computationally useful.

---

# 44. VAL-001 Validation Findings

VAL-001 tested the demand-calculation model against a sample event export and the current KPI and mapping workbook.

## 44.1 Source Event

The booking sample contains Event `26123`, `Bilmesse 2026`, with four booking lines across four stands.

All four booking lines matched at least one mapping rule by `Produkttype 2`. No source row was unmatched in this sample.

## 44.2 Grounded Mapping and Calculation

The KPI workbook contains alternative rows for several product types. The Conversion Profile selects one operational unit for each product type before calculation.

| Booking item | Product type | Rule unit | Derived quantity | Competence | Assembly hours (`Montering`) | Dismantling hours (`Demontering`) |
|---|---|---:|---:|---|---:|---:|
| Barkrakk lounge hvit | 20 [Møbler] | stk | 2 items | Møbler | 0.321 | 0.224 |
| 3X3 rammesystem uten duk | 9 [Duk i ramme] | stk | 1 item | Banner | 1.587 | 0.610 |
| Rammevegg m/sort plate | 14 [FOGA-vegger] | lm | 12 linear metres | FOGA | 1.712 | 1.043 |
| Lyskube for egen duk | 6 [Banner-kube] | stk | 1 item | Banner | 1.887 | 1.075 |

The resulting sample demand is:

| Competence | Assembly hours (`Montering`) | Dismantling hours (`Demontering`) | Total hours |
|---|---:|---:|---:|
| Banner | 3.474 | 1.685 | 5.159 |
| FOGA | 1.712 | 1.043 | 2.755 |
| Møbler | 0.321 | 0.224 | 0.545 |

These values validate the calculation path but not the semantic accuracy of every source unit. In particular, the booking export does not identify the unit of `Totalt antall`; `lm` is supplied by the mapping rule and should be confirmed against the source product definition.

## 44.3 Validation Result

The demand model is **PASS WITH MODEL CHANGES**.

The sample can be transformed into competence-specific person-hours without unmatched booking rows. The corrected model requires:

- one selected measurement strategy for each product type by default;
- explicit Composite Work Rules where multiple Work Requirements are genuinely additive;
- explicit quantity derivation and aggregation scope;
- separation of raw and operational quantities;
- phase-specific KPIs;
- traceability to source rows and rule versions;
- validation states for unmatched and ambiguous mappings.

The small sample does not validate mapping coverage across a complete event, ambiguous source identities, or the broader KPI catalogue.

---

# 45. VAL-002 Full Event Validation Findings

VAL-002 now uses Event `26970`, `VVS 2026`, as the authoritative full-event validation dataset. It supersedes the earlier TravelXpo dataset because that export may contain legacy application-used headers or an incompatible structure. Column ordering alone is not an incompatibility.

The current export contains a title row, a header row, 784 booking rows and a generated total row. The total row is excluded from demand calculation.

## 45.1 Current Source Profile

The export uses the current 13-column Visma layout documented in the Booking Import section. Import must match fields by header name and Source Export Profile, not by position.

The event contains:

- 784 booking rows;
- 111 stands;
- 112 customer names;
- 163 source order numbers;
- 137 articles;
- 31 product types.

Twenty rows have no Stand value, but all twenty contain `Trans.opplysn. 1`. This field can provide location context, but it must not automatically be treated as a unique customer identity.

## 45.2 Mapping Coverage

Using the current Conversion Profile and KPI workbook, 708 of 784 booking rows are covered, representing 90.31 percent row coverage. Thirty of the 31 source product types are resolved.

All 76 unmatched rows use `Produkttype 2 = 0`. Their main contents are:

| Article | Rows | Raw quantity | Description or role |
|---|---:|---:|---|
| 5980 | 5 | 4,498 | Gangtepper |
| 5982 | 1 | 4,300 | Legging av gangtepper Intern |
| T | 67 | 63 | Free-text instructions |
| 22000-600 | 1 | 1 | Unclassified article |
| 9919-600 | 1 | 1 | Unclassified article |
| F | 1 | 1 | Unclassified free-text or package line |

Product type `0` again contains several meanings and cannot receive one generic mapping. The carpet rows may also represent overlapping commercial and internal records, so their quantities must not be added without a classification rule.

## 45.3 Conversion Profile Validation

The Conversion Profile selects one operational unit and key area for each mapped product type. It resolves alternative KPI candidates before person-hour calculation.

Applying the workbook's historical strategies produces 30 calculated Work Requirements. Examples include `12 [FOGA-dragere]` measured in `lm`, `20 [Møbler]` measured in `stk`, the superseded customer-anchor treatment of `23 [Print]` through `ordre`, and `9 [Duk i ramme]` measured in `stk`. These examples characterize the inspected workbook and do not override the accepted Section 8.2 aggregation rule.

## 45.4 Grounded Demand

Following the current workbook behavior, the mapped demand is:

| Competence | Assembly hours (`Montering`) | Dismantling hours (`Demontering`) | Total hours |
|---|---:|---:|---:|
| Arbeidstimer | 12.000 | 0.000 | 12.000 |
| Banner | 127.733 | 54.731 | 182.464 |
| Ekstra | 8.400 | 8.400 | 16.800 |
| Engangstepper | 33.270 | 0.000 | 33.270 |
| FOGA | 190.989 | 107.782 | 298.771 |
| Innredning | 13.949 | 10.134 | 24.083 |
| Møbler | 51.722 | 36.097 | 87.819 |
| Profilering | 46.868 | 3.000 | 49.868 |
| Skilting | 5.000 | 5.000 | 10.000 |
| Snekker | 13.326 | 11.639 | 24.965 |
| Teppefliser | 121.802 | 80.443 | 202.245 |
| **Total** | **625.059** | **317.226** | **942.285** |

This is the grounded result of the inspected workbook's historical conversion logic, not a current accepted event estimate. It predates the authoritative Section 8.2 aggregation rule. Unmatched product type `0` work and unresolved quantities also remain outside or incomplete in the diagnostic calculation.

## 45.5 Superseded Customer-Count Diagnostic

The inspected workbook used customer-anchored `ordre` counting. That behavior is retained here only as historical diagnostic evidence and is not the accepted operational quantity rule. The accepted application rule is the signed `Totalt antall` aggregation in Section 8.2.

The workbook counted every distinct customer anchor with a matching line, including two anchors whose positive and negative quantities netted to zero:

- `13 [FOGA-løsøre]` at stand `C04-44`;
- `23 [Print]` at stand `C01-25`.

Excluding those net-zero anchors would have reduced that historical diagnostic total to 939.952 person-hours: 623.059 Assembly (`Montering`) and 316.893 Dismantling (`Demontering`). Neither historical total is an accepted result under the current operational rule; the source must be replayed using signed `Totalt antall` aggregation.

## 45.6 Source Demand Warnings

Eight rows contain `Totalt antall = 0`. Two are otherwise mapped: `14 [FOGA-vegger]` and `37 [Festivalbord]`. They participate in their Section 8.2 groups and do not create demand by themselves.

Sixteen rows contain negative quantities. They remain in the source and reduce positive quantity only within their exact Section 8.2 groups. Any negative aggregate remains a review exception.

One mapped internal-work row for `13 [FOGA-løsøre]` has no unique stand and uses `Hall C og D` from `Trans.opplysn. 1` as a proxy. This should be flagged for review without blocking the remainder of the calculation.

## 45.7 Validation Result

The demand model remains **PARTIAL WITH A VALID CALCULATION PATH**.

The current Source Export Profile, Conversion Profile and KPI catalogue produce a traceable calculation across 90.31 percent of booking rows. The application should continue calculating known demand while surfacing unmatched classification, unresolved quantity, internal identity and correction warnings.

The result is not complete until:

- product type `0` rows are classified or explicitly excluded;
- unresolved source quantities are supplied or accepted as incomplete;
- internal identity proxies are reviewed;
- Source Export Profiles and Conversion Profile selections are versioned and governed.

---

# 46. VAL-003 Current Resource Planner Findings

VAL-003 examined the current 24-month resource-planning workbook as evidence of the operational planning workflow. The workbook is not treated as the application specification and should not be reproduced one-to-one.

## 46.1 Current Planning Layers

The workbook demonstrates three separate but connected planning layers:

1. `Tabell_oppgaver` acts as a mixed legacy demand ledger containing converted Visma work, historical hours, planned values, manual estimates, locations, provenance and validation status. It is evidence for compatibility and comparison, not the operational source for new accepted-demand publication.
2. `tabell_venyou` is historical planner evidence for venue occupancy and phase behavior. The application's active venue source is the accepted persistent Venyoo Location Format dataset, which represents occupancy by event and location across assembly, move-in, event, move-out and dismantling periods.
3. `Kalender` combines location context, competence demand, daily FTE allocation, staffing capacity, unavailable capacity and variance in a continuous date-aligned planning workspace. It is primarily a derived presentation rather than one canonical source.

This validates the separation between source demand, operational demand, planning constraints, allocation and capacity comparison.

## 46.2 Event Occurrence and Historical Reference

The VVS plan demonstrates the cross-year identity model:

- target Event ID `26970` identifies VVS 2026;
- derived Event Series ID `970` relates VVS occurrences across years;
- derived Reference Event ID `24970` retrieves the corresponding 2024 occurrence where historical demand is selected.

The workbook also demonstrates why names cannot be canonical. The same occurrence may have different names in booking, venue and planning sources. The current `Prosjekt` mapping is therefore an intentional identity-resolution mechanism for source-data inconsistency, not a workbook defect.

## 46.3 Demand Basis Selection

This is a future Demand Management capability implemented on a dedicated page, not in the first executable MVP planning workspace. The main workspace displays approved demand and its provenance read-only; it cannot alter calculated demand or its selected basis.

In Demand Management, the planner selects a Demand Basis independently for each target Event Occurrence, Work Type and Phase rather than assuming one source supplies the complete plan. Nøkkelområde is a derived routing dimension and does not replace Work Type in this selection key.

The target workflow begins when the accepted Venyoo ledger introduces an occurrence into the location calendar. The application then creates its planning entry and discovers current-year Visma candidates for that occurrence and retained historical candidates from the same Project Series. Current-year candidates, historical candidates and the selected effective basis remain separate records. Every displayed candidate and effective demand shows its source year, and multiple available historical years are selectable.

When no basis has been selected, the application may suggest current-year demand when available and otherwise the most recent historical occurrence. The suggestion is review-only and contributes no PH until approved. An approved selection remains sticky across imports. New or materially changed current-year demand creates one non-blocking availability notice and comparison option but does not change the active basis or repeatedly recommend switching. Candidate comparison shows PH and staffing pressure without changing the plan.

When discovery finds no candidate, the planning entry remains in a visible review queue with `No demand recorded - review required`. It remains possible work until the planner selects or adds demand, or explicitly confirms `No demand to plan` with a reason. Confirmed no-demand occurrences may be hidden from the active work-demand list but remain visible in the Project/Location Calendar and retain source and audit evidence. A later Visma snapshot that introduces any demand candidate for the occurrence reopens it for review and restores work-demand-list visibility without automatically selecting or publishing that candidate.

At seven calendar days before each Venyoo Assembly or Dismantling start, one project-phase readiness warning identifies all Work Types in that phase still using historical demand. The planner may compare candidates, switch selected Work Types, or explicitly keep historical demand with a reason. A keep-historical decision suppresses that warning until the corresponding current-year candidate changes materially. If current-year demand is unavailable, the warning states that it is unavailable. Missing phase dates remain visible Issues. This consolidated exception workflow supports a planning horizon of at least one full year without recurring row-level prompts.

For VVS 2026, the workbook currently uses a combination of:

- current converted Visma demand;
- manually planned FOGA demand;
- historical Extra demand from the 2024 occurrence;
- historical Gangtepper demand from the 2024 occurrence;
- direct planner additions for areas such as Design and Service.

The target product must preserve this capability while making the selection explicit, governed and explainable. Each Work Type/Phase selection has one effective basis, preventing current and historical demand from being counted together accidentally. Different Work Types and the two phases of one Work Type may transition independently as current-year demand becomes usable. Historical references, current calculated demand, planned demand and manual adjustments remain distinguishable. The first executable MVP publishes reviewed current Visma-derived demand but does not yet implement selection among current, historical, planned and manually adjusted demand bases.

## 46.4 Allocation and Capacity

Person-hours remain the canonical demand unit. The current planner converts hours to FTE-days using a normal day of 7.5 hours, then distributes FTE across calendar dates.

The first and last non-zero daily allocations determine the planned interval. The workbook compares dated allocation with normal staffing, hired capacity, overtime and unavailable capacity, but the authority, grain, net-versus-gross semantics and reliability of those capacity ranges have not been established for application import.

This validates the need for:

- continuous daily allocation;
- decimal FTE;
- separate required and planned values;
- capacity comparison across simultaneous events;
- visible under-allocation and over-allocation;
- preserved manual changes.

For the first executable MVP, current workbook allocation data may seed a reviewed adopted baseline. The application records the adoption action without inventing an original planner, timestamp, reason or historical audit sequence. Workbook capacity ranges remain unapproved evidence and do not populate operational capacity. Operational first-MVP capacity comes from the application-maintained pooled permanent crew calendar.

## 46.5 Target Application Implications

The web application should preserve the business capabilities demonstrated by the workbook while improving the workflow:

- source imports should feed a canonical model without helper-column joins;
- event aliases should resolve through the Event Identity Registry;
- venue phases should create planning windows and location constraints automatically;
- venue occupancy and phases should remain visible as location rows on the same continuous date axis as resource planning;
- event and work rows should support expansion, collapse and dependency visualization without replacing the daily allocation grid;
- planners should be able to query, filter and regroup the same canonical planning data without creating separate plans;
- selected historical references should be explicit and traceable;
- calculated demand, Demand Adjustments and Schedule Overrides should remain separate;
- the target product planning engine should generate the first allocation automatically in Phase E; this is not part of first executable MVP acceptance;
- dependencies and exceptional uncaptured knowledge should be the principal manual planning inputs;
- the planner should review and adjust a proposal rather than build every schedule from an empty grid.

## 46.6 Validation Result

The current workbook strongly supports the PRD's domain separation and automatic-planning direction.

Future gap analysis should compare the workbook's business capabilities with the target automated workflow. Spreadsheet formulas, helper columns and fixed storage layout are not product requirements. Continuous date alignment, synchronized venue and resource context, and at-a-glance visibility of overlapping phases are necessary domain behaviors.

---

# 47. Status of PRD v0.8

PRD v0.8 establishes the core planning model and restores the continuous planning workspace as the primary product interaction:

	Booking Data
	      ↓
	Conversion Profile
	      ↓
	Operational Mapping Rules
	      ↓
	Derived Work Requirements
	      ↓
	Planning Constraints
		  ↓
	Planning Eligibility
		  ↓
	Competence Demand
		  ↓
	Schedule Generation
		  ↓
	Human Review

It also establishes the intended abstraction boundary between detailed work information and competence-level resource planning, and formalizes the controlled conversion required to turn booking data into operational work.

The first executable MVP is defined in Section 40.1. Later release composition remains iterative.

PRD v0.8 intentionally does **not** define:

- database schema;
- technical architecture;
- scheduling algorithm;
- pixel-level UI specification;
- detailed functional requirements;
- complete end-to-end acceptance criteria.

The next product stage may perform capability-based gap analysis between this validated MVP and the target automated workflow. It must not be interpreted as unfinished first-executable-MVP scope.

# Release-Candidate Implementation Reconciliation — 2026-10-01

The selective rebuild validation confirms that the implemented browser-local MVP matches this document's current first-executable-MVP boundary: booking lines remain possible-work evidence; signed Work Type Amounts feed phase-specific KPI calculation and flat Nøkkelområde routing; Venyoo is the accepted venue ledger and exact project-qualified Location authority; reviewed Visma demand replaces exactly its covered five-digit Project Occurrences; Planning consumes published demand read-only while leaf allocations remain editable; and pooled permanent capacity is derived from 17 crew × 7.5 PH over the Norwegian workday calendar and complete allocations.

The implemented application areas are Planning, Data Review, Mappings and Workspace Data. Automatic scheduling, Planning Locks, named personnel, worker skills, absence, overtime, hired help, automatic allocation, manual PH entry for unknown work, and historical/current demand-basis selection remain explicitly deferred. Demand-year comparison and controlled basis selection belong to a future dedicated Demand Management area, not the current Planning workspace.

# Correction Pass 1 — Aggregated Review and Project Register

The primary Visma Data Review queue is a planning projection, not a raw-source table. It aggregates compatible phase results by Project Occurrence, canonical Work Type, Assembly or Dismantling phase, canonical Organization, project-qualified canonical Location, canonical Nøkkelområde, unit, KPI/rate and calculation state. Different units, phases, rates, calculation or routing states, planner dispositions, routing targets, or unresolved mapping decisions remain separate. Selection, filtered select-all, dispositions, counts, preview and publication readiness operate on these aggregates and deterministically apply to their constituent phase work. The authoritative signed calculation remains `Prosjekt × Work Anchor × Avdeling × Art.nr`; every retained booking line reconciles exactly once and is inspectable through expandable source-group and raw-line lineage.

`Prosjekt.xlsx` is the persistent application-owned authority for resolving Venyoo Event names. Its versioned profile is identified by the required `Navn` and `Prosjektnr.` headers independent of filename, header position, column order or irrelevant columns. A Project ID is either assigned (`[YY][PPP]`, exactly five digits) or provisional (`[YY][AAA]`, two digits and three letters). Provisional IDs are publishable identities with an explicit type; the application never invents either form. Venyoo auto-resolution uses only one unique normalized-name match or a still-compatible approved alias. Ambiguous, unmatched and malformed evidence remains reviewable; fuzzy, substring and first-match joins are prohibited.

An unresolved Venyoo event may be dispositioned `Awaiting Project ID / exclude from publication` only with a reason. Acceptance atomically publishes all eligible reviewed events while retaining the deferred event's source name, locations, intervals, phases and provenance. Deferred events create no active project/location eligibility, remain visible and reversible in Data Review, and are not invalid or deleted. New register evidence or a reviewed alias may reopen the event for review but never publishes it silently. Replacing or aliasing a provisional identity with an assigned identity is an explicit audited decision that preserves prior evidence and history.

---

**End of PRD v0.8**

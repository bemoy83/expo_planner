# Booking Demand Conversion and Review Contract

**Version:** 0.1  
**Status:** Authoritative Working Domain Contract  
**Date:** 2026-09-29  
**Scope:** Visma booking import, persistent Venyoo, mapping and KPI configuration, demand calculation, review, publication and replacement

---

# 1. Purpose and Authority

This contract defines how booking lines from Visma become reviewable and publishable planning demand. It consolidates the approved meaning of source ownership, mappings, productivity KPIs, phase work, unresolved work, planner decisions and full-snapshot replacement.

Within this scope, this contract is authoritative. It supersedes conflicting booking-demand conversion behavior or terminology in implementation notes, test fixtures and earlier working interpretations.

The Resource Planning Application PRD remains authoritative for product outcomes and release scope. The Continuous Planning Workspace design remains authoritative for allocation interaction. This contract does not define scheduling, named personnel, workforce feasibility or operational capacity.

---

# 2. Approved Decisions

1. Each `utskrift_visma` import is a complete current booking-line snapshot for every source Project ID present in that export. The export may contain one project or many.
2. A newly published snapshot replaces previously published Visma-owned demand for exactly those covered projects. A project absent from the export remains untouched. The import is not an incremental line-by-line update within a covered project.
3. A booking line owns the source demand evidence and is the parent of its derived work.
4. Assembly and dismantling are separate phase work items because their rates, PH and required dates can differ.
5. Unresolved booking lines enter a visible review queue before publication. They are not automatically published or hidden.
6. A planner may explicitly flag unresolved work for review and publish it as visible work. Exact PH is retained when calculated; `0 PH` is used only when PH itself is unknown.
7. A `0 PH` unresolved placeholder means that PH is unknown. It is not a decision that no work is required.
8. Only an explicit Exclude decision removes a booking line or phase from active planning work.
9. Published demand retains Event, Location/Hall, Organization, Work Type, Nøkkelområde and Phase so the upper Project/Location Calendar and lower Resource Allocation Matrix can present one synchronized planning picture. This workspace is not a simple Gantt.
10. Source-row identity is required only within an import snapshot for traceability and reconciliation. The application must not pretend that a booking line has a durable cross-export identity when Visma does not provide one.
11. Approved mappings and KPI definitions are persistent, versioned application configuration. They are reused automatically for future Visma imports.
12. Routine operation requires only a new Visma export. The KPI workbook, Nøkkeltall mapping workbook and Venyoo calendar are imported only when their corresponding configuration or source context changes.
13. The accepted Venyoo Location Format dataset persists as the active event, project and location reference until a subsequent Venyoo dataset is accepted.
14. Booking-line Location/Hall values must resolve against locations available to the mapped project. An unmatched or ambiguous value is Unresolved and requires planner review.
15. Approved Location/Hall mappings persist and are reused on future imports. `Undetermined` is an explicit canonical location choice that is ready for publication when all other required fields resolve.
16. Demand follows one explicit derivation chain: Booking Line Item -> Work Type Amount -> phase-specific KPI Mapping -> Competence/Skill Demand PH. These stages must remain separately inspectable.
17. Every retained booking line is presented as possible work unless an approved rule or explicit planner decision excludes it or marks a phase Not applicable.
18. PH Calculation Status is independent from Event/Project, Location/Hall, Organization and Nøkkelområde routing status.
19. A `0 PH` placeholder is permitted only when PH itself cannot be calculated. Known PH must never be replaced by zero because routing is unresolved.
20. Explicit placeholder routes are publishable planner decisions: Event/Project `Undetermined`, Location `Undetermined`, Organization `Undetermined`, and Competence `Unresolved`. They retain known PH and remain visibly flagged for manual review.
21. A Work Type has one stable identity and one editable human-readable label, initially evidenced by `forenklet type`. `Shared KPI definition`, task label and KPI label must not appear as separate editable versions of that same label. Productivity rates remain separate phase-specific values keyed by Work Type, unit and phase.
22. Visma coverage is defined only by the unique source Project IDs present in the accepted export. Venyoo projects, dates or locations never enlarge Visma demand-replacement coverage.
23. Venyoo is the persistent dated project-location ledger. It supplies the eligible real Location/Hall choices for each project and calendar context for later allocation behavior; it does not own booking demand.
24. Operational Visma `Avdeling` values resolve through persistent source-specific mappings to canonical Organization. Legacy `Fakturamottaker` values remain separate legacy evidence and are never treated as equivalent automatically.
25. Work-demand phases are exactly `Assembly` and `Dismantling`. Venyoo venue phases are `Assembly`, `Moving in`, `Event`, `Moving out` and `Dismantling`. Source labels such as `Montering`, `Demontering` and `Dismantle` are normalized aliases, not additional canonical phases.
26. Every operational Visma Project ID has exactly five digits in the form `[YY][PPP]`: `20YY` is the annual occurrence year and `PPP` is the recurring Project Series ID. The complete five-digit Project ID is the snapshot-coverage and replacement identity. The three-digit series is a cross-year relationship only and supports later explicit historical-demand selection without merging or replacing annual occurrences.

---

# 3. Domain Definitions

## 3.1 Booking Snapshot

A Booking Snapshot is one complete imported `utskrift_visma` export and its conversion result. Its coverage is the set of unique source Project IDs present in the export, including projects represented only by unresolved, excluded or otherwise non-publishable lines.

The snapshot makes no replacement claim for a Project ID absent from the export. Because a project with no rows is not present, this contract does not infer its removal from another dataset.

## 3.2 Booking Line

A Booking Line is one row of source booking evidence. Duplicate-looking rows remain separate source lines within the snapshot. A booking line is never discarded merely because its demand cannot yet be calculated.

## 3.3 Mapping Rule

A Mapping Rule interprets a source product or booking-line classification. It assigns the canonical Work Type and operational unit. It may also carry the approved Nøkkelområde routing used after PH calculation. Approved rules persist independently of any one snapshot.

A Mapping Rule does not itself turn source quantity into person-hours. Classification, amount derivation, KPI selection, PH calculation and competence routing must remain explainable as separate stages.

The source `Produkttype 2` is matching evidence, not the canonical Work Type label. The mapping workbook's `forenklet type` is the current source evidence for the Work Type's human-readable label. `Søkekriterie` is retained only as legacy evidence and is not a canonical identity or lookup key.

## 3.4 Work Type Amount

A Work Type Amount is the quantified operational work derived from one or more booking lines by summing signed `Totalt antall` within the authoritative source grouping. It consists of:

- canonical Work Type;
- exact amount;
- operational unit;
- contributing booking-line evidence;
- source aggregation key;
- mapping-rule version.

Examples include `500 m2` of one Work Type or `120 lm` of another. A Work Type Amount is work quantity, not person-hours and not yet competence demand. The operational Visma pathway has no separate distinct-count exception.

Each Work Type has one stable application identity and one editable human-readable label. Renaming the label does not create a second Work Type or break historical references.

## 3.5 KPI Mapping and Productivity KPI

A KPI Mapping binds one Work Type, operational unit and phase to one compatible Productivity Rate. The rate supplies output per person-hour. The mapping also retains the approved Nøkkelområde or competence route used for the calculated PH.

Assembly and dismantling rates are independent. A Productivity Rate has its own stable technical identity and version, but it does not introduce another planner-managed Work Type label. The display text `Work Type label - unit`, such as `FOGA-vegger - lm`, is derived from the Work Type label and unit.

The canonical productivity lookup key is:

`Work Type identity × Unit × Phase`

Changing only the Work Type label preserves the rate binding. Changing the unit changes the lookup key and requires compatible assembly and dismantling rates to be reviewed; rates are never carried across silently.

## 3.6 Phase Work Item

A Phase Work Item is the assembly or dismantling work derived from a booking line through its Work Type Amount and phase-specific KPI Mapping. The booking line is its source parent. Each phase has its own PH calculation status, per-dimension routing statuses, planner disposition, timing, rate evidence, Nøkkelområde route and calculated PH.

## 3.7 Competence/Skill Demand PH

Competence/Skill Demand PH is the calculated person-hour requirement produced when a phase-specific KPI is applied to a Work Type Amount and the result is routed to its approved Nøkkelområde or competence grouping.

For the first executable MVP, Nøkkelområde is one flat demand grouping. It has no competence levels, subskills or worker-qualification meaning. The explicit `Unresolved` Nøkkelområde is part of the same flat set. Later worker skills may map to one or several Nøkkelområder without changing the imported demand identity.

For quantity-based work:

`Competence Demand PH = Work Type Amount / Phase Output per Person Hour`

It is demand, independent of available capacity, personnel assignment and dated allocation.

## 3.8 Demand Scope

A Demand Scope is the canonical planning grain at which accepted PH is aggregated:

`Event × Location/Hall × Organization × Work Type × Nøkkelområde × Phase`

Source booking lines and phase work items remain available beneath the aggregate for review and provenance.

## 3.9 Venyoo Location Dataset

The Venyoo Location Dataset is the accepted `location_format` calendar and venue reference. Venyoo is a wordplay on "venue" and "you". The dataset defines the currently known events or projects and their available canonical Locations/Halls, occupancy and calendar context.

Its coverage is the declared date range of that export and the project-location rows contained in it. It is a venue-context ledger, not a demand snapshot. It neither creates booking demand nor adds projects to Visma replacement coverage.

## 3.10 Location/Hall Mapping

A Location/Hall Mapping binds a booking-line Location/Hall value to one canonical location valid for the mapped project. The mapping is persistent, versioned configuration. Where the same source value can mean different locations for different projects, project context is part of the mapping key.

`Undetermined` is a canonical location, not an unresolved value. Selecting it means the planner has deliberately accepted that the work belongs to the project but cannot yet be assigned to a more specific hall.

## 3.11 Possible Work

Possible Work is the visible representation of a retained booking line and its applicable phase outcomes before every amount, PH or routing question has necessarily been resolved. Source-line existence is sufficient to create Possible Work.

Possible Work remains visible through review and publication unless:

- an approved mapping or rule explicitly classifies the phase as Not applicable; or
- the planner explicitly chooses Exclude and records a reason.

Missing mappings, unknown PH, unresolved routing and absent canonical identities do not by themselves exclude Possible Work.

## 3.12 Organization

Organization is the stable application-owned planning grouping to which a booking line's source organization value is routed. For the operational raw Visma profile, the source field is `Avdeling`.

Organization is not Nøkkelområde/competence and does not divide shared capacity. A source value may resolve to a real canonical Organization or to the explicit placeholder Organization `Undetermined`. Source profile, source field and normalized source value are part of the reusable mapping key.

`Fakturamottaker` is retained only as a source field in legacy converted-planner evidence. It may be mapped through an explicit source-specific rule, but it is not an alias for `Avdeling` by default.

## 3.13 Phase Vocabularies

The contract uses two related vocabularies:

| Vocabulary | Canonical values | Purpose |
|---|---|---|
| Work-demand phase | `assembly`, `dismantling` | Distinguishes the two booking-derived phase work items, rates and PH amounts. |
| Venyoo venue phase | `assembly`, `moving-in`, `event`, `moving-out`, `dismantling` | Describes dated occupancy and venue context in the Project/Location Calendar. |

Source `Montering` maps to work-demand `assembly`. Source `Demontering` maps to work-demand `dismantling`. Venyoo `Dismantle` maps to venue phase `dismantling`. Display labels may be localized, but canonical stored values and meaning remain stable.

A work-demand phase is not relabelled when its manual allocation falls during another venue phase. Venue phases provide timing context and may later support automatic allocation eligibility; they are not additional booking-demand phases.

---

# 4. Source and Configuration Ownership

## 4.1 Routine Visma Import

The normal recurring input is the latest `utskrift_visma` export. Importing it must:

1. retain every booking line;
2. apply the latest approved mappings and KPI definitions automatically;
3. reuse the active Venyoo Location Dataset and apply approved Location/Hall mappings;
4. calculate all resolvable phase work;
5. put unresolved results in the review queue;
6. leave the active planning snapshot unchanged until the planner publishes.

An unseen source product creates unresolved evidence. It must not invalidate, reset or replace previously approved rules.

## 4.2 Persistent Mapping Registry

The Mapping Registry is application-owned, versioned configuration. Once a planner resolves and approves a reusable source mapping, including a Location/Hall mapping, later imports apply that mapping automatically.

Mapping updates may be imported from the Nøkkeltall workbook or entered in the application. Updating mappings creates a new version; approved historical versions remain immutable and auditable.

## 4.3 Persistent KPI Registry

The KPI Registry is application-owned, versioned configuration. Approved productivity rates remain available across imports. It stores rate definitions and their Work Type, unit and phase keys; it does not own a second editable copy of the Work Type label.

The KPI workbook is required only when rate definitions or values change. A changed unit or counting method must be reviewed as a semantic change and must not silently inherit an incompatible rate.

## 4.4 Venue and Calendar Context

The accepted Venyoo Location Dataset is persistent application data. It remains active across reloads, application restarts and routine Visma imports until the planner accepts a subsequent Venyoo upload.

A subsequent accepted Venyoo dataset replaces the prior active venue and calendar reference as one versioned dataset. Prior versions and their provenance remain auditable. Invalid or unaccepted uploads must not disturb the active dataset.

A routine Visma import must reuse the active Venyoo dataset. The planner uploads Venyoo again only when event, project, hall, location, occupancy or calendar context changes.

Accepting a Venyoo dataset makes that complete export the active venue ledger for its declared date range. The review must disclose the date range and any project, location, occupancy or phase records that disappear relative to the prior active ledger. The prior version remains historical evidence.

## 4.5 Persistent Location/Hall Resolution

For each booking-line Location/Hall value, the application must first reuse an approved mapping that is valid for the mapped project. If none exists, it may propose an exact or normalized match against that project's Venyoo locations, but a proposed match is not approved configuration until the planner accepts it.

An unmatched or ambiguous Location/Hall is Unresolved and enters the visible review queue. To resolve it, the planner selects:

- one canonical Location/Hall available to the mapped project; or
- the canonical `Undetermined` location.

The approved choice is stored as a versioned Location/Hall mapping and is reused on later Visma imports. The choice list must not silently offer or bind a location belonging only to another project.

If a later Venyoo dataset no longer contains a mapped target for the relevant project, the mapping becomes invalid for that dataset and returns to review. It must not silently fall back to another location or to `Undetermined`.

Venyoo determines eligibility of real location choices: a real Location/Hall may be selected for a booking line only when the active Venyoo ledger associates that location with the mapped project. `Undetermined` remains the explicit publishable alternative. Missing Venyoo context does not remove or zero Visma work.

## 4.6 Replay After Configuration Change

Approving a new product mapping, Location/Hall mapping, KPI or Venyoo dataset may replay the latest retained Visma snapshot. The planner must not be required to upload the same Visma export again merely to apply corrected persistent configuration.

## 4.7 Visma Project Coverage

Coverage is calculated before Work Type, PH, Organization, Location or competence resolution:

1. collect every distinct nonblank source Project ID from the accepted `utskrift_visma` rows;
2. resolve each source Project ID to one canonical project/event identity;
3. present that exact covered-project set in import review;
4. block publication for a covered source Project ID whose canonical project identity remains unresolved;
5. on publication, replace all prior Visma-owned active work and demand for each covered canonical project with the reviewed result from the new snapshot.

A project absent from the export is outside coverage and remains unchanged, even when it appears in Venyoo. Within a covered project, a booking line or aggregate absent from the new complete snapshot is retired from active Visma-owned work. Excluded, Not-applicable and unresolved rows still prove that their source Project ID is in coverage.

## 4.8 Organization Resolution

Operational organization resolution uses `source profile × source field × normalized source value`. For the raw Visma profile, the field is `Avdeling`.

An approved mapping binds that source key to one stable canonical Organization and is reused on future imports. Several source values may map to one Organization, but one source key may have only one active target in a mapping version. A new or ambiguous value receives Routing Status `Review required` until the planner selects a real Organization or explicit Organization `Undetermined`.

The original source field and value remain inspectable. No normalization rule may merge `Avdeling` with legacy `Fakturamottaker` without a separately approved source-specific binding.

---

# 5. Identity and Snapshot Replacement

## 5.1 Source-Line Identity

Each imported booking line receives a deterministic identity within its source snapshot. The identity must distinguish duplicate identical rows, for example by retaining source row position as batch-local evidence.

This identity exists for traceability, review and reconciliation inside that snapshot. It does not claim that the same logical line can be identified across separate Visma exports.

The application must not invent cross-export identity from timestamps or from a combination of fields that can legitimately be duplicated.

## 5.2 Stable Application Identities

Stable identity is required for application-owned concepts that genuinely persist: mapping rules, KPI definitions, Work Types, units, Nøkkelområder, canonical events, locations, organizations, Demand Scopes, allocations, issues and audit entries.

## 5.3 Replacement Model

Publication compares complete snapshots at the aggregate Demand Scope level, not source row by source row. The new published snapshot replaces prior Visma-owned demand for exactly the canonical projects resolved from source Project IDs present in the export.

Historical snapshots, mappings, KPI versions, publication records and audit evidence remain retained. Manual allocations are not silently deleted when demand changes; they remain visible and are reconciled against the replacement demand, with Issues where necessary.

## 5.4 Project Occurrence and Series Identity

The source `Prosjekt` value is parsed only when it contains exactly five digits in the form `[YY][PPP]`:

- `Project Occurrence ID` is the complete five-digit value;
- `Project Year` is `2000 + YY`;
- `Project Series ID` is the final three digits, preserving leading zeroes.

For example, `26970` is the 2026 occurrence of series `970`, while `24970` is the separate 2024 occurrence of the same series. Publishing or replacing one occurrence must not alter the other. Venyoo event names and other aliases resolve to a specific occurrence rather than to the series alone.

Historical Visma snapshots are retained so a later planner-controlled workflow can select demand from an earlier occurrence in the same series while current-year evidence is incomplete. This contract does not authorize automatic historical substitution or an inferred sufficiency threshold. A malformed Project ID remains visible for review and blocks publication for the affected source identity; the application must not guess its year or series.

---

# 6. Independent Work Statuses

Source presence, PH calculation, canonical routing and planner disposition are separate facts. No implementation may collapse them into one `resolved` or `unresolved` field.

## 6.1 Source-Presence Rule

Every booking line and each applicable phase is possible work by default. It remains represented through review and publication unless:

- an approved rule explicitly classifies the phase as `Not applicable`; or
- the planner explicitly chooses `Exclude` and records a reason.

Missing mappings, unknown PH or unresolved routing never constitute exclusion.

A zero aggregate under Section 9.2 is not an exclusion and does not discard its booking lines. It is an authoritative cancellation result: every contributing line remains represented in reconciliation and provenance, while the group creates no active work amount.

## 6.2 PH Calculation Status

PH Calculation Status answers only whether the phase amount can be calculated. It does not include canonical placement.

| Status | Meaning |
|---|---|
| Calculated | A valid Work Type Amount, unit and positive phase productivity rate produce exact PH. |
| Unresolved | PH cannot yet be calculated because a required calculation input is missing, invalid, conflicting or requires review. |
| Not applicable | An approved rule explicitly states that this phase creates no work. |

Unresolved PH reasons include, without limitation:

- no approved Work Type or KPI mapping;
- invalid or ambiguous quantity;
- missing, blank or zero productivity rate where work may exist;
- unresolved unit; or
- a negative aggregate quantity, which contradicts the expected authoritative snapshot.

PH Calculation Status must be recomputed when the source snapshot, mapping version or KPI version changes. A routing problem must never change `Calculated` PH to zero or to PH `Unresolved`.

## 6.3 Routing Status

Routing Status is recorded independently for Event/Project, Location/Hall, Organization and Nøkkelområde/competence.

| Status | Meaning |
|---|---|
| Resolved | The source evidence or an approved mapping identifies a real canonical target. |
| Review required | No approved target exists, the match is ambiguous, or a previous mapping is invalid in the active canonical context. |
| Explicit placeholder | The planner deliberately selected the dimension's canonical placeholder so the possible work can be published without inventing a real match. |

The permitted explicit placeholders are:

- Event/Project `Undetermined`;
- Location `Undetermined`;
- Organization `Undetermined`; and
- Nøkkelområde/competence `Unresolved`.

An explicit placeholder is a publishable canonical choice, not an automatic fallback and not a claim that the underlying value has been resolved. It retains a review flag and provenance. Known PH remains known when any routing dimension uses an explicit placeholder.

Routing Status must be recomputed when the source snapshot, mapping version, active Venyoo dataset or other canonical context changes. A failed or ambiguous match returns the affected dimension to `Review required`; the system must not silently select a placeholder.

---

# 7. Planner Disposition

Planner Disposition records what the planner has decided to do with a phase work item. It is not a synonym for PH Calculation Status or Routing Status.

| Disposition | Meaning |
|---|---|
| Undecided | Awaiting planner review; not yet published. |
| Publish | Publish calculated PH whose routing uses real canonical targets. |
| Flag for review | Publish possible work with an open review Issue, retaining calculated PH when known and using `0 PH` only when PH itself is unresolved. |
| Exclude | Intentionally omit active planning work, with a required reason. |

The permitted outcomes are:

| PH calculation and routing | Planner disposition | Publication result |
|---|---|---|
| Calculated PH; all routes Resolved | Publish | Publish the exact calculated PH. |
| Any PH or routing status | Undecided | Keep the possible work in the visible review queue; do not change active planning demand. |
| Calculated PH; every route is Resolved or an Explicit placeholder | Flag for review | Publish the exact calculated PH and create an open review Issue. Any placeholder route remains visibly identified. |
| Unresolved PH; publishable real or placeholder routes | Flag for review | Publish a visible `0 PH` unknown-PH placeholder and create an open review Issue. |
| A route remains Review required | Publish or Flag for review | Do not publish until the planner selects a real canonical target or the permitted explicit placeholder. Keep the work visible in review. |
| Any non-Not-applicable state | Exclude | Publish no active work; retain reason, evidence and audit history. |
| Not applicable | Publish or Exclude | Record the reviewed no-work outcome without accepted PH. |

An unresolved status must never silently become Flag for review or Exclude. Both are explicit planner decisions. A planner may not deliberately withhold or replace known calculated PH with zero; zero is a placeholder only when PH calculation itself is unresolved.

A reusable resolution should update the persistent Mapping, Location/Hall Mapping or KPI Registry so future imports resolve automatically. A snapshot-specific exception remains attached to that snapshot unless the planner deliberately turns it into a reusable rule.

---

# 8. Mapping and Review Workflow

The review workspace must distinguish at least these views or filters:

- Needs attention;
- Unresolved mappings;
- Calculation issues;
- Flagged for review;
- Excluded;
- Ready to publish.

Each row must show source product evidence, source Location/Hall, canonical routing for every required dimension, the single human-readable Work Type label, unit/counting method, Nøkkelområde, PH Calculation Status, routing statuses and Planner Disposition as separate concepts.

The review workspace must not render `task label`, `KPI label` or `Shared KPI definition` as additional editable fields when they contain the Work Type label. A combined `Work Type label - unit` value may be shown as derived read-only context.

The workspace must support Select all, multi-select and Apply to selected for appropriate bulk actions. Bulk changes must show their impact before approval and must not bypass required reasons or validation.

Approved mapping versions are immutable. Editing an approved mapping creates a successor draft. Renaming the Work Type label preserves its stable Work Type identity unless the planner explicitly creates a new semantic Work Type.

Location/Hall review must present only locations valid for the mapped project, plus `Undetermined`. Selecting a location and approving the change updates persistent mapping configuration; it is not merely a one-time edit to the current published row.

---

# 9. Quantity, KPI and Phase Calculation

## 9.1 Authoritative Demand Transformation Chain

The demand model is:

    Booking Line Item
        -> Work Type Mapping
        -> Work Type Amount + Unit
        -> Phase-Specific KPI Mapping
        -> Calculated Assembly or Dismantling PH
        -> Nøkkelområde / Competence Route
        -> Competence/Skill Demand PH

The stages mean:

1. **Booking Line Item:** immutable source evidence from the current Visma snapshot, including raw product classification and quantity evidence.
2. **Work Type Mapping:** classifies the source line and selects its canonical Work Type and unit.
3. **Work Type Amount:** preserves the derived operational quantity and unit before labor conversion.
4. **Phase-Specific KPI Mapping:** uses the Work Type identity, unit and phase to select exactly one compatible assembly or dismantling productivity rate and its approved Nøkkelområde route.
5. **Calculated Phase PH:** divides the Work Type Amount by the positive phase output rate at full precision.
6. **Competence/Skill Demand PH:** groups the calculated phase PH under Nøkkelområde or the governed competence/skill definition used by the planning workspace.

No step may be skipped in provenance merely because the current workbook stores several decisions in one row. The application may calculate efficiently, but it must be able to display and audit the result as this chain.

The same Work Type Amount may feed separate assembly and dismantling KPI mappings. This creates two phase demands from the same source work amount; it does not duplicate the source booking quantity.

## 9.2 Authoritative Quantity Aggregation

The latest Visma export is the final authoritative set of booking lines for every source Project ID in its coverage. Positive and negative rows are summed within this exact source grouping key:

`Prosjekt × Work Anchor × Avdeling × Art.nr`

`Work Anchor` is `Stand` when `Stand` is non-empty. When `Stand` is empty, it is `Trans.opplysn. 1`. `Totalt antall` is never part of the grouping key; it is the signed measure being summed. Every contributing row remains separately retained as source evidence.

The resulting aggregate drives Work Type Amount and PH:

`Person Hours = Net Quantity / Positive Output per Person Hour`

The full numeric precision is retained through aggregation. Display rounding does not change authoritative PH.

- a positive aggregate produces the current Work Type Amount;
- a zero aggregate is an authoritative cancellation for that group, retains all source evidence and publishes no active demand;
- a negative aggregate contradicts the expected source invariant that a negative row has corresponding positive quantity in the same export, so it remains visible in review and publishes no negative demand.

This rule applies to every operational Work Type. There is no distinct-count or customer-anchor exception.

## 9.3 Assembly and Dismantling

For each booking line, assembly and dismantling are evaluated separately:

- each phase has an independent productivity rate;
- one phase may resolve while the other remains unresolved or not applicable;
- assembly demand is associated with work before the event;
- dismantling demand is associated with work after the event;
- no phase may inherit the other phase’s rate or status merely because their labels match.

These are the only canonical work-demand phases. `Mounting` and `Montering` are aliases of `Assembly`; `Demontering` and `Dismantle` are aliases of `Dismantling`. `Moving in`, `Event` and `Moving out` belong only to the Venyoo venue-phase vocabulary.

## 9.4 Location/Hall Resolution

Location resolution occurs before a phase is ready to publish. The booking-line Location/Hall is evaluated in the context of its mapped project against the active Venyoo Location Dataset.

The possible outcomes are:

| Outcome | Routing effect |
|---|---|
| Approved match to a project Location/Hall | Location is resolved. |
| Planner-approved match to `Undetermined` | Location has an Explicit placeholder and is publishable through Flag for review. |
| No match, ambiguous match or invalid prior mapping | Location remains Review required and the phase stays in the review queue. |

The system must not interpret `Undetermined` as a wildcard, copy it automatically from a failed match or use it to conceal a missing mapping decision.

The same routing rule applies to Event/Project, Organization and Nøkkelområde/competence. Their explicit placeholders permit publication through Flag for review while preserving the exact calculated PH and an open routing Issue.

---

# 10. Aggregation and Accepted Demand

Published calculated phase work is aggregated at:

`Event × Location/Hall × Organization × Work Type × Nøkkelområde × Phase`

Multiple source lines and calculations resolving to the same Demand Scope are summed at full PH precision. The aggregate must retain drill-down to every contributing booking line, phase calculation and configuration version.

Flagged work with Calculated PH contributes its exact PH to Accepted Demand PH and subsequent capacity arithmetic, including when routed through an explicit placeholder. Routing uncertainty must never zero known demand.

Flagged work with Unresolved PH contributes a `0 PH` placeholder to Accepted Demand PH and capacity arithmetic, but remains visible as possible work. It must display an explicit state such as `PH unresolved · Review required`. Unknown-PH counts and routing-review counts must be reported separately from PH totals and from each other.

Excluded work contributes neither active work nor Accepted Demand PH. Its source evidence and exclusion decision remain auditable.

---

# 11. Publication and Replacement

Publication is an explicit planner command. It must be atomic and must:

1. identify the complete source snapshot and its declared coverage;
2. bind the exact mapping, KPI and canonical-context versions used;
3. reject publication while any required planner decisions remain Undecided or any route remains Review required;
4. publish calculated work selected for Publish with its exact PH;
5. publish flagged work with its exact calculated PH when known, or a visible `0 PH` unknown-PH placeholder only when PH is unresolved, and create open Issues;
6. retain excluded and not-applicable decisions as non-active evidence;
7. replace only the prior Visma-owned demand and work items within the same coverage;
8. preserve unrelated demand, capacity and manual allocations;
9. create a complete publication and audit record.

The bound canonical context includes the active Venyoo dataset version and the exact Location/Hall mapping version used for every published item.

Republishing the same snapshot with the same configuration and decisions is a no-op.

Publishing a later complete snapshot supersedes the previous active Visma-owned snapshot for that coverage. It must not accumulate obsolete demand from prior exports.

---

# 12. Unresolved Work Visibility

Before publication, every unresolved booking line and phase remains available in the review queue.

After the planner chooses Flag for review, the work appears in planning with:

- source booking-line identity and workbook-row evidence;
- real or explicitly selected placeholder routes for Event/Project, Organization, Location/Hall and Nøkkelområde/competence;
- Work Type and phase where resolvable;
- exact calculated PH where known, even when a route is a placeholder;
- a `0 PH` placeholder explicitly marked as unknown only where PH Calculation Status is Unresolved;
- an open unresolved-demand Issue;
- complete mapping, KPI and publication provenance.

While any route remains Review required, the item remains visible in the review queue and, where needed, a separate Unresolved Work view. It must not disappear. Once the planner deliberately selects the permitted placeholder for every unresolved routing dimension, the item has sufficient canonical placement for flagged publication.

A work item explicitly mapped to a permitted placeholder appears under that canonical placeholder in planning and retains its open review Issue. Placeholder selection ends the blocking routing state; it does not assert a real-world match.

Manual PH entry for unresolved work is deferred. Deferral does not permit hiding or excluding unresolved work automatically.

---

# 13. Reconciliation Invariants

For every imported Booking Snapshot:

1. Every booking line is accounted for as possible-work evidence unless an approved rule marks it Not applicable or the planner explicitly excludes it; lines in a zero aggregate remain accounted for as an authoritative cancellation.
2. Every booking line links to its assembly and dismantling phase outcomes, including explicit not-applicable outcomes.
3. Every active published work item traces to its complete contributing booking-line set and phase.
4. Every accepted PH contribution traces through a phase calculation to an approved mapping and KPI version; routing uncertainty never changes its amount.
5. Duplicate-looking source lines remain separately accounted for within the snapshot.
6. Mixed phase outcomes are disclosed; one resolved phase must not hide an unresolved sibling phase.
7. Aggregation uses the Section 9.2 key exactly once and must not double-count source demand.
8. Review-queue totals, published results, exclusions and not-applicable outcomes reconcile to the complete imported snapshot.
9. Every published item references a real canonical route or a planner-selected permitted placeholder for every required routing dimension.
10. Every approved Location/Hall mapping is reusable and versioned; no publication-only location correction bypasses the registry.
11. Known calculated PH is never replaced by zero because a routing dimension is unknown.
12. Only an approved Not-applicable rule or explicit planner exclusion removes possible work from active publication accounting.

---

# 14. Audit and Explainability

The application must be able to explain each result using:

- source workbook and snapshot identity;
- Venyoo dataset identity and version;
- source sheet, row and field evidence;
- booking-line batch-local identity;
- mapping rule and version;
- Work Type, derived Work Type Amount, unit and source aggregation key;
- Nøkkelområde routing;
- source Location/Hall, project context, canonical Location/Hall and mapping version;
- KPI mapping, KPI definition, phase rate and version;
- exact phase PH before competence aggregation;
- PH calculation status and unresolved-PH reason;
- per-dimension routing status, selected target and routing-review reason;
- planner disposition, actor, timestamp and reason;
- publication batch and predecessor;
- resulting Demand Scope or unresolved-work placement.

Mappings, Location/Hall mappings, KPI versions, Venyoo datasets, source snapshots and prior publication decisions are historical evidence and must not be silently rewritten.

---

# 15. Minimum Acceptance Scenarios

## 15.1 Persistent Mapping Reuse

A planner resolves and approves a previously unknown source product. A later Visma-only import applies the approved mapping automatically without requiring the mapping workbook again.

## 15.2 Separate Phase Work

One booking line produces independent assembly and dismantling work with different rates, PH and planning timing. Both remain linked to the same parent booking line.

## 15.3 Unresolved Before Decision

An unknown product appears in the review queue with Unresolved PH Calculation Status, one or more Review-required routes where applicable, and an Undecided Planner Disposition. Active planning demand remains unchanged until the planner decides.

## 15.4 Flag for Review

The planner flags a phase whose PH cannot be calculated. Publication creates visible possible work with an explicitly unknown `0 PH` placeholder, an open Issue and complete provenance. Accepted Demand PH does not increase.

If PH is Calculated but a routing dimension uses an explicit placeholder, Flag for review publishes the exact PH under that placeholder with an open routing Issue. Accepted Demand PH increases by the known amount.

## 15.5 Exclude

The planner explicitly excludes a phase with a reason. No active work is published, but the decision and source evidence remain available.

## 15.6 Complete Snapshot Replacement

A later Visma export changes duplicate-looking lines and totals. Publication replaces prior Visma-owned demand for every source Project ID present in that export using the new aggregate truth; it does not depend on matching individual lines across exports and does not affect absent projects.

## 15.7 Configuration-Only Update

A KPI or mapping update replays the latest retained Visma snapshot without requiring another Visma upload. Nothing changes in active planning until the planner reviews and publishes the new result.

## 15.8 Full Reconciliation

The application demonstrates that every booking line and both phase outcomes are represented in review and publication accounting across PH calculation, per-dimension routing and planner-disposition states, including excluded and Not-applicable outcomes.

## 15.9 Persistent Venyoo Context

After an accepted Venyoo upload, later Visma-only imports reuse that dataset without requiring another Venyoo upload. A subsequent accepted Venyoo version replaces the active context while retaining prior provenance.

## 15.10 Location/Hall Review and Reuse

A booking-line hall does not match a location available to its project. Its Location routing remains Review required until the planner maps it to a valid project location or explicitly selects `Undetermined`. Its independently calculated PH remains unchanged. The approved mapping is reused automatically on a later Visma import.

## 15.11 Undetermined Location

The planner deliberately maps a source hall to canonical Location `Undetermined`. If every other route is publishable, the work can be flagged and published under `Undetermined`; known PH is retained and an open routing Issue identifies the placeholder decision.

## 15.12 Explicit Competence Placeholder

The phase PH is Calculated but no real Nøkkelområde can be selected confidently. The planner selects canonical competence `Unresolved` and Flag for review. Publication retains the exact PH under `Unresolved`, creates an open routing Issue and does not classify the item as excluded or as unknown PH.

## 15.13 Venyoo Change Invalidates a Location Mapping

A subsequent Venyoo dataset removes or changes a location used by an approved mapping. Replay returns the affected work to the review queue without silently selecting another location or `Undetermined`.

## 15.14 Demand-Chain Explainability

For one published competence-demand result, the application can show the contributing Booking Line Items, their mapped Work Type Amount and unit, the assembly or dismantling KPI Mapping and rate, the exact calculated phase PH, and the Nøkkelområde or competence route. Changing grouping in the workspace does not alter any stage of that derivation.

## 15.15 Single Work Type Label and Rate Key

One mapping row exposes one editable Work Type label sourced from `forenklet type`, not duplicate task-label and Shared-KPI-definition controls. Assembly and dismantling rates resolve by stable Work Type identity, unit and phase. Renaming the label preserves those bindings; changing the unit requires compatible rates to be reviewed before PH can be calculated.

## 15.16 Visma Project Coverage

A one-project Visma export replaces only that project's prior Visma-owned work. A forty-project export replaces exactly those forty projects. A project absent from either export remains unchanged even when present in Venyoo. Within a covered project, work absent from the new complete snapshot is retired after reviewed publication.

## 15.17 Organization Resolution

Raw Visma `Avdeling` values resolve through persistent source-specific mappings. A new value returns to review until mapped to a real Organization or explicit `Undetermined`. A legacy `Fakturamottaker` value does not reuse an `Avdeling` mapping unless a separate binding is approved.

## 15.18 Separate Phase Vocabularies

One booking line produces only `assembly` and `dismantling` work-demand phases. The active Venyoo ledger may independently expose all five venue phases. Source aliases normalize deterministically, and allocating assembly work during moving-in or event dates does not relabel the demand phase.

## 15.19 Signed Quantity Aggregation

The current Visma snapshot contains positive and negative rows for the same `Prosjekt × Work Anchor × Avdeling × Art.nr` group. The application retains every row and sums signed `Totalt antall` before Work Type and phase PH calculation. A positive result calculates normally, a zero result retains cancellation evidence and publishes no active demand, and a negative result remains visible for review and cannot publish negative demand. No distinct-count exception is applied.

## 15.20 Project Occurrence and Series Identity

Visma contains Project IDs `26970` and `24970`. The application resolves them as separate 2026 and 2024 Project Occurrences in recurring series `970`, preserves both historical snapshots, and uses the complete five-digit ID for publication coverage and replacement. Replacing `26970` does not change `24970`. A malformed Project ID remains reviewable and blocks affected publication without a guessed year, series or canonical occurrence.

---

# 16. Deferred Enhancements

- manual PH entry for work whose PH cannot be calculated;
- event-specific mapping or KPI overrides;
- use of a future authoritative immutable Visma line identifier;
- effective dating for mapping and KPI versions beyond explicit version selection;
- API-based source replacement;
- Venyoo-triggered creation of a planning entry and discovery of current and retained historical Visma demand candidates for a Project Series, followed by planner selection independently by `Target Project Occurrence × Work Type × Phase`; every candidate and result shows its source year, and one effective basis applies to each selection so current and historical PH are not double counted;
- visible review and explicit audited `No demand to plan` confirmation for Venyoo occurrences with no discovered demand; absence of a candidate never silently proves zero work or removes the occurrence from the location calendar, and later discovered Visma demand reopens review without automatic selection or publication;
- review-only initial suggestions, sticky approved basis selections, comparison without plan mutation, and one consolidated readiness warning seven calendar days before each Venyoo Assembly or Dismantling start when any Work Type in that phase still uses historical demand; keeping historical demand requires a reason and remains effective until the corresponding current-year candidate changes materially;
- skill-aware capacity comparison for Nøkkelområder beyond the pooled permanent-capacity model governed by the PRD and Workspace design.

These decisions may extend the workflow later, but they must preserve the central invariants: every source line is possible work by default, booking lines remain source evidence, phases remain separate, known PH survives routing uncertainty, unresolved work remains visible, exclusion is explicit, mappings, Location/Hall mappings, KPIs and the active Venyoo dataset persist, and each Visma import is treated as a complete current snapshot for exactly the source Project IDs present in that export.

# Release-Candidate Reconciliation — 2026-10-01

The implemented authoritative path groups raw Visma rows by `Prosjekt × Work Anchor × Avdeling × Art.nr`, chooses `Stand` before `Trans.opplysn. 1`, and sums signed `Totalt antall` only as the measure. Each retained line reconciles through one Work Type Amount and separate Assembly and Dismantling outcomes. Amount status, PH status, four routing statuses and planner disposition remain independent through review and publication.

Publication now requires a current reviewed candidate and explicit confirmation. Legacy KPI-instance/counted-occurrence revisions are retained as read compatibility evidence only and are rejected by publication. Exact Project Occurrence replacement, retained unrelated projects and facts, persistent approved mappings/rates/bindings, explicit `Undetermined` and `Unresolved` routes, and atomicity are covered by the current automated suite.

# Correction Pass 1 — Review Aggregation and Venyoo Resolution

Raw Visma source aggregation remains exactly `Prosjekt × Work Anchor × Avdeling × Art.nr`. The review projection may combine those groups only when Project Occurrence, canonical Work Type, phase, Organization, Location, Nøkkelområde, unit, KPI/rate, amount/calculation state, all routing targets and statuses, planner disposition and every open mapping-decision boundary are compatible. Quantities and calculated PH sum without rounding. Incompatibility keeps rows separate. Each review aggregate retains the complete set of source groups, booking lines, source references, article numbers, Work Anchors, signed quantities, mapping-set evidence, rate evidence and issues. Constituent-line reconciliation, exact Project replacement and publication totals are invariant under this projection.

Reusable mapping review is value-based: each unresolved source product/article decision, `Avdeling`, project-qualified Location/Hall value or competence route appears once per compatible unresolved value. Approving the persistent mapping replays the retained source evidence and deterministically refreshes every affected aggregate. Aggregate dispositions likewise expand to the constituent phase work while retaining each constituent fingerprint and lineage.

The accepted Project Register is Venyoo's Project ID authority. Only a unique normalized `Navn` match resolves automatically; aliases require explicit approval and persist while compatible. Assigned IDs are exactly five digits. Provisional IDs are two year digits followed by three letters, compare case-insensitively, retain source spelling and carry an explicit provisional type. Malformed, duplicate-name/multiple-ID and conflicting-ID/name evidence remains unresolved. No fuzzy or first match is automatic.

Venyoo acceptance may include resolved events and reasoned `Awaiting Project ID / exclude from publication` events in one atomic command. Only resolved events create active event, phase, occupancy or project/location eligibility records. Deferred event evidence remains in the resolution ledger, is visibly not published, and can be reopened by later register or alias evidence. Reopening is review-required and never silent publication.

---

**End of Booking Demand Conversion and Review Contract v0.1**

# First Executable MVP Technical / Continuous Planning Workspace v0.1

**Document:** First Executable MVP Technical / Workspace Design  
**Version:** 0.1  
**Focus:** Continuous event-location and resource-planning workspace  
**Status:** Working Technical Baseline - Scope, Data Contract and Capacity Semantics Aligned  
**Date:** 2026-09-29  
**Product Authority:** Resource Planning Application PRD v0.8  
**Related Scheduling Design:** Scheduling Technical Design v0.3 - Scheduling Run

**Revision note:** The scope-alignment revision makes this document authoritative for first executable MVP interaction behavior. Manual daily allocation is authoritative; scheduling integration remains an optional evaluation or later-phase capability. The demand-conversion alignment adds staged raw Visma review, persistent Venyoo/mapping/KPI reuse, visible derivation provenance, explicit accepted-demand publication and protection of manual work across reimports. Published demand and its selected-source provenance are read-only in this workspace; demand candidates, basis changes, comparisons, readiness decisions and Demand Adjustments belong to a future separate Demand Management page. The capacity alignment adds application-maintained pooled permanent capacity, a generated Norwegian workday calendar, audited date overrides and negative-delta warnings. The workspace-composition alignment makes the vertically split Project/Location Calendar and resource-allocation matrix explicit as one synchronized planning surface.

---

# 1. Purpose

This document defines the minimum technical and interaction behavior of the primary planning workspace.

The PRD is authoritative for product outcomes, the roadmap and first executable MVP scope. The architecture decision is authoritative for implementation boundaries and technical constraints. Booking Demand Conversion and Review Contract v0.1 is authoritative for source-to-demand domain behavior. This document is authoritative for first executable MVP interaction behavior. The scheduling design is authoritative only for scheduling semantics when that capability is evaluated or implemented.

The workspace preserves the central strength of the current `Kalender` sheet: venue occupancy and resource planning are understood through direct visual alignment on one continuous horizontal calendar.

The workspace is not a generic Gantt replacement. Gantt behavior enhances the date-aligned grid through expandable hierarchy, summary spans, dependencies, milestones and conflict indicators.

The target product scheduling engine may later propose or recalculate allocations, but it does not define the workspace hierarchy or replace the event-location calendar. Production scheduling is not part of first executable MVP acceptance.

---

# 2. Core Workspace Invariant

The following information must be interpretable against one shared date coordinate system:

- event occupancy by canonical location;
- Venyoo venue phases: assembly, moving-in, event, moving-out and dismantling;
- booking-derived work-demand phase: assembly or dismantling;
- reviewed, undated Accepted Demand PH with optional read-only selected-source year and basis provenance;
- dated manual Allocated PH;
- pooled permanent daily capacity, delta and Additional PH Required context with settings and calendar provenance;
- read-only dependency, overlap, warning and issue context.

When a planner moves horizontally, changes the date scale or selects a date range, every visible workspace layer must remain aligned.

The planner must not need to read dates in one view and mentally compare them with dates in another view to understand the planning situation.

Visual context in the first executable MVP does not imply that constraint eligibility, conflict classification, dependency enforcement, crew rules or scheduling feasibility have been implemented.

---

# 3. Canonical Data and Visual Projections

The calendar grid is a projection of canonical records, not the persistence model.

Canonical records remain normalized around identities and date intervals or daily facts, including:

- Source Import, Source Record Reference and source-to-canonical identity binding;
- Event Occurrence;
- Canonical Location;
- Venue Occupancy and Event Phase interval;
- Planning Competence Area and canonical Organization;
- Demand Scope and Accepted Demand PH;
- Daily Resource Allocation with Allocated PH;
- versioned Permanent Crew settings and Workday Status overrides;
- Issue and Audit Entry.

Selected-demand source year and basis provenance, Work Type labels, Dependencies and source-supplied conflict status are optional read-only context. Demand Candidates, current/historical basis selection, candidate comparison, phase-readiness decisions and Demand Adjustments belong to a future dedicated Demand Management workspace and are not controls or editable records in the first-MVP planning workspace. Planning Competence Level, Planning Locks and generated scheduling records exist only when later personnel or scheduling behavior is evaluated or implemented.

Accepted Demand PH, Daily Allocated PH, Permanent Crew Count, Permanent Hours per Workday and manual Workday Status overrides are canonical facts. Visible Allocated PH, Total Allocated PH, Unallocated PH, Overallocated PH, Permanent Capacity PH, Permanent Capacity Delta PH, Additional PH Required and Display FTE are derived projections.

The application must not create a different plan when the planner changes grouping. All views query and aggregate the same canonical records.

---

# 4. Workspace Layers

The primary workspace is one vertically split resource-allocation planning surface, not a collection of independent calendars and not a simple Gantt.

Its composition is:

1. **Upper pane — Project/Location Calendar:** the event-location layer shows projects or event occurrences, canonical Locations/Halls, occupancy and phases across dates.
2. **Lower pane — Resource Allocation Matrix:** the resource-planning layer shows demand, editable daily allocations, totals, issues and applicable shared capacity context across the same dates.

The upper pane provides the operational calendar context for decisions made in the lower pane. Both panes must be available as parts of the same primary workspace so the planner can inspect project and location timing while allocating resources. They are not separate plans, independent routes or tabs that require dates to be compared mentally.

The panes share one date scale, selected period and horizontal position. A date column in the upper pane must align with the same date column in the lower pane. Vertical scrolling, row virtualization, grouping and expansion may differ because the panes have different row dimensions, but horizontal calendar behavior remains synchronized.

On narrower screens the panes may stack or require vertical movement, but their order, shared date state and single-workspace relationship remain unchanged. No fixed split ratio is required.

## 4.1 Event-Location Calendar

The event-location layer is the upper Project/Location Calendar pane and is always available in the primary workspace.

It displays:

- canonical locations as the stable row dimension;
- event occurrences occupying each location;
- event phases as dated spans;
- simultaneous or adjacent occupancy;
- location availability;
- possible conflicts and handovers;
- source freshness and unresolved identity where relevant.

The layer is derived through a first executable MVP venue data adapter. The accepted Venyoo `location_format` dataset is the persistent current project, Location/Hall and phase source until a subsequent Venyoo dataset is accepted; a future API may replace the workbook channel without changing workspace behavior. Where the source lacks a canonical identity, the import review must show the proposed alias binding or unresolved identity rather than silently joining by name.

Occupancy and conflict are separate concepts. An overlap is visible source context. The first executable MVP does not classify or enforce conflicts; it displays overlap and any supplied issue status. A later constraint rule may classify an overlap using location scope, phase, access requirements and available timestamp precision.

## 4.2 Resource-Planning Calendar

The resource layer is the lower Resource Allocation Matrix pane. It displays the planning facts and measures selected by the active view and is the primary manual allocation surface.

At minimum it supports:

- Accepted Demand PH;
- Daily Allocated PH;
- Visible Allocated PH and Total Allocated PH;
- Unallocated PH and Overallocated PH;
- Display FTE;
- pooled Permanent Capacity PH with settings and workday-calendar provenance;
- daily Permanent Capacity Delta PH and Additional PH Required warning;
- manual change and audit state.

Manual daily allocation remains the authoritative editable calendar surface in the first executable MVP. Summary spans and totals are derived representations. Permanently coverable demand, scheduler-derived Residual Additional Resource Need, generated states and functional Planning Locks are not first executable MVP requirements.

Accepted demand comes from an explicitly published staged set. Raw Visma parsing, mapping or successful PH calculation does not create accepted demand by itself. Publication follows Booking Demand Conversion and Review Contract v0.1 and binds the reviewed booking snapshot, mapping, KPI and canonical-context versions. The workspace must make accepted-demand provenance and assurance inspectable and must keep previously published demand versions available when they explain retained manual allocations.

Every retained booking line and applicable phase is possible work unless an approved rule marks it Not applicable or the planner explicitly excludes it. The review surface shows PH calculation status, routing status for Event/Project, Location/Hall, Organization and Nøkkelområde, and planner disposition independently. Known PH is retained when the planner publishes through an explicit placeholder route. Only work whose PH cannot be calculated uses an explicitly labelled `0 PH` unknown-demand placeholder.

The lower pane must expose placeholder routes as ordinary inspectable branches where applicable: Event/Project `Undetermined`, Location `Undetermined`, Organization `Undetermined`, and competence `Unresolved`. These branches retain open Issues and must not be presented as resolved real-world mappings. Work still awaiting a routing choice remains in the review queue and cannot disappear from possible-work accounting.

Accepted Demand PH is an undated total at one active Demand Scope. Daily Allocated PH is the authoritative amount manually assigned to one date. The date viewport controls Visible Allocated PH but does not redistribute Accepted Demand PH or change Total Allocated PH, Unallocated PH or Overallocated PH.

Manual allocation may exceed Accepted Demand PH. The allocation remains visible and editable, Overallocated PH is shown, and an Issue is created or updated. The Demand Scope is not presented as cleanly reconciled until the Issue is resolved or explicitly waived.

For one compatible active Demand Scope `s`:

	Total Allocated PH(s) = sum of active allocations across all dates resolving to s
	Raw Demand Balance PH(s) = Accepted Demand PH(s) - Total Allocated PH(s)
	Unallocated PH(s) = max(0, Raw Demand Balance PH(s))
	Overallocated PH(s) = max(0, -Raw Demand Balance PH(s))

The workspace preserves `Accepted Demand PH + Overallocated PH = Total Allocated PH + Unallocated PH`.

## 4.3 Capacity and Variance Context

Pooled permanent-crew capacity is operational first-MVP context maintained in the application. The versioned defaults are 17 crew and 7.5 hours per workday. Current `Kalender` capacity ranges remain evidence only and do not populate this calendar.

The workspace must be able to show date-aligned totals for:

- Allocated PH;
- Permanent Capacity PH;
- Permanent Capacity Delta PH;
- Additional PH Required.

The comparison surface is labelled `Allocation vs permanent capacity`. Its result labels are `Permanent capacity delta` and `Additional PH required`.

Every value and summary exposes the active crew count, hours per workday, generated calendar-rule version and any manual date override.

Capacity scope is `date` for one pooled permanent crew. It is compared only with complete Total Daily Allocated PH across all competences. Filtered or grouped subsets must not receive a proportional share or a misleading numeric comparison.

Capacity is shared across Events, Organizations, Locations, Work Types and competences. Projections show it once in a shared context band and never repeat, sum, split or proportionally assign it to branches. It is operational pooled capacity, but not skill feasibility, named-worker availability or a Phase C constraint result.

For one date `d`:

	Permanent Capacity PH(d) = Workday(d) ? 17 × 7.5 : 0
	Permanent Capacity Delta PH(d) = Permanent Capacity PH(d) - Total Daily Allocated PH(d)
	Additional PH Required(d) = max(0, -Permanent Capacity Delta PH(d))

Saturdays, Sundays and Norwegian national public holidays are generated as non-workdays in Europe/Oslo. Audited manual date overrides may mark any date working or non-working. Allocation remains editable on zero-capacity dates, where any positive allocation creates a warning.

## 4.4 Import Review and Adoption

Adapters stage import envelopes and issues; they never write directly to the active workspace. Import review must show the source, profile version, validation result, assurance state, identity changes, demand-scope changes, total changes, invalid rows and affected manual records.

Publication requires an explicit adoption action. For accepted demand, the action records the adopting actor, time, import batch and source references. For reviewed workbook allocations, the action preserves workbook origin and writes one adoption audit entry. It must not invent an original planner, timestamp, reason or historical sequence.

Import review must never use one unresolved flag for both arithmetic and placement. It reports unknown PH separately from routing review. A planner-selected placeholder makes the route publishable through Flag for review, retains any calculated PH, and creates an open Issue. A route still awaiting a real or placeholder choice blocks that item from publication but leaves it visible as possible work.

Mapping review exposes one editable human-readable Work Type label. It must not show a second editable task label, KPI label or `Shared KPI definition` containing the same text. The workspace may show derived read-only `Work Type label - unit` context and separate assembly and dismantling rates.

Unresolved identities, removed demand scopes, allocations that no longer resolve to active demand, and allocated PH above newly accepted PH remain visible as Issues until explicitly reconciled.

---

# 5. Shared Date Axis

The workspace uses one date-axis state containing:

- visible start and end dates;
- date-column width or supported zoom level;
- horizontal scroll position;
- calendar and locale rules;
- weekend and holiday presentation;
- selected date or date range.

Every synchronized layer consumes this state. A layer must not maintain an independent horizontal calendar while shown in the same workspace.

The implementation should virtualize rows and date columns so the planner can navigate a long horizon without making a fixed 24-month grid the data model.

Identifiers, labels and hierarchy controls remain visible while dates scroll horizontally.

The workspace distinguishes three allocation horizons:

- **Daily Allocated PH:** allocation on one date;
- **Visible Allocated PH:** allocation inside the displayed or explicitly selected dates;
- **Total Allocated PH:** allocation across all active dates for a Demand Scope.

Changing the date viewport changes Visible Allocated PH and the stated capacity-summary period. It must not change Accepted Demand PH, Total Allocated PH, Unallocated PH or Overallocated PH.

---

# 6. Query-Like Planning Views

A Planning View is a temporary projection over canonical planning data in the first executable MVP. Persisted Planning View Definitions are a later-roadmap capability.

It contains:

| Property | Meaning |
|---|---|
| Date range | Calendar horizon shown by the view |
| Filters | Included events, locations, departments, competencies, phases or other governed dimensions |
| Row groups | Ordered hierarchy used to construct rows |
| Measures | Values shown in daily cells and summaries |
| Sort | Stable ordering within each grouping level |
| Expansion state | Expanded and collapsed hierarchy nodes |
| Display options | Approved overlays such as dependencies, capacity and issues |

Initial governed grouping dimensions include, where data is available and semantically resolved:

- Event;
- Canonical Location;
- Competence;
- Phase;
- Organization, resolved from operational Visma `Avdeling` through persistent source-specific mappings.

Optional read-only source context may additionally expose Work Type, selected-demand source year and basis provenance, internal or external fulfillment and issue classification. Alternative Demand Candidates and demand-management controls are not shown in this workspace. Lock state is available only in a scheduling-evaluation or later scheduling context.

Examples include:

- Event -> Competence;
- Event -> Location -> Competence;
- Event -> Organization -> Competence;
- Competence -> Event;
- Location -> Event -> Phase.

The query layer must use stable field identifiers. User-facing labels may be localized or renamed without changing saved-view meaning.

Organization is the canonical grouping dimension. Operational raw Visma `Avdeling` resolves through a persistent source-specific mapping. Legacy `Fakturamottaker` remains separate evidence and may join an Organization only through its own approved binding. The query model preserves the original source field and value and never silently merges the two fields.

Phase filters distinguish Work-Demand Phase from Venyoo Venue Phase. Imported demand is `assembly` or `dismantling`; the upper calendar may show all five venue phases. A dated allocation does not change the work-demand phase merely because its date intersects moving-in, event or moving-out.

`Nøkkelområde` is the flat first-MVP demand grouping used by workspace queries. It has no level, subskill or worker-qualification semantics. `Unresolved` is an explicit member of the same flat grouping. Later worker skills and levels remain separate from these allocation facts.

Demand and allocation filters may use Event, Planning Competence Area, Organization, Work-Demand Phase, location, Demand Scope and applicable dates. Venue filters may use Venyoo Venue Phase. Permanent capacity has date-only pooled scope. Grouping does not filter facts.

If the active view filters by Event, competence, Location, Work-Demand Phase, Work Type or Organization, the filtered subtotal is not compared with the complete permanent crew pool. The workspace retains one shared date-level capacity context outside the hierarchy and does not calculate branch-level delta.

Totals for Accepted Demand PH, allocation measures and permanent-capacity periods remain invariant when grouping order or expansion changes. No skill-specific capacity is inferred from the pooled total.

---

# 7. Hierarchy, Collapse and Expansion

Grouped rows form a tree.

Each node must expose:

- stable identity derived from its grouping path;
- grouping label and type;
- aggregate measures for the active date range;
- child count and expansion state;
- issue, conflict and unresolved-demand indicators;
- earliest and latest relevant dates where a summary span is shown.

Collapsing a node hides detail but must not remove its demand, allocations, warnings or conflicts from aggregate totals.

Capacity is not part of an Event or Organization node's aggregate. When enabled in such a projection, it appears once as shared context and does not change as branches are expanded or collapsed.

Expanding an event may reveal locations, competencies, phases, work types or other dimensions according to the active view definition. Expansion must not be hardcoded to one event-to-competence hierarchy.

---

# 8. Gantt Enhancements

Gantt behavior is an enhancement of the continuous grid and may include:

- derived summary spans over daily allocations;
- venue phase bars;
- event and work milestones;
- dependency lines between visible nodes;
- dependency state and warning indicators;
- drag or resize interactions that result in explicit allocation changes;
- critical or constrained intervals where supported by declared rules.

For the first executable MVP, dependency, overlap, shortage and constrained-interval indicators are read-only visual context. They must not imply that the Phase C constraint engine or production scheduling behavior exists.

The daily allocation records remain authoritative. A bar must not become an independent schedule that can disagree with its underlying daily cells.

When a dependency endpoint is hidden by grouping or collapse, the workspace should attach the dependency indicator to the nearest visible ancestor and disclose the hidden endpoint on inspection.

Dependency overlays must be optional when their density would obscure daily planning.

---

# 9. Editing and Writeback

The workspace must distinguish editable leaf rows from aggregate rows.

Rules:

1. A leaf allocation cell may be edited when its complete demand and allocation scope is known.
2. An aggregate cell is read-only by default.
3. Editing an aggregate requires an explicit distribution operation that states the affected scope and distribution rule before writeback.
4. Changing filters, grouping, sorting or expansion never changes the plan.
5. Manual daily allocation is authoritative in the first executable MVP; Accepted Demand and calculated PH are read-only in this workspace, and Demand Adjustments are created only in a future separate Demand Management workspace.
6. Edits preserve before-and-after values, planner identity, timestamp and relevant warnings.
7. Generated allocation state, functional Planning Locks, scheduler-derived Residual Additional Resource Need and scheduling writeback are not required.
8. Reimport never deletes or rewrites a user-owned manual allocation automatically.
9. Source-fact versions may change, but canonical event, location, competence and demand-scope identities remain stable unless an identity reconciliation is explicitly reviewed and adopted.
10. A demand change retains the prior published version needed to explain manual allocations and creates Issues for unresolved scope or over-allocation.
11. An allocation that no longer resolves to active Accepted Demand remains stored, visible, editable and flagged. It is excluded from active-demand reconciliation.
12. An unresolved allocation still consumes capacity when its date and Planning Competence Area resolve. If either capacity dimension is unresolved, the affected capacity comparison is unavailable.
13. Reimport or reconciliation never silently deletes, zeroes or detaches an unresolved allocation.

This prevents a convenient grouped view from silently spreading or overwriting demand at a different grain.

---

# 10. Scheduling-Run Integration

The scheduling run is an optional evaluation track built on the first executable MVP foundations. Production scheduling remains a later phase. The scheduling evaluation may read canonical demand, venue, capacity, rule and lock fixtures and may produce proposed allocations, issues and explanations in an isolated evaluation workflow.

The workspace:

- exists before any scheduling run;
- shows venue occupancy even when demand is incomplete;
- shows accepted but unallocated demand;
- may display evaluation output separately from authoritative manual daily allocation;
- preserves viewport and view configuration where possible;
- exposes explanations without replacing calendar context.

Scheduling evaluation output and writeback are not first executable MVP acceptance requirements. Any later scheduling implementation must not persist row positions, expansion state or a fixed visual hierarchy as planning facts.

---

# 11. First Executable MVP Workspace Acceptance Criteria

The first executable MVP workspace is acceptable when it can:

1. stage, review and explicitly publish venue context through a first executable MVP data adapter, then render event phases by canonical location in the upper Project/Location Calendar;
2. display venue occupancy on a continuous horizontal date axis in that upper pane;
3. display undated Accepted Demand PH and dated Daily Allocated PH in the lower Resource Allocation Matrix on the same planning surface and date axis;
4. keep the upper Project/Location Calendar, lower Resource Allocation Matrix and shared capacity context synchronized during horizontal navigation;
5. preserve identifying columns while dates scroll;
6. expose overlapping phases and possible location conflicts without treating every overlap as automatically invalid;
7. group resource rows by Event -> Competence;
8. regroup the same data by at least one alternative hierarchy without creating another plan;
9. expand and collapse grouped rows without losing totals or issue indicators;
10. show explicitly adopted Accepted Demand PH, Total Allocated PH, Unallocated PH and Overallocated PH with provenance, and keep them unchanged when the date viewport changes;
11. show Total Daily Allocated PH beside pooled Permanent Capacity PH, Permanent Capacity Delta and Additional PH Required, with settings and calendar provenance;
12. edit an eligible leaf allocation cell with traceable writeback;
13. prevent ambiguous direct editing of aggregate cells;
14. render read-only dependency indicators without replacing the daily grid or implying dependency enforcement;
15. preserve authoritative manual daily allocation across reimports, keep its application audit history separate from future Demand Management history, and avoid fabricating imported allocation history;
16. support a flexible date horizon without storing one field per displayed date;
17. retain Accepted Demand PH, allocation totals and pooled capacity-period totals when grouping, sorting or expansion changes, and avoid duplicating capacity across branches;
18. generate Norwegian non-workdays, permit audited date overrides and reject conflicting active settings or overrides;
19. retain and flag allocations that no longer resolve to active demand, exclude them from active-demand reconciliation where required, and include every dated PH value in pooled capacity use;
20. allow manual over-allocation while showing Overallocated PH, maintaining an Issue and preserving editability;
21. calculate Permanent Capacity Delta as permanent capacity minus complete daily allocation and warn whenever it is negative;
22. aggregate in PH before deriving one-decimal Display FTE, keep PH authoritative and label the configured PH-per-FTE-day value;
23. expose crew settings, generated calendar rule and manual overrides wherever permanent capacity or delta is shown.

`First Executable MVP Acceptance Pack v0.1` defines the deterministic workspace fixture, expected visible results, mutation cases and objective verification mapping for W1-W23. It realizes these interaction requirements without extending them.

---

# 12. First Executable MVP Boundary

The first executable MVP validates the browser-local continuous planning workspace before production automatic scheduling.

It should use a real planning horizon containing VVS 2026 and overlapping events and should demonstrate:

- the event-location calendar derived from the venue data;
- synchronized resource rows;
- Event -> Competence grouping;
- Event -> Organization -> Competence grouping where source coverage permits;
- expand and collapse behavior;
- daily allocation editing;
- pooled permanent capacity by date and negative-delta warnings with settings and calendar provenance;
- one or more read-only visible dependency relationships.

The first executable MVP uses replaceable adapters for the persistent dated Venyoo project-location ledger, complete raw Visma booking snapshots, versioned mapping and KPI reference data, reviewed published demand, optional adopted workbook allocations and read-only dependency context. Pooled permanent capacity is maintained directly in the application. A Visma publication replaces demand for exactly the source Project IDs present in that export. Venyoo supplies eligible project locations and calendar context but never expands demand coverage. Routine operation requires only a new Visma export; Venyoo, mapping and KPI workbooks are uploaded again only when their corresponding context changes. `Tabell_oppgaver` remains legacy converted-planner evidence and compatibility input, while `Kalender` remains primarily a derived presentation.

The approved demonstration fixture uses a versioned workspace setting of `displayHoursPerFteDay=7.5`. PH remains authoritative; exact PH is summed before one conversion and deterministic half-up rounding to one decimal. Display FTE is an FTE-day equivalent, not worker count, and is never summed from rounded daily values or written back as planning data.

Worker-skill overlap and levels, absence, hired-help and overtime capacity remain unresolved. Source files do not declare profile versions; the application selects its internal version from structural evidence. The adapter boundary must allow APIs to replace file-based inputs without changing domain or workspace behavior.

Real personnel records, named-worker assignment, production worker-level feasibility, generated allocation states, functional Planning Locks, scheduler-derived residual-need semantics and scheduling writeback are outside first executable MVP acceptance.

# Release-Candidate Reconciliation — 2026-10-01

Browser validation confirms the implemented Planning surface is one synchronized upper Project/Location Calendar and lower Resource Allocation Matrix. Accepted Demand is read-only; only allocation leaves are editable. The date viewport, zoom, shared horizontal position, virtualized bands, overlays and navigation remain aligned. Pooled capacity is shown once outside hierarchy branches and continues to use complete allocations when Planning filters are active. Published unresolved work remains visible without inventing PH.

Data Review owns staging, routing, disposition and publication; Mappings owns reusable Work Type/KPI configuration; Workspace Data owns capacity settings, workday overrides, backup/restore, operational rebuild, and audit/provenance context. Demand Management and scheduling remain separate deferred capabilities.

# Correction Pass 1 — Data Review Interaction

Data Review shows the active project-register filename, checksum, version, row count, distinct-ID count and acceptance time. A Venyoo review reports resolved, ambiguous, awaiting-ID and excluded counts. Project resolution is a separate section from canonical Location approval. Deferred events remain discoverable in the accepted dataset, preserve their source phase/location evidence, and can be reopened when new Project ID evidence appears.

The Visma review table defaults to compatible planning aggregates. Filters, aggregate checkboxes, filtered select-all and bulk disposition expand to the exact constituent phase work before the audited decision command runs. Expandable lineage shows source aggregation groups first and raw booking-line IDs beneath them. Raw evidence remains inspectable without becoming the primary operational queue. Planning remains read-only for project identity and demand conversion; these controls do not move into the main Planning workspace.

At narrow widths the table remains horizontally contained within its review section; application navigation and page content do not create page-level overflow. At desktop width the aggregate table prioritizes Project, Work Type, phase, quantity, PH, routing and disposition while keeping lineage on demand.

---

**End of First Executable MVP Technical / Continuous Planning Workspace v0.1**

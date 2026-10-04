# Architecture Decision — Browser-Local First Executable MVP Application Stack

**Document:** Architecture Decision Record  
**Version:** 0.1  
**Status:** Accepted Technical Direction - Scope, Data Contract and Capacity Semantics Aligned  
**Date:** 2026-09-29  
**Related PRD:** Resource Planning Application PRD v0.8  
**Related Workspace Design:** First Executable MVP Technical / Continuous Planning Workspace v0.1  
**Related Scheduling Design:** Scheduling Technical Design v0.3 - Scheduling Run

**Decision summary:** Build the first executable MVP as a browser-only React and TypeScript continuous planning workspace using Vite, TanStack Table and TanStack Virtual, Dexie over IndexedDB for local persistence, and ExcelJS in a Web Worker for workbook import. The browser-local boundary includes governed raw Visma conversion, persistent Venyoo/mapping/KPI configuration, explicit demand review and atomic publication. Keep domain and persistence boundaries independent so Dexie can later be replaced or supplemented by Supabase without rewriting the workspace. Production automatic scheduling and worker-level feasibility are later-phase capabilities; scheduling evaluation may use synthetic or anonymized worker fixtures.

**Revision note:** The scope-alignment revision makes this document authoritative for the first executable MVP implementation boundary and technical constraints. The demand-conversion alignment replaces the former planning-ready-baseline boundary with staged raw Visma conversion, persistent approved reference configuration, stable source-to-canonical identity bindings, explicit review, atomic publication and reimport protection. Published demand is read-only in the first-MVP Planning Workspace; basis selection, candidate comparison, readiness decisions and Demand Adjustments belong to a future dedicated Demand Management page. The capacity alignment defines application-maintained pooled permanent capacity, the generated Norwegian workday calendar, audited date overrides, negative-delta warnings, viewport-independent demand reconciliation and display-only FTE conversion. It does not define target product outcomes, workspace interaction semantics or scheduling semantics.

---

# 1. Purpose

This document records the selected application stack and implementation boundary for the first executable MVP.

The decision is driven by the need to build and validate the continuous event-location and resource-planning workspace before introducing hosted infrastructure or advanced schedule generation.

The first executable MVP must run as an application in a web browser. It must not require a packaged desktop executable, paid component library or paid hosted service.

The PRD is authoritative for product outcomes, the roadmap and first executable MVP scope. This architecture decision is authoritative for implementation boundaries and technical constraints. Booking Demand Conversion and Review Contract v0.1 is authoritative for source-to-demand domain behavior. The workspace design is authoritative for first executable MVP interaction behavior. The scheduling design is authoritative for scheduling semantics when that capability is evaluated or implemented.

---

# 2. Decision Drivers

The architecture must support:

- a continuous horizontal calendar with dates as columns;
- venue locations and event phases visible against the calendar;
- undated Accepted Demand PH, dated Allocated PH and pooled permanent daily capacity in one synchronized workspace;
- large row and date ranges without rendering every cell simultaneously;
- expandable and collapsible planning hierarchies;
- query-like filtering, grouping and aggregation;
- projections such as Event -> Competence and Event -> Organization -> Competence;
- precise daily-cell editing;
- read-only dependency and summary-span overlays without replacing the daily grid or implying constraint enforcement;
- import from existing Excel workbooks;
- local-only persistence for the first executable MVP;
- traceable source data, changes and overrides;
- a future migration path to Supabase and Postgres;
- no paid runtime libraries or services;
- no Electron, Tauri or other packaged desktop application.

---

# 3. Constraints

## 3.1 Runtime

The application runs in a supported web browser.

The production artifact consists of static HTML, CSS, JavaScript and related browser assets. It is served over HTTP or HTTPS and is not opened directly through `file://`.

Node.js and development tools may be used to build and test the application. They are development dependencies, not part of a packaged end-user executable.

## 3.2 Persistence

First executable MVP application data remains in the user's browser profile and does not require a remote database.

Browser-local persistence must be treated as origin-bound and device-bound. Backup and restore are therefore required first executable MVP safety capabilities, not optional future enhancements.

## 3.3 Licensing

Runtime dependencies must use licenses suitable for the project without requiring a commercial runtime license.

Relevant premium features in otherwise free products must not become hidden architectural dependencies.

## 3.4 Future Hosting

Supabase is the intended future expansion path after the workspace proof of concept. The first executable MVP must not require Supabase, authentication, synchronization or hosted collaboration to function.

---

# 4. Selected Stack

| Area | Selection | Role |
|---|---|---|
| Language | TypeScript | Domain records, application services, import validation and UI |
| UI framework | React | Interactive browser application and component model |
| Build tool | Vite | Local development, testing integration and static production build |
| Row model | TanStack Table | Headless sorting, filtering, grouping, aggregation and row hierarchy |
| Virtualization | TanStack Virtual | Horizontal date-column and vertical row virtualization |
| Local database | IndexedDB through Dexie | Structured local persistence, indexes, transactions and reactive queries |
| Workbook import | ExcelJS | Browser-side `.xlsx` reading |
| Import execution | Browser Web Worker | Workbook parsing without blocking the workspace UI |
| Runtime validation | Zod | Validation at import, persistence and adapter boundaries |
| Date utilities | date-fns | Explicit date arithmetic and calendar transformations |
| Accessible primitives | Radix UI | Menus, dialogs, popovers, tooltips and other interaction primitives |
| Icons | Lucide React | Consistent interface icons |
| Styling | CSS Modules and CSS variables | Precise dense-workspace layout and visual tokens |
| Unit tests | Vitest | Domain, projection, import and storage tests |
| Component tests | React Testing Library | Interaction and accessibility-oriented component tests |
| Browser tests | Playwright | End-to-end workflows, rendering and viewport verification |

Dependency versions must be pinned through the project lockfile. Licenses must be checked when dependencies are introduced or materially upgraded.

---

# 5. Application Shape

The initial data flow is:

	Excel Workbook
	      ↓
	Browser File Selection
	      ↓
	Web Worker Import Adapter
	      ↓
	Validation and Canonical Mapping
	      ↓
	Application Commands and Domain Rules
	      ↓
	IndexedDB through Dexie
	      ↓
	Query and Projection Engine
	      ↓
	Continuous Planning Workspace

The workspace never reads Excel cells directly. Imported workbook content is converted into canonical records first.

UI components do not write directly to Dexie tables. Writes pass through application commands so validation, audit records and planning invariants are applied consistently.

---

# 6. Architectural Layers

## 6.1 Domain

The domain layer contains storage-independent types and pure rules for:

- event identity;
- venue occupancy and phases;
- planning windows;
- Organization and source-specific Organization bindings;
- planning competence area and level;
- demand and demand basis;
- daily allocation;
- capacity and variance;
- dependencies;
- conflicts and issues;
- locks and manual changes.

The domain layer must not import React, Dexie, Supabase or ExcelJS.

## 6.2 Application

The application layer coordinates use cases such as:

- stage an import envelope;
- maintain persistent Venyoo, mapping and KPI reference versions;
- derive reviewable phase work and competence-demand PH from a raw booking snapshot;
- review and atomically publish an accepted source snapshot;
- reconcile source-to-canonical identity bindings;
- explicitly adopt accepted demand;
- adopt an optional workbook allocation baseline;
- construct a planning view;
- change a leaf allocation;
- export or restore an application backup.

Demand Adjustment, Schedule Override, Planning Lock and scheduling writeback commands belong to later roadmap or scheduling-evaluation behavior. Demand Candidate discovery, basis selection, historical/current comparison, phase-readiness decisions and Demand Adjustment commands belong to a future dedicated Demand Management application surface. They are not commands of the first-MVP Planning Workspace, which queries published Accepted Demand and selected-basis provenance read-only while retaining manual allocation as its demand-related editing workflow.

Application commands return explicit results and issues. They must not communicate failure only through UI notifications.

## 6.3 Adapters

Inbound planning adapters and the application-owned publication boundary return staged or reviewed records rather than allowing source adapters to write directly to repositories:

| Adapter contract | Responsibility | Canonical drafts produced |
|---|---|---|
| `VenueContextAdapter` | Persistent dated Venyoo project-location ledger, occupancy and five-phase venue context | Dataset date coverage, Event Occurrence, Event Alias and Source-to-Canonical Identity Binding where needed, Canonical Location, project-location eligibility, Venue Occupancy Interval, Event Phase Interval, Source Record Reference and Issue |
| `BookingDemandImportAdapter` | Complete raw Visma booking snapshot for every source Project ID present in the export | Covered source Project ID set, Booking Line Item, source `Avdeling`, source quantity evidence, Source Record Reference and structural Issue |
| `MappingAndKpiAdapter` | Optional updates to persistent Work Type, quantity, Nøkkelområde, Location/Hall and phase-rate configuration | Versioned mapping and KPI candidates, provenance and review Issues |
| `DemandPublicationService` | Apply approved persistent configuration and publish reviewed derived demand | Work Type Amount, Phase Work Item, Demand Scope, Accepted Demand, unresolved work item, Source Record Reference and Issue |
| `PermanentCapacityCalendar` | Maintain the pooled permanent-crew baseline, Norwegian workday calendar and manual date overrides | Versioned crew settings, Workday Status, Daily Permanent Capacity PH, Audit Entry and Issue |
| `WorkspaceSeedAdapter` | Optional migration of reviewed workbook allocations and read-only dependency context | Daily Resource Allocation, Dependency, Source Record Reference and Issue |

Each inbound adapter returns a `Source Import`, source-record references, canonical drafts and validation issues. A future venue or planning API implements the same contract as a workbook adapter.

Technical adapters also include the Dexie persistence adapter, JSON backup and restore adapter, and future Supabase persistence adapter.

## 6.4 Presentation

The React presentation layer contains:

- continuous planning workspace;
- event-location calendar;
- resource-planning calendar;
- capacity and variance bands;
- planning-view controls;
- import review;
- issue inspection;
- editing and audit interactions.

The presentation layer consumes application queries and commands. It does not own canonical planning state.

---

# 7. Canonical Record Boundary

## 7.1 Record Classification

**Required first executable MVP records:**

- Workspace;
- Source Import;
- Source Record Reference;
- Booking Snapshot and Booking Line Item;
- Source-to-Canonical Identity Binding;
- accepted Venyoo Location Dataset version;
- Mapping Rule and approved mapping version;
- Work Type definition with one stable identity and one editable label;
- Productivity Rate keyed by Work Type identity, unit and phase, with approved KPI dataset version;
- Work Type Amount;
- assembly or dismantling Work-Demand Phase Item;
- planner disposition and demand-publication batch;
- Event Occurrence;
- Event Alias where cross-source resolution is needed;
- Canonical Location;
- Venue Occupancy Interval;
- Event Phase Interval;
- canonical Organization and source-specific Organization Binding;
- Planning Competence Area;
- Demand Scope;
- Accepted Demand;
- Daily Resource Allocation;
- controlled aggregate Daily Capacity;
- Issue;
- Audit Entry;
- import-profile version.

**Optional read-only context:** selected-demand source year and basis provenance; Work Type label; Dependency; source-supplied conflict status. Demand Candidates, basis-selection controls, candidate comparison and Demand Adjustments are excluded from the first-MVP planning workspace. Planning Competence Level belongs to later personnel capability and is not a first-MVP demand dimension.

**Scheduling-evaluation extensions:** Planning Lock; generated-allocation state; worker-capacity fixtures; scheduler-derived residual need; scheduling-run input and output records.

**Later dedicated Demand Management workspace:** advanced Composite Work Rule where one source scope intentionally creates several additive Work Types; Event Series and historical-reference governance; Venyoo-triggered planning entries and discovery of source-year-labelled current and historical Visma Demand Candidates; review-required no-demand entries, audited `No demand to plan` confirmation and deterministic review reopening when later Visma demand appears; review-only initial basis suggestions, sticky approved selections and non-mutating candidate comparison; one consolidated project-phase readiness warning seven calendar days before each Venyoo Assembly or Dismantling start; one effective demand-basis selection per `Target Event Occurrence × Work Type × Phase`; editable multi-source demand-candidate and adjustment governance. Other later roadmap records include workforce and personnel records, production conflict classification and persisted Planning View Definition.

FTE, shortage, surplus, unallocated demand, grouped rows, summary spans and visual overlap are derived projections, not independent canonical facts.

## 7.2 Stable Identity and Versioned Source Facts

Stable canonical identities use application-owned IDs and remain stable across reimports. Versioned source facts and Source Record References may be superseded, but a reimport must not recreate or silently replace Event Occurrence, Canonical Location, Planning Competence Area or Demand Scope identities referenced by manual allocations, audits or workspace state.

A Source-to-Canonical Identity Binding explicitly associates a source identity with a stable canonical identity. Creating or changing a binding requires import review. Identity remapping must report affected manual records and is published only through an explicit reconciliation command. Canonical attribute changes are versioned consequences of reviewed reconciliation, not direct source overwrites.

Records use ISO calendar dates, schema version, creation and update timestamps, and a `workspaceId`. Date intervals are stored as start and end values. Daily allocations and capacity are dated records. Displayed date columns are projections and are never persisted as one field per date.

## 7.3 Provenance and Status Contract

Imported, manual and derived records carry these mandatory dimensions:

| Field | Controlled values or rule |
|---|---|
| `originType` | `workbook`, `api`, `fixture`, `manual`, `derived` |
| `validationStatus` | `pending`, `valid`, `invalid` |
| `assuranceStatus` | `unverified`, `reviewed`, `approved_for_planning` |
| `recordLifecycle` | `active`, `superseded`, `rejected` |
| `ownership` | `source`, `user`, `system` |

Imported provenance also retains a source reference, import-profile version, import timestamp, and source effective date where supplied. Derived booking demand retains the executed mapping, quantity, KPI, Nøkkelområde, Location/Hall and conversion versions required to reproduce its result. Manual and derived records retain their applicable actor or derivation references without fabricating source-import metadata.

Completeness and freshness are import- or dataset-level metadata by default. Record-level exceptions are allowed only when needed. Freshness remains `unknown` until a policy exists. Issue severity and issue lifecycle belong only to Issue records.

Permanent-capacity settings and date overrides have `originType=manual`, user ownership and audit provenance. Generated Norwegian weekend and public-holiday classifications have `originType=derived` and identify the calendar-rule version. Historical fixture capacity remains fixture evidence and is never promoted into operational capacity.

## 7.4 Capacity, Allocation and Variance Measures

Canonical facts are:

- **Accepted Demand PH:** an explicitly adopted, undated total at one active Demand Scope;
- **Daily Allocated PH:** the PH on one active Daily Resource Allocation assigned to one date and Demand Scope;
- **Permanent Crew Count:** versioned pooled headcount maintained in the workspace; first-MVP default `17`;
- **Permanent Hours per Workday:** versioned hours per crew member; first-MVP default `7.5`;
- **Workday Status:** generated Norwegian calendar classification plus any audited manual date override;
- **Permanent Capacity PH:** pooled capacity for one date, equal to crew count times hours per workday on a workday and `0 PH` otherwise.

Derived projections are Visible Allocated PH, Total Allocated PH, Unallocated PH, Overallocated PH, Permanent Capacity Delta PH, Additional PH Required and Display FTE.

For compatible active Demand Scope `s`:

	Total Allocated PH(s) = sum of active allocations across all dates resolving to s
	Raw Demand Balance PH(s) = Accepted Demand PH(s) - Total Allocated PH(s)
	Unallocated PH(s) = max(0, Raw Demand Balance PH(s))
	Overallocated PH(s) = max(0, -Raw Demand Balance PH(s))

The conservation invariant is:

	Accepted Demand PH + Overallocated PH
	= Total Allocated PH + Unallocated PH

Manual allocation is not clamped to Accepted Demand PH. When Overallocated PH is positive, the allocation remains visible and editable, an Issue is created or updated, and the Demand Scope is not cleanly reconciled until the Issue is resolved or explicitly waived.

For date `d`:

	Permanent Capacity PH(d)
	= Workday(d) ? Permanent Crew Count × Permanent Hours per Workday : 0

	Permanent Capacity Delta PH(d)
	= Permanent Capacity PH(d) - Total Daily Allocated PH(d)

	Additional PH Required(d)
	= max(0, -Permanent Capacity Delta PH(d))

A negative Permanent Capacity Delta creates or updates a visible warning for that date. It does not create hired-help or overtime capacity and is not scheduler-derived residual need.

## 7.5 Allocation Horizons and Unresolved Allocations

- **Daily Allocated PH** is allocation on one date.
- **Visible Allocated PH** is allocation inside the displayed or selected dates.
- **Total Allocated PH** is allocation across all active dates for a Demand Scope.

Accepted Demand PH, Total Allocated PH, Unallocated PH and Overallocated PH do not change when the date viewport changes. Capacity-period summaries use the displayed or explicitly selected dates and state that period.

An allocation that no longer resolves to active Accepted Demand remains stored, visible, editable and flagged. It is excluded from active-demand reconciliation. It continues to consume capacity when its date and Planning Competence Area remain resolvable. If either capacity dimension is unresolved, the affected capacity comparison is unavailable; the allocation is never silently omitted, zeroed or detached.

## 7.6 Display FTE Configuration

The Workspace owns a versioned `displayHoursPerFteDay` setting. The approved demonstration value is `7.5`.

	Display FTE = PH / displayHoursPerFteDay

Display FTE is labelled `Display FTE` or `FTE-day equivalent`, with the PH-per-day value visible. It is not worker count. Exact PH is summed first, converted once and rounded to one decimal using deterministic half-up rounding. Rounded daily FTE is never summed, persisted as authoritative planning data or used as input to another calculation.

---

# 8. Continuous Calendar Implementation

The planning workspace uses a custom renderer composed from headless libraries rather than a packaged scheduling component.

## 8.1 Shared Viewport

One shared calendar viewport owns:

- visible date range;
- date-column width or zoom level;
- horizontal scroll position;
- selected date or range;
- weekend and holiday presentation.

The event-location, resource and capacity layers consume this same state. They must not implement independent horizontal scrolling while shown together.

## 8.2 Virtualization

TanStack Virtual provides:

- horizontal virtualization for date columns;
- vertical virtualization for visible planning rows;
- overscan around the visible viewport;
- stable item identity during filtering, grouping and expansion.

TanStack Table provides the logical row tree, grouping and aggregation. It does not render the calendar itself.

## 8.3 Rendering

The initial workspace uses DOM cells rather than a canvas.

DOM rendering is selected because the workspace requires:

- direct cell editing;
- keyboard navigation;
- selection and focus;
- accessible semantics;
- tooltips and issue inspection;
- predictable browser testing.

Native SVG is used as an overlay for dependency lines and similar relationships. The SVG overlay is derived from visible row and date coordinates and is not an independent schedule.

Canvas rendering may be evaluated later only if measured browser performance cannot meet the required horizon and row count.

---

# 9. Query and Projection Model

A Planning View is a serializable query definition containing:

- date horizon;
- filters;
- ordered row-group dimensions;
- measures;
- sorting;
- expansion state;
- enabled overlays.

The projection engine creates rows from canonical records. Initial projections include:

- Event -> Competence;
- Event -> Location -> Competence;
- Event -> Organization -> Competence;
- Competence -> Event;
- Location -> Event.

Organization is the canonical planning grouping. Raw Visma `Avdeling` and legacy `Fakturamottaker` remain preserved, source-specific fields; each requires its own approved binding and they are never treated as consecutive hierarchy levels or automatic aliases.

`Nøkkelområde` is the flat first-MVP demand grouping. It has no competence levels, subskills or worker-eligibility semantics. Later worker skills and levels remain separate records that may map to one or several Nøkkelområder.

Changing filters, grouping, sorting or expansion does not write planning data.

Leaf allocation rows may be editable. Aggregate rows are read-only unless an explicit distribution command identifies the target records and distribution rule.

Demand and allocation may be filtered by Event, Planning Competence Area, Organization, Work-Demand Phase, location, Demand Scope and applicable dates. Venue context may be filtered independently by Venyoo Venue Phase. Permanent capacity has date-only pooled scope. Grouping a projection does not itself filter facts.

First-MVP permanent capacity is shared across Events, Organizations, Locations, Work Types and competences. Those views must not copy, split or proportionally distribute the 17-person pool into their branches. The workspace shows it once as shared date-level context outside the event hierarchy. Accepted Demand, allocation and permanent-capacity totals remain invariant when grouping changes.

Permanent capacity is compared only with the complete Total Daily Allocated PH across all competences. It must never be presented as competence-specific availability or pushed into Event, Organization, Location or Work Type branches. A filtered allocation subset may remain visible, but its subtotal is not compared numerically with the pooled capacity.

Each date resolves from one active version of the crew settings and workday calendar. Saturdays, Sundays and generated Norwegian public holidays are non-workdays unless an audited manual override marks the date as working. Other manual overrides may mark an ordinary weekday non-working. Allocation remains permitted on all dates; allocation on a zero-capacity date creates an Additional PH Required warning.

---

# 10. Local Persistence

IndexedDB is the browser's structured local database. Dexie is selected as the application wrapper because it provides:

- typed table access;
- schema versions and migrations;
- indexes and transactions;
- bulk operations;
- reactive queries for React;
- support across major browser engines.

Dexie-specific objects must remain inside the persistence adapter. Domain and application code operate on project-owned interfaces and records.

The first executable MVP must support:

- automatic persistence after accepted commands;
- a visible indication of the active local workspace;
- export of a complete versioned JSON backup;
- restore into a new or empty local workspace;
- validation before a restore replaces active data;
- recovery behavior for an interrupted import or migration.

The local Workspace also stores versioned display settings, including `displayHoursPerFteDay`. PH values are persisted and calculated at their available precision. Display FTE is derived at read time and is never persisted as an authoritative planning amount.

Browser storage must not be described as a backup. Clearing site data, changing browser profile or changing application origin may make the local database unavailable.

---

# 11. Excel Import

ExcelJS runs inside a browser Web Worker.

The first executable MVP performs governed browser-local booking conversion under Booking Demand Conversion and Review Contract v0.1. It stages complete raw Visma snapshots, reuses persistent approved mapping and KPI configuration, derives Work Type Amounts and phase-specific competence-demand PH, preserves every source line as possible work unless explicitly excluded or Not applicable, and publishes demand only through an explicit atomic command. PH calculation status, per-dimension routing status and planner disposition are independent records or fields. Multi-source demand-basis selection remains outside this boundary.

Current workbook roles are:

- the accepted Venyoo `location_format` dataset is the persistent current event, Location/Hall and phase source until a subsequent Venyoo dataset is accepted;
- `utskrift_visma` is the recurring complete booking-line snapshot used to derive reviewable demand;
- the Nøkkeltall mapping workbook and KPI workbook update persistent versioned configuration only when their mappings or rates change;
- `Tabell_oppgaver` is legacy converted-planner evidence and compatibility input, not the required operational demand source;
- `Kalender` is primarily a derived presentation; reviewed allocation data may seed an adopted baseline;
- `Kalender` capacity ranges are unverified and do not supply operational capacity;
- operational first-MVP capacity is maintained in the application as a pooled permanent-crew calendar.

The import pipeline must:

1. accept an explicitly selected `.xlsx` file or an equivalent future API response;
2. detect source compatibility from headers and structural characteristics, then parse through an internally versioned import profile without requiring the source file to declare a version;
3. preserve original source labels, values and source-record references;
4. produce a staged import envelope containing a Source Import, source-record references, canonical drafts and issues;
5. run structural validation separately from planning assurance and demand adoption;
6. resolve or propose explicit source-to-canonical identity bindings;
7. apply persistent approved Work Type, quantity, KPI, Nøkkelområde and Location/Hall mappings without requiring unchanged reference workbooks to be uploaded again;
8. retain the Booking Line Item -> Work Type Amount -> phase-specific KPI Mapping -> Competence/Skill Demand PH lineage;
9. present unresolved PH, per-dimension routing state, planner disposition, scope, total, invalid-row and removal changes for import review without zeroing known PH because of routing uncertainty;
10. require explicit planner dispositions before staged demand publication;
11. publish the reviewed complete snapshot atomically through one application command;
12. record the adopting actor, timestamp, import batch, configuration versions and source references.

Before conversion, the Visma adapter derives the complete covered-project set from every distinct nonblank source Project ID present in the export. An operational Project ID must contain exactly five digits in the form `[YY][PPP]`; the complete value is the annual occurrence and replacement identity, while `20YY` and the three-digit recurring series are separately derived attributes. Publication blocks when a source identity is malformed or cannot resolve canonically. The adapter never guesses the decomposition, merges occurrences by series or uses Venyoo rows and date coverage to enlarge the covered-project set.

The Venyoo adapter declares the export's date range and publishes one active project-location ledger. Real Location/Hall mappings are eligible only among locations associated with the mapped project in that ledger. Missing context produces review, not dropped demand.

Adapters never write directly to the active workspace. A row that parses successfully is not accepted demand until publication explicitly adopts it.

## 11.1 Reimport and Replacement Rules

- An identical source checksum and import profile is idempotent and does not create new active facts.
- Changed source facts create new versions and may supersede earlier source-fact versions.
- Canonical identities and source-to-canonical bindings remain stable unless an explicit reconciliation is reviewed and published.
- For each canonical project resolved from a source Project ID present in the accepted Visma export, a missing source row is retired from active Visma-owned work when the reviewed replacement publishes. Projects absent from the export are outside coverage and remain unchanged.
- Source-owned venue, demand and capacity facts may be superseded; user-owned manual allocations are never overwritten or deleted by import.
- The last published accepted-demand version needed to explain an existing allocation is retained.
- If an allocation no longer resolves to active demand, or allocated PH exceeds newly accepted PH, publication creates an Issue and requires planner reconciliation before the affected change is cleanly adopted.
- Import review reports identity, scope and total changes and identifies affected manual records.
- Invalid rows remain represented in the import review and issues; unresolved identities are never silently joined.
- Every retained source line remains possible work unless an approved rule marks its phase Not applicable or the planner explicitly excludes it with a reason.
- A route requiring review blocks publication until the planner selects a real canonical target or a permitted explicit placeholder. Placeholder-routed work retains known PH and an open Issue; `0 PH` is reserved for genuinely unresolved PH.
- Work Type label, task label and `Shared KPI definition` are not separate canonical fields when they express the same human-readable meaning. The mapping UI edits one Work Type label; combined Work Type-and-unit text is derived, while phase rates remain separately versioned.
- Raw Visma `Avdeling` resolves through a persistent source-specific binding to canonical Organization or explicit `Undetermined`. Legacy `Fakturamottaker` never reuses that binding automatically.
- Work-demand phases are only `assembly` and `dismantling`; Venyoo venue phases additionally include `moving-in`, `event` and `moving-out`. Source aliases normalize at the adapter boundary.
- The complete five-digit Visma Project ID remains the replacement boundary. Its derived three-digit Project Series ID supports retained cross-year evidence and a later explicit historical-demand selector, but never causes automatic substitution or cross-year replacement.

## 11.2 Adopted Workbook Allocations

Workbook allocations may be adopted only after explicit review. Adoption preserves workbook origin and source references and writes one adoption Audit Entry. It must not invent an original planner, timestamp, reason or historical audit sequence. Subsequent allocation edits are user-owned versions created through audited application commands.

Column order and additional irrelevant columns do not create a new source format. A new internal profile version is required only when a changed source field or structure is used by the application. Missing, duplicate or incompatible required structures fail staging with explicit diagnostics; the importer never guesses their meaning, reproduces every workbook formula or infers worker skill levels from flat Nøkkelområde values.

If browser parsing performance is insufficient, the response is to narrow the imported source ranges or improve worker-based parsing before introducing a server dependency.

## 11.3 Permanent Capacity Calendar

The first executable MVP stores versioned permanent crew count and hours-per-workday settings and derives one pooled Permanent Capacity PH value per date. The accepted defaults are 17 crew and 7.5 hours, producing `127.5 PH` on a workday.

The calendar uses Europe/Oslo dates. Saturdays, Sundays and Norwegian national public holidays are generated as non-workdays. A planner may make an audited date override in either direction. Crew settings and overrides persist locally, survive backup/restore and never rewrite allocations.

The calendar rejects invalid or overlapping active setting versions and duplicate active overrides for one date. A comparison uses complete Total Daily Allocated PH and creates a warning whenever Permanent Capacity Delta is negative. Skill-specific permanent capacity, absence, hired help and overtime are not inferred.

---

# 12. Future Supabase Expansion

Supabase is introduced only after the local workspace proves useful.

The future architecture replaces or supplements the Dexie adapter with:

- Postgres tables for canonical records;
- Supabase Data API access from the browser;
- Supabase Auth where multi-user identity is required;
- Row Level Security and explicit grants;
- database migrations;
- collaboration and synchronization behavior defined as separate product capabilities.

The application must not attempt to make Dexie behave like distributed Postgres. Instead, both persistence implementations satisfy application-owned interfaces such as:

- `PlanningRepository`;
- `VenueRepository`;
- `AllocationRepository`;
- `CapacityRepository`;
- `ViewRepository`;
- `AuditRepository`.

These interfaces should be narrow and use-case oriented. A generic repository abstraction that merely copies database operations is not required.

Stable IDs, `workspaceId`, provenance, audit fields and normalized dated records are included from the first executable MVP to reduce later migration cost.

---

# 13. Alternatives Considered

## 13.1 AG Grid or Another Commercial Data Grid

Not selected.

The relevant grouping, pivoting or advanced planning features may require paid tiers. More importantly, a conventional data-grid component does not naturally provide the synchronized venue, resource and dependency workspace without substantial adaptation.

## 13.2 FullCalendar Resource Timeline or Commercial Scheduler

Not selected.

Resource-timeline and advanced scheduler capabilities commonly depend on premium packages. Their event model also encourages a scheduler-first interaction rather than the required daily planning grid with flexible projections.

## 13.3 Next.js or Another Server-Oriented Web Framework

Not selected for the first executable MVP.

Server rendering, server routes and deployment conventions do not solve a current requirement. Vite produces the required browser application with less architectural surface. A backend can be introduced through explicit adapters when Supabase is adopted.

## 13.4 Electron or Tauri

Not selected.

They produce packaged desktop applications and conflict with the browser-only requirement.

## 13.5 SQLite, PGlite or Another Browser Database Using WebAssembly

Not selected for the first executable MVP.

Although SQL compatibility could reduce some future translation, it adds WebAssembly runtime, larger assets and another execution layer before the workspace has been validated. IndexedDB is native browser infrastructure and is sufficient for the expected first executable MVP data volume.

## 13.6 Canvas-First Calendar Rendering

Not selected initially.

Canvas may render many cells efficiently but makes editing, accessibility, focus, text selection and automated browser verification more difficult. DOM virtualization should be measured before accepting that cost.

## 13.7 Supabase From the First Prototype

Not selected.

Authentication, network behavior, RLS and synchronization would expand the proof of concept before the primary workspace is validated. The architecture retains a migration path without making hosted infrastructure a first executable MVP dependency.

---

# 14. Consequences

## 14.1 Positive

- The first executable MVP has no paid runtime dependency.
- The application runs in a browser and can be delivered as static assets.
- Local data remains available without a network connection after the application is loaded.
- The workspace can be tailored to the actual planning interaction.
- Row and date virtualization support a long planning horizon.
- Flexible views operate over one canonical plan.
- Import, persistence and future APIs remain replaceable adapters.
- The future Supabase migration does not require replacing the React workspace or domain rules.

## 14.2 Negative

- The continuous calendar requires more custom implementation than a packaged scheduler.
- Two-dimensional virtualization and synchronized sticky regions require careful performance work.
- IndexedDB is not collaborative and is tied to browser origin and profile.
- Backup and restore must be built early.
- Client-side query performance must be measured as imported history grows.
- The team owns dependency-line rendering and grouped-allocation editing behavior.

## 14.3 Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Workbook parsing blocks the interface | Parse in a Web Worker and import only required tables or ranges |
| Wide calendar causes excessive DOM work | Virtualize date columns and rows with stable keys and bounded overscan |
| Grouping changes totals incorrectly | Test projection invariants against canonical fixtures |
| Aggregate editing changes the wrong records | Keep aggregate cells read-only until an explicit distribution command exists |
| Browser data is lost | Provide versioned backup and restore and display local-storage status |
| Dexie leaks into domain logic | Keep it behind persistence adapters and application commands |
| Supabase migration requires a rewrite | Use stable identifiers, normalized records and application-owned ports from the first executable MVP |
| Dependency overlay obscures the grid | Make overlays optional and attach hidden endpoints to visible ancestors |
| Free-library capability changes | Pin versions, retain lockfile and review licenses during upgrades |

---

# 15. Initial Project Structure

The initial application should follow a feature-oriented structure with explicit architectural boundaries:

	/src
	  /app                 Application shell and composition
	  /domain              Storage-independent records and rules
	  /application         Commands, queries and use cases
	  /adapters
	    /excel             Workbook import and source profiles
	    /indexeddb         Dexie schema and persistence implementations
	    /backup            JSON export and restore
	  /features
	    /import-review
	    /planning-views
	    /workspace
	    /allocation-editing
	    /issues
	  /components          Shared UI primitives
	  /styles              Tokens and global workspace rules
	  /test                Shared fixtures and test helpers

The structure may evolve, but dependencies must continue to point inward toward application and domain behavior rather than from domain code toward framework adapters.

---

# 16. First Executable MVP Architecture Acceptance Criteria

The first executable MVP implementation boundary is satisfied when the application can:

1. build as a static browser application;
2. run without a remote database or paid service;
3. stage a complete raw Visma snapshot, apply persistent approved mapping and KPI configuration, preserve every line as possible work unless explicitly excluded or Not applicable, review PH and routing independently, and explicitly publish reviewed competence demand without inventing mappings or zeroing known PH;
4. validate and store canonical records in IndexedDB;
5. reload the browser and restore the local workspace;
6. export and restore a complete versioned backup;
7. render venue occupancy and resource allocations on one synchronized date axis;
8. virtualize a representative planning horizon and row set without incoherent scroll behavior;
9. switch between Event -> Competence and Event -> Organization -> Competence projections without changing canonical totals;
10. expand and collapse row hierarchies while preserving totals and issues;
11. edit one leaf daily allocation through an audited application command, with manual daily allocation remaining authoritative;
12. prevent direct ambiguous edits to aggregate rows;
13. maintain the pooled permanent crew calendar in the application and display date-level Permanent Capacity PH, Delta and Additional PH Required with provenance and status;
14. render at least one read-only dependency overlay without replacing the daily grid or implying dependency enforcement;
15. keep ExcelJS and Dexie outside the domain layer;
16. demonstrate that a mock alternative persistence adapter can satisfy the same application interface used by the workspace;
17. preserve Accepted Demand PH, Total Allocated PH, Unallocated PH and Overallocated PH when the date viewport changes while updating Visible Allocated PH;
18. keep Total Allocated PH and permanent-capacity period totals invariant and show pooled capacity only once as shared context when grouping or expanding projections;
19. generate weekends and Norwegian public holidays as non-workdays, support audited manual date overrides and reject conflicting active settings or overrides;
20. retain unresolved allocations, exclude them from active-demand reconciliation where required, and include all dated allocation PH in pooled permanent-capacity use;
21. allow manual over-allocation while producing an Issue and preserving the conservation invariant;
22. create a visible warning whenever Permanent Capacity Delta PH is negative while keeping weekend and holiday allocation editable;
23. calculate and aggregate in PH, derive Display FTE only after aggregation, and expose the manual settings, generated calendar rule and overrides used for permanent capacity.

`First Executable MVP Acceptance Pack v0.1` is authoritative for the deterministic fixture realization, mutations and expected results used to verify these criteria. It does not reinterpret or extend this architecture boundary.

## 16.1 Data-Contract Traceability

`A` refers to the architecture criteria above. `W` refers to the workspace acceptance criteria.

The complete executable mapping of A1-A23 and W1-W23, including test classification and pass/fail conditions, is maintained in `First Executable MVP Acceptance Pack v0.1`.

| Criteria | Required adapter output and canonical record | Evidence or approved fixture | Validation |
|---|---|---|---|
| A1-A2 | None | Application build | Browser-only and no remote runtime dependency |
| A3 | Staged raw booking envelope, persistent mapping/KPI references, derived phase work, independent PH/routing statuses and reviewed demand publication | Supported Visma, Venyoo, mapping and KPI profiles | Profiles recognized; every source line accounted for; known PH retained through routing review; explicit placeholders remain flagged; explicit atomic publication completed |
| A4-A6 | Workspace, Source Import, canonical records and Audit Entry | Published import and backup | Schema validation, atomic publication, reload and backup round-trip |
| A7; W1-W4 | Venue, phases, accepted demand, allocation and capacity | accepted Venyoo Location Format dataset, reviewed Visma-derived demand, adopted or manual allocation, permanent-capacity calendar | Identity resolution, valid intervals and common date semantics |
| A8; W5; W16 | Dated intervals and daily facts | Representative VVS horizon | Stable date projection without date-per-field persistence |
| A9-A10; A18; W7-W9; W17 | Event, Organization, competence and Issues | Reviewed demand input or approved fixture | Stable canonical IDs; invariant demand and allocation totals; capacity shown once outside event branches |
| A11-A12; W12-W13; W15 | Daily Resource Allocation and Audit Entry | Manual command or explicitly adopted allocation seed | Complete leaf scope, aggregate-edit rejection and retained before/after values |
| A13; A19; A22; W11 | Permanent Capacity Calendar | Versioned settings, generated Norwegian calendar and manual overrides | 17 × 7.5 = 127.5 PH on workdays; zero on non-workdays; overrides audited; negative delta warns |
| A18 | Planning projection and Permanent Capacity | Same facts grouped by Event, organization and competence | Allocation and capacity-period totals remain invariant; pooled capacity appears once and is not repeated in branches |
| A14; W6; W14 | Dependency and Issue | Approved read-only fixture or reviewed source context | Endpoints resolve; no dependency enforcement or conflict-engine implication |
| A15 | Adapter implementation boundary | Architecture test | ExcelJS and Dexie absent from domain code |
| A16 | Repository interfaces | Mock persistence adapter | Same application commands, queries and record contracts |
| A17; W10 | Accepted Demand and Daily Resource Allocation | Explicitly adopted demand set | Viewport changes affect Visible Allocated PH only; Total Allocated PH and demand reconciliation remain invariant |
| A20 | Daily Resource Allocation and Issue | Allocation with unresolved demand identity | Allocation retained and flagged; every dated PH value consumes pooled permanent capacity |
| A21 | Accepted Demand, Daily Resource Allocation and Issue | Deliberate manual over-allocation | Overallocated PH shown; Issue active; allocation remains editable; conservation invariant holds |
| A23 | PH facts and versioned settings | Approved 7.5-hour configuration and permanent-capacity settings | Exact PH summed first; Display FTE is derived once; capacity exposes manual settings, calendar rule and overrides |

---

# 17. Decision Register

The accepted first-executable-MVP import architecture already includes profile-based acquisition, staged review, reusable versioned configuration, explicit publication and project-scoped replacement. Unknown source values are review states, not grounds for silent exclusion. The remaining decisions are classified below.

## 17.1 Deferred Operational Extensions

- future competence-specific capacity, overlapping skill and absence model beyond the pooled permanent crew;
- future hired-help and overtime capacity representation;
- governance and future defaults for `displayHoursPerFteDay` beyond the approved demonstration value.

## 17.2 Later Platform and Deployment Decisions

- authentication and user roles;
- Supabase project structure and RLS policies;
- multi-user synchronization and conflict resolution;
- static production hosting location;
- offline application-shell caching through a service worker;
- later terminology and hierarchy connecting flat Nøkkelområder to worker skills and levels;
- canvas or hybrid rendering if DOM virtualization later proves insufficient.

## 17.3 Later Planning Capabilities

- production automatic scheduling, generated allocation states, functional Planning Locks, scheduler-derived residual-need semantics and scheduling writeback;
- real personnel records, named-worker assignment and production worker-level feasibility;
- Phase C constraint evaluation and enforcement;
- scheduling-evaluation fixtures, which may use synthetic or anonymized worker data;
- advanced schedule-generation library or solver for the scheduling evaluation or later phase.

---

# 18. References

- React: <https://react.dev/>
- Vite: <https://vite.dev/guide/>
- TanStack Table: <https://github.com/TanStack/table>
- TanStack Virtual: <https://tanstack.com/table/latest/docs/framework/react/guide/virtualization>
- Dexie React guide: <https://dexie.org/docs/Tutorial/React>
- Dexie repository and license: <https://github.com/dexie/Dexie.js>
- ExcelJS repository and license: <https://github.com/exceljs/exceljs>
- Supabase database overview: <https://supabase.com/docs/guides/database/overview>
- Supabase browser security and Row Level Security: <https://supabase.com/docs/guides/database/secure-data>
- AG Grid licensing reference: <https://www.ag-grid.com/license-pricing/>

# Release-Candidate Reconciliation — 2026-10-01

The validated implementation remains within this decision: React/TypeScript/Vite, Dexie/IndexedDB and worker-based ExcelJS imports produce a static browser application with no remote runtime dependency. Domain production modules import neither React, Dexie, ExcelJS nor adapter modules. Following Correction Pass 1, IndexedDB schema 12 migrates supported earlier databases; application backup schema 9 and envelope format 1 round-trip current state and reject invalid restores atomically.

Current writes use only the reviewed Visma candidate and signed-quantity Work Type Amount path. Pre-Step-3 counted-occurrence, distinct-location, legacy Work Type and fixture-capacity forms remain only where required to read or migrate older data; they cannot drive current publication or capacity behavior. Development-only demo reset controls are absent from the production bundle.

# Correction Pass 1 — Persistence and Projection Boundary

The correction keeps raw Visma grouping and publication semantics in the application layer and adds a pure presentation aggregation over reviewed phase work. Aggregate rows carry their constituent phase-item IDs, source aggregation groups, booking-line IDs, source references, article numbers, Work Anchors, signed quantities and mapping/KPI evidence; no presentation aggregation rewrites the conversion revision or publication totals.

The project register, approved Venyoo event aliases and event-resolution/deferral records are application-owned IndexedDB collections. IndexedDB schema 12 migrates earlier workspaces with empty collections while preserving every existing collection. Application backup schema 9 and unchanged envelope format 1 validate and round-trip these collections with the planning dataset. Register acceptance/replacement, event deferral and event-alias approval use repository transactions so injected persistence failure leaves the prior snapshot unchanged.

Project-register detection is structural: the profile scans the initial worksheet rows for unique required headers `Navn` and `Prosjektnr.` and maps by header name. Filename, column position and extra columns are not format identity. The active register persists until explicit accepted replacement; each version contains checksum, profile versions, original and normalized row evidence, validation findings, predecessor identity, acceptance metadata and audit evidence.

---

**End of Architecture Decision — Browser-Local First Executable MVP Application Stack v0.1**

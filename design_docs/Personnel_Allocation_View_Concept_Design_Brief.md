# Personnel Allocation View — Concept Design Brief

**Status:** Concept exploration  
**Purpose:** Define the primary manual personnel-allocation workspace for the resource-planning application.

## 1. Objective

Design a planning workspace that allows a resource planner to allocate available permanent personnel against calculated daily competency demand.

The view should answer three questions continuously:

> **What competency do I need, when do I need it, and who am I assigning to cover it?**

The planner should be able to build an initial personnel plan quickly at day-level resolution, while retaining the ability to expand individual assignments into precise time blocks when necessary.

The interface should remain usable across a week containing many employees and multiple competency requirements without forcing the planner into detailed scheduling unnecessarily.

---

## 2. Context within the larger system

The Personnel Allocation View does **not calculate operational demand**.

Demand is produced upstream from:

**Order lines → quantity → KPI/productivity rate → required work hours → competency → available work period**

This results in demand such as:

| Day | Competency | Required work |
|---|---|---:|
| Monday | Carpet installation | 22.5 h |
| Monday | Stand construction | 37.5 h |
| Tuesday | Carpet installation | 15 h |
| Tuesday | Stand construction | 45 h |

The Personnel Allocation View receives this demand and answers the next question:

> **Which available employees will cover those hours?**

It therefore sits between **resource demand** and later decisions about **capacity shortages**.

For the initial version, the scope is deliberately limited to **permanent/internal personnel**. Overtime and hired personnel will be handled later, after the permanent-workforce allocation workflow is established.

---

## 3. Fundamental planning model

The underlying unit of the system is **time**, not FTE.

FTE is useful as a planning representation. For example:

> Carpet installation — 2.4 FTE required

But underneath this might represent:

> Carpet installation — 18 hours required

Personnel assignments therefore consume **hours from competency demand**.

This distinction is important because one FTE of demand does not imply that one person should perform that work for an entire day.

For example, 7.5 hours of carpet demand might reasonably be assigned as:

**Employee A — Carpet — 08:00–11:45**  
**Employee B — Carpet — 08:00–11:45**

rather than:

**Employee A — Carpet — full day**

The interface must support both approaches naturally.

---

## 4. Primary workspace

The agreed conceptual direction is a **calendar-like planning grid**.

### Axes

**X-axis:** time, initially days across a week.

**Y-axis:** permanent personnel.

Conceptually:

| Personnel | Mon | Tue | Wed | Thu | Fri |
|---|---|---|---|---|---|
| Employee A | | | | | |
| Employee B | | | | | |
| Employee C | | | | | |
| Employee D | | | | | |

This provides the planner with an immediate overview of:

- who is working,
- when they are working,
- what competency they are assigned to,
- where capacity remains available.

The design should feel closer to a **planning board** than an employee calendar.

---

## 5. Progressive time resolution

A central design principle is:

> **Start coarse. Expand only where precision is required.**

Most planning should not require manipulating individual hours.

### Collapsed/default state

Initially, personnel × day cells are compact.

The planner can select a cell and assign a competency for the entire available workday.

Example:

**Employee A / Tuesday → Carpet**

This should be an extremely fast interaction.

The resulting cell might simply communicate:

> CARPET  
> Full day

The goal is to allow the planner to build the rough personnel plan very quickly.

### Expanded state

Sometimes a full-day assignment is inappropriate.

The planner must therefore be able to **expand that employee/day within the same planning workspace**.

The expanded state reveals time resolution, for example:

> 08:00 ┃━━━━ Carpet ━━━━┃ 12:00 ┃━━ Stand ━━┃ 15:30

Assignments can then be resized, moved or split into multiple competency blocks.

Critically, this should **not navigate to another screen or separate editor**.

The planner remains inside the same weekly planning context.

After collapsing the row/cell again, the compact state should communicate that the day contains multiple assignments without exposing all of their detail.

---

## 6. Demand must remain visible while allocating

The planner cannot allocate people effectively if competency demand is hidden elsewhere.

The workspace therefore needs a persistent representation of demand for the currently visible period.

For example:

**Tuesday**

| Competency | Required | Assigned | Remaining |
|---|---:|---:|---:|
| Carpet | 22.5 h | 15 h | **7.5 h** |
| Stand | 37.5 h | 30 h | **7.5 h** |
| Logistics | 15 h | 15 h | **0 h** |

The exact presentation is open for design exploration. It could be a panel, header region, expandable demand strip, etc.

What matters is the interaction:

> **Every personnel assignment immediately consumes the corresponding competency demand.**

If Employee A receives 7.5 hours of Carpet, remaining Carpet demand falls by 7.5 hours.

If the assignment is removed, those 7.5 hours return to remaining demand.

The planner should therefore experience allocation almost as **balancing a live set of resource accounts**.

---

## 7. Competency filtering

Each employee can possess multiple competencies.

Example:

**Employee A**

- Carpet
- Stand construction
- Logistics

**Employee B**

- Carpet

**Employee C**

- Stand construction
- Forklift

When working on a specific competency, the planner should be able to focus the workspace accordingly.

For example:

> **Focus: Carpet installation**

Employees without Carpet competency can then be hidden, de-emphasized or otherwise removed from the immediate decision space.

The design should explore the best behaviour rather than assuming a conventional dropdown filter.

The purpose is to turn:

> “Who should I allocate next?”

into a much smaller and more relevant choice.

---

## 8. Constraints the interface must communicate

The system knows things the planner should not have to remember manually.

### Competency eligibility

A person should not normally be assigned work requiring a competency they do not possess.

### No simultaneous allocation

An employee may possess several competencies but represents only one physical resource.

They cannot provide:

> 4 hours Carpet  
> **and simultaneously**  
> 4 hours Stand

Time blocks must therefore be mutually exclusive.

### Availability

A person's available hours may differ because of working schedules, absence or other constraints.

The interface should distinguish between:

- available capacity,
- allocated capacity,
- unavailable time.

The designer should explore how these constraints can be communicated without filling the grid with warnings and status indicators.

---

## 9. Relationship to the Demand View

An important broader design principle has emerged:

> **Demand planning and personnel allocation are different views of the same planning timeline.**

They should not feel like unrelated modules.

If the planner is looking at **week 42** in Demand and switches to Personnel Allocation, they should remain in week 42.

Likewise, if Wednesday is the current planning focus, moving between views should preserve that temporal context wherever practical.

Conceptually:

**Shared planning timeline**

→ Demand View  
→ Personnel Allocation View  
→ later: Capacity Gap / Hiring View  
→ potentially other planning perspectives

The user is changing **perspective**, not changing to an unrelated dataset.

This is important to the application's overall information architecture.

---

## 10. Planning is continuously revised

The plan represents an operational environment where reality frequently diverges from expectation.

Examples include:

- work taking longer than expected,
- work finishing early,
- tasks not being completed,
- access times changing,
- employee sickness,
- priorities changing.

There is currently **no automatic source of actual progress information**.

Therefore:

> **Reality is updated manually; consequences should be calculated automatically.**

For example, if three hours of Tuesday's Carpet work were not completed, the planner may manually move those three hours into Wednesday's demand.

The personnel view should then immediately expose the resulting Wednesday shortage.

Similarly, if Employee A becomes unavailable because of sickness, their planned capacity disappears and their assignments should become clearly unresolved/returned to demand according to the eventual workflow.

This makes fluid movement between Demand and Personnel Allocation essential.

---

## 11. Demand and allocation must remain separate concepts

The UI should avoid implying that assigning personnel changes the underlying amount of work.

These are two different quantities:

**Demand**

> We need 30 hours of Stand construction Wednesday.

**Allocation**

> We have assigned 22.5 personnel-hours against it.

Therefore:

**Remaining demand = required hours − valid allocated hours**

In this example:

> 30 − 22.5 = **7.5 hours remaining**

This separation becomes important when the plan changes.

Removing a worker does not delete the work. It simply makes the work **uncovered again**.

---

## 12. Desired planner workflow

A typical planning session should be capable of feeling roughly like this:

1. Open Personnel Allocation for the relevant week.
2. Immediately see competency demand and permanent personnel.
3. Identify the largest or most urgent uncovered competency.
4. Focus the view on that competency.
5. Rapidly allocate suitable employees as full days.
6. Watch remaining demand decrease as assignments are made.
7. Continue until full-day allocation becomes inefficient.
8. Expand selected employee/day cells.
9. Split those days into precise time blocks.
10. Continue until permanent capacity has been used appropriately.
11. Review remaining uncovered demand.

The end state is **not necessarily zero remaining demand**.

Remaining demand is valuable information.

It tells the planner:

> “This is what the permanent workforce cannot currently cover.”

That becomes the input to the later overtime/temporary-labour workflow.

---

## 13. Design principles

The concept should optimise for several things simultaneously.

**Overview before precision.** The planner should see the workforce and week before seeing individual hours.

**Progressive disclosure.** Hour-level complexity appears only when requested.

**Allocation should feel fast.** Assigning an employee for a full day should require very little interaction.

**Need and capacity should never become disconnected.** The planner should continuously understand the effect an assignment has on remaining demand.

**Exceptions should not dominate the interface.** Constraints and warnings matter, but this is primarily a workspace for building a plan.

**Preserve context.** Moving between demand and personnel perspectives should not make the planner repeatedly relocate the same date/event/week.

**Manual control first.** The MVP should make human planning excellent before attempting automated scheduling.

---

## 14. Future direction — do not design around this yet

The data model and interactions should leave room for the system eventually proposing allocations automatically.

An algorithm might later consider:

- competency eligibility,
- availability,
- remaining competency demand,
- task sequence,
- switching between competencies,
- workload balance,
- KPI achievement,
- continuity of work.

It could generate an initial draft which the planner then edits using exactly the interface described here.

This is why the manual allocation experience matters beyond the MVP: **the future algorithm should produce the same type of assignments that the planner creates manually.**

The UI should therefore not be designed as a temporary manual workaround.

---

## 15. What the designer should explore

The design exercise should **not** simply produce an Outlook-style calendar.

The central problem to solve is:

> **How can a planner see workforce capacity, competency demand and remaining demand simultaneously, rapidly allocate whole days, and selectively expand individual assignments into hour-level planning—all without losing the weekly overview?**

The designer should explore the spatial relationship between the demand representation and personnel grid, how competency selection works, how a collapsed day communicates single versus multiple assignments, how local expansion to hour-level resolution behaves, and how remaining demand responds visually during allocation.

The strongest concept should make the transition from **“I need 3 FTE of this competency”** to **“these specific people will provide these specific hours”** feel immediate and understandable.

That is the core interaction the Personnel Allocation View exists to solve.

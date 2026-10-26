import { useCallback, useMemo, useState } from 'react'
import { ALL_HALLS, cleanHallFilter, type HallFilter } from '../../domain/areas'
import { capacityForDate, hoursByWorkType, rowTotals, sumValues } from '../../domain/calc'
import { calendarRange } from '../../domain/calendarRange'
import { dateRange, daysBetween, todayIso, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { isSuggestedRow } from '../../domain/plannedRows'
import { projectScore, scorePlan, weightsOf } from '../../domain/planner/score'
import { takeProjects } from '../../domain/planner/solve'
import type { AllocationRow } from '../../domain/types'
import { usePref, usePrefSet } from '../../store/prefs'
import { useWorkspace } from '../../store/workspaceStore'
import { AllocationDialog } from '../AllocationDialog'
import { BemanningHead, BemanningOverlays, BemanningToolbar, BemanningTop } from '../bemanning/BemanningParts'
import { BemanningScope } from '../bemanning/BemanningScope'
import type { BlockNames } from '../bemanning/dayCell'
import { unfoldedHeight } from '../bemanning/layout'
import { PeopleHeading, PeopleRows } from '../bemanning/PeopleRows'
import { PersonPanel } from '../bemanning/PersonPanel'
import { projectSpansOf } from '../bemanning/projectsInView'
import { WorkPlanDialog, type OpenPlan } from '../dagsplan/WorkPlanDialog'
import { InnleidHead, InnleidHeading, InnleidRows, InnleidToolbar, InnleidTop } from '../innleid/InnleidParts'
import { InnleidScope } from '../innleid/InnleidScope'
import { InnleidSidePanel } from '../innleid/SupplierPanel'
import { AreaMenu } from './AreaMenu'
import { CellMenu } from './CellMenu'
import { EngineDialog } from './EngineDialog'
import { count } from '../dom'
import { HeadRows } from './GridRows'
import type { Columns, GridActions } from './gridTypes'
import { heatScale } from './heat'
import { KalenderBar, KalenderHead } from './KalenderBar'
import { rowTitle } from './labels'
import { daysWide, fitSpan, LEFT_W, OVERSCAN_ROWS, overscanCols, type Zoom } from './layout'
import { PlanRows } from './PlanRows'
import { RowInspector } from './RowInspector'
import { cleanGrouping, DEFAULT_GROUPING, EMPTY_FILTER, foldedTo, groupItems, headOver, levelSections, lineAt, lineTops, pathKeys, projectIndex, projectKey, shownLevels, type Dimension, type RowFilter } from './rows'
import type { Selection, Tool } from './selection'
import { StatusBar } from './StatusBar'
import { overbookedDays } from './strokes'
import { HallSection, PlanningHeading, StaffingSection } from './TopSections'
import { useDayHover } from './useDayHover'
import { useGridViewport } from './useGridViewport'
import { useModeState, useModeSwitch } from './useModes'
import { usePlanGrid, type CellMenuAt } from './usePlanGrid'
import { usePlanRows } from './usePlanRows'
import { useProjectHover } from './useProjectHover'
import { useStableActions } from './useStableActions'
import { useStaffingLines } from './useStaffingLines'
import { useToolKeys } from './useToolKeys'
import { zoomOf, type DaySpan } from './zoom'
import { formatFte } from '../format'

/**
 * `hints` is the setting «Hjelpetekster»: with it off, pointing at a project lights nothing.
 * `heat` is the setting «Varmekart for mangler / over»: the Avvik line as coloured tiles.
 * `blockNames`, `selectionStyle` and `overtimeLimit` are the settings of Bemanning: what a block says, how what is picked is shown, and the overtime per week that is flagged.
 * `onOpenPersonell` opens the tab where the people are entered, from Bemanning when there are none, and `onOpenSuppliers` the tab of the suppliers, from Innleid.
 */
export function Kalender({ hints = true, heat = true, blockNames = 'full', overtimeLimit = 10, onOpenPersonell, onOpenSuppliers }: { hints?: boolean; heat?: boolean; blockNames?: BlockNames; overtimeLimit?: number; onOpenPersonell: () => void; onOpenSuppliers: () => void }) {
  const { workspace, demandIndex, locatedDemand, setAllocationNote, removeAllocation, updateStaffing } = useWorkspace()
  const ws = workspace!
  // The staffing lines come from Bemanning: absence, overtime and the people hired, which are worked out.
  const { settings, capacity, fromBemanning, waitingHired } = useStaffingLines(ws)

  const [zoom, setZoom] = usePref<Zoom>('zoom', 'normal')
  const [filter, setFilter] = usePref<RowFilter>('filter', EMPTY_FILTER)
  const [grouping, setGrouping] = usePref<Dimension[]>('grouping', DEFAULT_GROUPING, cleanGrouping)
  const [collapsed, setCollapsed] = usePrefSet('collapsedLevels')
  const [hallsOpen, setHallsOpen] = usePref('hallsOpen', true)
  const [hallsCompact, setHallsCompact] = usePref('hallsCompact', false)
  const [hallFilter, setHallFilter] = usePref<HallFilter>('hallFilter', ALL_HALLS, cleanHallFilter)
  const [staffingOpen, setStaffingOpen] = usePref('staffingOpen', true)
  const [capacityOpen, setCapacityOpen] = usePref('capacityOpen', false)
  const [onlyInView, setOnlyInView] = usePref('onlyInView', true)
  const [selection, setSelection] = useState<Selection | null>(null)
  // With the pencil, drawing across days on a row shares out what is left of its demand over those days.
  // With the eraser, drawing across cells clears them.
  const [tool, setTool] = useState<Tool>('select')
  const [cellMenu, setCellMenu] = useState<CellMenuAt | null>(null)
  const [inspectorOpen, setInspectorOpen] = usePref('inspectorOpen', false)
  // The row the details panel shows: the last planning row that had the focus.
  const [detailId, setDetailId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ row?: AllocationRow; projectName?: string; projectNo?: string } | null>(null)
  const [engineOpen, setEngineOpen] = useState(false)

  // The period follows the hall bookings, see `calendarRange`.
  const range = useMemo(() => calendarRange({ venue: ws.venue, allocations: ws.allocations }, todayIso()), [ws.venue, ws.allocations])
  const dates = useMemo(() => dateRange(range.start, range.end), [range.start, range.end])
  const today = todayIso()
  // The day in focus is shared by the two modes (`planningFocus`): the Kalender opens on it, and the day of the cell the planner stands on becomes it.
  const [planningFocus, setPlanningFocus] = usePref<{ date: ISODate } | null>('planningFocus', null)
  const modes = useModeState(range, planningFocus?.date, today, zoom)
  const { planMode, shown, crewPart, colW, held, heldWindow } = modes
  // The person whose hours are open in Bemanning. The top block gives way by as much as they need.
  const [unfolded, setUnfolded] = useState<string | null>(null)

  const projectHover = useProjectHover(hints)
  const closeCellMenu = useCallback(() => setCellMenu(null), [])
  const clearSelection = useCallback(() => setSelection(null), [])
  const { scrollRef, headRef, topRef, toolsRef, viewport, topHeight, headHeight, barHeight, tucked, measure, onScroll, scrollToDate, showSpan, placeLeft, zoomFrom, zoomStep } = useGridViewport({
    start: range.start,
    end: range.end,
    openOn: planningFocus?.date ?? today,
    zoom,
    colW,
    reserve: shown === 'bemanning' && unfolded ? unfoldedHeight(ws.settings.workday) : 0,
    onScrolled: closeCellMenu,
    onPeriodMoved: clearSelection,
  })

  // ---- the rows -------------------------------------------------------------------------------
  // While the switch between the modes zooms, the days in view are held, see `heldWindow`.
  const winFrom = heldWindow?.start ?? dates[Math.max(0, Math.floor(viewport.left / colW))]
  const winTo = heldWindow?.end ?? dates[Math.max(0, Math.min(dates.length - 1, Math.floor((viewport.left + viewport.width - LEFT_W) / colW)))]
  const inView = useMemo(() => ({ from: winFrom, to: winTo }), [winFrom, winTo])
  const plan = usePlanRows({ ws, range, demandIndex, locatedDemand, settings, wide: zoom === 'wide', hallFilter, filter, grouping, collapsed, onlyInView, inView, detailId: inspectorOpen ? detailId : null })
  const { hallCalendar, rows, filtered, shownGroups, items, allocLanes, laneOfRow, allGroups, windowOf, need } = plan

  // ---- virtualization ------------------------------------------------------------------------
  const overscan = overscanCols(colW)
  const c0 = Math.max(0, (held ? held.from : Math.floor(viewport.left / colW)) - overscan)
  const c1 = Math.min(dates.length - 1, (held ? held.to : Math.ceil((viewport.left + viewport.width - LEFT_W) / colW)) + overscan)
  const visibleDates = useMemo(() => dates.slice(c0, c1 + 1), [dates, c0, c1])
  const firstVisibleCol = Math.min(dates.length - 1, Math.ceil(viewport.left / colW))
  const rowTops = useMemo(() => lineTops(items), [items])
  // A top level's line stays at the top of the rows while the lines under it scroll past, and is pushed out by the next one.
  const allSections = useMemo(() => levelSections(items), [items])
  /** What stays pinned over the rows once they are scrolled: the top block, less the part of it that gives way where the rows have no room. */
  const pinnedHeight = topHeight - tucked
  const headOverAt = useCallback((index: number) => headOver(items, allSections.length > 0, index), [items, allSections])
  const coveredAbove = useCallback((index: number) => pinnedHeight + headOverAt(index), [pinnedHeight, headOverAt])
  const r0 = Math.max(0, lineAt(rowTops, viewport.top - tucked) - OVERSCAN_ROWS)
  const r1 = Math.min(items.length, lineAt(rowTops, viewport.top + viewport.height - topHeight) + 1 + OVERSCAN_ROWS)

  // ---- the selection and the tools ------------------------------------------------------------
  const grid = usePlanGrid({ scrollRef, dates, selection, setSelection, allocLanes, laneOfRow, laneKeys: plan.laneKeys, windowOf, demandIndex, settings, tool, colW, firstVisibleCol, rowTops, topHeight, coveredAbove, menuOpen: !!cellMenu, setCellMenu })
  const { notice, setNotice, stroke, pull, written, getValue, setRowFte, proposePlan, drawDemand, editOf } = grid
  // The details panel keeps its row when the selection is cleared or moves to a level.
  const focusRowId = selection ? (allocLanes[selection.focus.lane]?.row?.id ?? null) : null
  if (focusRowId && focusRowId !== detailId) setDetailId(focusRowId)
  // The heat map of the Avvik line is scaled by the largest shortage and surplus of the whole period.
  const heatMax = useMemo(() => heatScale(heat ? dates.map((date) => capacityForDate(date, capacity, settings).available - (need.get(date) ?? 0)) : []), [heat, dates, capacity, settings, need])

  // Days planned above the available crew. Without the heat map they are tinted down the whole grid; with it,
  // the Avvik line alone carries them. A pencil stroke in progress counts, so the clash shows while it is being drawn.
  const overbooked = useMemo(() => overbookedDays(need, written, getValue, capacity, settings), [need, written, getValue, capacity, settings])
  // Every cell of a day shares these classes; they are worked out once per day, not once per cell.
  const dayClasses = useMemo(() => {
    const classes = new Map<ISODate, string>()
    for (const date of visibleDates) {
      const type = dayType(date)
      classes.set(date, `day ${type !== 'arbeidsdag' ? type : ''} ${date === today ? 'today' : ''} ${date.endsWith('-01') ? 'month-start' : ''} ${!heat && overbooked.has(date) ? 'overbooked' : ''}`)
    }
    return classes
  }, [visibleDates, today, overbooked, heat])
  const leftCol = held ? held.left : Math.floor(viewport.left / colW)
  const cols = useMemo<Columns>(() => ({ dates: visibleDates, c0, first: leftCol, colW, classes: dayClasses }), [visibleDates, c0, leftCol, colW, dayClasses])

  const toggled = (prev: Set<string>, key: string) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }
  // Lanes are positions in the list, so a selection would land on other rows once levels fold or unfold.
  const toggleGroup = (key: string) => {
    setSelection(null)
    setCollapsed((prev) => toggled(prev, key))
  }

  // ---- what the rows are given ---------------------------------------------------------------
  const actions = useStableActions<GridActions>({
    ...grid.cellActions,
    // Shows where and when a project is: its days are brought into view, in narrower columns if they do not
    // fit, and its halls and bars are lit for a moment, to say where the view landed.
    showProject: (key) => {
      const span = allGroups.find((group) => group.key === key)?.venue
      if (!span) return
      projectHover.flash(key)
      const el = scrollRef.current
      const fit = fitSpan(0, daysBetween(span.start, span.end) + 1, (el?.clientWidth ?? viewport.width) - LEFT_W, zoom)
      if (fit.zoom !== zoom) setZoom(fit.zoom)
      showSpan(span)
    },
    // The list keeps its order, so what comes before and after the project is still there to see.
    findProject: (key) => {
      const index = projectIndex(items, key)
      if (index < 0) return setNotice('Prosjektet er ikke blant radene som vises. Se filteret, eller åpne nivåene over det.')
      scrollRef.current?.scrollTo({ top: topHeight + rowTops[index] - pinnedHeight - headOverAt(index), behavior: 'smooth' })
    },
    toggleGroup,
    proposePlan,
    addRow: (projectName, projectNo) => setDialog({ projectName, projectNo }),
    editRow: (row) => setDialog({ row }),
    removeRow: (row) => {
      if (confirm(`Slette raden ${rowTitle(row)}?`)) removeAllocation(row.id)
    },
    clearRow: (row) => {
      const cleared = sumValues(row.fte)
      for (const date of Object.keys(row.fte)) setRowFte(row, date, null)
      setNotice(cleared ? `Tømte raden: ${formatFte(cleared, 1)} FTE-dager` : 'Raden var tom')
    },
  })

  // ---- the two modes ---------------------------------------------------------------------------
  const { switchMode, switchPart, fitBemanning } = useModeSwitch({
    modes,
    scrollRef,
    dates,
    range,
    zoom,
    viewport,
    zoomFrom,
    zoomStep,
    placeLeft,
    measure,
    onLeave: () => {
      setSelection(null)
      setCellMenu(null)
      setTool('select')
    },
  })
  const projectSpan = (key: string): DaySpan | undefined => allGroups.find((group) => group.key === key)?.venue ?? undefined
  const bemanning = shown === 'bemanning'
  const innleid = bemanning && crewPart === 'innleid'
  // The projects as Bemanning lists them, see `projectSpansOf`.
  // The score of the project of the row in focus, worked out only while its details are open.
  const scored = inspectorOpen && !bemanning ? plan.details?.row.projectNo : undefined
  const requiredFte = useCallback((row: AllocationRow) => rowTotals(demandIndex, row, settings).requiredFte ?? 0, [demandIndex, settings])
  const hoursByWork = useCallback((row: AllocationRow) => hoursByWorkType(demandIndex, row), [demandIndex])
  const score = useMemo(
    () => (scored === undefined ? null : projectScore(scorePlan(ws, dates, windowOf, weightsOf(ws.settings), { rows: allGroups.flatMap((group) => group.rows), required: requiredFte, hoursByWork }), scored)),
    [scored, ws, dates, windowOf, allGroups, requiredFte, hoursByWork],
  )
  const engineRows = useMemo(() => (engineOpen ? allGroups.flatMap((group) => group.rows) : []), [engineOpen, allGroups])
  const projectSpans = useMemo(() => (bemanning ? projectSpansOf(allGroups, plan.phasesOfProject, plan.hallsOf, hallCalendar.halls, range.start) : []), [bemanning, allGroups, plan.phasesOfProject, plan.hallsOf, hallCalendar.halls, range.start])
  // The work plans: a day or a week to read and print, opened from the page header or a right-click on a date in Bemanning.
  const [workPlan, setWorkPlan] = useState<OpenPlan | null>(null)
  const openDayPlan = useCallback((date: ISODate) => setWorkPlan({ view: 'day', date }), [setWorkPlan])
  const focusDay = useCallback((date: ISODate) => setPlanningFocus({ date }), [setPlanningFocus])
  // A click on a date picks the day in focus, the same in every mode. In Plan it lets go of the cells, whose day would be the focus.
  const pickDay = useCallback((date: ISODate) => {
    setSelection(null)
    setPlanningFocus({ date })
  }, [setPlanningFocus])
  const showDate = useCallback((date: ISODate) => scrollToDate(date, 1), [scrollToDate])

  // ---- tools: keys and modifiers --------------------------------------------------------------
  // Escape first closes the menu, then puts the pencil or the eraser away.
  const modifier = useToolKeys({
    blocked: !!dialog || bemanning,
    onTool: setTool,
    onEscape: () => {
      if (cellMenu) setCellMenu(null)
      else if (tool !== 'select') setTool('select')
    },
  })
  const activeTool = stroke ?? modifier ?? tool
  // The details panel is memoized; these keep their identity so it is not drawn again on every scroll frame.
  const spreadRow = useCallback((row: AllocationRow) => proposePlan([row], true), [proposePlan])
  const closeInspector = useCallback(() => setInspectorOpen(false), [setInspectorOpen])

  const shownRowCount = shownGroups.reduce((sum, group) => sum + group.rows.length, 0)
  const menuRow = cellMenu ? rows.find((row) => row.id === cellMenu.rowId) : undefined
  const menuWindow = menuRow ? windowOf(menuRow) : undefined
  const menuWindowEnd = menuWindow?.size ? [...menuWindow].sort().at(-1) : undefined

  const selectedDate = selection ? dates[selection.focus.col] : undefined
  if (selectedDate && selectedDate !== planningFocus?.date) setPlanningFocus({ date: selectedDate })
  const activeDate = selectedDate ?? planningFocus?.date
  const dayPlanDate = () => activeDate ?? (today >= range.start && today <= range.end ? today : dates[0])

  // ---- render ---------------------------------------------------------------------------------
  // Today as one line down the grid. It is laid by the width of a day, so the zoom moves it without drawing it again.
  const todayLine = today >= range.start && today <= range.end ? <i className="today-line" style={{ left: daysWide(daysBetween(range.start, today), LEFT_W) }} /> : null
  const { dayHover, hoverProps } = useDayHover(scrollRef, colW, dates.length)
  const places = <AreaMenu tree={hallCalendar.hallTree} statuses={hallCalendar.statuses} filter={hallFilter} onChange={setHallFilter} />
  return (
    <div className={`kalender ${bemanning ? 'bemanning-mode' : pull ? 'pulling' : activeTool === 'select' ? '' : activeTool}`} data-mode={planMode} data-part={planMode === 'bemanning' ? crewPart : undefined}>
      <BemanningScope active={bemanning} innleid={innleid} dates={dates} cols={cols} viewport={viewport} scrollRef={scrollRef} focusDate={planningFocus?.date} onFocusDate={focusDay} projects={projectSpans} planned={plan.planned} phases={plan.phasesOfProject} chosenProject={filter.project} unfolded={unfolded} setUnfolded={setUnfolded} onShowDate={showDate} blockNames={blockNames} overtimeLimit={overtimeLimit}>
      <InnleidScope active={innleid} counted={bemanning}>
      {innleid ? <InnleidHead places={places} onDayPlan={() => openDayPlan(dayPlanDate())} /> : bemanning ? <BemanningHead places={places} onDayPlan={() => openDayPlan(dayPlanDate())} /> : <KalenderHead
        places={places}
        projects={shownGroups.length}
        rows={shownRowCount}
        overbooked={overbooked.size}
        inspectorOpen={inspectorOpen}
        onInspector={setInspectorOpen}
        onNewRow={() => setDialog(allGroups.filter((g) => g.key === filter.project).map((g) => ({ projectName: g.projectName, projectNo: g.projectNo }))[0] ?? {})}
        onPropose={() => setEngineOpen(true)}
      />}

      <div className="kal-work">
      <div className="grid-scroll" ref={scrollRef} tabIndex={0} onScroll={onScroll} onMouseOver={projectHover.onMouseOver} onMouseLeave={projectHover.onMouseLeave} onKeyDown={grid.onKeyDown} onCopy={grid.onCopy} onPaste={grid.onPaste}>
        <div className="grid-canvas" style={{ width: daysWide(dates.length, LEFT_W) }}>
          {/* The date header is always pinned. The block under it stays pinned too, like Excel's frozen rows. Where it leaves the rows no room it moves up by what does not fit, and the hall calendar stays where it is, over the staffing lines. */}
          <div className="grid-head" ref={headRef} {...hoverProps}>
            {dayHover}
            <HeadRows cols={cols} zoom={zoomOf(colW)} overbooked={overbooked} activeDate={activeDate} onDate={pickDay} onDayPlan={bemanning ? openDayPlan : undefined} />
          </div>
          {/* A click on an event's bar is caught here, so the lines of the hall calendar are given no handler and are not drawn again for it. */}
          <div
            className="grid-top"
            ref={topRef}
            style={{ top: headHeight - tucked }}
            {...hoverProps}
            onClick={(e) => {
              const project = e.target instanceof Element ? e.target.closest<HTMLElement>('.hall-bar[data-project]')?.dataset.project : undefined
              if (project) actions.findProject(project)
            }}
          >
            {dayHover}
            {todayLine}
            {innleid ? <InnleidTop /> : bemanning ? <BemanningTop /> : <>
            <HallSection dayHover={dayHover} todayLine={todayLine} open={hallsOpen} onOpen={setHallsOpen} compact={hallsCompact} onCompact={setHallsCompact} empty={ws.venue.length === 0} pinTop={headHeight} halls={hallCalendar.halls} hallCount={hallCalendar.hallCount} hallBars={hallCalendar.hallBars} hallLabels={hallCalendar.hallLabels} hallProjectLists={hallCalendar.hallProjectLists} cols={cols} />
            <StaffingSection
              open={staffingOpen}
              onOpen={setStaffingOpen}
              detailsOpen={capacityOpen}
              onDetailsOpen={setCapacityOpen}
              cols={cols}
              need={need}
              capacity={capacity}
              fromBemanning={fromBemanning}
              waitingHired={waitingHired}
              settings={settings}
              heat={heat}
              heatMax={heatMax}
            />
            </>}
          </div>

          {/* The planning tools sit right above the rows they work on. They stay put when the days scroll sideways, and follow the top block when part of it gives way. */}
          <div className="grid-tools" ref={toolsRef} style={{ top: pinnedHeight - barHeight }}>
            {innleid ? (
              <InnleidToolbar width={viewport.width} mode={planMode} onMode={switchMode} onPart={switchPart} onToday={() => scrollToDate(today, 1)} />
            ) : bemanning ? (
              <BemanningToolbar
                width={viewport.width}
                mode={planMode}
                onMode={switchMode}
                onPart={switchPart}
                projects={plan.projects}
                project={filter.project}
                onProject={(key) => {
                  setFilter({ ...filter, project: key })
                  const span = projectSpan(key)
                  if (span) fitBemanning(span)
                }}
                onToday={() => scrollToDate(today, 1)}
                onFit={() => {
                  const span = projectSpan(filter.project)
                  if (span) fitBemanning(span)
                }}
              />
            ) : (
            <KalenderBar
              width={viewport.width}
              hints={hints}
              mode={planMode}
              onMode={switchMode}
              tool={tool}
              onTool={setTool}
              filter={filter}
              onFilter={setFilter}
              projects={plan.projects}
              competences={plan.competences}
              onlyInView={onlyInView}
              onOnlyInView={setOnlyInView}
              grouping={grouping}
              onGrouping={(next) => {
                // Lanes are positions in the list, so a selection would land on other rows after regrouping.
                setSelection(null)
                setGrouping(next)
              }}
              levels={shownLevels(items)}
              onLevels={(levels) => {
                // Every branch, also of the projects outside the days in view, and what was folded by hand is let go.
                setSelection(null)
                setCollapsed(foldedTo(groupItems(filtered, demandIndex, settings, new Set(), grouping), levels))
              }}
              start={range.start}
              end={range.end}
              onToday={() => scrollToDate(today)}
              date={activeDate ?? today}
              onDate={(date) => {
                pickDay(date)
                scrollToDate(date, 2)
              }}
              zoom={zoom}
              onZoom={setZoom}
            />
            )}
            {innleid ? <InnleidHeading /> : bemanning ? <PeopleHeading /> : <PlanningHeading />}
          </div>

          {/* In Bemanning today's line keeps to the lines, and stops under the last of them. */}
          {!bemanning && todayLine}
          {innleid && <div className="bm-body" {...hoverProps}>{todayLine}<InnleidRows onOpenSuppliers={onOpenSuppliers} /></div>}
          {bemanning && !innleid && <div className="bm-body" {...hoverProps}>{todayLine}<PeopleRows onOpenPersonell={onOpenPersonell} /></div>}
          {!bemanning && (
            <PlanRows
              start={range.start}
              items={items}
              r0={r0}
              r1={r1}
              rowTops={rowTops}
              allocLanes={allocLanes}
              laneOfRow={laneOfRow}
              sections={allSections}
              pinnedHeight={pinnedHeight}
              headOver={headOverAt}
              shownTop={viewport.top - tucked}
              windowOf={windowOf}
              levelWindows={plan.levelWindows}
              phasesOfProject={plan.phasesOfProject}
              rowDimensions={plan.rowDimensions}
              cols={cols}
              actions={actions}
              editOf={editOf}
              pill={grid.pill}
              hoverProps={hoverProps}
              empty={
                items.length > 0
                  ? null
                  : rows.length === 0
                    ? 'Ingen planleggingsrader ennå. Bruk «+ Ny rad» for å legge til en rad for et prosjekt.'
                    : plan.inViewOnly
                      ? 'Ingen prosjekter har planlagte dager i denne perioden. Slå av «Bare prosjekter i visningen» under Filter for å se alle.'
                      : 'Ingen rader passer filteret.'
              }
            />
          )}
        </div>
      </div>
      {bemanning && !innleid && <PersonPanel />}
      {innleid && <InnleidSidePanel onOpenSuppliers={onOpenSuppliers} />}
      {inspectorOpen && !bemanning && <RowInspector details={plan.details} need={need} capacity={capacity} settings={settings} score={score} onEdit={actions.editRow} onSpread={spreadRow} onClose={closeInspector} />}
      </div>

      {cellMenu && menuRow && (
        <CellMenu
          x={cellMenu.x}
          y={cellMenu.y}
          row={menuRow}
          date={dates[cellMenu.col]}
          remaining={(rowTotals(demandIndex, menuRow, settings).requiredFte ?? 0) - sumValues(menuRow.fte)}
          windowEnd={menuWindowEnd}
          stored={!isSuggestedRow(menuRow)}
          onClose={() => setCellMenu(null)}
          onSpread={() => proposePlan([menuRow], true)}
          onSpreadFromHere={() => {
            const lane = laneOfRow.get(menuRow.id)
            if (lane !== undefined && menuWindowEnd) drawDemand({ anchor: { lane, col: cellMenu.col }, focus: { lane, col: daysBetween(range.start, menuWindowEnd) } })
          }}
          onClearCell={() => setRowFte(menuRow, dates[cellMenu.col], null)}
          onClearRow={() => actions.clearRow(menuRow)}
          onDetails={() => setInspectorOpen(true)}
          onEdit={() => actions.editRow(menuRow)}
          onRemove={() => actions.removeRow(menuRow)}
        />
      )}

      {workPlan && <WorkPlanDialog open={workPlan} onOpen={setWorkPlan} onClose={() => setWorkPlan(null)} />}
      {bemanning && !innleid && <BemanningOverlays />}
      {!bemanning && <StatusBar focus={grid.focusInfo} selectionSum={grid.selectionSum} notice={notice} progress={grid.progress} onSaveNote={setAllocationNote} />}

      {engineOpen && (
        <EngineDialog
          ws={ws}
          rows={engineRows}
          required={requiredFte}
          hoursByWork={hoursByWork}
          windowOf={windowOf}
          nearby={plan.nearbyOf}
          dates={dates}
          onClose={() => setEngineOpen(false)}
          onApply={(solution, projectNos) => {
            updateStaffing((w) => takeProjects(w, solution, projectNos))
            setNotice(`Motorens plan er brukt for ${count(projectNos.length, 'prosjekt', 'prosjekter')}. Kan angres med Ctrl/Cmd+Z.`)
            setEngineOpen(false)
          }}
        />
      )}
      {dialog && (
        <AllocationDialog
          row={dialog.row}
          projectName={dialog.projectName}
          projectNo={dialog.projectNo}
          projects={plan.projectOptions}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            // If the row's project is not in the list as filtered now, switch to showing that project.
            const key = allGroups.find((group) => group.key === projectKey(saved) || group.projectName === saved.projectName)?.key ?? projectKey(saved)
            const shown = items.some((item) => (item.kind === 'group' ? item.node.project?.key : item.project.key) === key)
            if (!shown) setFilter({ ...EMPTY_FILTER, project: key })
            // Open every level above the row.
            setCollapsed((prev) => {
              const next = new Set(prev)
              for (const level of pathKeys(saved, key, grouping)) next.delete(level)
              return next
            })
            grid.setPendingFocus(saved.id)
          }}
        />
      )}
      </InnleidScope>
      </BemanningScope>
    </div>
  )
}

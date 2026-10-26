import { Fragment, memo } from 'react'
import { dayText, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import type { Balance } from '../../domain/staffing/balance'
import { Twisty } from '../common'
import { competenceColor } from '../dom'
import { Line, SectionLine } from '../kalender/GridRows'
import { dayClass, type Columns } from '../kalender/gridTypes'
import { useStableActions } from '../kalender/useStableActions'
import { useBemanning, type DemandRow } from './BemanningScope'
import { DensityToggle } from './DensityToggle'
import { DEMAND_COMPACT_H, DEMAND_H } from './layout'
import { EPSILON } from './week'
import { hoursText } from '../format'
import { staffedLabel, type NeedLabelParts } from '../../domain/needLabel'
import { LinePick, NeedLabel, NeedLine } from './NeedLabel'

const NO_HOURS = new Map<string, number>()

/** An open line's day the staff cannot cover in normal time: the hatch across it, and no figure. */
const UNCOVERABLE_DAY: NeedLabelParts = { segs: [{ kind: 'uncoverable', from: 0, width: 1 }], rules: [], figure: null, alert: false, of: null }

interface LineProps {
  row: DemandRow
  cols: Columns
  balance: Balance
  /** By `competence|date`: the remaining hours the people with the competence have no free normal time for. */
  uncoverable: Map<string, number>
  /** The hours that remain in the days in view. */
  remaining: number
  compact: boolean
  /** The competence in focus, if any. */
  brush: string | null
  onPick: (competence: string) => void
  onDay: (competence: string, date: ISODate, event: React.MouseEvent) => void
  /** A project's line under the competence in focus, with its name and whether it is the brush; `balance` is then the project's part. */
  project?: { projectNo: string; name: string; on: boolean }
  onProject?: (projectNo: string) => void
  /** A place's line under the project in focus, with its name and whether it is the brush; `balance` is then the place's part. */
  place?: { hall: string; name: string; on: boolean }
  onPlace?: (hall: string) => void
  /** The brush is a line under this one, not this line: a project's line under the sum line, or a place's under the project's. */
  projectHeld?: boolean
  /** The line is open, with lines under it that show its days: as an open level of the plan, it shows no sums of its own. */
  summed?: boolean
  /** The line under the projects of what is on none of them: no brush of its own. */
  rest?: boolean
  /** Where the line lies in the tree under the competence in focus, drawn as lines down the label column (see `TreeStep`): the competence's line, and the project's. Plain values, so the memo holds. */
  treeOuter?: TreeStep
  treeInner?: TreeStep
}

/**
 * The tree under the competence in focus, as lines down the label column, as a tree of folders has them: the competence's line runs down
 * its projects and the line «Uten prosjekt», the project's down its places. `branch` is a line with a stub to its name and more under it,
 * `end` the last, where the line stops, `pass` a line that goes on past a line that is not its own (the competence's past a place),
 * and `start` where a line begins, under the project in focus with its places.
 */
type TreeStep = 'branch' | 'end' | 'pass' | 'start'

/** One competence's line: its name with what is left in the days in view, and each day's hours. */
const DemandLine = memo(function DemandLine({ row: { style, key }, cols, balance, uncoverable, remaining, compact, brush, onPick, onDay, project, onProject, place, onPlace, projectHeld, summed, rest, treeOuter, treeInner }: LineProps) {
  const on = rest ? false : place ? place.on : project ? project.on : style.key === brush
  const label = rest ? (
    <LinePick kind="project" name="Uten prosjekt" hours={remaining} compact={compact} disabled outer={treeOuter} inner={treeInner} title={`${style.label} uten prosjekt: behov uten prosjektnummer, timer ingen prosjekt mangler, og prosjekter som ikke er i Kalender. Mal på sumlinjen.`} />
  ) : place && project ? (
    <LinePick kind="place" name={place.name} hours={remaining} compact={compact} pressed={on} outer={treeOuter} inner={treeInner} title={on ? `Mal for ${project.name} uten sted: velg prosjektlinjen` : `Mal ${style.label} for ${project.name} i ${place.name}. Pil opp og ned bytter linje.`} onClick={() => onPlace?.(place.hall)} />
  ) : project ? (
    <LinePick kind="project" name={project.name} hours={remaining} compact={compact} pressed={on} outer={treeOuter} inner={treeInner} title={on ? `Mal uten prosjekt: velg sumlinjen (${style.label})` : `Mal ${style.label} for ${project.name}. Pil opp og ned bytter linje.`} onClick={() => onProject?.(project.projectNo)} />
  ) : (
    <LinePick
      name={style.label}
      hours={remaining}
      compact={compact}
      kbd={key > 0 && !compact && <kbd>{key}</kbd>}
      pressed={on}
      disabled={!key && !on}
      outer={treeOuter}
      inner={treeInner}
      title={on ? 'Slå av fokus og pensel (Esc)' : key ? `Fokuser på ${style.label} og mal med den (${key})` : `Ingen av de faste har ${style.label}`}
      onClick={() => onPick(style.key)}
    />
  )
  return (
    <Line
      className={`bm-demand ${project || rest ? 'bm-demand-project' : ''} ${place ? 'bm-demand-place' : ''} ${compact ? 'compact' : ''} ${on ? 'on' : brush && !project && !rest ? 'dim' : ''} ${on && projectHeld ? 'held' : ''} ${summed ? 'summed' : ''}`}
      height={compact ? DEMAND_COMPACT_H : DEMAND_H}
      label={label}
      cols={cols}
      cells={(date) => {
        const cell = balance.get(style.key, date)
        const classes = `${dayClass(cols, date)} cell bm-need`
        if (cell.demand < EPSILON && cell.assigned < EPSILON) return <div key={date} className={classes} />
        const unc = uncoverable.get(`${style.key}|${date}`) ?? 0
        // An open line leaves its days to the lines under it; what the staff cannot cover is the competence's alone, so it stays here.
        if (summed)
          return unc > EPSILON ? (
            <button key={date} className={classes} title={`${style.label} · ${dayText(date)}\n${hoursText(unc)} t kan ikke dekkes av faste i normaltid.`} onClick={(e) => onDay(style.key, date, e)}>
              {compact ? <NeedLine parts={UNCOVERABLE_DAY} /> : <NeedLabel parts={UNCOVERABLE_DAY} className="summed" />}
            </button>
          ) : (
            <div key={date} className={classes} />
          )
        const left = Math.max(0, cell.remaining)
        const over = cell.remaining < -EPSILON
        const what = over ? `+${hoursText(-cell.remaining)} t over` : left > EPSILON ? `${hoursText(left)} t igjen av ${hoursText(cell.demand)}` : 'dekket'
        if (compact)
          // One line: the demand as a tint, filled solid from the left as it is covered, and what is given beyond it as the ochre tail.
          return (
            <button key={date} className={classes} title={`${style.label} · ${what}${unc > EPSILON ? `\n${hoursText(unc)} t kan ikke dekkes av faste i normaltid.` : ''}`} onClick={(e) => onDay(style.key, date, e)}>
              {(cell.demand > EPSILON || over) && <NeedLine parts={staffedLabel(cell, unc, EPSILON)} />}
            </button>
          )
        const title =
          `${style.label}${project ? ` · ${project.name}` : ''}${place ? ` · ${place.name}` : ''} · ${dayText(date)}${dayType(date) !== 'arbeidsdag' ? ' (overtid)' : ''}\nBehov ${hoursText(cell.demand)} t · tildelt ${hoursText(cell.assigned)} t` +
          (cell.assignedOT > EPSILON ? ` (herav ${hoursText(cell.assignedOT)} t overtid)` : '') +
          ` · gjenstår ${hoursText(left)} t` +
          (cell.carried > EPSILON ? `\n${hoursText(cell.carried)} t er flyttet hit fra dagen før.` : '') +
          (unc > EPSILON ? `\n${hoursText(unc)} t kan ikke dekkes av faste i normaltid.` : '')
        return (
          <button key={date} className={classes} title={title} onClick={(e) => onDay(style.key, date, e)}>
            <NeedLabel parts={staffedLabel(cell, unc, EPSILON)} />
            {cell.carried > EPSILON && <i className="bm-carried" />}
          </button>
        )
      }}
      style={competenceColor(style)}
    />
  )
})

/**
 * The demand per competence, summed over the projects (R10): what remains of each day's hours against
 * what is assigned. A competence in focus is also the brush. Folded, only the competence in focus shows.
 * While a stroke is drawn over the people, the days it covers show what would remain after it, and so does
 * the sum in the label: the figures fall as hours are given, and a day given more than it needs turns to over.
 * The competence in focus has a line under it for each project with hours of it in view: what the project lacks once its own
 * hours and its share of the hours for no project are counted. The project in focus has a line under it for each of its places,
 * where it has two or more in view. The line in focus is the brush. The other competences shrink to one thin line while it is open.
 * A line with lines under it shows no sums in its days, as an open level of the plan; what is on none of the projects is a line of its own under them.
 */
export function DemandRows() {
  const bm = useBemanning()
  const { demandRows, remainingOf, shownBalance, shownRemaining, uncoverable, cols, brush, brushProject, brushHall, projectLines, projectShown, restShown, placeLines, placeShown, demandOpen: open, demandDensity, idleOpen, onFocusDate, pickFromDemand, pickProject, pickPlace, setDemandPop } = bm
  const compact = demandDensity === 'compact'
  // A competence with neither demand nor assigned hours in the period is set aside under one line. The one in focus stays.
  const isIdle = (key: string) => key !== brush && !remainingOf.has(key)
  const busy = demandRows.filter(({ style }) => !isIdle(style.key))
  const idle = demandRows.filter(({ style }) => isIdle(style.key))
  const onDay = (competence: string, date: ISODate, event: React.MouseEvent) => {
    // A click on a day picks its competence, makes the day the one in focus, and opens its balance with moved hours.
    if (bm.keyOf.has(competence) && competence !== brush) bm.pickBrush(competence)
    onFocusDate(date)
    setDemandPop({ competence, date, x: event.clientX, y: event.clientY })
  }
  // The lines are memoized, and are handed the same handlers every time, or each of them is drawn again whenever the grid is.
  const handlers = useStableActions({
    onPick: pickFromDemand,
    onDay,
    // A click on the project in focus goes back to the sum line, or from one of its places to the project's line.
    onProject: (projectNo: string) => (projectNo === brushProject && brushHall !== null ? pickPlace(null) : pickProject(projectNo === brushProject ? null : projectNo)),
    onPlace: (hall: string) => pickPlace(hall === brushHall ? null : hall),
  })
  const line = (row: DemandRow) => {
    if (!open && row.style.key !== brush) return null
    const inFocus = row.style.key === brush
    // The competence in focus with lines under it leaves its days to them, as an open level of the plan.
    const opened = inFocus && projectLines.length > 0
    return (
      <Fragment key={row.style.key}>
        <DemandLine row={row} cols={cols} balance={shownBalance} uncoverable={uncoverable} remaining={shownRemaining.get(row.style.key) ?? 0} compact={compact || (brush !== null && !inFocus)} brush={brush} onPick={handlers.onPick} onDay={handlers.onDay} projectHeld={inFocus && brushProject !== null} summed={opened} treeOuter={opened ? 'start' : undefined} />
        {inFocus &&
          projectLines.map((project, i) => {
            const shown = projectShown.get(project.projectNo)
            const projectInFocus = project.projectNo === brushProject
            const withPlaces = projectInFocus && placeLines.length > 0
            // The competence's line stops at its last line: the last project, or «Uten prosjekt» under them.
            const last = !restShown && i === projectLines.length - 1
            return shown ? (
              <Fragment key={project.projectNo}>
                <DemandLine
                  row={row}
                  cols={cols}
                  balance={shown.balance}
                  uncoverable={NO_HOURS}
                  remaining={shown.remaining}
                  compact={compact}
                  brush={brush}
                  onPick={handlers.onPick}
                  onDay={handlers.onDay}
                  project={{ projectNo: project.projectNo, name: project.name, on: projectInFocus }}
                  onProject={handlers.onProject}
                  projectHeld={projectInFocus && brushHall !== null}
                  summed={withPlaces}
                  treeOuter={last ? 'end' : 'branch'}
                  treeInner={withPlaces ? 'start' : undefined}
                />
                {withPlaces &&
                  placeLines.map((place, j) => {
                    const at = placeShown.get(place.hall)
                    const lastPlace = j === placeLines.length - 1
                    return at ? (
                      <DemandLine
                        key={place.hall}
                        row={row}
                        cols={cols}
                        balance={at.balance}
                        uncoverable={NO_HOURS}
                        remaining={at.remaining}
                        compact={compact}
                        brush={brush}
                        onPick={handlers.onPick}
                        onDay={handlers.onDay}
                        project={{ projectNo: project.projectNo, name: project.name, on: false }}
                        onProject={handlers.onProject}
                        place={{ hall: place.hall, name: place.name, on: place.hall === brushHall }}
                        onPlace={handlers.onPlace}
                        treeOuter={last ? undefined : 'pass'}
                        treeInner={lastPlace ? 'end' : 'branch'}
                      />
                    ) : null
                  })}
              </Fragment>
            ) : null
          })}
        {inFocus && restShown && (
          <DemandLine row={row} cols={cols} balance={restShown.balance} uncoverable={NO_HOURS} remaining={restShown.remaining} compact={compact} brush={brush} onPick={handlers.onPick} onDay={handlers.onDay} rest treeOuter="end" />
        )}
      </Fragment>
    )
  }
  return (
    <div className={`top-section bm-demand-section open ${compact ? 'compact' : ''}`}>
      <SectionLine>
        <Twisty open={open} show="Vis alle kompetanser" hide="Vis bare kompetansen i fokus" onToggle={() => bm.setDemandOpen(!open)} />
        Kompetanse
        {open && <DensityToggle compact={compact} onChange={(next) => bm.setDemandDensity(next ? 'compact' : 'detail')} />}
        <span className="section-meta section-meta-end" title={open ? 'Timer som mangler i dagene som vises' : undefined}>{open ? 'timer mangler' : `${demandRows.filter(({ style }) => style.key !== brush).length} skjult`}</span>
      </SectionLine>
      {busy.map(line)}
      {open && idle.length > 0 && (
        <SectionLine className="bm-idle-head">
          <Twisty open={idleOpen} show="Vis kompetansene uten behov" hide="Skjul kompetansene uten behov" onToggle={() => bm.setIdleOpen(!idleOpen)} />
          Uten behov
          <span className="section-meta">{idle.length}</span>
        </SectionLine>
      )}
      {open && idleOpen && idle.map(line)}
    </div>
  )
}

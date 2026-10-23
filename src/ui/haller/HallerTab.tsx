import { useMemo, type ReactNode } from 'react'
import { todayIso } from '../../domain/dates'
import { reviewPlacing } from '../../domain/hallReview'
import { VENUE_PHASES } from '../../domain/types'
import { hallChoices, NO_HALL_RULES } from '../../domain/locations'
import { hallsOfProjects, knownNumbers, matchProjects, withProjectCounts } from '../../domain/projects'
import { hallNames } from '../../domain/venue'
import { useWorkspace } from '../../store/workspaceStore'
import { HallRules } from '../behov/HallRules'
import { count } from '../dom'
import { Prosjekter } from '../prosjekter/Prosjekter'
import { RegisterHead, type PageCount, type RegisterPage, type TablePage } from '../RegisterHead'
import { Toasts, useUndoToasts } from '../Toasts'
import { Haller } from './Haller'

export type HallerPage = 'haller' | 'prosjekter' | 'hallregler'

interface Props {
  page: HallerPage
  pages: RegisterPage<HallerPage>[]
  onPage: (page: HallerPage) => void
  /** Opens the file dialog for a Venyou export. */
  onReadVenyou: () => void
  venyouTitle: string
  onOpenBehov: (projectNo: string) => void
}

/** The halls: the bookings from Venyou, the projects they belong to, and the rules that place the demand in a hall. A page each. */
export function HallerTab({ page, pages, onPage, onReadVenyou, venyouTitle, onOpenBehov }: Props) {
  const { workspace } = useWorkspace()
  const ws = workspace!
  const { toasts, show, dismiss, notify } = useUndoToasts()
  // The events that are not over, as the page lists them until «Ta med tidligere» is switched on.
  const events = useMemo(() => {
    const today = todayIso()
    return new Set(ws.venue.filter((booking) => VENUE_PHASES.some((phase) => (booking.phases[phase]?.end ?? '') >= today)).map((booking) => booking.eventName)).size
  }, [ws.venue])
  // The matching of names is worked out again only when Venyou, the table or the numbers known change, not on an edit of the plan.
  const known = useMemo(() => knownNumbers(ws), [ws.visma, ws.demand, ws.allocations]) // eslint-disable-line react-hooks/exhaustive-deps
  const knownKey = known.map((number) => `${number.projectNo}\t${number.name}`).join('\n')
  const matched = useMemo(() => matchProjects(ws.venue, ws.projects, known), [ws.venue, ws.projects, knownKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const projects = useMemo(() => withProjectCounts(matched, ws), [matched, ws.visma, ws.demand, ws.allocations]) // eslint-disable-line react-hooks/exhaustive-deps
  const rules = ws.hallRules ?? NO_HALL_RULES
  const unplaced = useMemo(() => {
    const halls = hallNames(ws.venue)
    return reviewPlacing(ws.demand, halls, hallsOfProjects(ws.venue, ws.projects), rules).unplaced.length
  }, [ws.demand, ws.venue, ws.projects, rules])
  const counts: Record<HallerPage, PageCount> = {
    haller: { rows: events },
    prosjekter: {
      rows: new Set(projects.filter((row) => row.projectNo && row.lacking !== 'new').map((row) => row.projectNo)).size,
      issues: projects.filter((row) => row.lacking === 'number' || row.lacking === 'ambiguous').length,
      issueText: (n) => `${count(n, 'arrangement', 'arrangementer')} uten prosjekt`,
    },
    hallregler: {
      rows: rules.places.length + rules.phrases.length + hallChoices(rules.choices).length,
      issues: unplaced,
      issueText: (n) => `${count(n, 'tekst', 'tekster')} i behovet som ingen regel plasserer`,
    },
  }
  const head = (actions: ReactNode) => (
    <RegisterHead title="Haller" pages={pages} page={page} counts={counts} onPage={onPage}>
      {actions}
    </RegisterHead>
  )
  const props: TablePage = { head, notify, show }
  return (
    <div className="register-page">
      {page === 'haller' && <Haller {...props} onOpenProjects={() => onPage('prosjekter')} onReadVenyou={onReadVenyou} venyouTitle={venyouTitle} />}
      {page === 'prosjekter' && <Prosjekter {...props} rows={projects} onOpenBehov={onOpenBehov} />}
      {page === 'hallregler' && <HallRules {...props} />}
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

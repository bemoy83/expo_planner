import { useMemo, type ReactNode } from 'react'
import { competenceStyles, unstaffedCompetences } from '../../domain/competences'
import { normalDayHours } from '../../domain/staffing/intervals'
import { useWorkspace } from '../../store/workspaceStore'
import { BandFigures, Figure } from '../BandFigures'
import { count } from '../dom'
import { hoursText } from '../format'
import { RegisterHead, type PageCount, type RegisterPage, type TablePage } from '../RegisterHead'
import { Toasts, useUndoToasts } from '../Toasts'
import { Kompetanser } from './Kompetanser'
import { Leverandorer } from '../leverandorer/Leverandorer'
import { Personell } from './Personell'

export type MannskapPage = 'personell' | 'leverandorer' | 'kompetanser'

interface Props {
  page: MannskapPage
  pages: RegisterPage<MannskapPage>[]
  onPage: (page: MannskapPage) => void
}

/** Who does the work: the permanent staff, the suppliers hired from, and the competences both are given. A page each. */
export function Mannskap({ page, pages, onPage }: Props) {
  const { workspace } = useWorkspace()
  const ws = workspace!
  const { toasts, show, dismiss, notify } = useUndoToasts()
  const unstaffed = useMemo(() => unstaffedCompetences(ws).length, [ws])
  const competences = useMemo(() => competenceStyles(ws).length, [ws])
  const persons = ws.persons?.length ?? 0
  const counts: Record<MannskapPage, PageCount> = {
    personell: { rows: persons },
    leverandorer: { rows: ws.suppliers?.length ?? 0 },
    kompetanser: {
      rows: competences,
      issues: unstaffed,
      issueText: (n) => `${count(n, 'kompetanse', 'kompetanser')} i behovet har ingen faste`,
    },
  }
  // Faste's key figures, on the band: the people, and what they work on a normal day, the capacity Resultat sets the plan against.
  const dayHours = normalDayHours(ws.settings.workday)
  const figures = page === 'personell' && persons > 0 && (
    <BandFigures>
      <Figure label="Faste" value={persons} unit="" />
      <Figure label="Faste per dag" value={hoursText(persons * dayHours)} sub={`${persons} × ${hoursText(dayHours)} t`} />
    </BandFigures>
  )
  const head = (actions: ReactNode) => (
    <>
      <RegisterHead title="Mannskap" pages={pages} page={page} counts={counts} onPage={onPage}>
        {actions}
      </RegisterHead>
      {figures}
    </>
  )
  const props: TablePage = { head, notify, show }
  return (
    <div className="register-page">
      {page === 'personell' && <Personell {...props} onOpenSuppliers={() => onPage('leverandorer')} />}
      {page === 'leverandorer' && <Leverandorer {...props} />}
      {page === 'kompetanser' && <Kompetanser {...props} />}
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

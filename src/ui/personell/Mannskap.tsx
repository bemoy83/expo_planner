import { useMemo, type ReactNode } from 'react'
import { competenceStyles, unstaffedCompetences } from '../../domain/competences'
import { useWorkspace } from '../../store/workspaceStore'
import { count } from '../dom'
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
  const counts: Record<MannskapPage, PageCount> = {
    personell: { rows: ws.persons?.length ?? 0 },
    leverandorer: { rows: ws.suppliers?.length ?? 0 },
    kompetanser: {
      rows: competences,
      issues: unstaffed,
      issueText: (n) => `${count(n, 'kompetanse', 'kompetanser')} i behovet har ingen aktive faste`,
    },
  }
  const head = (actions: ReactNode) => (
    <RegisterHead title="Mannskap" pages={pages} page={page} counts={counts} onPage={onPage}>
      {actions}
    </RegisterHead>
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

import { useMemo } from 'react'
import { competenceStyles } from '../../domain/competences'
import { competenceKey, type WorkTypeRule } from '../../domain/types'
import type { PickItem } from '../fields'
import { useWorkspace } from '../../store/workspaceStore'

/** The colour of a competence, as a style value, from its style on Kompetanser; nothing for one without a style. */
export function useCompetenceColor(): (competence: string) => string | undefined {
  const { workspace } = useWorkspace()
  const ws = workspace!
  const colors = useMemo(() => new Map(competenceStyles(ws).map((style) => [style.key, `var(--${style.color})`])), [ws])
  return (competence) => colors.get(competenceKey(competence))
}

/** A product type of KPI in a list: its unit and competence after it, and the competence's colour before it. */
export const kpiTypeItem = (type: WorkTypeRule, color: (competence: string) => string | undefined, value = type.productType): PickItem => ({
  value,
  label: type.productType,
  note: [type.unit, type.competence].filter(Boolean).join(' · '),
  dot: color(type.competence),
})

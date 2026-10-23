import { useMemo } from 'react'
import { planningSettings } from '../../domain/calc'
import { hiredFte, hiredLine } from '../../domain/hire'
import { absenceLine, overtimeLine } from '../../domain/staffing/time'
import type { Workspace } from '../../domain/types'

/**
 * The settings of the plan and the staffing lines of the Kalender that are worked out from Bemanning: absence and overtime of
 * the permanent staff, and the people hired in Innleid. The confirmed orders are added to «Tilgjengelig», those that wait are only told of.
 */
export function useStaffingLines(ws: Workspace) {
  const settings = useMemo(() => planningSettings(ws), [ws.settings, ws.persons]) // eslint-disable-line react-hooks/exhaustive-deps
  const absence = useMemo(() => absenceLine(ws), [ws.persons, ws.unavailability, ws.settings]) // eslint-disable-line react-hooks/exhaustive-deps
  const overtime = useMemo(() => overtimeLine(ws), [ws.persons, ws.unavailability, ws.assignments, ws.settings]) // eslint-disable-line react-hooks/exhaustive-deps
  const hired = useMemo(() => hiredFte(ws), [ws.hireOrders, ws.settings]) // eslint-disable-line react-hooks/exhaustive-deps
  const hiredCapacity = useMemo(() => hiredLine(hired.confirmed), [hired])
  const capacity = useMemo(() => [absence, overtime, hiredCapacity], [absence, overtime, hiredCapacity])
  const fromBemanning = useMemo(() => {
    const overtimeFte = Object.fromEntries(Object.entries(overtime.values).map(([date, people]) => [date, Math.round(((people * (overtime.hours?.[date] ?? 0)) / settings.hoursPerDay) * 100) / 100]))
    return [
      ...(ws.persons?.length
        ? [
            { label: 'Fravær faste (FTE)', title: 'Fravær blant de faste, hentet fra Bemanning. Trekkes fra Tilgjengelig.', values: absence.values },
            { label: 'Overtid faste (FTE)', title: 'Overtid tegnet i Bemanning, regnet om til FTE. Legges til Tilgjengelig.', values: overtimeFte },
          ]
        : []),
      ...(ws.suppliers?.length || ws.hireOrders?.length ? [{ label: 'Innleid (FTE)', title: 'Bekreftede bestillinger fra Bemanning · Innleid, regnet om til FTE. Legges til Tilgjengelig. Bestillinger som venter på svar teller ikke.', values: hired.confirmed }] : []),
    ]
  }, [ws.persons, ws.suppliers, ws.hireOrders, absence, overtime, hired, settings.hoursPerDay])
  return { settings, capacity, fromBemanning, waitingHired: hired.waiting }
}

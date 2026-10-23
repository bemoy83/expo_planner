// The one import carries its extension, so that Node runs this file as it is (`npm run demo-data`).
import { writeXlsx, type CellValue } from '../import/xlsx.ts'

/**
 * An invented season to test with: the sources as files in the layouts the app reads (Venyou, Visma), and the
 * planner's own tables as the app exports them (KPI, Personell, Leverandører, budgets). Every name and number is made
 * up; nothing comes from the real files, and the data holds no customer, no order number and no contact person.
 *
 * The data is fixed, not random, so tests can count on it. It is built to touch what the app has to handle: product
 * types with several units, one missing from the KPI table, lines without a product type, a free-text place, a place
 * of several halls, a project booked in several halls, events that overlap, events with and without demand, two
 * statuses, and a season that runs over the new year. The crew is 40 people over eight competences and ten suppliers.
 */

/** The file names, as the app reads the period of a Venyou export and the date of a Visma export from them. */
export const DEMO_FILES = {
  venyou: 'location_format_from-2026-09-01_to-2027-06-30.xlsx',
  visma: 'utskrift_visma_19.10.26.xlsx',
  kpi: 'KPI demo.xlsx',
  kompetanser: 'Kompetanser demo.xlsx',
  personell: 'Personell demo.xlsx',
  leverandorer: 'Leverandører demo.xlsx',
  budsjett: 'Budsjett demo.xlsx',
} as const

export type DemoFile = keyof typeof DEMO_FILES

/** Days from an ISO date. */
const day = (iso: string, days: number): string => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

interface DemoEvent {
  projectNo: string
  name: string
  /** The first day of the event itself; build-up comes before it, tear-down after. */
  start: string
  /** Days the event runs. */
  days: number
  halls: string[]
  status: string
  /** Days of build-up and tear-down. */
  assembly: number
  dismantle: number
  /** Stands sold through Visma; none where the event has no orders yet. */
  stands: number
}

const CONFIRMED = 'Confirmed'
const PRELIMINARY = 'Preliminary'

export const DEMO_EVENTS: DemoEvent[] = [
  { projectNo: '26101', name: 'Byggemessen 2026', start: '2026-10-14', days: 3, halls: ['C', 'D'], status: CONFIRMED, assembly: 6, dismantle: 3, stands: 24 },
  { projectNo: '26105', name: 'Fagdag Elektro 2026', start: '2026-10-22', days: 1, halls: ['STUDIO1'], status: CONFIRMED, assembly: 1, dismantle: 1, stands: 6 },
  { projectNo: '26102', name: 'Spillfestivalen 2026', start: '2026-10-30', days: 3, halls: ['B1', 'B2', 'B3', 'B4'], status: CONFIRMED, assembly: 4, dismantle: 2, stands: 18 },
  { projectNo: '26104', name: 'Bil og Fritid 2026', start: '2026-11-12', days: 4, halls: ['C', 'D', 'E'], status: CONFIRMED, assembly: 7, dismantle: 4, stands: 30 },
  { projectNo: '26106', name: 'Seniormessen 2026', start: '2026-11-13', days: 2, halls: ['A1', 'A2'], status: CONFIRMED, assembly: 3, dismantle: 1, stands: 14 },
  { projectNo: '26103', name: 'Julemarkedet 2026', start: '2026-11-26', days: 4, halls: ['A1', 'A2', 'G'], status: CONFIRMED, assembly: 3, dismantle: 2, stands: 20 },
  { projectNo: '26107', name: 'Gaming Expo 2026', start: '2026-12-04', days: 3, halls: ['B1', 'B2', 'B3', 'B4', 'C'], status: CONFIRMED, assembly: 5, dismantle: 3, stands: 26 },
  { projectNo: '27101', name: 'Reiselivsmessen 2027', start: '2027-01-14', days: 3, halls: ['B1', 'B2'], status: CONFIRMED, assembly: 4, dismantle: 2, stands: 22 },
  { projectNo: '27109', name: 'Utdanningsmessen 2027', start: '2027-01-21', days: 2, halls: ['C', 'D'], status: CONFIRMED, assembly: 3, dismantle: 2, stands: 20 },
  { projectNo: '27102', name: 'Båtmessen 2027', start: '2027-02-04', days: 5, halls: ['C', 'D', 'E', 'F'], status: CONFIRMED, assembly: 8, dismantle: 4, stands: 30 },
  { projectNo: '27110', name: 'Vinterlekene 2027', start: '2027-02-05', days: 3, halls: ['A1', 'A2', 'G'], status: CONFIRMED, assembly: 4, dismantle: 2, stands: 12 },
  { projectNo: '27103', name: 'Bryllupsmessen 2027', start: '2027-02-27', days: 2, halls: ['A1'], status: CONFIRMED, assembly: 2, dismantle: 1, stands: 10 },
  { projectNo: '27111', name: 'Næringslivsdagen 2027', start: '2027-03-04', days: 1, halls: ['STUDIO1'], status: CONFIRMED, assembly: 1, dismantle: 1, stands: 8 },
  { projectNo: '27104', name: 'Matfestivalen 2027', start: '2027-03-18', days: 3, halls: ['B3', 'B4', 'C'], status: CONFIRMED, assembly: 4, dismantle: 2, stands: 24 },
  { projectNo: '27112', name: 'Sykkelmessen 2027', start: '2027-03-19', days: 3, halls: ['E', 'F'], status: CONFIRMED, assembly: 4, dismantle: 2, stands: 16 },
  { projectNo: '27113', name: 'Energimessen 2027', start: '2027-04-07', days: 3, halls: ['C', 'D', 'E'], status: CONFIRMED, assembly: 6, dismantle: 3, stands: 28 },
  { projectNo: '27105', name: 'Hage 2027', start: '2027-04-15', days: 4, halls: ['C', 'D'], status: CONFIRMED, assembly: 5, dismantle: 3, stands: 22 },
  { projectNo: '27114', name: 'Hundeutstillingen 2027', start: '2027-04-24', days: 2, halls: ['A1', 'A2', 'B1', 'B2'], status: CONFIRMED, assembly: 2, dismantle: 1, stands: 12 },
  { projectNo: '27106', name: 'Helse og Velvære 2027', start: '2027-05-06', days: 3, halls: ['E', 'F'], status: PRELIMINARY, assembly: 3, dismantle: 2, stands: 16 },
  { projectNo: '27115', name: 'Anleggsdagene 2027', start: '2027-05-12', days: 3, halls: ['C', 'D', 'G'], status: PRELIMINARY, assembly: 6, dismantle: 3, stands: 24 },
  { projectNo: '27107', name: 'Skolemessen 2027', start: '2027-05-27', days: 2, halls: ['A1', 'A2'], status: PRELIMINARY, assembly: 2, dismantle: 1, stands: 0 },
  { projectNo: '27108', name: 'Interiørdagene 2027', start: '2027-06-10', days: 3, halls: ['B1', 'B2', 'C'], status: PRELIMINARY, assembly: 4, dismantle: 2, stands: 0 },
  { projectNo: '27116', name: 'Sommerfest Messeområdet 2027', start: '2027-06-18', days: 1, halls: ['G'], status: PRELIMINARY, assembly: 1, dismantle: 1, stands: 0 },
]

/** The halls the bookings are in; the B halls are named to be gathered as one place, «B». */
export const DEMO_HALLS = ['A1', 'A2', 'B1', 'B2', 'B3', 'B4', 'C', 'D', 'E', 'F', 'G', 'STUDIO1']

const VENYOU_PHASES = ['Assembly', 'Moving in', 'Event', 'Moving out', 'Dismantle'] as const

/** One row per hall and event, with a start and an end date per phase, as Venyou's location export has. */
const venyouRows = (): CellValue[][] =>
  DEMO_EVENTS.flatMap((event) => {
    const eventEnd = day(event.start, event.days - 1)
    const assemblyStart = day(event.start, -event.assembly - 1)
    const spans: Record<(typeof VENYOU_PHASES)[number], [string, string]> = {
      Assembly: [assemblyStart, day(event.start, -2)],
      'Moving in': [day(event.start, -1), day(event.start, -1)],
      Event: [event.start, eventEnd],
      'Moving out': [day(eventEnd, 1), day(eventEnd, 1)],
      Dismantle: [day(eventEnd, 2), day(eventEnd, 1 + event.dismantle)],
    }
    return event.halls.map((hall): CellValue[] => [hall, event.name, event.status, ...VENYOU_PHASES.flatMap((phase) => spans[phase])])
  })

const venyouFile = () =>
  writeXlsx([
    {
      name: 'Locations',
      head: ['Locations', 'Event name', 'Status', ...VENYOU_PHASES.flatMap((phase) => [`${phase} start date`, `${phase} end date`])],
      rows: [
        ...venyouRows(),
        // A hall booked for maintenance, with no project.
        ['F', 'Vedlikehold gulv', 'Maintenance', null, null, null, null, '2026-12-14', '2026-12-18', null, null, null, null],
      ],
    },
  ])

interface DemoProductType {
  name: string
  competence: string
  /** Units with their rates: units of work per person-hour for build-up and tear-down. */
  /** `inUse` marks the unit in use of a type with several; a type with several and none marked is left for the planner to choose. */
  units: { unit: string; assembly: number; dismantle: number; inUse?: boolean }[]
  /** The article numbers and texts it is sold as. */
  articles: [string, string][]
  /** The quantity per stand, as a range. */
  quantity: [number, number]
}

/** The competences, with a short name and a colour as Kompetanser has them (the colour names of `kompetanserFile.ts`). */
const DEMO_COMPETENCE_STYLES: [string, string, string][] = [
  ['Vegger', 'VEG', 'Blå'],
  ['Tepper', 'TEP', 'Grønn'],
  ['Møbler', 'MØB', 'Gul'],
  ['Grafikk', 'GRA', 'Fiolett'],
  ['Elektro', 'ELE', 'Oransje'],
  ['Rigg', 'RIG', 'Rød'],
  ['Snekker', 'SNE', 'Turkis'],
  ['Lager', 'LAG', 'Grå'],
]

export const DEMO_COMPETENCES = DEMO_COMPETENCE_STYLES.map(([name]) => name)

export const DEMO_PRODUCT_TYPES: DemoProductType[] = [
  { name: 'Systemvegger', competence: 'Vegger', units: [{ unit: 'lm', assembly: 7, dismantle: 11.5 }], articles: [['1001', 'Systemvegg hvit 1 lm'], ['1002', 'Systemvegg grå 1 lm']], quantity: [6, 18] },
  // Two units with rates and none in use: the planner picks one.
  { name: 'Dragere', competence: 'Vegger', units: [{ unit: 'lm', assembly: 9, dismantle: 14 }, { unit: 'stk', assembly: 4, dismantle: 6 }], articles: [['1010', 'Drager 1 m']], quantity: [2, 8] },
  { name: 'Teppefliser', competence: 'Tepper', units: [{ unit: 'm2', assembly: 20, dismantle: 35 }], articles: [['2001', 'Teppeflis grå'], ['2002', 'Teppeflis blå']], quantity: [9, 48] },
  { name: 'Engangstepper', competence: 'Tepper', units: [{ unit: 'm2', assembly: 30, dismantle: 0 }], articles: [['2010', 'Engangsteppe antrasitt']], quantity: [9, 36] },
  { name: 'Møbler', competence: 'Møbler', units: [{ unit: 'stk', assembly: 12, dismantle: 18 }], articles: [['3001', 'Barkrakk'], ['3002', 'Ståbord'], ['3003', 'Disk med lås']], quantity: [1, 6] },
  { name: 'Banner', competence: 'Grafikk', units: [{ unit: 'stk', assembly: 3, dismantle: 8 }], articles: [['4001', 'Banner 1x3 m']], quantity: [1, 3] },
  // Counted per order: a stand with a print is one, whatever the quantity.
  { name: 'Print', competence: 'Grafikk', units: [{ unit: 'ordre', assembly: 1.5, dismantle: 4, inUse: true }, { unit: 'm2', assembly: 6, dismantle: 15 }], articles: [['4010', 'Folieprint vegg']], quantity: [2, 12] },
  { name: 'Lys', competence: 'Elektro', units: [{ unit: 'stk', assembly: 6, dismantle: 10 }], articles: [['5001', 'Spotlys LED']], quantity: [2, 8] },
  { name: 'Strøm', competence: 'Elektro', units: [{ unit: 'stk', assembly: 2, dismantle: 4 }], articles: [['5010', 'Strømuttak 230V']], quantity: [1, 2] },
  { name: 'Truss', competence: 'Rigg', units: [{ unit: 'lm', assembly: 4, dismantle: 8 }], articles: [['7001', 'Truss 2 m'], ['7002', 'Truss hjørne']], quantity: [2, 12] },
  { name: 'Spesialbygg', competence: 'Snekker', units: [{ unit: 'stands', assembly: 0.08, dismantle: 0.25 }], articles: [['8001', 'Spesialbygg etter tegning']], quantity: [1, 1] },
  { name: 'Lagerplass', competence: 'Lager', units: [{ unit: 'stk', assembly: 3, dismantle: 3 }], articles: [['8010', 'Pall lagret']], quantity: [1, 4] },
]

/** How often a stand orders each product type; the rest are ordered by about half the stands. */
const DEMAND_SHARE: Record<string, number> = { Systemvegger: 0.9, Teppefliser: 0.8, Spesialbygg: 0.12, Truss: 0.2, Lagerplass: 0.25, Dragere: 0.3 }

/** A product type that is ordered but not in the KPI table, so that the app shows it to be set up. */
const NEW_TYPE = { name: 'Gulvplater', articles: [['6001', 'Gulvplate 1x2 m']] as [string, string][], quantity: [4, 20] as [number, number] }

/** The two departments that order, as Visma's «Avdeling» codes. */
const DEPARTMENTS = ['10', '20']

/** The projects with Visma lines; the last events have no orders yet, so they show without demand. */
const ORDERED = DEMO_EVENTS.filter((event) => event.stands > 0)

/** A small fixed sequence, so the file is the same each time it is made. */
const sequence = (seed: number) => {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
}

const vismaRows = (): CellValue[][] => {
  const next = sequence(26)
  const pick = <T,>(list: T[]): T => list[Math.floor(next() * list.length)]
  const between = ([low, high]: [number, number]) => low + Math.round(next() * (high - low))
  const rows: CellValue[][] = []
  const line = (event: DemoEvent, stand: string, transInfo: string, articleNo: string, text: string, quantity: number, productType: string, index: number) =>
    rows.push([event.projectNo, event.name, stand, transInfo, pick(DEPARTMENTS), articleNo, text, quantity, productType ? 'Messebygg' : 'Diverse', productType ? `${index} [${productType}]` : '0'])
  for (const event of ORDERED) {
    for (let s = 0; s < event.stands; s++) {
      // A stand number begins with the letter of its hall: «C04-12» is in hall C.
      const hall = pick(event.halls)
      const stand = hall.startsWith('STUDIO') ? `S${String(1 + s).padStart(2, '0')}` : `${hall[0]}${String(1 + s).padStart(2, '0')}-${10 + Math.floor(next() * 80)}`
      const types = DEMO_PRODUCT_TYPES.filter((type) => next() < (DEMAND_SHARE[type.name] ?? 0.5))
      for (const type of types.length ? types : [DEMO_PRODUCT_TYPES[0]]) {
        const [articleNo, text] = pick(type.articles)
        line(event, stand, '', articleNo, text, between(type.quantity), type.name, DEMO_PRODUCT_TYPES.indexOf(type) + 1)
      }
      if (next() < 0.25) line(event, stand, '', NEW_TYPE.articles[0][0], NEW_TYPE.articles[0][1], between(NEW_TYPE.quantity), NEW_TYPE.name, 20)
    }
    // Lines without a stand have their place as free text: one hall named in words, and one that names none.
    line(event, '', `Kafé ved hall ${event.halls[0]}`, '3002', 'Ståbord', 4, 'Møbler', 5)
    line(event, '', 'Inngangsparti', '4001', 'Banner 1x3 m', 2, 'Banner', 6)
    // Lines without a product type, for the planner to give one by their article text.
    line(event, `${event.halls[0][0]}01-90`, '', '9001', 'Montering etter avtale', 8, '', 0)
    line(event, `${event.halls[0][0]}01-90`, '', '9002', 'Frakt', 1, '', 0)
  }
  return rows
}

const vismaFile = () =>
  writeXlsx([
    {
      name: 'Ordrelinjer',
      // No «Navn» and no «Ordrenr»: the app needs neither the customer nor the order number.
      head: ['Prosjekt', 'Navn2', 'Stand', 'Trans.opplysn. 1', 'Avdeling', 'Art.nr', 'Beskrivelse', 'Totalt antall', 'Varegr', 'Produkttype 2'],
      rows: vismaRows(),
    },
  ])

/** The KPI table as the app exports it: a row per product type and unit, «Ja» on the unit in use where there are several. */
const kpiFile = () =>
  writeXlsx([
    {
      name: 'KPI',
      head: ['Produkttype', 'Enhet', 'I bruk', 'Kompetanse', 'Montering', 'Demontering'],
      rows: DEMO_PRODUCT_TYPES.flatMap((type) =>
        type.units.map((unit): CellValue[] => [type.name, unit.unit, unit.inUse ? 'Ja' : '', type.competence, unit.assembly, unit.dismantle || null]),
      ),
    },
    // The freight is no work for the crew.
    { name: 'Utelatte artikler', head: ['Art.nr', 'Merknad'], rows: [['9002', 'Frakt']] },
  ])

const FIRST_NAMES = ['Anders', 'Kari', 'Ola', 'Ingrid', 'Per', 'Siri', 'Jonas', 'Marte', 'Erik', 'Hanne', 'Lars', 'Nina', 'Tor', 'Eva', 'Knut', 'Mia', 'Henrik', 'Sofie', 'Magnus', 'Ida', 'Even', 'Thea', 'Sindre', 'Live', 'Øystein', 'Frida', 'Petter', 'Maja', 'Rune', 'Emma', 'Geir', 'Nora', 'Vegard', 'Tuva', 'Stian', 'Julie', 'Arne', 'Linn', 'Bjørnar', 'Selma']
const FAMILY_NAMES = ['Berg', 'Nordli', 'Strand', 'Haug', 'Lunde', 'Moen', 'Bakke', 'Lie', 'Dahl', 'Vik', 'Holm', 'Aas', 'Sand', 'Fjeld', 'Brekke', 'Solberg', 'Myhre', 'Eide', 'Rønning', 'Tangen']

/**
 * Made-up permanent staff: a common first name and a common family name put together, 40 in all. Most have one or two
 * competences, some three, and the walls, carpets and furniture have the most people, as the demand is largest there.
 */
export const DEMO_PEOPLE: [string, string[]][] = (() => {
  const next = sequence(7)
  const weights: [string, number][] = [['Vegger', 5], ['Tepper', 4], ['Møbler', 4], ['Grafikk', 2], ['Elektro', 2], ['Rigg', 2], ['Snekker', 2], ['Lager', 1]]
  const total = weights.reduce((sum, [, w]) => sum + w, 0)
  const pick = () => {
    let at = next() * total
    for (const [name, w] of weights) if ((at -= w) < 0) return name
    return weights[0][0]
  }
  return FIRST_NAMES.map((first, i): [string, string[]] => {
    const count = next() < 0.45 ? 1 : next() < 0.8 ? 2 : 3
    const has = new Set<string>()
    while (has.size < count) has.add(pick())
    return [`${first} ${FAMILY_NAMES[(i * 7) % FAMILY_NAMES.length]}`, DEMO_COMPETENCES.filter((c) => has.has(c))]
  })
})()

const marks = (has: string[]) => DEMO_COMPETENCES.map((competence) => (has.includes(competence) ? 'x' : ''))

const personellFile = () => writeXlsx([{ name: 'Personell', head: ['Navn', 'Notat', ...DEMO_COMPETENCES], rows: DEMO_PEOPLE.map(([name, has]) => [name, '', ...marks(has)]) }])

/** Made-up suppliers, with no contact person. Most offer one or two competences: few can be ordered for all of them. */
export const DEMO_SUPPLIERS: { name: string; rate: number; shifts: string[]; competences: string[] }[] = [
  { name: 'Messehjelp AS', rate: 520, shifts: ['Dag', 'Kveld'], competences: ['Vegger', 'Møbler'] },
  { name: 'Riggteamet', rate: 560, shifts: ['Dag', 'Kveld', 'Natt'], competences: ['Vegger', 'Elektro', 'Rigg'] },
  { name: 'Gulv og Tepper Service', rate: 495, shifts: ['Dag'], competences: ['Tepper'] },
  { name: 'Bemanningsbyrået Nord', rate: 480, shifts: ['Dag', 'Kveld'], competences: ['Møbler', 'Lager'] },
  { name: 'Snekkerverkstedet', rate: 610, shifts: ['Dag'], competences: ['Snekker', 'Vegger'] },
  { name: 'Lys og Lyd Utleie', rate: 590, shifts: ['Dag', 'Kveld', 'Natt'], competences: ['Elektro', 'Rigg'] },
  { name: 'Ekstrahender', rate: 450, shifts: ['Dag', 'Kveld'], competences: ['Møbler', 'Lager'] },
  { name: 'Folie og Skilt', rate: 575, shifts: ['Dag'], competences: ['Grafikk'] },
  { name: 'Kveldsteppe', rate: 530, shifts: ['Kveld', 'Natt'], competences: ['Tepper'] },
  { name: 'Trussmontasje', rate: 640, shifts: ['Dag', 'Natt'], competences: ['Rigg'] },
]

const leverandorerFile = () =>
  writeXlsx([
    {
      name: 'Leverandører',
      head: ['Navn', 'Kontakt', 'Kr per time', 'Notat', 'Dag', 'Kveld', 'Natt', ...DEMO_COMPETENCES],
      rows: DEMO_SUPPLIERS.map((s) => [s.name, '', s.rate, '', ...['Dag', 'Kveld', 'Natt'].map((shift) => (s.shifts.includes(shift) ? 'x' : '')), ...marks(s.competences)]),
    },
  ])

/** Budgets for most of the ordered projects, some without, and one for a project with no demand yet. */
const budsjettFile = () =>
  writeXlsx([
    {
      name: 'Budsjett',
      head: ['Prosjektnr.', 'Prosjekt', 'Budsjett arbeidstimer totalt'],
      rows: [...ORDERED.filter((_, index) => index % 6 !== 5), DEMO_EVENTS.find((event) => !event.stands)!].map((event): CellValue[] => [event.projectNo, event.name, Math.round(event.stands * event.halls.length * 9 + event.assembly * 20)]),
    },
  ])

/** The competences as Kompetanser exports them, in the planner's order, with a short name and a colour. */
const kompetanserFile = () => writeXlsx([{ name: 'Kompetanser', head: ['Kompetanse', 'Kort', 'Farge'], rows: DEMO_COMPETENCE_STYLES }])

const WRITERS: Record<DemoFile, () => Uint8Array> = {
  venyou: venyouFile,
  visma: vismaFile,
  kpi: kpiFile,
  kompetanser: kompetanserFile,
  personell: personellFile,
  leverandorer: leverandorerFile,
  budsjett: budsjettFile,
}

/** The invented files, by kind, with the bytes of each. */
export const demoFiles = (): { kind: DemoFile; name: string; bytes: Uint8Array }[] => (Object.keys(WRITERS) as DemoFile[]).map((kind) => ({ kind, name: DEMO_FILES[kind], bytes: WRITERS[kind]() }))

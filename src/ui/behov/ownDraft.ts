/** The state of the form of Egen registrering (`OwnLineForm.tsx`). */

/** The hall of the context that shares the hours evenly over every hall the project has booked, a line each. */
export const SPLIT_HALLS = '*fordel'
/** The value of «Uten hall» in the list of the context: a line without a hall. */
export const NO_HALL = '*uten'

/** Where new lines go: project › hall › avd. It stays set from one line to the next. `hall` is '' for a line without a hall. */
export interface OwnContext {
  projectNo: string
  hall: string
  avdeling: string
}

/** The line being typed in. Hours are text, read by `parseHours`; where they are empty, the KPI rate gives them. */
export interface OwnDraft {
  work: string
  quantity: string
  unit: string
  assembly: string
  dismantle: string
  competence: string
  comment: string
  planned: boolean
  /** The Visma line it is made in place of. */
  replaces?: string
  /** Where the draft came from, as a line above the preview. */
  from?: string
}

export const EMPTY_DRAFT: OwnDraft = { work: '', quantity: '', unit: '', assembly: '', dismantle: '', competence: '', comment: '', planned: true }


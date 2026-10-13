import { hoursShort } from '../bemanning/week'
import { signed } from '../kalender/heat'

/** Hours with their sign, as Innleid writes them: «−» for what is missing, «+» for what is over, and nothing for none. */
export const signedHours = (hours: number): string => signed(hoursShort(hours))

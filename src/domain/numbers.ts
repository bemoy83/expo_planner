/**
 * A number as a planner types it, with a decimal comma or a point: «1,5», «1.5».
 * `null` is an empty field and `undefined` is text that is no number; what an empty field means is up to the caller.
 */
export const parseDecimal = (input: string): number | null | undefined => {
  const trimmed = input.trim().replace(',', '.')
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : undefined
}

/** A number as it is put in a field for editing: every decimal it has, with a decimal comma. */
export const decimalText = (value: number): string => String(value).replace('.', ',')

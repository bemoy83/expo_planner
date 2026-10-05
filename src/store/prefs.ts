import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

/** View preferences (filters, zoom, folded levels) are kept per browser in localStorage, outside the workspace. */
const PREFIX = 'expo-planner:'

export const loadPref = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export const savePref = (key: string, value: unknown) => {
  try {
    localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value))
  } catch {
    // preferences are a convenience only
  }
}

/** Forgets every preference; they belong to the data that is deleted with them. */
export const clearPrefs = () => {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key)
  } catch {
    // preferences are a convenience only
  }
}

/** State that is remembered in this browser. `clean` keeps what is valid of a stored value. */
export const usePref = <T,>(key: string, fallback: T, clean?: (stored: unknown) => T): [T, Dispatch<SetStateAction<T>>] => {
  const [value, setValue] = useState<T>(() => (clean ? clean(loadPref<unknown>(key, fallback)) : loadPref(key, fallback)))
  useEffect(() => savePref(key, value), [key, value])
  return [value, setValue]
}

/** A set of keys that is remembered in this browser, stored as a list. */
export const usePrefSet = (key: string): [Set<string>, Dispatch<SetStateAction<Set<string>>>] => {
  const [value, setValue] = useState<Set<string>>(() => new Set(loadPref<string[]>(key, [])))
  useEffect(() => savePref(key, [...value]), [key, value])
  return [value, setValue]
}

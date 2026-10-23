/** Adds the value to the list under the key, starting the list where there is none. Lists made this way are the map's own. */
export const pushTo = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

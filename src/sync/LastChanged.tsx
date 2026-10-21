import { useEffect, useState } from 'react'
import { lastChanged, plannerNames } from '../store/db'
import type { Kind } from '../store/records'
import { useCloud } from './CloudProvider'

/** «Sist endret av kari@… 21. okt. kl. 14:02», of the records given, in a shared workspace; nothing in this browser's own. */
export function LastChanged({ records }: { records: [Kind, string][] }) {
  const { shared } = useCloud()
  const [text, setText] = useState<string | null>(null)
  const key = records.map(([kind, id]) => `${kind}|${id}`).join(',')
  useEffect(() => {
    if (!shared) return
    let live = true
    Promise.all([lastChanged(records), plannerNames()]).then(([last, names]) => {
      if (!live) return
      if (!last) return setText(null)
      const when = new Date(last.at)
      setText(`Sist endret av ${names.get(last.by) ?? 'en annen'} ${when.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} kl. ${when.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`)
    })
    return () => {
      live = false
    }
    // The records are named by `key`; a new array with the same records asks again for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, key])
  return shared && text ? <div className="insp-changed">{text}</div> : null
}

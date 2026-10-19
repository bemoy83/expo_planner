import type { SyncState } from './engine'

/** What the page header says of the shared copy. */
export const syncText = (state: SyncState): string =>
  ({ synced: 'Synkronisert', syncing: 'Synkroniserer …', offline: 'Frakoblet', paused: 'Skyen er satt på pause', error: 'Synkronisering feilet' })[state]

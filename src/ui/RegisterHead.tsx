import type { ReactNode } from 'react'
import { AlertCount, Segmented, UndoRedoButtons } from './common'
import type { Notify } from './Toasts'

export interface RegisterPage<P extends string> {
  view: P
  label: string
  title?: string
}

/** What a page of a tab of tables is handed: its page header, with what the page does with files in it, and the toasts. */
export interface TablePage {
  head: (actions: ReactNode) => ReactNode
  notify: Notify
  /** A toast without «Angre», for what did not change anything. */
  show: (text: string) => void
}

/** What a page's button counts: its rows, or, where some of them need the planner, how many do. */
export interface PageCount {
  rows: number
  /** Rows that need the planner, shown in place of the count. */
  issues?: number
  /** What the issues are, for the tooltip of the chip. */
  issueText?: (n: number) => string
}

/**
 * The page header of a tab of the planner's tables, a band of sand: the tab's name, its pages with their counts,
 * undo, and on the right what the page that is open does with files.
 */
export function RegisterHead<P extends string>({ title, pages, page, counts, onPage, children }: { title: string; pages: RegisterPage<P>[]; page: P; counts: Record<P, PageCount>; onPage: (page: P) => void; children?: ReactNode }) {
  return (
    <div className="page-head mode-band">
      <h2>{title}</h2>
      <Segmented
        label={`Del av ${title}`}
        value={page}
        onChange={onPage}
        options={pages.map(({ view, label, title }) => {
          const { rows, issues, issueText } = counts[view]
          return {
            value: view,
            title,
            label: (
              <>
                {label}{' '}
                {issues ? (
                  <AlertCount n={issues} title={issueText?.(issues)} />
                ) : (
                  <span className="count">{rows}</span>
                )}
              </>
            ),
          }
        })}
      />
      <span className="toolbar-gap" />
      <UndoRedoButtons />
      {children}
    </div>
  )
}

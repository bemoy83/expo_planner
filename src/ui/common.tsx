import { useWorkspace } from '../store/workspaceStore'

/** Undo and redo, as they sit in every tab's toolbar. */
export function UndoRedoButtons() {
  const { undo, redo, canUndo, canRedo } = useWorkspace()
  return (
    <>
      <button onClick={undo} disabled={!canUndo} title="Angre (Ctrl/Cmd+Z)">
        ↶ Angre
      </button>
      <button onClick={redo} disabled={!canRedo} title="Gjør om (Ctrl/Cmd+Shift+Z)">
        ↷ Gjør om
      </button>
    </>
  )
}

/** What a tab tells the planner after an import or another action. */
export interface Message {
  kind: 'ok' | 'error'
  text: string
}

export function MessageBanner({ message, onClose }: { message: Message | null; onClose: () => void }) {
  if (!message) return null
  return (
    <div className={message.kind === 'ok' ? 'info-banner' : 'error-banner'} role="status">
      {message.text}{' '}
      <button className="link" onClick={onClose}>
        Lukk
      </button>
    </div>
  )
}

interface MergeReplaceProps {
  title: string
  /** The file or files being read. */
  source: string
  /** What the import would change, one line per table. */
  results: string[]
  /** What «Erstatt alt» does, after the words «Erstatt alt:». */
  replaceText: string
  onCancel: () => void
  onApply: (mode: 'merge' | 'replace') => void
}

/** Asks whether a file should be merged into a table that already has content, or replace it. */
export function MergeReplaceDialog({ title, source, results, replaceText, onCancel, onApply }: MergeReplaceProps) {
  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h2>{title}</h2>
        <p className="hint">{source}</p>
        {results.map((result) => (
          <p key={result} className="dialog-result">
            {result}
          </p>
        ))}
        <p className="hint">
          <strong>Slå sammen:</strong> filen vinner der den har en rad, det som bare finnes i appen beholdes.
          <br />
          <strong>Erstatt alt:</strong> {replaceText}.
        </p>
        <div className="dialog-actions">
          <button onClick={onCancel}>Avbryt</button>
          <button onClick={() => onApply('replace')}>Erstatt alt</button>
          <button className="primary" onClick={() => onApply('merge')}>
            Slå sammen
          </button>
        </div>
      </div>
    </div>
  )
}

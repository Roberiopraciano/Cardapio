import { useState } from 'react'
import type { Product } from '../../types'
import type { VoiceReview } from '../../services/voiceOrderApi'
import { itemCountLabel, summaryLines, summaryTotal, type SummaryLine } from '../../lib/voiceConversation'
import { hasNoteTag, noteTagsOf, toggleNoteTag } from '../../lib/noteTags'
import Icon from '../Icon'

interface Props {
  review: VoiceReview | null
  /** Cardápio local, para os atalhos de observação de cada produto (`customSuggestions`). */
  products?: Product[]
  busy?: boolean
  /** Salva a observação do item; sem isto o resumo só mostra (não edita). */
  onNote?: (itemRef: string, note: string) => void
}

/** Campo de observação de um item, com os atalhos cadastrados no produto ("Sem cebola", "Natural"). */
function NoteEditor({ line, tags, busy, onSave, onCancel }: {
  line: SummaryLine
  tags: string[]
  busy: boolean
  onSave: (note: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(line.note)
  const changed = draft.trim() !== line.note.trim()
  return (
    <form className="mt-2 space-y-2" onSubmit={event => { event.preventDefault(); if (changed) onSave(draft.trim()) }}>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Observações rápidas">
          {tags.map(tag => {
            const on = hasNoteTag(draft, tag)
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => setDraft(old => toggleNoteTag(old, tag))}
                className={`voice-focus min-h-8 rounded-full px-3 py-1 text-xs font-medium ${on ? 'text-white' : ''}`}
                style={on
                  ? { background: 'var(--color-brand)', border: '1px solid var(--color-brand)' }
                  : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-hi)' }}
              >
                {tag}
              </button>
            )
          })}
        </div>
      )}
      <input
        autoFocus
        value={draft}
        maxLength={200}
        onChange={event => setDraft(event.target.value)}
        placeholder="Ex.: sem cebola, ponto da carne…"
        aria-label={`Observação para ${line.title}`}
        enterKeyHint="done"
        className="voice-focus block w-full min-h-10 rounded-xl px-3 text-sm outline-none"
        style={{ background: 'var(--bg-card)', color: 'var(--text-hi)', border: '1px solid var(--border)' }}
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="voice-focus min-h-9 px-3 text-xs font-semibold" style={{ color: 'var(--text-lo)' }}>
          Cancelar
        </button>
        <button type="submit" disabled={busy || !changed} className="voice-focus min-h-9 rounded-lg px-4 text-xs font-bold text-white disabled:opacity-50" style={{ background: 'var(--color-brand)' }}>
          {draft.trim() === '' && line.note ? 'Remover' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}

/**
 * Resumo do pedido que o assistente montou, sempre visível e atualizado a cada rodada.
 * Os preços são os que o servidor calculou; aqui nada é recalculado.
 * Cada item aceita observação de preparo, que o servidor aplica sem chamar a IA.
 */
export default function OrderSummary({ review, products = [], busy = false, onNote }: Props) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const lines = summaryLines(review)
  if (lines.length === 0) return null
  const incomplete = lines.some(line => line.incomplete)

  return (
    <section aria-label="Resumo do pedido" className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className="voice-focus w-full min-h-11 flex items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
          Seu pedido · {itemCountLabel(review)}
          {incomplete && <span className="ml-2 text-xs font-medium" style={{ color: 'var(--text-lo)' }}>(faltam escolhas)</span>}
          {!open && onNote && <span className="block text-[11px] font-normal" style={{ color: 'var(--text-lo)' }}>Toque para ver ou pôr observação</span>}
        </span>
        <span className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-hi)' }}>
          {summaryTotal(review)}
          <Icon name="chevron" size={12} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
        </span>
      </button>
      {open && (
        <ul className="px-3 pb-3 space-y-2 border-t max-h-[40dvh] overflow-y-auto overscroll-contain" style={{ borderColor: 'var(--border)' }}>
          {lines.map(line => {
            const tags = noteTagsOf(products.find(product => product._id === line.productId)?.customSuggestions)
            return (
              <li key={line.key} className="pt-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium" style={{ color: 'var(--text-hi)' }}>{line.title}</span>
                  <span className="shrink-0" style={{ color: 'var(--text-hi)' }}>{line.price}</span>
                </div>
                {line.extras.map(extra => (
                  <div key={extra} className="text-xs pl-3" style={{ color: 'var(--text-lo)' }}>+ {extra}</div>
                ))}
                {line.incomplete && <div className="text-xs pl-3 font-medium" style={{ color: 'var(--text-lo)' }}>Falta escolher uma opção obrigatória</div>}
                {editing === line.key && onNote ? (
                  <NoteEditor
                    line={line}
                    tags={tags}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSave={note => { onNote(line.key, note); setEditing(null) }}
                  />
                ) : line.note ? (
                  <div className="pl-3 flex items-center gap-2 text-xs" style={{ color: 'var(--text-lo)' }}>
                    <span className="italic">“{line.note}”</span>
                    {onNote && (
                      <button type="button" disabled={busy} onClick={() => setEditing(line.key)} className="voice-focus min-h-8 font-semibold underline disabled:opacity-50">
                        Editar
                      </button>
                    )}
                  </div>
                ) : onNote && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setEditing(line.key)}
                    className="voice-focus mt-1 ml-3 min-h-8 flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"
                    style={{ color: 'var(--color-brand)' }}
                  >
                    <Icon name="edit" size={11} /> Observação
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

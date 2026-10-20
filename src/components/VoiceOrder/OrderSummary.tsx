import { useState } from 'react'
import type { VoiceReview } from '../../services/voiceOrderApi'
import { itemCountLabel, summaryLines, summaryTotal } from '../../lib/voiceConversation'
import Icon from '../Icon'

interface Props {
  review: VoiceReview | null
}

/**
 * Resumo do pedido que o assistente montou, sempre visível e atualizado a cada rodada.
 * Os preços são os que o servidor calculou; aqui nada é recalculado.
 */
export default function OrderSummary({ review }: Props) {
  const [open, setOpen] = useState(false)
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
        </span>
        <span className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-hi)' }}>
          {summaryTotal(review)}
          <Icon name="chevron" size={12} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
        </span>
      </button>
      {open && (
        <ul className="px-3 pb-3 space-y-2 border-t" style={{ borderColor: 'var(--border)' }}>
          {lines.map(line => (
            <li key={line.key} className="pt-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="font-medium" style={{ color: 'var(--text-hi)' }}>{line.title}</span>
                <span className="shrink-0" style={{ color: 'var(--text-hi)' }}>{line.price}</span>
              </div>
              {line.extras.map(extra => (
                <div key={extra} className="text-xs pl-3" style={{ color: 'var(--text-lo)' }}>+ {extra}</div>
              ))}
              {line.note && <div className="text-xs pl-3 italic" style={{ color: 'var(--text-lo)' }}>“{line.note}”</div>}
              {line.incomplete && <div className="text-xs pl-3 font-medium" style={{ color: 'var(--text-lo)' }}>Falta escolher uma opção obrigatória</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

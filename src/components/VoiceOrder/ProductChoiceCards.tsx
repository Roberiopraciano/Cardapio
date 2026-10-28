import type { VoiceQuestion } from '../../services/voiceOrderApi'
import { splitOptionPrice, type ChoiceVisual } from '../../lib/voiceConversation'
import ImageWithFallback from '../ImageWithFallback'

interface Props {
  question: VoiceQuestion
  /** foto e descrição de cada opção, na ordem de question.options */
  visuals: ChoiceVisual[]
  /** índice da opção tocada, 'skip' ("Não, obrigado") ou nada ainda */
  selected: number | 'skip' | undefined
  disabled: boolean
  onPick: (index: number) => void
  onSkip: () => void
}

/**
 * Modo cards do assistente: a mesma pergunta do QuestionCard, mas cada opção é um card de produto
 * (foto, nome, descrição, preço) numa faixa com rolagem lateral. Tocar no card escolhe a opção.
 */
export default function ProductChoiceCards({ question, visuals, selected, disabled, onPick, onSkip }: Props) {
  const suggestion = question.kind === 'suggestion'
  // Até 3 cabem lado a lado. Mais que isso vira grade com rolagem vertical: no desktop a roda do mouse não rola para o lado.
  const grid = question.options.length > 3
  return (
    <section className="space-y-2 voice-rise">
      {suggestion && (
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-brand)' }}>Sugestão</span>
      )}
      <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>{question.question}</p>
      <div
        role="radiogroup"
        aria-label={question.question}
        className={grid
          ? 'grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[26rem] overflow-y-auto overscroll-contain pr-1'
          : '-mx-4 px-4 flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1'}
        style={grid ? undefined : { scrollbarWidth: 'none' }}
      >
        {question.options.map((label, index) => {
          const split = splitOptionPrice(label)
          const extra = split.extra ?? (question.prices?.[index] || null)
          const original = question.original_prices?.[index] || null
          const tags = question.details?.[index] ?? []
          const visual = visuals[index]
          const active = selected === index
          return (
            <button
              key={`${index}-${label}`}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onPick(index)}
              className={`voice-focus ${grid ? 'w-full' : 'snap-start shrink-0 w-36'} flex flex-col rounded-2xl overflow-hidden text-left transition-transform active:scale-[0.97] disabled:opacity-60`}
              style={{
                background: 'var(--bg-card)',
                border: active ? '2px solid var(--color-brand)' : '1px solid var(--border)',
              }}
            >
              <div className="relative aspect-square w-full overflow-hidden">
                <ImageWithFallback src={visual.image} alt={split.name} className="w-full h-full object-cover" skeletonClassName="w-full h-full" />
                {active && (
                  <span aria-hidden="true" className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--color-brand)' }}>
                    ✓
                  </span>
                )}
              </div>
              <div className="flex-1 flex flex-col p-2.5">
                <span className="text-sm font-semibold leading-tight line-clamp-2" style={{ color: 'var(--text-hi)' }}>{split.name}</span>
                {visual.description ? (
                  <span className="mt-0.5 text-xs leading-tight line-clamp-2" style={{ color: 'var(--text-lo)' }}>{visual.description}</span>
                ) : tags.length > 0 && (
                  <span className="mt-0.5 text-xs leading-tight line-clamp-2" style={{ color: 'var(--text-lo)' }}>{tags.join(', ')}</span>
                )}
                {extra && (
                  <span className="mt-auto pt-1.5 flex flex-col text-sm font-bold" style={{ color: 'var(--color-brand)' }}>
                    {original && <s className="text-xs font-normal" style={{ color: 'var(--text-lo)' }} aria-label={`de ${original}`}>{original}</s>}
                    <span aria-label={original ? `por ${extra}` : undefined}>{extra}</span>
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
      {suggestion && (
        <button
          type="button"
          aria-pressed={selected === 'skip'}
          disabled={disabled}
          onClick={onSkip}
          className={`voice-focus min-h-11 w-full rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-60 ${selected === 'skip' ? 'text-white' : ''}`}
          style={selected === 'skip'
            ? { background: 'var(--text-lo)' }
            : { background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text-lo)' }}
        >
          Não, obrigado
        </button>
      )}
    </section>
  )
}

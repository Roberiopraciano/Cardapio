import type { VoiceQuestion } from '../../services/voiceOrderApi'
import { splitOptionPrice } from '../../lib/voiceConversation'

interface Props {
  question: VoiceQuestion
  /** índice da opção tocada, 'skip' ("Não, obrigado") ou nada ainda */
  selected: number | 'skip' | undefined
  disabled: boolean
  onPick: (index: number) => void
  onSkip: () => void
}

/**
 * Uma pergunta do assistente com as respostas como botões grandes (toque, sem digitar).
 * Sugestão de opcional ganha o selo "Sugestão" e o botão "Não, obrigado".
 */
export default function QuestionCard({ question, selected, disabled, onPick, onSkip }: Props) {
  const suggestion = question.kind === 'suggestion'
  const scrolls = question.options.length > 8
  return (
    <section className="rounded-2xl p-3 space-y-2 voice-rise" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
      {suggestion && (
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-brand)' }}>Sugestão</span>
      )}
      <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>{question.question}</p>
      <div role="radiogroup" aria-label={question.question} className={`grid gap-2 ${scrolls ? 'max-h-60 overflow-y-auto pr-1' : ''}`}>
        {question.options.map((label, index) => {
          const { name, extra } = splitOptionPrice(label)
          const active = selected === index
          return (
            <button
              key={`${index}-${label}`}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onPick(index)}
              className={`voice-focus min-h-11 w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium disabled:opacity-60 ${active ? 'text-white' : ''}`}
              style={active
                ? { background: 'var(--color-brand)' }
                : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-hi)' }}
            >
              <span>{name}</span>
              {extra && <span className="shrink-0 text-xs font-semibold" style={active ? undefined : { color: 'var(--text-lo)' }}>{extra}</span>}
            </button>
          )
        })}
        {suggestion && (
          <button
            type="button"
            role="radio"
            aria-checked={selected === 'skip'}
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
      </div>
    </section>
  )
}

import { Fragment } from 'react'
import Icon from './Icon'

export type Step = 'entrega' | 'pagamento' | 'confirmacao'

const LABEL: Record<Step, string> = {
  entrega: 'Entrega',
  pagamento: 'Pagamento',
  confirmacao: 'Confirmação',
}

interface Props {
  steps: Step[]
  current: number
  /** Só etapas já feitas são clicáveis — pular adiante deixaria a validação para trás. */
  onSelect: (idx: number) => void
}

export default function CheckoutStepper({ steps, current, onSelect }: Props) {
  return (
    <ol className="flex items-start px-2" aria-label="Etapas do pedido">
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <Fragment key={s}>
            {i > 0 && (
              <li aria-hidden className="flex-1 h-[3px] mt-[10px] rounded-full"
                style={{ background: i <= current ? 'var(--color-brand)' : 'var(--border)' }} />
            )}
            <li className="flex flex-col items-center w-20 flex-shrink-0">
              <button type="button" disabled={!done} onClick={() => onSelect(i)}
                aria-current={active ? 'step' : undefined}
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: done || active ? 'var(--color-brand)' : 'var(--bg-input)',
                  color: done || active ? '#fff' : 'var(--text-lo)',
                }}>
                {done ? <Icon name="check" size={10} /> : i + 1}
              </button>
              <span className="text-[11px] mt-1"
                style={{ color: active ? 'var(--color-brand)' : 'var(--text-lo)', fontWeight: active ? 600 : 400 }}>
                {LABEL[s]}
              </span>
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}

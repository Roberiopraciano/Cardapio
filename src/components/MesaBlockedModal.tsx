import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type Phase = 'idle' | 'sending' | 'sent' | 'error'

/**
 * Mesa que o cardápio não pode abrir sozinho. Em vez de lançar às cegas numa
 * comanda que não é deste aparelho, pede para chamar o garçom.
 *
 * - `ocupada`: a mesa já foi aberta por outro canal (garçom, PDV, outro aparelho).
 * - `bloqueada`: a comanda é deste aparelho, mas está em pagamento/conferência.
 *
 * Portal para o `body` pelo mesmo motivo do `PinModal`/`ConfirmModal`.
 */
export default function MesaBlockedModal({
  open, reason, tableLabel, onCallWaiter, onClose,
}: {
  open: boolean
  reason: 'ocupada' | 'bloqueada'
  tableLabel: string
  /** Chama o garçom; rejeita se não conseguir. */
  onCallWaiter: () => Promise<void>
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(() => { if (open) setPhase('idle') }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const call = async () => {
    setPhase('sending')
    try { await onCallWaiter(); setPhase('sent') } catch { setPhase('error') }
  }

  const title = reason === 'ocupada' ? 'Esta mesa já está aberta' : 'Conta em fechamento'
  const text = reason === 'ocupada'
    ? `Esta mesa (${tableLabel}) já foi aberta pelo atendimento. Chame o garçom para continuar o seu pedido.`
    : `A conta desta mesa (${tableLabel}) está sendo fechada. Chame o garçom se quiser pedir mais alguma coisa.`

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl px-6 pt-5 pb-7 flex flex-col items-center text-center"
        style={{ background: 'var(--bg-card)', paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full mb-4 sm:hidden" style={{ background: 'var(--border)' }} />
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-hi)' }}>{title}</h2>
        <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--text-lo)' }}>{text}</p>

        {phase === 'sent' && (
          <p role="status" className="text-sm mt-4 font-semibold" style={{ color: '#065f46' }}>
            Garçom chamado! Aguarde na mesa.
          </p>
        )}
        {phase === 'error' && (
          <p role="alert" className="text-sm mt-4" style={{ color: '#dc2626' }}>
            Não foi possível chamar o garçom. Chame pelo salão.
          </p>
        )}

        <div className="w-full flex flex-col gap-2 mt-6">
          {phase !== 'sent' && (
            <button
              onClick={call}
              disabled={phase === 'sending'}
              className="w-full py-3.5 rounded-xl text-white font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              {phase === 'sending' ? 'Chamando…' : phase === 'error' ? 'Tentar chamar de novo' : 'Chamar garçom'}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-xl font-semibold text-sm"
            style={{ background: 'var(--bg-page)', color: 'var(--text-hi)' }}
          >
            {phase === 'sent' ? 'Ok' : 'Voltar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

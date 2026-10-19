import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import PinInput from './PinInput'
import { isPinValid, PIN_LENGTH } from '../lib/pin'

const formatClock = (d: Date) =>
  d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/**
 * PIN de pagamento em modal próprio: abre ao tocar em "Enviar pedido" e só
 * libera o envio com o PIN certo (número da mesa + hora). Ver `lib/pin.ts`.
 *
 * Portal para o `body` pelo mesmo motivo do `ConfirmModal`: cabeçalhos sticky
 * prendem modais no contexto de empilhamento deles.
 */
export default function PinModal({
  open, tableNumber, openedAt, onConfirm, onCancel,
}: {
  open: boolean
  tableNumber: number
  openedAt: Date
  /** PIN correto — quem chamou envia o pedido */
  onConfirm: () => void
  onCancel: () => void
}) {
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(false)

  // Relógio do modal: o garçom confere mesa e horário do pedido
  const [clock, setClock] = useState(() => formatClock(new Date()))
  useEffect(() => {
    if (!open) return
    setClock(formatClock(new Date()))
    const id = setInterval(() => setClock(formatClock(new Date())), 1000)
    return () => clearInterval(id)
  }, [open])

  // Cada abertura começa limpa: PIN digitado antes não pode sobrar
  useEffect(() => {
    if (open) { setPin(''); setWrong(false) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onCancel])

  if (!open) return null

  const submit = () => {
    if (isPinValid(pin, tableNumber, new Date(), openedAt)) {
      onConfirm()
    } else {
      setWrong(true)
      setPin('')
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="PIN de pagamento"
    >
      <div
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl px-6 pt-5 pb-7 flex flex-col items-center text-center"
        style={{
          background: 'var(--bg-card)',
          paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full mb-4 sm:hidden" style={{ background: 'var(--border)' }} />

        <h2 className="text-lg font-bold" style={{ color: 'var(--text-hi)' }}>PIN do pedido</h2>
        <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--text-lo)' }}>
          Digite o Pin.
        </p>

        <div className="mt-4 flex flex-col items-center leading-none">
          <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-lo)' }}>Mesa</span>
          <span className="text-5xl font-bold mt-1" style={{ color: 'var(--text-hi)' }}>{tableNumber}</span>
        </div>

        <div className="mt-5">
          <PinInput value={pin} invalid={wrong}
            onChange={(v) => { setPin(v); setWrong(false) }} />
        </div>

        {wrong && (
          <p className="text-xs mt-3" style={{ color: '#dc2626' }}>
            PIN incorreto
          </p>
        )}

        <div className="w-full flex flex-col gap-2 mt-6">
          <button
            onClick={submit}
            disabled={pin.length !== PIN_LENGTH}
            className="w-full py-3.5 rounded-xl text-white font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            Confirmar e enviar pedido
          </button>
          <button
            onClick={onCancel}
            className="w-full py-3.5 rounded-xl font-semibold text-sm"
            style={{ background: 'var(--bg-page)', color: 'var(--text-hi)' }}
          >
            Cancelar
          </button>
        </div>

        {/* Horário do pedido, pequeno, para o garçom conferir */}
        <p className="mt-4 text-[12px] tabular-nums" style={{ color: 'var(--text-lo)', opacity: 0.7 }}>
          {clock}
        </p>
      </div>
    </div>,
    document.body,
  )
}

import { useEffect, useMemo, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { CLEAR_CART_LOTTIE, tintLottie } from '../lib/lottie/clearCart'
import Icon from './Icon'

/**
 * Lottie sob demanda.
 *
 * `lottie-web` pesa ~100 KB gzip e traz um `eval()` para expressões — mantê-lo
 * no chunk inicial empurrava o bundle além de 500 KB e gerava aviso no build.
 * Como este modal é raro, a animação carrega só quando ele abre; enquanto
 * baixa, aparece um ícone estático no mesmo espaço, sem pulo de layout.
 */
const LottieBox = lazy(() => import('./LottieBox'))

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Ação destrutiva pinta o botão de vermelho */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Modal de confirmação com animação Lottie.
 *
 * Substitui `window.confirm`, que além de feio é **bloqueante** — no iOS ele
 * congela a página inteira e não dá para estilizar nem traduzir. Aqui o texto
 * segue o idioma do app e o visual segue a cor da empresa.
 *
 * Vai por portal para o `body`: os cabeçalhos são `sticky` com z-index, e um
 * modal renderizado dentro deles ficaria preso no contexto de empilhamento
 * do cabeçalho.
 */
export default function ConfirmModal({
  open, title, message, confirmLabel = 'Continuar', cancelLabel = 'Cancelar',
  destructive, onConfirm, onCancel,
}: Props) {
  // Trava o scroll do fundo enquanto o modal está aberto
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Fecha no Esc — teclado físico existe no desktop e em tablet com capa
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  const animation = useMemo(() => {
    const brand = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-brand').trim()
    return destructive || !brand
      ? CLEAR_CART_LOTTIE
      : tintLottie(CLEAR_CART_LOTTIE, brand)
  }, [destructive])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl px-6 pt-5 pb-7 flex flex-col items-center text-center"
        style={{
          background: 'var(--bg-card)',
          paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
          animation: 'confirm-in .25s cubic-bezier(.4,0,.2,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes confirm-in {
            from { transform: translateY(24px); opacity: 0 }
            to   { transform: translateY(0);    opacity: 1 }
          }
        `}</style>

        <div className="w-10 h-1 rounded-full mb-4 sm:hidden"
          style={{ background: 'var(--border)' }} />

        <Suspense
          fallback={
            <div className="flex items-center justify-center" style={{ width: 132, height: 132 }}>
              <Icon
                name={destructive ? 'trash' : 'warning'}
                size={44}
                color={destructive ? '#dc2626' : 'var(--color-brand)'}
              />
            </div>
          }
        >
          <LottieBox data={animation} size={132} />
        </Suspense>

        <h2 className="text-lg font-bold mt-1" style={{ color: 'var(--text-hi)' }}>
          {title}
        </h2>
        <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--text-lo)' }}>
          {message}
        </p>

        <div className="w-full flex flex-col gap-2 mt-6">
          <button
            onClick={onConfirm}
            className="w-full py-3.5 rounded-xl text-white font-semibold text-sm active:scale-[0.98] transition-transform"
            style={{ backgroundColor: destructive ? '#dc2626' : 'var(--color-brand)' }}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-3.5 rounded-xl font-semibold text-sm border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-lo)', background: 'var(--bg-card)' }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

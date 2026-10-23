import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLangStore } from '../store/langStore'

interface Props {
  title: string
  items: string[]
  onClose: () => void
}

/**
 * Painel com as tags de composição do produto (insumos: "Leite", "Pão"…).
 *
 * Vai por portal para o `body`, como o ConfirmModal: os cabeçalhos são `sticky`
 * com z-index e um painel dentro do card ficaria preso no contexto deles.
 * Eventos de portal borbulham pela árvore do React, então o clique aqui
 * para antes de chegar ao <button> do card (senão abriria o produto).
 */
export default function CompositionSheet({ title, items, onClose }: Props) {
  const { t } = useLangStore()

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { e.stopPropagation(); onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={t('product.composition')}
    >
      <div
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl px-6 pt-5"
        style={{
          background: 'var(--bg-card)',
          paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-4 sm:hidden" style={{ background: 'var(--border)' }} />

        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-lo)' }}>
          {t('product.composition')}
        </p>
        <h2 className="text-lg font-bold leading-tight mt-0.5" style={{ color: 'var(--text-hi)' }}>{title}</h2>

        <div className="flex flex-wrap gap-2 mt-4">
          {items.map((item) => (
            <span key={item} className="text-sm font-medium px-3 py-1 rounded-full"
              style={{ background: 'var(--bg-subtle, rgba(0,0,0,.06))', color: 'var(--text-hi)' }}>
              {item}
            </span>
          ))}
        </div>

        <button type="button" onClick={onClose}
          className="w-full mt-6 py-3 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--color-brand)' }}>
          {t('common.close')}
        </button>
      </div>
    </div>,
    document.body,
  )
}

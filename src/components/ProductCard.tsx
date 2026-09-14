import { useNavigate } from 'react-router-dom'
import type { Product } from '../types'
import { getCardPrice, formatCurrency, effectivePrice, hasDiscount } from '../lib/pricing'
import { getProductStatus, getStatusBadge, getPeriodLabel } from '../lib/stock'
import ImageWithFallback from './ImageWithFallback'
import { useAppStore } from '../store/appStore'
import { useContentTranslator } from '../lib/useTranslatedContent'

export default function ProductCard({ product }: { product: Product }) {
  const navigate = useNavigate()
  const { periods } = useAppStore()
  const tr = useContentTranslator()
  const name = tr.name(product)
  const description = tr.description(product)
  const status = getProductStatus(product, periods)
  const badge = getStatusBadge(status)
  const orderable = status === 'available'
  const displayPrice = getCardPrice(product)
  const hasOffer = hasDiscount(product)
  const periodLabel = getPeriodLabel(product, periods)

  return (
    <button
      onClick={() => orderable && navigate(`/produto/${product._id}`)}
      disabled={!orderable}
      className="w-full text-left rounded-2xl overflow-hidden border transition-transform active:scale-[0.97]"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
        opacity: orderable ? 1 : 0.65,
        cursor: orderable ? 'pointer' : 'not-allowed',
      }}
    >
      {/* Imagem */}
      <div className="relative aspect-square w-full overflow-hidden">
        <ImageWithFallback src={product.image} alt={name}
          className={`w-full h-full object-cover ${!orderable ? 'grayscale' : ''}`}
          skeletonClassName="w-full h-full" />
        {/* Overlay de indisponível — mesmo tratamento do detalhe do produto.
            Só o badge no canto se perdia na grade de dois por linha, e o
            cliente tocava no card achando que ia dar. */}
        {badge && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,.42)' }}>
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${badge.className}`}>
              {badge.label}
            </span>
          </div>
        )}

        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {hasOffer && orderable && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">Oferta</span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-semibold line-clamp-2 leading-tight" style={{ color: 'var(--text-hi)' }}>
          {name}
        </p>
        {description && (
          <p className="text-xs mt-0.5 line-clamp-2 leading-tight" style={{ color: 'var(--text-lo)' }}>
            {description}
          </p>
        )}
        {periodLabel && (
          <p className="text-xs mt-1 text-amber-600">🕐 {periodLabel}</p>
        )}
        <div className="mt-2 flex items-end justify-between gap-1">
          <div>
            {hasOffer && (
              <p className="text-xs line-through" style={{ color: 'var(--text-lo)' }}>
                {formatCurrency(product.price ?? 0)}
              </p>
            )}
            {/*
              Só o preço, sem "A partir de".
              O piso do card é agora exatamente o valor que a tela do produto
              abre e que o cliente paga escolhendo os inclusos — "a partir de"
              sugeria um mínimo teórico que ele nunca veria, e o número menor
              que aparecia dentro do produto virava contradição.
            */}
            <p className="text-sm font-bold" style={{ color: orderable ? 'var(--color-brand)' : 'var(--text-lo)' }}>
              {formatCurrency(displayPrice)}
            </p>
          </div>
          {orderable && (
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
              style={{ backgroundColor: 'var(--color-brand)' }}>+</span>
          )}
        </div>
      </div>
    </button>
  )
}

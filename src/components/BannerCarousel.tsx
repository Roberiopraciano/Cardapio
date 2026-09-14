import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BranchBanner } from '../types'
import ImageWithFallback from './ImageWithFallback'
import Icon from './Icon'

interface Props {
  banners: BranchBanner[]
  onClose: () => void
  /**
   * `true` obriga a passar por todos os banners antes de liberar o cardápio.
   * Ver `settingsWeb.bannersRequired`.
   */
  required?: boolean
}

const AUTOPLAY_MS = 6000

/**
 * Banners promocionais no início da sessão, em wizard.
 *
 * Aparece **uma vez por sessão**, depois do boot e antes das perguntas de
 * idioma/consumo. O avanço é explícito: botão "Próximo", swipe e pontinhos
 * clicáveis. O autoplay existe só como empurrão — quem interage assume o
 * controle e ele não volta a mexer sozinho.
 */
export default function BannerCarousel({ banners, onClose, required }: Props) {
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  /** Índice mais avançado que o cliente já viu — libera a saída no modo obrigatório */
  const [seenMax, setSeenMax] = useState(0)
  const [manual, setManual] = useState(false)
  const touchStartX = useRef<number | null>(null)

  const slides = banners
    .filter((b) => b.active !== false && (b.image ?? '').trim())
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))

  const last = slides.length - 1

  const go = (next: number, byUser = true) => {
    const clamped = Math.max(0, Math.min(last, next))
    setIndex(clamped)
    setSeenMax((m) => Math.max(m, clamped))
    if (byUser) setManual(true)
  }

  useEffect(() => {
    // Autoplay só enquanto o cliente não tomou o controle.
    // O bug anterior: um `onPointerDown` no contêiner inteiro marcava "pausado"
    // no primeiro toque em qualquer lugar — inclusive num scroll — e não havia
    // nada que despausasse. O carrossel parava no primeiro banner para sempre.
    if (manual || slides.length < 2) return
    const timer = setInterval(() => {
      setIndex((i) => {
        const next = i >= last ? 0 : i + 1
        setSeenMax((m) => Math.max(m, next))
        return next
      })
    }, AUTOPLAY_MS)
    return () => clearInterval(timer)
  }, [manual, slides.length, last])

  if (slides.length === 0) return null

  const current = slides[index]
  const isLast = index === last
  // No modo obrigatório, só libera depois de ter chegado ao último
  const canLeave = !required || seenMax >= last

  const handleLink = (link: string) => {
    // Link externo abre em nova aba e não tira o cliente do pedido;
    // interno navega no próprio app.
    if (/^https?:\/\//i.test(link)) {
      window.open(link, '_blank', 'noopener,noreferrer')
      return
    }
    onClose()
    navigate(link)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current
    touchStartX.current = null
    if (start === null) return
    const delta = (e.changedTouches[0]?.clientX ?? start) - start
    if (Math.abs(delta) < 40) return
    go(delta < 0 ? index + 1 : index - 1)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-page)' }}>
      {/* Sair — some enquanto o cliente não viu todos, no modo obrigatório */}
      <div className="flex justify-between items-center p-3 h-14">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-lo)' }}>
          {index + 1} de {slides.length}
        </span>
        {canLeave && (
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5"
            style={{ background: 'var(--bg-input)', color: 'var(--text-hi)' }}
          >
            Ir ao cardápio <Icon name="close" size={11} />
          </button>
        )}
      </div>

      <div
        className="flex-1 flex flex-col justify-center px-4 pb-6"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="relative w-full rounded-3xl overflow-hidden"
          style={{ background: 'var(--bg-card)' }}>

          {/*
            Trilho deslizante: todos os banners lado a lado, movidos por
            `translateX`. Antes era troca de conteúdo no mesmo nó, o que dava
            um pisca-pisca sem direção — o slide mostra de onde veio e para
            onde vai.
          */}
          <div
            className="flex"
            style={{
              width: `${slides.length * 100}%`,
              transform: `translateX(-${index * (100 / slides.length)}%)`,
              transition: 'transform .38s cubic-bezier(.4,0,.2,1)',
            }}
          >
            {slides.map((slide, i) => (
              <div
                key={`${slide.image}-${i}`}
                className="relative"
                style={{ width: `${100 / slides.length}%` }}
              >
                <ImageWithFallback
                  src={slide.image}
                  alt={slide.title ?? 'Promoção'}
                  className="w-full aspect-[4/5] object-cover"
                  skeletonClassName="w-full aspect-[4/5]"
                />
                {(slide.title || slide.subtitle) && (
                  <div className="absolute inset-x-0 bottom-0 p-5"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,.82), transparent)' }}>
                    {slide.title && (
                      <p className="text-white text-xl font-bold leading-tight">{slide.title}</p>
                    )}
                    {slide.subtitle && (
                      <p className="text-white/80 text-sm mt-1">{slide.subtitle}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Setas laterais */}
          {slides.length > 1 && (
            <>
              {index > 0 && (
                <button
                  onClick={() => go(index - 1)}
                  aria-label="Anterior"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,.45)', color: '#fff' }}
                >
                  <Icon name="back" size={15} />
                </button>
              )}
              {!isLast && (
                <button
                  onClick={() => go(index + 1)}
                  aria-label="Próximo"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,.45)', color: '#fff', transform: 'translateY(-50%) rotate(180deg)' }}
                >
                  <Icon name="back" size={15} />
                </button>
              )}
            </>
          )}
        </div>

        {/* Indicadores */}
        {slides.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-4">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => go(i)}
                aria-label={`Banner ${i + 1}`}
                className="rounded-full transition-all"
                style={{
                  width: i === index ? 20 : 6,
                  height: 6,
                  background: i === index ? 'var(--color-brand)' : 'var(--border)',
                }}
              />
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {current.link && (
            <button
              onClick={() => handleLink(current.link!)}
              className="w-full py-3.5 rounded-xl font-semibold text-sm active:scale-[0.98] transition-transform border"
              style={{
                background: 'var(--bg-card)',
                borderColor: 'var(--color-brand-medium)',
                color: 'var(--color-brand)',
              }}
            >
              {current.linkLabel?.trim() || 'Ver'}
            </button>
          )}

          {/* Ação principal: avança, e no último banner vira a saída */}
          <button
            onClick={() => (isLast ? onClose() : go(index + 1))}
            className="w-full py-3.5 rounded-xl text-white font-semibold text-sm active:scale-[0.98] transition-transform"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            {isLast ? 'Ver o cardápio' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  )
}

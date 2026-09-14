import { useState, useEffect } from 'react'
import { getCachedUrl } from '../lib/imageCache'

interface Props {
  src: string
  alt: string
  className?: string
  skeletonClassName?: string
  fallback?: string
}

/**
 * Espelho do comportamento do ImageCacher.dart no Flutter:
 * - Tenta servir a imagem do cache em memória (getCachedUrl)
 * - Exibe skeleton animado enquanto carrega
 * - Fallback para placeholder cinza se falhar
 */
export default function ImageWithFallback({
  src,
  alt,
  className = '',
  skeletonClassName = '',
  fallback,
}: Props) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const resolvedSrc = src ? getCachedUrl(src) : ''

  useEffect(() => {
    setLoaded(false)
    setError(false)
  }, [src])

  if (!resolvedSrc || error) {
    /**
     * Sem foto, mostra a **inicial do item** num fundo da cor da marca.
     *
     * O ícone genérico de "foto" que estava aqui antes lia como *imagem
     * quebrada* — o cliente achava que o app falhou. A inicial parece decisão
     * de design, distingue um item do outro na grade e some visualmente quando
     * o produto tem foto de verdade.
     */
    const initial = alt.trim().charAt(0).toLocaleUpperCase('pt-BR')

    return (
      <div
        className={`flex items-center justify-center shrink-0 overflow-hidden ${skeletonClassName || className}`}
        style={{
          aspectRatio: 'inherit',
          background: 'var(--color-brand-light)',
        }}
      >
        {fallback ? (
          <img src={fallback} alt={alt} className={className} />
        ) : initial ? (
          <span
            className="font-bold leading-none select-none"
            style={{
              // Relativo à caixa: o mesmo componente serve a foto de 24px da
              // aba de categoria e ao hero de 256px do produto
              fontSize: 'clamp(11px, 42%, 64px)',
              color: 'var(--color-brand)',
              opacity: 0.75,
            }}
            aria-hidden
          >
            {initial}
          </span>
        ) : (
          <svg
            className="w-1/2 h-1/2 max-w-8 max-h-8 opacity-40"
            style={{ color: 'var(--color-brand)' }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 2v7c0 1.1.9 2 2 2h1v11h2V2H6v7H5V2H3zm13 0v20h2v-9h1a2 2 0 002-2V2h-2v7h-1V2h-2z"
            />
          </svg>
        )}
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden shrink-0">
      {!loaded && (
        <div
          className={`absolute inset-0 animate-pulse ${skeletonClassName}`}
          style={{ background: 'var(--bg-input)' }}
        />
      )}
      <img
        src={resolvedSrc}
        alt={alt}
        loading="lazy"
        className={`${className} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  )
}

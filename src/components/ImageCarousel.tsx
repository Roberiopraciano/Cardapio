import { useState, useRef, useCallback } from 'react'
import ImageWithFallback from './ImageWithFallback'

interface CarouselImage {
  photo: string
  active?: boolean
}

interface Props {
  images: CarouselImage[]
  staticImage?: string
  alt: string
  height?: number
  className?: string
}

/**
 * Carrossel swipeable de fotos do produto.
 * Fontes (prioridade):
 *   1. sliderHeader.image[] (múltiplas fotos do produto)
 *   2. staticImage (única foto)
 *
 * Suporta swipe touch e click nos dots.
 */
export default function ImageCarousel({ images, staticImage, alt, height = 260, className = '' }: Props) {
  // Filtra imagens ativas
  const activeImages = images.filter(i => i.active !== false && i.photo)
  if (staticImage && !activeImages.find(i => i.photo === staticImage)) {
    activeImages.unshift({ photo: staticImage, active: true })
  }

  const allImages = activeImages.length > 0 ? activeImages : []
  const [current, setCurrent] = useState(0)
  const touchStart = useRef<number | null>(null)
  const touchDelta = useRef(0)
  const [dragging, setDragging] = useState(false)

  const goTo = useCallback((idx: number) => {
    setCurrent(Math.max(0, Math.min(idx, allImages.length - 1)))
  }, [allImages.length])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX
    touchDelta.current = 0
    setDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart.current === null) return
    touchDelta.current = e.touches[0].clientX - touchStart.current
  }

  const handleTouchEnd = () => {
    setDragging(false)
    if (Math.abs(touchDelta.current) > 50) {
      if (touchDelta.current < 0) goTo(current + 1)
      else goTo(current - 1)
    }
    touchStart.current = null
    touchDelta.current = 0
  }

  if (allImages.length === 0) {
    return (
      <div style={{ height, background: '#f0f0f0' }} className={`flex items-center justify-center ${className}`}>
        <span className="text-6xl opacity-30">🖼</span>
      </div>
    )
  }

  if (allImages.length === 1) {
    return (
      <div style={{ height }} className={`w-full overflow-hidden ${className}`}>
        <ImageWithFallback src={allImages[0].photo} alt={alt} className="w-full h-full object-cover" />
      </div>
    )
  }

  return (
    <div
      style={{ height, position: 'relative', overflow: 'hidden' }}
      className={className}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slides */}
      <div
        style={{
          display: 'flex',
          height: '100%',
          transform: `translateX(calc(-${current * 100}% + ${dragging ? touchDelta.current : 0}px))`,
          transition: dragging ? 'none' : 'transform .3s cubic-bezier(.4,0,.2,1)',
          willChange: 'transform',
        }}
      >
        {allImages.map((img, idx) => (
          <div key={idx} style={{ flexShrink: 0, width: '100%', height: '100%' }}>
            <ImageWithFallback
              src={img.photo}
              alt={`${alt} ${idx + 1}`}
              className="w-full h-full object-cover"
            />
          </div>
        ))}
      </div>

      {/* Dots */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {allImages.map((_, idx) => (
          <button
            key={idx}
            onClick={() => goTo(idx)}
            style={{
              width: idx === current ? 20 : 6,
              height: 6,
              borderRadius: 3,
              background: idx === current ? 'var(--color-brand)' : 'rgba(255,255,255,.6)',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              transition: 'all .2s',
              boxShadow: '0 1px 3px rgba(0,0,0,.3)',
            }}
            aria-label={`Foto ${idx + 1}`}
          />
        ))}
      </div>

      {/* Contador top-right */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          background: 'rgba(0,0,0,.45)',
          color: '#fff',
          borderRadius: 20,
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: 500,
        }}
      >
        {current + 1}/{allImages.length}
      </div>
    </div>
  )
}

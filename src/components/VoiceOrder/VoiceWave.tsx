import { useEffect, useRef } from 'react'

const BARS = 28
const MIN_HEIGHT = 0.12

/**
 * Onda da voz: cada barra é o volume de um instante, e as mais novas entram pela direita.
 * Sem `analyser` (aparelho sem Web Audio) as barras ficam baixas e paradas.
 */
export default function VoiceWave({ analyser }: { analyser: AnalyserNode | null }) {
  const bars = useRef<Array<HTMLSpanElement | null>>([])

  useEffect(() => {
    const levels: number[] = Array(BARS).fill(MIN_HEIGHT)
    const paint = () => bars.current.forEach((bar, index) => { if (bar) bar.style.transform = `scaleY(${levels[index]})` })
    paint()
    if (!analyser) return

    const samples = new Uint8Array(analyser.fftSize)
    let frame = 0
    let last = 0
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < 60) return // ~16 barras por segundo: a onda corre devagar o bastante para ler
      last = now
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      for (const sample of samples) sum += ((sample - 128) / 128) ** 2
      const volume = Math.min(1, Math.sqrt(sum / samples.length) * 9) // voz normal fica por volta de 0,05–0,25
      levels.shift()
      levels.push(Math.max(MIN_HEIGHT, volume))
      paint()
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [analyser])

  return (
    <span aria-hidden="true" className="flex items-center justify-center gap-[3px] h-8 flex-1 min-w-0 overflow-hidden">
      {Array.from({ length: BARS }, (_, index) => (
        <span
          key={index}
          ref={element => { bars.current[index] = element }}
          className="w-[3px] h-full rounded-full"
          style={{ background: 'var(--color-brand)', transform: `scaleY(${MIN_HEIGHT})`, transition: 'transform 80ms linear' }}
        />
      ))}
    </span>
  )
}

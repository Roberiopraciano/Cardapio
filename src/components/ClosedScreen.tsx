import { useEffect, useMemo, useState } from 'react'
import type { Period } from '../types'
import {
  getDayPhase,
  getClosedTheme,
  calcCountdown,
  getNextOpenDate,
  isPeriodOpen,
  padTwo,
  type ClosedReason,
} from '../lib/businessPeriod'

interface Props {
  reason: ClosedReason
  periods: Period[]
  branchName?: string
}

/**
 * Porta de closed_screen.dart
 * Tema manhã (aurora) / noite (estrelas) detectado automaticamente.
 * Countdown em tempo real para próxima abertura.
 */
export default function ClosedScreen({ reason, periods, branchName }: Props) {
  // Só serve para forçar um re-render por segundo e o countdown andar.
  const [, tick] = useState(0)
  const theme = getClosedTheme()
  const phase = getDayPhase()
  const nextOpen = getNextOpenDate(periods)

  useEffect(() => {
    const timer = setInterval(() => tick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const countdown = nextOpen ? calcCountdown(nextOpen) : null

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden"
      style={{
        background:
          phase === 'morning'
            ? 'linear-gradient(180deg, #1A2744 0%, #2E3F6F 25%, #5C4A8F 50%, #D4703A 78%, #E8A050 100%)'
            : 'linear-gradient(180deg, #060B1A 0%, #0D1B3E 35%, #112244 65%, #0A0F1E 100%)',
      }}
    >
      {/* Partículas de fundo */}
      {phase === 'night' ? <Stars /> : <MorningRays />}

      {/* Conteúdo */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-sm w-full gap-6">
        {/* Ícone animado */}
        <div className="animate-bounce-slow">
          {phase === 'morning' ? <SunIcon /> : <MoonIcon />}
        </div>

        {/* Nome da empresa */}
        {branchName && (
          <p className="text-white/50 text-sm font-medium tracking-widest uppercase">
            {branchName}
          </p>
        )}

        {/* Headline */}
        <div>
          <h1 className="text-3xl font-bold text-white leading-tight">
            {reason === 'branchInactive' ? 'Indisponível' : theme.headline}
          </h1>
          <p className="text-white/60 mt-2 text-sm whitespace-pre-line leading-relaxed">
            {reason === 'branchInactive'
              ? 'Este cardápio está temporariamente indisponível.\nTente novamente mais tarde.'
              : theme.subtitle}
          </p>
        </div>

        {/* Card de horários */}
        {reason === 'outsideHours' && periods.length > 0 && (
          <GlassCard>
            <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-3">
              Horário de funcionamento
            </p>
            <div className="flex flex-col gap-2">
              {periods.map((p) => {
                const DAY=['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
                const today = DAY[new Date().getDay()]
                const slots = p.period?.[today] ?? []
                return (
                  <div key={p._id} className="flex justify-between items-center">
                    <span className="text-white/70 text-sm">{p.title}</span>
                    <span className="text-white text-sm font-semibold">
                      {slots.map((s:any) => `${s.from} – ${s.to}`).join(', ') || '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </GlassCard>
        )}

        {/* Countdown */}
        {countdown && countdown.totalSeconds > 0 && (
          <div>
            <p className="text-white/40 text-xs uppercase tracking-widest mb-3">
              Abre em
            </p>
            <div className="flex items-center gap-2">
              <CountdownUnit value={countdown.hours} label="h" />
              <Separator />
              <CountdownUnit value={countdown.minutes} label="min" />
              <Separator />
              <CountdownUnit value={countdown.seconds} label="s" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full rounded-2xl p-5"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.11)',
      }}
    >
      {children}
    </div>
  )
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  const accent = getDayPhase() === 'morning' ? '#FFB347' : '#FFD166'
  return (
    <div
      className="w-16 py-2 rounded-xl flex flex-col items-center"
      style={{
        background: `${accent}14`,
        border: `1px solid ${accent}33`,
      }}
    >
      <span className="text-white text-2xl font-bold tracking-widest">
        {padTwo(value)}
      </span>
      <span className="text-white/35 text-[10px] tracking-widest uppercase mt-0.5">
        {label}
      </span>
    </div>
  )
}

function Separator() {
  return <span className="text-white/25 text-xl font-light pb-2">:</span>
}

function SunIcon() {
  return (
    <div className="w-24 h-24 rounded-full flex items-center justify-center"
      style={{ background: 'rgba(255,179,71,0.15)', boxShadow: '0 0 60px rgba(255,140,0,0.35)' }}>
      <svg className="w-12 h-12" viewBox="0 0 24 24" fill="#FFB347">
        <circle cx="12" cy="12" r="5" />
        {[0,45,90,135,180,225,270,315].map((deg) => (
          <line key={deg}
            x1={12 + 7.5 * Math.cos((deg * Math.PI) / 180)}
            y1={12 + 7.5 * Math.sin((deg * Math.PI) / 180)}
            x2={12 + 10 * Math.cos((deg * Math.PI) / 180)}
            y2={12 + 10 * Math.sin((deg * Math.PI) / 180)}
            stroke="#FFB347" strokeWidth="2" strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  )
}

function MoonIcon() {
  return (
    <div className="w-24 h-24 rounded-full flex items-center justify-center"
      style={{ background: 'rgba(255,209,102,0.1)', boxShadow: '0 0 60px rgba(255,209,102,0.22)' }}>
      <svg className="w-12 h-12" viewBox="0 0 24 24" fill="#FFD166">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </div>
  )
}

function Stars() {
  // Sorteado uma única vez: o ClosedScreen re-renderiza a cada segundo por causa
  // do countdown, e sem o memo as 40 estrelas trocavam de posição 1×/s.
  const stars = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 60,
        size: Math.random() * 2 + 0.5,
        delay: Math.random() * 3,
      })),
    [],
  )
  return (
    <div className="absolute inset-0 pointer-events-none">
      {stars.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full bg-white animate-pulse"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            opacity: 0.6,
            animationDelay: `${s.delay}s`,
            animationDuration: `${2 + s.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

function MorningRays() {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-full pointer-events-none overflow-hidden opacity-10">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="absolute bottom-0 left-1/2 origin-bottom"
          style={{
            width: 2,
            height: '80%',
            background: 'linear-gradient(to top, #FFB347, transparent)',
            transform: `translateX(-50%) rotate(${(i - 3.5) * 15}deg)`,
          }}
        />
      ))}
    </div>
  )
}

/**
 * Porta de closed_screen.dart
 * - Lógica de fase do dia (manhã/noite)
 * - Verifica se a branch está aberta (via períodos ou businessHours)
 * - Countdown para próxima abertura
 *
 * Period agora usa o formato real da API:
 *   period.period = { "monday": [{from:"08:00",to:"22:00"}], ... }
 */

import type { Period, Branch } from '../types'

export type ClosedReason = 'outsideHours' | 'branchInactive' | null
export type DayPhase = 'morning' | 'night'

// ─── Verificação de período (formato real da API) ─────────────────────────────

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

/**
 * "HH:mm" → minutos desde 00:00, ou null se não parsear.
 *
 * Toda comparação de horário acontece em minutos locais de propósito. A versão
 * antiga montava `new Date("YYYY-MM-DD HH:mm")` com a data vinda de
 * `toISOString()` — que é UTC. Em GMT-3, das 21h à meia-noite o UTC já está no
 * dia seguinte, então o slot era construído com a data de amanhã e a branch
 * aparecia fechada a noite inteira.
 */
function toMinutes(hhmm: string): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

function minutesNow(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}

/** Verifica se agora está dentro de algum slot de um Period */
export function isPeriodOpen(period: Period): boolean {
  const now = new Date()
  const nowMin = minutesNow(now)
  const today = now.getDay()

  for (const slot of period.period?.[DAY_NAMES[today]] ?? []) {
    const from = toMinutes(slot.from)
    const to = toMinutes(slot.to)
    if (from === null || to === null) continue
    if (to > from) {
      if (nowMin >= from && nowMin <= to) return true
    } else if (to < from) {
      // Slot que atravessa a meia-noite (ex: 18:00 → 02:00): hoje vale até 23:59
      if (nowMin >= from) return true
    }
  }

  // Slot de ontem que atravessou a meia-noite e ainda está correndo
  const yesterday = (today + 6) % 7
  for (const slot of period.period?.[DAY_NAMES[yesterday]] ?? []) {
    const from = toMinutes(slot.from)
    const to = toMinutes(slot.to)
    if (from === null || to === null) continue
    if (to < from && nowMin <= to) return true
  }

  return false
}

/** Espelho de BusinessPeriod.nextOpenDateTime */
export function nextOpenDateFromPeriod(period: Period): Date | null {
  const now = new Date()
  for (let offset = 0; offset < 8; offset++) {
    // Componentes locais — `new Date(y, m, d + offset)` já vira mês/ano sozinho
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    const slots = period.period?.[DAY_NAMES[d.getDay()]]
    if (!slots || slots.length === 0) continue

    const starts = slots
      .map((s) => toMinutes(s.from))
      .filter((m): m is number => m !== null)
      .sort((a, b) => a - b)

    for (const min of starts) {
      const candidate = new Date(
        d.getFullYear(), d.getMonth(), d.getDate(),
        Math.floor(min / 60), min % 60, 0, 0,
      )
      if (candidate > now) return candidate
    }
  }
  return null
}

// ─── Branch aberta/fechada ────────────────────────────────────────────────────

export function checkBranchOpen(branch: Branch, periods: Period[]): ClosedReason {
  if (branch.active === false) return 'branchInactive'
  if (periods.length > 0) {
    return periods.some(isPeriodOpen) ? null : 'outsideHours'
  }
  // Fallback: businessHours legacy (open/close strings)
  const hours = branch.settingsWeb?.businessHours
  if (hours && hours.length > 0) {
    const now = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const anyOpen = hours.some((h) => {
      const [oh, om] = h.open.split(':').map(Number)
      const [ch, cm] = h.close.split(':').map(Number)
      const openMin = oh * 60 + om
      const closeMin = ch * 60 + cm
      if (closeMin <= openMin) return nowMin >= openMin || nowMin < closeMin
      return nowMin >= openMin && nowMin < closeMin
    })
    return anyOpen ? null : 'outsideHours'
  }
  return null  // sem config → considera aberto
}

// ─── Fase do dia ──────────────────────────────────────────────────────────────

export function getDayPhase(): DayPhase {
  const h = new Date().getHours()
  return h >= 5 && h < 13 ? 'morning' : 'night'
}

export interface ClosedTheme {
  headline: string
  subtitle: string
  phase: DayPhase
}

export function getClosedTheme(): ClosedTheme {
  const phase = getDayPhase()
  if (phase === 'morning') return {
    phase,
    headline: 'Ainda não abrimos',
    subtitle: 'Estamos nos preparando para você!\nVeja quando abrimos abaixo.',
  }
  return {
    phase,
    headline: 'Estamos fechados',
    subtitle: 'Voltaremos em breve!\nConfira nosso horário abaixo.',
  }
}

// ─── Countdown ────────────────────────────────────────────────────────────────

export interface Countdown { hours: number; minutes: number; seconds: number; totalSeconds: number }

export function calcCountdown(nextOpen: Date): Countdown {
  const diff = Math.max(0, nextOpen.getTime() - Date.now())
  const total = Math.floor(diff / 1000)
  return { hours: Math.floor(total / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60, totalSeconds: total }
}

export function getNextOpenDate(periods: Period[]): Date | null {
  const dates = periods.map(nextOpenDateFromPeriod).filter(Boolean) as Date[]
  if (dates.length === 0) return null
  return dates.reduce((a, b) => (a < b ? a : b))
}

export function padTwo(n: number): string { return String(n).padStart(2, '0') }

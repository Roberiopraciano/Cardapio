/**
 * Testes para src/lib/businessPeriod.ts
 * Cobre: isPeriodOpen, checkBranchOpen, getDayPhase, calcCountdown
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isPeriodOpen,
  checkBranchOpen,
  getDayPhase,
  getClosedTheme,
  calcCountdown,
  getNextOpenDate,
  padTwo,
} from '../lib/businessPeriod'
import type { Period, Branch } from '../types'

// 3 jan 2025 = sexta-feira (getDay() === 5), usada como âncora.
// Datas são construídas com componentes locais de propósito: o horário
// comercial é sempre local, nunca UTC.
function setTime(hour: number, minute = 0, dayOfWeek = 5) {
  const d = new Date(2025, 0, 3 + (dayOfWeek - 5), hour, minute, 0)
  vi.setSystemTime(d)
}

function makePeriod(slots: Record<string, Array<{ from: string; to: string }>>, overrides: Partial<Period> = {}): Period {
  return { _id: 'p1', branch: 'b1', title: 'Test', period: slots, ...overrides }
}

function makeBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    _id: 'b1', name: 'Test', phone: '', active: true,
    settingsTotem: {}, paymentMethodsDefault: {}, paymentMethods: [],
    ...overrides,
  } as Branch
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

// ─── isPeriodOpen ─────────────────────────────────────────────────────────────

describe('isPeriodOpen', () => {
  it('dentro do horário → true', () => {
    setTime(12, 0) // sexta 12:00
    const p = makePeriod({ friday: [{ from: '11:00', to: '14:00' }] })
    expect(isPeriodOpen(p)).toBe(true)
  })

  it('antes do horário → false', () => {
    setTime(10, 30) // sexta 10:30
    const p = makePeriod({ friday: [{ from: '11:00', to: '14:00' }] })
    expect(isPeriodOpen(p)).toBe(false)
  })

  it('depois do horário → false', () => {
    setTime(15, 0) // sexta 15:00
    const p = makePeriod({ friday: [{ from: '11:00', to: '14:00' }] })
    expect(isPeriodOpen(p)).toBe(false)
  })

  it('sem slots para o dia → false', () => {
    setTime(12, 0) // sexta
    const p = makePeriod({ saturday: [{ from: '10:00', to: '22:00' }] })
    expect(isPeriodOpen(p)).toBe(false)
  })

  it('múltiplos slots — dentro do segundo → true', () => {
    setTime(20, 0) // sexta 20:00
    const p = makePeriod({ friday: [{ from: '11:00', to: '14:00' }, { from: '18:00', to: '22:00' }] })
    expect(isPeriodOpen(p)).toBe(true)
  })

  it('entre os dois slots → false', () => {
    setTime(16, 0) // sexta 16:00
    const p = makePeriod({ friday: [{ from: '11:00', to: '14:00' }, { from: '18:00', to: '22:00' }] })
    expect(isPeriodOpen(p)).toBe(false)
  })

  // ── Regressão de fuso ──
  // Das 21h à meia-noite em GMT-3 o UTC já está no dia seguinte. A versão antiga
  // usava toISOString() para montar a data do slot e dava "fechado" a noite toda.
  it('21:17 dentro do horário → true (não pode virar o dia via UTC)', () => {
    setTime(21, 17) // sexta 21:17 local
    const p = makePeriod({ friday: [{ from: '18:00', to: '23:00' }] })
    expect(isPeriodOpen(p)).toBe(true)
  })

  it('23:59 dentro do horário → true', () => {
    setTime(23, 59)
    const p = makePeriod({ friday: [{ from: '18:00', to: '23:59' }] })
    expect(isPeriodOpen(p)).toBe(true)
  })

  it('22:30 com slot que fecha 22:00 → false', () => {
    setTime(22, 30)
    const p = makePeriod({ friday: [{ from: '18:00', to: '22:00' }] })
    expect(isPeriodOpen(p)).toBe(false)
  })

  // ── Slots que atravessam a meia-noite ──
  it('slot 18:00→02:00, agora 23:00 de sexta → true', () => {
    setTime(23, 0)
    const p = makePeriod({ friday: [{ from: '18:00', to: '02:00' }] })
    expect(isPeriodOpen(p)).toBe(true)
  })

  it('slot 18:00→02:00 de sexta, agora 01:00 de sábado → true', () => {
    setTime(1, 0, 6) // sábado 01:00
    const p = makePeriod({ friday: [{ from: '18:00', to: '02:00' }] })
    expect(isPeriodOpen(p)).toBe(true)
  })

  it('slot 18:00→02:00 de sexta, agora 03:00 de sábado → false', () => {
    setTime(3, 0, 6)
    const p = makePeriod({ friday: [{ from: '18:00', to: '02:00' }] })
    expect(isPeriodOpen(p)).toBe(false)
  })

  it('slot mal formatado → false, sem lançar', () => {
    setTime(12, 0)
    const p = makePeriod({ friday: [{ from: 'abc', to: '99:99' }] })
    expect(isPeriodOpen(p)).toBe(false)
  })
})

// ─── checkBranchOpen ─────────────────────────────────────────────────────────

describe('checkBranchOpen', () => {
  it('branch inativa → branchInactive', () => {
    const branch = makeBranch({ active: false })
    expect(checkBranchOpen(branch, [])).toBe('branchInactive')
  })

  it('sem períodos → null (considera aberto)', () => {
    const branch = makeBranch()
    expect(checkBranchOpen(branch, [])).toBeNull()
  })

  it('período ativo agora → null (aberto)', () => {
    setTime(12, 0)
    const branch = makeBranch()
    const period = makePeriod({ friday: [{ from: '11:00', to: '14:00' }] })
    expect(checkBranchOpen(branch, [period])).toBeNull()
  })

  it('período inativo agora → outsideHours', () => {
    setTime(15, 0)
    const branch = makeBranch()
    const period = makePeriod({ friday: [{ from: '11:00', to: '14:00' }] })
    expect(checkBranchOpen(branch, [period])).toBe('outsideHours')
  })

  it('múltiplos períodos — qualquer aberto → null', () => {
    setTime(20, 0) // só o segundo período está aberto
    const branch = makeBranch()
    const p1 = makePeriod({ friday: [{ from: '11:00', to: '14:00' }] }, { _id: 'p1' })
    const p2 = makePeriod({ friday: [{ from: '18:00', to: '22:00' }] }, { _id: 'p2' })
    expect(checkBranchOpen(branch, [p1, p2])).toBeNull()
  })

  it('fallback businessHours quando sem períodos', () => {
    setTime(12, 0)
    const branch = makeBranch({
      settingsWeb: { businessHours: [{ open: '11:00', close: '14:00', label: 'Almoço' }] }
    })
    expect(checkBranchOpen(branch, [])).toBeNull()
  })

  it('fallback businessHours fechado', () => {
    setTime(15, 0)
    const branch = makeBranch({
      settingsWeb: { businessHours: [{ open: '11:00', close: '14:00', label: 'Almoço' }] }
    })
    expect(checkBranchOpen(branch, [])).toBe('outsideHours')
  })
})

// ─── getDayPhase ─────────────────────────────────────────────────────────────

describe('getDayPhase', () => {
  it('05:00 → morning', () => { setTime(5, 0); expect(getDayPhase()).toBe('morning') })
  it('09:00 → morning', () => { setTime(9, 0); expect(getDayPhase()).toBe('morning') })
  it('12:59 → morning', () => { setTime(12, 59); expect(getDayPhase()).toBe('morning') })
  it('13:00 → night', () => { setTime(13, 0); expect(getDayPhase()).toBe('night') })
  it('20:00 → night', () => { setTime(20, 0); expect(getDayPhase()).toBe('night') })
  it('04:59 → night', () => { setTime(4, 59); expect(getDayPhase()).toBe('night') })
})

describe('getClosedTheme', () => {
  it('fase morning → headline "Ainda não abrimos"', () => {
    setTime(8, 0)
    const t = getClosedTheme()
    expect(t.phase).toBe('morning')
    expect(t.headline).toContain('Ainda')
  })
  it('fase night → headline "Estamos fechados"', () => {
    setTime(21, 0)
    const t = getClosedTheme()
    expect(t.phase).toBe('night')
    expect(t.headline).toContain('fechados')
  })
})

// ─── calcCountdown ────────────────────────────────────────────────────────────

describe('calcCountdown', () => {
  it('1 hora no futuro → 3600 segundos', () => {
    setTime(10, 0)
    const next = new Date(2025, 0, 3, 11, 0, 0) // 1h depois
    const c = calcCountdown(next)
    expect(c.hours).toBe(1)
    expect(c.minutes).toBe(0)
    expect(c.seconds).toBe(0)
    expect(c.totalSeconds).toBe(3600)
  })

  it('30 minutos no futuro', () => {
    setTime(10, 0)
    const next = new Date(2025, 0, 3, 10, 30, 0)
    const c = calcCountdown(next)
    expect(c.hours).toBe(0)
    expect(c.minutes).toBe(30)
    expect(c.totalSeconds).toBe(1800)
  })

  it('data no passado → totalSeconds 0', () => {
    setTime(12, 0)
    const past = new Date(2025, 0, 3, 11, 0, 0) // 1h atrás
    const c = calcCountdown(past)
    expect(c.totalSeconds).toBe(0)
  })
})

// ─── padTwo ───────────────────────────────────────────────────────────────────

describe('padTwo', () => {
  it('número menor que 10 → adiciona zero à esquerda', () => {
    expect(padTwo(5)).toBe('05')
    expect(padTwo(0)).toBe('00')
  })
  it('número >= 10 → sem padding', () => {
    expect(padTwo(10)).toBe('10')
    expect(padTwo(59)).toBe('59')
  })
})

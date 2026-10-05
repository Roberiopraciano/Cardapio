import { describe, it, expect } from 'vitest'
import { secondsLeft, formatCountdown } from '../lib/totemHandoff'

describe('secondsLeft', () => {
  const now = Date.parse('2026-09-28T22:00:00Z')

  it('conta os segundos até expirar', () => {
    expect(secondsLeft('2026-09-28T22:15:00Z', now)).toBe(900)
  })

  it('nunca fica negativo depois de expirar', () => {
    expect(secondsLeft('2026-09-28T21:59:00Z', now)).toBe(0)
  })

  it('data inválida conta como expirado — melhor que QR eterno', () => {
    expect(secondsLeft('lixo', now)).toBe(0)
  })
})

describe('formatCountdown', () => {
  it('formata mm:ss com zero à esquerda', () => {
    expect(formatCountdown(900)).toBe('15:00')
    expect(formatCountdown(65)).toBe('01:05')
    expect(formatCountdown(0)).toBe('00:00')
  })
})

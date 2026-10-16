import { describe, it, expect } from 'vitest'
import { buildPin, isPinValid, pad2 } from '../lib/pin'

const at = (h: number, m = 0) => new Date(2026, 9, 16, h, m)

describe('PIN de pagamento na mesa', () => {
  it('mesa com 2 dígitos + hora com 2 dígitos', () => {
    expect(buildPin(3, 18)).toBe('0318')
    expect(buildPin(12, 9)).toBe('1209')
    expect(buildPin(7, 0)).toBe('0700')
  })

  it('mesa acima de 99 vale só o final', () => {
    expect(pad2(105)).toBe('05')
  })

  it('aceita o PIN da hora atual e ignora os minutos', () => {
    expect(isPinValid('0318', 3, at(18, 40), at(18, 40))).toBe(true)
    expect(isPinValid('0319', 3, at(18, 40), at(18, 40))).toBe(false)
  })

  it('aceita a hora em que a tela foi aberta (virada de hora)', () => {
    expect(isPinValid('0317', 3, at(18, 0), at(17, 59))).toBe(true)
    expect(isPinValid('0317', 3, at(19, 0), at(18, 59))).toBe(false)
  })

  it('mesa errada ou PIN incompleto não passam', () => {
    expect(isPinValid('0418', 3, at(18), at(18))).toBe(false)
    expect(isPinValid('031', 3, at(18), at(18))).toBe(false)
    expect(isPinValid('', 3, at(18), at(18))).toBe(false)
  })
})

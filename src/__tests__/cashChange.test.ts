import { describe, it, expect } from 'vitest'
import { changeAmount, changeForError, parseMoney } from '../lib/cashChange'

describe('troco', () => {
  it('lê o valor digitado do jeito brasileiro', () => {
    expect(parseMoney('100')).toBe(100)
    expect(parseMoney('100,50')).toBe(100.5)
    expect(parseMoney('R$ 1.200,00')).toBe(1200)
    expect(parseMoney('100.50')).toBe(100.5)
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('0')).toBeNull()
  })

  it('o valor para troco precisa ser maior que o total e razoável', () => {
    expect(changeForError(null, 42.9)).toMatch(/Informe/)
    expect(changeForError(42.9, 42.9)).toMatch(/maior que o total/)
    expect(changeForError(30, 42.9)).toMatch(/maior que o total/)
    expect(changeForError(50, 42.9)).toBeNull()
    expect(changeForError(100000, 42.9)).toMatch(/alto demais/)
  })

  it('calcula o troco que o entregador leva', () => {
    expect(changeAmount(50, 42.9)).toBe(7.1)
    expect(changeAmount(100, 36)).toBe(64)
  })
})

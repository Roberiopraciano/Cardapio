import { describe, it, expect } from 'vitest'
import { codesContextKey, codesStillValid } from '../lib/gerador_codigo'

describe('código do pedido pertence à modalidade e à mesa', () => {
  it('a chave separa mesas e modalidades', () => {
    expect(codesContextKey('mesa', 'MESA_01')).toBe('mesa:MESA_01')
    expect(codesContextKey('mesa', 'MESA_02')).not.toBe(codesContextKey('mesa', 'MESA_01'))
    expect(codesContextKey('balcao', '')).toBe('balcao:')
    expect(codesContextKey('delivery', 'MESA_01')).toBe('delivery:') // mesa não conta fora da mesa
  })

  it('sem código guardado, sempre gera', () => {
    expect(codesStillValid('', '', 'mesa', 'MESA_01')).toBe(false)
  })

  it('o mesmo contexto mantém o código ("Pedir mais itens" não troca de comanda)', () => {
    expect(codesStillValid('MESA_01', 'mesa:MESA_01', 'mesa', 'MESA_01')).toBe(true)
    expect(codesStillValid('4TP55', 'balcao:', 'balcao', '')).toBe(true)
  })

  it('trocar de mesa descarta o código da outra', () => {
    expect(codesStillValid('MESA_01', 'mesa:MESA_01', 'mesa', 'MESA_02')).toBe(false)
  })

  it('código de balcão/delivery não vale na mesa (era o "Sua mesa 4TP55")', () => {
    expect(codesStillValid('4TP55', 'balcao:', 'mesa', 'MESA_01')).toBe(false)
    expect(codesStillValid('4TP55', 'delivery:', 'mesa', 'MESA_01')).toBe(false)
  })

  it('código antigo, sem chave: na mesa só vale se for o nome da mesa', () => {
    expect(codesStillValid('4TP55', '', 'mesa', 'MESA_01')).toBe(false)
    expect(codesStillValid('MESA_01', '', 'mesa', 'MESA_01')).toBe(true)
    expect(codesStillValid('MESA_01', '', 'mesa', 'MESA_02')).toBe(false)
  })

  it('código antigo, sem chave, fora da mesa: mantém (não há como saber)', () => {
    expect(codesStillValid('4TP55', '', 'balcao', '')).toBe(true)
  })
})

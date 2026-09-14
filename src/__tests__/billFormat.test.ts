import { describe, it, expect } from 'vitest'
import { formatQuantity, formatUnitPrice, roundQty } from '../lib/billFormat'
import { countsToBill } from '../api/client'
import { formatCurrency } from '../lib/pricing'

describe('roundQty', () => {
  /**
   * O caso que motivou a função: a conta resumida soma quantidades, e somar
   * decimais em ponto flutuante manda a cauda direto para a tela do cliente.
   */
  it('mata a cauda de float na soma de pesos', () => {
    expect(0.412 + 0.385).not.toBe(0.797)          // o problema
    expect(roundQty(0.412 + 0.385)).toBe(0.797)    // a correção
  })

  it('preserva inteiros', () => {
    expect(roundQty(2)).toBe(2)
    expect(roundQty(0)).toBe(0)
  })

  it('arredonda na 3ª casa', () => {
    expect(roundQty(0.4125)).toBe(0.413)
    expect(roundQty(0.41249)).toBe(0.412)
  })
})

describe('formatQuantity', () => {
  it('inteiro sem unidade mantém o formato de sempre', () => {
    expect(formatQuantity(2)).toBe('2×')
    expect(formatQuantity(1)).toBe('1×')
  })

  it('quantidade ausente vira 1', () => {
    expect(formatQuantity(undefined)).toBe('1×')
  })

  it('peso usa vírgula e mostra a unidade', () => {
    expect(formatQuantity(0.412, 'kg')).toBe('0,412 kg')
    expect(formatQuantity(1.5, 'kg')).toBe('1,5 kg')
  })

  it('não deixa zero à direita', () => {
    expect(formatQuantity(0.4, 'kg')).toBe('0,4 kg')
    expect(formatQuantity(2, 'un')).toBe('2 un')
  })

  it('com unidade não usa × — "0,412 × kg" não é português', () => {
    expect(formatQuantity(0.412, 'kg')).not.toContain('×')
  })

  it('fração sem unidade cadastrada ainda é legível', () => {
    expect(formatQuantity(0.5)).toBe('0,5×')
  })

  it('nunca vaza ponto decimal para a tela', () => {
    for (const q of [0.412, 1.25, 0.797, 10.5]) {
      expect(formatQuantity(q, 'kg')).not.toContain('.')
    }
  })

  it('unidade em branco é tratada como ausente', () => {
    expect(formatQuantity(2, '   ')).toBe('2×')
  })
})

describe('formatUnitPrice', () => {
  it('mostra o preço por unidade para o cliente conferir', () => {
    expect(formatUnitPrice(89.9, 'kg', formatCurrency)).toBe('R$89,90/kg')
  })

  it('sem unidade, só o preço', () => {
    expect(formatUnitPrice(89.9, undefined, formatCurrency)).toBe('R$89,90')
  })

  it('omite quando não há preço unitário', () => {
    expect(formatUnitPrice(undefined, 'kg', formatCurrency)).toBeNull()
    expect(formatUnitPrice(0, 'kg', formatCurrency)).toBeNull()
  })
})

describe('countsToBill', () => {
  /** Item sem status é item que conta — o backend legado não manda o campo. */
  it('item sem status conta', () => {
    expect(countsToBill({})).toBe(true)
    expect(countsToBill({ status: 'active' })).toBe(true)
  })

  it('cancelado e transferido não contam', () => {
    expect(countsToBill({ status: 'cancelled' })).toBe(false)
    expect(countsToBill({ status: 'transferred' })).toBe(false)
  })
})

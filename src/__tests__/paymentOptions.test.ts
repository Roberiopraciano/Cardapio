import { describe, it, expect } from 'vitest'
import { paymentGroup, paymentOptionsFor } from '../lib/paymentOptions'

describe('paymentOptionsFor', () => {
  it('sem canal ou sem nada ligado não há opções', () => {
    expect(paymentOptionsFor(undefined)).toEqual([])
    expect(paymentOptionsFor({ card: false, pix: false })).toEqual([])
  })

  it('usa o nome e o código PDV cadastrados', () => {
    const opts = paymentOptionsFor({
      pix: true, card: true,
      names: { pix: 'Pix iFood', card: '  ' },
      pdvCodes: { pix: '42' },
    })
    expect(opts).toEqual([
      { key: 'card', label: 'Cartão', pdvCode: undefined, prepaid: false },
      { key: 'pix', label: 'Pix iFood', pdvCode: '42', prepaid: false },
    ])
  })

  it('pagar no caixa é uma forma como as outras', () => {
    expect(paymentOptionsFor({ caixa: true }))
      .toEqual([{ key: 'caixa', label: 'Pagar no caixa', pdvCode: undefined, prepaid: false }])
  })

  it('pagar no totem é uma forma como as outras', () => {
    expect(paymentOptionsFor({ totem: true, names: { totem: 'Totem da loja' }, pdvCodes: { totem: '9' } }))
      .toEqual([{ key: 'totem', label: 'Totem da loja', pdvCode: '9', prepaid: false }])
    expect(paymentOptionsFor({ totem: false })).toEqual([])
  })

  it('só entram as formas marcadas, e o prepaid da API é ignorado', () => {
    const opts = paymentOptionsFor({
      online: true, card: true, cash: false, pix: true,
      prepaid: { online: true, card: false, cash: true, pix: true },
    })
    expect(opts).toEqual([
      { key: 'online', label: 'Online', pdvCode: undefined, prepaid: false },
      { key: 'card', label: 'Cartão', pdvCode: undefined, prepaid: false },
      { key: 'pix', label: 'Pix', pdvCode: undefined, prepaid: false },
    ])
  })
})

describe('delivery: pagar online x pagar na entrega', () => {
  it('as formas online nascem desligadas: sem elas só aparecem as da entrega', () => {
    const opts = paymentOptionsFor({ card: true, cash: true, pix: true, onlinePix: false, onlineCard: false, onlineCash: false })
    expect(opts.map((o) => o.key)).toEqual(['card', 'cash', 'pix'])
    expect(opts.every((o) => paymentGroup(o.key) === 'entrega')).toBe(true)
  })

  it('formas online ligadas entram com nome, código PDV e o prepaid da API ainda ignorado', () => {
    const opts = paymentOptionsFor({
      onlinePix: true, onlineCard: true, onlineCash: true, pix: true,
      names: { onlinePix: 'Pix pelo app', onlineCard: '  ' },
      pdvCodes: { onlinePix: '77' },
      prepaid: { onlinePix: true, onlineCard: true },
    })
    expect(opts.map((o) => [o.key, o.label, o.pdvCode, o.prepaid])).toEqual([
      ['pix', 'Pix', undefined, false],
      ['onlinePix', 'Pix pelo app', '77', false],
      ['onlineCard', 'Cartão online', undefined, false],
      ['onlineCash', 'Dinheiro online', undefined, false],
    ])
  })

  it('agrupa: online (genérica e específicas) x entrega (o resto)', () => {
    expect(['online', 'onlinePix', 'onlineCard', 'onlineCash'].every((k) => paymentGroup(k as never) === 'online')).toBe(true)
    expect(['card', 'cash', 'pix', 'totem', 'caixa'].every((k) => paymentGroup(k as never) === 'entrega')).toBe(true)
  })
})

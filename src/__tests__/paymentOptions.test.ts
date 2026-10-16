import { describe, it, expect } from 'vitest'
import { paymentOptionsFor } from '../lib/paymentOptions'

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

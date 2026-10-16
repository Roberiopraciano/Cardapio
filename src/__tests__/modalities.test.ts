import { describe, it, expect } from 'vitest'
import { allowedModesOf } from '../lib/modalities'
import { paymentOptionsFor } from '../lib/paymentOptions'

describe('allowedModesOf', () => {
  it('cadastro sem nenhuma informação não restringe', () => {
    expect(allowedModesOf(undefined)).toEqual([])
    expect(allowedModesOf({ paymentMethods: { mesa: { card: true } } })).toEqual([])
  })

  it('usa os toggles de modalidades do painel', () => {
    expect(allowedModesOf({
      paymentMethods: { mesa: { enabled: true }, balcao: { enabled: true }, delivery: { enabled: false } },
    })).toEqual(['mesa', 'balcao'])
  })

  it('allowedModes do cadastro tem prioridade', () => {
    expect(allowedModesOf({
      allowedModes: ['balcao'],
      paymentMethods: { mesa: { enabled: true } },
    })).toEqual(['balcao'])
  })
})

describe('modalidade desligada', () => {
  it('não oferece formas de pagamento', () => {
    expect(paymentOptionsFor({ enabled: false, pix: true })).toEqual([])
    expect(paymentOptionsFor({ enabled: true, pix: true })).toHaveLength(1)
  })
})

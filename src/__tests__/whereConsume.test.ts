import { describe, expect, it } from 'vitest'
import { allowedWhereConsume } from '../lib/whereConsume'

describe('allowedWhereConsume', () => {
  it('mantém as duas opções para unidades legadas', () => {
    expect(allowedWhereConsume(undefined)).toEqual(['OnLocal', 'OutsideLocal'])
  })

  it('aceita somente as opções válidas e remove duplicadas', () => {
    expect(allowedWhereConsume({
      allowedWhereConsume: ['OutsideLocal', 'invalid', 'OutsideLocal'],
    })).toEqual(['OutsideLocal'])
  })

  it('não deixa configuração malformada remover todas as opções', () => {
    expect(allowedWhereConsume({ allowedWhereConsume: [] }))
      .toEqual(['OnLocal', 'OutsideLocal'])
  })
})

import { describe, it, expect } from 'vitest'
import { parseProduct } from '../lib/dataLinker'

const raw = (extra: Record<string, unknown> = {}) => ({
  _id: 'p1', name: 'X-Salada', price: 20, active: true, category: 'c1', ...extra,
})

describe('parseProduct — composição', () => {
  it('lê os nomes dos insumos enviados pela API', () => {
    expect(parseProduct(raw({ composition: ['Leite', 'Pão'] }))?.composition).toEqual(['Leite', 'Pão'])
  })

  it('sem o campo (produto sem composição) → lista vazia', () => {
    expect(parseProduct(raw())?.composition).toEqual([])
  })

  it('ignora valores que não são texto ou estão vazios', () => {
    expect(parseProduct(raw({ composition: ['Leite', null, 7, '  ', 'Pão'] }))?.composition).toEqual(['Leite', 'Pão'])
  })

  it('campo que não é lista → lista vazia', () => {
    expect(parseProduct(raw({ composition: 'Leite' }))?.composition).toEqual([])
  })
})

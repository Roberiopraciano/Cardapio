/**
 * Testes para src/lib/voiceOrder.ts
 * O servidor confirma os itens; o app só os põe no carrinho se o cardápio local
 * ainda concordar com o preço e a disponibilidade. Qualquer divergência → nada entra.
 */

import { describe, it, expect } from 'vitest'
import { prepareVoiceCartItems } from '../lib/voiceOrder'
import type { ComplementsGroup, Period, Product } from '../types'
import type { VoiceItem } from '../services/voiceOrderApi'

function drink(id: string, price: number): ComplementsGroup['products'][number] {
  return { _id: id, name: id, price, active: true, quantity: 0 }
}

function group(overrides: Partial<ComplementsGroup> = {}): ComplementsGroup {
  return {
    _id: 'g1', title: 'Bebida', items: [], products: [drink('coca', 6), drink('suco', 8)],
    minQuantity: 1, maxQuantity: 1, obrigatory: true, ingredients: false,
    isTakeawayPackaging: false, autoAdd: false, ...overrides,
  } as ComplementsGroup
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    _id: 'p1', name: 'Combo', price: 20, active: true, seq: 1, peopleCount: 1,
    complementsGroups: [], complementsId: [], image: '', category: 'c1', ...overrides,
  } as Product
}

function voiceItem(overrides: Partial<VoiceItem> = {}): VoiceItem {
  return {
    client_item_ref: 'audio-1', product_id: 'p1', quantity: 1, preparation_note: '',
    selected_options: {}, display: { name: 'Combo' }, validation_status: 'valid',
    missing_required_group_ids: [], subtotal_minor: 2000, ...overrides,
  }
}

describe('prepareVoiceCartItems', () => {
  it('monta o item de carrinho quando o preço do app bate com o do servidor', () => {
    const [item] = prepareVoiceCartItems([voiceItem({ quantity: 2, subtotal_minor: 4000, preparation_note: 'sem cebola' })], [product()], [])
    expect(item.quantity).toBe(2)
    expect(item.note).toBe('sem cebola')
    expect(item.complements).toEqual([])
  })

  it('traduz as opções escolhidas em complementos do carrinho', () => {
    const p = product({ complementsGroups: [group()] })
    const [item] = prepareVoiceCartItems([voiceItem({ selected_options: { g1: ['suco'] }, subtotal_minor: 2800 })], [p], [])
    expect(item.complements).toHaveLength(1)
    expect(item.complements[0]).toMatchObject({ _id: 'suco', groupId: 'g1', quantity: 1 })
  })

  it('recusa tudo se o preço do app divergir do calculado pelo servidor', () => {
    const items = [voiceItem(), voiceItem({ client_item_ref: 'audio-2', subtotal_minor: 1999 })]
    expect(() => prepareVoiceCartItems(items, [product()], [])).toThrow('Preço alterado')
  })

  it('recusa quando o preço do produto mudou depois da revisão', () => {
    expect(() => prepareVoiceCartItems([voiceItem()], [product({ price: 25 })], [])).toThrow('Preço alterado')
  })

  it('recusa um produto que saiu do cardápio, foi desativado ou esgotou', () => {
    expect(() => prepareVoiceCartItems([voiceItem()], [], [])).toThrow('Produto alterado')
    expect(() => prepareVoiceCartItems([voiceItem()], [product({ active: false })], [])).toThrow('Produto alterado')
    const soldOut = product({ stock: { totemSoldOut: true } as unknown as Product['stock'] })
    expect(() => prepareVoiceCartItems([voiceItem()], [soldOut], [])).toThrow('Produto alterado')
  })

  it('recusa um produto fora do período de venda', () => {
    const closed: Period = { _id: 'per1', branch: 'b', title: 'Almoço', period: {} }
    const p = product({ relatedPeriod: 'per1' })
    expect(() => prepareVoiceCartItems([voiceItem()], [p], [closed])).toThrow('Produto alterado')
  })

  it('recusa uma opção que não existe mais no grupo', () => {
    const p = product({ complementsGroups: [group({ products: [drink('coca', 6)] })] })
    expect(() => prepareVoiceCartItems([voiceItem({ selected_options: { g1: ['suco'] }, subtotal_minor: 2800 })], [p], []))
      .toThrow('Opcional alterado')
  })

  it('não confia em ids de opção de outro grupo', () => {
    const p = product({ complementsGroups: [group()] })
    expect(() => prepareVoiceCartItems([voiceItem({ selected_options: { g1: ['batata'] } })], [p], [])).toThrow('Opcional alterado')
  })

  it('devolve lista vazia para um pedido vazio, sem lançar', () => {
    expect(prepareVoiceCartItems([], [product()], [])).toEqual([])
  })
})

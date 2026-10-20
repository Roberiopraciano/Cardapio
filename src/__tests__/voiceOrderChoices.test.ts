/**
 * Testes para buildPendingChoices (src/lib/voiceOrder.ts)
 * Pendência ambígua mostra só os produtos parecidos; sem sugestão válida, o cardápio todo.
 */

import { describe, it, expect } from 'vitest'
import { buildPendingChoices } from '../lib/voiceOrder'
import type { Product } from '../types'
import type { VoiceReview } from '../services/voiceOrderApi'

function product(id: string, name: string, active = true): Product {
  return { _id: id, name, price: 1, active, complementsGroups: [] } as unknown as Product
}

const menu = [product('c1', 'Coca Cola'), product('c2', 'Coca Zero'), product('f1', 'Fanta'), product('x1', 'X-Bacon'), product('off', 'Suco', false)]

function review(overrides: Partial<VoiceReview> = {}): VoiceReview {
  return {
    review_id: 'r', items: [], invalid_items: [], missing_required_selections: [], items_not_found: [],
    ambiguous_items: [], totals: { currency: 'BRL', subtotal_minor: 0, total_minor: 0 }, expires_at: '', ...overrides,
  }
}

const cocas = [{ product_id: 'c1', display_name: 'Coca Cola' }, { product_id: 'c2', display_name: 'Coca Zero' }]

describe('buildPendingChoices', () => {
  it('ambíguo com sugestões lista só os parecidos', () => {
    const [choice] = buildPendingChoices(review({ ambiguous_items: ['coca'], ambiguous_candidates: [cocas] }), menu, new Set())
    expect(choice).toMatchObject({ ref: 'ambiguous:0', label: 'coca', narrowed: true })
    expect(choice.options).toEqual([{ id: 'c1', name: 'Coca Cola' }, { id: 'c2', name: 'Coca Zero' }])
  })

  it('"ver o cardápio todo" amplia a lista (só ativos) daquela pendência', () => {
    const [choice] = buildPendingChoices(review({ ambiguous_items: ['coca'], ambiguous_candidates: [cocas] }), menu, new Set(['ambiguous:0']))
    expect(choice.narrowed).toBe(false)
    expect(choice.options.map(option => option.id)).toEqual(['c1', 'c2', 'f1', 'x1'])
  })

  it('sem sugestão, ou com sugestão que não existe mais no cardápio, mostra o cardápio todo', () => {
    const none = buildPendingChoices(review({ ambiguous_items: ['coca'], ambiguous_candidates: [[]] }), menu, new Set())
    expect(none[0].narrowed).toBe(false)
    const gone = buildPendingChoices(review({ ambiguous_items: ['coca'], ambiguous_candidates: [[{ product_id: 'zzz', display_name: 'Sumiu' }]] }), menu, new Set())
    expect(gone[0].narrowed).toBe(false)
    const old = buildPendingChoices(review({ ambiguous_items: ['coca'] }), menu, new Set()) // resposta de backend sem o campo
    expect(old[0].narrowed).toBe(false)
  })

  it('ignora sugestão de produto inativo e mantém os demais', () => {
    const near = [...cocas, { product_id: 'off', display_name: 'Suco' }]
    const [choice] = buildPendingChoices(review({ ambiguous_items: ['coca'], ambiguous_candidates: [near] }), menu, new Set())
    expect(choice.options.map(option => option.id)).toEqual(['c1', 'c2'])
  })

  it('usa o nome do cardápio local, não o enviado pelo servidor', () => {
    const [choice] = buildPendingChoices(review({ ambiguous_items: ['coca'], ambiguous_candidates: [[{ product_id: 'c1', display_name: 'nome velho' }]] }), menu, new Set())
    expect(choice.options).toEqual([{ id: 'c1', name: 'Coca Cola' }])
  })

  it('não encontrado e recusado sempre mostram o cardápio todo, na ordem esperada', () => {
    const choices = buildPendingChoices(review({
      items_not_found: ['pizza'], ambiguous_items: ['coca'], ambiguous_candidates: [cocas],
      invalid_items: [{ client_item_ref: 'audio-3', code: 'PRODUCT_UNAVAILABLE' }],
    }), menu, new Set())
    expect(choices.map(choice => choice.ref)).toEqual(['missing:0', 'ambiguous:0', 'audio-3'])
    expect(choices.map(choice => choice.narrowed)).toEqual([false, true, false])
    expect(choices[0].options).toHaveLength(4)
  })

  it('cada ambíguo recebe as suas próprias sugestões', () => {
    const choices = buildPendingChoices(review({
      ambiguous_items: ['coca', 'x'], ambiguous_candidates: [cocas, [{ product_id: 'x1', display_name: 'X-Bacon' }, { product_id: 'f1', display_name: 'Fanta' }]],
    }), menu, new Set(['ambiguous:0']))
    expect(choices[0].narrowed).toBe(false)
    expect(choices[1].options.map(option => option.id)).toEqual(['x1', 'f1'])
  })

  it('recusado: mostra a frase pronta e oferece só os parecidos disponíveis', () => {
    const [choice] = buildPendingChoices(review({
      invalid_items: [{
        client_item_ref: 'audio-1', code: 'OUT_OF_STOCK', message: 'Tem “Coca Zero 300ml”, mas está em falta no momento.',
        alternatives: [{ product_id: 'c1', display_name: 'Coca Cola' }, { product_id: 'off', display_name: 'Suco' }],
      }],
    }), menu, new Set())
    expect(choice).toMatchObject({ ref: 'audio-1', kind: 'invalid', label: 'Tem “Coca Zero 300ml”, mas está em falta no momento.', narrowed: true })
    expect(choice.options).toEqual([{ id: 'c1', name: 'Coca Cola' }])
  })

  it('recusado sem mensagem ou sem alternativas: cai no código e no cardápio todo', () => {
    const [choice] = buildPendingChoices(review({ invalid_items: [{ client_item_ref: 'audio-1', code: 'PRODUCT_UNAVAILABLE' }] }), menu, new Set())
    expect(choice).toMatchObject({ kind: 'invalid', label: 'PRODUCT_UNAVAILABLE', narrowed: false })
    expect(choice.options).toHaveLength(4)
  })

  it('classifica cada tipo de pendência', () => {
    const kinds = buildPendingChoices(review({
      items_not_found: ['pizza'], ambiguous_items: ['coca'], invalid_items: [{ client_item_ref: 'a', code: 'X' }],
    }), menu, new Set()).map(choice => choice.kind)
    expect(kinds).toEqual(['missing', 'ambiguous', 'invalid'])
  })
})

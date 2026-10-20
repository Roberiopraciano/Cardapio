import type { Period, Product } from '../types'
import type { VoiceItem, VoiceReview } from '../services/voiceOrderApi'
import { calcCartItemSubtotal } from './pricing'
import { getProductStatus } from './stock'
import { buildCartComplements } from '../store/cartStore'

/**
 * Converte os itens confirmados pelo servidor em itens de carrinho.
 *
 * Revalida tudo contra o cardápio que o app tem agora: se algo mudou (produto
 * indisponível, opcional removido, preço diferente do que o servidor calculou),
 * lança erro e NADA entra no carrinho — o chamador não deve adicionar parcial.
 */
export function prepareVoiceCartItems(items: VoiceItem[], products: Product[], periods: Period[]) {
  return items.map(item => {
    const product = products.find(candidate => candidate._id === item.product_id)
    if (!product || getProductStatus(product, periods) !== 'available') throw new Error('Produto alterado')
    const selected = new Map(product.complementsGroups.map(group => [group._id, (item.selected_options[group._id] ?? []).map(id => {
      const option = group.products.find(candidate => candidate._id === id)
      if (!option) throw new Error('Opcional alterado')
      return { item: option as unknown as Product, qty: 1 }
    })]))
    const complements = buildCartComplements(selected, product.complementsGroups)
    const subtotal = calcCartItemSubtotal({ product, quantity: item.quantity, note: item.preparation_note, addedComplements: complements, subTotal: 0 })
    if (Math.round(subtotal * 100) !== item.subtotal_minor) throw new Error('Preço alterado')
    return { product, complements, note: item.preparation_note, quantity: item.quantity }
  })
}

export interface PendingChoice {
  ref: string
  label: string
  /** missing = não achou; ambiguous = vários servem; invalid = achou, mas não pode ser pedido (label é a frase pronta) */
  kind: 'missing' | 'ambiguous' | 'invalid'
  options: Array<{ id: string; name: string }>
  /** true quando a lista traz só os produtos parecidos (e não o cardápio todo) */
  narrowed: boolean
}

/**
 * Pendências da revisão (não encontrado, ambíguo, recusado) com as opções de cada uma.
 *
 * Ambíguo mostra só os parecidos que o servidor sugeriu ("coca" → as Cocas), desde que ainda estejam
 * ativos no cardápio local. Sem sugestão válida, ou se o cliente pedir, cai no cardápio todo.
 */
export function buildPendingChoices(review: VoiceReview, products: Product[], showAll: ReadonlySet<string>): PendingChoice[] {
  const active = products.filter(product => product.active)
  const everything = active.map(product => ({ id: product._id, name: product.name }))
  const entries = [
    ...review.items_not_found.map((label, index) => ({ ref: `missing:${index}`, label, kind: 'missing' as const, near: undefined })),
    ...review.ambiguous_items.map((label, index) => ({ ref: `ambiguous:${index}`, label, kind: 'ambiguous' as const, near: review.ambiguous_candidates?.[index] })),
    ...review.invalid_items.map(item => ({ ref: item.client_item_ref, label: item.message ?? item.code, kind: 'invalid' as const, near: item.alternatives })),
  ]
  return entries.map(({ ref, label, kind, near }) => {
    const similar = (near ?? []).flatMap(candidate => {
      const product = active.find(item => item._id === candidate.product_id)
      return product ? [{ id: product._id, name: product.name }] : []
    })
    const narrowed = similar.length > 0 && !showAll.has(ref)
    return { ref, label, kind, options: narrowed ? similar : everything, narrowed }
  })
}

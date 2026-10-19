import type { Period, Product } from '../types'
import type { VoiceItem } from '../services/voiceOrderApi'
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

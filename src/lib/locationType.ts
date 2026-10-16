import type { AppMode } from '../types'

/**
 * `locationType` do pedido: o canal de venda, igual ao do cadastro de produto.
 * Totem = 8 não aparece aqui — o cardápio nunca é o totem.
 */
export const LOCATION_TYPE: Record<AppMode, number> = {
  balcao: 1,
  mesa: 2,
  delivery: 4,
}

export function locationTypeFor(mode: AppMode): number {
  return LOCATION_TYPE[mode]
}

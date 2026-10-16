import type { CardapioPaymentChannel } from '../types'

export type PaymentMethodKey = 'online' | 'card' | 'cash' | 'pix' | 'totem' | 'caixa'

export interface PaymentOption {
  key: PaymentMethodKey
  label: string
  /** Sempre `false` por enquanto: o cardápio não cobra, a forma é só registro. */
  prepaid: boolean
  /** Código da forma no PDV, quando cadastrado. */
  pdvCode?: string
}

const METHODS: { key: PaymentMethodKey; label: string }[] = [
  { key: 'online', label: 'Online' },
  { key: 'card', label: 'Cartão' },
  { key: 'cash', label: 'Dinheiro' },
  { key: 'pix', label: 'Pix' },
  { key: 'totem', label: 'Pagar no totem' },
  { key: 'caixa', label: 'Pagar no caixa' },
]

/**
 * Formas de pagamento marcadas na API para a modalidade. Só as ligadas entram.
 *
 * O `prepaid` cadastrado na API é IGNORADO de propósito: enquanto o pagamento
 * não acontece no app, nada é pré-pago. Para voltar a respeitá-lo, trocar o
 * `false` abaixo por `channel.prepaid?.[m.key] === true`.
 */
export function paymentOptionsFor(channel?: CardapioPaymentChannel): PaymentOption[] {
  if (!channel || channel.enabled === false) return []
  return METHODS
    .filter((m) => channel[m.key] === true)
    .map((m) => ({
      ...m,
      label: channel.names?.[m.key]?.trim() || m.label,
      pdvCode: channel.pdvCodes?.[m.key]?.trim() || undefined,
      prepaid: false,
    }))
}

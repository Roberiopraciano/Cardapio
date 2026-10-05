/**
 * Payload do POST api/orders (e do POST api/totem-handoffs), no formato que o
 * Laravel de produção aceita **hoje** — o mesmo que o totem Flutter manda.
 *
 * Por que espelhar o totem em vez de o backend se adaptar ao cardápio:
 *
 * - O validador exige `change`, `deliveryFee`, `totemVersion`, `installments`,
 *   `simpleAuth` e `totemClientName` preenchidos. Faltando qualquer um, o pedido
 *   leva 422 e não entra na cozinha.
 * - O PDV lê o pedido por `GET api/pdv/events/orders`, que espera complementos
 *   **planos** (um objeto por item escolhido, com `_id` do produto) e soma
 *   `price × quantity` de cada um. O formato agrupado por grupo que o cardápio
 *   mandava chegava com nome nulo e sem subitens na comanda.
 * - `additionalInfo` é texto ("Consumir no local" / "Para levar"), não objeto.
 *
 * Campos que o backend ainda não grava (`origin`, `comanda`, `whereConsume`)
 * seguem no payload: são ignorados hoje e passam a valer quando o backend os
 * aceitar, sem mudar o app.
 */

import type { CartItem, CartComplement, Offer, WhereConsume } from '../types'
import { calcCartItemSubtotal } from './pricing'

/** Identifica o canal no campo que o totem usa para a versão do app. */
export const CARDAPIO_VERSION = 'cardapio-online/1'

/**
 * `simpleAuth` é obrigatório no validador, mas nenhuma branch tem
 * `settingsWeb.simpleAuth` hoje e o backend não confere o valor. Sem um
 * marcador, todo pedido do cardápio levava 422. Quando a branch configurar o
 * dela, é o dela que vai.
 */
export const SIMPLE_AUTH_FALLBACK = 'cardapio'

export interface OrderPayloadInput {
  branchId: string
  simpleAuth?: string
  consumptioncode: string
  consumptionint: number
  items: CartItem[]
  subtotal: number
  total: number
  client: { name: string; phone: string; cpf: string; email?: string }
  askEmail: boolean
  comanda?: string
  note?: string
  mode: 'mesa' | 'balcao'
  whereConsume: WhereConsume
  payVia: 'local' | 'totem'
  tmProduto?: number
  coupon?: Offer | null
}

/** Complemento como o totem manda — ver o comentário do arquivo. */
export interface FlatComplement {
  _id: string
  name: string
  /** Preço **efetivo** por unidade do produto: fração já aplicada. */
  price: number
  /** Por unidade do produto (o backend multiplica pela quantidade do item). */
  quantity: number
  complementGroupId: string
  complementGroupName: string
  unitFraction: number
  fraction: string
  fractionText: string
  isPackaging: boolean
}

export function flattenComplement(c: CartComplement): FlatComplement {
  const unit = c.unitFraction ?? 1
  const parts = unit > 0 && unit < 1 ? Math.round(1 / unit) : 1
  return {
    _id: c._id,
    name: c.name,
    // O cardápio guarda o preço inteiro + unitFraction; o PDV só soma
    // price × quantity. Mandar o inteiro cobraria a pizza meia como inteira
    price: round2(c.price * unit),
    quantity: c.quantity,
    complementGroupId: c.groupId,
    complementGroupName: c.groupName,
    unitFraction: unit,
    fraction: `1/${parts}`,
    fractionText: parts === 1 ? 'Inteira' : `1/${parts}`,
    isPackaging: c.isPackaging === true,
  }
}

export function buildOrderPayload(i: OrderPayloadInput) {
  const localLabel = i.mode === 'balcao' ? 'Pagar no balcão' : 'Pagar na mesa'
  const label = i.payVia === 'totem' ? 'Pagar no totem' : localLabel
  const email = i.askEmail ? i.client.email?.trim() : ''
  const comanda = i.comanda?.trim()

  return {
    branch: i.branchId,
    simpleAuth: i.simpleAuth?.trim() || SIMPLE_AUTH_FALLBACK,
    totemVersion: CARDAPIO_VERSION,
    consumptioncode: i.consumptioncode,
    consumptionint: i.consumptionint,
    locationType: 8,
    amount: i.total,
    subtotal: i.subtotal,
    total: i.total,
    change: 0,
    deliveryFee: 0,
    installments: 1,
    // O cardápio não processa pagamento no pinpad. Enviar null explicitamente
    // evita que consumidores do pedido interpretem a ausência como array vazio.
    pinpadResponse: null,
    // Obrigatório no backend. Sem nome (branch com identificação opcional), a
    // senha/mesa é o que a cozinha chama — o totem faz o mesmo
    totemClientName: i.client.name.trim()
      || (i.mode === 'mesa' ? `Mesa ${i.consumptioncode}` : i.consumptioncode),
    phone: i.client.phone.trim() || null,
    // Só dígitos — o backend não deve receber máscara
    cpfCustomer: i.client.cpf.replace(/\D/g, '') || null,
    totemNF_email: email || null,
    ...(comanda ? { comanda } : {}),
    note: i.note?.trim() || null,
    // Nada é pago no cardápio: `prepaid: false` sempre. No totem é o que
    // impede a máquina de pular a cobrança
    paymentMethod: {
      type: i.payVia === 'totem' ? 'totem' : i.mode === 'balcao' ? 'counter' : 'table',
      kind: 'Cardápio',
      label,
      prepaid: false,
      data: { name: label, active: true, change: 0, method: 'Money' },
    },
    additionalInfo: i.whereConsume === 'OnLocal' ? 'Consumir no local' : 'Para levar',
    whereConsume: i.whereConsume,
    origin: 'cardapio',
    ...(i.tmProduto && i.tmProduto > 0 ? { tmProduto: i.tmProduto } : {}),
    coupon: i.coupon ? {
      _id: i.coupon._id, title: i.coupon.title,
      triggers: i.coupon.triggers, rules: i.coupon.rules, rewards: i.coupon.rewards,
    } : null,
    items: i.items.map((item) => ({
      product: item.product._id,
      name: item.product.name,
      originalPrice: item.product.price ?? 0,
      price: item.product.price ?? 0,
      amount: calcCartItemSubtotal(item),
      quantity: item.quantity,
      note: item.note?.trim() || null,
      complements: item.addedComplements.map(flattenComplement),
    })),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

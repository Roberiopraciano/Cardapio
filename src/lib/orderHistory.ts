/**
 * Histórico de pedidos, guardado no aparelho do cliente.
 *
 * Por que local e não só via API: no balcão não existe conta de mesa para
 * consultar, e mesmo na mesa o cliente pode querer ver o que pediu depois que
 * a comanda fechou. O registro local é dele, não do restaurante.
 *
 * Guarda o essencial para reconhecer o pedido — nunca CPF nem telefone: é
 * histórico de consumo, não cadastro.
 */

import { scopedKey, readScopedWithMigration } from './storageScope'

/** Prefixada por company — ver storageScope.ts. */
const BASE = 'cardapio_order_history'
const MAX = 40

export interface HistoryItem {
  name: string
  quantity: number
  amount: number
  /** Complementos já formatados para exibição */
  extras: string[]
}

/**
 * Onde o pagamento foi resolvido, **do ponto de vista do app**.
 *
 * A distinção que importa: só `app` e `pos` são pagamentos que o app acompanha e
 * pode confirmar. Nos demais o dinheiro passa por fora — caixa, garçom, TEF do
 * totem, entregador — e o app **não tem como saber** se foi pago.
 */
export type PaymentVia =
  | 'app'          // gateway no próprio celular
  | 'pos'          // cobrança empurrada para maquininha
  | 'totem'        // senha do pedido, pago no TEF do totem
  | 'counter'      // caixa / balcão
  | 'waiter'       // com o garçom, no fechamento da mesa
  | 'on_delivery'  // na entrega

export type PaymentMethod = 'pix' | 'credit' | 'debit' | 'cash' | 'voucher'

export interface HistoryPayment {
  via: PaymentVia
  /**
   * **Ausente = o app não sabe.** Nunca preencher com `paid` por dedução: o
   * cliente que lê "Pago" e não pagou passa pela porta e leva um constrangimento
   * na frente da fila. Só o que o app confirmou entra aqui.
   */
  status?: 'paid' | 'pending' | 'failed'
  method?: PaymentMethod
  /** ISO da confirmação — só quando `status: 'paid'`. */
  paidAt?: string
  /** Senha do pedido, quando ele foi entregue ao totem ou ao balcão. */
  handoffCode?: string
  /** Troco pedido, em pagamento na entrega em dinheiro. */
  changeFor?: number
}

/** Endereço como estava **no momento do pedido** — cópia, não referência. */
export interface HistoryAddress {
  label?: string
  street?: string
  number?: string
  complement?: string
  district?: string
  city?: string
  reference?: string
  /** Taxa cobrada neste pedido. Frete muda; a do pedido é histórica. */
  deliveryFee?: number
}

export interface HistoryOrder {
  /** ISO do envio, gravado no cliente */
  at: string
  branchId: string
  branchName?: string
  mode: 'mesa' | 'balcao' | 'delivery' | 'cartao'
  table?: string
  consumptioncode: string
  consumptionint?: number
  comanda?: string
  total: number
  items: HistoryItem[]
  /** `_id` devolvido pelo backend, quando vier */
  orderId?: string
  /** Como foi pago — ou por onde saiu, quando o app não acompanha. */
  payment?: HistoryPayment
  /**
   * Endereço da entrega, **copiado** no envio.
   *
   * Cópia e não referência: se o cliente editar "Casa" depois, o pedido de ontem
   * passaria a mostrar o endereço novo e o histórico deixaria de bater com o que
   * foi entregue de fato.
   */
  address?: HistoryAddress
}

export function loadOrderHistory(): HistoryOrder[] {
  try {
    const raw = readScopedWithMigration(BASE)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((o) => o && typeof o === 'object' && 'consumptioncode' in o)
  } catch {
    return []
  }
}

/** Grava no topo e corta a cauda — o aparelho do cliente não é arquivo morto. */
export function pushOrderHistory(order: HistoryOrder): void {
  try {
    const list = [order, ...loadOrderHistory()].slice(0, MAX)
    localStorage.setItem(scopedKey(BASE), JSON.stringify(list))
  } catch {
    // Cota estourada ou modo privado: o pedido já foi enviado, então perder o
    // histórico local não pode derrubar nada
  }
}

export function clearOrderHistory(): void {
  try {
    localStorage.removeItem(scopedKey(BASE))
  } catch {}
}

/** Só os pedidos desta branch — o cliente pode ter usado outros restaurantes. */
export function historyForBranch(branchId: string): HistoryOrder[] {
  return loadOrderHistory().filter((o) => o.branchId === branchId)
}

export interface HistoryGroup {
  /** Chave estável (`2026-07-30`), para `key` de lista e para colapsar. */
  key: string
  /** "Hoje", "Ontem", "quarta, 22 de julho" */
  label: string
  orders: HistoryOrder[]
  total: number
}

/**
 * Data local do pedido no formato `AAAA-MM-DD`.
 *
 * **Local, nunca `toISOString()`.** Em GMT-3 um pedido das 21h30 vira o dia
 * seguinte em UTC, e o cliente veria "Ontem" num pedido que fez à noite — o mesmo
 * erro que já custou caro no horário de funcionamento.
 */
function localDayKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function dayLabel(d: Date, now: Date): string {
  const key = localDayKey(d)
  if (key === localDayKey(now)) return 'Hoje'

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (key === localDayKey(yesterday)) return 'Ontem'

  // Dentro da semana o dia da semana ajuda mais que a data ("foi na sexta")
  const days = Math.round((+new Date(localDayKey(now)) - +new Date(key)) / 86_400_000)
  if (days < 7) {
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

/**
 * Agrupa por dia, do mais recente para o mais antigo.
 *
 * **Por data e não por branch**, ainda que a branch também apareça na lista: o
 * cliente típico usa uma unidade só, e agrupar por branch daria um único grupo
 * colapsável — um toque a mais para não revelar nada. Data é como se procura
 * pedido passado ("foi ontem"). A branch entra como etiqueta na linha, e só
 * quando há mais de uma no histórico (ver `hasMultipleBranches`).
 *
 * @param now injetado para o teste não depender do relógio
 */
export function groupByDay(orders: HistoryOrder[], now: Date = new Date()): HistoryGroup[] {
  const map = new Map<string, HistoryGroup>()

  for (const o of orders) {
    const d = new Date(o.at)
    if (Number.isNaN(d.getTime())) continue
    const key = localDayKey(d)

    const g = map.get(key)
    if (g) {
      g.orders.push(o)
      g.total += o.total
    } else {
      map.set(key, { key, label: dayLabel(d, now), orders: [o], total: o.total })
    }
  }

  const groups = [...map.values()].sort((a, b) => b.key.localeCompare(a.key))
  for (const g of groups) g.orders.sort((a, b) => b.at.localeCompare(a.at))
  return groups
}

/** Mostrar a etiqueta de unidade só faz sentido se houver mais de uma. */
export function hasMultipleBranches(orders: HistoryOrder[]): boolean {
  return new Set(orders.map((o) => o.branchId)).size > 1
}

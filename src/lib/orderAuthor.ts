/**
 * Quem lançou o pedido: o próprio cliente pelo cardápio, ou um atendente.
 *
 * O cardápio envia `origin: 'cardapio'` no POST api/orders (ver Checkout).
 * Pedido que chega sem esse marcador entrou por outro canal — PDV, totem ou
 * comanda do garçom.
 *
 * Isso é inferência, não um campo dedicado do backend. Enquanto o Laravel não
 * expuser o autor de forma explícita, um pedido lançado pelo garçom aparece
 * como "Atendente" apenas por não ter vindo do cardápio.
 */

import type { TableOrder } from '../api/client'

export type OrderAuthor = 'cliente' | 'atendente'

/** Valor enviado em `origin` pelo próprio cardápio. */
export const CARDAPIO_ORIGIN = 'cardapio'

export function orderAuthor(order: TableOrder): OrderAuthor {
  return order.origin === CARDAPIO_ORIGIN ? 'cliente' : 'atendente'
}

/** Nome a exibir junto do selo de autoria, quando o backend mandar algum. */
export function orderAuthorName(order: TableOrder): string | null {
  if (orderAuthor(order) === 'cliente') {
    return order.totemClientName?.trim() || null
  }
  const from = (v: unknown): string | null => {
    if (typeof v === 'string') return v.trim() || null
    if (v && typeof v === 'object' && 'name' in v) {
      const n = (v as { name?: string }).name
      return n?.trim() || null
    }
    return null
  }
  return from(order.operator) ?? from(order.user)
}

export const AUTHOR_LABEL: Record<OrderAuthor, string> = {
  cliente: 'Cliente',
  atendente: 'Atendente',
}

// ─── Identificar quem na mesa ────────────────────────────────────────────────

const onlyDigits = (v?: string) => (v ?? '').replace(/\D/g, '')

/** "•••• 4321" — nunca exibimos o telefone inteiro de ninguém na conta da mesa,
 *  que é uma tela que qualquer pessoa sentada ali consegue abrir. */
export function maskPhone(phone?: string): string | null {
  const d = onlyDigits(phone)
  if (d.length < 4) return null
  return `•••• ${d.slice(-4)}`
}

/**
 * O pedido é meu?
 *
 * Compara pelo telefone quando os dois lados têm — é o que identifica a pessoa.
 * Sem telefone, cai para o nome, que é frágil: dois "João" na mesma mesa viram
 * a mesma pessoa. Por isso o nome só decide quando não há telefone algum.
 */
export function isMyOrder(
  order: TableOrder,
  me: { name?: string; phone?: string },
): boolean {
  if (orderAuthor(order) !== 'cliente') return false

  const myPhone = onlyDigits(me.phone)
  const orderPhone = onlyDigits(order.phone)
  if (myPhone.length >= 8 && orderPhone.length >= 8) {
    return myPhone === orderPhone
  }

  const myName = (me.name ?? '').trim().toLocaleLowerCase('pt-BR')
  const orderName = (order.totemClientName ?? '').trim().toLocaleLowerCase('pt-BR')
  return myName.length > 0 && myName === orderName
}

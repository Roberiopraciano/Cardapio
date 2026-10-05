/**
 * Pré-pedido "Pagar no totem" em andamento, guardado na aba.
 *
 * O QR precisa sobreviver a um refresh: o cliente está andando até o totem com
 * o celular na mão, a tela apaga, o navegador recarrega — e o carrinho já foi
 * esvaziado. Sem isto, ele chega na máquina sem nada para mostrar.
 *
 * Guarda também o carrinho de quando o QR foi gerado, para "refazer o pedido"
 * se o QR expirar ou o cliente desistir, sem montar tudo de novo.
 */

import type { TotemHandoff } from '../api/client'
import type { CartItem } from '../types'

const KEY = 'cardapio_totem_handoff'

export interface TotemHandoffSession {
  handoff: TotemHandoff
  branchId: string
  /** Senha única: Cardápio, digitação no totem, PDV e acompanhamento. */
  consumptioncode: string
  /** Contrato de acompanhamento recebido da unidade; nunca usa IDs Mongo. */
  orderTrackingUrlTemplate?: string
  trackingBranchIdDesk?: string
  trackingCompanyIdDesk?: string
  orderTrackingEnabled?: boolean
  total: number
  /** Carrinho no momento do envio — só para restaurar, nunca para cobrar. */
  items: CartItem[]
}

export function saveTotemHandoff(s: TotemHandoffSession): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)) } catch { /* modo privado */ }
}

export function loadTotemHandoff(): TotemHandoffSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as TotemHandoffSession
    return s?.handoff?.token && s.handoff.qr ? s : null
  } catch {
    return null
  }
}

export function clearTotemHandoff(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* idem */ }
}

/** Segundos até expirar, nunca negativo. `now` injetável para teste. */
export function secondsLeft(expiresAt: string, now: number = Date.now()): number {
  const t = Date.parse(expiresAt)
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((t - now) / 1000))
}

/** `mm:ss` */
export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

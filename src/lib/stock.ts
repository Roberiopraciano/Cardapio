/**
 * Stock, período do produto e labels de status.
 * Espelho de CategoryFilterHelper.dart
 */

import type { Product, Period, ProductStatus, Stock } from '../types'
import { isPeriodOpen } from './businessPeriod'

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

// ─── Stock ────────────────────────────────────────────────────────────────────

/**
 * Item esgotado? Serve para `Product` e para `ComplementItem` — os dois têm
 * `stock` no mesmo formato, e o complemento também acaba.
 *
 * Duas fontes independentes, nesta ordem:
 *
 * 1. **`totemSoldOut`** — o operador marcou "esgotado" no painel. Vence tudo:
 *    é decisão humana e não depende de haver controle de estoque. No cadastro
 *    real é comum vir `{ active: false, totemSoldOut: true }` — a casa não
 *    conta quantidade daquele item, mas acabou hoje.
 * 2. **`currentQuantity`** — só vale quando `active === true`, ou seja, quando
 *    a casa realmente controla a quantidade daquele item.
 *
 * ⚠️ Checar `active` **antes** de `totemSoldOut` (como estava) fazia o item
 * marcado à mão aparecer disponível: o `return` de "sem controle de estoque"
 * acontecia primeiro e engolia a marcação do operador.
 */
export function isOutOfStock(item: { stock?: Stock | null }): boolean {
  const s = item.stock
  if (!s) return false

  if (s.totemSoldOut === true) return true

  if (s.active === false) return false   // sem controle → disponível
  return s.currentQuantity <= 0
}

// ─── Período do produto ───────────────────────────────────────────────────────

/**
 * Produto com `relatedPeriod` só aparece dentro da janela do período.
 * Delega para `isPeriodOpen` — a comparação de horário mora num lugar só,
 * senão o mesmo bug de fuso volta a aparecer em dois arquivos.
 */
export function checkValidPeriod(periods: Period[], periodId: string): boolean {
  if (!periodId) return true
  const period = periods.find((p) => p._id === periodId)
  if (!period) return true
  return isPeriodOpen(period)
}

/** Retorna label "Disponível HH:mm–HH:mm" ou null */
export function getPeriodLabel(product: Product, periods: Period[]): string | null {
  if (!product.relatedPeriod) return null
  const period = periods.find((p) => p._id === product.relatedPeriod)
  if (!period) return null
  const day = DAY_NAMES[new Date().getDay()]
  const slots = period.period?.[day]
  if (!slots?.length) return null
  const times = slots.map((s) => `${s.from.slice(0,5)}–${s.to.slice(0,5)}`).join(', ')
  return `Disponível hoje: ${times}`
}

// ─── Status ───────────────────────────────────────────────────────────────────

export function getProductStatus(product: Product, periods: Period[]): ProductStatus {
  if (!product.active) return 'inactive'
  if (isOutOfStock(product)) return 'out_of_stock'
  if (product.relatedPeriod && !checkValidPeriod(periods, product.relatedPeriod)) {
    return 'unavailable_period'
  }
  return 'available'
}

export function isProductOrderable(product: Product, periods: Period[]): boolean {
  return getProductStatus(product, periods) === 'available'
}

export interface StatusBadge { label: string; className: string }

export function getStatusBadge(status: ProductStatus): StatusBadge | null {
  if (status === 'out_of_stock') return { label: 'Esgotado', className: 'bg-gray-100 text-gray-500' }
  if (status === 'unavailable_period') return { label: 'Fora do horário', className: 'bg-amber-50 text-amber-700' }
  return null
}

export function filterProductsForDisplay(products: Product[], periods: Period[]): Product[] {
  return products.filter((p) => {
    if (!p.active) return false
    if (p.relatedPeriod && !checkValidPeriod(periods, p.relatedPeriod)) return false
    return true
  })
}

// ─── Coupon ───────────────────────────────────────────────────────────────────

import type { Offer } from '../types'

/** Busca cupom pelo código em `offer.triggers.coupon.code` */
export function findCouponByCode(offers: Offer[], code: string): Offer | null {
  if (!code.trim()) return null
  const upper = code.trim().toUpperCase()
  return offers.find((o) => {
    const coupon = (o.triggers as Record<string,unknown>)?.['coupon'] as Record<string,unknown> | undefined
    return coupon?.['code']?.toString().toUpperCase() === upper
  }) ?? null
}

export function applyCouponDiscount(total: number, coupon: Offer): number {
  const dt = coupon.rewards?.discountType
  if (!dt) return total
  if (dt.type === 2) return Math.max(0, total - dt.value)
  if (dt.type === 1) return total * ((100 - dt.value) / 100)
  return total
}

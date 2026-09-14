/**
 * Analytics — Meta Pixel + Google Analytics 4
 *
 * Modelo "os dois em paralelo":
 *  - Branch vê os seus eventos no seu próprio Pixel/GA4
 *  - Plataforma vê tudo consolidado no ID global (.env)
 *
 * IDs:
 *  - Branch: branch.settingsWeb.metaPixelId / .gaId
 *  - Plataforma: VITE_META_PIXEL_ID / VITE_GA_MEASUREMENT_ID
 *
 * Sempre verifica consentimento antes de disparar.
 */

import { isGranted } from './consent'

// ─── Tipos globais ─────────────────────────────────────────────────────────────

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    _fbq?: unknown
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

export interface AnalyticsConfig {
  branchPixelId?: string
  branchGaId?: string
  platformPixelId?: string
  platformGaId?: string
}

let _config: AnalyticsConfig = {}
let _initialized = false

// ─── Inicialização ─────────────────────────────────────────────────────────────

/** Chama no boot após consentimento GRANTED */
export function initAnalytics(config: AnalyticsConfig): void {
  _config = config
  if (_initialized) return
  _initialized = true

  const hasFb = config.branchPixelId || config.platformPixelId
  const hasGa = config.branchGaId || config.platformGaId

  if (hasFb) initMetaPixel(config)
  if (hasGa) initGA4(config)
}

// ─── Meta Pixel ────────────────────────────────────────────────────────────────

function initMetaPixel(config: AnalyticsConfig): void {
  // Injeta o script do Meta Pixel
  if (!window.fbq) {
    const n = function (...args: unknown[]) {
      ;(n as unknown as { q: unknown[] }).q = (n as unknown as { q: unknown[] }).q || []
      ;(n as unknown as { q: unknown[] }).q.push(args)
    } as unknown as (...args: unknown[]) => void
    ;(n as unknown as { loaded: boolean }).loaded = true
    ;(n as unknown as { version: string }).version = '2.0'
    window.fbq = n
    window._fbq = n
    const s = document.createElement('script')
    s.async = true
    s.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.appendChild(s)
  }

  // Inicializa ambos os IDs (todos os eventos vão para os dois automaticamente)
  if (config.platformPixelId) window.fbq?.('init', config.platformPixelId)
  if (config.branchPixelId && config.branchPixelId !== config.platformPixelId) {
    window.fbq?.('init', config.branchPixelId)
  }
  window.fbq?.('track', 'PageView')
}

// ─── GA4 ───────────────────────────────────────────────────────────────────────

function initGA4(config: AnalyticsConfig): void {
  // Injeta gtag.js usando o primeiro ID disponível
  const firstId = config.platformGaId || config.branchGaId
  if (!firstId) return

  window.dataLayer = window.dataLayer || []
  window.gtag = function (...args: unknown[]) {
    window.dataLayer!.push(args)
  }
  window.gtag('js', new Date())

  // Configura os dois IDs (eventos automáticos vão para ambos)
  if (config.platformGaId) window.gtag('config', config.platformGaId, { send_page_view: true })
  if (config.branchGaId && config.branchGaId !== config.platformGaId) {
    window.gtag('config', config.branchGaId, { send_page_view: true })
  }

  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${firstId}`
  document.head.appendChild(s)
}

// ─── Eventos ───────────────────────────────────────────────────────────────────

interface TrackItem {
  id: string
  name: string
  price: number
  quantity?: number
  category?: string
}

interface TrackProps {
  value?: number
  currency?: string
  content_name?: string
  content_ids?: string[]
  items?: TrackItem[]
  search_string?: string
  order_id?: string
  coupon?: string
  num_items?: number
  mode?: string
  [key: string]: unknown
}

function guard(): boolean {
  return isGranted() && _initialized
}

/** Dispara evento no Meta Pixel + GA4 em paralelo */
export function track(eventName: string, props: TrackProps = {}): void {
  if (!guard()) return
  trackFb(eventName, props)
  trackGa(eventName, props)
}

// ─── Meta Pixel events ────────────────────────────────────────────────────────

const FB_EVENT_MAP: Record<string, string> = {
  page_view: 'PageView',
  view_item_list: 'ViewContent',
  view_item: 'ViewContent',
  add_to_cart: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
  purchase: 'Purchase',
  search: 'Search',
  select_promotion: 'AddToCart', // sem equivalente direto
}

function trackFb(eventName: string, props: TrackProps): void {
  if (!window.fbq) return
  const fbEvent = FB_EVENT_MAP[eventName] ?? eventName
  const fbParams: Record<string, unknown> = {
    currency: props.currency ?? 'BRL',
    value: props.value ?? 0,
    content_type: 'product',
  }
  if (props.content_name) fbParams['content_name'] = props.content_name
  if (props.content_ids) fbParams['content_ids'] = props.content_ids
  if (props.search_string) fbParams['search_string'] = props.search_string
  if (props.items) {
    fbParams['contents'] = props.items.map((i) => ({
      id: i.id, quantity: i.quantity ?? 1,
    }))
    fbParams['num_items'] = props.items.reduce((a, i) => a + (i.quantity ?? 1), 0)
  }
  window.fbq('track', fbEvent, fbParams)
}

// ─── GA4 events ───────────────────────────────────────────────────────────────

function trackGa(eventName: string, props: TrackProps): void {
  if (!window.gtag) return
  const gaParams: Record<string, unknown> = {}
  if (props.value !== undefined) gaParams['value'] = props.value
  if (props.currency) gaParams['currency'] = props.currency
  if (props.order_id) gaParams['transaction_id'] = props.order_id
  if (props.coupon) gaParams['coupon'] = props.coupon
  if (props.search_string) gaParams['search_term'] = props.search_string
  if (props.mode) gaParams['item_list_name'] = props.mode
  if (props.items) {
    gaParams['items'] = props.items.map((i) => ({
      item_id: i.id,
      item_name: i.name,
      price: i.price,
      quantity: i.quantity ?? 1,
      item_category: i.category,
    }))
  }
  window.gtag('event', eventName, gaParams)
}

// ─── Helpers para cada tela ────────────────────────────────────────────────────

import type { Product, CartItem } from '../types'

export const Analytics = {
  pageView() {
    track('page_view', {})
  },
  viewMenu(branchName: string) {
    track('view_item_list', { content_name: branchName })
  },
  viewProduct(product: Product) {
    track('view_item', {
      value: product.price,
      currency: 'BRL',
      content_name: product.name,
      content_ids: [product._id],
      items: [{ id: product._id, name: product.name, price: product.price }],
    })
  },
  addToCart(product: Product, value: number, qty: number) {
    track('add_to_cart', {
      value,
      currency: 'BRL',
      content_name: product.name,
      content_ids: [product._id],
      items: [{ id: product._id, name: product.name, price: product.price, quantity: qty }],
    })
  },
  beginCheckout(items: CartItem[], total: number) {
    track('begin_checkout', {
      value: total,
      currency: 'BRL',
      num_items: items.length,
      items: items.map((i) => ({
        id: i.product._id, name: i.product.name,
        price: i.product.price, quantity: i.quantity,
        category: i.product.category,
      })),
    })
  },
  applyCoupon(code: string, total: number) {
    track('select_promotion', { coupon: code, value: total, currency: 'BRL' })
  },
  purchase(items: CartItem[], total: number, orderId: string, mode: string) {
    track('purchase', {
      value: total,
      currency: 'BRL',
      order_id: orderId,
      mode,
      items: items.map((i) => ({
        id: i.product._id, name: i.product.name,
        price: i.product.price, quantity: i.quantity,
        category: i.product.category,
      })),
    })
  },
  search(term: string) {
    track('search', { search_string: term })
  },
}

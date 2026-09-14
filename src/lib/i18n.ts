/**
 * Idioma do cardápio.
 *
 * Duas camadas independentes:
 *
 * 1. **Textos da interface** — o dicionário deste arquivo.
 * 2. **Nomes de produto/categoria** — vêm do backend em `translations.en` /
 *    `translations.es`. Quando a tradução do item não existe, cai para o
 *    português: melhor o cliente ler "Frango crocante" do que uma linha vazia.
 *
 * Ligado por branch: `settingsWeb.languages` (ex: `["pt","es","en"]`).
 * Com menos de dois idiomas o seletor nem aparece.
 */

export type Lang = 'pt' | 'es' | 'en'

export const DEFAULT_LANG: Lang = 'pt'
export const ALL_LANGS: Lang[] = ['pt', 'es', 'en']

export const LANG_META: Record<Lang, { flag: string; label: string; short: string }> = {
  pt: { flag: '🇧🇷', label: 'Português', short: 'PT' },
  es: { flag: '🇪🇸', label: 'Español', short: 'ES' },
  en: { flag: '🇺🇸', label: 'English', short: 'EN' },
}

const STORAGE_KEY = 'cardapio_lang'

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (ALL_LANGS as string[]).includes(v)
}

export function loadLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isLang(v) ? v : null
  } catch {
    return null
  }
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // storage indisponível — o idioma vale só para esta sessão
  }
}

/** Idioma do aparelho, se for um dos suportados pela branch. */
export function detectLang(available: Lang[]): Lang {
  const nav = (navigator.languages ?? [navigator.language ?? '']).map((l) =>
    l.toLowerCase().split('-')[0],
  )
  for (const code of nav) {
    if (isLang(code) && available.includes(code)) return code
  }
  return available[0] ?? DEFAULT_LANG
}

/** Lê `settingsWeb.languages`; devolve `['pt']` quando não configurado. */
export function branchLanguages(settingsWeb: Record<string, unknown> | undefined): Lang[] {
  const raw = settingsWeb?.['languages']
  if (!Array.isArray(raw)) return [DEFAULT_LANG]
  const list = raw.filter(isLang)
  if (list.length === 0) return [DEFAULT_LANG]
  // Português sempre primeiro — é o idioma dos dados de origem
  return [...new Set<Lang>([DEFAULT_LANG, ...list])].filter((l) => list.includes(l) || l === DEFAULT_LANG)
}

// ─── Dicionário da interface ─────────────────────────────────────────────────

type Dict = Record<string, string>

const PT: Dict = {
  'where.title': 'Como vai ser?',
  'where.subtitle': 'Escolha antes de montar o pedido — muda o preço de alguns itens.',
  'where.eatHere': 'Comer aqui',
  'where.eatHereHint': 'Servimos na mesa, em louça',
  'where.takeAway': 'Para levar',
  'where.takeAwayHint': 'Embalamos para viagem',
  'where.canChange': 'Dá para trocar depois, na hora de revisar o pedido.',

  'menu.search': 'Buscar produto...',
  'menu.searchAria': 'Buscar',
  'menu.results': 'resultado',
  'menu.resultsPlural': 'resultados',
  'menu.noResults': 'Nenhum resultado para',
  'menu.emptyCategory': 'Nenhum item disponível em',
  'menu.viewCart': 'Ver carrinho',
  'menu.table': 'Mesa',
  'menu.callWaiter': 'Chamar garçom',
  'menu.waiterCalled': '🛎 Garçom chamado! Aguarde um momento.',
  'menu.waiterError': 'Não foi possível chamar o garçom. Tente novamente.',
  'menu.bill': 'Ver a conta',

  'product.required': 'obrigatório',
  'product.optional': 'opcional',
  'product.fraction': 'fracionado',
  'product.choose1': 'escolha 1',
  'product.chooseUpTo': 'até',
  'product.fractions': 'frações',
  'product.others': 'Outros',
  'product.note': 'Adicionar observação',
  'product.add': 'Adicionar',
  'product.update': 'Atualizar',
  'product.notFound': 'Produto indisponível',
  'product.backToMenu': 'Voltar ao cardápio',

  'checkout.title': 'Revisar pedido',
  'checkout.items': 'itens',
  'checkout.howConsume': 'Como vai consumir?',
  'checkout.eatHere': '🍽 Comer aqui',
  'checkout.takeAway': '🥡 Para levar',
  'checkout.coupon': 'Cupom de desconto',
  'checkout.couponOff': 'Cupons ainda não estão disponíveis neste cardápio.',
  'checkout.note': 'Observação geral',
  'checkout.optional': '(opcional)',
  'checkout.identification': 'Identificação',
  'checkout.name': 'Seu nome',
  'checkout.phone': 'Telefone',
  'checkout.cpf': 'CPF (opcional)',
  'checkout.total': 'Total',
  'checkout.subtotal': 'Subtotal',
  'checkout.discount': 'Desconto',
  'checkout.send': 'Fazer pedido',
  'checkout.sending': 'Enviando...',
  'checkout.error': 'Erro ao enviar pedido. Tente novamente.',

  'confirm.title': 'Pedido enviado!',
  'confirm.password': 'Sua senha',
  'confirm.order': 'Pedido',
  'confirm.more': '+ Pedir mais itens',
  'confirm.bill': '🧾 Ver a conta',
  'confirm.back': 'Voltar ao cardápio',

  'bill.title': 'Conta',
  'bill.detailed': 'Detalhada',
  'bill.summary': 'Resumida',
  'bill.you': 'Você',
  'bill.staff': 'Atendente',
  'bill.someone': 'Alguém da mesa',
  'bill.perPerson': 'Consumo por pessoa',
  'bill.serviceTax': 'Taxa de serviço',
  'bill.empty': 'Nenhum pedido ainda',

  'error.qrInvalid': 'QR Code inválido',
  'error.scan': 'Escanear QR Code',
  'error.retry': 'Tentar novamente',
  'common.close': 'Fechar',
  'common.cancel': 'Cancelar',
}

const ES: Dict = {
  'where.title': '¿Cómo va a ser?',
  'where.subtitle': 'Elija antes de armar el pedido — cambia el precio de algunos artículos.',
  'where.eatHere': 'Comer aquí',
  'where.eatHereHint': 'Servimos en la mesa, en vajilla',
  'where.takeAway': 'Para llevar',
  'where.takeAwayHint': 'Empacamos para llevar',
  'where.canChange': 'Puede cambiarlo después, al revisar el pedido.',

  'menu.search': 'Buscar producto...',
  'menu.searchAria': 'Buscar',
  'menu.results': 'resultado',
  'menu.resultsPlural': 'resultados',
  'menu.noResults': 'Ningún resultado para',
  'menu.emptyCategory': 'Ningún artículo disponible en',
  'menu.viewCart': 'Ver carrito',
  'menu.table': 'Mesa',
  'menu.callWaiter': 'Llamar al mesero',
  'menu.waiterCalled': '🛎 ¡Mesero llamado! Espere un momento.',
  'menu.waiterError': 'No se pudo llamar al mesero. Inténtelo de nuevo.',
  'menu.bill': 'Ver la cuenta',

  'product.required': 'obligatorio',
  'product.optional': 'opcional',
  'product.fraction': 'fraccionado',
  'product.choose1': 'elija 1',
  'product.chooseUpTo': 'hasta',
  'product.fractions': 'fracciones',
  'product.others': 'Otros',
  'product.note': 'Agregar observación',
  'product.add': 'Agregar',
  'product.update': 'Actualizar',
  'product.notFound': 'Producto no disponible',
  'product.backToMenu': 'Volver al menú',

  'checkout.title': 'Revisar pedido',
  'checkout.items': 'artículos',
  'checkout.howConsume': '¿Cómo va a consumir?',
  'checkout.eatHere': '🍽 Comer aquí',
  'checkout.takeAway': '🥡 Para llevar',
  'checkout.coupon': 'Cupón de descuento',
  'checkout.couponOff': 'Los cupones aún no están disponibles en este menú.',
  'checkout.note': 'Observación general',
  'checkout.optional': '(opcional)',
  'checkout.identification': 'Identificación',
  'checkout.name': 'Su nombre',
  'checkout.phone': 'Teléfono',
  'checkout.cpf': 'CPF (opcional)',
  'checkout.total': 'Total',
  'checkout.subtotal': 'Subtotal',
  'checkout.discount': 'Descuento',
  'checkout.send': 'Hacer pedido',
  'checkout.sending': 'Enviando...',
  'checkout.error': 'Error al enviar el pedido. Inténtelo de nuevo.',

  'confirm.title': '¡Pedido enviado!',
  'confirm.password': 'Su turno',
  'confirm.order': 'Pedido',
  'confirm.more': '+ Pedir más artículos',
  'confirm.bill': '🧾 Ver la cuenta',
  'confirm.back': 'Volver al menú',

  'bill.title': 'Cuenta',
  'bill.detailed': 'Detallada',
  'bill.summary': 'Resumida',
  'bill.you': 'Usted',
  'bill.staff': 'Mesero',
  'bill.someone': 'Alguien de la mesa',
  'bill.perPerson': 'Consumo por persona',
  'bill.serviceTax': 'Cargo por servicio',
  'bill.empty': 'Ningún pedido todavía',

  'error.qrInvalid': 'Código QR inválido',
  'error.scan': 'Escanear código QR',
  'error.retry': 'Intentar de nuevo',
  'common.close': 'Cerrar',
  'common.cancel': 'Cancelar',
}

const EN: Dict = {
  'where.title': 'How will it be?',
  'where.subtitle': 'Choose before building your order — it changes some prices.',
  'where.eatHere': 'Eat here',
  'where.eatHereHint': 'Served at your table, on china',
  'where.takeAway': 'Take away',
  'where.takeAwayHint': 'Packed to go',
  'where.canChange': 'You can change this later, when reviewing the order.',

  'menu.search': 'Search product...',
  'menu.searchAria': 'Search',
  'menu.results': 'result',
  'menu.resultsPlural': 'results',
  'menu.noResults': 'No results for',
  'menu.emptyCategory': 'No items available in',
  'menu.viewCart': 'View cart',
  'menu.table': 'Table',
  'menu.callWaiter': 'Call waiter',
  'menu.waiterCalled': '🛎 Waiter called! Please wait a moment.',
  'menu.waiterError': 'Could not call the waiter. Please try again.',
  'menu.bill': 'View bill',

  'product.required': 'required',
  'product.optional': 'optional',
  'product.fraction': 'split',
  'product.choose1': 'choose 1',
  'product.chooseUpTo': 'up to',
  'product.fractions': 'portions',
  'product.others': 'Others',
  'product.note': 'Add a note',
  'product.add': 'Add',
  'product.update': 'Update',
  'product.notFound': 'Product unavailable',
  'product.backToMenu': 'Back to menu',

  'checkout.title': 'Review order',
  'checkout.items': 'items',
  'checkout.howConsume': 'How will you have it?',
  'checkout.eatHere': '🍽 Eat here',
  'checkout.takeAway': '🥡 Take away',
  'checkout.coupon': 'Discount coupon',
  'checkout.couponOff': 'Coupons are not available on this menu yet.',
  'checkout.note': 'General note',
  'checkout.optional': '(optional)',
  'checkout.identification': 'Identification',
  'checkout.name': 'Your name',
  'checkout.phone': 'Phone',
  'checkout.cpf': 'Tax ID (optional)',
  'checkout.total': 'Total',
  'checkout.subtotal': 'Subtotal',
  'checkout.discount': 'Discount',
  'checkout.send': 'Place order',
  'checkout.sending': 'Sending...',
  'checkout.error': 'Could not send the order. Please try again.',

  'confirm.title': 'Order sent!',
  'confirm.password': 'Your number',
  'confirm.order': 'Order',
  'confirm.more': '+ Order more items',
  'confirm.bill': '🧾 View bill',
  'confirm.back': 'Back to menu',

  'bill.title': 'Bill',
  'bill.detailed': 'Detailed',
  'bill.summary': 'Summary',
  'bill.you': 'You',
  'bill.staff': 'Staff',
  'bill.someone': 'Someone at the table',
  'bill.perPerson': 'Spend per person',
  'bill.serviceTax': 'Service charge',
  'bill.empty': 'No orders yet',

  'error.qrInvalid': 'Invalid QR Code',
  'error.scan': 'Scan QR Code',
  'error.retry': 'Try again',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
}

const DICTS: Record<Lang, Dict> = { pt: PT, es: ES, en: EN }

/** Texto da interface. Chave desconhecida devolve o português, nunca a chave crua. */
export function translate(lang: Lang, key: string): string {
  return DICTS[lang]?.[key] ?? PT[key] ?? key
}

// ─── Conteúdo vindo do backend ───────────────────────────────────────────────

interface Translated {
  name?: string
  description?: string
}

/**
 * `translations` no payload é `{ en: {...}, es: {...} }` — mas às vezes chega
 * como array vazio quando o item nunca foi traduzido. Por isso a checagem de
 * tipo antes de indexar.
 */
export function pickTranslation(
  translations: unknown,
  lang: Lang,
): Translated | null {
  if (lang === DEFAULT_LANG) return null
  if (!translations || typeof translations !== 'object' || Array.isArray(translations)) return null
  const entry = (translations as Record<string, unknown>)[lang]
  if (!entry || typeof entry !== 'object') return null
  return entry as Translated
}

/** Nome traduzido, ou o original quando não há tradução preenchida. */
export function translatedName(
  original: string,
  translations: unknown,
  lang: Lang,
): string {
  const t = pickTranslation(translations, lang)
  return t?.name?.trim() || original
}

export function translatedDescription(
  original: string | undefined,
  translations: unknown,
  lang: Lang,
): string | undefined {
  const t = pickTranslation(translations, lang)
  return t?.description?.trim() || original
}

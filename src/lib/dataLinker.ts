/**
 * Espelho de socket.dart:
 * - handleCategories, handleProducts, handleComplements,
 *   handleComplementsGroupsCategory, linkAllDataStructures
 *
 * Recebe JSON bruto da API e devolve estruturas tipadas e vinculadas.
 */

import type {
  Category,
  Product,
  ComplementsGroup,
  ComplementItem,
  ComplementsGroupCategory,
  Offer,
  Period,
} from '../types'
import { extractImageUrl } from './imageCache'

// ─── Parsers (equivalentes aos fromJson do Flutter) ──────────────────────────

export function parseCategory(raw: Record<string, unknown>): Category | null {
  // Ignora desabilitadas ou sem produtos (mesmo filtro de handleCategories)
  if (raw['disabled'] === true) return null

  return {
    _id: (raw['_id'] as string) ?? '',
    name: (raw['name'] as string) ?? '',
    image: extractImageUrl(raw),
    seq: (raw['seq'] as number) ?? 0,
    staticImage: raw['staticImage'] as Category['staticImage'],
    categoriaTotemImg: raw['staticImageTotem'] as string | undefined,
    products: [],
    translations: raw['translations'],
  }
}

export function parseComplementsGroup(raw: Record<string, unknown>): ComplementsGroup {
  const rules = (raw['rules'] as Record<string, unknown>) ?? {}
  return {
    _id: (raw['_id'] as string) ?? '',
    title: (raw['title'] as string) ?? '',
    items: ((raw['items'] as string[]) ?? []),
    products: [],                                          // preenchido por linkAll
    minQuantity: (rules['minQuantity'] as number) ?? 0,
    maxQuantity: (rules['maxQuantity'] as number) ?? 1,
    obrigatory: (rules['mandatory'] as boolean) ?? false,
    ingredients: (raw['ingredients'] as boolean) ?? false,
    isTakeawayPackaging: (raw['isTakeawayPackaging'] as boolean) ?? false,
    autoAdd: (raw['autoAdd'] as boolean) ?? false,
    settingsTotem: raw['settingsTotem'] as Record<string, unknown>,
  }
}

/**
 * A API devolve `name`; o campo `title` nunca existiu nessa collection e o
 * array `groups` que se supunha aqui também não — quem aponta para a
 * subcategoria é o item, via `complementGroupCategory`.
 */
export function parseComplementsGroupCategory(
  raw: Record<string, unknown>
): ComplementsGroupCategory {
  return {
    _id: (raw['_id'] as string) ?? '',
    name: (raw['name'] as string) ?? (raw['title'] as string) ?? '',
    seq: (raw['seq'] as number) ?? 0,
    active: (raw['active'] as boolean) ?? true,
  }
}

export function parseProduct(
  raw: Record<string, unknown>,
  locationTypeFilter = 8
): Product | null {
  if (raw['active'] === false) return null

  // Filtro locationType — mesmo de updateProductsStock
  const locationTypes = raw['locationTypes'] as number[] | undefined
  if (locationTypes && locationTypes.length > 0) {
    if (!locationTypes.includes(locationTypeFilter)) return null
  }

  const complementsId: string[] = ((raw['complementsGroups'] as string[]) ?? []).map(String)

  return {
    _id: (raw['_id'] as string) ?? '',
    name: (raw['name'] as string) ?? '',
    description: raw['description'] as string | undefined,
    category: (raw['category'] as string) ?? '',
    price: (raw['price'] as number) ?? 0,
    offerprice: raw['offerprice'] as number | undefined,
    originalPrice: undefined,
    active: (raw['active'] as boolean) ?? true,
    seq: (raw['seq'] as number) ?? 0,
    stock: raw['stock'] as import('../types').Stock | null | undefined,
    code: (raw['code'] as string) ?? '',
    barCode: raw['barCode'] as string | undefined,
    peopleCount:
      typeof raw['peopleCount'] === 'number'
        ? raw['peopleCount']
        : parseInt(String(raw['peopleCount'] ?? '0')) || 0,
    relatedPeriod: raw['relatedPeriod'] as string | undefined,
    locationTypes,
    complementsGroups: [],   // preenchido por linkAll
    complementsId,
    complementGroupCategoryID: (raw['complementGroupCategory'] as string) ?? '',
    complementGroupCategory: undefined,
    settingsTotem: raw['settingsTotem'] as Record<string, unknown>,
    updatedAt: raw['updatedAt'] as string | undefined,
    image: extractImageUrl(raw),
    images: raw['sliderHeader'] as Record<string, unknown> | undefined,
    staticImage: raw['staticImage'] as Product['staticImage'],
    sliderHeader: raw['sliderHeader'] as Product['sliderHeader'],
    suggestionCategory: (raw['suggestionCategory'] as string) ?? 'global',
    customSuggestions: (raw['customSuggestions'] as string[]) ?? [],
    productOffer: undefined,
    // `{ en: {...}, es: {...} }` — mas chega como `[]` em item nunca traduzido
    translations: raw['translations'],
  }
}

export function parsePeriod(raw: Record<string, unknown>): Period {
  return {
    _id: (raw['_id'] as string) ?? '',
    branch: (raw['branch'] as string) ?? '',
    title: (raw['title'] as string) ?? '',
    period: (raw['period'] as Record<string, Array<{ from: string; to: string }>>) ?? {},
  }
}

export function parseOffer(raw: Record<string, unknown>): Offer {
  return {
    _id: (raw['_id'] as string) ?? '',
    title: (raw['title'] as string) ?? '',
    triggers: (raw['triggers'] as Record<string, unknown>) ?? {},
    rules: (raw['rules'] as Record<string, unknown>) ?? {},
    rewards: (raw['rewards'] as Offer['rewards']) ?? {},
    disabled: (raw['disabled'] as boolean) ?? false,
    period: raw['period'] as Record<string, unknown> | undefined,
    match: raw['match'] as string | undefined,
  }
}

// ─── LinkAllDataStructures — porta fiel de socket.dart ───────────────────────

export function linkAllDataStructures(
  products: Product[],
  groups: ComplementsGroup[],
  groupCategories: ComplementsGroupCategory[],
  offers: Offer[]
): void {
  const productMap = new Map(products.map((p) => [p._id, p]))
  const groupMap = new Map(groups.map((g) => [g._id, g]))
  const catMap = new Map(groupCategories.map((c) => [c._id, c]))

  // 1. Resolve complementGroupCategory nos produtos
  for (const product of products) {
    if (product.complementGroupCategoryID) {
      product.complementGroupCategory = catMap.get(product.complementGroupCategoryID)
    }
  }

  // 2. Preenche group.products com os objetos reais (via items[])
  for (const group of groups) {
    group.products = []
    for (const itemId of group.items) {
      const p = productMap.get(itemId)
      if (p && !group.products.find((x) => x._id === p._id)) {
        group.products.push(p as unknown as ComplementItem)
      }
    }
  }

  // 3. Preenche product.complementsGroups com os objetos reais (via complementsId[])
  for (const product of products) {
    product.complementsGroups = []
    for (const groupId of product.complementsId) {
      const g = groupMap.get(groupId)
      if (g && !product.complementsGroups.find((x) => x._id === g._id)) {
        product.complementsGroups.push(g)
      }
    }
  }

  // 4. Vincula ofertas aos produtos (por triggers.product ou similar)
  for (const offer of offers) {
    const triggers = offer.triggers as Record<string, unknown>
    const productId = triggers['product'] as string | undefined
    if (productId) {
      const p = productMap.get(productId)
      if (p) p.productOffer = offer
    }
  }
}

// ─── Montagem completa do menu ────────────────────────────────────────────────

export interface MenuData {
  categories: Category[]
  products: Product[]
  groups: ComplementsGroup[]
  groupCategories: ComplementsGroupCategory[]
  offers: Offer[]
  periods: Period[]
}

export function buildMenuData(
  rawCategories: Record<string, unknown>[],
  rawProducts: Record<string, unknown>[],
  rawGroups: Record<string, unknown>[],
  rawGroupCategories: Record<string, unknown>[],
  rawOffers: Record<string, unknown>[],
  rawPeriods: Record<string, unknown>[],
  branchId: string
): MenuData {
  // Parse
  const categories = rawCategories
    .map(parseCategory)
    .filter(Boolean) as Category[]
  categories.sort((a, b) => a.seq - b.seq)

  const products = rawProducts
    .map((r) => parseProduct(r))
    .filter(Boolean) as Product[]

  const groups = rawGroups.map(parseComplementsGroup)
  const groupCategories = rawGroupCategories.map(parseComplementsGroupCategory)
  const offers = rawOffers.map(parseOffer)
  const periods = rawPeriods
    .map(parsePeriod)
    .filter((p) => p.branch === branchId)

  // Link tudo (espelho de linkAllDataStructures)
  linkAllDataStructures(products, groups, groupCategories, offers)

  // Associa produtos às categorias (espelho de handleProducts)
  const catMap = new Map(categories.map((c) => [c._id, c]))
  for (const product of products) {
    if (product.category) {
      const cat = catMap.get(product.category)
      if (cat && !cat.products.find((p) => p._id === product._id)) {
        cat.products.push(product)
      }
    }
  }

  // Ordena produtos por seq dentro de cada categoria
  for (const cat of categories) {
    cat.products.sort((a, b) => a.seq - b.seq)
  }

  // Remove categorias sem produtos ativos
  const activeCategories = categories.filter(
    (c) => c.products.some((p) => p.active)
  )

  return { categories: activeCategories, products, groups, groupCategories, offers, periods }
}

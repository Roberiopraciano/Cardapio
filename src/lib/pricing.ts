/**
 * Lógica de precificação de complementos.
 *
 * Regras de label:
 * 1. Grupo obrigatório → referência = mais barato do grupo
 *    igual/mais barato → "incluso" (sem preço abaixo do nome)
 *    mais caro         → "+R$ diff"  (sem preço abaixo do nome)
 * 2. Grupo opcional    → preço cheio abaixo do nome
 * 3. Grupo fracionado  → contador de frações; preço por fração
 *
 * Preço com oferta: usa productOffer.rewards.discountType se presente
 *
 * ## O piso é um número só
 *
 * `getCardPrice` = base + Σ franquia dos grupos obrigatórios. Esse é **o** preço
 * do produto: o do card no grid, o que a tela do produto abre exibindo, e o que
 * o carrinho cobra quando o cliente escolhe os itens inclusos.
 *
 * A partir dele, só **acréscimos** entram (`groupCharge`) — nunca descontos.
 *
 * ⚠️ Duas contas já discordaram sobre isso: o card somava a franquia ao base e o
 * carrinho partia do base cru **e ainda descontava** o mais barato. O mesmo combo
 * era anunciado a R$35,90 e cobrado a R$29,40. Hoje `calcUnitPrice` é a única
 * porta de entrada — tela do produto, carrinho e checkout chamam ela.
 */

import type { Product, ComplementsGroup, Offer, CartItem, CartComplement } from '../types'

// ─── Formatação ────────────────────────────────────────────────────────────────

export function formatCurrency(v: number): string {
  return 'R$' + v.toFixed(2).replace('.', ',')
}

// ─── Oferta ────────────────────────────────────────────────────────────────────

/** Espelho de totalWithCoupons — aplica desconto do productOffer */
export function applyOffer(basePrice: number, offer: Offer | undefined): number {
  if (!offer || !offer.rewards?.discountType) return basePrice
  const { type, value } = offer.rewards.discountType
  if (type === 2) return Math.max(0, basePrice - value)       // fixo
  if (type === 1) return basePrice * ((100 - value) / 100)   // percentual
  return basePrice
}

/** Preço efetivo do produto (offerprice > productOffer > price) */
export function effectivePrice(product: Product): number {
  if (product.offerprice !== undefined && product.offerprice < (product.price ?? 0)) {
    return product.offerprice
  }
  if (product.productOffer) {
    return applyOffer(product.price ?? 0, product.productOffer)
  }
  return product.price ?? 0
}

/** Desconto em reais para exibição */
export function discountAmount(product: Product): number {
  return (product.price ?? 0) - effectivePrice(product)
}

export function hasDiscount(product: Product): boolean {
  return discountAmount(product) > 0
}

// ─── Complementos ──────────────────────────────────────────────────────────────

export function cheapestInGroup(group: ComplementsGroup): number {
  if (group.products.length === 0) return 0
  return Math.min(...group.products.map((p) => (p as unknown as { price: number }).price ?? 0))
}

export type ComplementLabelType = 'incluso' | 'diff' | 'price' | 'free'

export interface ComplementPriceLabel {
  type: ComplementLabelType
  value: number
  text: string
  hideBasePrice: boolean
}

export function getComplementPriceLabel(
  itemPrice: number,
  group: ComplementsGroup
): ComplementPriceLabel {
  if (group.ingredients) {
    const u = itemPrice / group.maxQuantity
    return { type: 'price', value: u, text: `${formatCurrency(u)}/fração`, hideBasePrice: false }
  }
  if (!group.obrigatory) {
    if (itemPrice <= 0) return { type: 'free', value: 0, text: 'grátis', hideBasePrice: false }
    return { type: 'price', value: itemPrice, text: formatCurrency(itemPrice), hideBasePrice: false }
  }
  const cheapest = cheapestInGroup(group)
  const diff = itemPrice - cheapest
  if (diff <= 0) return { type: 'incluso', value: 0, text: 'incluso', hideBasePrice: true }
  return { type: 'diff', value: diff, text: `+${formatCurrency(diff)}`, hideBasePrice: true }
}

// ─── Preço no card da lista ────────────────────────────────────────────────────

/**
 * Preço-piso do produto: `base + Σ franquia dos grupos obrigatórios`.
 *
 * É o número exibido no card do grid **sem** "a partir de", porque não é um
 * mínimo teórico: é o que o cliente paga escolhendo os itens inclusos. O card e
 * a tela do produto abrem no mesmo valor, e daí ele só sobe se o cliente trocar
 * por algo mais caro.
 *
 * O card é onde o cliente decide se abre o produto. Errar para baixo é promessa
 * que o carrinho desmente — foi o que acontecia quando a franquia somava o mais
 * barato **uma vez** por grupo em vez de `× minQuantity`.
 */
export function getCardPrice(product: Product): number {
  let price = effectivePrice(product)
  for (const g of product.complementsGroups) {
    price += includedAllowance(g)
  }
  return price
}

/**
 * Quanto de complemento o preço-piso do produto **já cobre** neste grupo.
 *
 * É a franquia do "incluso": num grupo obrigatório que exige 1 bebida, o piso
 * embute 1× a bebida mais barata. Escolher justamente essa não acrescenta nada;
 * escolher uma mais cara acrescenta só a diferença.
 *
 * Existe como função própria porque **duas contas dependiam dela e discordavam**:
 * `getCardPrice` somava a franquia ao base, enquanto o subtotal do carrinho
 * partia do base cru e ainda descontava o mais barato de cada unidade. O card
 * prometia R$35,90 e o carrinho fechava R$29,40 no mesmo combo — a bebida
 * inclusa saía de graça **duas vezes**. Agora as duas leem daqui.
 *
 * `× minQuantity`, não "uma vez por grupo": grupo que exige 2 escolhas embute 2.
 * Grupo fracionado entra rateado (`preço ÷ maxQuantity`), senão uma pizza com
 * base R$0 — onde o sabor carrega o valor — mostraria piso R$0,00.
 */
export function includedAllowance(group: ComplementsGroup): number {
  if (!group.obrigatory || group.minQuantity < 1) return 0

  const cheapest = cheapestInGroup(group)

  if (group.ingredients) {
    const max = group.maxQuantity > 0 ? group.maxQuantity : 1
    return (cheapest / max) * group.minQuantity
  }
  return cheapest * group.minQuantity
}

// ─── Fracionado ────────────────────────────────────────────────────────────────

export function getFractionText(max: number): string {
  return ({ 1: 'inteira', 2: '½', 3: '⅓', 4: '¼', 5: '⅕', 6: '⅙' } as Record<number, string>)[max]
    ?? `1/${max}`
}

export function getFractionalSubLabel(price: number, max: number): string {
  return `${formatCurrency(price)} inteira · cada ${getFractionText(max)} = ${formatCurrency(price / max)}`
}

export function fracPrice(price: number, qty: number, max: number): number {
  return (price / max) * qty
}

// ─── Carrinho ─────────────────────────────────────────────────────────────────

/**
 * Preço de um complemento dentro do carrinho.
 *
 * Em grupo fracionado (`ingredients: true`, ex: pizza meia a meia), o item é
 * gravado com o preço **inteiro** e `unitFraction = 1/maxQuantity`. Ignorar
 * essa fração cobrava a pizza inteira por cada metade: duas metades de R$60 e
 * R$70 viravam R$130 em vez de R$65 — e a tela do produto já exibia R$65, então
 * o cliente descobria a diferença só no total.
 *
 * Em grupo normal `unitFraction` é 1 e a conta não muda.
 */
export function complementPrice(c: CartComplement): number {
  return c.price * c.quantity * (c.unitFraction ?? 1)
}

/**
 * Quanto um **grupo inteiro** acrescenta acima do preço-piso do produto.
 *
 * O piso (`getCardPrice`) já embute a franquia do grupo, então aqui só entra o
 * que passa dela: trocar a Coca 300ml (R$6,50, inclusa) pela 500ml (R$8,50)
 * acrescenta R$2,00, não R$8,50.
 *
 * **Por grupo, e não por complemento**, porque a franquia é do grupo. Descontar
 * o mais barato de **cada unidade** dava desconto repetido: num grupo obrigatório
 * "escolha 1, até 3", marcar 3 refrigerantes do mesmo preço somava zero e o
 * cliente levava três bebidas pelo preço de uma.
 *
 * Grupo **opcional** não tem franquia (`includedAllowance` devolve 0) e soma o
 * preço cheio. Grupo **fracionado** entra pelo rateio de `complementPrice`.
 */
export function groupCharge(
  group: ComplementsGroup | undefined,
  comps: CartComplement[],
): number {
  const gross = comps.reduce((acc, c) => acc + complementPrice(c), 0)
  // Grupo desconhecido (embalagem de viagem injetada, cadastro removido no meio
  // do pedido): sem franquia para descontar, cobra cheio
  if (!group) return gross
  return Math.max(0, gross - includedAllowance(group))
}

/**
 * Preço de **uma** unidade do item, com os complementos escolhidos.
 *
 * Fonte única do número: a tela do produto e o carrinho chamam esta mesma
 * função. Antes cada lado montava a própria soma, e por isso o cabeçalho do
 * produto e o rodapé mostravam valores diferentes para o mesmo item.
 *
 * O piso é `getCardPrice`, não `effectivePrice` — é o valor anunciado no grid.
 * Começar no base cru fazia o preço **subir** ao marcar o item incluso (R$29,40
 * → R$35,90), como se o "incluso" custasse dinheiro.
 */
export function calcUnitPrice(product: Product, comps: CartComplement[]): number {
  const groups = product.complementsGroups

  // Agrupa por grupo: a franquia se aplica ao conjunto, não a cada escolha
  const byGroup = new Map<string, CartComplement[]>()
  for (const c of comps) {
    const list = byGroup.get(c.groupId)
    if (list) list.push(c)
    else byGroup.set(c.groupId, [c])
  }

  let extras = 0
  for (const [groupId, list] of byGroup) {
    extras += groupCharge(groups.find((g) => g._id === groupId), list)
  }

  return getCardPrice(product) + extras
}

export function calcCartItemSubtotal(item: CartItem): number {
  return calcUnitPrice(item.product, item.addedComplements) * item.quantity
}

export function calcCartTotal(items: CartItem[]): number {
  return items.reduce((acc, i) => acc + calcCartItemSubtotal(i), 0)
}

/** Valor das embalagens automáticas para viagem, já considerando quantidades. */
export function calcPackagingTotal(items: CartItem[]): number {
  return items.reduce((cartTotal, item) => {
    const itemPackaging = item.addedComplements
      .filter((complement) => complement.isPackaging === true)
      .reduce((total, complement) => total + complementPrice(complement), 0)

    return cartTotal + (itemPackaging * item.quantity)
  }, 0)
}

/** tmProduto = total / Σ(peopleCount × qty) — espelho de _calcularTmProduto() */
export function calcTmProduto(items: CartItem[], total: number): number {
  const people = items.reduce((acc, i) => acc + (i.product.peopleCount || 0) * i.quantity, 0)
  if (people <= 0) return 0
  return parseFloat((total / people).toFixed(2))
}

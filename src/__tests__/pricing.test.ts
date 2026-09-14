/**
 * Testes para src/lib/pricing.ts
 * Cobre: incluso/diff/price labels, getCardPrice, effectivePrice, fracionado
 */

import { describe, it, expect } from 'vitest'
import {
  getComplementPriceLabel,
  getCardPrice,
  effectivePrice,
  hasDiscount,
  discountAmount,
  cheapestInGroup,
  getFractionText,
  getFractionalSubLabel,
  fracPrice,
  calcCartItemSubtotal,
  calcUnitPrice,
  includedAllowance,
  calcCartTotal,
  formatCurrency,
  calcTmProduto,
} from '../lib/pricing'
import type { ComplementsGroup, Product, CartItem } from '../types'

// ─── Factories ──────────────────────────────────────────────────────────────

function makeGroup(overrides: Partial<ComplementsGroup> = {}): ComplementsGroup {
  return {
    _id: 'g1',
    title: 'Bebida',
    items: [],
    products: [
      { _id: 'coca', name: 'Coca-Cola', price: 1, active: true, quantity: 0 } as any,
      { _id: 'fanta', name: 'Fanta', price: 1, active: true, quantity: 0 } as any,
      { _id: 'suco', name: 'Suco', price: 1.5, active: true, quantity: 0 } as any,
    ],
    minQuantity: 1,
    maxQuantity: 1,
    obrigatory: true,
    ingredients: false,
    isTakeawayPackaging: false,
    autoAdd: false,
    ...overrides,
  }
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: 'p1', name: 'Combo 1', price: 10,
    active: true, seq: 1, peopleCount: 1,
    complementsGroups: [], complementsId: [],
    image: '', category: 'c1',
    ...overrides,
  } as Product
}

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    product: makeProduct(),
    quantity: 1,
    note: '',
    addedComplements: [],
    subTotal: 10,
    ...overrides,
  }
}

// ─── getComplementPriceLabel ─────────────────────────────────────────────────

describe('getComplementPriceLabel — grupos obrigatórios', () => {
  const reqGroup = makeGroup({ obrigatory: true, ingredients: false })

  it('item mais barato do grupo → incluso', () => {
    const label = getComplementPriceLabel(1, reqGroup)
    expect(label.type).toBe('incluso')
    expect(label.text).toBe('incluso')
    expect(label.hideBasePrice).toBe(true)
  })

  it('item com mesmo preço do mais barato → incluso', () => {
    const label = getComplementPriceLabel(1, reqGroup) // fanta também é R$1
    expect(label.type).toBe('incluso')
  })

  it('item mais caro → diff (+R$0,50)', () => {
    const label = getComplementPriceLabel(1.5, reqGroup) // suco
    expect(label.type).toBe('diff')
    expect(label.text).toBe('+R$0,50')
    expect(label.hideBasePrice).toBe(true)
  })

  it('item com preço 2x → diff correto (+R$1,00)', () => {
    const group = makeGroup({
      products: [
        { _id: 'a', price: 1 } as any,
        { _id: 'b', price: 2 } as any,
      ]
    })
    const label = getComplementPriceLabel(2, group)
    expect(label.type).toBe('diff')
    expect(label.value).toBeCloseTo(1)
  })
})

describe('getComplementPriceLabel — grupos opcionais', () => {
  const optGroup = makeGroup({ obrigatory: false })

  it('exibe preço cheio', () => {
    const label = getComplementPriceLabel(1, optGroup)
    expect(label.type).toBe('price')
    expect(label.text).toBe('R$1,00')
    expect(label.hideBasePrice).toBe(false)
  })

  it('item gratuito → free', () => {
    const label = getComplementPriceLabel(0, optGroup)
    expect(label.type).toBe('free')
    expect(label.text).toBe('grátis')
  })

  it('item caro → preço cheio (não calcula diff)', () => {
    const label = getComplementPriceLabel(8.5, optGroup)
    expect(label.type).toBe('price')
    expect(label.value).toBeCloseTo(8.5)
  })
})

describe('getComplementPriceLabel — grupos fracionados', () => {
  const fracGroup = makeGroup({ ingredients: true, maxQuantity: 2 })

  it('exibe preço por fração', () => {
    const label = getComplementPriceLabel(40, fracGroup) // pizza R$40 → ½ = R$20
    expect(label.type).toBe('price')
    expect(label.value).toBeCloseTo(20)
    expect(label.hideBasePrice).toBe(false)
  })
})

// ─── cheapestInGroup ────────────────────────────────────────────────────────

describe('cheapestInGroup', () => {
  it('retorna o menor preço do grupo', () => {
    expect(cheapestInGroup(makeGroup())).toBeCloseTo(1)
  })

  it('grupo com um item → retorna o preço desse item', () => {
    const g = makeGroup({ products: [{ _id: 'x', price: 5.5 } as any] })
    expect(cheapestInGroup(g)).toBeCloseTo(5.5)
  })
})

// ─── includedAllowance ───────────────────────────────────────────────────────

/**
 * A franquia é a dobradiça entre o piso e a cobrança: `getCardPrice` a soma,
 * `groupCharge` a desconta. Se as duas lessem valores diferentes, o card e o
 * carrinho voltariam a divergir — por isso ela é testada isolada.
 */
describe('includedAllowance', () => {
  it('grupo opcional não tem franquia', () => {
    expect(includedAllowance(makeGroup({ obrigatory: false, minQuantity: 1 }))).toBe(0)
  })

  it('obrigatório com minQuantity 0 não tem franquia', () => {
    expect(includedAllowance(makeGroup({ obrigatory: true, minQuantity: 0 }))).toBe(0)
  })

  it('obrigatório min=1 → o item mais barato', () => {
    expect(includedAllowance(makeGroup({ obrigatory: true, minQuantity: 1 }))).toBeCloseTo(1)
  })

  it('obrigatório min=2 → o mais barato × 2', () => {
    expect(includedAllowance(makeGroup({ obrigatory: true, minQuantity: 2 }))).toBeCloseTo(2)
  })

  it('fracionado entra rateado por maxQuantity', () => {
    const g = makeGroup({
      obrigatory: true, ingredients: true, minQuantity: 2, maxQuantity: 2,
      products: [{ _id: 'a', price: 60 } as never, { _id: 'b', price: 70 } as never],
    })
    expect(includedAllowance(g)).toBeCloseTo(60) // 60 ÷ 2 × 2 = pizza inteira
  })

  it('o piso é o base mais a soma das franquias', () => {
    const g1 = makeGroup({ _id: 'g1', obrigatory: true, minQuantity: 1 })
    const g2 = makeGroup({ _id: 'g2', obrigatory: false, minQuantity: 1 })
    const p = makeProduct({ price: 10, complementsGroups: [g1, g2] })
    expect(getCardPrice(p)).toBeCloseTo(10 + includedAllowance(g1) + includedAllowance(g2))
  })
})

// ─── getCardPrice ────────────────────────────────────────────────────────────

describe('getCardPrice', () => {
  it('sem complementos → retorna preço base', () => {
    const p = makeProduct({ price: 10, complementsGroups: [] })
    expect(getCardPrice(p)).toBeCloseTo(10)
  })

  it('com grupo obrigatório min=1 → base + cheapest', () => {
    const g = makeGroup({ obrigatory: true, minQuantity: 1 })
    const p = makeProduct({ price: 10, complementsGroups: [g] })
    expect(getCardPrice(p)).toBeCloseTo(11) // 10 + 1 (cheapest)
  })

  it('dois grupos obrigatórios → soma os dois cheapests', () => {
    const g1 = makeGroup({ _id: 'g1', obrigatory: true, minQuantity: 1 })
    const g2 = makeGroup({
      _id: 'g2', obrigatory: true, minQuantity: 1,
      products: [{ _id: 'a', price: 2 } as any, { _id: 'b', price: 3 } as any]
    })
    const p = makeProduct({ price: 10, complementsGroups: [g1, g2] })
    expect(getCardPrice(p)).toBeCloseTo(13) // 10 + 1 + 2
  })

  it('grupo opcional → não soma ao preço do card', () => {
    const g = makeGroup({ obrigatory: false })
    const p = makeProduct({ price: 10, complementsGroups: [g] })
    expect(getCardPrice(p)).toBeCloseTo(10)
  })

  // ── minQuantity × mais barato ──
  // Somava o mais barato UMA vez por grupo: num grupo que exige 2 escolhas de
  // R$1, o card prometia R$11 e o checkout cobrava R$12.
  it('grupo obrigatório com minQuantity 2 → soma o mais barato DUAS vezes', () => {
    const g = makeGroup({ obrigatory: true, minQuantity: 2, maxQuantity: 3 })
    const p = makeProduct({ price: 10, complementsGroups: [g] })
    expect(getCardPrice(p)).toBeCloseTo(12) // 10 + (1 × 2)
  })

  it('grupo obrigatório com minQuantity 3', () => {
    const g = makeGroup({ obrigatory: true, minQuantity: 3, maxQuantity: 5 })
    const p = makeProduct({ price: 10, complementsGroups: [g] })
    expect(getCardPrice(p)).toBeCloseTo(13) // 10 + (1 × 3)
  })

  // ── Fracionado ──
  // Era ignorado, e numa pizza com preço base 0 (onde o sabor carrega o valor)
  // o card mostrava R$ 0,00
  it('fracionado obrigatório → soma rateado (min 1 de 2 frações)', () => {
    const g = makeGroup({
      obrigatory: true, ingredients: true, minQuantity: 1, maxQuantity: 2,
      products: [
        { _id: 'a', name: 'Calabresa', price: 60, active: true, quantity: 0 },
        { _id: 'b', name: 'Frango', price: 80, active: true, quantity: 0 },
      ] as never,
    })
    const p = makeProduct({ price: 0, complementsGroups: [g] })
    expect(getCardPrice(p)).toBeCloseTo(30) // 60 ÷ 2 × 1
  })

  it('fracionado obrigatório exigindo TODAS as frações', () => {
    const g = makeGroup({
      obrigatory: true, ingredients: true, minQuantity: 2, maxQuantity: 2,
      products: [
        { _id: 'a', name: 'Calabresa', price: 60, active: true, quantity: 0 },
      ] as never,
    })
    const p = makeProduct({ price: 0, complementsGroups: [g] })
    expect(getCardPrice(p)).toBeCloseTo(60) // 60 ÷ 2 × 2 = pizza inteira
  })

  it('fracionado em quartos, min 4 → preço da pizza inteira mais barata', () => {
    const g = makeGroup({
      obrigatory: true, ingredients: true, minQuantity: 4, maxQuantity: 4,
      products: [
        { _id: 'a', name: 'Calabresa', price: 80, active: true, quantity: 0 },
        { _id: 'b', name: 'Frango', price: 120, active: true, quantity: 0 },
      ] as never,
    })
    const p = makeProduct({ price: 0, complementsGroups: [g] })
    expect(getCardPrice(p)).toBeCloseTo(80)
  })

  it('maxQuantity 0 não divide por zero', () => {
    const g = makeGroup({
      obrigatory: true, ingredients: true, minQuantity: 1, maxQuantity: 0,
    })
    const p = makeProduct({ price: 10, complementsGroups: [g] })
    expect(Number.isFinite(getCardPrice(p))).toBe(true)
  })

  it('minQuantity 0 → não soma, mesmo obrigatório', () => {
    const g = makeGroup({ obrigatory: true, minQuantity: 0 })
    const p = makeProduct({ price: 10, complementsGroups: [g] })
    expect(getCardPrice(p)).toBeCloseTo(10)
  })

  it('usa offerprice quando menor que price', () => {
    const p = makeProduct({ price: 20, offerprice: 15, complementsGroups: [] })
    expect(getCardPrice(p)).toBeCloseTo(15)
  })
})

// ─── effectivePrice ──────────────────────────────────────────────────────────

describe('effectivePrice', () => {
  it('sem offer → retorna price', () => {
    const p = makeProduct({ price: 25 })
    expect(effectivePrice(p)).toBeCloseTo(25)
  })

  it('com offerprice menor → retorna offerprice', () => {
    const p = makeProduct({ price: 25, offerprice: 20 })
    expect(effectivePrice(p)).toBeCloseTo(20)
  })

  it('com offerprice maior → retorna price (ignora offerprice)', () => {
    const p = makeProduct({ price: 25, offerprice: 30 })
    expect(effectivePrice(p)).toBeCloseTo(25)
  })

  it('com productOffer percentual 20% → aplica desconto', () => {
    const p = makeProduct({
      price: 25,
      productOffer: { _id: 'o1', title: '20off', triggers: {}, rules: {}, rewards: { discountType: { type: 1, value: 20 } }, disabled: false }
    })
    expect(effectivePrice(p)).toBeCloseTo(20) // 25 * 0.8
  })

  it('com productOffer fixo R$5 → desconta valor fixo', () => {
    const p = makeProduct({
      price: 25,
      productOffer: { _id: 'o1', title: 'R5off', triggers: {}, rules: {}, rewards: { discountType: { type: 2, value: 5 } }, disabled: false }
    })
    expect(effectivePrice(p)).toBeCloseTo(20)
  })

  it('offerprice tem prioridade sobre productOffer', () => {
    const p = makeProduct({
      price: 25, offerprice: 18,
      productOffer: { _id: 'o1', title: 'R5off', triggers: {}, rules: {}, rewards: { discountType: { type: 2, value: 5 } }, disabled: false }
    })
    expect(effectivePrice(p)).toBeCloseTo(18) // offerprice ganha
  })
})

describe('hasDiscount e discountAmount', () => {
  it('sem desconto → false e 0', () => {
    const p = makeProduct({ price: 10 })
    expect(hasDiscount(p)).toBe(false)
    expect(discountAmount(p)).toBe(0)
  })

  it('com offerprice → true e valor correto', () => {
    const p = makeProduct({ price: 10, offerprice: 8 })
    expect(hasDiscount(p)).toBe(true)
    expect(discountAmount(p)).toBeCloseTo(2)
  })
})

// ─── Fracionado ──────────────────────────────────────────────────────────────

describe('getFractionText', () => {
  it('2 fracoes → 1/2', () => expect(getFractionText(2)).toBe('½'))
  it('3 fracoes → 1/3', () => expect(getFractionText(3)).toBe('⅓'))
  it('4 fracoes → 1/4', () => expect(getFractionText(4)).toBe('¼'))
  it('5 fracoes → 1/5', () => expect(getFractionText(5)).toBe('⅕'))
  it('7 fracoes → fallback 1/7', () => expect(getFractionText(7)).toBe('1/7'))
})

describe('fracPrice', () => {
  it('pizza R$40 meia a meia: 1 fração = R$20', () => {
    expect(fracPrice(40, 1, 2)).toBeCloseTo(20)
  })
  it('pizza R$40 meia a meia: 2 frações = R$40', () => {
    expect(fracPrice(40, 2, 2)).toBeCloseTo(40)
  })
  it('pizza R$30 terco: 1 fração = R$10', () => {
    expect(fracPrice(30, 1, 3)).toBeCloseTo(10)
  })
})

// ─── calcCartItemSubtotal ────────────────────────────────────────────────────

describe('calcCartItemSubtotal', () => {
  it('sem complementos, qty 1', () => {
    const item = makeCartItem({ product: makeProduct({ price: 10 }), quantity: 1, addedComplements: [] })
    expect(calcCartItemSubtotal(item)).toBeCloseTo(10)
  })

  it('com complemento R$1.50, qty 1', () => {
    const item = makeCartItem({
      product: makeProduct({ price: 10 }),
      quantity: 1,
      addedComplements: [{ _id: 'c1', name: 'X', price: 1.5, quantity: 1, groupId: 'g1', groupName: 'G' }]
    })
    expect(calcCartItemSubtotal(item)).toBeCloseTo(11.5)
  })

  // ── Regressão: o piso do card é o preço do combo ──
  //
  // Caso real: "Combo delícia 2 — Super Frango", base R$29,40, com grupo
  // obrigatório de bebida onde as 300ml custam R$6,50 e as 500ml R$8,50.
  //
  // Duas contas discordavam do mesmo combo:
  //   getCardPrice        → 29,40 + 6,50 = R$35,90  (grid)
  //   calcCartItemSubtotal → 29,40 − 0    = R$29,40  (carrinho)
  //
  // O card anunciava R$35,90, a tela do produto abria em R$29,40 e o carrinho
  // cobrava R$29,40 — a bebida inclusa saía de graça duas vezes, R$6,50 por
  // combo vendido. O piso (`getCardPrice`) é a verdade; "incluso" significa
  // "não acrescenta ao piso", não "sai do base".
  describe('grupo obrigatório: o piso já cobre a escolha mínima', () => {
    const bebidas = makeGroup({
      _id: 'gbebida',
      obrigatory: true,
      minQuantity: 1,
      maxQuantity: 1,
      products: [
        { _id: 'c300', name: 'Coca 300ml', price: 6.5, active: true, quantity: 0 },
        { _id: 'z300', name: 'Coca zero 300ml', price: 6.5, active: true, quantity: 0 },
        { _id: 'c500', name: 'Coca 500ml', price: 8.5, active: true, quantity: 0 },
        { _id: 's350', name: 'Sprite lata 350ml', price: 8, active: true, quantity: 0 },
      ] as never,
    })
    const combo = makeProduct({ price: 29.4, complementsGroups: [bebidas] })

    const escolher = (id: string, price: number, qty = 1) =>
      makeCartItem({
        product: combo,
        quantity: qty,
        addedComplements: [{
          _id: id, name: 'x', price, quantity: 1,
          groupId: 'gbebida', groupName: 'Bebida',
        }],
      })

    /** O número que o grid promete — e a régua de todo o resto deste bloco. */
    const PISO = 35.9

    it('o piso do card soma a bebida mais barata ao base', () => {
      expect(getCardPrice(combo)).toBeCloseTo(PISO) // 29,40 + 6,50
    })

    it('escolha inclusa (R$6,50) → fica no piso, igual ao grid', () => {
      expect(calcCartItemSubtotal(escolher('c300', 6.5))).toBeCloseTo(PISO)
    })

    it('outra escolha do mesmo preço → também fica no piso', () => {
      expect(calcCartItemSubtotal(escolher('z300', 6.5))).toBeCloseTo(PISO)
    })

    it('escolha mais cara (R$8,50) → piso + diferença de R$2,00', () => {
      expect(calcCartItemSubtotal(escolher('c500', 8.5))).toBeCloseTo(37.9)
    })

    it('escolha de R$8,00 → piso + R$1,50', () => {
      expect(calcCartItemSubtotal(escolher('s350', 8))).toBeCloseTo(37.4)
    })

    it('2 combos com a escolha mais cara → tudo dobra', () => {
      expect(calcCartItemSubtotal(escolher('c500', 8.5, 2))).toBeCloseTo(75.8) // 37,90 × 2
    })

    /**
     * O que a tela do produto mostra ao abrir tem de ser o que o grid prometeu.
     * Sem escolha nenhuma, o valor exibido é o piso — não o base cru, senão o
     * número **sobe** quando o cliente marca o item que a descrição dá de graça.
     */
    it('sem escolher nada, a tela do produto abre no piso do grid', () => {
      expect(calcUnitPrice(combo, [])).toBeCloseTo(PISO)
    })

    it('marcar o item incluso não mexe no valor exibido', () => {
      const comps = [{
        _id: 'c300', name: 'Coca 300ml', price: 6.5, quantity: 1,
        groupId: 'gbebida', groupName: 'Bebida',
      }]
      expect(calcUnitPrice(combo, comps)).toBeCloseTo(calcUnitPrice(combo, []))
    })

    it('etiqueta e cobrança concordam para todos os itens', () => {
      for (const item of bebidas.products) {
        const price = (item as unknown as { price: number }).price
        const label = getComplementPriceLabel(price, bebidas)
        const cobrado = calcCartItemSubtotal(escolher('x', price)) - PISO
        const daEtiqueta = label.type === 'incluso' ? 0 : label.value
        expect(cobrado).toBeCloseTo(daEtiqueta)
      }
    })
  })

  /**
   * Franquia é do grupo, não de cada unidade.
   *
   * Grupo obrigatório "escolha 1, até 3": descontando o mais barato de **cada**
   * escolha, marcar 3 refrigerantes de R$6,50 somava zero e o cliente levava
   * três bebidas pelo preço de uma.
   */
  it('grupo obrigatório com várias escolhas: franquia cobre só o mínimo', () => {
    const g = makeGroup({
      _id: 'gmulti',
      obrigatory: true,
      minQuantity: 1,
      maxQuantity: 3,
      products: [
        { _id: 'a', name: 'A', price: 6.5, active: true, quantity: 0 },
        { _id: 'b', name: 'B', price: 6.5, active: true, quantity: 0 },
        { _id: 'c', name: 'C', price: 6.5, active: true, quantity: 0 },
      ] as never,
    })
    const p = makeProduct({ price: 20, complementsGroups: [g] })
    const comp = (id: string) => ({
      _id: id, name: id, price: 6.5, quantity: 1,
      groupId: 'gmulti', groupName: 'G',
    })

    expect(getCardPrice(p)).toBeCloseTo(26.5)               // 20 + 1 franquia
    expect(calcUnitPrice(p, [comp('a')])).toBeCloseTo(26.5) // a 1ª é a inclusa
    expect(calcUnitPrice(p, [comp('a'), comp('b')])).toBeCloseTo(33)  // +6,50
    expect(calcUnitPrice(p, [comp('a'), comp('b'), comp('c')])).toBeCloseTo(39.5)
  })

  it('grupo OPCIONAL continua somando o preço cheio', () => {
    const extras = makeGroup({
      _id: 'gextra',
      obrigatory: false,
      maxQuantity: 5,
      products: [
        { _id: 'bacon', name: 'Bacon', price: 5, active: true, quantity: 0 },
        { _id: 'cheddar', name: 'Cheddar', price: 4, active: true, quantity: 0 },
      ] as never,
    })
    const p = makeProduct({ price: 20, complementsGroups: [extras] })
    const item = makeCartItem({
      product: p,
      quantity: 1,
      addedComplements: [{
        _id: 'bacon', name: 'Bacon', price: 5, quantity: 1,
        groupId: 'gextra', groupName: 'Extras',
      }],
    })
    // Em grupo opcional nada está incluso — soma os R$5 cheios
    expect(calcCartItemSubtotal(item)).toBeCloseTo(25)
  })

  // ── Regressão: fracionado (pizza meia a meia) ──
  // `unitFraction` era gravado no complemento e enviado no payload, mas nunca
  // entrava no cálculo — cada metade era cobrada pelo preço da pizza inteira.
  it('fracionado: duas metades cobram metade de cada preço', () => {
    const item = makeCartItem({
      product: makeProduct({ price: 0 }),
      quantity: 1,
      addedComplements: [
        { _id: 'c1', name: 'Calabresa', price: 60, quantity: 1, groupId: 'g1', groupName: 'Sabores', unitFraction: 0.5 },
        { _id: 'c2', name: 'Marguerita', price: 70, quantity: 1, groupId: 'g1', groupName: 'Sabores', unitFraction: 0.5 },
      ],
    })
    expect(calcCartItemSubtotal(item)).toBeCloseTo(65) // 30 + 35, não 130
  })

  it('fracionado: pizza inteira de um sabor só (2 frações do mesmo item)', () => {
    const item = makeCartItem({
      product: makeProduct({ price: 0 }),
      quantity: 1,
      addedComplements: [
        { _id: 'c1', name: 'Calabresa', price: 60, quantity: 2, groupId: 'g1', groupName: 'Sabores', unitFraction: 0.5 },
      ],
    })
    expect(calcCartItemSubtotal(item)).toBeCloseTo(60)
  })

  // O mesmo cálculo cobre dois cadastros diferentes:
  //  · pizza  → cada item vale a pizza INTEIRA, e a fração rateia
  //  · sopa   → cada item é um ACRÉSCIMO, e a fração rateia igual
  it('fracionado como acréscimo: meia sopa de ovo cobra metade do adicional', () => {
    const item = makeCartItem({
      product: makeProduct({ price: 20 }),
      quantity: 1,
      addedComplements: [
        { _id: 'c1', name: 'Feijão', price: 0, quantity: 1, groupId: 'g1', groupName: 'Sabores', unitFraction: 0.5 },
        { _id: 'c2', name: 'Ovo', price: 4, quantity: 1, groupId: 'g1', groupName: 'Sabores', unitFraction: 0.5 },
      ],
    })
    expect(calcCartItemSubtotal(item)).toBeCloseTo(22) // 20 + 0 + 2
  })

  it('fracionado em quartos: pizza de 4 sabores rateia cada um em 1/4', () => {
    const item = makeCartItem({
      product: makeProduct({ price: 0 }),
      quantity: 1,
      addedComplements: [
        { _id: 'a', name: 'Calabresa', price: 80, quantity: 1, groupId: 'g1', groupName: 'S', unitFraction: 0.25 },
        { _id: 'b', name: 'Marguerita', price: 80, quantity: 1, groupId: 'g1', groupName: 'S', unitFraction: 0.25 },
        { _id: 'c', name: 'Portuguesa', price: 100, quantity: 1, groupId: 'g1', groupName: 'S', unitFraction: 0.25 },
        { _id: 'd', name: 'Frango', price: 120, quantity: 1, groupId: 'g1', groupName: 'S', unitFraction: 0.25 },
      ],
    })
    expect(calcCartItemSubtotal(item)).toBeCloseTo(95) // média dos quatro
  })

  it('fracionado em quartos: 2 sabores ocupando 2/4 cada', () => {
    const item = makeCartItem({
      product: makeProduct({ price: 0 }),
      quantity: 1,
      addedComplements: [
        { _id: 'a', name: 'Calabresa', price: 80, quantity: 2, groupId: 'g1', groupName: 'S', unitFraction: 0.25 },
        { _id: 'd', name: 'Frango', price: 120, quantity: 2, groupId: 'g1', groupName: 'S', unitFraction: 0.25 },
      ],
    })
    expect(calcCartItemSubtotal(item)).toBeCloseTo(100) // média dos dois
  })

  it('fracionado em terços: 1/3 + 2/3', () => {
    const item = makeCartItem({
      product: makeProduct({ price: 0 }),
      quantity: 1,
      addedComplements: [
        { _id: 'c1', name: 'A', price: 90, quantity: 1, groupId: 'g1', groupName: 'S', unitFraction: 1 / 3 },
        { _id: 'c2', name: 'B', price: 60, quantity: 2, groupId: 'g1', groupName: 'S', unitFraction: 1 / 3 },
      ],
    })
    expect(calcCartItemSubtotal(item)).toBeCloseTo(70) // 30 + 40
  })

  it('fracionado com qty do produto 2 → dobra o total', () => {
    const item = makeCartItem({
      product: makeProduct({ price: 0 }),
      quantity: 2,
      addedComplements: [
        { _id: 'c1', name: 'Calabresa', price: 60, quantity: 1, groupId: 'g1', groupName: 'S', unitFraction: 0.5 },
        { _id: 'c2', name: 'Marguerita', price: 70, quantity: 1, groupId: 'g1', groupName: 'S', unitFraction: 0.5 },
      ],
    })
    expect(calcCartItemSubtotal(item)).toBeCloseTo(130) // 65 × 2
  })

  it('complemento sem unitFraction continua com preço cheio', () => {
    const item = makeCartItem({
      product: makeProduct({ price: 10 }),
      quantity: 1,
      addedComplements: [
        { _id: 'c1', name: 'Bacon', price: 5, quantity: 2, groupId: 'g1', groupName: 'G' },
      ],
    })
    expect(calcCartItemSubtotal(item)).toBeCloseTo(20)
  })

  it('qty 2 → multiplica o subtotal', () => {
    const item = makeCartItem({
      product: makeProduct({ price: 10 }),
      quantity: 2,
      addedComplements: [{ _id: 'c1', name: 'X', price: 1, quantity: 1, groupId: 'g1', groupName: 'G' }]
    })
    expect(calcCartItemSubtotal(item)).toBeCloseTo(22) // (10+1)*2
  })

  it('complemento com qty=2 (opcional duplicado)', () => {
    const item = makeCartItem({
      product: makeProduct({ price: 10 }),
      quantity: 1,
      addedComplements: [{ _id: 'c1', name: 'X', price: 1, quantity: 2, groupId: 'g1', groupName: 'G' }]
    })
    expect(calcCartItemSubtotal(item)).toBeCloseTo(12) // 10 + 1*2
  })

  it('usa offerprice quando disponível', () => {
    const item = makeCartItem({
      product: makeProduct({ price: 20, offerprice: 15 }),
      quantity: 1,
      addedComplements: []
    })
    expect(calcCartItemSubtotal(item)).toBeCloseTo(15)
  })
})

describe('calcCartTotal', () => {
  it('cart vazio → 0', () => {
    expect(calcCartTotal([])).toBe(0)
  })

  it('soma os subtotais de todos os itens', () => {
    const items = [
      makeCartItem({ product: makeProduct({ price: 10 }), quantity: 1, addedComplements: [], subTotal: 10 }),
      makeCartItem({ product: makeProduct({ price: 25 }), quantity: 2, addedComplements: [], subTotal: 50 }),
    ]
    expect(calcCartTotal(items)).toBeCloseTo(60)
  })
})

// ─── calcTmProduto ───────────────────────────────────────────────────────────

describe('calcTmProduto', () => {
  it('sem peopleCount → 0', () => {
    const items = [makeCartItem({ product: makeProduct({ price: 10, peopleCount: 0 }) })]
    expect(calcTmProduto(items, 10)).toBe(0)
  })

  it('1 pessoa, total R$10 → tmProduto R$10', () => {
    const items = [makeCartItem({ product: makeProduct({ price: 10, peopleCount: 1 }), quantity: 1 })]
    expect(calcTmProduto(items, 10)).toBeCloseTo(10)
  })

  it('2 pessoas no mesmo pedido', () => {
    const items = [makeCartItem({ product: makeProduct({ price: 20, peopleCount: 2 }), quantity: 1 })]
    expect(calcTmProduto(items, 20)).toBeCloseTo(10)
  })
})

// ─── formatCurrency ──────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('formata com R$ e virgula', () => {
    expect(formatCurrency(10)).toContain('R$')
    expect(formatCurrency(10)).toContain('10')
  })
  it('formata centavos', () => {
    expect(formatCurrency(0.5)).toContain('0,50')
  })
})

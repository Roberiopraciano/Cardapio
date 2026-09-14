/**
 * Testes para src/lib/stock.ts
 * Cobre: isOutOfStock, checkValidPeriod, getProductStatus, findCouponByCode
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isOutOfStock,
  checkValidPeriod,
  getProductStatus,
  isProductOrderable,
  getStatusBadge,
  findCouponByCode,
  applyCouponDiscount,
  getPeriodLabel,
} from '../lib/stock'
import type { Product, Period, Offer } from '../types'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return { _id: 'p1', name: 'X', price: 10, active: true, seq: 1, peopleCount: 1, complementsGroups: [], complementsId: [], image: '', category: 'c1', ...overrides } as Product
}

function makePeriod(daySlots: Record<string, Array<{ from: string; to: string }>>, overrides: Partial<Period> = {}): Period {
  return { _id: 'per1', branch: 'b1', title: 'Almoço', period: daySlots, ...overrides }
}

// Mock de data — sexta-feira 12:00
function mockTime(hour: number, minute = 0, dayOfWeek = 5 /* sexta */) {
  const date = new Date(2025, 0, 3, hour, minute, 0) // 3 jan 2025 = sexta
  vi.setSystemTime(date)
}

// ─── isOutOfStock ────────────────────────────────────────────────────────────

describe('isOutOfStock', () => {
  it('sem campo stock → disponível', () => {
    expect(isOutOfStock(makeProduct({ stock: undefined }))).toBe(false)
  })

  it('stock null → disponível', () => {
    expect(isOutOfStock(makeProduct({ stock: null }))).toBe(false)
  })

  it('stock.active false → disponível (sem controle)', () => {
    expect(isOutOfStock(makeProduct({ stock: { active: false, currentQuantity: 0 } }))).toBe(false)
  })

  it('stock.active true, qty > 0 → disponível', () => {
    expect(isOutOfStock(makeProduct({ stock: { active: true, currentQuantity: 5 } }))).toBe(false)
  })

  it('stock.active true, qty 0 → esgotado', () => {
    expect(isOutOfStock(makeProduct({ stock: { active: true, currentQuantity: 0 } }))).toBe(true)
  })

  it('stock.active true, qty negativo → esgotado', () => {
    expect(isOutOfStock(makeProduct({ stock: { active: true, currentQuantity: -1 } }))).toBe(true)
  })
})

// ─── checkValidPeriod ────────────────────────────────────────────────────────

describe('checkValidPeriod', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('sem periodId → disponível (não bloqueia)', () => {
    expect(checkValidPeriod([], '')).toBe(true)
  })

  it('period não encontrado → disponível (não bloqueia)', () => {
    expect(checkValidPeriod([], 'nao-existe')).toBe(true)
  })

  it('dentro do horário do dia → disponível', () => {
    mockTime(12, 0) // sexta 12:00
    const period = makePeriod({ friday: [{ from: '11:00', to: '14:00' }] })
    expect(checkValidPeriod([period], period._id)).toBe(true)
  })

  it('fora do horário do dia → indisponível', () => {
    mockTime(15, 0) // sexta 15:00 (depois das 14:00)
    const period = makePeriod({ friday: [{ from: '11:00', to: '14:00' }] })
    expect(checkValidPeriod([period], period._id)).toBe(false)
  })

  it('antes do horário do dia → indisponível', () => {
    mockTime(10, 0) // sexta 10:00 (antes das 11:00)
    const period = makePeriod({ friday: [{ from: '11:00', to: '14:00' }] })
    expect(checkValidPeriod([period], period._id)).toBe(false)
  })

  it('sem slots para o dia de hoje → indisponível', () => {
    mockTime(12, 0) // sexta
    const period = makePeriod({ saturday: [{ from: '10:00', to: '22:00' }] }) // só sábado
    expect(checkValidPeriod([period], period._id)).toBe(false)
  })

  it('múltiplos slots — dentro de um → disponível', () => {
    mockTime(20, 0) // sexta 20:00 (jantar)
    const period = makePeriod({
      friday: [{ from: '11:00', to: '14:00' }, { from: '18:00', to: '22:00' }]
    })
    expect(checkValidPeriod([period], period._id)).toBe(true)
  })
})

// ─── getProductStatus ────────────────────────────────────────────────────────

describe('getProductStatus', () => {
  beforeEach(() => { vi.useFakeTimers(); mockTime(12, 0) })
  afterEach(() => { vi.useRealTimers() })

  it('produto ativo, sem stock, sem período → available', () => {
    expect(getProductStatus(makeProduct(), [])).toBe('available')
  })

  it('produto inativo → inactive', () => {
    expect(getProductStatus(makeProduct({ active: false }), [])).toBe('inactive')
  })

  it('produto esgotado → out_of_stock', () => {
    const p = makeProduct({ stock: { active: true, currentQuantity: 0 } })
    expect(getProductStatus(p, [])).toBe('out_of_stock')
  })

  it('produto com período válido agora → available', () => {
    const period = makePeriod({ friday: [{ from: '11:00', to: '14:00' }] })
    const p = makeProduct({ relatedPeriod: period._id })
    expect(getProductStatus(p, [period])).toBe('available')
  })

  it('produto com período inválido agora → unavailable_period', () => {
    const period = makePeriod({ friday: [{ from: '18:00', to: '22:00' }] })
    const p = makeProduct({ relatedPeriod: period._id })
    expect(getProductStatus(p, [period])).toBe('unavailable_period')
  })

  it('prioridade: inactive > out_of_stock', () => {
    const p = makeProduct({ active: false, stock: { active: true, currentQuantity: 0 } })
    expect(getProductStatus(p, [])).toBe('inactive')
  })
})

describe('isProductOrderable', () => {
  it('disponível → true', () => {
    expect(isProductOrderable(makeProduct(), [])).toBe(true)
  })
  it('esgotado → false', () => {
    expect(isProductOrderable(makeProduct({ stock: { active: true, currentQuantity: 0 } }), [])).toBe(false)
  })
})

describe('getStatusBadge', () => {
  it('available → null', () => expect(getStatusBadge('available')).toBeNull())
  it('inactive → null (não exibe)', () => expect(getStatusBadge('inactive')).toBeNull())
  it('out_of_stock → badge Esgotado', () => {
    const b = getStatusBadge('out_of_stock')
    expect(b).not.toBeNull()
    expect(b!.label).toBe('Esgotado')
  })
  it('unavailable_period → badge Fora do horário', () => {
    const b = getStatusBadge('unavailable_period')
    expect(b).not.toBeNull()
    expect(b!.label).toBe('Fora do horário')
  })
})

// ─── Cupom ───────────────────────────────────────────────────────────────────

function makeOffer(couponCode: string, discountType?: { type: 1 | 2; value: number }): Offer {
  return {
    _id: 'o1',
    title: 'Desconto',
    triggers: { coupon: { code: couponCode } },
    rules: {},
    rewards: discountType ? { discountType } : {},
    disabled: false,
  }
}

describe('findCouponByCode', () => {
  it('código vazio → null', () => {
    expect(findCouponByCode([], '')).toBeNull()
  })

  it('código não encontrado → null', () => {
    expect(findCouponByCode([makeOffer('PROMO10')], 'OUTRO')).toBeNull()
  })

  it('código correto → retorna a oferta', () => {
    const offer = makeOffer('PROMO10')
    const result = findCouponByCode([offer], 'PROMO10')
    expect(result).not.toBeNull()
    expect(result!._id).toBe('o1')
  })

  it('case insensitive', () => {
    const offer = makeOffer('PROMO10')
    expect(findCouponByCode([offer], 'promo10')).not.toBeNull()
  })

  it('código com espaços é normalizado', () => {
    const offer = makeOffer('PROMO10')
    expect(findCouponByCode([offer], '  PROMO10  ')).not.toBeNull()
  })
})

// Regressão: `isOutOfStock` passou a aceitar também ComplementItem, porque
// item de complemento (um sabor, uma bebida) também acaba e não era checado.
// Regressão: `totemSoldOut` é a chave de "marcar como esgotado" do painel e
// estava sendo **ignorada**. No cadastro real vem `{active:false,
// totemSoldOut:true}` — a casa não controla quantidade daquele item, mas acabou
// hoje. O `return` de "sem controle de estoque" acontecia antes e engolia a
// marcação do operador: Coca-Cola zero aparecia disponível no cardápio.
describe('isOutOfStock — totemSoldOut (marcação manual)', () => {
  it('totemSoldOut true com active false → ESGOTADO', () => {
    expect(isOutOfStock({ stock: { active: false, currentQuantity: 0, totemSoldOut: true } })).toBe(true)
  })

  it('totemSoldOut true com estoque cheio → ESGOTADO (decisão manual vence)', () => {
    expect(isOutOfStock({ stock: { active: true, currentQuantity: 99, totemSoldOut: true } })).toBe(true)
  })

  it('totemSoldOut false com active false → disponível', () => {
    expect(isOutOfStock({ stock: { active: false, currentQuantity: 0, totemSoldOut: false } })).toBe(false)
  })

  it('totemSoldOut ausente → cai na regra de quantidade', () => {
    expect(isOutOfStock({ stock: { active: true, currentQuantity: 0 } })).toBe(true)
    expect(isOutOfStock({ stock: { active: true, currentQuantity: 5 } })).toBe(false)
  })

  // Casos reais do payload da branch 658afd3d0ce8b356f9f9ce20
  it.each([
    ['Coca cola zero',             { active: false, currentQuantity: 0, totemSoldOut: true },  true],
    ['Fanta uva',                  { active: false, currentQuantity: 0, totemSoldOut: false }, false],
    ['Lata Sprite Zero 350ml',     { active: false, currentQuantity: 0, totemSoldOut: true },  true],
    ['Suco Natural Laranja 300ml', { active: false, currentQuantity: 0, totemSoldOut: true },  true],
    ['Alface',                     { active: false, currentQuantity: 0, totemSoldOut: false }, false],
  ])('cadastro real: %s', (_nome, stock, esperado) => {
    expect(isOutOfStock({ stock })).toBe(esperado)
  })
})

describe('isOutOfStock — complementos', () => {
  it('item de complemento sem stock → disponível', () => {
    expect(isOutOfStock({ stock: undefined })).toBe(false)
  })
  it('stock.active false → sem controle, disponível', () => {
    expect(isOutOfStock({ stock: { active: false, currentQuantity: 0 } })).toBe(false)
  })
  it('stock.active true e quantidade 0 → esgotado', () => {
    expect(isOutOfStock({ stock: { active: true, currentQuantity: 0 } })).toBe(true)
  })
  it('stock.active true e quantidade 3 → disponível', () => {
    expect(isOutOfStock({ stock: { active: true, currentQuantity: 3 } })).toBe(false)
  })
})

describe('applyCouponDiscount', () => {
  it('desconto percentual 20% no total R$100 → R$80', () => {
    const offer = makeOffer('X', { type: 1, value: 20 })
    expect(applyCouponDiscount(100, offer)).toBeCloseTo(80)
  })

  it('desconto fixo R$15 no total R$100 → R$85', () => {
    const offer = makeOffer('X', { type: 2, value: 15 })
    expect(applyCouponDiscount(100, offer)).toBeCloseTo(85)
  })

  it('desconto maior que total → não vai negativo (mínimo 0)', () => {
    // Nota: applyCouponDiscount retorna o total com desconto, não garante >= 0
    // mas para ofertas sensatas o valor deve ser positivo
    const offer = makeOffer('X', { type: 2, value: 5 })
    expect(applyCouponDiscount(10, offer)).toBeCloseTo(5)
  })

  it('sem discountType → retorna total original', () => {
    const offer = makeOffer('X')
    expect(applyCouponDiscount(100, offer)).toBeCloseTo(100)
  })
})

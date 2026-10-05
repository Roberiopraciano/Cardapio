import { describe, it, expect } from 'vitest'
import { buildOrderPayload, flattenComplement, SIMPLE_AUTH_FALLBACK, type OrderPayloadInput } from '../lib/orderPayload'
import { complementEntries } from '../api/client'
import type { CartItem, Product, CartComplement } from '../types'

const product = (over: Partial<Product> = {}): Product => ({
  _id: '6aaaf07d4ab9b2f21406d403', name: 'X-Burguer', category: 'c', price: 20,
  active: true, seq: 1, peopleCount: 0, complementsGroups: [], complementsId: [], image: '',
  ...over,
})

const coca: CartComplement = {
  _id: 'p-coca', name: 'Coca 300ml', price: 6.5, quantity: 2,
  groupId: 'g-bebida', groupName: 'Deseja uma bebida?', unitFraction: 1,
}

const input = (over: Partial<OrderPayloadInput> = {}): OrderPayloadInput => ({
  branchId: '6aa8752b6191072796eaa4e3',
  simpleAuth: '',
  consumptioncode: 'A042', consumptionint: 812,
  items: [{ product: product(), quantity: 2, note: '', addedComplements: [coca], subTotal: 0 } as CartItem],
  subtotal: 66, total: 66,
  client: { name: 'Ana', phone: '85999999999', cpf: '', email: '' },
  askEmail: false,
  mode: 'balcao', whereConsume: 'OutsideLocal', payVia: 'local',
  ...over,
})

/** Campos `required` do validador em OrderController::create (Laravel). */
const LARAVEL_REQUIRED = [
  'amount', 'subtotal', 'total', 'branch', 'change', 'simpleAuth', 'totemClientName',
  'deliveryFee', 'items', 'totemVersion', 'locationType', 'paymentMethod',
  'additionalInfo', 'installments',
]

/** O `required` do Laravel recusa null, '' e array vazio — 0 e false passam. */
function laravelFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  return true
}

describe('buildOrderPayload — aceito pelo POST api/orders de hoje', () => {
  it('preenche todos os campos obrigatórios do validador', () => {
    const p = buildOrderPayload(input()) as Record<string, unknown>
    for (const k of LARAVEL_REQUIRED) expect(laravelFilled(p[k]), k).toBe(true)
  })

  it('sem simpleAuth na branch manda o marcador, com simpleAuth manda o dela', () => {
    expect(buildOrderPayload(input()).simpleAuth).toBe(SIMPLE_AUTH_FALLBACK)
    expect(buildOrderPayload(input({ simpleAuth: 'abc' })).simpleAuth).toBe('abc')
  })

  it('sem nome usa a senha (balcão) ou a mesa — o campo é obrigatório', () => {
    const noName = { name: '  ', phone: '', cpf: '' }
    expect(buildOrderPayload(input({ client: noName })).totemClientName).toBe('A042')
    expect(buildOrderPayload(input({ client: noName, mode: 'mesa', consumptioncode: '03' })).totemClientName)
      .toBe('Mesa 03')
  })

  it('additionalInfo é texto, como o totem manda', () => {
    expect(buildOrderPayload(input()).additionalInfo).toBe('Para levar')
    expect(buildOrderPayload(input({ whereConsume: 'OnLocal' })).additionalInfo).toBe('Consumir no local')
  })

  it('nunca prepaid — nada é pago no cardápio', () => {
    const local = buildOrderPayload(input())
    expect(local.paymentMethod.prepaid).toBe(false)
    expect(local.pinpadResponse).toBeNull()
    const t = buildOrderPayload(input({ payVia: 'totem' })).paymentMethod
    expect(t).toMatchObject({ type: 'totem', label: 'Pagar no totem', prepaid: false })
  })

  it('CPF só com dígitos; e-mail só quando a branch pede', () => {
    const c = { name: 'Ana', phone: '', cpf: '529.982.247-25', email: 'a@b.com' }
    expect(buildOrderPayload(input({ client: c })).cpfCustomer).toBe('52998224725')
    expect(buildOrderPayload(input({ client: c })).totemNF_email).toBeNull()
    expect(buildOrderPayload(input({ client: c, askEmail: true })).totemNF_email).toBe('a@b.com')
  })

  it('comanda só vai quando informada', () => {
    expect('comanda' in buildOrderPayload(input())).toBe(false)
    expect(buildOrderPayload(input({ comanda: ' 12 ' })).comanda).toBe('12')
  })
})

describe('complementos no formato plano do totem', () => {
  it('um objeto por item escolhido, com _id do produto (o backend busca o code por ele)', () => {
    const [item] = buildOrderPayload(input()).items
    expect(item.complements).toEqual([{
      _id: 'p-coca', name: 'Coca 300ml', price: 6.5, quantity: 2,
      complementGroupId: 'g-bebida', complementGroupName: 'Deseja uma bebida?',
      unitFraction: 1, fraction: '1/1', fractionText: 'Inteira', isPackaging: false,
    }])
  })

  it('fração: manda o preço já fracionado — o PDV soma price × quantity', () => {
    const meia = flattenComplement({ ...coca, price: 50, quantity: 1, unitFraction: 0.5 })
    expect(meia).toMatchObject({ price: 25, fraction: '1/2', fractionText: '1/2', unitFraction: 0.5 })
    const terco = flattenComplement({ ...coca, price: 60, quantity: 1, unitFraction: 1 / 3 })
    expect(terco).toMatchObject({ price: 20, fraction: '1/3' })
  })
})

describe('complementEntries — lê o formato antigo e o novo', () => {
  it('formato antigo, agrupado', () => {
    expect(complementEntries({ complements: [{ name: 'Bebida', items: [{ name: 'Coca', quantity: 2 }] }] }))
      .toEqual([{ name: 'Coca', quantity: 2 }])
  })

  it('formato novo, plano', () => {
    expect(complementEntries({ complements: [{ name: 'Coca', quantity: 2 }] }))
      .toEqual([{ name: 'Coca', quantity: 2 }])
  })

  it('sem complementos', () => {
    expect(complementEntries({})).toEqual([])
  })
})

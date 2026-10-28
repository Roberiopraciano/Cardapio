import { describe, it, expect, beforeEach } from 'vitest'
import {
  EMPTY_ADDRESS, EMPTY_BOOK, MAX_ADDRESSES, loadAddressBook, removeAddress, saveAddressBook, selectAddress,
  selectedAddress, upsertAddress, type DeliveryAddress,
} from '../lib/deliveryAddress'

// Os testes rodam em `node`, sem DOM
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => { store.clear() },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size },
} as Storage

const addr = (street: string, extra: Partial<DeliveryAddress> = {}): DeliveryAddress => ({
  ...EMPTY_ADDRESS, street, number: '10', district: 'Centro', city: 'Fortaleza', state: 'CE', reference: 'Perto da praça', ...extra,
})

let n = 0
const id = () => `id${++n}`

beforeEach(() => { store.clear(); n = 0 })

describe('vários endereços', () => {
  it('adiciona endereços e o último fica escolhido', () => {
    let b = upsertAddress(EMPTY_BOOK, addr('Rua A'), null, id)
    b = upsertAddress(b, addr('Rua B'), null, id)
    expect(b.list.map((a) => a.street)).toEqual(['Rua A', 'Rua B'])
    expect(selectedAddress(b)?.street).toBe('Rua B')
  })

  it('selecionar troca o escolhido sem mexer na lista', () => {
    let b = upsertAddress(EMPTY_BOOK, addr('Rua A'), null, id)
    b = upsertAddress(b, addr('Rua B'), null, id)
    b = selectAddress(b, 'id1')
    expect(selectedAddress(b)?.street).toBe('Rua A')
    expect(selectAddress(b, 'nao-existe')).toBe(b)
  })

  it('editar mantém o id e a posição', () => {
    let b = upsertAddress(EMPTY_BOOK, addr('Rua A'), null, id)
    b = upsertAddress(b, addr('Rua B'), null, id)
    b = upsertAddress(b, addr('Rua A', { number: '99' }), 'id1', id)
    expect(b.list.map((a) => [a.id, a.number])).toEqual([['id1', '99'], ['id2', '10']])
    expect(b.selectedId).toBe('id1')
  })

  it('o mesmo endereço digitado de novo não duplica (ignora caixa e espaços)', () => {
    let b = upsertAddress(EMPTY_BOOK, addr('Rua A'), null, id)
    b = upsertAddress(b, addr('  rua   a '), null, id)
    expect(b.list).toHaveLength(1)
    expect(b.selectedId).toBe('id1')
  })

  it('remover o escolhido passa para o primeiro que sobrar; remover tudo zera', () => {
    let b = upsertAddress(EMPTY_BOOK, addr('Rua A'), null, id)
    b = upsertAddress(b, addr('Rua B'), null, id)
    b = removeAddress(b, 'id2')
    expect(selectedAddress(b)?.street).toBe('Rua A')
    b = removeAddress(b, 'id1')
    expect(b).toEqual({ list: [], selectedId: null })
  })

  it(`guarda no máximo ${MAX_ADDRESSES}: o mais antigo que não é o escolhido sai`, () => {
    let b = EMPTY_BOOK
    for (let k = 1; k <= MAX_ADDRESSES + 2; k++) b = upsertAddress(b, addr(`Rua ${k}`), null, id)
    expect(b.list).toHaveLength(MAX_ADDRESSES)
    expect(b.list[0].street).toBe('Rua 3')
    expect(selectedAddress(b)?.street).toBe(`Rua ${MAX_ADDRESSES + 2}`)
  })

  it('grava e lê do aparelho', () => {
    const b = upsertAddress(EMPTY_BOOK, addr('Rua A'), null, id)
    saveAddressBook(b)
    expect(loadAddressBook()).toEqual(b)
  })

  it('importa o endereço único do formato antigo, uma vez', () => {
    store.set('cardapio.deliveryAddress', JSON.stringify(addr('Rua Velha')))
    const b = loadAddressBook()
    expect(b.list).toHaveLength(1)
    expect(selectedAddress(b)?.street).toBe('Rua Velha')
    expect(loadAddressBook().list).toHaveLength(1) // já está no formato novo
  })

  it('lixo no storage não quebra: começa vazio', () => {
    store.set('cardapio.deliveryAddresses', '{nao e json')
    expect(loadAddressBook()).toEqual(EMPTY_BOOK)
  })
})

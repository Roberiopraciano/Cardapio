import { describe, it, expect, beforeEach } from 'vitest'
import {
  setStorageScope, getStorageScope, scopedKey, readScopedWithMigration,
} from '../lib/storageScope'

const COMPANY_A = '6531aaaa0ce8b35a1c2d4e6f'
const COMPANY_B = '6531bbbb0ce8b35a1c2d4e6f'

/**
 * Os testes do projeto rodam em `node`, sem DOM. Um stub de `localStorage`
 * resolve sem arrastar o jsdom para dentro da suíte só por causa deste arquivo.
 */
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => { store.clear() },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size },
} as Storage

beforeEach(() => {
  localStorage.clear()
  setStorageScope('')
})

describe('scopedKey', () => {
  it('sem company usa a chave legada', () => {
    expect(scopedKey('cardapio_client')).toBe('cardapio_client')
  })

  it('com company sufixa a chave', () => {
    setStorageScope(COMPANY_A)
    expect(scopedKey('cardapio_client')).toBe(`cardapio_client__c:${COMPANY_A}`)
  })

  it('companies diferentes geram chaves diferentes', () => {
    setStorageScope(COMPANY_A)
    const a = scopedKey('cardapio_client')
    setStorageScope(COMPANY_B)
    expect(scopedKey('cardapio_client')).not.toBe(a)
  })

  it('espaço em branco conta como ausência de company', () => {
    setStorageScope('   ')
    expect(getStorageScope()).toBe('')
    expect(scopedKey('x')).toBe('x')
  })
})

describe('readScopedWithMigration', () => {
  it('lê o valor da própria company', () => {
    setStorageScope(COMPANY_A)
    localStorage.setItem(scopedKey('k'), 'meu')
    expect(readScopedWithMigration('k')).toBe('meu')
  })

  it('adota o valor global antigo na primeira leitura', () => {
    localStorage.setItem('k', 'legado')
    setStorageScope(COMPANY_A)
    expect(readScopedWithMigration('k')).toBe('legado')
    expect(localStorage.getItem(scopedKey('k'))).toBe('legado')
  })

  /**
   * O ponto sensível: dado global não tem company de origem. Adotá-lo em todas
   * reproduziria o vazamento que o prefixo veio consertar — apagar na primeira
   * adoção limita a uma company.
   */
  it('apaga o legado ao adotar, para não vazar para a segunda company', () => {
    localStorage.setItem('k', 'legado')

    setStorageScope(COMPANY_A)
    expect(readScopedWithMigration('k')).toBe('legado')
    expect(localStorage.getItem('k')).toBeNull()

    setStorageScope(COMPANY_B)
    expect(readScopedWithMigration('k')).toBeNull()
  })

  it('company B não vê o dado de A', () => {
    setStorageScope(COMPANY_A)
    localStorage.setItem(scopedKey('k'), 'de-A')
    setStorageScope(COMPANY_B)
    expect(readScopedWithMigration('k')).toBeNull()
  })

  it('valor próprio ganha do legado', () => {
    localStorage.setItem('k', 'legado')
    setStorageScope(COMPANY_A)
    localStorage.setItem(scopedKey('k'), 'proprio')
    expect(readScopedWithMigration('k')).toBe('proprio')
    // O legado segue intocado: não foi preciso adotar
    expect(localStorage.getItem('k')).toBe('legado')
  })

  it('sem company não tenta migrar para si mesmo', () => {
    localStorage.setItem('k', 'legado')
    expect(readScopedWithMigration('k')).toBe('legado')
    expect(localStorage.getItem('k')).toBe('legado')
  })

  it('devolve null quando não há nada', () => {
    setStorageScope(COMPANY_A)
    expect(readScopedWithMigration('k')).toBeNull()
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { markReviewPromptShown, wasReviewPromptShown } from '../lib/reviewPrompt'
import { setStorageScope } from '../lib/storageScope'

// Os testes rodam em `node`, sem DOM: stub mínimo de localStorage
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => { store.clear() },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size },
} as Storage

beforeEach(() => { store.clear(); setStorageScope('') })

describe('avaliação aparece uma vez', () => {
  it('nunca mostrada -> pode mostrar; depois de mostrada -> não repete', () => {
    expect(wasReviewPromptShown('b1')).toBe(false)
    markReviewPromptShown('b1')
    expect(wasReviewPromptShown('b1')).toBe(true)
  })

  it('vale por loja: outra filial ainda pergunta', () => {
    markReviewPromptShown('b1')
    expect(wasReviewPromptShown('b2')).toBe(false)
  })

  it('vale por empresa (escopo de armazenamento)', () => {
    setStorageScope('empresaA')
    markReviewPromptShown('b1')
    setStorageScope('empresaB')
    expect(wasReviewPromptShown('b1')).toBe(false)
  })

  it('storage bloqueado não quebra: apenas pode repetir', () => {
    const real = globalThis.localStorage
    globalThis.localStorage = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } } as unknown as Storage
    expect(() => markReviewPromptShown('b1')).not.toThrow()
    expect(wasReviewPromptShown('b1')).toBe(false)
    globalThis.localStorage = real
  })
})

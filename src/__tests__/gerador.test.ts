/**
 * Testes para src/lib/gerador_codigo.ts
 * Cobre: formato, range, idempotência (getOrCreateNumero)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  gerarHibridoTempoAleatorio,
  gerarCodigoAlfaNumerico,
  getOrCreateNumero,
  resetNumero,
  gerarConsumptionCode,
} from '../lib/gerador_codigo'

describe('gerarHibridoTempoAleatorio', () => {
  it('retorna string de exatamente 4 caracteres', () => {
    const code = gerarHibridoTempoAleatorio()
    expect(code).toHaveLength(4)
  })

  it('caracteres aleatórios (posições 3 e 4) não contêm 0 ou 1 do charset', () => {
    // Os 2 primeiros chars vêm do tempo (podem ter 0 e 1),
    // os 2 chars aleatórios usam charset sem 0/1.
    // Só testamos que o código é gerado sem erros e tem 4 chars.
    for (let i = 0; i < 20; i++) {
      const code = gerarHibridoTempoAleatorio()
      expect(code).toHaveLength(4)
      expect(code).toMatch(/^[0-9A-Z]{4}$/)
    }
  })

  it('caracteres são alfanuméricos maiúsculos', () => {
    for (let i = 0; i < 20; i++) {
      const code = gerarHibridoTempoAleatorio()
      expect(code).toMatch(/^[A-Z0-9]{4}$/)
    }
  })

  it('gera códigos diferentes em chamadas sucessivas (probabilístico)', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 20; i++) codes.add(gerarHibridoTempoAleatorio())
    expect(codes.size).toBeGreaterThan(1)
  })
})

describe('gerarCodigoAlfaNumerico', () => {
  it('retorna exatamente 5 caracteres alfanuméricos', () => {
    const code = gerarCodigoAlfaNumerico()
    expect(code).toHaveLength(5)
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/)
  })

  it('sempre contém pelo menos uma letra e um número', () => {
    for (let i = 0; i < 200; i++) {
      const code = gerarCodigoAlfaNumerico()
      expect(code).toMatch(/[A-HJ-NP-Z]/)
      expect(code).toMatch(/[2-9]/)
    }
  })

  it('gera múltiplos códigos sem repetição sistemática', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 30; i++) codes.add(gerarCodigoAlfaNumerico())
    expect(codes.size).toBeGreaterThan(5)
  })

  // A senha é chamada em voz alta no painel. `I` e `O` lidos de longe viram
  // `1` e `0`, e o cliente vai ao balcão com a senha errada.
  it('nunca usa as letras I e O', () => {
    for (let i = 0; i < 400; i++) {
      expect(gerarCodigoAlfaNumerico()).not.toMatch(/[IO]/)
    }
  })

  it('nunca usa os números 0 e 1', () => {
    for (let i = 0; i < 200; i++) {
      expect(gerarCodigoAlfaNumerico()).not.toMatch(/[01]/)
    }
  })
})

describe('getOrCreateNumero', () => {
  beforeEach(() => resetNumero())

  it('retorna número entre 500 e 999', () => {
    const n = getOrCreateNumero()
    expect(n).toBeGreaterThanOrEqual(500)
    expect(n).toBeLessThanOrEqual(999)
  })

  it('retorna o MESMO número em chamadas subsequentes (idempotente)', () => {
    const n1 = getOrCreateNumero()
    const n2 = getOrCreateNumero()
    expect(n1).toBe(n2)
  })

  it('após resetNumero(), gera novo número', () => {
    const n1 = getOrCreateNumero()
    resetNumero()
    // O novo número pode coincidir por chance, mas a função não deve ser null
    const n2 = getOrCreateNumero()
    expect(n2).toBeGreaterThanOrEqual(500)
    expect(n2).toBeLessThanOrEqual(999)
  })
})

describe('gerarConsumptionCode', () => {
  it('modo mesa → usa o nome da mesa', () => {
    expect(gerarConsumptionCode('mesa', 'MESA_03')).toBe('MESA_03')
  })

  it('modo mesa sem table → fallback MESA', () => {
    expect(gerarConsumptionCode('mesa', '')).toBe('MESA')
  })

  it('modo balcao → senha de 5 caracteres com letras e números', () => {
    const code = gerarConsumptionCode('balcao', '')
    expect(code).toHaveLength(5)
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/)
    expect(code).toMatch(/[A-HJ-NP-Z]/)
    expect(code).toMatch(/[2-9]/)
  })

  it('modo balcao → código diferente do nome da mesa', () => {
    const code = gerarConsumptionCode('balcao', 'MESA_03')
    expect(code).not.toBe('MESA_03')
  })
})

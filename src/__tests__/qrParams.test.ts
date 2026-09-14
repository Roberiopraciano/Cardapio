import { describe, it, expect } from 'vitest'
import { parseQrParams, COUNTER_TABLE, isKnownMode } from '../lib/qrParams'

const VALID_ID = '658afd3d0ce8b35a1c2d4e6f' // 24 hex

describe('parseQrParams — links válidos', () => {
  it('aceita mesa completa', () => {
    const r = parseQrParams(`?branch=${VALID_ID}&table=MESA_03&mode=mesa`)
    expect(r).toEqual({ ok: true, branchId: VALID_ID, table: 'MESA_03', mode: 'mesa' })
  })

  it('aceita balcão sem table', () => {
    const r = parseQrParams(`?branch=${VALID_ID}&mode=balcao`)
    expect(r).toEqual({ ok: true, branchId: VALID_ID, table: COUNTER_TABLE, mode: 'balcao' })
  })

  it('ignora table no modo balcão — lá não existe mesa', () => {
    const r = parseQrParams(`?branch=${VALID_ID}&mode=balcao&table=MESA_03`)
    expect(r).toMatchObject({ ok: true, table: COUNTER_TABLE })
  })

  it('tolera caixa e espaço no modo', () => {
    expect(parseQrParams(`?branch=${VALID_ID}&table=M1&mode=%20Mesa%20`))
      .toMatchObject({ ok: true, mode: 'mesa' })
    expect(parseQrParams(`?branch=${VALID_ID}&mode=BALCAO`))
      .toMatchObject({ ok: true, mode: 'balcao' })
  })

  it('aceita ObjectId em maiúsculas', () => {
    const r = parseQrParams(`?branch=${VALID_ID.toUpperCase()}&mode=balcao`)
    expect(r).toMatchObject({ ok: true })
  })

  it('aceita mesa com espaço, acento e hífen', () => {
    for (const t of ['Mesa 12', 'A-4', 'Varanda_2', 'Salão 1']) {
      expect(parseQrParams(`?branch=${VALID_ID}&table=${encodeURIComponent(t)}`))
        .toMatchObject({ ok: true, table: t })
    }
  })

  it('mesa é o modo padrão quando o parâmetro falta', () => {
    expect(parseQrParams(`?branch=${VALID_ID}&table=M1`))
      .toMatchObject({ ok: true, mode: 'mesa' })
  })
})

/**
 * Guarda o filtro de `settingsWeb.allowedModes`.
 *
 * O cadastro pode trazer modo previsto mas não implementado (`cartao`, Fase 2.6).
 * Sem filtro, o app adotava esse valor como modo interno **em silêncio** — nem
 * erro nem tela, só a regra de pagamento e a senha erradas.
 */
describe('isKnownMode', () => {
  it('aceita os modos implementados', () => {
    expect(isKnownMode('mesa')).toBe(true)
    expect(isKnownMode('balcao')).toBe(true)
  })

  it('recusa modo previsto mas não implementado', () => {
    expect(isKnownMode('cartao')).toBe(false)
    expect(isKnownMode('delivery')).toBe(false)
  })

  it('recusa o que não é string', () => {
    for (const v of [null, undefined, 1, {}, ['mesa']]) {
      expect(isKnownMode(v)).toBe(false)
    }
  })

  it('filtrar allowedModes desconhecido esvazia a lista, não escolhe errado', () => {
    expect(['cartao', 'delivery'].filter(isKnownMode)).toEqual([])
    expect(['cartao', 'balcao'].filter(isKnownMode)).toEqual(['balcao'])
  })
})

describe('parseQrParams — links inválidos', () => {
  it('sem branch → noBranch', () => {
    expect(parseQrParams('')).toMatchObject({ ok: false, kind: 'noBranch' })
    expect(parseQrParams('?table=MESA_03')).toMatchObject({ ok: false, kind: 'noBranch' })
    expect(parseQrParams('?branch=%20%20')).toMatchObject({ ok: false, kind: 'noBranch' })
  })

  /**
   * O caso que motivou a validação: link cortado ao ser compartilhado.
   * Antes ia para a API, virava 500 e o cliente via "sem conexão com o cardápio".
   */
  it('branch cortada → badLink, com o tamanho no motivo', () => {
    const r = parseQrParams('?branch=658afd3d0ce8b35')
    expect(r).toMatchObject({ ok: false, kind: 'badLink' })
    if (!r.ok) expect(r.reason).toContain('15 de 24')
  })

  it('branch com caractere não-hexadecimal → badLink', () => {
    expect(parseQrParams('?branch=658afd3d0ce8b35a1c2d4e6z'))
      .toMatchObject({ ok: false, kind: 'badLink' })
  })

  it('branch longa demais → badLink', () => {
    expect(parseQrParams(`?branch=${VALID_ID}00`))
      .toMatchObject({ ok: false, kind: 'badLink' })
  })

  it('modo desconhecido → badLink em vez de virar mesa por descuido', () => {
    expect(parseQrParams(`?branch=${VALID_ID}&mode=delivery`))
      .toMatchObject({ ok: false, kind: 'badLink' })
  })

  it('mesa sem table → badLink, não cai em BALCAO', () => {
    const r = parseQrParams(`?branch=${VALID_ID}&mode=mesa`)
    expect(r).toMatchObject({ ok: false, kind: 'badLink' })
    if (!r.ok) expect(r.reason).toContain('table')
  })

  it('table com caractere estranho → badLink', () => {
    for (const t of ['<script>', 'M#1', 'a/b']) {
      expect(parseQrParams(`?branch=${VALID_ID}&table=${encodeURIComponent(t)}`))
        .toMatchObject({ ok: false, kind: 'badLink' })
    }
  })

  it('table longa demais → badLink', () => {
    expect(parseQrParams(`?branch=${VALID_ID}&table=${'M'.repeat(33)}`))
      .toMatchObject({ ok: false, kind: 'badLink' })
  })
})

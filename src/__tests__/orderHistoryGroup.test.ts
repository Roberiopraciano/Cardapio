import { describe, it, expect } from 'vitest'
import { groupByDay, hasMultipleBranches } from '../lib/orderHistory'
import type { HistoryOrder } from '../lib/orderHistory'
import { paymentBadge } from '../lib/paymentLabel'

/** `new Date(y, m, d, h, min)` é hora **local** — é assim que o app agrupa. */
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString()

const order = (o: Partial<HistoryOrder>): HistoryOrder => ({
  at: at(2026, 7, 30),
  branchId: 'b1',
  mode: 'balcao',
  consumptioncode: 'A1',
  total: 10,
  items: [],
  ...o,
})

const NOW = new Date(2026, 6, 30, 15, 0) // 30/07/2026, local

describe('groupByDay', () => {
  it('junta pedidos do mesmo dia e soma o total', () => {
    const g = groupByDay([
      order({ at: at(2026, 7, 30, 12), total: 10 }),
      order({ at: at(2026, 7, 30, 20), total: 15 }),
    ], NOW)
    expect(g).toHaveLength(1)
    expect(g[0].orders).toHaveLength(2)
    expect(g[0].total).toBe(25)
  })

  it('rotula hoje e ontem', () => {
    const g = groupByDay([
      order({ at: at(2026, 7, 30) }),
      order({ at: at(2026, 7, 29) }),
    ], NOW)
    expect(g[0].label).toBe('Hoje')
    expect(g[1].label).toBe('Ontem')
  })

  it('mais recente primeiro, e dentro do dia também', () => {
    const g = groupByDay([
      order({ at: at(2026, 7, 28) }),
      order({ at: at(2026, 7, 30, 9) }),
      order({ at: at(2026, 7, 30, 21) }),
    ], NOW)
    expect(g.map((x) => x.label)[0]).toBe('Hoje')
    expect(g[0].orders[0].at).toBe(at(2026, 7, 30, 21))
  })

  /**
   * O bug que essa asserção impede: `toISOString()` para montar a chave do dia
   * empurra um pedido das 21h30 em GMT-3 para o dia seguinte, e o cliente veria
   * "Ontem" num pedido que fez à noite. Mesmo erro que já custou caro no horário
   * de funcionamento.
   */
  it('usa data LOCAL — pedido das 22h não cai no dia seguinte', () => {
    const g = groupByDay([order({ at: at(2026, 7, 30, 22, 30) })], NOW)
    expect(g[0].label).toBe('Hoje')
  })

  it('dia inválido é descartado sem derrubar a lista', () => {
    const g = groupByDay([
      order({ at: 'não é data' }),
      order({ at: at(2026, 7, 30) }),
    ], NOW)
    expect(g).toHaveLength(1)
  })

  it('lista vazia devolve vazio', () => {
    expect(groupByDay([], NOW)).toEqual([])
  })
})

describe('hasMultipleBranches', () => {
  it('etiqueta de unidade só com mais de uma', () => {
    expect(hasMultipleBranches([order({ branchId: 'b1' }), order({ branchId: 'b1' })])).toBe(false)
    expect(hasMultipleBranches([order({ branchId: 'b1' }), order({ branchId: 'b2' })])).toBe(true)
  })
})

describe('paymentBadge', () => {
  it('sem pagamento não inventa selo', () => {
    expect(paymentBadge(undefined)).toBeNull()
  })

  it('pago no app diz onde e o método', () => {
    const b = paymentBadge({ via: 'app', status: 'paid', method: 'pix' })
    expect(b).toMatchObject({ tone: 'paid', label: 'Pago no app', detail: 'Pix' })
  })

  /**
   * O caso central: em balcão, totem, caixa, garçom e entrega o dinheiro passa
   * por fora. O app sabe que **enviou** o pedido, não que foi pago — e quem lê
   * "Pago" sem ter pagado é parado na frente da fila.
   */
  it('balcão nunca afirma pago', () => {
    const b = paymentBadge({ via: 'counter' })
    expect(b?.tone).toBe('unknown')
    expect(b?.label).toBe('Pagamento no balcão')
    expect(b?.detail).toContain('não confirmado no app')
  })

  it('totem informa a senha e segue não confirmado', () => {
    const b = paymentBadge({ via: 'totem', handoffCode: 'T-4827' })
    expect(b?.tone).toBe('unknown')
    expect(b?.detail).toContain('T-4827')
    expect(b?.detail).toContain('não confirmado no app')
  })

  it('entrega em dinheiro mostra o troco pedido', () => {
    const b = paymentBadge({ via: 'on_delivery', method: 'cash', changeFor: 100 })
    expect(b?.detail).toContain('troco para 100,00')
  })

  it('meio acompanhado pelo app sem confirmação é pendência, não incógnita', () => {
    expect(paymentBadge({ via: 'app' })?.tone).toBe('pending')
    expect(paymentBadge({ via: 'pos' })?.tone).toBe('pending')
  })

  it('recusa é dita com clareza', () => {
    expect(paymentBadge({ via: 'app', status: 'failed' })?.tone).toBe('failed')
  })

  it('nenhum caminho por fora pode devolver tom `paid` sem status', () => {
    for (const via of ['counter', 'waiter', 'totem', 'on_delivery'] as const) {
      expect(paymentBadge({ via })?.tone).not.toBe('paid')
    }
  })
})

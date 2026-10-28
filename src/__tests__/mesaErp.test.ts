import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adoptClientOrderId, buildMesaItems, classifyMesa, clearMesaSession, erpCode, getMesaClientOrderId,
  groupBill, loadMesaSession, MesaItemError, mesaErrorMessage, parseMesaBill, saveMesaSession, SESSION_MAX_AGE_MS,
} from '../lib/mesaErp'
import type { CartItem, Product } from '../types'

const MINE = '8fa1b920-5c12-4e02-9844-3c829e1f5402'

describe('classifyMesa', () => {
  it('mesa não encontrada ou sem resposta = livre (abre com PIN)', () => {
    expect(classifyMesa({ encontrada: false }, MINE)).toBe('livre')
    expect(classifyMesa({ status: 'NAO_ENCONTRADA' }, MINE)).toBe('livre')
    expect(classifyMesa(undefined, MINE)).toBe('livre')
  })

  it('mesa aberta pelo garçom/PDV (sem clientOrderId) = ocupada: entra na mesma comanda, sem PIN', () => {
    expect(classifyMesa({ encontrada: true, clientOrderId: null, venStatus: 1, podeLancarItens: true }, MINE)).toBe('ocupada')
  })

  it('mesa aberta com outro clientOrderId = ocupada (entra na comanda dele)', () => {
    expect(classifyMesa({ encontrada: true, clientOrderId: 'outro', venStatus: 1 }, MINE)).toBe('ocupada')
  })

  it('mesa deste aparelho e aberta = minha (pode lançar), sem diferenciar maiúsculas', () => {
    expect(classifyMesa({ encontrada: true, clientOrderId: MINE.toUpperCase(), venStatus: 1, podeLancarItens: true }, MINE)).toBe('minha')
  })

  it('mesa em pagamento/conferência = bloqueada, seja a comanda deste aparelho ou de outro canal', () => {
    expect(classifyMesa({ encontrada: true, clientOrderId: MINE, venStatus: 3, podeLancarItens: false }, MINE)).toBe('bloqueada')
    expect(classifyMesa({ encontrada: true, clientOrderId: MINE, venStatus: 70 }, MINE)).toBe('bloqueada')
    expect(classifyMesa({ encontrada: true, clientOrderId: null, venStatus: 3, podeLancarItens: false }, MINE)).toBe('bloqueada')
  })
})

describe('sessão da mesa', () => {
  // Os testes rodam em `node`, sem DOM: stub mínimo de localStorage
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    })
  })

  it('guarda e devolve a sessão, e expira antes do token (6h)', () => {
    saveMesaSession('b1', 'MESA_01', { clientOrderId: MINE, mesaToken: 'tok', numeroMesa: 1 }, 1_000)
    expect(loadMesaSession('b1', 'MESA_01', 2_000)?.mesaToken).toBe('tok')
    expect(loadMesaSession('b1', 'MESA_01', 1_000 + SESSION_MAX_AGE_MS)).toBeNull()
    expect(loadMesaSession('b1', 'MESA_02', 2_000)).toBeNull()
  })

  it('clearMesaSession remove a sessão', () => {
    saveMesaSession('b1', 'MESA_01', { clientOrderId: MINE, mesaToken: 'tok', numeroMesa: 1 })
    clearMesaSession('b1', 'MESA_01')
    expect(loadMesaSession('b1', 'MESA_01')).toBeNull()
  })

  it('clientOrderId é estável por filial+mesa e adota o que a loja devolveu', () => {
    const a = getMesaClientOrderId('b1', 'MESA_01')
    expect(getMesaClientOrderId('b1', 'MESA_01')).toBe(a)
    expect(getMesaClientOrderId('b1', 'MESA_02')).not.toBe(a)
    adoptClientOrderId('b1', 'MESA_01', MINE)
    expect(getMesaClientOrderId('b1', 'MESA_01')).toBe(MINE)
  })
})

const product = (over: Partial<Product>): Product => ({
  _id: 'p', name: 'Produto', category: 'c', price: 10, active: true, seq: 1, peopleCount: 1,
  complementsGroups: [], complementsId: [], ...over,
}) as Product

describe('buildMesaItems', () => {
  const burger = product({ _id: 'p1', name: 'Burger', code: '171', price: 29.7 })
  const bacon = product({ _id: 'c1', name: 'Bacon', code: '88888888', price: 4.9 })
  const embalagem = product({ _id: 'e1', name: 'Embalagem', code: '9' })

  it('manda código do ERP, observação e complementos aninhados; embalagem fica de fora', () => {
    const item = {
      product: burger, quantity: 2, note: ' sem cebola ', subTotal: 0,
      addedComplements: [
        { _id: 'c1', name: 'Bacon', price: 4.9, quantity: 1, groupId: 'g', groupName: 'Extras' },
        { _id: 'e1', name: 'Embalagem', price: 1, quantity: 1, groupId: 'g', groupName: 'Emb', isPackaging: true },
      ],
    } as CartItem

    const [out] = buildMesaItems([item], [burger, bacon, embalagem])
    expect(out.codigoProduto).toBe(171)
    expect(out.produtoId).toBe('p1') // o Laravel resolve código e preço pelo _id
    expect(out.quantidade).toBe(2)
    expect(out.observacao).toBe('sem cebola')
    expect(out.complements).toEqual([{ produtoId: 'c1', codigoProduto: 88888888, quantidade: 1, valorUnitario: 4.9, observacao: null }])
  })

  it('aplica a fração no preço de referência do complemento (meia pizza)', () => {
    const item = {
      product: burger, quantity: 1, note: '', subTotal: 0,
      addedComplements: [{ _id: 'c1', name: 'Bacon', price: 10, quantity: 1, groupId: 'g', groupName: 'G', unitFraction: 0.5 }],
    } as CartItem
    const comp = buildMesaItems([item], [burger, bacon])[0].complements?.[0]
    expect(comp?.valorUnitario).toBe(5)
    expect(comp?.fracao).toBe(0.5)
  })

  it('produto ou complemento sem código do ERP não vai para a loja', () => {
    const semCodigo = product({ _id: 'x', name: 'Suco', code: '' })
    const item = { product: semCodigo, quantity: 1, note: '', subTotal: 0, addedComplements: [] } as CartItem
    expect(() => buildMesaItems([item], [semCodigo])).toThrow(MesaItemError)

    const comp = {
      product: burger, quantity: 1, note: '', subTotal: 0,
      addedComplements: [{ _id: 'zzz', name: 'Extra', price: 1, quantity: 1, groupId: 'g', groupName: 'G' }],
    } as CartItem
    expect(() => buildMesaItems([comp], [burger])).toThrow(/Extra/)
  })
})

describe('erpCode e mensagens', () => {
  it('só aceita inteiro positivo', () => {
    expect(erpCode('171')).toBe(171)
    expect(erpCode(' 7 ')).toBe(7)
    expect(erpCode('A12')).toBeNull()
    expect(erpCode('0')).toBeNull()
    expect(erpCode(undefined)).toBeNull()
  })

  it('traduz os códigos da loja e tem texto padrão para os desconhecidos', () => {
    expect(mesaErrorMessage('MOVIMENTO_FECHADO')).toMatch(/caixa/i)
    expect(mesaErrorMessage('LOJA_OFFLINE_TIMEOUT')).toMatch(/NÃO foi lançado/)
    expect(mesaErrorMessage('PIN_BLOQUEADO')).toMatch(/2 minutos/)
    expect(mesaErrorMessage('XYZ')).toMatch(/garçom/i)
    expect(mesaErrorMessage('XYZ', 'texto do servidor')).toBe('texto do servidor')
  })
})

const CONTA = {
  success: true,
  data: {
    statusDescricao: 'ABERTA',
    garcom: { codigo: 5, nome: 'Marcos Silva' },
    horaAbertura: '20:15',
    horaUltimoLancamento: '20:38',
    totais: { valorProdutos: 128.5, valorServico: 12.85, valorDesconto: 0, valorBruto: 141.35, valorTotalPago: 50, saldoRestante: 91.35 },
    itens: [
      { id: 1, codigoProduto: 105, descricao: 'Hambúrguer', categoria: 'Lanches', quantidade: 2, valorTotal: 76, nomeCliente: 'Roberio', cancelado: false },
      { id: 2, codigoProduto: 88, descricao: 'Batata', categoria: 'Porções', quantidade: 1, valorTotal: 26.5, nomeCliente: 'Ana', cancelado: false },
      { id: 3, codigoProduto: 201, descricao: 'Refri', categoria: 'Bebidas', quantidade: 2, valorTotal: 26, nomeCliente: null, cancelado: false },
      { id: 4, codigoProduto: 201, descricao: 'Refri errado', categoria: 'Bebidas', quantidade: 1, valorTotal: 13, nomeCliente: null, cancelado: true },
    ],
    pagamentos: [{ id: 9, formaPagamentoNome: 'PIX Dinâmico Nuvem', valor: 50, dataHora: '2026-10-26T20:35:10' }],
  },
}

describe('conta da mesa (mesa.conta)', () => {
  it('normaliza a resposta da loja: totais, itens e pagamentos', () => {
    const bill = parseMesaBill(CONTA)
    expect(bill.offline).toBe(false)
    expect(bill.status).toBe('ABERTA')
    expect(bill.garcomNome).toBe('Marcos Silva')
    expect(bill.totais).toEqual({ produtos: 128.5, servico: 12.85, desconto: 0, bruto: 141.35, pago: 50, restante: 91.35 })
    expect(bill.itens).toHaveLength(4)
    expect(bill.pagamentos).toEqual([{ id: 9, forma: 'PIX Dinâmico Nuvem', valor: 50, dataHora: '2026-10-26T20:35:10' }])
  })

  it('agrupa por pessoa (item do PDV = Garçom / Balcão) e por categoria, sem contar cancelado', () => {
    const { itens } = parseMesaBill(CONTA)
    expect(groupBill(itens, 'pessoa').map((g) => [g.label, g.total])).toEqual([
      ['Roberio', 76], ['Ana', 26.5], ['Garçom / Balcão', 26],
    ])
    expect(groupBill(itens, 'categoria').map((g) => [g.label, g.count, g.total])).toEqual([
      ['Lanches', 1, 76], ['Porções', 1, 26.5], ['Bebidas', 1, 26],
    ])
  })

  it('espelho offline da nuvem: avisa e usa os totais guardados', () => {
    const bill = parseMesaBill({
      success: true, origem: 'CACHE_OFFLINE_MONGODB', aviso: 'Exibindo última sincronização.',
      dados: { statusMesa: 'ABERTA', garcom: { nome: 'Marcos' }, totais: { subtotal: 100, taxaServico: 10, total: 110, totalPago: 0, saldoPendente: 110 } },
    })
    expect(bill.offline).toBe(true)
    expect(bill.notice).toMatch(/última sincronização/)
    expect(bill.totais.bruto).toBe(110)
    expect(bill.itens).toEqual([])
  })

  it('resposta vazia ou com lixo não quebra a tela', () => {
    const bill = parseMesaBill({ success: true, data: { itens: 'x', totais: null } })
    expect(bill.itens).toEqual([])
    expect(bill.totais.bruto).toBe(0)
    expect(bill.status).toBe('ABERTA')
  })
})

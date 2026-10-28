import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adoptClientOrderId, buildMesaItems, classifyMesa, clearMesaSession, erpCode, getMesaClientOrderId,
  billItemTotal, groupEntries, billOriginLabel, billPersonLabel, isStaffItem, buildPersonColors, flattenBill, groupBill, loadMesaSession, MesaItemError, mesaErrorMessage, parseMesaBill, saveMesaSession, SESSION_MAX_AGE_MS,
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

describe('cores por pessoa na conta', () => {
  const { itens } = parseMesaBill(CONTA)

  it('cada pessoa da mesa tem cor própria e o garçom/balcão tem a neutra', () => {
    const colors = buildPersonColors(itens)
    const roberio = colors.get('Roberio')!
    const ana = colors.get('Ana')!
    const staff = colors.get('Garçom / Balcão')!
    expect(roberio).not.toEqual(ana)
    expect(staff).not.toEqual(roberio)
    expect(staff).not.toEqual(ana)
  })

  it('é estável: a mesma pessoa mantém a cor quando entram itens novos depois', () => {
    const antes = buildPersonColors(itens).get('Ana')
    const depois = buildPersonColors([...itens, { ...itens[0], id: 99, nomeCliente: 'Carlos' }]).get('Ana')
    expect(depois).toEqual(antes)
  })

  it('não repete cor entre as 7 primeiras pessoas', () => {
    const muitos = Array.from({ length: 7 }, (_, n) => ({ ...itens[0], id: n, nomeCliente: `P${n}` }))
    const cores = [...buildPersonColors(muitos).entries()].filter(([k]) => k !== 'Garçom / Balcão').map(([, c]) => c.bg)
    expect(new Set(cores).size).toBe(7)
  })

  it('traduz o canal de origem', () => {
    expect(billOriginLabel('CARDAPIO_DIGITAL')).toBe('Cardápio digital')
    expect(billOriginLabel('PDV')).toBe('Garçom / PDV')
    expect(billOriginLabel(null)).toBe('—')
  })
})

// Trecho de uma resposta real de mesa.conta (B99): combo com a bebida dentro, aninhada em `complements`
const REAL = {
  success: true,
  data: {
    statusDescricao: 'ABERTA',
    totais: { valorProdutos: 98.7, valorBruto: 98.7, valorTotalPago: 0, saldoRestante: 98.7 },
    itens: [
      { id: 672183, seqPro: 1, seqProPai: 0, codigoProduto: 88888888, name: 'SEM COD PDV', descricao: 'SEM COD PDV', categoria: 'PROMO', quantity: 1, quantidade: 1, valorUnitario: 12.9, valorTotal: 12.9, observacao: 'Item 300103', nomeCliente: 'Cleberson', cancelado: false, complements: [] },
      { id: 672193, seqPro: 11, seqProPai: 0, codigoProduto: 1, descricao: 'Delicia 1', categoria: 'LINHA SUPER', quantidade: 1, valorUnitario: 36, valorTotal: 36, nomeCliente: 'Cleberson', cancelado: false,
        complements: [{ id: 672194, seqPro: 12, seqProPai: 11, codigoProduto: 100, descricao: 'MIX 300 COCA C', categoria: 'BEBIDAS', quantidade: 1, valorUnitario: 6.9, valorTotal: 6.9, nomeCliente: 'Cleberson', cancelado: false, complements: [] }] },
      { id: 672195, seqPro: 13, seqProPai: 0, codigoProduto: 1, descricao: 'Delicia 1', categoria: 'LINHA SUPER', quantidade: 1, valorUnitario: 36, valorTotal: 36, nomeCliente: 'Teste 2', cancelado: false,
        complements: [{ id: 672196, seqPro: 14, seqProPai: 13, codigoProduto: 100, descricao: 'MIX 300 COCA C', categoria: 'BEBIDAS', quantidade: 1, valorUnitario: 6.9, valorTotal: 6.9, nomeCliente: 'Teste 2', cancelado: false, complements: [] }] },
    ],
    itensPlano: [],
    pagamentos: [],
  },
}

describe('itens de dentro dos combos em árvore', () => {
  it('pendura o complemento no item pai e não o repete na lista principal', () => {
    const { itens } = parseMesaBill(REAL)
    expect(itens.map((i) => i.descricao)).toEqual(['SEM COD PDV', 'Delicia 1', 'Delicia 1'])
    expect(itens[1].filhos.map((f) => [f.descricao, f.seqProPai])).toEqual([['MIX 300 COCA C', 11]])
    expect(itens[0].filhos).toEqual([])
  })

  it('o total do item soma o que tem dentro (o complemento é cobrado além do pai)', () => {
    const { itens } = parseMesaBill(REAL)
    expect(billItemTotal(itens[1])).toBe(42.9)
    expect(billItemTotal(itens[0])).toBe(12.9)
  })

  it('por pessoa e por categoria contam os itens de dentro', () => {
    const { itens } = parseMesaBill(REAL)
    expect(groupBill(itens, 'pessoa').map((g) => [g.label, g.total])).toEqual([['Teste 2', 42.9], ['Cleberson', 55.8]].sort((a, b) => (b[1] as number) - (a[1] as number)))
    const cat = Object.fromEntries(groupBill(itens, 'categoria').map((g) => [g.label, g.total]))
    expect(cat['BEBIDAS']).toBe(13.8)
    expect(cat['LINHA SUPER']).toBe(72)
  })

  it('a soma dos grupos bate com o valorProdutos da loja', () => {
    const { itens, totais } = parseMesaBill(REAL)
    const soma = groupBill(itens, 'pessoa').reduce((acc, g) => Math.round((acc + g.total) * 100) / 100, 0)
    expect(soma).toBe(totais.produtos)
  })

  it('item principal cancelado cancela também o que está dentro dele', () => {
    const { itens } = parseMesaBill({ success: true, data: { itens: [
      { id: 1, seqPro: 1, seqProPai: 0, descricao: 'Combo', categoria: 'C', quantidade: 1, valorTotal: 30, cancelado: true,
        complements: [{ id: 2, seqPro: 2, seqProPai: 1, descricao: 'Refri', categoria: 'B', quantidade: 1, valorTotal: 5, cancelado: false }] },
    ] } })
    expect(flattenBill(itens).every((i) => i.cancelado)).toBe(true)
    expect(billItemTotal(itens[0])).toBe(0)
    expect(groupBill(itens, 'categoria')).toEqual([])
  })

  it('lista plana com seqProPai também vira árvore', () => {
    const { itens } = parseMesaBill({ success: true, data: { itens: [
      { id: 1, seqPro: 1, seqProPai: 0, descricao: 'Pizza', categoria: 'P', quantidade: 1, valorTotal: 40 },
      { id: 2, seqPro: 2, seqProPai: 1, descricao: 'Borda', categoria: 'P', quantidade: 1, valorTotal: 8 },
      { id: 3, seqPro: 3, seqProPai: 0, descricao: 'Suco', categoria: 'B', quantidade: 1, valorTotal: 9 },
    ] } })
    expect(itens.map((i) => i.descricao)).toEqual(['Pizza', 'Suco'])
    expect(itens[0].filhos.map((f) => f.descricao)).toEqual(['Borda'])
  })
})

describe('quem lançou o item', () => {
  const base = { id: 1, descricao: 'Refri', categoria: 'Bebidas', quantidade: 1, valorTotal: 6, cancelado: false }

  it('item do PDV mostra o nome do garçom que a loja informou em quemLancou', () => {
    const { itens } = parseMesaBill({ success: true, data: { itens: [
      { ...base, origem: 'PDV', nomeCliente: null, quemLancou: 'Garçom (Marcos Silva)' },
    ] } })
    expect(isStaffItem(itens[0])).toBe(true)
    expect(billPersonLabel(itens[0])).toBe('Garçom (Marcos Silva)')
  })

  it('só cai no rótulo genérico quando a loja não diz quem foi', () => {
    const { itens } = parseMesaBill({ success: true, data: { itens: [{ ...base, origem: 'PDV', nomeCliente: null }] } })
    expect(billPersonLabel(itens[0])).toBe('Garçom / Balcão')
  })

  it('item do cardápio mostra o cliente, mesmo se quemLancou vier diferente', () => {
    const { itens } = parseMesaBill({ success: true, data: { itens: [
      { ...base, origem: 'CARDAPIO_DIGITAL', nomeCliente: 'Ana', quemLancou: 'Ana' },
      { ...base, id: 2, origem: 'CARDAPIO_DIGITAL', nomeCliente: null, quemLancou: null },
    ] } })
    expect(billPersonLabel(itens[0])).toBe('Ana')
    expect(isStaffItem(itens[1])).toBe(false)
    expect(billPersonLabel(itens[1])).toBe('Cliente')
  })

  it('por pessoa separa cada garçom pelo nome, e o atendimento fica no cinza', () => {
    const { itens } = parseMesaBill({ success: true, data: { itens: [
      { ...base, id: 1, origem: 'PDV', nomeCliente: null, quemLancou: 'Garçom (Marcos Silva)', valorTotal: 10 },
      { ...base, id: 2, origem: 'PDV', nomeCliente: null, quemLancou: 'Garçom (Paula)', valorTotal: 20 },
      { ...base, id: 3, origem: 'CARDAPIO_DIGITAL', nomeCliente: 'Ana', quemLancou: 'Ana', valorTotal: 5 },
    ] } })
    expect(groupBill(itens, 'pessoa').map((g) => [g.label, g.total])).toEqual([
      ['Garçom (Paula)', 20], ['Garçom (Marcos Silva)', 10], ['Ana', 5],
    ])
    const colors = buildPersonColors(itens)
    expect(colors.get('Garçom (Marcos Silva)')).toEqual(colors.get('Garçom (Paula)'))
    expect(colors.get('Ana')).not.toEqual(colors.get('Garçom (Paula)'))
  })
})

describe('detalhes de um grupo (pessoa / categoria)', () => {
  it('por pessoa: só os itens dela, incluindo o que veio dentro do combo, e a soma bate com o grupo', () => {
    const { itens } = parseMesaBill(REAL)
    const entries = groupEntries(itens, 'pessoa', 'Cleberson')
    expect(entries.map((e) => e.item.descricao)).toEqual(['SEM COD PDV', 'Delicia 1', 'MIX 300 COCA C'])
    const soma = Math.round(entries.reduce((a, e) => a + e.item.valorTotal, 0) * 100) / 100
    expect(soma).toBe(groupBill(itens, 'pessoa').find((g) => g.label === 'Cleberson')!.total)
  })

  it('por categoria: só os produtos dela, de qualquer pessoa, com o item pai quando está dentro de um combo', () => {
    const { itens } = parseMesaBill(REAL)
    const entries = groupEntries(itens, 'categoria', 'BEBIDAS')
    expect(entries.map((e) => [e.item.nomeCliente, e.parent?.descricao])).toEqual([
      ['Cleberson', 'Delicia 1'], ['Teste 2', 'Delicia 1'],
    ])
    const soma = Math.round(entries.reduce((a, e) => a + e.item.valorTotal, 0) * 100) / 100
    expect(soma).toBe(groupBill(itens, 'categoria').find((g) => g.label === 'BEBIDAS')!.total)
  })

  it('cancelado (e o que está dentro dele) fica fora', () => {
    const { itens } = parseMesaBill({ success: true, data: { itens: [
      { id: 1, seqPro: 1, seqProPai: 0, descricao: 'Combo', categoria: 'C', quantidade: 1, valorTotal: 30, nomeCliente: 'Ana', cancelado: true,
        complements: [{ id: 2, seqPro: 2, seqProPai: 1, descricao: 'Refri', categoria: 'C', quantidade: 1, valorTotal: 5, nomeCliente: 'Ana' }] },
    ] } })
    expect(groupEntries(itens, 'pessoa', 'Ana')).toEqual([])
    expect(groupEntries(itens, 'categoria', 'C')).toEqual([])
  })

  it('pessoa/categoria que não existe: lista vazia', () => {
    expect(groupEntries(parseMesaBill(REAL).itens, 'pessoa', 'Ninguém')).toEqual([])
  })
})

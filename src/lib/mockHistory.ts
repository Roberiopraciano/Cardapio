/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  DADOS FALSOS — HISTÓRICO DE PEDIDOS                                     ║
 * ║                                                                          ║
 * ║  Existe só para visualizar a tela `/pedidos` sem precisar fechar vários  ║
 * ║  pedidos de verdade antes.                                              ║
 * ║                                                                          ║
 * ║  ►► COMO DESABILITAR: troque MOCK_HISTORY para `false` logo abaixo. ◄◄   ║
 * ║                                                                          ║
 * ║  Com `false`, a tela volta a ler só o localStorage real                 ║
 * ║  (`src/lib/orderHistory.ts`) e este arquivo sai do bundle.              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import type { HistoryOrder } from './orderHistory'

/** ►► TROQUE PARA `false` PARA USAR SÓ O HISTÓRICO REAL DO APARELHO ◄◄ */
export const MOCK_HISTORY = true

export const MOCK_HISTORY_BANNER = 'Dados de demonstração — não são seus pedidos'

if (MOCK_HISTORY) {
  console.warn(
    '[pedidos] MOCK_HISTORY está LIGADO: a tela /pedidos mostra dados falsos. ' +
    'Desligue em src/lib/mockHistory.ts antes de publicar.',
  )
}

function hoursAgo(h: number, now: number): string {
  return new Date(now - h * 3_600_000).toISOString()
}

/**
 * Pedidos falsos cobrindo cada combinação que a tela precisa distinguir.
 *
 * **Datas espalhadas de propósito**: hoje, ontem, esta semana e mais antigo, para
 * exercitar o agrupamento por dia e os rótulos "Hoje" / "Ontem" / dia da semana.
 *
 * **Os seis casos de pagamento**, que é o miolo desta tela:
 *
 * | # | Situação | O que a tela deve dizer |
 * |---|---|---|
 * | 1 | balcão, senha na mão | "Pagamento no balcão · não confirmado no app" |
 * | 2 | pago no app com Pix | "Pago no app · Pix" |
 * | 3 | enviado ao totem | "Pagamento no totem · Contra-senha T-4827 · não confirmado" |
 * | 4 | delivery pago online | "Pago no app · Crédito" + endereço |
 * | 5 | delivery em dinheiro | "Pagamento na entrega · Dinheiro · troco para 100,00" |
 * | 6 | mesa, paga com garçom | "Pagamento com o garçom · não confirmado no app" |
 *
 * O caso 1 é o mais comum na operação real, e o mais importante de acertar: o app
 * sabe que **enviou** o pedido, não que foi pago.
 *
 * Uma unidade diferente (`branchId + '-2'`) aparece para exercitar a etiqueta de
 * unidade, que só surge quando o histórico tem mais de uma.
 *
 * Os falsos são **mesclados** com o histórico real do aparelho, não o
 * substituem: assim dá para enviar um pedido de verdade e vê-lo aparecer no
 * topo, junto dos de exemplo.
 */
export function getMockHistory(now: number, branchId: string, branchName?: string): HistoryOrder[] {
  return [
    // ── 1. Balcão: o caso mais comum. O app NÃO sabe se foi pago ──
    {
      at: hoursAgo(2, now),
      branchId,
      branchName,
      mode: 'balcao',
      consumptioncode: '3K4M',
      consumptionint: 731,
      total: 38.8,
      payment: { via: 'counter' },
      items: [
        {
          name: 'Frango crocante',
          quantity: 1,
          amount: 25.9,
          extras: ['Coca cola 300ml'],
        },
        {
          name: 'Porção de batata pequena',
          quantity: 1,
          amount: 12.9,
          extras: [],
        },
      ],
    },
    // ── 2. Pago no app, com Pix confirmado ──
    {
      at: hoursAgo(4, now),
      branchId,
      branchName,
      mode: 'balcao',
      consumptioncode: '7B2Q',
      consumptionint: 728,
      total: 31.4,
      payment: {
        via: 'app',
        status: 'paid',
        method: 'pix',
        paidAt: hoursAgo(4, now),
      },
      items: [
        { name: 'Combo delícia 2 - Super Frango', quantity: 1, amount: 31.4, extras: ['Coca cola 500ml'] },
      ],
    },
    // ── 3. Enviado ao totem: sabemos que saiu, não que foi pago ──
    {
      at: hoursAgo(6, now),
      branchId,
      branchName,
      mode: 'balcao',
      consumptioncode: '9F1T',
      consumptionint: 725,
      total: 44.7,
      payment: { via: 'totem', handoffCode: 'T-4827' },
      items: [
        { name: 'Pizza brotinho calabresa', quantity: 1, amount: 34.9, extras: [] },
        { name: 'Guaraná lata', quantity: 2, amount: 9.8, extras: [] },
      ],
    },
    // ── 4. Delivery pago online, com endereço ──
    {
      at: hoursAgo(27, now),
      branchId,
      branchName,
      mode: 'delivery',
      consumptioncode: 'DL-5512',
      total: 76.4,
      payment: {
        via: 'app',
        status: 'paid',
        method: 'credit',
        paidAt: hoursAgo(27, now),
      },
      address: {
        label: 'Casa',
        street: 'Rua das Flores',
        number: '123',
        complement: 'ap 42',
        district: 'Centro',
        city: 'Fortaleza',
        reference: 'portão azul, ao lado da padaria',
        deliveryFee: 8.5,
      },
      items: [
        { name: 'Pizza grande 2 sabores', quantity: 1, amount: 67.9, extras: ['½ Calabresa', '½ Frango c/ catupiry'] },
      ],
    },
    // ── 5. Delivery em dinheiro: troco pedido, pagamento na porta ──
    {
      at: hoursAgo(30, now),
      branchId: `${branchId}-2`,
      branchName: branchName ? `${branchName} — Unidade Aldeota` : 'Unidade Aldeota',
      mode: 'delivery',
      consumptioncode: 'DL-5498',
      total: 52.9,
      payment: { via: 'on_delivery', method: 'cash', changeFor: 100 },
      address: {
        label: 'Trabalho',
        street: 'Av. Dom Luís',
        number: '900',
        complement: 'sala 12',
        district: 'Aldeota',
        city: 'Fortaleza',
        deliveryFee: 6,
      },
      items: [
        { name: 'Marmita executiva', quantity: 2, amount: 46.9, extras: ['Feijão de caldo', 'Sem salada'] },
      ],
    },
    {
      at: hoursAgo(26, now),
      branchId,
      branchName,
      mode: 'mesa',
      table: 'MESA_07',
      consumptioncode: 'MESA_07',
      consumptionint: 645,
      comanda: '9',
      total: 71.7,
      // ── 6. Mesa: fechada com o garçom, fora do app ──
      payment: { via: 'waiter' },
      items: [
        {
          name: 'Cheeseburguer simples',
          quantity: 2,
          amount: 25.8,
          extras: ['2× Bacon', '2× Cheddar extra'],
        },
        {
          name: 'Açaí 500ml',
          quantity: 1,
          amount: 25.9,
          extras: ['Leite condensado', 'Granola'],
        },
        {
          name: 'Suco Natural de Laranja 300ml',
          quantity: 2,
          amount: 19.8,
          extras: [],
        },
      ],
    },
    {
      at: hoursAgo(52, now),
      branchId,
      branchName,
      mode: 'mesa',
      table: 'MESA_02',
      consumptioncode: 'MESA_02',
      consumptionint: 588,
      total: 23.0,
      items: [
        {
          name: 'Bauru',
          quantity: 1,
          amount: 23.0,
          extras: ['Sem cebola'],
        },
      ],
    },
  ]
}

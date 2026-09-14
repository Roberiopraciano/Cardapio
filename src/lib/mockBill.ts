/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  DADOS FALSOS — CONTA DA MESA                                            ║
 * ║                                                                          ║
 * ║  Existe só para visualizar a tela `/conta` enquanto o backend não expõe  ║
 * ║  a consulta de mesa aberta (ver DOCUMENTACAO.md → "Conta da mesa").      ║
 * ║                                                                          ║
 * ║  ►► COMO DESABILITAR: troque MOCK_BILL para `false` logo abaixo. ◄◄      ║
 * ║                                                                          ║
 * ║  É a única mudança necessária. Com `false`, a tela volta a consultar     ║
 * ║  `GET api/orders` normalmente e este arquivo sai do bundle (tree-shake). ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import type { TableOrder, TableSessionInfo } from '../api/client'
import { CARDAPIO_ORIGIN } from './orderAuthor'

/** ►► TROQUE PARA `false` PARA USAR A API REAL ◄◄ */
export const MOCK_BILL = true

/**
 * Enquanto o mock está ligado a tela mostra uma tarja de aviso e o console
 * grita. É de propósito: uma tela de conta com valores inventados chegando ao
 * cliente é pior que a tela não existir — ele confere contra o que comeu e
 * perde a confiança no cardápio inteiro.
 */
export const MOCK_BANNER = 'Dados de demonstração — não é a conta real'

if (MOCK_BILL) {
  console.warn(
    '[conta] MOCK_BILL está LIGADO: a tela /conta mostra dados falsos. ' +
    'Desligue em src/lib/mockBill.ts antes de publicar.',
  )
}

/**
 * Progressão de status para ver a tela de confirmação andando.
 *
 * Comprimida de propósito: em produção a cozinha leva 10–20 minutos, e esperar
 * isso para conferir uma tela não é teste, é castigo. Aqui o ciclo inteiro roda
 * em 1 minuto — mas passando pelos **mesmos** estados, na mesma ordem.
 *
 * Delivery ganha `on_the_way`, que não existe nos outros modos.
 *
 * @param elapsedMs tempo desde a primeira consulta desta tela
 */
export function getMockOrderStatus(
  elapsedMs: number,
  mode: 'mesa' | 'balcao' | 'delivery' = 'mesa',
): string {
  const s = Math.floor(elapsedMs / 1000)
  if (s < 15) return 'pending'
  if (s < 30) return 'in_progress'
  if (s < 45) return 'ready'
  if (mode === 'delivery' && s < 60) return 'on_the_way'
  return 'delivered'
}

/** Horário relativo ao momento da consulta, para a tela parecer viva. */
function minutesAgo(min: number, now: number): string {
  return new Date(now - min * 60_000).toISOString()
}

/** Cabeçalho da mesa: abertura e garçom responsável. */
export function getMockSession(now: number): TableSessionInfo {
  return {
    openedAt: minutesAgo(74, now),
    waiter: { name: 'Marcos' },
  }
}

/**
 * Cobre os casos que a tela precisa distinguir:
 *
 * 1. Pedido meu — o telefone bate com o salvo no aparelho → "📱 Você"
 * 2. Pedido de outra pessoa da mesa → nome dela + "•••• 4321"
 * 3. Pedido do atendente — chega **sem** `origin`, como viria do PDV
 * 4. Pedido com cupom e taxa de serviço, para exercitar o resumo
 * 5. **Item pesado** (`quantity` decimal + `unit: 'kg'`) — self-service
 * 6. **Item cancelado** — aparece riscado e sai da soma
 * 7. **Item transferido** para outra mesa — idem, dizendo para onde foi
 * 8. **Pedido cancelado inteiro** — aparece com tarja, nada dele soma
 *
 * @param myPhone telefone salvo no aparelho, para o caso 1 casar de verdade.
 *                Sem ele, o mock usa um número fixo e nenhum pedido aparece
 *                como "Você" — o que também é um estado válido de testar.
 */
export function getMockBill(now: number, myPhone?: string): TableOrder[] {
  const mine = (myPhone ?? '').replace(/\D/g, '') || '11988887777'

  return [
    /**
     * Pedido cancelado inteiro. `total` continua preenchido de propósito: é
     * assim que o backend costuma devolver, e a tela precisa ignorá-lo em vez
     * de somar. Aparece com tarja vermelha e todos os itens riscados.
     */
    {
      _id: 'mock-5',
      status: 'cancelled',
      origin: CARDAPIO_ORIGIN,
      totemClientName: 'Ana Paula',
      phone: '11955554321',
      comanda: '14',
      createdAt: minutesAgo(1, now),
      consumptionint: 815,
      total: 18.9,
      items: [
        {
          _id: 'mock-5-1',
          name: 'Milkshake de morango',
          quantity: 1,
          price: 18.9,
          amount: 18.9,
        },
      ],
    },
    {
      _id: 'mock-4',
      status: 'pending',
      origin: CARDAPIO_ORIGIN,
      totemClientName: 'Ana Paula',
      phone: '11955554321',
      comanda: '14',
      createdAt: minutesAgo(3, now),
      // Líquido: só a salada. A água foi transferida e o pastel cancelado —
      // é como o backend **deve** mandar (ver BACKEND.md §4)
      total: 28.5,
      consumptionint: 814,
      items: [
        {
          _id: 'mock-4-1',
          name: 'Salada Tradicional',
          quantity: 1,
          price: 28.5,
          amount: 28.5,
          complements: [
            { name: 'Escolha a proteína', items: [{ name: 'Frango grelhado', quantity: 1 }] },
          ],
        },
        {
          _id: 'mock-4-2',
          name: 'Pastel de queijo',
          quantity: 2,
          price: 9.5,
          amount: 19,
          status: 'cancelled',
        },
        {
          _id: 'mock-4-3',
          name: 'Água com gás 500ml',
          quantity: 1,
          price: 5.5,
          amount: 5.5,
          status: 'transferred',
          transferredTo: 'MESA_07',
        },
      ],
    },
    /**
     * Self-service: dois pratos pesados do **mesmo** produto, para exercitar a
     * soma de decimais na conta resumida. `0.412 + 0.385` em ponto flutuante dá
     * `0.7970000000000001` — a tela precisa mostrar `0,797 kg`.
     */
    {
      _id: 'mock-peso',
      status: 'delivered',
      // sem `origin` → lançado pela balança/PDV, como acontece de verdade
      createdAt: minutesAgo(12, now),
      consumptionint: 811,
      comanda: '12',
      operator: { name: 'Balança' },
      total: 71.63,
      items: [
        {
          _id: 'mock-peso-1',
          name: 'Buffê por quilo',
          quantity: 0.412,
          unit: 'kg',
          unitPrice: 89.9,
          price: 89.9,
          amount: 37.04,
        },
        {
          _id: 'mock-peso-2',
          name: 'Buffê por quilo',
          quantity: 0.385,
          unit: 'kg',
          unitPrice: 89.9,
          price: 89.9,
          amount: 34.61,
        },
        {
          // Mesmo produto, unidade diferente: **não** pode somar com os de cima
          _id: 'mock-peso-3',
          name: 'Buffê por quilo',
          quantity: 1,
          unit: 'un',
          unitPrice: 0,
          price: 0,
          amount: 0,
          note: 'prato infantil — cortesia',
        },
      ],
    },
    {
      _id: 'mock-3',
      status: 'pending',
      origin: CARDAPIO_ORIGIN,
      totemClientName: 'Roberio',
      phone: mine,
      comanda: '12',
      createdAt: minutesAgo(6, now),
      consumptionint: 812,
      total: 25.9,
      items: [
        {
          _id: 'mock-3-1',
          name: 'Açaí 500ml',
          quantity: 1,
          price: 25.9,
          amount: 25.9,
          complements: [
            { name: 'Coberturas', items: [{ name: 'Leite condensado', quantity: 1 }] },
          ],
        },
      ],
    },
    {
      _id: 'mock-2',
      status: 'in_progress',
      // sem `origin` → a tela classifica como Atendente
      createdAt: minutesAgo(18, now),
      consumptionint: 809,
      total: 31.8,
      serviceTax: 3.18,
      comanda: '12',
      operator: { name: 'Marcos' },
      items: [
        {
          _id: 'mock-2-1',
          name: 'Porção de batata grande',
          quantity: 1,
          price: 24.9,
          amount: 24.9,
          note: 'sem sal',
          discount: 5, // cortesia lançada pelo garçom no item

        },
        {
          _id: 'mock-2-2',
          name: 'Água sem gás 500ml',
          quantity: 2,
          price: 3.45,
          amount: 6.9,
        },
      ],
    },
    {
      _id: 'mock-1',
      status: 'delivered',
      origin: CARDAPIO_ORIGIN,
      totemClientName: 'Roberio',
      phone: mine,
      comanda: '12',
      createdAt: minutesAgo(42, now),
      consumptionint: 804,
      total: 64.8,
      discount: 6.48,
      serviceTax: 6.48,
      coupon: { _id: 'mock-cupom', title: 'BEMVINDO10' },
      items: [
        {
          _id: 'mock-1-1',
          name: 'Frango crocante',
          quantity: 2,
          price: 25.9,
          amount: 51.8,
          complements: [
            {
              name: 'Deseja uma Bebida?',
              items: [{ name: 'Coca cola 300ml', quantity: 4 }],
            },
          ],
        },
        {
          _id: 'mock-1-2',
          name: 'Cheeseburguer simples',
          quantity: 1,
          price: 12.9,
          amount: 12.9,
        },
      ],
    },
  ]
}

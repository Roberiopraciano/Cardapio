/**
 * Troco no delivery pago em dinheiro.
 *
 * O cliente diz com que nota vai pagar ("troco para R$ 100"); o entregador
 * leva a diferença. O app não cobra: isto só avisa a loja do que levar.
 */

const round2 = (n: number) => Math.round(n * 100) / 100

/** "100", "100,50", "R$ 1.200,00" → número; vazio/inválido → null. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^\d.,]/g, '')
  if (!cleaned) return null
  // 1.200,50 → 1200.50 ; 100,5 → 100.5 ; 100.50 → 100.50
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned
  const n = Number(normalized)
  return Number.isFinite(n) && n > 0 ? round2(n) : null
}

/** Mensagem de erro para o cliente, ou null se o valor serve. */
export function changeForError(changeFor: number | null, total: number): string | null {
  if (changeFor === null) return 'Informe com quanto você vai pagar.'
  if (changeFor <= total) return 'O valor precisa ser maior que o total do pedido.'
  // Nota absurda: provável erro de digitação (1000 em vez de 100,0)
  if (changeFor > total * 20 + 200) return 'Esse valor parece alto demais. Confira.'
  return null
}

/** Quanto o entregador precisa levar de troco. */
export function changeAmount(changeFor: number, total: number): number {
  return round2(changeFor - total)
}

export function brl(n: number): string {
  return `R$ ${n.toFixed(2).replace('.', ',')}`
}

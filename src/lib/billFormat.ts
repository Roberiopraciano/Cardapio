/**
 * Formatação de quantidade na conta.
 *
 * Existe por causa do self-service: a linha da conta pode vir `0.412` com
 * `unit: 'kg'`, porque o prato foi pesado. O app **nunca gera** isso — quem pesa
 * é a balança e quem lança é o PDV (ver ROADMAP Fase 2.6) — mas exibe, e exibir
 * cru dava `0.412×`: ponto em vez de vírgula, e sem dizer de quê.
 */

/** Casas decimais exibidas. Balança de restaurante trabalha em gramas. */
const DECIMALS = 3

/**
 * Arredonda para 3 casas.
 *
 * Necessário **em cada acumulação**, não só na exibição: a conta resumida soma
 * quantidades, e em ponto flutuante `0.412 + 0.385` dá `0.7970000000000001`.
 * Esse número ia direto para a tela do cliente.
 */
export function roundQty(v: number): number {
  return Math.round(v * 10 ** DECIMALS) / 10 ** DECIMALS
}

/** `1.5` → `"1,5"`, `0.412` → `"0,412"`, `2` → `"2"` — sem zeros à direita. */
function decimalPtBr(v: number): string {
  return roundQty(v)
    .toFixed(DECIMALS)
    .replace(/\.?0+$/, '')
    .replace('.', ',')
}

/**
 * Quantidade como o cliente lê.
 *
 * - `2`, sem unidade      → `"2×"`      (o caso comum, inalterado)
 * - `0.412`, `unit: 'kg'` → `"0,412 kg"`
 * - `2`, `unit: 'un'`     → `"2 un"`
 * - `0.5`, sem unidade    → `"0,5×"`    (fração sem unidade cadastrada)
 *
 * O `×` só aparece quando não há unidade: "0,412 × kg" não é português.
 */
export function formatQuantity(quantity: number | undefined, unit?: string): string {
  const q = quantity ?? 1
  const u = (unit ?? '').trim()
  if (u) return `${decimalPtBr(q)} ${u}`
  return `${decimalPtBr(q)}×`
}

/**
 * `R$89,90/kg` — para o cliente conferir de onde saiu o valor da linha pesada.
 *
 * Sem isso, `0,412 kg = R$37,04` é um número que ele não tem como checar.
 */
export function formatUnitPrice(
  unitPrice: number | undefined,
  unit: string | undefined,
  format: (v: number) => string,
): string | null {
  if (typeof unitPrice !== 'number' || unitPrice <= 0) return null
  const u = (unit ?? '').trim()
  return u ? `${format(unitPrice)}/${u}` : format(unitPrice)
}

/**
 * Porta de gerador_codigo.dart
 *
 * gerarHibridoTempoAleatorio():
 *   - Pega 1º dígito da hora atual + último dígito do minuto
 *   - Adiciona 2 chars aleatórios do conjunto sem 0/1
 *   - Embaralha os 4 chars
 *   → Ex: "3K4M"
 *
 * gerarCodigoAlfaNumerico():
 *   - 1 letra + 3 dígitos → ex: "A042"
 *
 * getOrCreateNumero():
 *   - Número entre 500-999 gerado uma vez por sessão de carrinho
 *   - Equivalente ao _numeroAleatorio200a9999 do Flutter
 */

const CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

function randomChar(): string {
  return CHARS[Math.floor(Math.random() * CHARS.length)]
}

/** Embaralha array in-place (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Espelho de GeradorDeCodigo.gerarHibridoTempoAleatorio() */
export function gerarHibridoTempoAleatorio(): string {
  const now = new Date()
  const hora = String(now.getHours()).padStart(2, '0')
  const minuto = String(now.getMinutes()).padStart(2, '0')

  const charHora = hora[0]       // 1º dígito da hora  ex: "1" (de "16")
  const charMinuto = minuto[1]   // último dígito do min ex: "2" (de "32")

  const chars = [charHora, charMinuto, randomChar(), randomChar()]
  shuffle(chars)
  return chars.join('')
}

/**
 * Senha do balcão: **1 letra + N dígitos** — ex: `A042`, `K1725`.
 *
 * Formato escolhido para ser **falado em voz alta** no painel de senhas:
 * "senha A zero quatro dois". Por isso `I` e `O` ficam de fora do alfabeto —
 * impressos ou lidos de longe eles viram `1` e `0`, e o cliente vai ao balcão
 * com a senha errada.
 *
 * ⚠️ **Colisão.** O sorteio é local, sem consultar o que já está em uso.
 *
 * O que importa não é o total de senhas do dia — a senha morre quando o cliente
 * retira. Colide o conjunto **ativo** no momento (~15 pendentes, não 300):
 *
 * | Movimento | Ativas | 3 dígitos (24 mil) | 4 dígitos (240 mil) |
 * |---|---|---|---|
 * | 120 pedidos/dia | 8  | 1 a cada 25 dias | 1 a cada 250 dias |
 * | 300 pedidos/dia | 15 | 1 a cada 5 dias  | 1 a cada 53 dias |
 * | 600 pedidos/dia | 30 | ~1 por dia       | 1 a cada 13 dias |
 *
 * Até movimento médio, 3 dígitos servem: a colisão é rara e o efeito é duas
 * pessoas indo ao balcão juntas, que o atendente resolve olhando o pedido.
 * Em movimento alto, subir para 4 — ou, melhor, deixar o Laravel gerar a senha
 * (ver `BACKEND.md`), que elimina o problema.
 */
const LETRAS_SENHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // sem I e O

export function gerarCodigoAlfaNumerico(digitos = 3): string {
  const letra = LETRAS_SENHA[Math.floor(Math.random() * LETRAS_SENHA.length)]
  const max = 10 ** digitos
  const numero = String(Math.floor(Math.random() * max)).padStart(digitos, '0')
  return `${letra}${numero}`
}

/** Espelho de BuyingCicleProvider.getOrCreateNumero() — 500 a 999 */
let _cachedNumber: number | null = null

export function getOrCreateNumero(): number {
  if (_cachedNumber !== null) return _cachedNumber
  _cachedNumber = 500 + Math.floor(Math.random() * 500)
  return _cachedNumber
}

export function resetNumero(): void {
  _cachedNumber = null
}

/**
 * Gera o consumptioncode para o modo correto:
 * - Mesa:   usa o nome da mesa (ex: "MESA_03")
 * - Balcão: senha de chamada (ex: "A042")
 *
 * O balcão usava `gerarHibridoTempoAleatorio()` — `3K4M`, com letras e números
 * embaralhados. Serve para identificar, mas **não para chamar**: soletrar
 * "três-K-quatro-M" no microfone é lento e confunde. O formato letra+números
 * é o padrão de painel de senha e o mesmo do totem.
 */
export function gerarConsumptionCode(
  mode: 'mesa' | 'balcao',
  table: string,
  digitos = 3,
): string {
  if (mode === 'mesa') return table || 'MESA'
  return gerarCodigoAlfaNumerico(digitos)
}

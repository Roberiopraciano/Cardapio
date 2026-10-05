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
 *   - 5 caracteres aleatórios, com letras e números → ex: "7AK3M"
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

/** Senha do balcão: 5 caracteres aleatórios, com ao menos uma letra e um número. */
const LETRAS_SENHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // sem I e O
const NUMEROS_SENHA = '23456789' // sem 0 e 1
const CARACTERES_SENHA = `${LETRAS_SENHA}${NUMEROS_SENHA}`

export function gerarCodigoAlfaNumerico(): string {
  const caracteres = [
    LETRAS_SENHA[Math.floor(Math.random() * LETRAS_SENHA.length)],
    NUMEROS_SENHA[Math.floor(Math.random() * NUMEROS_SENHA.length)],
  ]

  while (caracteres.length < 5) {
    caracteres.push(CARACTERES_SENHA[Math.floor(Math.random() * CARACTERES_SENHA.length)])
  }

  return shuffle(caracteres).join('')
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
 * - Balcão: senha de 5 caracteres aleatórios (ex: "7AK3M")
 */
export function gerarConsumptionCode(
  mode: 'mesa' | 'balcao',
  table: string,
): string {
  if (mode === 'mesa') return table || 'MESA'
  return gerarCodigoAlfaNumerico()
}

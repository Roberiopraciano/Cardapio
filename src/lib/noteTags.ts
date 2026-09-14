/**
 * Observações prontas do produto (`product.customSuggestions`) como atalho para
 * o campo de observação.
 *
 * No cadastro real vêm coisas como `["Natural"]` numa lata de refrigerante —
 * pedido de bebida não gelada. É observação, não sugestão de acompanhamento.
 *
 * A observação continua sendo **texto livre**: o atalho só insere e remove a
 * palavra, sem transformar o campo numa lista fechada. O cliente pode digitar
 * o que quiser em volta, e a cozinha recebe uma frase única.
 */

/** Separador entre observações inseridas por atalho. */
const SEP = ', '

const norm = (v: string) =>
  v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** Divide a observação em partes, preservando o que o cliente digitou. */
function parts(note: string): string[] {
  return note.split(',').map((p) => p.trim()).filter(Boolean)
}

export function hasNoteTag(note: string, tag: string): boolean {
  const t = norm(tag)
  return parts(note).some((p) => norm(p) === t)
}

/**
 * Insere ou remove a observação.
 *
 * Compara sem acento e sem caixa para "Natural" não entrar duas vezes quando o
 * cliente já digitou "natural" à mão.
 */
export function toggleNoteTag(note: string, tag: string): string {
  const t = norm(tag)
  const list = parts(note)

  const without = list.filter((p) => norm(p) !== t)
  if (without.length !== list.length) return without.join(SEP)

  return [...list, tag.trim()].join(SEP)
}

/** Sugestões válidas: sem vazios e sem repetição, preservando a ordem. */
export function noteTagsOf(suggestions: string[] | undefined): string[] {
  if (!suggestions?.length) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of suggestions) {
    const trimmed = (s ?? '').trim()
    if (!trimmed) continue
    const key = norm(trimmed)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

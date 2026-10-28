/**
 * A pesquisa de avaliação (estrelas) aparece UMA vez por aparelho e por loja.
 *
 * Antes aparecia em toda confirmação de pedido: quem pede três vezes na mesma
 * noite recebia a mesma pergunta três vezes, e passava a ignorá-la — inclusive
 * na primeira, que é a que importa.
 *
 * Conta como "já mostrada" no instante em que aparece, não só quando é enviada:
 * "Agora não" é uma resposta, e insistir depois dela é o que irrita.
 */
import { scopedKey } from './storageScope'

const key = (branchId: string) => scopedKey(`nps_shown_${branchId || 'default'}`)

export function wasReviewPromptShown(branchId: string): boolean {
  try { return localStorage.getItem(key(branchId)) !== null } catch { return false }
}

export function markReviewPromptShown(branchId: string, now = Date.now()): void {
  try { localStorage.setItem(key(branchId), String(now)) } catch { /* storage bloqueado: pode repetir, não quebra */ }
}

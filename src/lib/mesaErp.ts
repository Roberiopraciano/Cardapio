/**
 * Mesa integrada ao ERP da loja (`settingsWeb.mesaErpEnabled`).
 *
 * Em vez de só gravar o pedido na nuvem, o cardápio abre a mesa e lança os
 * itens direto no PDV da loja, via Laravel → RabbitMQ → Berp.MesaService
 * (contrato em `TotemApiv2/docs/MESA_SERVICE.md`).
 *
 * Fluxo, na hora de enviar o pedido:
 *  1. consulta o status da mesa (`mesa.status`) com o `clientOrderId` deste aparelho;
 *  2. mesa livre → cliente digita o PIN e a mesa é aberta (`mesa.abrir`);
 *  3. mesa já aberta por outro canal (garçom/PDV/outro aparelho) → NÃO lança:
 *     pede para chamar o garçom (`mesa.chamar_garcom`);
 *  4. mesa já é deste aparelho → lança (`mesa.lancar_itens`). Os próximos
 *     pedidos ("Pedir mais itens") reaproveitam a sessão e vão direto ao passo 4.
 */

import type { CartItem, Product } from '../types'

const round2 = (n: number) => Math.round(n * 100) / 100

export type MesaGate =
  /** Mesa vaga: precisa do PIN para abrir. */
  | 'livre'
  /** Mesa aberta e vinculada a este aparelho: pode lançar. */
  | 'minha'
  /** Mesa aberta por outro canal: chamar o garçom. */
  | 'ocupada'
  /** Mesa é deste aparelho, mas não aceita itens (pagamento/conferência/encerrada). */
  | 'bloqueada'

/** Resposta de `mesa.status` (campo `data`). */
export interface MesaStatusData {
  encontrada?: boolean
  movimentoAberto?: boolean
  clientOrderId?: string | null
  venStatus?: number | null
  status?: string
  podeLancarItens?: boolean
}

export function classifyMesa(data: MesaStatusData | null | undefined, clientOrderId: string): MesaGate {
  if (!data || data.encontrada === false || data.status === 'NAO_ENCONTRADA') return 'livre'

  const mine = !!data.clientOrderId && data.clientOrderId.toLowerCase() === clientOrderId.toLowerCase()
  if (!mine) return 'ocupada'

  return data.podeLancarItens === false || (data.venStatus != null && data.venStatus !== 1)
    ? 'bloqueada'
    : 'minha'
}

// ─── Sessão da mesa (aparelho) ───────────────────────────────────────────────

export interface MesaSession {
  clientOrderId: string
  mesaToken: string
  numeroMesa: number
  /** epoch ms */
  at: number
}

/** O token do Laravel vale 6h; renova-se antes para não falhar no meio do pedido. */
export const SESSION_MAX_AGE_MS = (6 * 60 - 10) * 60 * 1000

const sessionKey = (branchId: string, table: string) => `mesa_erp_${branchId}_${table}`
const idKey = (branchId: string, table: string) => `mesa_erp_id_${branchId}_${table}`

export function loadMesaSession(branchId: string, table: string, now = Date.now()): MesaSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(branchId, table))
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<MesaSession>
    if (!s.clientOrderId || !s.mesaToken || typeof s.at !== 'number') return null
    if (now - s.at >= SESSION_MAX_AGE_MS || now < s.at) return null
    return s as MesaSession
  } catch {
    return null
  }
}

export function saveMesaSession(branchId: string, table: string, s: Omit<MesaSession, 'at'>, now = Date.now()): void {
  try { localStorage.setItem(sessionKey(branchId, table), JSON.stringify({ ...s, at: now })) } catch { /* storage bloqueado */ }
}

export function clearMesaSession(branchId: string, table: string): void {
  try { localStorage.removeItem(sessionKey(branchId, table)) } catch { /* storage bloqueado */ }
}

/**
 * `clientOrderId` estável deste aparelho nesta mesa. Existe antes da sessão
 * porque é ele que o Laravel/loja usam para dizer "esta mesa é minha".
 */
export function getMesaClientOrderId(branchId: string, table: string): string {
  const existing = loadMesaSession(branchId, table)?.clientOrderId
  if (existing) return existing
  try {
    const stored = localStorage.getItem(idKey(branchId, table))
    if (stored) return stored
    const fresh = crypto.randomUUID()
    localStorage.setItem(idKey(branchId, table), fresh)
    return fresh
  } catch {
    return crypto.randomUUID()
  }
}

/** A mesa foi aberta com outro `clientOrderId` (resposta de `abrir` reaproveitou uma sessão): passa a valer o dele. */
export function adoptClientOrderId(branchId: string, table: string, clientOrderId: string): void {
  try { localStorage.setItem(idKey(branchId, table), clientOrderId) } catch { /* storage bloqueado */ }
}

// ─── Itens do pedido ─────────────────────────────────────────────────────────

export interface MesaItemInput {
  codigoProduto: number
  quantidade: number
  /** Ignorado pelo Laravel (vale o catálogo); enviado só como referência. */
  valorUnitario: number
  observacao: string | null
  complements?: Array<{ codigoProduto: number; quantidade: number; valorUnitario: number; observacao: string | null }>
}

/** Código do ERP é numérico; produto sem código não pode ir para a loja. */
export function erpCode(code: string | undefined): number | null {
  const n = Number(String(code ?? '').trim())
  return Number.isInteger(n) && n > 0 ? n : null
}

export class MesaItemError extends Error {
  readonly productName: string

  constructor(productName: string) {
    super(`${productName} ainda não tem código no sistema da loja. Peça ao garçom.`)
    this.name = 'MesaItemError'
    this.productName = productName
  }
}

/**
 * Converte o carrinho no formato de `mesa.lancar_itens`. Complemento da mesma
 * escolha vai aninhado no item (a loja encadeia no produto pai). Embalagem fica
 * de fora: consumo no local não leva embalagem.
 *
 * @throws MesaItemError se algum produto/complemento não tiver código do ERP
 */
export function buildMesaItems(items: CartItem[], products: Product[]): MesaItemInput[] {
  const byId = new Map(products.map((p) => [p._id, p]))

  return items.map((item) => {
    const codigoProduto = erpCode(item.product.code)
    if (codigoProduto === null) throw new MesaItemError(item.product.name)

    const complements = item.addedComplements
      .filter((c) => !c.isPackaging)
      .map((c) => {
        const code = erpCode(byId.get(c._id)?.code)
        if (code === null) throw new MesaItemError(c.name)
        return {
          codigoProduto: code,
          quantidade: c.quantity,
          valorUnitario: round2(c.price * (c.unitFraction ?? 1)),
          observacao: null,
        }
      })

    return {
      codigoProduto,
      quantidade: item.quantity,
      valorUnitario: item.product.price,
      observacao: item.note.trim() || null,
      ...(complements.length ? { complements } : {}),
    }
  })
}

// ─── Mensagens ───────────────────────────────────────────────────────────────

/** Texto para o cliente, a partir do código de erro devolvido pelo Laravel/loja. */
export function mesaErrorMessage(code: string | undefined, fallback?: string): string {
  switch (code) {
    case 'PIN_INVALIDO': return 'PIN incorreto. Confira o número da mesa e a hora.'
    case 'PIN_BLOQUEADO': return 'Muitas tentativas incorretas. Aguarde 2 minutos e tente de novo.'
    case 'MOVIMENTO_FECHADO': return 'O caixa do restaurante está fechado no momento. Solicite atendimento ao garçom.'
    case 'MESA_OCUPADA': return 'Esta mesa já está em uso. Chame o garçom.'
    case 'MESA_BLOQUEADA_PAGAMENTO': return 'Conta em processo de pagamento. Não é possível pedir agora.'
    case 'MESA_EM_CONFERENCIA': return 'Pré-conta solicitada no salão. Não é possível pedir agora.'
    case 'MESA_JA_PAGA': return 'Esta conta já foi paga. Leia o QR Code da mesa novamente.'
    case 'MESA_CANCELADA': return 'Esta conta foi cancelada. Chame o garçom.'
    case 'ITEM_INDISPONIVEL': return 'Algum item não está disponível. Remova-o do carrinho e tente de novo.'
    case 'LOJA_OFFLINE_TIMEOUT': return 'A cozinha não respondeu. O pedido NÃO foi lançado. Toque em "Tentar novamente" ou chame o garçom.'
    case 'TOKEN_MESA_INVALIDO':
    case 'TOKEN_MESA_DIVERGENTE': return 'Sua sessão da mesa expirou. Confirme o pedido de novo.'
    default: return fallback ?? 'Não foi possível enviar o pedido para a cozinha. Chame o garçom.'
  }
}

/** Erros em que reabrir a sessão (novo status/PIN) resolve. */
export const SESSION_ERROR_CODES = ['TOKEN_MESA_INVALIDO', 'TOKEN_MESA_DIVERGENTE']

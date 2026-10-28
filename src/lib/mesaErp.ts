/**
 * Mesa integrada ao ERP da loja (`settingsWeb.mesaErpEnabled`).
 *
 * Em vez de só gravar o pedido na nuvem, o cardápio abre a mesa e lança os
 * itens direto no PDV da loja, via Laravel → RabbitMQ → Berp.MesaService
 * (contrato em `TotemApiv2/docs/MESA_SERVICE.md`).
 *
 * Fluxo, na hora de enviar o pedido:
 *  1. consulta o status da mesa (`mesa.status`) com o `clientOrderId` deste aparelho;
 *  2. mesa fechada → cliente digita o PIN e a mesa é aberta (`mesa.abrir`);
 *  3. mesa já aberta (garçom/PDV/outro aparelho) → entra na MESMA comanda, sem PIN
 *     (`api/mesa/entrar`): usa o `clientOrderId` que a comanda já tem;
 *  4. mesa em pagamento/conferência/encerrada → não lança: avisa e oferece chamar o garçom;
 *  5. lança (`mesa.lancar_itens`). Os próximos pedidos ("Pedir mais itens")
 *     reaproveitam a sessão e vão direto ao passo 5.
 */

import type { CartItem, Product } from '../types'

const round2 = (n: number) => Math.round(n * 100) / 100

export type MesaGate =
  /** Mesa fechada: precisa do PIN para abrir. */
  | 'livre'
  /** Mesa aberta e vinculada a este aparelho: pode lançar. */
  | 'minha'
  /** Mesa aberta por outro canal (garçom/PDV/outro aparelho): entra na mesma comanda, sem PIN. */
  | 'ocupada'
  /** Mesa aberta, mas sem aceitar itens (pagamento/conferência/encerrada): chamar o garçom. */
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

  // Fechando conta/encerrada: ninguém lança, seja a comanda de quem for
  if (data.podeLancarItens === false || (data.venStatus != null && data.venStatus !== 1)) return 'bloqueada'

  const mine = !!data.clientOrderId && data.clientOrderId.toLowerCase() === clientOrderId.toLowerCase()
  return mine ? 'minha' : 'ocupada'
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
  /** _id do cadastro: o Laravel resolve daqui o código do PDV e o preço (o mesmo código do ERP se repete em vários cadastros). */
  produtoId: string
  codigoProduto: number
  quantidade: number
  /** Ignorado pelo Laravel (vale o catálogo); enviado só como referência. */
  valorUnitario: number
  observacao: string | null
  complements?: Array<{
    produtoId: string
    codigoProduto: number
    quantidade: number
    valorUnitario: number
    /** Fração do complemento (meia pizza = 0,5). Ausente = inteiro. */
    fracao?: number
    observacao: string | null
  }>
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
        const fracao = c.unitFraction !== undefined && c.unitFraction > 0 && c.unitFraction < 1 ? c.unitFraction : undefined
        return {
          produtoId: c._id,
          codigoProduto: code,
          quantidade: c.quantity,
          valorUnitario: round2(c.price * (c.unitFraction ?? 1)),
          ...(fracao ? { fracao } : {}),
          observacao: null,
        }
      })

    return {
      produtoId: item.product._id,
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
    case 'MESA_FECHADA': return 'A mesa ainda não está aberta. Digite o PIN para abrir.'
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

// ─── Conta da mesa (mesa.conta) ──────────────────────────────────────────────

export interface MesaBillItem {
  id: number | string
  codigoProduto: number | null
  descricao: string
  categoria: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
  observacao: string | null
  horaLancamento: string | null
  cancelado: boolean
  nomeCliente: string | null
  quemLancou: string | null
  origem: string | null
}

export interface MesaBillPayment {
  id: number | string
  forma: string
  valor: number
  dataHora: string | null
}

export interface MesaBill {
  /** true = a loja não respondeu: valores do último espelho guardado na nuvem. */
  offline: boolean
  notice: string | null
  status: string
  garcomNome: string | null
  horaAbertura: string | null
  horaUltimoLancamento: string | null
  totais: { produtos: number; servico: number; desconto: number; bruto: number; pago: number; restante: number }
  itens: MesaBillItem[]
  pagamentos: MesaBillPayment[]
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v && typeof v === 'object' ? (v as Rec) : {})

/** Normaliza a resposta de `POST api/mesa/conta` (online da loja, ou espelho offline da nuvem). */
export function parseMesaBill(res: Rec): MesaBill {
  const offline = res['origem'] === 'CACHE_OFFLINE_MONGODB'
  const d = rec(offline ? res['dados'] : res['data'])
  const t = rec(d['totais'])
  const garcom = rec(d['garcom'])

  const totais = offline
    ? {
      produtos: num(t['subtotal']), servico: num(t['taxaServico']), desconto: num(t['desconto']),
      bruto: num(t['total']), pago: num(t['totalPago']), restante: num(t['saldoPendente']),
    }
    : {
      produtos: num(t['valorProdutos']), servico: num(t['valorServico']), desconto: num(t['valorDesconto']),
      bruto: num(t['valorBruto']), pago: num(t['valorTotalPago']), restante: num(t['saldoRestante']),
    }

  const itens = (Array.isArray(d['itens']) ? d['itens'] as Rec[] : []).map((i, idx): MesaBillItem => ({
    id: (i['id'] as number | string | undefined) ?? idx,
    codigoProduto: erpCode(String(i['codigoProduto'] ?? '')),
    descricao: str(i['descricao']) ?? 'Item',
    categoria: str(i['categoria']) ?? 'Outros',
    quantidade: num(i['quantidade']),
    valorUnitario: num(i['valorUnitario']),
    valorTotal: num(i['valorTotal']),
    observacao: str(i['observacao']),
    horaLancamento: str(i['horaLancamento']),
    cancelado: i['cancelado'] === true,
    nomeCliente: str(i['nomeCliente']),
    quemLancou: str(i['quemLancou']),
    origem: str(i['origem']),
  }))

  const pagamentos = (Array.isArray(d['pagamentos']) ? d['pagamentos'] as Rec[] : []).map((p, idx): MesaBillPayment => ({
    id: (p['id'] as number | string | undefined) ?? idx,
    forma: str(p['formaPagamentoNome']) ?? 'Pagamento',
    valor: num(p['valor']),
    dataHora: str(p['dataHora']),
  }))

  return {
    offline,
    notice: offline ? (str(res['aviso']) ?? 'Exibindo a última sincronização da mesa.') : null,
    status: str(d['statusDescricao']) ?? str(d['statusMesa']) ?? 'ABERTA',
    garcomNome: str(garcom['nome']),
    horaAbertura: str(d['horaAbertura']),
    horaUltimoLancamento: str(d['horaUltimoLancamento']),
    totais,
    itens,
    pagamentos,
  }
}

export const BILL_STATUS_LABEL: Record<string, string> = {
  ABERTA: 'Mesa aberta',
  AGUARDANDO_PAGAMENTO: 'Aguardando pagamento',
  EM_CONFERENCIA: 'Pré-conta solicitada',
  PAGA: 'Conta paga',
  CANCELADA: 'Conta cancelada',
}

/** Quem lançou o item. Item do PDV (sem nome de cliente) é do garçom/balcão. */
export function billPersonLabel(i: MesaBillItem): string {
  return i.nomeCliente ?? 'Garçom / Balcão'
}

export interface BillGroup { key: string; label: string; count: number; total: number }

/** Soma por pessoa ou por categoria. Item cancelado não entra. Maior consumo primeiro. */
export function groupBill(itens: MesaBillItem[], by: 'pessoa' | 'categoria'): BillGroup[] {
  const map = new Map<string, BillGroup>()
  for (const i of itens) {
    if (i.cancelado) continue
    const label = by === 'pessoa' ? billPersonLabel(i) : i.categoria
    const g = map.get(label) ?? { key: label, label, count: 0, total: 0 }
    g.count += 1
    g.total = Math.round((g.total + i.valorTotal) * 100) / 100
    map.set(label, g)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

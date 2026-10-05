// Espelho de rest.dart — todas as chamadas públicas (sem Bearer token)

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? ''

if (!BASE_URL) {
  // Falha barulhenta no boot: build sem VITE_API_URL só quebraria no primeiro fetch.
  console.error('VITE_API_URL não definida — o app não conseguirá carregar o cardápio.')
}

/** Rede de restaurante trava sem devolver erro; sem teto o cliente fica na splash. */
const TIMEOUT_MS = 15_000

function withTimeout(init?: RequestInit): RequestInit {
  return { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }
}

/**
 * `no-store` em todo GET de cardápio: preço, estoque e disponibilidade mudam
 * durante o serviço. Um cliente vendo preço velho é pior que um boot 1s mais
 * lento — ele pede achando que custa X e a conta vem Y.
 * O service worker também está em NetworkOnly para essas rotas (vite.config.ts).
 */
async function request<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/${path}`, {
      ...withTimeout(),
      cache: 'no-store',
    })
  } catch (e) {
    // fetch só rejeita por rede/CORS/timeout — nunca por status HTTP
    throw new ApiError(0, path, e instanceof Error ? e.message : 'network')
  }
  if (!res.ok) throw new ApiError(res.status, path)
  return res.json()
}

/**
 * Falha num GET do cardápio, com o status preservado.
 *
 * Existe porque o boot precisa **decidir a tela** a partir do motivo: um 404
 * significa "este QR não aponta para nada" (reescanear), um 500 significa "o
 * sistema da casa caiu" (chamar atendente), e `status: 0` é o único caso em que
 * dizer "verifique sua internet" é verdade. Antes tudo isso era um
 * `new Error('API 500')` e as três situações davam a mesma tela errada.
 */
export class ApiError extends Error {
  /** 0 = a requisição não chegou (rede, CORS, timeout). */
  readonly status: number
  readonly path: string
  readonly detail?: string

  constructor(status: number, path: string, detail?: string) {
    super(`API ${status}: ${path}`)
    this.name = 'ApiError'
    this.status = status
    this.path = path
    this.detail = detail
  }

  /** Não chegou ao servidor — o único caso de "sem conexão". */
  get isOffline(): boolean {
    return this.status === 0
  }

  /**
   * O servidor respondeu recusando o identificador: a branch do link não existe
   * ou não foi aceita. 400 e 422 entram aqui porque é o que o Laravel devolve
   * para `_id` que ele não consegue converter.
   */
  get isBadTarget(): boolean {
    return this.status === 404 || this.status === 400 || this.status === 422
  }
}

/**
 * Apaga caches de versões anteriores do app que ainda guardavam respostas da API.
 * Sem isso, quem já abriu o cardápio antes continua com o `api-cache` antigo no
 * disco até ele expirar sozinho.
 */
export async function clearStaleApiCache(): Promise<void> {
  if (!('caches' in window)) return
  try {
    const names = await caches.keys()
    await Promise.all(
      names.filter((n) => n.includes('api-cache')).map((n) => caches.delete(n)),
    )
  } catch {
    // Cache API indisponível (modo privado, HTTP) — segue sem cache mesmo
  }
}

/**
 * Situação de um item dentro da conta.
 *
 * `cancelled` e `transferred` continuam **visíveis** e saem da soma. Apagar do
 * JSON seria pior: o cliente viu o item na tela dois minutos antes, e vê-lo
 * desaparecer sem explicação parece erro do app — ou pior, parece que a casa
 * mexeu na conta. "Cancelado" riscado é o que sustenta a confiança.
 */
export type BillItemStatus = 'active' | 'cancelled' | 'transferred'

/** Item de um pedido, como o backend devolve em GET api/orders */
export interface TableOrderItem {
  _id?: string
  product?: string
  name?: string
  /**
   * Pode ser **decimal** em self-service: `0.412` com `unit: 'kg'`.
   * O app nunca gera isso — quem pesa é a balança. Ver ROADMAP Fase 2.6.
   */
  quantity?: number
  amount?: number
  price?: number
  note?: string
  /**
   * Dois formatos convivem: o antigo, agrupado (`{ name, items: [...] }`), e o
   * plano, um objeto por item escolhido — o que o totem manda e o cardápio
   * passou a mandar. Ler sempre por `complementEntries()`.
   */
  complements?: Array<{ name?: string; quantity?: number; items?: Array<{ name?: string; quantity?: number }> }>
  /** Desconto aplicado neste item específico (cortesia, promoção do item…) */
  discount?: number

  /** Ausente = `active`. Item sem status é item que conta. */
  status?: BillItemStatus
  /** Unidade de medida quando a quantidade é fracionada (`kg`, `L`, `un`). */
  unit?: string
  /** Preço por unidade, para o cliente conferir `0,412 kg × R$89,90/kg`. */
  unitPrice?: number
  /** Para onde o item foi, quando `transferred` (ex: `MESA_07`). */
  transferredTo?: string
}

/** Complementos de um item como lista plana, aceitando os dois formatos. */
export function complementEntries(item: TableOrderItem): Array<{ name?: string; quantity?: number }> {
  return (item.complements ?? []).flatMap((c) => (Array.isArray(c.items) ? c.items : [c]))
}

/** Item que entra na soma — o resto aparece riscado, informando o motivo. */
export function countsToBill(item: TableOrderItem): boolean {
  return (item.status ?? 'active') === 'active'
}

/**
 * Cabeçalho da mesa/atendimento. Vem do backend junto da lista de pedidos —
 * ver DOCUMENTACAO.md → "Conta da Mesa".
 */
export interface TableSessionInfo {
  /** ISO da abertura da mesa. A tela calcula o tempo decorrido a partir daí. */
  openedAt?: string
  /** Garçom responsável pela mesa (diferente de quem lançou cada pedido) */
  waiter?: { name?: string } | string
  table?: string
}

/**
 * Pedido da mesa.
 *
 * `origin` é o que distingue quem lançou: o cardápio manda `origin: 'cardapio'`
 * no POST. Pedido sem esse marcador veio do PDV/totem, ou seja, do atendente.
 * Ver `orderAuthor()` em `src/lib/orderAuthor.ts`.
 */
export interface TableOrder {
  _id: string
  status: string
  total?: number
  amount?: number
  subtotal?: number
  items: TableOrderItem[]
  consumptionint?: number
  consumptioncode?: string
  origin?: string
  createdAt?: string

  /** Quem pediu — o cardápio manda no POST. Numa mesa, cada pessoa manda o seu. */
  totemClientName?: string
  phone?: string

  /**
   * Comanda do cliente dentro da mesa, quando a branch usa comanda.
   * É a **chave de agrupamento da conta** — o nome é só rótulo humano.
   */
  comanda?: string

  operator?: { name?: string } | string
  user?: { name?: string } | string

  /** Descontos e acréscimos. Exibidos só quando o backend mandar — a tela
   *  nunca calcula taxa de serviço por conta própria. Ver DOCUMENTACAO.md. */
  discount?: number
  serviceTax?: number
  coupon?: { title?: string; _id?: string } | null
}

/**
 * Falha no envio do pedido, com o motivo preservado.
 *
 * `status: 0` = a requisição não chegou (rede, CORS, timeout). Distinguir isso
 * de um 4xx importa: CORS mal configurado e `simpleAuth` recusado produzem a
 * mesma tela para o cliente, mas o conserto é em lugares diferentes.
 */
export class OrderError extends Error {
  // Campos declarados fora do construtor: o projeto usa `erasableSyntaxOnly`,
  // que proíbe parameter properties (`constructor(readonly x)`)
  readonly status: number
  readonly body: unknown
  readonly detail?: string

  constructor(status: number, body: unknown, detail?: string, path = 'api/orders') {
    super(`POST ${path} falhou (${status})`)
    this.name = 'OrderError'
    this.status = status
    this.body = body
    this.detail = detail
  }

  /** Mensagem para o cliente — específica o bastante para ele saber o que fazer. */
  get clientMessage(): string {
    switch (true) {
      case this.status === 0:
        return 'Não foi possível falar com o restaurante. Verifique a conexão e tente de novo.'
      case this.status === 401 || this.status === 403:
        return 'Este cardápio não está autorizado a enviar pedidos. Chame um atendente.'
      case this.status === 422 || this.status === 400:
        return this.serverMessage
          ?? 'Algum dado do pedido não foi aceito. Confira e tente de novo.'
      case this.status === 429:
        return 'Muitos pedidos em sequência. Aguarde um instante e tente de novo.'
      case this.status >= 500:
        return 'O sistema do restaurante está com problema. Chame um atendente.'
      default:
        return 'Erro ao enviar pedido. Tente novamente.'
    }
  }

  /** Extrai a mensagem que o Laravel devolveu, se houver. */
  get serverMessage(): string | null {
    const b = this.body
    if (typeof b === 'string' && b.trim()) return b.slice(0, 200)
    if (b && typeof b === 'object') {
      const o = b as Record<string, unknown>
      for (const k of ['message', 'error', 'detail']) {
        const v = o[k]
        if (typeof v === 'string' && v.trim()) return v.slice(0, 200)
      }
      // Laravel: { errors: { campo: ["msg"] } }
      const errors = o['errors']
      if (errors && typeof errors === 'object') {
        const first = Object.values(errors as Record<string, unknown>)[0]
        if (Array.isArray(first) && typeof first[0] === 'string') return first[0]
      }
    }
    return null
  }
}

/**
 * Pré-pedido "Pagar no totem", como o backend devolve na criação.
 * `qr` é o texto exato a codificar — o totem só aceita o prefixo `BERPTOTEM:`.
 */
export interface TotemHandoff {
  id: string
  /** Alias compatível da senha oficial (`consumptioncode`) para digitação manual. */
  code: string
  /** Senha confirmada pelo backend e usada em todo o restante do fluxo. */
  consumptioncode: string
  token: string
  qr: string
  status: TotemHandoffStatus
  total: number
  discount: number
  /** ISO em UTC */
  expiresAt: string
}

/**
 * `consumed` é o único estado de pagamento que o app afirma: quem grava é o
 * totem, depois do TEF aprovar — não é dedução do app.
 */
export type TotemHandoffStatus = 'pending' | 'consumed' | 'cancelled' | 'expired'

export const api = {
  getBranch: (id: string) =>
    request<{ data: unknown[] }>(`api/branches?_id=${id}`),

  getCompany: (id: string) =>
    request<{ data: unknown[] }>(`api/company?_id=${id}`),

  getCategories: (branchId: string) =>
    request<{ data: unknown[] }>(
      `api/product-categories?branch=${branchId}&locationTypes[$in][]=8&disabled=false&$limit=false`
    ),

  getProducts: (branchId: string) =>
    request<{ data: unknown[] }>(`api/products?branch=${branchId}&$limit=false&active=true`),

  getComplementsGroups: (branchId: string) =>
    request<{ data: unknown[] }>(
      `api/complements-groups?branch=${branchId}&$limit=false&locationTypes[$in][]=8`
    ),

  getComplementsGroupsCategories: (branchId: string) =>
    request<{ data: unknown[] }>(
      `api/complements-groups-categories?branch=${branchId}&$limit=false`
    ),

  getPeriods: (branchId: string) =>
    request<{ data: unknown[] }>(`api/periods?branch=${branchId}&$limit=false`),

  getOffers: (branchId: string) =>
    request<{ data: unknown[] }>(
      `api/offers?branch=${branchId}&active=true&disabled=false&$limit=false`
    ),

  validateCoupon: async (payload: unknown): Promise<{
    valid: boolean
    reason?: string
    message: string
    discount: number
    total?: number
    appliesTo?: string[]
    stackableWithCashback?: boolean
  }> => {
    const path = 'api/coupons/validate'
    let res: Response
    try {
      res = await fetch(`${BASE_URL}/${path}`, withTimeout({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      }))
    } catch (e) {
      throw new ApiError(0, path, e instanceof Error ? e.message : 'network')
    }

    const body = await res.json().catch(() => ({
      valid: false, message: 'Não foi possível validar o cupom.', discount: 0,
    }))
    if (!res.ok && res.status !== 422) throw new ApiError(res.status, path)
    return body
  },

  /** POST api/orders — auth via simpleAuth no body */
  postOrder: async (payload: unknown) => {
    let res: Response
    try {
      res = await fetch(`${BASE_URL}/api/orders`, withTimeout({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }))
    } catch (e) {
      // fetch só rejeita por rede/CORS/timeout — nunca por status HTTP
      throw new OrderError(0, null, e instanceof Error ? e.message : 'network')
    }

    const raw = await res.text()
    let body: unknown = null
    try { body = raw ? JSON.parse(raw) : null } catch { body = raw }

    if (!res.ok) {
      // O motivo real fica registrado: sem isso, todo problema de backend
      // aparecia como "tente novamente" e não havia o que investigar
      console.error('[pedido] falhou', {
        status: res.status,
        resposta: body,
        payloadEnviado: payload,
      })
      throw new OrderError(res.status, body)
    }

    return body as Record<string, unknown> | null
  },

  /**
   * POST api/totem-handoffs — "Pagar no totem".
   *
   * Não cria pedido em `orders`: grava um pré-pedido que o totem lê pelo QR,
   * cobra no TEF e só então vira pedido de verdade. Mesmo payload do
   * POST api/orders, mesmos erros (`OrderError`).
   */
  postTotemHandoff: async (payload: unknown): Promise<TotemHandoff> => {
    const path = 'api/totem-handoffs'
    let res: Response
    try {
      res = await fetch(`${BASE_URL}/${path}`, withTimeout({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      }))
    } catch (e) {
      throw new OrderError(0, null, e instanceof Error ? e.message : 'network', path)
    }

    const raw = await res.text()
    let body: unknown
    try { body = raw ? JSON.parse(raw) : null } catch { body = raw }

    if (!res.ok) {
      console.error('[totem] falhou', { status: res.status, resposta: body, payloadEnviado: payload })
      throw new OrderError(res.status, body, undefined, path)
    }
    return body as TotemHandoff
  },

  /** Poll da tela do QR. 404 = o pré-pedido sumiu (tratado como expirado). */
  getTotemHandoffStatus: (token: string) =>
    request<{ code: string; status: TotemHandoffStatus; claimed: boolean; expiresAt: string }>(
      `api/totem-handoffs/${encodeURIComponent(token)}/status`,
    ),

  /** Cliente desistiu antes de pagar. 409 = o totem já cobrou. */
  cancelTotemHandoff: async (token: string): Promise<{ ok: boolean; status?: TotemHandoffStatus }> => {
    try {
      const res = await fetch(
        `${BASE_URL}/api/totem-handoffs/${encodeURIComponent(token)}/cancel`,
        withTimeout({ method: 'POST', headers: { Accept: 'application/json' } }),
      )
      const body = await res.json().catch(() => ({})) as { status?: TotemHandoffStatus }
      return { ok: res.ok, status: body.status }
    } catch {
      return { ok: false }
    }
  },

  /** GET api/orders por consumptioncode — polling de status e conta da mesa */
  getOrdersByCode: (consumptioncode: string, branchId: string, simpleAuth: string) =>
    request<{ data: TableOrder[]; session?: TableSessionInfo }>(
      `api/orders?consumptioncode=${encodeURIComponent(consumptioncode)}&branch=${branchId}&simpleAuth=${encodeURIComponent(simpleAuth)}&$sort[createdAt]=-1&$limit=50`
    ),

  /** POST api/waiter-call — notificar garçom */
  postWaiterCall: (table: string, branchId: string, simpleAuth: string) =>
    fetch(`${BASE_URL}/api/waiter-call`, withTimeout({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, branch: branchId, simpleAuth }),
    })).then((r) => r.json()).catch(() => ({})),

  /** POST api/reviews — NPS pós-pedido */
  postReview: (data: { branch: string; consumptioncode: string; rating: number; simpleAuth: string }) =>
    fetch(`${BASE_URL}/api/reviews`, withTimeout({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })).then((r) => r.json()).catch(() => ({})),
}

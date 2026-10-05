import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useCartStore } from '../store/cartStore'
import { api, countsToBill, complementEntries } from '../api/client'
import type { TableOrder, TableOrderItem, TableSessionInfo } from '../api/client'
import { formatCurrency } from '../lib/pricing'
import { formatQuantity, formatUnitPrice, roundQty } from '../lib/billFormat'
import { statusTrackingEnabled, statusChip } from '../lib/statusPanel'
import { orderAuthor, orderAuthorName, isMyOrder, maskPhone } from '../lib/orderAuthor'
import { MOCK_BILL, MOCK_BANNER, getMockBill, getMockSession } from '../lib/mockBill'
import { checkIdentity } from '../lib/identity'
import IdentifyGate from '../components/IdentifyGate'
import HeaderButton from '../components/HeaderButton'
import Icon from '../components/Icon'
import type { IconName } from '../components/Icon'
import QrScanner from '../components/QrScanner'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando cozinha',
  in_progress: 'Em preparo',
  ready: 'Pronto',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

/** O pedido tem item cancelado ou transferido? */
function hasExcludedItem(o: TableOrder): boolean {
  return (o.items ?? []).some((i) => !countsToBill(i))
}

/**
 * Total do pedido: o backend usa nomes diferentes conforme o canal de origem.
 *
 * **Quando há item cancelado ou transferido, a soma é refeita a partir dos itens
 * ativos** em vez de confiar no `total` do cabeçalho. O backend *deve* mandar o
 * total já líquido (ver BACKEND.md §4), mas se ele não mandar, a tela exibiria um
 * item riscado como "Cancelado" **e** o cobraria no total — duas informações que
 * se contradizem na mesma tela. Contradição visível é o que destrói a confiança
 * na conta; preferir o cálculo por item nesse caso é o menor dos males.
 */
function orderTotal(o: TableOrder): number {
  if (hasExcludedItem(o)) {
    return (o.items ?? [])
      .filter(countsToBill)
      .reduce((acc, i) => acc + itemTotal(i), 0)
  }
  return o.total ?? o.amount ?? o.subtotal ?? 0
}

/**
 * Desconto do pedido: o do cabeçalho (cupom) mais os aplicados item a item
 * (cortesia, promoção pontual). Somar os dois evita que um desconto lançado no
 * item apareça na linha e suma do total.
 */
function orderDiscount(o: TableOrder): number {
  // Desconto de item cancelado não existe: o item não está sendo cobrado
  const items = (o.items ?? [])
    .filter(countsToBill)
    .reduce((acc, i) => acc + itemDiscount(i), 0)
  return (o.discount ?? 0) + items
}

function orderServiceTax(o: TableOrder): number {
  return o.serviceTax ?? 0
}

function itemTotal(i: TableOrderItem): number {
  if (typeof i.amount === 'number') return i.amount
  return (i.price ?? 0) * (i.quantity ?? 1)
}

function itemDiscount(i: TableOrderItem): number {
  return i.discount ?? 0
}

/**
 * Assinatura dos complementos de um item, para saber o que pode virar uma
 * linha só na visão resumida.
 *
 * Dois "Frango crocante" com bebidas diferentes **não** são a mesma linha:
 * somá-los deixaria a conta compacta e errada. A visão resumida junta o que é
 * de fato idêntico e nada além disso.
 */
function itemSignature(i: TableOrderItem): string {
  const extras = complementEntries(i)
    .map((c) => `${c.name}×${c.quantity ?? 1}`)
    .sort()
    .join('|')
  // A observação não entra: ela não é exibida no resumo, então separar linhas
  // por causa dela deixaria dois "Frango crocante" idênticos aos olhos do
  // cliente aparecendo em linhas distintas, sem explicação visível.
  //
  // A unidade **entra**: 1 un e 0,4 kg do mesmo produto não podem virar "1,4"
  // de coisa nenhuma. Unidades diferentes viram linhas diferentes.
  const unit = (i.unit ?? '').trim().toLocaleLowerCase('pt-BR')
  return `${(i.name ?? '').trim().toLocaleLowerCase('pt-BR')}::${unit}::${extras}`
}

interface SummaryLine {
  key: string
  name: string
  quantity: number
  unit?: string
  total: number
  discount: number
  extras: string[]
}

/**
 * Junta itens iguais de todos os pedidos numa lista única.
 *
 * Só itens que **contam**: cancelado e transferido ficam fora, senão a
 * quantidade da linha inflaria e a conta resumida deixaria de fechar com o
 * total. Eles aparecem na visão detalhada, riscados — e o resumo avisa quantos
 * existem (ver `excludedCount`).
 */
function summarize(orders: TableOrder[]): SummaryLine[] {
  const map = new Map<string, SummaryLine>()
  for (const o of orders) {
    for (const item of (o.items ?? []).filter(countsToBill)) {
      const key = itemSignature(item)
      const extras = complementEntries(item)
        .map((c) => (c.quantity && c.quantity > 1 ? `${c.quantity}× ${c.name}` : c.name))
        .filter(Boolean) as string[]

      const line = map.get(key)
      if (line) {
        // `roundQty` a cada acumulação: somando decimais em ponto flutuante,
        // 0,412 + 0,385 dá 0,7970000000000001 — e isso ia para a tela
        line.quantity = roundQty(line.quantity + (item.quantity ?? 1))
        line.total += itemTotal(item)
        line.discount += itemDiscount(item)
      } else {
        map.set(key, {
          key,
          name: item.name ?? 'Item',
          quantity: item.quantity ?? 1,
          unit: item.unit,
          total: itemTotal(item),
          discount: itemDiscount(item),
          extras,
        })
      }
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

function formatTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** "1h 25min" · "40min" — tempo desde a abertura da mesa. */
function elapsedSince(iso: string | undefined, now: number): string | null {
  if (!iso) return null
  const start = new Date(iso).getTime()
  if (Number.isNaN(start) || start > now) return null
  const min = Math.floor((now - start) / 60_000)
  if (min < 1) return 'agora há pouco'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const rest = min % 60
  return rest === 0 ? `${h}h` : `${h}h ${rest}min`
}

function personName(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (v && typeof v === 'object' && 'name' in v) {
    return ((v as { name?: string }).name ?? '').trim() || null
  }
  return null
}

export default function TableBill() {
  const navigate = useNavigate()
  const { branch, params } = useAppStore()
  const { consumptioncode, clientName, clientPhone, loadSavedClient } = useCartStore()

  const [orders, setOrders] = useState<TableOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  /** 'resumida' (padrão) = itens iguais somados · 'detalhada' = por pedido/pessoa */
  const [view, setView] = useState<'detalhada' | 'resumida'>('resumida')
  /** Filtro de autor na visão detalhada. `null` = todos. */
  const [authorFilter, setAuthorFilter] = useState<string | null>(null)
  const [session, setSession] = useState<TableSessionInfo | null>(null)
  /** Quando os dados na tela foram buscados com sucesso. */
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  /** Só para o tempo decorrido avançar sozinho na tela */
  const [, tick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => tick((t) => t + 1), 60_000)
    return () => clearInterval(timer)
  }, [])

  const isMesa = params?.mode === 'mesa'
  // Em mesa o código é o nome da mesa e vem da URL mesmo sem carrinho aberto.
  const code = isMesa ? (params?.table ?? '') : consumptioncode

  const load = useCallback(async () => {
    // Mock ligado: nem chega a consultar a API. Ver src/lib/mockBill.ts
    if (MOCK_BILL) {
      const now = Date.now()
      setOrders(getMockBill(now, clientPhone))
      setSession(getMockSession(now))
      setFetchedAt(now)
      setError(null)
      setLoading(false)
      return
    }
    if (!code || !params?.branchId) {
      setLoading(false)
      setError('empty')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await api.getOrdersByCode(
        code,
        params.branchId,
        branch?.settingsWeb?.simpleAuth ?? '',
      )
      setOrders(res.data ?? [])
      setSession(res.session ?? null)
      setFetchedAt(Date.now())
    } catch {
      setError('network')
    } finally {
      setLoading(false)
    }
  }, [code, params?.branchId, branch])

  // Recupera nome/telefone salvos para saber quais pedidos são meus
  useEffect(() => { loadSavedClient() }, [])
  useEffect(() => { load() }, [load])

  // Conta desligada pela branch: a rota existe, mas não entrega nada
  const billEnabled = branch?.settingsWeb?.billEnabled !== false
  useEffect(() => {
    if (!billEnabled) navigate('/', { replace: true })
  }, [billEnabled])

  /**
   * A conta da mesa mostra o consumo de todo mundo sentado ali. Abrir sem se
   * identificar seria ver o gasto alheio sem dar nome — por isso o gate.
   */
  const requireId = branch?.settingsWeb?.requireIdentification !== false
  const identity = checkIdentity(clientName, clientPhone)
  const [identified, setIdentified] = useState(false)

  const me = { name: clientName, phone: clientPhone }

  /**
   * Duas listas, de propósito.
   *
   * `visible` — tudo que aparece na tela, inclusive pedido cancelado.
   * `active`  — o que entra na soma.
   *
   * Antes o cancelado era filtrado das duas coisas: ele sumia da tela. Para o
   * cliente que viu o item ali dois minutos antes, isso parece erro do app — ou
   * que a casa mexeu na conta escondido. Mostrar riscado, com o rótulo
   * "Cancelado", é o que explica a diferença sem ele precisar perguntar.
   */
  const visible = orders ?? []
  const active = visible.filter((o) => o.status !== 'cancelled')

  /**
   * Andamento da cozinha, agregado por status — alimenta a conta resumida (W1).
   *
   * Conta **pedidos**, não itens: é o pedido que tem status. Ordem fixa (cozinha →
   * produção → pronto → entregue) para a fila não dançar entre atualizações.
   */
  const trackingEnabled = statusTrackingEnabled(branch?.settingsWeb)
  const kitchenProgress = (() => {
    if (!trackingEnabled) return []
    const ORDER = ['pending', 'in_progress', 'ready', 'on_the_way'] as const
    return ORDER
      .map((status) => ({
        chip: statusChip(status, params?.mode),
        count: active.filter((o) => o.status === status).length,
      }))
      .filter((r): r is { chip: NonNullable<typeof r.chip>; count: number } =>
        r.chip !== null && r.count > 0)
  })()

  /** Itens visíveis que não entram na conta — o resumo avisa que existem. */
  const excludedCount = visible.reduce(
    (acc, o) =>
      acc + (o.status === 'cancelled'
        ? (o.items ?? []).length
        : (o.items ?? []).filter((i) => !countsToBill(i)).length),
    0,
  )

  const subtotal = active.reduce((acc, o) => acc + orderTotal(o), 0)
  const discount = active.reduce((acc, o) => acc + orderDiscount(o), 0)
  const serviceTax = active.reduce((acc, o) => acc + orderServiceTax(o), 0)
  const grandTotal = subtotal - discount + serviceTax

  const coupons = [
    ...new Set(active.map((o) => o.coupon?.title?.trim()).filter(Boolean) as string[]),
  ]

  /** Dado com mais de 2min, ou última tentativa falhada, deixa de ser confiável
   *  para comparar com o app do garçom. */
  /** Visão detalhada pode ser desligada pela branch — ver settingsWeb. */
  const detailedEnabled = branch?.settingsWeb?.billDetailedEnabled !== false
  const effectiveView = detailedEnabled ? view : 'resumida'

  const STALE_MS = 2 * 60_000
  const staleWarning = error === 'network' || (fetchedAt !== null && Date.now() - fetchedAt > STALE_MS)

  const comandaLabel = branch?.settingsWeb?.comandaLabel?.trim() || 'Comanda'
  const usesComanda = active.some((o) => (o.comanda ?? '').trim() !== '')

  /**
   * Quanto cada participante consumiu.
   *
   * Quando a mesa usa comanda, ela é a chave — é por ela que o caixa fecha.
   * Sem comanda, agrupa por telefone (identifica a pessoa) e cai para o nome.
   */
  /** Chave estável do autor — usada no agrupamento e no filtro. */
  const authorKey = (o: TableOrder): string => {
    if (orderAuthor(o) === 'atendente') return 'atendente'
    const tab = (o.comanda ?? '').trim()
    if (tab) return `c:${tab}`
    if (isMyOrder(o, me)) return 'eu'
    return o.phone || orderAuthorName(o) || o._id
  }

  const authorLabel = (o: TableOrder): string => {
    const name = orderAuthorName(o)
    if (orderAuthor(o) === 'atendente') return `Atendente${name ? ` · ${name}` : ''}`
    const tab = (o.comanda ?? '').trim()
    if (tab) return `${comandaLabel} ${tab}${name ? ` · ${name}` : ''}`
    return isMyOrder(o, me) ? 'Você' : name || 'Outra pessoa'
  }

  const perPerson = (() => {
    const map = new Map<string, { key: string; label: string; mine: boolean; total: number }>()
    // `visible`: quem só teve pedido cancelado continua aparecendo no filtro,
    // com total zerado. Somem da lista e o cliente não acha o item riscado.
    for (const o of visible) {
      const key = authorKey(o)
      const mine = isMyOrder(o, me)
      const row = map.get(key)
      // Pedido cancelado entra na lista de pessoas, mas com valor zero
      const value = o.status === 'cancelled' ? 0 : orderTotal(o)
      if (row) {
        row.total += value
        row.mine = row.mine || mine
      } else {
        map.set(key, { key, label: authorLabel(o), mine, total: value })
      }
    }
    return [...map.values()].sort((a, b) => Number(b.mine) - Number(a.mine))
  })()

  // Filtro pendurado num autor que sumiu (pedido cancelado, recarga) volta a
  // "todos" em vez de mostrar uma lista vazia sem explicação
  const filterValid = authorFilter !== null && perPerson.some((p) => p.key === authorFilter)
  const shownOrders = filterValid
    ? visible.filter((o) => authorKey(o) === authorFilter)
    : visible

  if (requireId && !identity.ok && !identified) {
    return (
      <IdentifyGate
        reason="A conta mostra o consumo de todos na mesa. Identifique-se para abrir."
        onDone={() => setIdentified(true)}
      />
    )
  }

  return (
    <div className="min-h-screen"
      style={{ background: 'var(--bg-page)', paddingBottom: 'calc(190px + env(safe-area-inset-bottom, 0px))' }}>
      {/* Header */}
      <div className="px-4 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm"
        style={{ background: 'var(--bg-card)' }}>
        <HeaderButton icon="back" onClick={() => navigate(-1)} label="Voltar" emphasis />
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold" style={{ color: 'var(--text-hi)' }}>
            Conta {isMesa ? `da mesa ${code}` : ''}
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-lo)' }}>
            {loading ? 'Carregando…' : `${visible.length} pedido${visible.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <HeaderButton icon="refresh" onClick={load} label="Atualizar"
          emphasis disabled={loading} spin={loading} />
      </div>

      {/* Tarja de mock — impossível confundir com a conta real */}
      {MOCK_BILL && (
        <div className="px-4 py-2 text-center text-xs font-semibold"
          style={{ background: '#fef3c7', color: '#92400e' }}>
          <Icon name="warning" size={11} /> {MOCK_BANNER}
        </div>
      )}

      <QrScanner open={scannerOpen} onClose={() => setScannerOpen(false)} />

      {/* Cabeçalho da mesa: desde quando está aberta e quem atende */}
      {(session?.openedAt || personName(session?.waiter)) && (
        <div className="mx-4 mt-3 rounded-2xl border px-4 py-3 flex flex-wrap gap-x-6 gap-y-2"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          {session?.openedAt && (
            <div>
              <p className="text-xs" style={{ color: 'var(--text-lo)' }}>Mesa aberta às</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
                {formatTime(session.openedAt)}
                {(() => {
                  const el = elapsedSince(session.openedAt, Date.now())
                  return el ? (
                    <span className="font-normal" style={{ color: 'var(--text-lo)' }}> · há {el}</span>
                  ) : null
                })()}
              </p>
            </div>
          )}
          {personName(session?.waiter) && (
            <div>
              <p className="text-xs" style={{ color: 'var(--text-lo)' }}>Atendimento</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
                🧑‍🍳 {personName(session?.waiter)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Seletor de visão — sem a detalhada, não há o que escolher */}
      {visible.length > 0 && detailedEnabled && (
        <div className="px-4 pt-3">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-input)' }}>
            {([
              ['resumida', 'Resumida'],
              ['detalhada', 'Detalhada'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors"
                style={view === id
                  ? { background: 'var(--bg-card)', color: 'var(--text-hi)' }
                  : { background: 'transparent', color: 'var(--text-lo)' }
                }
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs mt-1.5 text-center" style={{ color: 'var(--text-lo)' }}>
            {view === 'detalhada'
              ? 'Cada pedido, com quem lançou e o horário'
              : 'Itens iguais somados, como na conta do caixa'}
          </p>
        </div>
      )}

      <div className="px-4 pt-4 flex flex-col gap-4">
        {loading && orders === null && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
        )}

        {error === 'network' && (
          <EmptyState
            icon="offline"
            title="Não foi possível carregar"
            text="Verifique a conexão e tente de novo. Se persistir, chame um atendente."
            action={{ label: 'Tentar novamente', onClick: load }}
          />
        )}

        {error === 'empty' && (
          <EmptyState
            icon="table"
            title="Mesa não identificada"
            text="Escaneie o QR Code da mesa para ver a conta."
            action={{ label: 'Escanear QR Code', onClick: () => setScannerOpen(true) }}
          />
        )}

        {!loading && !error && visible.length === 0 && (
          <EmptyState
            icon="bill"
            title="Nenhum pedido ainda"
            text={isMesa
              ? 'Os pedidos desta mesa aparecem aqui assim que forem lançados.'
              : 'Seus pedidos aparecem aqui assim que forem enviados.'}
            action={{ label: 'Ver cardápio', onClick: () => navigate('/') }}
          />
        )}

        {/* Visão resumida: uma linha por item, somando pedidos e pessoas */}
        {/*
          W1 — andamento da cozinha na conta resumida.
          A resumida junta itens de pedidos **com status diferentes**, então chip
          por linha seria mentira: "Frango crocante ×3" pode ter um pronto e dois
          na chapa. O agregado por pedido informa sem atribuir status a uma linha
          que não tem um só. Só aparece se a casa publica status.
        */}
        {trackingEnabled && effectiveView === 'resumida' && kitchenProgress.length > 0 && (
          <div className="flex gap-2 flex-wrap px-1">
            {kitchenProgress.map(({ chip, count }) => (
              <span key={chip.label} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: chip.bg, color: chip.fg }}>
                {count} {chip.label.toLowerCase()}
              </span>
            ))}
          </div>
        )}

        {effectiveView === 'resumida' && visible.length > 0 && (
          <div className="rounded-2xl border overflow-hidden"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="divide-y" style={{ borderColor: 'var(--divider)' }}>
              {summarize(active).map((line) => (
                <div key={line.key} className="px-4 py-3 flex items-start gap-3">
                  <span className="text-sm font-semibold flex-shrink-0"
                    style={{ color: 'var(--text-lo)' }}>
                    {formatQuantity(line.quantity, line.unit)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-hi)' }}>
                      {line.name}
                    </p>
                    {line.extras.length > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
                        {line.extras.join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
                      {formatCurrency(line.total - line.discount)}
                    </p>
                    {line.discount > 0 && (
                      <p className="text-xs font-semibold" style={{ color: 'var(--color-brand)' }}>
                        − {formatCurrency(line.discount)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/*
              A resumida é a visão "quanto vou pagar", então item cancelado ou
              transferido não entra nas linhas — inflaria a quantidade e a conta
              deixaria de fechar. Mas sonegar a existência dele é o que gera a
              pergunta "e a batata que eu pedi?". O aviso resolve os dois lados.
            */}
            {excludedCount > 0 && (
              <p className="px-4 py-2.5 text-xs border-t"
                style={{ color: 'var(--text-lo)', borderColor: 'var(--divider)' }}>
                {excludedCount === 1
                  ? '1 item cancelado ou transferido não entra nesta conta.'
                  : `${excludedCount} itens cancelados ou transferidos não entram nesta conta.`}
                {detailedEnabled && ' Veja na conta detalhada.'}
              </p>
            )}
          </div>
        )}

        {/* Filtro por quem lançou — só com mais de um participante */}
        {effectiveView === 'detalhada' && perPerson.length > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
            <FilterChip
              label="Todos"
              active={!filterValid}
              onClick={() => setAuthorFilter(null)}
            />
            {perPerson.map((p) => (
              <FilterChip
                key={p.key}
                label={p.label}
                active={filterValid && authorFilter === p.key}
                onClick={() => setAuthorFilter(authorFilter === p.key ? null : p.key)}
              />
            ))}
          </div>
        )}

        {effectiveView === 'detalhada' && shownOrders.map((order) => {
          const isStaff = orderAuthor(order) === 'atendente'
          const mine = isMyOrder(order, me)
          const name = orderAuthorName(order)
          const phone = maskPhone(order.phone)
          return (
            <div key={order._id} className="rounded-2xl border overflow-hidden"
              style={{
                background: 'var(--bg-card)',
                // Destaca visualmente o que é meu no meio da conta da mesa
                borderColor: mine ? 'var(--color-brand-medium)' : 'var(--border)',
              }}>

              <div className="px-4 py-3 flex items-center gap-2 flex-wrap"
                style={{ background: 'var(--bg-input)' }}>
                <AuthorBadge staff={isStaff} mine={mine} name={name} />
                {(order.comanda ?? '').trim() && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--bg-card)', color: 'var(--text-lo)', border: '1px solid var(--border)' }}>
                    {comandaLabel} {order.comanda}
                  </span>
                )}
                {phone && !isStaff && (
                  <span className="text-xs" style={{ color: 'var(--text-lo)' }}>{phone}</span>
                )}
                <span className="text-xs ml-auto"
                  style={{
                    color: order.status === 'cancelled' ? '#B91C1C' : 'var(--text-lo)',
                    fontWeight: order.status === 'cancelled' ? 600 : undefined,
                  }}>
                  {[STATUS_LABEL[order.status] ?? order.status, formatTime(order.createdAt)]
                    .filter(Boolean).join(' · ')}
                </span>
              </div>

              {/* Pedido cancelado inteiro: aparece, mas com a razão explícita de
                  não estar somando. Antes era filtrado fora e sumia da tela. */}
              {order.status === 'cancelled' && (
                <p className="px-4 py-2 text-xs font-semibold"
                  style={{ background: '#FEF2F2', color: '#B91C1C' }}>
                  Pedido cancelado — nenhum item deste pedido entra na conta
                </p>
              )}

              <div className="divide-y" style={{ borderColor: 'var(--divider)' }}>
                {(order.items ?? []).map((item, idx) => {
                  const extras = complementEntries(item)
                    .map((c) => (c.quantity && c.quantity > 1 ? `${c.quantity}× ${c.name}` : c.name))
                    .filter(Boolean)
                  // Pedido cancelado risca todos os itens dele, mesmo os que não
                  // trazem status próprio
                  const excluded = order.status === 'cancelled' || !countsToBill(item)
                  const itemStatus = order.status === 'cancelled'
                    ? 'cancelled'
                    : (item.status ?? 'active')
                  const unitPriceText = formatUnitPrice(item.unitPrice, item.unit, formatCurrency)
                  return (
                    <div key={item._id ?? idx} className="px-4 py-3 flex items-start gap-3"
                      style={{ opacity: excluded ? 0.55 : 1 }}>
                      <span className="text-sm font-semibold flex-shrink-0"
                        style={{
                          color: 'var(--text-lo)',
                          textDecoration: excluded ? 'line-through' : undefined,
                        }}>
                        {formatQuantity(item.quantity, item.unit)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium"
                          style={{
                            color: 'var(--text-hi)',
                            textDecoration: excluded ? 'line-through' : undefined,
                          }}>
                          {item.name ?? 'Item'}
                        </p>
                        {/* Preço por unidade: sem ele, "0,412 kg = R$37,04" é um
                            número que o cliente não tem como conferir */}
                        {unitPriceText && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
                            {unitPriceText}
                          </p>
                        )}
                        {extras.length > 0 && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
                            {extras.join(', ')}
                          </p>
                        )}
                        {item.note && (
                          <p className="text-xs mt-0.5 text-amber-600">Obs: {item.note}</p>
                        )}
                        {/* O rótulo explica por que a linha está riscada e por que
                            o valor não entra na soma */}
                        {itemStatus === 'cancelled' && (
                          <p className="text-xs mt-1 font-semibold" style={{ color: '#B91C1C' }}>
                            Cancelado · não entra na conta
                          </p>
                        )}
                        {itemStatus === 'transferred' && (
                          <p className="text-xs mt-1 font-semibold" style={{ color: '#B45309' }}>
                            Transferido{item.transferredTo ? ` para ${item.transferredTo}` : ''}
                            {' '}· não entra nesta conta
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm font-semibold"
                          style={{
                            color: excluded ? 'var(--text-lo)' : 'var(--text-hi)',
                            textDecoration: excluded ? 'line-through' : undefined,
                          }}>
                          {formatCurrency(itemTotal(item) - itemDiscount(item))}
                        </p>
                        {itemDiscount(item) > 0 && (
                          <>
                            <p className="text-xs line-through" style={{ color: 'var(--text-lo)' }}>
                              {formatCurrency(itemTotal(item))}
                            </p>
                            <p className="text-xs font-semibold" style={{ color: 'var(--color-brand)' }}>
                              − {formatCurrency(itemDiscount(item))}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="px-4 py-2.5 flex justify-between"
                style={{ borderTop: '1px solid var(--divider)' }}>
                <span className="text-xs" style={{ color: 'var(--text-lo)' }}>
                  Subtotal do pedido
                </span>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
                  {formatCurrency(orderTotal(order))}
                </span>
              </div>
            </div>
          )
        })}

        {/* Consumo por pessoa — só faz sentido com mais de um participante */}
        {effectiveView === 'detalhada' && perPerson.length > 1 && (
          <div className="rounded-2xl border p-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-hi)' }}>
              {usesComanda ? `Consumo por ${comandaLabel.toLowerCase()}` : 'Consumo por pessoa'}
            </p>
            <div className="flex flex-col gap-1.5">
              {perPerson.map((p) => (
                <div key={p.label} className="flex justify-between text-sm">
                  <span style={{ color: p.mine ? 'var(--color-brand)' : 'var(--text-lo)' }}>
                    {p.label}
                  </span>
                  <span style={{ color: 'var(--text-hi)' }}>{formatCurrency(p.total)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs mt-2.5" style={{ color: 'var(--text-lo)' }}>
              Divisão apenas informativa — o fechamento é no caixa.
            </p>
          </div>
        )}

        {visible.length > 0 && serviceTax === 0 && (
          <p className="text-xs text-center px-4" style={{ color: 'var(--text-lo)' }}>
            Valores conforme lançados no sistema. Taxa de serviço, se houver, é
            fechada no caixa.
          </p>
        )}
      </div>

      {/* Total fixo */}
      {visible.length > 0 && (
        /* Encostada na TabBar, não no fundo da tela */
        <div className="fixed left-0 right-0 border-t px-4 py-3 z-20"
          style={{
            background: 'var(--bg-card)',
            borderColor: 'var(--border)',
            bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
          }}>

          {/* Só mostra as linhas que existem de fato. A tela nunca calcula taxa
              de serviço sozinha: número de dinheiro inventado na conta é o tipo
              de erro que o cliente descobre na hora de pagar. */}
          {(discount > 0 || serviceTax > 0) && (
            <div className="flex flex-col gap-1 mb-2">
              <Row label="Subtotal" value={subtotal} />
              {discount > 0 && (
                <Row
                  label={coupons.length > 0 ? `Desconto (${coupons.join(', ')})` : 'Desconto'}
                  value={-discount}
                  highlight="var(--color-brand)"
                />
              )}
              {serviceTax > 0 && <Row label="Taxa de serviço" value={serviceTax} />}
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="font-semibold" style={{ color: 'var(--text-hi)' }}>Total</span>
            <span className="text-xl font-bold" style={{ color: 'var(--text-hi)' }}>
              {formatCurrency(grandTotal)}
            </span>
          </div>

          {/* Carimbo de atualização.
              Se o servidor cair, a tela segue mostrando o último dado que
              conseguiu buscar — e sem esta linha o cliente compara com o app do
              garçom, vê valores diferentes e conclui que alguém está errado. */}
          <p className="text-[11px] mt-1.5 text-center" style={{ color: staleWarning ? '#b45309' : 'var(--text-lo)' }}>
            {fetchedAt
              ? `${staleWarning ? '⚠ ' : ''}Atualizado às ${new Date(fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
              : 'Ainda não foi possível atualizar'}
            {staleWarning && ' — pode estar desatualizado'}
          </p>
        </div>
      )}
    </div>
  )
}

function FilterChip({ label, active, onClick }: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors"
      style={active
        ? { background: 'var(--color-brand)', color: '#fff', borderColor: 'var(--color-brand)' }
        : { background: 'var(--bg-card)', color: 'var(--text-lo)', borderColor: 'var(--border)' }
      }
    >
      {label}
    </button>
  )
}

function Row({ label, value, highlight }: {
  label: string
  value: number
  highlight?: string
}) {
  const color = highlight ?? 'var(--text-lo)'
  return (
    <div className="flex justify-between text-xs">
      <span style={{ color }}>{label}</span>
      <span style={{ color }}>
        {value < 0 ? `− ${formatCurrency(Math.abs(value))}` : formatCurrency(value)}
      </span>
    </div>
  )
}

/**
 * Numa mesa cada pessoa pede do próprio celular, então o selo precisa dizer
 * *quem*, não só "cliente". Sem nome cadastrado sobra "Alguém da mesa" — é
 * honesto: o pedido existe e ninguém se identificou.
 */
function AuthorBadge({ staff, mine, name }: {
  staff: boolean
  mine: boolean
  name: string | null
}) {
  const label = staff
    ? `Atendente${name ? ` · ${name}` : ''}`
    : mine
    ? 'Você'
    : name || 'Alguém da mesa'

  const style = staff
    ? { background: 'rgba(245,158,11,.14)', color: '#b45309' }
    : mine
    ? { background: 'var(--color-brand-light)', color: 'var(--color-brand)' }
    : { background: 'rgba(59,130,246,.12)', color: '#1d4ed8' }

  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={style}>
      <Icon name={staff ? 'staff' : mine ? 'phone' : 'profile'} size={9} /> {label}
    </span>
  )
}

function EmptyState({ icon, title, text, action }: {
  icon: IconName
  title: string
  text: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-16 px-6">
      <span className="w-16 h-16 rounded-full flex items-center justify-center"
        style={{ background: 'var(--bg-input)' }}>
        <Icon name={icon} size={26} color="var(--text-lo)" />
      </span>
      <p className="text-base font-bold" style={{ color: 'var(--text-hi)' }}>{title}</p>
      <p className="text-sm max-w-xs" style={{ color: 'var(--text-lo)' }}>{text}</p>
      {action && (
        <button onClick={action.onClick}
          className="mt-1 px-6 py-3 rounded-xl text-white font-semibold text-sm"
          style={{ backgroundColor: 'var(--color-brand)' }}>
          {action.label}
        </button>
      )}
    </div>
  )
}

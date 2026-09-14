import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { formatCurrency } from '../lib/pricing'
import {
  loadOrderHistory, clearOrderHistory, groupByDay, hasMultipleBranches,
} from '../lib/orderHistory'
import type { HistoryOrder, HistoryAddress } from '../lib/orderHistory'
import { paymentBadge } from '../lib/paymentLabel'
import type { PaymentTone } from '../lib/paymentLabel'
import { statusTrackingEnabled, statusChip } from '../lib/statusPanel'
import { api } from '../api/client'
import { MOCK_BILL, getMockOrderStatus } from '../lib/mockBill'
import HeaderButton from '../components/HeaderButton'
import Icon from '../components/Icon'
import type { IconName } from '../components/Icon'
import { toast } from '../store/toastStore'
import { MOCK_HISTORY, MOCK_HISTORY_BANNER, getMockHistory } from '../lib/mockHistory'

/** Cores do selo de pagamento. `unknown` é neutro de propósito — não é alerta. */
const TONE: Record<PaymentTone, { bg: string; fg: string; icon: IconName }> = {
  paid:    { bg: 'rgba(16,185,129,.10)', fg: '#065f46', icon: 'success' },
  pending: { bg: 'rgba(245,158,11,.12)', fg: '#92400E', icon: 'waiting' },
  failed:  { bg: '#FEE2E2',              fg: '#B91C1C', icon: 'error' },
  unknown: { bg: 'var(--bg-input)',      fg: 'var(--text-lo)', icon: 'info' },
}

function AddressLine({ address }: { address: HistoryAddress }) {
  const line = [
    [address.street, address.number].filter(Boolean).join(', '),
    address.complement,
    address.district,
  ].filter(Boolean).join(' · ')

  return (
    <div className="px-4 py-2.5" style={{ borderTop: '1px solid var(--divider)' }}>
      <p className="text-xs font-semibold flex items-center gap-1.5"
        style={{ color: 'var(--text-lo)' }}>
        <Icon name="delivering" size={11} />
        Entrega{address.label ? ` · ${address.label}` : ''}
      </p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--text-hi)' }}>{line}</p>
      {address.reference && (
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
          Ref: {address.reference}
        </p>
      )}
      {typeof address.deliveryFee === 'number' && address.deliveryFee > 0 && (
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
          Taxa de entrega {formatCurrency(address.deliveryFee)}
        </p>
      )}
    </div>
  )
}

/**
 * Pedidos que este aparelho enviou.
 *
 * Fonte é o `localStorage`, não a API: no balcão não existe conta de mesa para
 * consultar, e o cliente continua tendo direito de ver o que pediu depois que a
 * comanda fechou.
 *
 * Agrupado **por dia** (ver `groupByDay`), com a unidade como etiqueta quando há
 * mais de uma. O status vem da API, só para os pedidos de hoje — o histórico é do
 * aparelho, mas o andamento é do restaurante.
 */
export default function OrderHistory() {
  const navigate = useNavigate()
  const { branch, params } = useAppStore()
  const [orders, setOrders] = useState<HistoryOrder[]>([])
  /** Dias colapsados. Todos abertos por padrão: histórico curto não precisa de clique. */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const branchId = params?.branchId ?? ''

  const refresh = () => {
    /**
     * Todas as unidades **desta empresa**, não só a do QR atual.
     *
     * Seguro porque o `localStorage` já é isolado por company (`storageScope.ts`):
     * o que se lê aqui nunca alcança outra empresa. E é o que o cliente espera —
     * quem pediu na unidade do shopping e hoje está na do centro continua achando
     * o pedido de ontem. A unidade vira etiqueta na linha quando há mais de uma.
     */
    const real = loadOrderHistory()
    // Mesclado, não substituído: um pedido real enviado agora aparece no topo,
    // junto dos exemplos. Ver src/lib/mockHistory.ts
    const list = MOCK_HISTORY
      ? [...real, ...getMockHistory(Date.now(), branchId, branch?.name)]
          .sort((a, b) => b.at.localeCompare(a.at))
      : real
    setOrders(list)
  }

  useEffect(refresh, [branchId])

  const handleClear = () => {
    clearOrderHistory()
    refresh()
    toast.success('Histórico apagado deste aparelho.')
  }

  /** Só a hora: o dia já é o cabeçalho do grupo. */
  const formatTime = (iso: string) => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  /**
   * W2 — status ao vivo dos pedidos recentes.
   *
   * O histórico é do aparelho, mas o **status** é do restaurante. Sem esta
   * consulta o cliente saía da confirmação, voltava em "Pedidos" para ver se
   * ficou pronto, e não encontrava nada — a aba que ele mais abre era a única
   * sem a informação que ele foi buscar.
   *
   * Só os pedidos de **hoje**: status de pedido de anteontem não existe mais no
   * backend, e consultar histórico inteiro a cada abertura seria gasto sem
   * retorno. Fora dessa janela, a linha simplesmente não mostra status.
   */
  const [liveStatus, setLiveStatus] = useState<Record<string, string>>({})
  /** Âncora da progressão falsa — só usada com MOCK_BILL. */
  const mockStartedAt = useRef(0)

  const tracking = statusTrackingEnabled(branch?.settingsWeb)
  const simpleAuth = branch?.settingsWeb?.simpleAuth ?? ''

  useEffect(() => {
    if (!tracking || !branchId) return

    // Códigos distintos dos pedidos de hoje — vários pedidos compartilham o
    // mesmo `consumptioncode` numa mesma mesa, então uma consulta serve para todos
    const today = new Date().toDateString()
    const codes = [...new Set(
      orders
        .filter((o) => new Date(o.at).toDateString() === today)
        .map((o) => o.consumptioncode)
        .filter(Boolean),
    )].slice(0, 5)   // teto: histórico grande não vira rajada de requisições

    if (codes.length === 0) return

    let alive = true
    const load = async () => {
      if (MOCK_BILL) {
        if (!alive) return
        // Progressão contada da abertura da tela. `Date.now() % 60_000` faria o
        // chip pular para trás a cada minuto — pareceria defeito, não demo.
        // O deslocamento por índice põe cada pedido num ponto diferente da fila.
        if (!mockStartedAt.current) mockStartedAt.current = Date.now()
        const elapsed = Date.now() - mockStartedAt.current
        setLiveStatus(Object.fromEntries(
          codes.map((c, i) => [c, getMockOrderStatus(elapsed + i * 12_000)]),
        ))
        return
      }
      const found: Record<string, string> = {}
      await Promise.all(codes.map(async (code) => {
        try {
          const res = await api.getOrdersByCode(code, branchId, simpleAuth)
          const latest = res.data?.[0]
          if (latest?.status) found[code] = latest.status
        } catch {
          // Silencioso: histórico é útil mesmo sem status
        }
      }))
      if (alive) setLiveStatus(found)
    }

    load()
    const timer = setInterval(load, MOCK_BILL ? 5_000 : 30_000)
    return () => { alive = false; clearInterval(timer) }
  }, [tracking, branchId, simpleAuth, orders])

  const groups = groupByDay(orders)
  /** Etiqueta de unidade só quando há mais de uma — senão é ruído em toda linha. */
  const showBranch = hasMultipleBranches(orders)

  const toggleDay = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="min-h-screen"
      style={{ background: 'var(--bg-page)', paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 0px))' }}>

      <div className="px-4 py-4 sticky top-0 z-10 shadow-sm flex items-center gap-3"
        style={{ background: 'var(--bg-card)' }}>
        <HeaderButton icon="back" onClick={() => navigate(-1)} label="Voltar" emphasis />
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold" style={{ color: 'var(--text-hi)' }}>
            Meus pedidos
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-lo)' }}>
            {orders.length === 0
              ? 'Guardado só neste aparelho'
              : `${orders.length} pedido${orders.length === 1 ? '' : 's'} · só neste aparelho`}
          </p>
        </div>
      </div>

      {/* Tarja de mock — impossível confundir com o histórico real */}
      {MOCK_HISTORY && (
        <div className="px-4 py-2 text-center text-xs font-semibold"
          style={{ background: '#fef3c7', color: '#92400e' }}>
          <Icon name="warning" size={11} /> {MOCK_HISTORY_BANNER}
        </div>
      )}

      <div className="px-4 pt-4 flex flex-col gap-3">
        {orders.length === 0 && (
          <div className="flex flex-col items-center text-center gap-3 py-20 px-6">
            <span className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: 'var(--bg-input)' }}>
              <Icon name="bill" size={26} color="var(--text-lo)" />
            </span>
            <p className="text-base font-bold" style={{ color: 'var(--text-hi)' }}>
              Nenhum pedido ainda
            </p>
            <p className="text-sm max-w-xs" style={{ color: 'var(--text-lo)' }}>
              Os pedidos que você enviar por este celular ficam registrados aqui.
            </p>
            <button onClick={() => navigate('/')}
              className="mt-1 px-6 py-3 rounded-xl text-white font-semibold text-sm"
              style={{ backgroundColor: 'var(--color-brand)' }}>
              Ver cardápio
            </button>
          </div>
        )}

        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.key)
          return (
            <div key={group.key} className="flex flex-col gap-3">

              {/* Cabeçalho do dia — colapsável, com o total gasto naquele dia */}
              <button onClick={() => toggleDay(group.key)}
                className="flex items-center gap-2 px-1 text-left">
                <Icon name="chevron" size={11} color="var(--text-lo)"
                  style={{
                    transform: isCollapsed ? 'rotate(-90deg)' : 'none',
                    transition: 'transform .15s',
                  }} />
                <span className="text-sm font-bold capitalize" style={{ color: 'var(--text-hi)' }}>
                  {group.label}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-lo)' }}>
                  {group.orders.length} pedido{group.orders.length === 1 ? '' : 's'}
                </span>
                <span className="text-xs font-semibold ml-auto" style={{ color: 'var(--text-lo)' }}>
                  {formatCurrency(group.total)}
                </span>
              </button>

              {!isCollapsed && group.orders.map((order, idx) => {
                const badge = paymentBadge(order.payment)
                const tone = badge ? TONE[badge.tone] : null
                return (
                  <div key={`${order.at}-${idx}`} className="rounded-2xl border overflow-hidden"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>

                    <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap"
                      style={{ background: 'var(--bg-input)' }}>
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-hi)' }}>
                        {formatTime(order.at)}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-lo)' }}>
                        {order.mode === 'mesa'
                          ? `Mesa ${order.table ?? order.consumptioncode}`
                          : order.mode === 'delivery'
                            ? 'Delivery'
                            : `Senha ${order.consumptioncode}`}
                        {order.comanda ? ` · Comanda ${order.comanda}` : ''}
                      </span>
                      {order.consumptionint ? (
                        <span className="text-xs ml-auto" style={{ color: 'var(--text-lo)' }}>
                          #{order.consumptionint}
                        </span>
                      ) : null}
                    </div>

                    {/* W2 — status ao vivo, só nos pedidos de hoje e só se a casa
                        publica status (`orderStatusEnabled`) */}
                    {(() => {
                      const chip = statusChip(liveStatus[order.consumptioncode], order.mode)
                      if (!chip) return null
                      return (
                        <div className="px-4 pt-2.5">
                          <span className="text-xs font-semibold px-2 py-1 rounded-full"
                            style={{ background: chip.bg, color: chip.fg }}>
                            {chip.label}
                          </span>
                        </div>
                      )
                    })()}

                    {/* Unidade: só aparece quando o histórico tem mais de uma */}
                    {showBranch && order.branchName && (
                      <p className="px-4 pt-2 text-xs font-semibold"
                        style={{ color: 'var(--color-brand)' }}>
                        {order.branchName}
                      </p>
                    )}

                    <div className="divide-y" style={{ borderColor: 'var(--divider)' }}>
                      {order.items.map((item, i) => (
                        <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                          <span className="text-sm font-semibold flex-shrink-0"
                            style={{ color: 'var(--text-lo)' }}>
                            {item.quantity}×
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium" style={{ color: 'var(--text-hi)' }}>
                              {item.name}
                            </p>
                            {item.extras.length > 0 && (
                              <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
                                {item.extras.join(', ')}
                              </p>
                            )}
                          </div>
                          <p className="text-sm font-semibold flex-shrink-0"
                            style={{ color: 'var(--text-hi)' }}>
                            {formatCurrency(item.amount)}
                          </p>
                        </div>
                      ))}
                    </div>

                    {order.address && <AddressLine address={order.address} />}

                    <div className="px-4 py-2.5 flex justify-between"
                      style={{ borderTop: '1px solid var(--divider)' }}>
                      <span className="text-xs" style={{ color: 'var(--text-lo)' }}>Total</span>
                      <span className="text-sm font-bold" style={{ color: 'var(--text-hi)' }}>
                        {formatCurrency(order.total)}
                      </span>
                    </div>

                    {/*
                      Selo de pagamento. O caso `unknown` é o mais comum hoje e o
                      mais importante de acertar: em balcão, totem, caixa e garçom
                      o dinheiro passa por fora, e o app sabe que **enviou** o
                      pedido, não que foi pago. Dizer "Pago" ali seria mandar o
                      cliente para a porta com uma informação que ninguém sustenta.
                    */}
                    {badge && tone && (
                      <div className="px-4 py-2.5 flex items-start gap-2"
                        style={{ background: tone.bg, borderTop: '1px solid var(--divider)' }}>
                        <Icon name={tone.icon} size={12} color={tone.fg} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold" style={{ color: tone.fg }}>
                            {badge.label}
                          </p>
                          {badge.detail && (
                            <p className="text-xs mt-0.5" style={{ color: tone.fg, opacity: 0.8 }}>
                              {badge.detail}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}

        {orders.length > 0 && (
          <>
            <p className="text-xs text-center px-4" style={{ color: 'var(--text-lo)' }}>
              Registro do seu aparelho. Para a conta oficial, fale com o
              {branch?.name ? ` ${branch.name}` : ' restaurante'}.
            </p>
            <button onClick={handleClear}
              className="w-full py-3 rounded-xl text-sm font-semibold border"
              style={{ borderColor: 'var(--border)', color: '#dc2626', background: 'var(--bg-card)' }}>
              Apagar histórico
            </button>
          </>
        )}
      </div>
    </div>
  )
}

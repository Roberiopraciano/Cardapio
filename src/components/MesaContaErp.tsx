import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, MesaError } from '../api/client'
import { useCartStore } from '../store/cartStore'
import { formatCurrency } from '../lib/pricing'
import { formatQuantity } from '../lib/billFormat'
import {
  BILL_STATUS_LABEL, billPersonLabel, clearMesaSession, groupBill, loadMesaSession, mesaErrorMessage,
  parseMesaBill, type MesaBill,
} from '../lib/mesaErp'
import HeaderButton from './HeaderButton'

type View = 'itens' | 'pessoa' | 'categoria'

const VIEWS: Array<{ key: View; label: string }> = [
  { key: 'itens', label: 'Itens' },
  { key: 'pessoa', label: 'Por pessoa' },
  { key: 'categoria', label: 'Por categoria' },
]

const REFRESH_MS = 30_000

/**
 * Conta da mesa aberta no ERP da loja (`settingsWeb.mesaErpEnabled`).
 *
 * Mostra o que o PDV tem para a mesa: itens de todos (cardápio e garçom), totais,
 * pagamentos já registrados e quanto falta. Atualiza sozinha a cada 30 s.
 * Se a loja ficar sem internet, mostra o último espelho guardado na nuvem com um
 * aviso — nunca fingindo que o valor está em dia.
 *
 * O app não cobra: "Falta pagar" é o saldo que o PDV informa, e o pagamento
 * continua sendo feito com o garçom/caixa.
 */
export default function MesaContaErp({ branchId, table, tableName }: {
  branchId: string
  table: string
  tableName: string
}) {
  const navigate = useNavigate()
  const clientName = useCartStore((s) => s.clientName)

  const [bill, setBill] = useState<MesaBill | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [noSession, setNoSession] = useState(false)
  const [view, setView] = useState<View>('itens')
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)

  const load = useCallback(async () => {
    const session = loadMesaSession(branchId, table)
    if (!session) { setNoSession(true); setLoading(false); return }
    setNoSession(false)
    setLoading(true)
    try {
      const res = await api.mesaConta(
        { branchId, clientOrderId: session.clientOrderId, numeroMesa: session.numeroMesa },
        session.mesaToken,
      )
      setBill(parseMesaBill(res as Record<string, unknown>))
      setFetchedAt(Date.now())
      setError(null)
    } catch (e) {
      if (e instanceof MesaError && (e.status === 401 || e.code === 'MESA_JA_PAGA' || e.code === 'MESA_CANCELADA')) {
        // Sessão vencida ou conta encerrada: recomeça pelo pedido (que reabre a mesa)
        clearMesaSession(branchId, table)
        setBill(null)
        setNoSession(true)
      } else {
        setError(e instanceof MesaError
          ? mesaErrorMessage(e.code, e.isOffline ? 'Sem conexão. Verifique a internet e atualize.' : undefined)
          : 'Não foi possível carregar a conta. Atualize.')
      }
    } finally { setLoading(false) }
  }, [branchId, table])

  useEffect(() => { load() }, [load])

  // Atualização automática, só com a aba visível (economiza bateria e a loja)
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') load() }, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const active = bill?.itens.filter((i) => !i.cancelado) ?? []
  const groups = bill && view !== 'itens' ? groupBill(bill.itens, view) : []
  const closed = !!bill && bill.status !== 'ABERTA'
  const isMe = (name: string | null) => !!name && !!clientName.trim() && name.trim().toLowerCase() === clientName.trim().toLowerCase()

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)', paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px))' }}>
      <div className="px-4 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm" style={{ background: 'var(--bg-card)' }}>
        <HeaderButton icon="back" onClick={() => navigate(-1)} label="Voltar" emphasis />
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold" style={{ color: 'var(--text-hi)' }}>Conta da {tableName}</h1>
          <p className="text-xs" style={{ color: 'var(--text-lo)' }}>
            {loading && !bill ? 'Carregando…' : bill ? `${active.length} ${active.length === 1 ? 'item' : 'itens'}` : ''}
          </p>
        </div>
        <HeaderButton icon="refresh" onClick={load} label="Atualizar" emphasis disabled={loading} spin={loading} />
      </div>

      {noSession && (
        <div className="mx-4 mt-6 rounded-2xl border px-5 py-8 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <p className="font-semibold" style={{ color: 'var(--text-hi)' }}>Esta mesa ainda não foi aberta por você</p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-lo)' }}>
            Faça um pedido para abrir a mesa e acompanhar a conta aqui. Se a mesa já foi aberta pelo garçom, peça a conta a ele.
          </p>
          <button onClick={() => navigate('/')}
            className="mt-5 px-6 py-3 rounded-xl text-white font-semibold text-sm"
            style={{ backgroundColor: 'var(--color-brand)' }}>
            Ver cardápio
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="mx-4 mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: '#fef2f2', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {bill?.offline && (
        <div role="status" className="mx-4 mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: '#fffbeb', color: '#92400e' }}>
          ⚠ {bill.notice} Conexão com a loja instável: valores podem estar defasados em alguns minutos.
        </div>
      )}

      {bill && (
        <>
          <div className="mx-4 mt-3 rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={bill.status === 'ABERTA'
                ? { background: 'rgba(16,185,129,.12)', color: '#065f46' }
                : { background: 'rgba(245,158,11,.14)', color: '#92400e' }}>
              {BILL_STATUS_LABEL[bill.status] ?? bill.status}
            </span>
            {bill.horaAbertura && <Info label="Aberta às" value={bill.horaAbertura} />}
            {bill.garcomNome && <Info label="Garçom" value={bill.garcomNome} />}
            {bill.horaUltimoLancamento && <Info label="Último pedido" value={bill.horaUltimoLancamento} />}
          </div>

          {closed && (
            <p className="mx-4 mt-3 text-sm" style={{ color: 'var(--text-lo)' }}>
              Esta conta não aceita novos pedidos. Chame o garçom se precisar de algo.
            </p>
          )}

          <div className="mx-4 mt-4 flex gap-2 overflow-x-auto" role="tablist" aria-label="Modo de visualização da conta">
            {VIEWS.map((v) => (
              <button key={v.key} role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)}
                className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border"
                style={view === v.key
                  ? { background: 'var(--color-brand)', color: '#fff', borderColor: 'var(--color-brand)' }
                  : { background: 'var(--bg-card)', color: 'var(--text-lo)', borderColor: 'var(--border)' }}>
                {v.label}
              </button>
            ))}
          </div>

          <div className="mx-4 mt-3 rounded-2xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            {view === 'itens' && (bill.itens.length === 0
              ? <Empty text={bill.offline ? 'Itens indisponíveis sem conexão com a loja.' : 'Nenhum item lançado ainda.'} />
              : bill.itens.map((i) => (
                <div key={i.id} className="px-4 py-3 border-b last:border-b-0 flex justify-between gap-3"
                  style={{ borderColor: 'var(--border)', opacity: i.cancelado ? 0.55 : 1 }}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)', textDecoration: i.cancelado ? 'line-through' : 'none' }}>
                      {formatQuantity(i.quantidade)} {i.descricao}
                    </p>
                    {i.observacao && <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>{i.observacao}</p>}
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
                      {billPersonLabel(i)}{isMe(i.nomeCliente) ? ' (você)' : ''}
                      {i.horaLancamento ? ` · ${i.horaLancamento}` : ''}
                      {i.cancelado ? ' · Cancelado' : ''}
                    </p>
                  </div>
                  <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--text-hi)', textDecoration: i.cancelado ? 'line-through' : 'none' }}>
                    {formatCurrency(i.valorTotal)}
                  </span>
                </div>
              )))}

            {view !== 'itens' && (groups.length === 0
              ? <Empty text="Nada para agrupar ainda." />
              : groups.map((g) => (
                <div key={g.key} className="px-4 py-3 border-b last:border-b-0 flex justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
                      {g.label}{view === 'pessoa' && isMe(g.label) ? ' (você)' : ''}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>{g.count} {g.count === 1 ? 'item' : 'itens'}</p>
                  </div>
                  <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--text-hi)' }}>{formatCurrency(g.total)}</span>
                </div>
              )))}
          </div>

          {bill.pagamentos.length > 0 && (
            <div className="mx-4 mt-3 rounded-2xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-lo)' }}>Pagamentos registrados</p>
              {bill.pagamentos.map((p) => (
                <div key={p.id} className="px-4 py-2.5 flex justify-between text-sm">
                  <span style={{ color: 'var(--text-hi)' }}>{p.forma}</span>
                  <span style={{ color: 'var(--text-hi)' }}>{formatCurrency(p.valor)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mx-4 mt-3 rounded-2xl border px-4 py-4 flex flex-col gap-1.5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <Total label="Produtos" value={bill.totais.produtos} />
            {bill.totais.servico > 0 && <Total label="Serviço" value={bill.totais.servico} />}
            {bill.totais.desconto > 0 && <Total label="Desconto" value={-bill.totais.desconto} />}
            <Total label="Total da conta" value={bill.totais.bruto} strong />
            {bill.totais.pago > 0 && <Total label="Já pago" value={-bill.totais.pago} />}
            {bill.totais.pago > 0 && <Total label="Falta pagar" value={bill.totais.restante} strong />}
            <p className="text-[11px] mt-1 text-center" style={{ color: bill.offline ? '#b45309' : 'var(--text-lo)' }}>
              {fetchedAt
                ? `${bill.offline ? '⚠ ' : ''}Atualizado às ${new Date(fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${bill.offline ? ' — pode estar desatualizado' : ''}`
                : ''}
            </p>
            <p className="text-[11px] text-center" style={{ color: 'var(--text-lo)' }}>O pagamento é feito com o garçom ou no caixa.</p>
          </div>
        </>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--text-lo)' }}>{label}</p>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>{value}</p>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-lo)' }}>{text}</p>
}

function Total({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={strong ? 'font-semibold' : 'text-sm'} style={{ color: strong ? 'var(--text-hi)' : 'var(--text-lo)' }}>{label}</span>
      <span className={strong ? 'text-lg font-bold' : 'text-sm'} style={{ color: 'var(--text-hi)' }}>{formatCurrency(value)}</span>
    </div>
  )
}

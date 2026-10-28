import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { api, MesaError } from '../api/client'
import { useCartStore } from '../store/cartStore'
import { formatCurrency } from '../lib/pricing'
import { formatQuantity } from '../lib/billFormat'
import {
  BILL_STATUS_LABEL, billItemTotal, billOriginLabel, billPersonLabel, buildPersonColors, clearMesaSession, flattenBill, groupBill,
  groupEntries, loadMesaSession, mesaErrorMessage, parseMesaBill, STAFF_PILL, type MesaBill, type MesaBillItem, type PillColor,
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
  const [detail, setDetail] = useState<MesaBillItem | null>(null)
  const closeDetail = useCallback(() => setDetail(null), [])
  // Detalhes de um grupo (uma pessoa ou uma categoria)
  const [groupDetail, setGroupDetail] = useState<{ by: 'pessoa' | 'categoria'; label: string } | null>(null)
  const closeGroup = useCallback(() => setGroupDetail(null), [])

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

  // Uma cor por pessoa, na ordem em que aparecem na conta
  const colors = useMemo(() => buildPersonColors(flattenBill(bill?.itens ?? [])), [bill])
  const colorOf = (label: string): PillColor => colors.get(label) ?? STAFF_PILL
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
                <ItemTree key={i.id} item={i} colorOf={colorOf} isMe={isMe} onDetail={setDetail} />
              )))}

            {view !== 'itens' && (groups.length === 0
              ? <Empty text="Nada para agrupar ainda." />
              : groups.map((g) => (
                <div key={g.key} className="px-4 py-3 border-b last:border-b-0 flex justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="min-w-0">
                    {view === 'pessoa'
                      ? <PersonPill label={g.label} color={colorOf(g.label)} me={isMe(g.label)} />
                      : <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>{g.label}</p>}
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>{g.count} {g.count === 1 ? 'item' : 'itens'}</p>
                  </div>
                  <div className="flex flex-col items-end justify-between gap-2 flex-shrink-0">
                    <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--text-hi)' }}>{formatCurrency(g.total)}</span>
                    <button type="button" onClick={() => setGroupDetail({ by: view === 'pessoa' ? 'pessoa' : 'categoria', label: g.label })}
                      aria-label={`Detalhes de ${g.label}`}
                      className="text-xs px-2.5 py-1 font-semibold rounded-lg border"
                      style={{ color: 'var(--text-hi)', borderColor: 'var(--border)', background: 'var(--bg-page)' }}>
                      Detalhes
                    </button>
                  </div>
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
      <GroupDetail group={groupDetail} itens={bill?.itens ?? []} colorOf={colorOf} isMe={isMe} onClose={closeGroup} />
      <ItemDetail item={detail} color={detail ? colorOf(billPersonLabel(detail)) : STAFF_PILL}
        me={!!detail && isMe(detail.nomeCliente)} onClose={closeDetail} />
    </div>
  )
}

/**
 * Item da conta em árvore: o item principal e, abaixo, o que veio dentro dele
 * (itens do combo, adicionais, sabores). O complemento é cobrado além do pai,
 * então o subtotal soma tudo.
 */
function ItemTree({ item, colorOf, isMe, onDetail }: {
  item: MesaBillItem
  colorOf: (label: string) => PillColor
  isMe: (name: string | null) => boolean
  onDetail: (i: MesaBillItem) => void
}) {
  const label = billPersonLabel(item)
  const hasKids = item.filhos.length > 0
  const struck = item.cancelado ? 'line-through' : 'none'

  return (
    <div className="px-4 py-3 border-b last:border-b-0" style={{ borderColor: 'var(--border)', opacity: item.cancelado ? 0.55 : 1 }}>
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)', textDecoration: struck }}>
            {formatQuantity(item.quantidade)} {item.descricao}
          </p>
          {item.observacao && <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>{item.observacao}</p>}
          <p className="text-xs mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: 'var(--text-lo)' }}>
            <PersonPill label={label} color={colorOf(label)} me={isMe(item.nomeCliente)} />
            {item.horaLancamento && <span>{item.horaLancamento}</span>}
            {item.cancelado && <span>· Cancelado</span>}
          </p>
        </div>
        <div className="flex flex-col items-end justify-between gap-2 flex-shrink-0">
          <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--text-hi)', textDecoration: struck }}>
            {formatCurrency(item.valorTotal)}
          </span>
          <DetailButton item={item} onDetail={onDetail} />
        </div>
      </div>

      {hasKids && (
        <ul className="mt-2 ml-2 pl-3 flex flex-col gap-1.5 border-l-2" style={{ borderColor: 'var(--border)' }} aria-label={`Itens de ${item.descricao}`}>
          {item.filhos.map((kid, idx) => (
            <li key={kid.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-start gap-1.5">
                <span aria-hidden="true" className="text-xs select-none" style={{ color: 'var(--text-lo)' }}>
                  {idx === item.filhos.length - 1 ? '└─' : '├─'}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px]" style={{ color: 'var(--text-hi)', textDecoration: kid.cancelado || item.cancelado ? 'line-through' : 'none' }}>
                    {formatQuantity(kid.quantidade)} {kid.descricao}
                  </p>
                  {kid.observacao && <p className="text-[11px]" style={{ color: 'var(--text-lo)' }}>{kid.observacao}</p>}
                </div>
              </div>
              <span className="text-[13px] whitespace-nowrap flex-shrink-0" style={{ color: 'var(--text-hi)' }}>
                {kid.valorTotal > 0 ? formatCurrency(kid.valorTotal) : 'incluso'}
              </span>
            </li>
          ))}
          <li className="flex justify-between text-xs font-semibold pt-1.5 border-t" style={{ borderColor: 'var(--border)', color: 'var(--text-hi)' }}>
            <span>Total do item</span>
            <span>{formatCurrency(billItemTotal(item))}</span>
          </li>
        </ul>
      )}
    </div>
  )
}

function DetailButton({ item, onDetail }: { item: MesaBillItem; onDetail: (i: MesaBillItem) => void }) {
  return (
    <button type="button" onClick={() => onDetail(item)} aria-label={`Detalhes de ${item.descricao}`}
      className="text-xs px-2.5 py-1 font-semibold rounded-lg border"
      style={{ color: 'var(--text-hi)', borderColor: 'var(--border)', background: 'var(--bg-page)' }}>
      Detalhes
    </button>
  )
}

/** Nome da pessoa em pílula colorida: cada pessoa da mesa tem a sua cor. */
function PersonPill({ label, color, me }: { label: string; color: PillColor; me: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: color.bg, color: color.fg }}>
      {label}{me && <span className="font-semibold opacity-80">· você</span>}
    </span>
  )
}

/**
 * Detalhes de um grupo: as vendas de UMA pessoa, ou os produtos de UMA categoria
 * com quem lançou cada um. Os valores somam o total do grupo na lista.
 */
function GroupDetail({ group, itens, colorOf, isMe, onClose }: {
  group: { by: 'pessoa' | 'categoria'; label: string } | null
  itens: MesaBillItem[]
  colorOf: (label: string) => PillColor
  isMe: (name: string | null) => boolean
  onClose: () => void
}) {
  useEffect(() => {
    if (!group) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [group, onClose])

  if (!group) return null

  const entries = groupEntries(itens, group.by, group.label)
  const total = Math.round(entries.reduce((acc, e) => acc + e.item.valorTotal, 0) * 100) / 100
  const byPerson = group.by === 'pessoa'

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose} role="dialog" aria-modal="true" aria-label={`Detalhes de ${group.label}`}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl px-6 pt-5 flex flex-col"
        style={{ background: 'var(--bg-card)', maxHeight: '85vh', paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mb-4 mx-auto sm:hidden flex-shrink-0" style={{ background: 'var(--border)' }} />
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-lo)' }}>
          {byPerson ? 'Pedidos de' : 'Categoria'}
        </p>
        <div className="mt-1 flex-shrink-0">
          {byPerson
            ? <PersonPill label={group.label} color={colorOf(group.label)} me={isMe(group.label)} />
            : <h2 className="text-lg font-bold" style={{ color: 'var(--text-hi)' }}>{group.label}</h2>}
        </div>

        <ul className="mt-4 overflow-y-auto flex flex-col divide-y" style={{ borderColor: 'var(--border)' }}>
          {entries.length === 0 && (
            <li className="py-6 text-center text-sm" style={{ color: 'var(--text-lo)' }}>Nenhum item.</li>
          )}
          {entries.map(({ item, parent }) => {
            const who = billPersonLabel(item)
            return (
              <li key={item.id} className="py-2.5 flex justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
                    {formatQuantity(item.quantidade)} {item.descricao}
                  </p>
                  {parent && (
                    <p className="text-[11px]" style={{ color: 'var(--text-lo)' }}>└─ dentro de {parent.descricao}</p>
                  )}
                  {item.observacao && <p className="text-xs" style={{ color: 'var(--text-lo)' }}>{item.observacao}</p>}
                  <p className="text-xs mt-1 flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: 'var(--text-lo)' }}>
                    {byPerson
                      ? <span>{item.categoria}</span>
                      : <PersonPill label={who} color={colorOf(who)} me={isMe(item.nomeCliente)} />}
                    {item.horaLancamento && <span>{item.horaLancamento}</span>}
                  </p>
                </div>
                <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--text-hi)' }}>
                  {formatCurrency(item.valorTotal)}
                </span>
              </li>
            )
          })}
        </ul>

        <div className="mt-3 pt-3 border-t flex justify-between items-center flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <span className="font-semibold" style={{ color: 'var(--text-hi)' }}>
            Total · {entries.length} {entries.length === 1 ? 'item' : 'itens'}
          </span>
          <span className="text-lg font-bold" style={{ color: 'var(--text-hi)' }}>{formatCurrency(total)}</span>
        </div>
        <button onClick={onClose} className="mt-4 w-full py-3.5 rounded-xl text-white font-semibold text-sm flex-shrink-0"
          style={{ backgroundColor: 'var(--color-brand)' }}>
          Fechar
        </button>
      </div>
    </div>,
    document.body,
  )
}

/** Detalhes de um item da conta, em bottom sheet (portal, como os demais modais). */
function ItemDetail({ item, color, me, onClose }: { item: MesaBillItem | null; color: PillColor; me: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!item) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [item, onClose])

  if (!item) return null

  const rows: Array<[string, string]> = [
    ['Quantidade', formatQuantity(item.quantidade)],
    ['Valor unitário', formatCurrency(item.valorUnitario)],
    ['Total', formatCurrency(item.valorTotal)],
    ...(item.filhos.length > 0 ? [['Total com os itens de dentro', formatCurrency(billItemTotal(item))] as [string, string]] : []),
    ...(item.horaLancamento ? [['Lançado às', item.horaLancamento] as [string, string]] : []),
    ['Lançado por', billPersonLabel(item)],
    ['Canal', billOriginLabel(item.origem)],
    ...(item.codigoProduto ? [['Código', String(item.codigoProduto)] as [string, string]] : []),
  ]

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose} role="dialog" aria-modal="true" aria-label={`Detalhes de ${item.descricao}`}>
      <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl px-6 pt-5 pb-7"
        style={{ background: 'var(--bg-card)', paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mb-4 mx-auto sm:hidden" style={{ background: 'var(--border)' }} />
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-hi)', textDecoration: item.cancelado ? 'line-through' : 'none' }}>
          {item.descricao}
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-lo)' }}>
          <PersonPill label={billPersonLabel(item)} color={color} me={me} />
          <span>{item.categoria}</span>
          {item.cancelado && <span className="font-semibold" style={{ color: '#b91c1c' }}>Cancelado</span>}
        </p>
        {item.observacao && (
          <p className="mt-3 text-sm rounded-xl px-3 py-2" style={{ background: 'var(--bg-page)', color: 'var(--text-hi)' }}>
            {item.observacao}
          </p>
        )}
        {item.filhos.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-lo)' }}>Dentro deste item</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {item.filhos.map((k) => (
                <li key={k.id} className="text-sm flex justify-between gap-3" style={{ color: 'var(--text-hi)' }}>
                  <span>{formatQuantity(k.quantidade)} {k.descricao}</span>
                  <span>{k.valorTotal > 0 ? formatCurrency(k.valorTotal) : 'incluso'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <dl className="mt-4 flex flex-col gap-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 text-sm">
              <dt style={{ color: 'var(--text-lo)' }}>{k}</dt>
              <dd className="font-semibold text-right" style={{ color: 'var(--text-hi)' }}>{v}</dd>
            </div>
          ))}
        </dl>
        <button onClick={onClose} className="mt-6 w-full py-3.5 rounded-xl text-white font-semibold text-sm"
          style={{ backgroundColor: 'var(--color-brand)' }}>
          Fechar
        </button>
      </div>
    </div>,
    document.body,
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

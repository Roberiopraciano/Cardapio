import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '../store/cartStore'
import {
  formatCurrency, calcCartItemSubtotal, getComplementPriceLabel, getFractionText,
  complementPrice, calcPackagingTotal,
} from '../lib/pricing'
import ImageWithFallback from './ImageWithFallback'
import Icon from './Icon'
import HeaderButton from './HeaderButton'
import type { CartItem, CartComplement, ComplementsGroup } from '../types'

interface Props {
  open: boolean
  onClose: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ComplementGroupRow {
  groupId: string
  groupName: string
  group: ComplementsGroup | undefined
  items: CartComplement[]
  isPackaging: boolean
}

function groupComplements(item: CartItem): ComplementGroupRow[] {
  const map = new Map<string, CartComplement[]>()
  for (const c of item.addedComplements) {
    if (!map.has(c.groupId)) map.set(c.groupId, [])
    map.get(c.groupId)!.push(c)
  }
  return [...map.entries()].map(([groupId, items]) => ({
    groupId,
    groupName: items[0].groupName,
    group: item.product.complementsGroups.find(g => g._id === groupId),
    items,
    isPackaging: items[0].isPackaging ?? false,
  }))
}

// ─── Sub-componente: linha de um complemento ───────────────────────────────────

function ComplementRow({ comp, group, itemQuantity }: {
  comp: CartComplement
  group?: ComplementsGroup
  /** Quantidade do produto no carrinho */
  itemQuantity: number
}) {
  const isFraction = comp.unitFraction !== undefined && comp.unitFraction < 1
  const label = group ? getComplementPriceLabel(comp.price, group) : null

  const fracText = isFraction
    ? getFractionText(Math.round(1 / (comp.unitFraction ?? 0.5)))
    : null

  /**
   * `comp.quantity` é por unidade do produto. O total cobrado já multiplica pela
   * quantidade do item (`calcCartItemSubtotal`), então exibir o valor por
   * unidade fazia o cliente ler "2× Coca" e pagar por 4 — o carrinho contradizia
   * a conta. Aqui mostramos o que ele vai realmente receber e pagar.
   */
  const totalQty = comp.quantity * itemQuantity
  /**
   * Preço cheio (com rateio do fracionado), e não o acréscimo líquido.
   *
   * Só aparece quando `label.type === 'price'` — grupo opcional ou fracionado,
   * onde não existe franquia de "incluso" e cheio **é** o acréscimo. Em grupo
   * obrigatório nada é renderizado aqui: quem informa é a etiqueta "incluso" /
   * "+R$2,00", porque a franquia pertence ao grupo e não se reparte por linha.
   */
  const totalPrice = complementPrice(comp) * itemQuantity

  return (
    <div className="flex items-center gap-1.5 py-0.5">
      {/* Checkbox/fração */}
      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-brand)' }}>
        {isFraction ? fracText : '✓'}
      </span>

      {/* Nome + qty */}
      <span className="flex-1 text-xs leading-snug" style={{ color: 'var(--text-hi)' }}>
        {totalQty > 1 && !isFraction && (
          <span className="font-semibold">{totalQty}× </span>
        )}
        {comp.name}
      </span>

      {/* Label de preço */}
      {label && (
        <>
          {label.type === 'incluso' && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ background: 'rgba(29,158,117,.1)', color: 'var(--color-brand)' }}>
              incluso
            </span>
          )}
          {label.type === 'diff' && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ background: '#FEE2E2', color: '#B91C1C' }}>
              {label.text}
            </span>
          )}
          {label.type === 'price' && comp.price > 0 && (
            <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-lo)' }}>
              {formatCurrency(totalPrice)}
            </span>
          )}
        </>
      )}
    </div>
  )
}

// ─── Sub-componente: campo de observação inline ────────────────────────────────

function NoteField({ idx, note }: { idx: number; note: string }) {
  const { updateItemNote } = useCartStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  useEffect(() => { setDraft(note) }, [note])

  const save = () => {
    updateItemNote(idx, draft.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="mt-2 rounded-xl overflow-hidden border"
        style={{ borderColor: 'var(--color-brand)', background: 'var(--bg-input)' }}>
        <textarea
          ref={ref}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), save())}
          placeholder="Ex: sem cebola, molho à parte..."
          rows={2}
          maxLength={200}
          className="w-full text-xs px-3 pt-2 pb-1 resize-none outline-none"
          style={{ background: 'transparent', color: 'var(--text-hi)' }}
        />
        <div className="flex justify-end px-3 pb-2">
          <button onClick={save}
            className="text-[11px] font-semibold px-3 py-1 rounded-lg text-white"
            style={{ background: 'var(--color-brand)' }}>
            Salvar
          </button>
        </div>
      </div>
    )
  }

  if (note) {
    return (
      <button onClick={() => setEditing(true)}
        className="w-full text-left mt-2 flex items-start gap-1.5 px-2.5 py-2 rounded-xl"
        style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)' }}>
        <span className="text-xs flex-shrink-0 mt-0.5">📝</span>
        <span className="text-xs leading-snug flex-1" style={{ color: '#92400E' }}>{note}</span>
        <span className="text-[10px] flex-shrink-0 mt-0.5" style={{ color: '#B45309' }}>✏️</span>
      </button>
    )
  }

  return (
    <button onClick={() => setEditing(true)}
      className="mt-2 flex items-center gap-1.5 text-xs"
      style={{ color: 'var(--text-lo)' }}>
      <span>+ Adicionar observação</span>
    </button>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function CartDrawer({ open, onClose }: Props) {
  const navigate = useNavigate()
  const { items, removeItem, updateItemQty, totalWithCoupon, appliedCoupon, total } = useCartStore()

  if (!open) return null

  const handleEdit = (index: number) => {
    onClose()
    navigate(`/produto/${items[index].product._id}?editIndex=${index}`)
  }

  const handleCheckout = () => { onClose(); navigate('/checkout') }

  const subtotal = total()
  const totalFinal = totalWithCoupon()
  const packagingTotal = calcPackagingTotal(items)
  const hasCoupon = appliedCoupon !== null

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />

      <div className="drawer-sheet">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--text-hi)' }}>
            Carrinho · {items.reduce((a, i) => a + i.quantity, 0)} {items.reduce((a, i) => a + i.quantity, 0) === 1 ? 'item' : 'itens'}
          </h2>
          <HeaderButton icon="close" onClick={onClose} label="Fechar carrinho" />
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <span className="text-5xl">🛒</span>
              <p className="text-sm" style={{ color: 'var(--text-lo)' }}>Carrinho vazio</p>
            </div>
          ) : (
            items.map((item, idx) => (
              <CartItemRow
                key={idx}
                item={item}
                idx={idx}
                onEdit={() => handleEdit(idx)}
                onRemove={() => removeItem(idx)}
                onQtyChange={(delta) => {
                  const newQty = item.quantity + delta
                  if (newQty <= 0) removeItem(idx)
                  else updateItemQty(idx, newQty)
                }}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-4 pt-3 pb-4 flex-shrink-0 border-t" style={{ borderColor: 'var(--border)' }}>
            {hasCoupon && (
              <>
                <div className="flex justify-between text-sm mb-1">
                  <span style={{ color: 'var(--text-lo)' }}>Subtotal</span>
                  <span style={{ color: 'var(--text-lo)' }}>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm mb-1 text-emerald-600">
                  <span>Cupom ({appliedCoupon!.title})</span>
                  <span>−{formatCurrency(subtotal - totalFinal)}</span>
                </div>
              </>
            )}
            {packagingTotal > 0 && (
              <div className="flex justify-between text-sm mb-1">
                <span style={{ color: 'var(--text-lo)' }}>Embalagem (incluída no total)</span>
                <span style={{ color: 'var(--text-lo)' }}>{formatCurrency(packagingTotal)}</span>
              </div>
            )}
            <div className="flex justify-between items-center mb-3">
              <span className="font-semibold" style={{ color: 'var(--text-hi)' }}>Total</span>
              <span className="text-xl font-bold" style={{ color: 'var(--text-hi)' }}>
                {formatCurrency(totalFinal)}
              </span>
            </div>
            <button onClick={handleCheckout}
              className="w-full py-3.5 rounded-xl text-white font-semibold text-base active:scale-[0.98] transition-transform"
              style={{ backgroundColor: 'var(--color-brand)' }}>
              Confirmar pedido
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Item do carrinho ──────────────────────────────────────────────────────────

function CartItemRow({
  item, idx, onEdit, onRemove, onQtyChange,
}: {
  item: CartItem
  idx: number
  onEdit: () => void
  onRemove: () => void
  onQtyChange: (delta: number) => void
}) {
  const groupRows = groupComplements(item)
  const hasComplements = groupRows.some(g => !g.isPackaging && g.items.length > 0)
  const hasPackaging = groupRows.some(g => g.isPackaging)
  const packagingTotal = calcPackagingTotal([item])
  const price = calcCartItemSubtotal(item)

  return (
    <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--divider)' }}>
      {/* Linha principal: imagem + nome + preço + qty */}
      <div className="flex gap-3">
        <ImageWithFallback
          src={item.product.image}
          alt={item.product.name}
          className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-hi)' }}>
              {item.product.name}
            </p>
            <span className="text-sm font-bold flex-shrink-0" style={{ color: 'var(--text-hi)' }}>
              {formatCurrency(price)}
            </span>
          </div>
          {item.quantity > 1 && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
              {formatCurrency(price / item.quantity)} cada
            </p>
          )}

          {/* Seletor de quantidade */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center rounded-xl overflow-hidden border"
              style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => onQtyChange(-1)}
                className="w-9 h-8 flex items-center justify-center text-base font-bold"
                style={{ color: item.quantity <= 1 ? '#EF4444' : 'var(--text-lo)' }}
                aria-label={item.quantity <= 1 ? 'Remover item' : 'Diminuir'}>
                <Icon name={item.quantity <= 1 ? 'trash' : 'minus'} size={13} />
              </button>
              <span className="w-8 text-center text-sm font-bold" style={{ color: 'var(--text-hi)' }}>
                {item.quantity}
              </span>
              <button
                onClick={() => onQtyChange(1)}
                className="w-9 h-8 flex items-center justify-center text-base font-bold"
                style={{ color: 'var(--color-brand)' }}
                aria-label="Aumentar">
                <Icon name="plus" size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Complementos estruturados por grupo */}
      {hasComplements && (
        <div className="mt-2.5 flex flex-col gap-2">
          {groupRows.filter(g => !g.isPackaging).map(row => (
            <div key={row.groupId}>
              {/* Nome do grupo */}
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5"
                style={{ color: 'var(--text-lo)' }}>
                {row.groupName}
              </p>
              {/* Itens do grupo */}
              <div className="pl-1">
                {row.items.map((comp, ci) => (
                  <ComplementRow key={ci} comp={comp} group={row.group}
                    itemQuantity={item.quantity} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Embalagem (para levar) */}
      {hasPackaging && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[10px]">📦</span>
          <span className="text-xs" style={{ color: 'var(--color-brand)' }}>
            Embalagem p/ levar · {formatCurrency(packagingTotal)}
          </span>
        </div>
      )}

      {/* Observação com edição inline */}
      <NoteField idx={idx} note={item.note} />

      {/* Ações: editar complementos + remover */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium"
          style={{ borderColor: 'var(--border)', color: 'var(--text-hi)', background: 'var(--bg-input)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Editar complementos
        </button>

        <button
          onClick={onRemove}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-medium ml-auto"
          style={{ borderColor: '#FEE2E2', color: '#DC2626', background: '#FEF2F2' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
          Remover
        </button>
      </div>
    </div>
  )
}

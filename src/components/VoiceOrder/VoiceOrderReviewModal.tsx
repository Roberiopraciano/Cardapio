import { useState } from 'react'
import type { Product } from '../../types'
import type { ProposedVoiceItem, VoiceReview } from '../../services/voiceOrderApi'
import { updateVoiceReview } from '../../services/voiceOrderApi'

interface Props {
  token: string
  initialReview: VoiceReview
  products: Product[]
  onClose: () => void
  onConfirm: (review: VoiceReview) => Promise<void>
}

export default function VoiceOrderReviewModal({ token, initialReview, products, onClose, onConfirm }: Props) {
  const [review, setReview] = useState(initialReview)
  const [items, setItems] = useState<ProposedVoiceItem[]>(() => initialReview.items.map(item => ({
    client_item_ref: item.client_item_ref, product_id: item.product_id, quantity: item.quantity,
    preparation_note: item.preparation_note, selected_options: item.selected_options,
  })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const pending = [
    ...review.items_not_found.map((label, index) => ({ ref: `missing:${index}`, label })),
    ...review.ambiguous_items.map((label, index) => ({ ref: `ambiguous:${index}`, label })),
    ...review.invalid_items.map(item => ({ ref: item.client_item_ref, label: item.code })),
  ]

  const edit = (index: number, change: Partial<ProposedVoiceItem>) => {
    setItems(old => old.map((item, i) => i === index ? { ...item, ...change } : item))
    setDirty(true)
  }
  const revalidate = async () => {
    setBusy(true); setError('')
    try { setReview(await updateVoiceReview(token, review.review_id, items)); setDirty(false) }
    catch { setError('Não foi possível atualizar. Confira o cardápio e tente de novo.') }
    finally { setBusy(false) }
  }
  const blocked = dirty || pending.length > 0 || review.missing_required_selections.length > 0 || review.items.length === 0

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Revisar pedido por voz">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-lg">Confira seu pedido</h2>
          <button onClick={onClose} aria-label="Fechar revisão">Fechar</button>
        </div>
        {items.map((item, index) => {
          const product = products.find(p => p._id === item.product_id)
          return <section key={item.client_item_ref} className="border rounded-xl p-3 space-y-3">
            <strong>{product?.name ?? review.items.find(voiceItem => voiceItem.client_item_ref === item.client_item_ref)?.display.name ?? 'Produto indisponível'}</strong>
            <label className="block text-sm">Quantidade
              <input type="number" min={1} max={20} value={item.quantity} onChange={event => edit(index, { quantity: Number(event.target.value) })}
                className="block border rounded p-2 w-20" />
            </label>
            {product?.complementsGroups.filter(group => !group.isTakeawayPackaging).map(group =>
              <fieldset key={group._id} className="text-sm">
                <legend className="font-semibold">{group.title} {group.obrigatory ? '(obrigatório)' : ''}</legend>
                {group.products.map(option => {
                  const checked = (item.selected_options[group._id] ?? []).includes(option._id)
                  return <label key={option._id} className="flex gap-2 py-1">
                    <input type="checkbox" checked={checked} onChange={() => {
                      const selected = item.selected_options[group._id] ?? []
                      const next = checked ? selected.filter(id => id !== option._id) : [...selected, option._id]
                      edit(index, { selected_options: { ...item.selected_options, [group._id]: next } })
                    }} />
                    {option.name}
                  </label>
                })}
              </fieldset>
            )}
            <label className="block text-sm">Observação
              <input maxLength={200} value={item.preparation_note} onChange={event => edit(index, { preparation_note: event.target.value })}
                className="block border rounded p-2 w-full" />
            </label>
            {review.items.find(voiceItem => voiceItem.client_item_ref === item.client_item_ref)?.validation_status === 'missing_options' &&
              <p className="text-amber-700 text-sm">Escolha os opcionais obrigatórios.</p>}
          </section>
        })}
        {pending.map(entry => <label key={entry.ref} className="block text-sm text-amber-800 bg-amber-50 p-3 rounded-xl">
          Escolha o produto para “{entry.label}”
          <select className="block border rounded p-2 w-full mt-2" value={items.find(item => item.client_item_ref === entry.ref)?.product_id ?? ''}
            onChange={event => {
              const productId = event.target.value
              setItems(previous => {
                const others = previous.filter(item => item.client_item_ref !== entry.ref)
                return productId ? [...others, { client_item_ref: entry.ref, product_id: productId,
                  quantity: 1, selected_options: {}, preparation_note: '' }] : others
              })
              setDirty(true)
            }}>
            <option value="">Selecione no cardápio</option>
            {products.filter(product => product.active).map(product => <option key={product._id} value={product._id}>{product.name}</option>)}
          </select>
        </label>)}
        <p className="font-bold">{blocked ? 'Total disponível após resolver pendências' : `Total estimado: R$ ${(review.totals.total_minor / 100).toFixed(2).replace('.', ',')}`}</p>
        {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
        {dirty && <button disabled={busy} onClick={revalidate} className="w-full rounded-xl p-3 bg-slate-100 font-semibold">Atualizar revisão</button>}
        <button disabled={busy || blocked} onClick={() => { setBusy(true); onConfirm(review).catch(() => setError('O pedido mudou. Revise novamente.')).finally(() => setBusy(false)) }}
          className="w-full rounded-xl p-3 text-white font-semibold disabled:opacity-50" style={{ background: 'var(--color-brand)' }}>
          Adicionar ao carrinho
        </button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import type { ComplementsGroup, Product } from '../../types'
import type { ProposedVoiceItem, VoiceReview } from '../../services/voiceOrderApi'
import { updateVoiceReview } from '../../services/voiceOrderApi'
import { buildPendingChoices } from '../../lib/voiceOrder'
import { formatCurrency } from '../../lib/pricing'
import { hasNoteTag, noteTagsOf, toggleNoteTag } from '../../lib/noteTags'
import Icon from '../Icon'
import ImageWithFallback from '../ImageWithFallback'

interface Props {
  token: string
  initialReview: VoiceReview
  products: Product[]
  onClose: () => void
  onConfirm: (review: VoiceReview) => Promise<void>
}

const MAX_QUANTITY = 20

/** Escolha numa opção do grupo: grupo de uma escolha só troca a anterior; os outros alternam, até o máximo. */
function toggleOption(group: ComplementsGroup, selected: string[], optionId: string): string[] {
  if (selected.includes(optionId)) return selected.filter(id => id !== optionId)
  if (group.maxQuantity === 1) return [optionId]
  if (group.maxQuantity > 0 && selected.length >= group.maxQuantity) return selected
  return [...selected, optionId]
}

function groupHint(group: ComplementsGroup): string {
  if (group.maxQuantity === 1) return 'Escolha 1'
  if (group.maxQuantity > 1) return `Até ${group.maxQuantity}`
  return 'Opcional'
}

/**
 * Ajuste manual do pedido montado pelo assistente: quantidade, opcionais, observação e as pendências
 * (item não achado, ambíguo ou recusado). Cada mudança é revalidada no servidor antes de ir ao carrinho.
 */
export default function VoiceOrderReviewModal({ token, initialReview, products, onClose, onConfirm }: Props) {
  const [review, setReview] = useState(initialReview)
  const [items, setItems] = useState<ProposedVoiceItem[]>(() => initialReview.items.map(item => ({
    client_item_ref: item.client_item_ref, product_id: item.product_id, quantity: item.quantity,
    preparation_note: item.preparation_note, selected_options: item.selected_options,
  })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [showAll, setShowAll] = useState<ReadonlySet<string>>(new Set())
  const pending = buildPendingChoices(review, products, showAll)

  const edit = (index: number, change: Partial<ProposedVoiceItem>) => {
    setItems(old => old.map((item, i) => i === index ? { ...item, ...change } : item))
    setDirty(true)
  }
  const remove = (index: number) => {
    setItems(old => old.filter((_, i) => i !== index))
    setDirty(true)
  }
  const revalidate = async () => {
    setBusy(true); setError('')
    try { setReview(await updateVoiceReview(token, review.review_id, items)); setDirty(false) }
    catch { setError('Não foi possível atualizar. Confira o cardápio e tente de novo.') }
    finally { setBusy(false) }
  }
  const confirm = () => {
    setBusy(true)
    onConfirm(review).catch(() => setError('O pedido mudou. Revise novamente.')).finally(() => setBusy(false))
  }
  const blocked = dirty || pending.length > 0 || review.missing_required_selections.length > 0 || review.items.length === 0

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,.55)' }} role="dialog" aria-modal="true" aria-label="Ajustar pedido">
      <div className="voice-sheet w-full sm:max-w-lg flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden" style={{ background: 'var(--bg-card)', maxHeight: 'min(92dvh, 760px)' }}>
        <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-hi)' }}>Ajustar pedido</h2>
            <p className="text-xs" style={{ color: 'var(--text-lo)' }}>Mude quantidades, opcionais e observações.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar ajuste" className="voice-focus shrink-0 w-11 h-11 -mr-2 -mt-1 rounded-full flex items-center justify-center" style={{ color: 'var(--text-lo)' }}>
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3">
          {items.length === 0 && pending.length === 0 && (
            <p className="text-sm text-center py-6" style={{ color: 'var(--text-lo)' }}>Nenhum item no pedido.</p>
          )}

          {items.map((item, index) => {
            const product = products.find(candidate => candidate._id === item.product_id)
            const reviewed = review.items.find(voiceItem => voiceItem.client_item_ref === item.client_item_ref)
            const name = product?.name ?? reviewed?.display.name ?? 'Produto indisponível'
            const missing = new Set(reviewed?.missing_required_group_ids ?? [])
            return (
              <section key={item.client_item_ref} className="rounded-2xl p-3 space-y-3" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <div className="flex gap-3">
                  <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden">
                    <ImageWithFallback src={product?.image ?? ''} alt={name} className="w-16 h-16 object-cover" skeletonClassName="w-16 h-16" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight line-clamp-2" style={{ color: 'var(--text-hi)' }}>{name}</p>
                    {reviewed && !dirty && (
                      <p className="mt-0.5 text-sm font-bold" style={{ color: 'var(--color-brand)' }}>{formatCurrency(reviewed.subtotal_minor / 100)}</p>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center rounded-full" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                        <button type="button" aria-label="Diminuir quantidade" disabled={item.quantity <= 1}
                          onClick={() => edit(index, { quantity: item.quantity - 1 })}
                          className="voice-focus w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30" style={{ color: 'var(--text-hi)' }}>
                          <Icon name="minus" size={12} />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold tabular-nums" style={{ color: 'var(--text-hi)' }} aria-live="polite">{item.quantity}</span>
                        <button type="button" aria-label="Aumentar quantidade" disabled={item.quantity >= MAX_QUANTITY}
                          onClick={() => edit(index, { quantity: item.quantity + 1 })}
                          className="voice-focus w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30" style={{ color: 'var(--text-hi)' }}>
                          <Icon name="plus" size={12} />
                        </button>
                      </div>
                      <button type="button" onClick={() => remove(index)} className="voice-focus min-h-9 px-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-lo)' }}>
                        <Icon name="trash" size={12} /> Remover
                      </button>
                    </div>
                  </div>
                </div>

                {product?.complementsGroups.filter(group => !group.isTakeawayPackaging).map(group => {
                  const selected = item.selected_options[group._id] ?? []
                  const options = group.products.filter(option => option.active !== false)
                  if (options.length === 0) return null
                  return (
                    <fieldset key={group._id} className="space-y-1.5">
                      <legend className="w-full flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-hi)' }}>{group.title}</span>
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={group.obrigatory
                            ? { background: missing.has(group._id) ? 'var(--color-brand)' : 'var(--bg-card)', color: missing.has(group._id) ? '#fff' : 'var(--text-lo)' }
                            : { background: 'var(--bg-card)', color: 'var(--text-lo)' }}
                        >
                          {group.obrigatory ? `Obrigatório · ${groupHint(group)}` : groupHint(group)}
                        </span>
                      </legend>
                      <div className="flex flex-wrap gap-1.5">
                        {options.map(option => {
                          const checked = selected.includes(option._id)
                          return (
                            <button
                              key={option._id}
                              type="button"
                              aria-pressed={checked}
                              onClick={() => edit(index, { selected_options: { ...item.selected_options, [group._id]: toggleOption(group, selected, option._id) } })}
                              className={`voice-focus min-h-9 rounded-full px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 ${checked ? 'text-white' : ''}`}
                              style={checked
                                ? { background: 'var(--color-brand)', border: '1px solid var(--color-brand)' }
                                : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-hi)' }}
                            >
                              {checked && <Icon name="check" size={10} />}
                              {option.name}
                              {option.price > 0 && <span className={checked ? 'opacity-80' : ''} style={checked ? undefined : { color: 'var(--text-lo)' }}>+{formatCurrency(option.price)}</span>}
                            </button>
                          )
                        })}
                      </div>
                    </fieldset>
                  )
                })}

                {noteTagsOf(product?.customSuggestions).length > 0 && (
                  <div className="flex flex-wrap gap-1.5" aria-label="Observações rápidas">
                    {noteTagsOf(product?.customSuggestions).map(tag => {
                      const on = hasNoteTag(item.preparation_note, tag)
                      return (
                        <button
                          key={tag}
                          type="button"
                          aria-pressed={on}
                          onClick={() => edit(index, { preparation_note: toggleNoteTag(item.preparation_note, tag) })}
                          className={`voice-focus min-h-8 rounded-full px-3 py-1 text-xs font-medium ${on ? 'text-white' : ''}`}
                          style={on
                            ? { background: 'var(--color-brand)', border: '1px solid var(--color-brand)' }
                            : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-hi)' }}
                        >
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                )}
                <label className="block">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-hi)' }}>Observação</span>
                  <input
                    maxLength={200}
                    value={item.preparation_note}
                    placeholder="Ex.: sem cebola"
                    onChange={event => edit(index, { preparation_note: event.target.value })}
                    className="voice-focus mt-1 block w-full min-h-10 rounded-xl px-3 text-sm outline-none"
                    style={{ background: 'var(--bg-card)', color: 'var(--text-hi)', border: '1px solid var(--border)' }}
                  />
                </label>

                {reviewed?.validation_status === 'missing_options' && !dirty && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                    <Icon name="warning" size={12} /> Escolha os opcionais obrigatórios.
                  </p>
                )}
              </section>
            )
          })}

          {pending.map(entry => (
            <section key={entry.ref} className="rounded-2xl p-3 space-y-2 bg-amber-50" style={{ border: '1px solid #fcd34d' }}>
              <p className="flex items-start gap-1.5 text-sm font-semibold text-amber-900">
                <Icon name="warning" size={13} className="mt-0.5" />
                <span>{entry.kind === 'invalid' ? `${entry.label} Quer pedir outro?` : `Escolha o produto para “${entry.label}”`}</span>
              </p>
              <select
                className="voice-focus block w-full min-h-10 rounded-xl px-3 text-sm outline-none"
                style={{ background: 'var(--bg-card)', color: 'var(--text-hi)', border: '1px solid var(--border)' }}
                value={items.find(item => item.client_item_ref === entry.ref)?.product_id ?? ''}
                onChange={event => {
                  const productId = event.target.value
                  setItems(previous => {
                    const others = previous.filter(item => item.client_item_ref !== entry.ref)
                    return productId ? [...others, { client_item_ref: entry.ref, product_id: productId,
                      quantity: 1, selected_options: {}, preparation_note: '' }] : others
                  })
                  setDirty(true)
                }}
              >
                <option value="">{entry.narrowed ? 'Selecione uma das opções' : 'Selecione no cardápio'}</option>
                {entry.options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
              {entry.narrowed && (
                <button type="button" className="voice-focus text-xs font-semibold underline text-amber-900"
                  onClick={() => setShowAll(old => new Set(old).add(entry.ref))}>
                  Nenhuma dessas — ver o cardápio todo
                </button>
              )}
            </section>
          ))}
        </div>

        <footer className="px-4 pt-3 space-y-2 border-t" style={{ borderColor: 'var(--border)', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {dirty ? (
            <button type="button" disabled={busy} onClick={() => void revalidate()}
              className="voice-focus w-full min-h-12 rounded-xl px-4 py-3 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--color-brand)' }}>
              <Icon name="refresh" size={14} spin={busy} /> {busy ? 'Atualizando…' : 'Atualizar resumo'}
            </button>
          ) : (
            <>
              {blocked && (
                <p className="text-xs text-center" style={{ color: 'var(--text-lo)' }}>
                  {review.items.length === 0 && pending.length === 0 ? 'Adicione ao menos um item.' : 'Resolva as pendências para adicionar ao carrinho.'}
                </p>
              )}
              <button type="button" disabled={busy || blocked} onClick={confirm}
                className="voice-focus w-full min-h-12 rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: 'var(--color-brand)' }}>
                {busy ? 'Adicionando…' : `Adicionar ao carrinho · ${formatCurrency(review.totals.total_minor / 100)}`}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}

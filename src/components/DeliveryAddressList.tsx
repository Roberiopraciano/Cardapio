import { type AddressBook, MAX_ADDRESSES, addressLine1, addressLine2 } from '../lib/deliveryAddress'
import Icon from './Icon'

/**
 * Endereços salvos no aparelho: escolher qual recebe o pedido, editar, remover e
 * adicionar outro. O endereço escolhido é o do pedido.
 */
export default function DeliveryAddressList({ book, onSelect, onAdd, onEdit, onRemove }: {
  book: AddressBook
  onSelect: (id: string) => void
  onAdd: () => void
  onEdit: (id: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="border-t border-dashed" style={{ borderColor: 'var(--divider)' }}>
      <div role="radiogroup" aria-label="Endereço de entrega">
        {book.list.map((a) => {
          const selected = a.id === book.selectedId
          return (
            <div key={a.id} className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0"
              style={{ borderColor: 'var(--divider)', background: selected ? 'var(--color-brand-light)' : 'transparent' }}>
              <button type="button" role="radio" aria-checked={selected} onClick={() => onSelect(a.id)}
                className="flex-1 min-w-0 flex items-start gap-3 text-left">
                <span aria-hidden="true" className="mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{ borderColor: selected ? 'var(--color-brand)' : 'var(--border)' }}>
                  {selected && <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-brand)' }} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate" style={{ color: 'var(--text-hi)' }}>{addressLine1(a)}</span>
                  <span className="block text-xs truncate" style={{ color: 'var(--text-lo)' }}>
                    {[addressLine2(a), a.complement].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
              <button type="button" onClick={() => onEdit(a.id)} aria-label={`Editar endereço ${addressLine1(a)}`}
                className="p-2 -m-1" style={{ color: 'var(--text-lo)' }}>
                <Icon name="edit" size={14} />
              </button>
              <button type="button" onClick={() => onRemove(a.id)} aria-label={`Remover endereço ${addressLine1(a)}`}
                className="px-1 py-2 -m-1 text-xs font-semibold" style={{ color: '#b91c1c' }}>
                Remover
              </button>
            </div>
          )
        })}
      </div>

      <button type="button" onClick={onAdd}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left border-t border-dashed"
        style={{ borderColor: 'var(--divider)', color: 'var(--color-brand)' }}>
        <span className="w-6 flex justify-center text-lg font-bold leading-none" aria-hidden="true">+</span>
        <span className="text-sm font-semibold">
          {book.list.length >= MAX_ADDRESSES ? `Adicionar outro (o mais antigo será substituído)` : 'Adicionar outro endereço'}
        </span>
      </button>
    </div>
  )
}

import type { ComplementsGroup, ComplementItem, ComplementsGroupCategory } from '../types'
import {
  getComplementPriceLabel,
  getFractionalSubLabel,
  formatCurrency,
} from '../lib/pricing'
import ImageWithFallback from './ImageWithFallback'
import Icon from './Icon'
import { isOutOfStock } from '../lib/stock'

interface SelectedMap {
  [itemId: string]: number // qtd selecionada
}

interface Bucket {
  id: string
  name: string
  seq: number
  items: ComplementItem[]
}

/** Seção sintética para os itens que não declaram subcategoria. */
const UNCATEGORIZED_ID = '__sem_subcategoria__'

/**
 * Separa os itens de um grupo pelas subcategorias que eles declaram.
 * Ex: "Escolha o sabor da sua bebida." → Refrigerantes / Sucos / Milkshakes.
 *
 * Todo item que declara subcategoria entra nela, inclusive quando existe
 * uma só.
 *
 * Os itens *sem* subcategoria também viram uma seção colapsável ("Outros")
 * — desde que exista alguma subcategoria de verdade no grupo. Antes eles eram
 * cuspidos direto no topo, sem cabeçalho e sem seta, e passavam a impressão de
 * ser "o primeiro subgrupo, travado aberto".
 *
 * Quando *nenhum* item tem subcategoria, devolve tudo em `flat`: aí o próprio
 * cabeçalho do grupo já é o colapso e um nível a mais só somaria um toque.
 */
function splitByCategory(
  items: ComplementItem[],
  categories: Map<string, ComplementsGroupCategory>,
): { flat: ComplementItem[]; sections: Bucket[] } {
  const uncategorized: ComplementItem[] = []
  const map = new Map<string, Bucket>()

  for (const item of items) {
    const catId = item.complementGroupCategoryID
    const category = catId ? categories.get(catId) : undefined
    if (!category) {
      uncategorized.push(item)
      continue
    }
    const bucket = map.get(category._id)
    if (bucket) bucket.items.push(item)
    else {
      map.set(category._id, {
        id: category._id,
        name: category.name,
        seq: category.seq,
        items: [item],
      })
    }
  }

  if (map.size === 0) return { flat: uncategorized, sections: [] }

  const sections = [...map.values()].sort((a, b) => a.seq - b.seq)
  if (uncategorized.length > 0) {
    // -1 mantém os sem-categoria no topo, onde já apareciam
    sections.unshift({
      id: UNCATEGORIZED_ID,
      name: 'Outros',
      seq: -1,
      items: uncategorized,
    })
  }
  return { flat: [], sections }
}

interface Props {
  group: ComplementsGroup
  /** Subcategorias por id — "Refrigerantes", "Sucos", "Milkshakes" */
  categories: Map<string, ComplementsGroupCategory>
  selected: SelectedMap
  onChangeSelected: (groupId: string, itemId: string, delta: number) => void
  fracTotal: number // total de frações já selecionadas neste grupo (externo)
  /** Aberto/fechado é controlado pelo pai: a validação precisa conseguir abrir
   *  o grupo que faltou preencher. */
  open: boolean
  onToggle: () => void
  /** Subcategorias abertas, com chave "grupoId:categoriaId" */
  openSubs: Set<string>
  onToggleSub: (key: string) => void
  /** Destaca a borda quando a validação apontou este grupo */
  invalid?: boolean
}

export default function ComplementGroup({
  group, categories, selected, onChangeSelected, fracTotal,
  open, onToggle, openSubs, onToggleSub, invalid,
}: Props) {
  const isRadio = !group.ingredients && group.maxQuantity === 1
  const isFractional = group.ingredients

  const { flat, sections } = splitByCategory(group.products, categories)

  // Resumo mostrado no cabeçalho quando o grupo está fechado
  const chosen = group.products.filter((p) => (selected[p._id] ?? 0) > 0)
  const summary = chosen.length
    ? chosen.map((p) => {
        const q = selected[p._id] ?? 0
        return q > 1 ? `${q}× ${p.name}` : p.name
      }).join(', ')
    : null

  const counter = isFractional
    ? `${fracTotal}/${group.maxQuantity} frações`
    : group.maxQuantity === 1
    ? 'escolha 1'
    : `até ${group.maxQuantity}`

  return (
    <div
      className="rounded-2xl overflow-hidden border transition-colors"
      style={{
        background: 'var(--bg-card)',
        borderColor: invalid ? '#ef4444' : 'var(--border)',
      }}
    >
      {/* Cabeçalho — clicável para abrir/fechar */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-start gap-2 text-left"
        style={{ background: 'var(--bg-input)' }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
              {group.title}
            </span>
            {group.obrigatory && <Tag kind="required">obrigatório</Tag>}
            {isFractional && <Tag kind="fraction">fracionado</Tag>}
            {!group.obrigatory && !isFractional && <Tag kind="optional">opcional</Tag>}
          </div>

          {/* Fechado com escolha feita → mostra o que foi escolhido.
              Fechado e vazio → mostra a regra do grupo. */}
          <p
            className="text-xs mt-0.5 truncate"
            style={{ color: summary ? 'var(--color-brand)' : 'var(--text-lo)' }}
          >
            {summary ?? counter}
          </p>
        </div>

        <span
          className="text-xs mt-0.5 flex-shrink-0 transition-transform"
          style={{
            color: 'var(--text-lo)',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {/* Conteúdo */}
      {open && (
        <div>
          {/* Grupo sem nenhuma subcategoria: itens direto, o cabeçalho do
              grupo já é o colapso */}
          {flat.length > 0 && (
            <ItemList
              items={flat} group={group} selected={selected}
              fracTotal={fracTotal} isRadio={isRadio} isFractional={isFractional}
              onChangeSelected={onChangeSelected}
            />
          )}

          {sections.map(({ id, name, items }) => {
            const key = `${group._id}:${id}`
            const subOpen = openSubs.has(key)
            const subChosen = items.reduce((acc, i) => acc + (selected[i._id] ?? 0), 0)
            return (
              <div key={id} className="border-t" style={{ borderColor: 'var(--divider)' }}>
                <button
                  type="button"
                  onClick={() => onToggleSub(key)}
                  aria-expanded={subOpen}
                  className="w-full px-4 py-2.5 flex items-center gap-2 text-left"
                >
                  <span className="text-sm font-medium" style={{ color: 'var(--text-hi)' }}>
                    {name}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-lo)' }}>
                    ({items.length})
                  </span>
                  {subChosen > 0 && (
                    <span
                      className="text-xs font-semibold px-1.5 rounded-full"
                      style={{ background: 'var(--color-brand-light)', color: 'var(--color-brand)' }}
                    >
                      {subChosen}
                    </span>
                  )}
                  <span
                    className="ml-auto text-xs transition-transform"
                    style={{ color: 'var(--text-lo)', transform: subOpen ? 'rotate(180deg)' : 'none' }}
                    aria-hidden
                  >
                    ▾
                  </span>
                </button>

                {subOpen && (
                  <ItemList
                    items={items} group={group} selected={selected}
                    fracTotal={fracTotal} isRadio={isRadio} isFractional={isFractional}
                    onChangeSelected={onChangeSelected}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Lista de itens ───────────────────────────────────────────────────────────

function ItemList({
  items, group, selected, fracTotal, isRadio, isFractional, onChangeSelected,
}: {
  items: ComplementItem[]
  group: ComplementsGroup
  selected: SelectedMap
  fracTotal: number
  isRadio: boolean
  isFractional: boolean
  onChangeSelected: (groupId: string, itemId: string, delta: number) => void
}) {
  return (
    <div className="divide-y" style={{ borderColor: 'var(--divider)' }}>
      {items.map((item) => {
        const qty = selected[item._id] ?? 0
        const itemPrice = (item as ComplementItem & { price: number }).price ?? 0
        const label = getComplementPriceLabel(itemPrice, group)

        // Complemento também acaba. Sem esta checagem o cliente escolhia uma
        // bebida esgotada e só descobria quando o garçom voltasse para avisar.
        if (isOutOfStock(item)) {
          return <SoldOutItem key={item._id} item={item} />
        }

        if (isFractional) {
          return (
            <FractionalItem
              key={item._id}
              item={item}
              itemPrice={itemPrice}
              qty={qty}
              maxQty={group.maxQuantity}
              fracTotal={fracTotal}
              onChange={(delta) => onChangeSelected(group._id, item._id, delta)}
            />
          )
        }

        if (isRadio) {
          return (
            <RadioItem
              key={item._id}
              item={item}
              itemPrice={itemPrice}
              label={label}
              selected={qty > 0}
              onSelect={() => onChangeSelected(group._id, item._id, 1)}
            />
          )
        }

        return (
          <CheckItem
            key={item._id}
            item={item}
            itemPrice={itemPrice}
            label={label}
            qty={qty}
            maxQty={group.maxQuantity}
            onChange={(delta) => onChangeSelected(group._id, item._id, delta)}
          />
        )
      })}
    </div>
  )
}

// ─── Item esgotado ────────────────────────────────────────────────────────────

/**
 * Item que acabou: continua na lista, em cinza e sem interação.
 *
 * Some-lo seria mais limpo, mas o cliente que sempre pede aquele sabor ficaria
 * procurando e chamaria o garçom. Mostrar esgotado responde a pergunta sozinho.
 */
function SoldOutItem({ item }: { item: ComplementItem }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 opacity-55 select-none">
      {item.image && (
        <ImageWithFallback
          src={item.image as string}
          alt={item.name}
          className="w-10 h-10 rounded-lg object-cover flex-shrink-0 grayscale"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium line-through" style={{ color: 'var(--text-lo)' }}>
          {item.name}
        </p>
      </div>
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
        style={{ background: 'var(--bg-input)', color: 'var(--text-lo)' }}
      >
        Esgotado
      </span>
    </div>
  )
}

// ─── Tag do cabeçalho ─────────────────────────────────────────────────────────

const TAG_STYLE = {
  required: { background: 'rgba(239,68,68,.12)', color: '#dc2626' },
  optional: { background: 'var(--color-brand-light)', color: 'var(--color-brand)' },
  fraction: { background: 'rgba(147,51,234,.12)', color: '#9333ea' },
} as const

function Tag({ kind, children }: { kind: keyof typeof TAG_STYLE; children: React.ReactNode }) {
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
      style={TAG_STYLE[kind]}
    >
      {children}
    </span>
  )
}

// ─── Radio (obrigatório max 1) ────────────────────────────────────────────────

function RadioItem({ item, itemPrice, label, selected, onSelect }: {
  item: ComplementItem
  itemPrice: number
  label: ReturnType<typeof getComplementPriceLabel>
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
      style={{ background: selected ? 'var(--color-brand-light)' : 'transparent' }}
    >
      {item.image && (
        <ImageWithFallback
          src={item.image as string}
          alt={item.name}
          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
        />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-hi)' }}>{item.name}</p>
        {/* Preço abaixo do nome: só aparece se NÃO for incluso/diff */}
        {!label.hideBasePrice && itemPrice > 0 && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
            {formatCurrency(itemPrice)}
          </p>
        )}
      </div>

      <PriceBadge label={label} />

      <div
        className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
        style={{
          borderColor: selected ? 'var(--color-brand)' : 'var(--border)',
          background: selected ? 'var(--color-brand)' : 'transparent',
        }}
      >
        {selected && <div className="w-2 h-2 rounded-full bg-white" />}
      </div>
    </button>
  )
}

// ─── Checkbox (opcional ou obrigatório max > 1) ───────────────────────────────

function CheckItem({ item, itemPrice, label, qty, maxQty, onChange }: {
  item: ComplementItem
  itemPrice: number
  label: ReturnType<typeof getComplementPriceLabel>
  qty: number
  maxQty: number
  onChange: (delta: number) => void
}) {
  const isSelected = qty > 0

  /**
   * A linha inteira adiciona. Diminuir fica no botão −.
   *
   * O alvo de toque de um checkbox de 20px é pequeno demais para quem está com
   * o celular numa mão e o garfo na outra. Como a ação de longe mais comum é
   * *adicionar*, ela ganha a área toda.
   *
   * Exceção: com `maxQty === 1` não existe botão −, então a linha **alterna**.
   * Sem isso o cliente marcaria o item e não teria como desmarcar.
   */
  const handleRowTap = () => {
    if (maxQty === 1) onChange(isSelected ? -1 : 1)
    else onChange(1)
  }

  return (
    <div
      onClick={handleRowTap}
      role="button"
      tabIndex={0}
      aria-label={`${item.name}${maxQty === 1 ? '' : ' — tocar adiciona'}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRowTap() } }}
      className="flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer select-none"
      style={{
        background: isSelected ? 'var(--color-brand-light)' : 'transparent',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {item.image && (
        <ImageWithFallback
          src={item.image as string}
          alt={item.name}
          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
        />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-hi)' }}>{item.name}</p>
        {!label.hideBasePrice && itemPrice > 0 && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
            {formatCurrency(itemPrice)}
          </p>
        )}
      </div>

      <PriceBadge label={label} />

      {/* stopPropagation nos botões: sem isso, tocar em − dispararia também o
          clique da linha e o item nunca diminuiria */}
      {maxQty > 1 ? (
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onChange(-1) }}
            disabled={qty <= 0}
            aria-label="Diminuir"
            className="w-8 h-8 rounded-full border flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform"
            style={{ borderColor: 'var(--border)', color: 'var(--text-lo)' }}
          >
            <Icon name="minus" size={12} />
          </button>
          <span className="w-4 text-center text-sm font-medium" style={{ color: 'var(--text-hi)' }}>
            {qty}
          </span>
          <span
            aria-hidden
            className="w-8 h-8 rounded-full flex items-center justify-center text-white"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            <Icon name="plus" size={12} />
          </span>
        </div>
      ) : (
        <span
          aria-hidden
          className="w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors"
          style={{
            borderColor: isSelected ? 'var(--color-brand)' : 'var(--border)',
            background: isSelected ? 'var(--color-brand)' : 'transparent',
            color: '#fff',
          }}
        >
          {isSelected && <Icon name="check" size={11} />}
        </span>
      )}
    </div>
  )
}

// ─── Fracionado ───────────────────────────────────────────────────────────────

function FractionalItem({ item, itemPrice, qty, maxQty, fracTotal, onChange }: {
  item: ComplementItem
  itemPrice: number
  qty: number
  maxQty: number
  fracTotal: number
  onChange: (delta: number) => void
}) {
  const canAdd = fracTotal < maxQty
  const subLabel = getFractionalSubLabel(itemPrice, maxQty)

  return (
    <div
      onClick={() => canAdd && onChange(1)}
      role="button"
      tabIndex={0}
      aria-label={`${item.name} — tocar adiciona uma fração`}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && canAdd) { e.preventDefault(); onChange(1) }
      }}
      className="flex items-center gap-3 px-4 py-3 select-none"
      style={{
        background: qty > 0 ? 'rgba(147,51,234,.10)' : 'transparent',
        cursor: canAdd ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {item.image && (
        <ImageWithFallback
          src={item.image as string}
          alt={item.name}
          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
        />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-hi)' }}>{item.name}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>{subLabel}</p>
      </div>

      {qty > 0 && (
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: 'rgba(147,51,234,.14)', color: '#9333ea' }}
        >
          {qty}/{maxQty}
        </span>
      )}

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* stopPropagation: sem isso o − também dispararia o clique da linha */}
        <button
          onClick={(e) => { e.stopPropagation(); onChange(-1) }}
          disabled={qty <= 0}
          aria-label="Remover fração"
          className="w-8 h-8 rounded-full border flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform"
          style={{ borderColor: 'var(--border)', color: 'var(--text-lo)' }}
        >
          <Icon name="minus" size={12} />
        </button>
        <span className="w-4 text-center text-sm font-medium" style={{ color: '#9333ea' }}>{qty}</span>
        <span
          aria-hidden
          className="w-8 h-8 rounded-full flex items-center justify-center text-white"
          style={{ backgroundColor: '#9333ea', opacity: canAdd ? 1 : 0.3 }}
        >
          <Icon name="plus" size={12} />
        </span>
      </div>
    </div>
  )
}

// ─── Badge de preço ────────────────────────────────────────────────────────────

function PriceBadge({ label }: { label: ReturnType<typeof getComplementPriceLabel> }) {
  if (label.type === 'incluso') {
    return (
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
        style={{ background: 'var(--color-brand-light)', color: 'var(--color-brand)' }}
      >
        incluso
      </span>
    )
  }
  if (label.type === 'diff') {
    return (
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
        style={{ background: 'rgba(239,68,68,.12)', color: '#dc2626' }}
      >
        {label.text}
      </span>
    )
  }
  if (label.type === 'free') {
    return <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-lo)' }}>grátis</span>
  }
  return (
    <span className="text-sm font-medium flex-shrink-0" style={{ color: 'var(--text-lo)' }}>
      {label.text}
    </span>
  )
}

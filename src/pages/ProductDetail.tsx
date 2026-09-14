import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useCartStore, buildCartComplements, cartComplementsToSelectedByGroup } from '../store/cartStore'
import ComplementGroup from '../components/ComplementGroup'
import ImageWithFallback from '../components/ImageWithFallback'
import {
  formatCurrency, effectivePrice, hasDiscount, discountAmount,
  getCardPrice, calcUnitPrice,
} from '../lib/pricing'
import { getProductStatus, getStatusBadge, getPeriodLabel, isOutOfStock } from '../lib/stock'
import type { CartComplement, Product, ComplementsGroup, ComplementsGroupCategory } from '../types'
import { Analytics } from '../lib/analytics'
import { toast } from '../store/toastStore'
import { useContentTranslator } from '../lib/useTranslatedContent'
import Icon from '../components/Icon'
import { hasNoteTag, toggleNoteTag, noteTagsOf } from '../lib/noteTags'
import HeaderButton from '../components/HeaderButton'

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const editIndexParam = searchParams.get('editIndex')
  const editIndex = editIndexParam !== null ? parseInt(editIndexParam) : null
  const isEditMode = editIndex !== null

  const navigate = useNavigate()
  const { products, periods, params, groupCategories, branch } = useAppStore()
  const tr = useContentTranslator()
  const { addItem, updateItem, items, initCodes } = useCartStore()
  const product = products.find((p) => p._id === id)

  const [selectedByGroup, setSelectedByGroup] = useState<Map<string, Record<string, number>>>(new Map())
  const [note, setNote] = useState('')
  const [qty, setQty] = useState(1)
  const [error, setError] = useState<string | null>(null)
  // Tudo começa fechado — só o que o usuário abriu entra nesses sets
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [openCats, setOpenCats] = useState<Set<string>>(new Set())
  const [invalidGroup, setInvalidGroup] = useState<string | null>(null)

  // Pré-preenche em modo edição
  useEffect(() => {
    if (isEditMode && editIndex !== null && items[editIndex]) {
      const existing = items[editIndex]
      setNote(existing.note)
      setQty(existing.quantity)
      setSelectedByGroup(cartComplementsToSelectedByGroup(existing.addedComplements))
    }
  }, [isEditMode, editIndex])

  useEffect(() => { if (product) Analytics.viewProduct(product) }, [product?._id])

  // ————————————————————————————————————————————————
  // Todos os hooks vivem acima do guard de produto ausente. Um `return`
  // antes de um useMemo muda a ordem dos hooks entre renders e derruba o React.
  // ————————————————————————————————————————————————
  /**
   * Preço-piso: o mesmo número do grid, já com as escolhas obrigatórias mínimas.
   *
   * Não é `effectivePrice`. Partir do base cru fazia o valor **subir** quando o
   * cliente marcava o item incluso — o combo abria R$29,40 e virava R$35,90 ao
   * escolher a bebida que a descrição promete de graça. Abrindo no piso, marcar
   * o incluso não mexe no número, que é o que "incluso" quer dizer.
   */
  const floorPrice = product ? getCardPrice(product) : 0

  const cartComplements = useMemo((): CartComplement[] => {
    if (!product) return []
    return buildCartComplements(
      new Map([...selectedByGroup.entries()].map(([gId, sel]) => [gId,
        Object.entries(sel).filter(([, q]) => q > 0).map(([itemId, q]) => {
          const group = product.complementsGroups.find((g) => g._id === gId)
          const item = group?.products.find((p) => (p as unknown as {_id:string})._id === itemId)
          return { item: item as unknown as Product, qty: q }
        }),
      ])),
      product.complementsGroups
    )
  }, [selectedByGroup, product])

  /**
   * Preço da unidade com as escolhas atuais.
   *
   * `calcUnitPrice` é a **mesma** função que o carrinho e o checkout usam. Antes
   * esta tela montava a própria soma, e era assim que o cabeçalho e o rodapé
   * conseguiam discordar sobre o mesmo item.
   */
  const unitSubtotal = useMemo(
    () => (product ? calcUnitPrice(product, cartComplements) : 0),
    [product, cartComplements],
  )

  /** Só o que passa do piso — alimenta a linha de composição do valor. */
  const extrasTotal = unitSubtotal - floorPrice

  /** Observações prontas cadastradas no produto, para usar como atalho. */
  const noteSuggestions = noteTagsOf(product?.customSuggestions)

  /**
   * "Adicione também" — sugestões de produtos.
   *
   * ⚠️ **Item de complemento é um Product na mesma collection.** "Trocar pão
   * árabe para o pão bola" (R$1,00) estava aparecendo como sugestão: ele é
   * Product, tem `suggestionCategory: "global"` e passava no filtro. O que o
   * separa é `category` **vazia** — item que só existe dentro de um grupo não
   * pertence a nenhuma categoria do cardápio.
   *
   * Também exijo `locationTypes` compatível e preço > 0: sugerir um item de
   * R$0,00 ou fora do canal não faz sentido para o cliente.
   *
   * Ver `BACKEND.md` → "Adicione também" para como isso deveria ser
   * administrado de fato (hoje `suggestionCategory: "global"` está em quase
   * todo produto, o que torna a regra quase aleatória).
   */
  const suggestions = useMemo(() => {
    if (!product?.suggestionCategory || product.suggestionCategory === 'global') return []

    const groupItemIds = new Set(
      product.complementsGroups.flatMap((g) => g.items ?? []),
    )

    return products
      .filter((p) => {
        if (p._id === product._id || !p.active) return false
        // Item de complemento: sem categoria do cardápio
        if (!p.category?.trim()) return false
        // Já é complemento deste próprio produto
        if (groupItemIds.has(p._id)) return false
        if (isOutOfStock(p)) return false
        if (effectivePrice(p) <= 0) return false
        return p.suggestionCategory === product.suggestionCategory
          || p.suggestionCategory === 'global'
      })
      .slice(0, 6)
  }, [product, products])

  /** Subcategorias indexadas por id, para o grupo agrupar seus itens. */
  const catById = useMemo(() => {
    const m = new Map<string, ComplementsGroupCategory>()
    for (const c of groupCategories) if (c.active !== false) m.set(c._id, c)
    return m
  }, [groupCategories])

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 text-center"
        style={{ background: 'var(--bg-page)' }}>
        <span className="text-5xl">🍽</span>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-hi)' }}>Produto indisponível</h1>
        <p className="text-sm" style={{ color: 'var(--text-lo)' }}>
          Este item saiu do cardápio ou o link está desatualizado.
        </p>
        <button onClick={() => navigate('/', { replace: true })}
          className="mt-2 px-6 py-3 rounded-xl text-white font-semibold text-sm"
          style={{ backgroundColor: 'var(--color-brand)' }}>
          Voltar ao cardápio
        </button>
      </div>
    )
  }

  const status = getProductStatus(product, periods)
  const badge = getStatusBadge(status)
  const orderable = status === 'available'
  const periodLabel = getPeriodLabel(product, periods)
  const showDiscount = hasDiscount(product)
  const discount = discountAmount(product)

  // Frações totais por grupo
  const fracTotals: Record<string, number> = {}
  for (const g of product.complementsGroups) {
    if (g.ingredients) {
      const sel = selectedByGroup.get(g._id) ?? {}
      fracTotals[g._id] = Object.values(sel).reduce((a, b) => a + b, 0)
    }
  }

  const handleChange = (groupId: string, itemId: string, delta: number) => {
    const group = product.complementsGroups.find((g) => g._id === groupId)
    if (!group) return

    let satisfiedNow = false

    setSelectedByGroup((prev) => {
      const next = new Map(prev)
      const groupSel = { ...(next.get(groupId) ?? {}) }
      if (group.maxQuantity === 1 && !group.ingredients) {
        Object.keys(groupSel).forEach((k) => (groupSel[k] = 0))
        groupSel[itemId] = 1
      } else if (group.ingredients) {
        const fracTotal = Object.values(groupSel).reduce((a, b) => a + b, 0)
        if (delta > 0 && fracTotal >= group.maxQuantity) return prev
        groupSel[itemId] = Math.max(0, (groupSel[itemId] ?? 0) + delta)
      } else {
        const total = Object.values(groupSel).reduce((a, b) => a + b, 0)
        if (delta > 0 && total >= group.maxQuantity) return prev
        groupSel[itemId] = Math.max(0, (groupSel[itemId] ?? 0) + delta)
      }
      next.set(groupId, groupSel)

      const before = Object.values(prev.get(groupId) ?? {}).reduce((a, b) => a + b, 0)
      const after = Object.values(groupSel).reduce((a, b) => a + b, 0)
      satisfiedNow = before < group.minQuantity && after >= group.minQuantity

      return next
    })

    setError(null)
    setInvalidGroup(null)

    // Só grupo obrigatório puxa o próximo. Em grupo opcional o cliente pode
    // querer marcar mais de um item, e fechar o grupo embaixo do dedo dele
    // seria pior que não ajudar.
    if (group.obrigatory && satisfiedNow) advanceFrom(groupId)
  }

  /**
   * Fecha o grupo recém-preenchido e abre o próximo que ainda falta.
   * Prioriza obrigatórios pendentes; se não houver, abre o próximo da lista.
   */
  const advanceFrom = (groupId: string) => {
    const groups = product.complementsGroups
    const idx = groups.findIndex((g) => g._id === groupId)
    if (idx < 0) return

    const rest = groups.slice(idx + 1)
    const nextGroup =
      rest.find((g) => g.obrigatory && selectedCount(g._id) < g.minQuantity) ?? rest[0]

    setOpenGroups((prev) => {
      const next = new Set(prev)
      next.delete(groupId)
      if (nextGroup) next.add(nextGroup._id)
      return next
    })
  }

  const selectedCount = (groupId: string) =>
    Object.values(selectedByGroup.get(groupId) ?? {}).reduce((a, b) => a + b, 0)

  const isGroupPending = (g: ComplementsGroup) =>
    g.obrigatory && selectedCount(g._id) < g.minQuantity

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /**
   * Subcategorias são um acordeão: abrir uma fecha as outras **do mesmo grupo**.
   * A chave é "grupoId:categoriaId", então o prefixo delimita o escopo — abrir
   * "Sucos" na pergunta da bebida não mexe nas subcategorias de outra pergunta.
   */
  const toggleCat = (key: string) =>
    setOpenCats((prev) => {
      if (prev.has(key)) {
        const next = new Set(prev)
        next.delete(key)
        return next
      }
      const groupPrefix = `${key.split(':')[0]}:`
      const next = new Set([...prev].filter((k) => !k.startsWith(groupPrefix)))
      next.add(key)
      return next
    })

  /** Com tudo colapsado, apontar o erro não basta — é preciso abrir o grupo que
   *  faltou, senão o cliente lê "selecione uma bebida" e não acha onde. */
  const revealGroup = (groupId: string) => {
    setOpenGroups((prev) => new Set(prev).add(groupId))
    setInvalidGroup(groupId)
  }

  const validate = (): string | null => {
    for (const g of product.complementsGroups) {
      if (!isGroupPending(g)) continue
      revealGroup(g._id)
      return `Selecione pelo menos ${g.minQuantity} em "${g.title}"`
    }
    setInvalidGroup(null)
    return null
  }

  const totalSubtotal = unitSubtotal * qty

  const handleSubmit = () => {
    const err = validate()
    if (err) {
      setError(err)
      // O erro embaixo do botão passa despercebido quando a página está rolada;
      // o toast garante que a mensagem apareça onde o cliente está olhando.
      toast.error(err)
      return
    }
    if (params) {
      // Dígitos da senha vêm da branch — mais dígitos, menos chance de duas
      // pessoas receberem a mesma senha no mesmo serviço
      initCodes(params.mode, params.table, branch?.settingsWeb?.passwordDigits)
    }
    if (isEditMode && editIndex !== null) {
      updateItem(editIndex, cartComplements, note, qty)
    } else {
      addItem(product, cartComplements, note, qty)
      Analytics.addToCart(product, totalSubtotal, qty)
    }
    navigate(-1)
  }

  return (
    <div className="min-h-screen pb-32" style={{ background: 'var(--bg-page)' }}>
      {/* Hero image */}
      <div className="relative">
        {/* Mesmo componente das demais telas — só com sombra, porque aqui ele
            fica sobre a foto do produto */}
        <div className="absolute top-4 left-4 z-10">
          <HeaderButton icon="back" onClick={() => navigate(-1)}
            label="Voltar" emphasis overlay />
        </div>

        <ImageWithFallback src={product.image} alt={product.name}
          className={`w-full h-64 object-cover ${!orderable ? 'grayscale opacity-60' : ''}`}
          skeletonClassName="w-full h-64" />

        {badge && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.3)' }}>
            <span className={`text-sm font-bold px-5 py-2 rounded-full ${badge.className}`}>{badge.label}</span>
          </div>
        )}
      </div>

      {/* Cabeçalho do produto */}
      <div className="px-4 py-4 shadow-sm" style={{ background: 'var(--bg-card)' }}>
        <h1 className="text-xl font-bold leading-tight" style={{ color: 'var(--text-hi)' }}>{tr.name(product)}</h1>

        {/* Descrição */}
        {tr.description(product) && (
          <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--text-lo)' }}>
            {tr.description(product)}
          </p>
        )}

        {/* Período disponível */}
        {periodLabel && (
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-xs">🕐</span>
            <span className="text-xs text-amber-600 font-medium">{periodLabel}</span>
          </div>
        )}

        {/*
          Preço — abre no piso do grid e acompanha as escolhas.
          Dois bugs moraram aqui: ficava travado no base (o rodapé subia para
          R$34,40 e o topo seguia em R$29,40), e depois abria abaixo do valor
          anunciado no grid, subindo ao marcar justamente o item incluso.
        */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {showDiscount && extrasTotal === 0 && (
            <span className="text-sm line-through" style={{ color: 'var(--text-lo)' }}>
              {formatCurrency(product.price ?? 0)}
            </span>
          )}
          <span className="text-xl font-bold" style={{ color: 'var(--color-brand)' }}>
            {formatCurrency(unitSubtotal)}
          </span>
          {showDiscount && extrasTotal === 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
              −{formatCurrency(discount)}
              {product.productOffer?.title ? ` (${product.productOffer.title})` : ''}
            </span>
          )}
        </div>

        {/* Composição do valor: sem isso o cliente vê o número mudar e não sabe
            de onde veio o acréscimo */}
        {extrasTotal > 0 && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-lo)' }}>
            {formatCurrency(floorPrice)} + {formatCurrency(extrasTotal)} em opcionais
          </p>
        )}
      </div>

      {/* Complementos */}
      <div className="px-4 pt-4 flex flex-col gap-4">
        {product.complementsGroups.map((group) => (
          <ComplementGroup
            key={group._id}
            group={group}
            categories={catById}
            selected={selectedByGroup.get(group._id) ?? {}}
            onChangeSelected={handleChange}
            fracTotal={fracTotals[group._id] ?? 0}
            open={openGroups.has(group._id)}
            onToggle={() => toggleGroup(group._id)}
            openSubs={openCats}
            onToggleSub={toggleCat}
            invalid={invalidGroup === group._id}
          />
        ))}

        {/* Observação por item, com as sugestões da API como atalho */}
        <div className="rounded-2xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-hi)' }}>
            Observação
          </label>

          {/*
            `customSuggestions` são observações prontas cadastradas no produto —
            em lata de refrigerante vem `["Natural"]`, que é pedido de bebida não
            gelada. Estavam num bloco separado "Vai bem com…", como chips
            decorativos que não faziam nada: o cliente lia "Natural" e ainda
            tinha de digitar a palavra no campo abaixo.

            Agora são atalhos que preenchem a observação, e tocar de novo remove.
          */}
          {noteSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2.5">
              {noteSuggestions.map((s) => {
                const on = hasNoteTag(note, s)
                return (
                  <button
                    key={s}
                    onClick={() => setNote(toggleNoteTag(note, s))}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-full border transition-colors"
                    style={on
                      ? { background: 'var(--color-brand)', borderColor: 'var(--color-brand)', color: '#fff' }
                      : { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-hi)' }
                    }
                  >
                    {on && <Icon name="check" size={9} />} {s}
                  </button>
                )
              })}
            </div>
          )}

          <textarea value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Ex: sem cebola, ponto bem passado..."
            rows={2} maxLength={200}
            className="w-full text-sm resize-none outline-none placeholder-gray-300"
            style={{ color: 'var(--text-hi)', background: 'transparent' }} />
          {note && (
            <p className="text-right text-xs mt-1" style={{ color: 'var(--text-lo)' }}>{note.length}/200</p>
          )}
        </div>

        {/* Sugestões por categoria (produtos reais) */}
        {suggestions.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-hi)' }}>Adicione também</p>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
              {suggestions.map((s) => (
                <button key={s._id} onClick={() => navigate(`/produto/${s._id}`)}
                  className="flex-shrink-0 w-28 rounded-xl overflow-hidden border text-left active:scale-95 transition-transform"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                  <ImageWithFallback src={s.image} alt={s.name} className="w-full h-20 object-cover" />
                  <div className="p-2">
                    <p className="text-xs font-medium line-clamp-2 leading-tight" style={{ color: 'var(--text-hi)' }}>{s.name}</p>
                    <p className="text-xs font-bold mt-0.5" style={{ color: 'var(--color-brand)' }}>
                      {formatCurrency(effectivePrice(s))}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Erro */}
      {error && (
        <div className="mx-4 mt-3 p-3 rounded-xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Barra inferior */}
      {orderable && (
        <div className="fixed bottom-0 left-0 right-0 border-t px-4 py-3"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            {/* Seletor de quantidade */}
            <div className="flex items-center rounded-xl overflow-hidden border"
              style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-11 h-11 flex items-center justify-center text-xl font-bold"
                style={{ color: 'var(--text-lo)' }} aria-label="Diminuir">−</button>
              <span className="w-10 text-center font-bold text-base" style={{ color: 'var(--text-hi)' }}>{qty}</span>
              <button onClick={() => setQty((q) => q + 1)}
                className="w-11 h-11 flex items-center justify-center text-xl font-bold"
                style={{ color: 'var(--color-brand)' }} aria-label="Aumentar">+</button>
            </div>
            {/* Botão */}
            <button onClick={handleSubmit}
              className="flex-1 h-11 rounded-xl text-white font-semibold text-sm flex items-center justify-between px-4 active:scale-[0.98] transition-transform"
              style={{ backgroundColor: 'var(--color-brand)' }}>
              <span>{isEditMode ? 'Atualizar' : qty > 1 ? `Adicionar ${qty}×` : 'Adicionar'}</span>
              <span className="font-bold">{formatCurrency(totalSubtotal)}</span>
            </button>
          </div>
          {qty > 1 && !isEditMode && (
            <p className="text-xs text-center mt-1.5" style={{ color: 'var(--text-lo)' }}>
              {formatCurrency(unitSubtotal)} cada · total {formatCurrency(totalSubtotal)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

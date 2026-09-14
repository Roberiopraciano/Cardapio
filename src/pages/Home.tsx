import { useRef, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useCartStore } from '../store/cartStore'
import { formatCurrency } from '../lib/pricing'
import { filterProductsForDisplay } from '../lib/stock'
import { Analytics } from '../lib/analytics'
import { api } from '../api/client'
import { toast } from '../store/toastStore'
import ProductCard from '../components/ProductCard'
import CartDrawer from '../components/CartDrawer'
import LanguagePicker from '../components/LanguagePicker'
import { useContentTranslator } from '../lib/useTranslatedContent'
import Icon from '../components/Icon'
import HeaderButton from '../components/HeaderButton'
import ConfirmModal from '../components/ConfirmModal'
import { CategoryTabsSkeleton, MenuSkeleton } from '../components/SkeletonLoader'
import ImageWithFallback from '../components/ImageWithFallback'
import type { Product } from '../types'
import { getProductStatus } from '../lib/stock'
import { getCardPrice, formatCurrency as fc } from '../lib/pricing'

// ─── Busca sem acento ─────────────────────────────────────────────────────────

/**
 * Minúsculas e sem acento, para "acai" achar "Açaí" e "pao" achar "Pão".
 *
 * `NFD` separa a letra do acento e o range `̀-ͯ` remove só os sinais
 * diacríticos — o "ç" vira "c" pelo mesmo caminho. Preserva o **comprimento**
 * caractere a caractere depois do `normalize`, o que o `Highlight` usa para
 * mapear a posição do trecho encontrado de volta ao texto original.
 */
function deaccent(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// ─── Highlight do texto buscado ───────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>

  // Índice calculado sobre a versão sem acento, mas o recorte é feito no texto
  // original — senão o cliente veria "Acai" destacado em vez de "Açaí".
  const idx = deaccent(text).indexOf(deaccent(query.trim()))
  if (idx === -1) return <>{text}</>
  const len = query.trim().length

  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: '#FEF08A', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + len)}
      </mark>
      {text.slice(idx + len)}
    </>
  )
}

export default function Home() {
  const { branch, company, categories, periods, params, loading } = useAppStore()
  const {
    items, totalWithCoupon, itemCount, whereConsume,
    clearCart, setWhereConsumeAsked, setBannersSeen,
  } = useCartStore()
  const [activeCat, setActiveCat] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [cartPop, setCartPop] = useState(false)
  const [waiterCooldown, setWaiterCooldown] = useState(false)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigate = useNavigate()
  const tr = useContentTranslator()

  const count = itemCount()
  const cartTotal = totalWithCoupon()
  const isMesa = params?.mode === 'mesa'

  /**
   * Chamar garçom vem **desligado** por padrão.
   *
   * O botão dispara `POST api/waiter-call`, e casa que não tem esse endpoint —
   * ou não tem processo para atender a chamada — deixaria o cliente tocando um
   * botão que não faz nada visível para ninguém. Ligar em
   * `settingsWeb.waiterCallEnabled`.
   */
  const showWaiterCall = isMesa && branch?.settingsWeb?.waiterCallEnabled === true

  // Anima badge ao adicionar
  const prevCount = useRef(count)
  useEffect(() => {
    if (count > prevCount.current) {
      setCartPop(true)
      setTimeout(() => setCartPop(false), 400)
    }
    prevCount.current = count
  }, [count])

  useEffect(() => {
    if (categories.length > 0 && !activeCat) setActiveCat(categories[0]._id)
  }, [categories])

  /** Troca a categoria exibida. Uma categoria por vez — o grid é substituído,
   *  não acumulado, e a lista volta ao topo. */
  const selectCategory = (id: string) => {
    setActiveCat(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const currentCat = categories.find((c) => c._id === activeCat) ?? null
  const visibleProducts = currentCat
    ? filterProductsForDisplay(currentCat.products, periods)
    : []

  // Track busca com debounce
  useEffect(() => {
    if (!searchQuery.trim()) return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => Analytics.search(searchQuery), 800)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [searchQuery])

  // Resultados da busca — compara sem acento nos dois lados, e no nome
  // traduzido, para a busca funcionar no idioma que está na tela
  const searchResults: Product[] = (() => {
    const q = deaccent(searchQuery.trim())
    if (!q) return []
    return categories
      .flatMap(c => c.products)
      .filter(p => {
        if (!p.active) return false
        const name = deaccent(tr.name(p))
        const desc = deaccent(tr.description(p) ?? '')
        return name.includes(q) || desc.includes(q)
      })
  })()

  // Chamar o garçom
  const handleWaiterCall = useCallback(async () => {
    if (waiterCooldown || !showWaiterCall) return
    setWaiterCooldown(true)
    try {
      await api.postWaiterCall(
        params?.table ?? '',
        params?.branchId ?? '',
        branch?.settingsWeb?.simpleAuth ?? ''
      )
      toast.success('🛎 Garçom chamado! Aguarde um momento.')
    } catch {
      toast.error('Não foi possível chamar o garçom. Tente novamente.')
    }
    // Cooldown de 60s para evitar spam
    setTimeout(() => setWaiterCooldown(false), 60_000)
  }, [waiterCooldown, showWaiterCall, params, branch])

  const logo = company?.settingsTotem?.['logo'] as string | undefined

  /**
   * Volta ao início da sessão: banners, modalidade e idioma.
   *
   * Esvazia o carrinho porque a modalidade define embalagem e pode definir
   * preço — itens montados como "comer aqui" não podem sobreviver a uma troca
   * para "levar" sem recálculo. Avisa antes: perder um carrinho montado sem
   * confirmação seria pior que o cliente ter de refazer a escolha.
   */
  const handleRestart = () => {
    if (items.length > 0) { setConfirmRestart(true); return }
    doRestart()
  }

  const doRestart = () => {
    setConfirmRestart(false)
    clearCart()
    setWhereConsumeAsked(false)
    setBannersSeen(false)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)', paddingBottom: 'calc(140px + env(safe-area-inset-bottom, 0px))' }}>
      {/* Header sticky */}
      <div className="sticky top-0 z-20 shadow-sm" style={{ background: 'var(--bg-card)' }}>
        <div className="px-4 pt-3 pb-2 flex items-center gap-3">
          {/* Recomeçar: volta ao carrossel / consumo / idioma */}
          <HeaderButton icon="back" onClick={handleRestart} label="Recomeçar" emphasis />

          {logo && (
            <img src={logo} alt={branch?.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold truncate" style={{ color: 'var(--text-hi)' }}>
              {branch?.name}
            </h1>
            {/* Modalidade sempre visível: ela muda embalagem e preço, e o
                cliente escolheu isso lá no início — sem lembrete, ele monta o
                pedido inteiro sem saber em qual modalidade está */}
            <p className="text-xs flex items-center gap-1 truncate" style={{ color: 'var(--color-brand)' }}>
              <Icon name={whereConsume === 'OnLocal' ? 'menu' : 'takeaway'} size={10} />
              <span className="font-semibold">
                {whereConsume === 'OnLocal' ? 'Comer aqui' : 'Para levar'}
              </span>
              {isMesa && params?.table && (
                <span style={{ color: 'var(--text-lo)' }}>· Mesa {params.table}</span>
              )}
            </p>
          </div>

          <LanguagePicker />

          {/* Chamar garçom — só em mesa e só se a branch habilitar */}
          {showWaiterCall && (
            <HeaderButton
              icon="waiter"
              onClick={handleWaiterCall}
              disabled={waiterCooldown}
              label={waiterCooldown ? 'Garçom já chamado, aguarde' : 'Chamar garçom'}
              emphasis
            />
          )}
        </div>

        {/*
          Busca sempre visível. Atrás de um botão de lupa ela era invisível para
          quem não procura por ícone — e o botão ainda disputava espaço com o
          seletor de idioma numa barra que já estava cheia.
        */}
        <div className="px-4 pb-2 relative">
          <span className="absolute left-7 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-lo)', marginTop: -4 }}>
            <Icon name="search" size={13} />
          </span>
          <input
            type="search"
            placeholder="Buscar produto..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full text-sm rounded-xl pl-9 pr-9 py-2.5 outline-none"
            style={{ background: 'var(--bg-input)', color: 'var(--text-hi)', border: '1px solid var(--border)' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Limpar busca"
              className="absolute right-7 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'var(--border)', color: 'var(--text-lo)', marginTop: -4 }}
            >
              <Icon name="close" size={11} />
            </button>
          )}
        </div>

        {/* Tabs de categoria */}
        {!searchQuery && (
          loading ? <CategoryTabsSkeleton /> : (
            <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
              {categories.map(cat => {
                const active = activeCat === cat._id
                return (
                  <button
                    key={cat._id}
                    onClick={() => selectCategory(cat._id)}
                    className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold rounded-full border transition-colors py-1 ${
                      /* com foto o padding da esquerda encolhe para a imagem
                         encostar na borda do pill */
                      cat.image ? 'pl-1 pr-3' : 'px-3 py-1.5'
                    }`}
                    style={active
                      ? { backgroundColor: 'var(--color-brand)', color: '#fff', borderColor: 'var(--color-brand)' }
                      : { background: 'var(--bg-card)', color: 'var(--text-lo)', borderColor: 'var(--border)' }
                    }
                  >
                    {cat.image && (
                      <ImageWithFallback
                        src={cat.image}
                        // Nome no alt para o fallback conseguir mostrar a inicial
                        alt={tr.name(cat)}
                        className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                        skeletonClassName="w-6 h-6 rounded-full"
                      />
                    )}
                    {tr.name(cat)}
                  </button>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* Resultados da busca com highlight */}
      {searchQuery && (
        <div className="px-4 pt-4">
          {searchResults.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--text-lo)' }}>
              Nenhum resultado para "{searchQuery}"
            </p>
          ) : (
            <>
              <p className="text-xs mb-3" style={{ color: 'var(--text-lo)' }}>
                {searchResults.length} resultado{searchResults.length > 1 ? 's' : ''}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {searchResults.map(p => (
                  <SearchProductCard key={p._id} product={p} query={searchQuery} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Somente a categoria selecionada */}
      {!searchQuery && (
        loading ? <MenuSkeleton /> : currentCat && (
          <div className="px-4 pt-4">
            <div className="flex items-center gap-2 mb-3">
              {currentCat.image && (
                <ImageWithFallback src={currentCat.image} alt={currentCat.name}
                  className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
              )}
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-hi)' }}>{tr.name(currentCat)}</h2>
              <span className="text-xs ml-auto" style={{ color: 'var(--text-lo)' }}>
                {visibleProducts.length}
              </span>
            </div>

            {visibleProducts.length === 0 ? (
              <p className="text-sm text-center py-12" style={{ color: 'var(--text-lo)' }}>
                Nenhum item disponível em {currentCat.name} agora.
              </p>
            ) : (
              /* key na categoria: força remontar o grid ao trocar de aba, em vez
                 de o React reaproveitar os cards da categoria anterior */
              <div key={currentCat._id} className="grid grid-cols-2 gap-3">
                {visibleProducts.map(p => <ProductCard key={p._id} product={p} />)}
              </div>
            )}
          </div>
        )
      )}

      {/* FAB carrinho */}
      {count > 0 && (
        /* Acima da TabBar (56px + área segura do iPhone) */
        <div className="fixed left-4 right-4 z-20"
          style={{ bottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}>
          <button
            onClick={() => setCartOpen(true)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-white shadow-xl active:scale-[0.98] transition-transform"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            <span
              className={`w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold flex-shrink-0 ${cartPop ? 'cart-pop' : ''}`}
            >
              {count}
            </span>
            <span className="font-semibold text-sm">Ver carrinho</span>
            <span className="font-bold text-sm">{formatCurrency(cartTotal)}</span>
          </button>
        </div>
      )}

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />

      <ConfirmModal
        open={confirmRestart}
        destructive
        title="Recomeçar o pedido?"
        message="Seu carrinho será esvaziado e você volta para a escolha de idioma e de comer aqui ou levar."
        confirmLabel="Sim, recomeçar"
        cancelLabel="Continuar pedindo"
        onConfirm={doRestart}
        onCancel={() => setConfirmRestart(false)}
      />
    </div>
  )
}

// ─── Card de busca com highlight ─────────────────────────────────────────────

function SearchProductCard({ product, query }: { product: Product; query: string }) {
  const navigate = useNavigate()
  const { periods } = useAppStore()
  const status = getProductStatus(product, periods)
  const orderable = status === 'available'
  const price = getCardPrice(product)
  const tr = useContentTranslator()
  const name = tr.name(product)
  const description = tr.description(product)

  return (
    <button
      onClick={() => orderable && navigate(`/produto/${product._id}`)}
      disabled={!orderable}
      className="w-full text-left rounded-2xl overflow-hidden border active:scale-[0.97] transition-transform"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', opacity: orderable ? 1 : 0.65 }}
    >
      <ImageWithFallback src={product.image} alt={name}
        className={`w-full aspect-square object-cover ${!orderable ? 'grayscale' : ''}`} />
      <div className="p-3">
        <p className="text-xs font-medium leading-tight" style={{ color: 'var(--text-hi)' }}>
          <Highlight text={name} query={query} />
        </p>
        {description && (
          <p className="text-[10px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-lo)' }}>
            <Highlight text={description} query={query} />
          </p>
        )}
        <p className="text-xs font-bold mt-1.5" style={{ color: orderable ? 'var(--color-brand)' : 'var(--text-lo)' }}>
          {fc(price)}
        </p>
      </div>
    </button>
  )
}

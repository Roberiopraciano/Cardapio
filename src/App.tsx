import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAppStore } from './store/appStore'
import { api, clearStaleApiCache, ApiError } from './api/client'
import { parseQrParams } from './lib/qrParams'
import { setStorageScope } from './lib/storageScope'
import { buildMenuData } from './lib/dataLinker'
import { preloadMenuImages } from './lib/imageCache'
import { checkBranchOpen } from './lib/businessPeriod'
import { applyCompanyTheme } from './lib/theme'
import { Analytics } from './lib/analytics'
import { branchLanguages } from './lib/i18n'
import { applyMockSettings } from './lib/mockSettings'
import { applyMenuIdentity, readMenuIdentity } from './lib/pwaIdentity'
import { whereConsumeForMode } from './lib/whereConsume'
import { allowedModesOf } from './lib/modalities'
import { useLangStore } from './store/langStore'
import { initAnalyticsIfConsented } from './components/ConsentBanner'
import ClosedScreen from './components/ClosedScreen'
import ErrorBoundary from './components/ErrorBoundary'
import ErrorScreen from './components/ErrorScreen'
import type { BootErrorKind } from './components/ErrorScreen'
import ConsentBanner from './components/ConsentBanner'
import WhereConsumePrompt from './components/WhereConsumePrompt'
import BannerCarousel from './components/BannerCarousel'
import type { BranchBanner } from './types'
import { useCartStore } from './store/cartStore'
import { toast } from './store/toastStore'
import ToastContainer from './components/ToastContainer'
import Home from './pages/Home'
import ProductDetail from './pages/ProductDetail'
import Checkout from './pages/Checkout'
import Confirmation from './pages/Confirmation'
import TotemHandoffPage from './pages/TotemHandoff'
import TableBill from './pages/TableBill'
import Profile from './pages/Profile'
import OrderHistory from './pages/OrderHistory'
import TabBar from './components/TabBar'

/**
 * Traduz a falha do boot na tela certa.
 *
 * "Sem conexão" era o destino de tudo, inclusive de QR Code inválido — e aí o
 * cliente ficava conferindo o Wi-Fi por causa de um link cortado. Só `status: 0`
 * (a requisição não chegou) é de fato falta de conexão.
 */
function classifyBootError(err: unknown): BootErrorKind {
  if (err instanceof ApiError) {
    if (err.isOffline) return 'network'
    if (err.isBadTarget) return 'notFound'
    return 'server'
  }
  // Erro não previsto (parser, JSON quebrado) é problema do servidor ou do app,
  // nunca da internet do cliente
  return 'server'
}

function Boot() {
  const {
    setParams, setLoading, setBooted, setClosedReason,
    setBranch, setCompany, setMenuData,
    loading, closedReason, branch, company, periods, params,
  } = useAppStore()
  const [bootError, setBootError] = useState<BootErrorKind | null>(null)
  const {
    whereConsumeAsked, setWhereConsumeAsked,
    bannersSeen, setBannersSeen,
  } = useCartStore()

  // Remove o #boot-splash (Lottie) quando o boot termina, com sucesso ou erro
  useEffect(() => {
    if (!loading) window.__hideBootSplash?.()
  }, [loading])

  useEffect(() => {
    // Link malformado é decidido aqui, sem rede: mandar um `_id` cortado para a
    // API só produz um 500 que não diz nada ao cliente. Ver src/lib/qrParams.ts
    const parsed = parseQrParams(window.location.search)
    if (!parsed.ok) {
      // O motivo fica no console para a casa descobrir que gerou QR errado
      console.error('QR Code inválido:', parsed.reason)
      setBootError(parsed.kind)
      setLoading(false)
      return
    }
    const { branchId, table, mode } = parsed
    setParams({ branchId, table, mode })

    ;(async () => {
      try {
        // Descarta respostas de API guardadas por versões anteriores do app
        await clearStaleApiCache()

        const branchRes = await api.getBranch(branchId)
        const rawBranch = (branchRes.data?.[0] ?? null) as Record<string, unknown> | null
        if (!rawBranch || !rawBranch['_id']) {
          setBootError('notFound')
          return
        }
        const companyId = rawBranch['company'] as string | undefined

        // ANTES de qualquer leitura de localStorage: as chaves de nome, CPF,
        // avatar, histórico e consentimento são prefixadas por company, e quem
        // monta a chave lê o escopo na hora. Definir depois faria a primeira
        // leitura cair na chave errada. Ver src/lib/storageScope.ts
        setStorageScope(companyId)
        // Carrinho de outro restaurante não sobrevive à troca de company
        useCartStore.getState().ensureCompanyScope(companyId)

        let rawCompany: Record<string, unknown> = {}
        if (companyId) {
          const cr = await api.getCompany(companyId)
          rawCompany = (cr.data?.[0] ?? {}) as Record<string, unknown>
        }
        const branchObj = rawBranch as unknown as import('./types').Branch
        // Recursos que o backend ainda não devolve — ver src/lib/mockSettings.ts
        branchObj.settingsWeb = applyMockSettings(branchObj.settingsWeb)

        // A branch pode só operar em mesa, ou só em balcão. QR com modo não
        // permitido cai no primeiro modo aceito — melhor que rodar num modo
        // que a casa não atende (ex: pedir "senha de balcão" onde não há balcão)
        // `allowedModes` vem do cadastro e pode trazer valor que este app não
        // implementa (`cartao`, previsto na Fase 2.6 do ROADMAP). Sem filtrar,
        // `allowed[0]` virava o modo interno e o app rodava num modo inexistente
        // **em silêncio** — nem erro, nem tela: só regra de pagamento e senha
        // erradas. Valor desconhecido é ignorado, e o modo do QR prevalece.
        let effectiveMode = mode
        const allowed = allowedModesOf(branchObj.settingsWeb)
        if (allowed.length > 0 && !allowed.includes(mode)) {
          effectiveMode = allowed[0]
          setParams({ branchId, table, mode: effectiveMode })
        }

        // A mesma configuração alimenta Totem e Cardápio (mesa só serve no
        // local, ver whereConsumeForMode). Se houver apenas
        // uma modalidade, aplica direto e não obriga o cliente a confirmar
        // uma escolha que a unidade não oferece.
        const consumptionOptions = whereConsumeForMode(effectiveMode, branchObj.settingsTotem)
        const cart = useCartStore.getState()
        if (!consumptionOptions.includes(cart.whereConsume)) {
          cart.setWhereConsume(consumptionOptions[0])
        }
        if (consumptionOptions.length === 1) {
          cart.setWhereConsumeAsked(true)
        }

        // Carrinho vencido é descartado agora, com o prazo da branch já em mão.
        // `sessionStorage` só morre quando a aba fecha, e aba de celular fica
        // semanas aberta: sem isso o cliente reabre o app dias depois com o
        // pedido montado aos preços de então.
        const dropped = useCartStore.getState().ensureFresh(
          branchObj.settingsWeb?.cartTtlMinutes,
        )
        if (dropped) {
          // Avisar importa: o cliente lembra que tinha itens no carrinho, e
          // vê-los sumir sem explicação parece defeito do app
          toast.info('Seu carrinho anterior expirou. Os preços podem ter mudado.')
        }
        const companyObj = rawCompany as unknown as import('./types').Company

        setBranch(branchObj)
        setCompany(companyObj)
        // Passa o settingsTotem inteiro: o painel já gravou a cor sob nomes
        // diferentes, e o fundo também mora aí.
        // Nome, ícone e cor do PWA por empresa — quem escaneia o QR da Bebelu
        // instala "Bebelu", não "Cardápio Digital"
        applyMenuIdentity(
          readMenuIdentity(
            rawCompany['settingsTotem'] as Record<string, unknown> | undefined,
            branchObj.settingsWeb as Record<string, unknown> | undefined,
            companyObj.name || branchObj.name,
          ),
        )

        applyCompanyTheme({
          ...(rawBranch['settingsTotem'] as Record<string, unknown> | undefined),
          ...(rawCompany['settingsTotem'] as Record<string, unknown> | undefined),
        })

        // Idiomas habilitados na branch (settingsWeb.languages)
        useLangStore.getState().initLanguages(
          branchLanguages(branchObj.settingsWeb as Record<string, unknown> | undefined),
        )

        // Inicializa analytics se o usuário já havia dado consentimento
        initAnalyticsIfConsented(rawBranch)

        const [catRes, prodRes, grpRes, grpCatRes, offRes, perRes] = await Promise.all([
          api.getCategories(branchId), api.getProducts(branchId),
          api.getComplementsGroups(branchId), api.getComplementsGroupsCategories(branchId),
          api.getOffers(branchId), api.getPeriods(branchId),
        ])

        const menu = buildMenuData(
          catRes.data as Record<string,unknown>[], prodRes.data as Record<string,unknown>[],
          grpRes.data as Record<string,unknown>[], grpCatRes.data as Record<string,unknown>[],
          offRes.data as Record<string,unknown>[], perRes.data as Record<string,unknown>[], branchId,
        )
        setMenuData({
          categories: menu.categories, products: menu.products,
          groups: menu.groups, groupCategories: menu.groupCategories,
          periods: menu.periods, offers: menu.offers,
        })
        setClosedReason(checkBranchOpen(branchObj, menu.periods))
        preloadMenuImages([
          ...catRes.data as Record<string,unknown>[],
          ...prodRes.data as Record<string,unknown>[],
        ])

        // Analytics: cardápio carregado
        Analytics.viewMenu(branchObj.name)
      } catch (err) {
        console.error('Boot error:', err)
        setBootError(classifyBootError(err))
      } finally {
        setLoading(false)
        setBooted(true)
      }
    })()
  }, [])

  if (loading) return <Splash />
  if (bootError) return <ErrorScreen kind={bootError} />
  if (closedReason) return <ClosedScreen reason={closedReason} periods={periods} branchName={branch?.name} />

  // Ordem de abertura: banner → idioma + local/viagem → cardápio.
  // A promoção vem primeiro porque é a única tela que o cliente pode pular;
  // as perguntas vêm depois, já com ele decidido a pedir.

  // Fonte: "Banner(s) cardápio" da Configuração da Franquia (company.bannerCardapio).
  // `settingsWeb.banners` da unidade, se vier, tem prioridade.
  const web = branch?.settingsWeb
  const uploaded: BranchBanner[] = (company?.bannerCardapio?.image ?? [])
    .filter((i) => i.active !== false && i.photo)
    .map((i, n) => ({ image: i.photo, seq: n }))
  const banners = web?.banners?.length ? web.banners : uploaded
  if (banners.length > 0 && !bannersSeen) {
    return (
      <BannerCarousel
        banners={banners}
        required={branch?.settingsWeb?.bannersRequired === true}
        onClose={() => setBannersSeen(true)}
      />
    )
  }

  // A escolha local/viagem muda preço e embalagem, então vem antes do cardápio.
  // A branch pode desligar com settingsWeb.askWhereConsume = false.
  const askWhereConsume = branch?.settingsWeb?.askWhereConsume !== false
  const appMode = params?.mode ?? 'mesa'
  const consumptionOptions = whereConsumeForMode(appMode, branch?.settingsTotem)
  if (askWhereConsume && consumptionOptions.length > 1 && !whereConsumeAsked) {
    return <WhereConsumePrompt
      allowed={consumptionOptions}
      mode={appMode}
      onDone={() => setWhereConsumeAsked(true)}
    />
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/produto/:id" element={<Col><ProductDetail /></Col>} />
        <Route path="/checkout" element={<Col><Checkout /></Col>} />
        <Route path="/confirmacao" element={<Col><Confirmation /></Col>} />
        <Route path="/totem" element={<Col><TotemHandoffPage /></Col>} />
        <Route path="/conta" element={<Col><TableBill /></Col>} />
        <Route path="/perfil" element={<Col><Profile /></Col>} />
        <Route path="/pedidos" element={<Col><OrderHistory /></Col>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
      <ConsentBanner />
      <ToastContainer />
    </>
  )
}

/**
 * Coluna de leitura das telas internas no PC. No celular ocupa a largura toda;
 * a Home tem layout próprio (grid largo) e não passa por aqui.
 */
function Col({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl">{children}</div>
}

// O splash visual é o #boot-splash do index.html (src/bootSplash.ts); aqui só
// seguramos a tela e o removemos quando o boot termina.
function Splash() {
  return <div className="min-h-screen" style={{ background: 'var(--bg-page)' }} />
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter><Boot /></BrowserRouter>
    </ErrorBoundary>
  )
}

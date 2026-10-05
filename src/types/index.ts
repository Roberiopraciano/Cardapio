// ─── Espelho fiel dos modelos Flutter ─────────────────────────────────────────

/** stock.active=false → sem controle, sempre disponível
 *  stock.active=true && currentQuantity>0 → em estoque
 *  stock.active=true && currentQuantity<=0 → ESGOTADO
 *  (CategoryFilterHelper.dart) */
export interface Stock {
  /** `false` = produto sem controle de estoque (não significa esgotado) */
  active: boolean
  currentQuantity: number
  /**
   * Chave de "marcar como esgotado" do painel — decisão manual do operador,
   * **independente** do controle de estoque.
   *
   * É comum vir `{ active: false, totemSoldOut: true }`: a casa não controla
   * quantidade daquele item, mas acabou hoje e alguém marcou na mão.
   */
  totemSoldOut?: boolean
  originalQuantity?: number
  minimalQuantity?: number
  lastStockReposition?: number
  dateLastReposition?: string
}

/** period.period = { "monday": [{from:"08:00",to:"22:00"}], ... }
 *  (CategoryFilterHelper._checkValidPeriod) */
export interface Period {
  _id: string
  branch: string
  title: string
  period: Record<string, Array<{ from: string; to: string }>>
}

export interface ComplementItem {
  _id: string
  name: string
  price: number
  offerprice?: number
  code?: string
  barCode?: string
  active: boolean
  quantity: number
  isPackaging?: boolean
  image?: string
  images?: Record<string, unknown>
  staticImage?: Array<{ photo: string }>
  sliderHeader?: { image: Array<{ photo: string; active?: boolean }> }
  stock?: Stock | null
  /** Subcategoria à qual o item pertence dentro do grupo ("Refrigerantes"). */
  complementGroupCategoryID?: string
}

export interface ComplementsGroup {
  _id: string
  title: string
  items: string[]
  products: ComplementItem[]
  minQuantity: number
  maxQuantity: number
  obrigatory: boolean
  ingredients: boolean
  isTakeawayPackaging: boolean
  autoAdd: boolean
  settingsTotem?: Record<string, unknown>
}

/**
 * Subcategoria de complemento — ex: "Refrigerantes", "Sucos", "Milkshakes".
 *
 * A API devolve `name` (não `title`) e **não** traz lista de grupos. O vínculo
 * é ao contrário do que parece: cada *item* carrega `complementGroupCategory`
 * apontando para cá. Então a hierarquia real é
 * grupo ("Escolha o sabor da sua bebida.") → subcategorias → itens.
 */
export interface ComplementsGroupCategory {
  _id: string
  name: string
  seq: number
  active: boolean
}

export interface Offer {
  _id: string
  title: string
  triggers: Record<string, unknown>
  rules: Record<string, unknown>
  rewards: {
    discountType?: { type: 1 | 2; value: number }
  }
  disabled: boolean
  period?: Record<string, unknown>
  match?: string
  /** Desconto cotado pela API para o carrinho atual (nunca é autoridade final). */
  validatedDiscount?: number
  /** Subtotal usado na cotação; qualquer mudança exige nova validação. */
  validatedSubtotal?: number
}

/** Status calculado para exibição no card */
export type ProductStatus = 'available' | 'out_of_stock' | 'inactive' | 'unavailable_period'

export interface Product {
  _id: string
  name: string
  description?: string
  category: string
  price: number
  offerprice?: number
  originalPrice?: number
  active: boolean
  seq: number
  stock?: Stock | null
  code?: string
  barCode?: string
  peopleCount: number
  relatedPeriod?: string
  locationTypes?: number[]
  complementsGroups: ComplementsGroup[]
  complementsId: string[]
  complementGroupCategoryID?: string
  complementGroupCategory?: ComplementsGroupCategory
  settingsTotem?: Record<string, unknown>
  updatedAt?: string
  image: string
  images?: Record<string, unknown>
  staticImage?: Array<{ photo: string }>
  sliderHeader?: { image: Array<{ photo: string; active?: boolean }> }
  suggestionCategory?: string
  customSuggestions?: string[]
  productOffer?: Offer
  /** `{ en: { name, description }, es: {...} }` — pode vir `[]` se nunca traduzido */
  translations?: unknown
}

export interface Category {
  _id: string
  name: string
  image: string
  seq: number
  staticImage?: Array<{ photo: string }>
  categoriaTotemImg?: string
  products: Product[]
  disabled?: boolean
  translations?: unknown
}

/** Banner promocional exibido no início da sessão. */
export interface BranchBanner {
  /** URL da imagem. Sem ela o banner é ignorado. */
  image: string
  title?: string
  subtitle?: string
  /** Destino ao tocar. Interno (`/produto/<id>`) ou externo (`https://…`). */
  link?: string
  /** Rótulo do botão quando há link. Padrão: "Ver". */
  linkLabel?: string
  active?: boolean
  seq?: number
}

export interface Branch {
  _id: string
  /** Campo legado derivado do Mongo; não usar no acompanhamento de pedidos. */
  guidBranch?: string
  name: string
  phone: string
  settingsTotem: Record<string, unknown>
  settingsWeb?: {
    simpleAuth?: string
    businessHours?: Array<{ open: string; close: string; label: string }>
    metaPixelId?: string
    gaId?: string

    /**
     * Comanda por cliente dentro da mesa.
     *
     * Desligado (padrão): a mesa é uma conta só.
     * Ligado: cada pessoa informa a sua comanda e a conta agrupa por ela — a
     * mesma mesa pode ter várias comandas, ou todas na mesma.
     */
    comandaEnabled?: boolean
    /** Rótulo exibido ("Comanda", "Cartão", "Ficha"…). Padrão: "Comanda". */
    comandaLabel?: string
    /** Se true, não deixa enviar pedido sem informar a comanda. */
    comandaRequired?: boolean

    /**
     * Tela de conta (`/conta`). Padrão: ligada.
     * Desligar quando a casa não quer o cliente vendo o consumo pelo celular —
     * a aba some e a rota redireciona para o cardápio.
     */
    billEnabled?: boolean
    /**
     * Visão "Detalhada" da conta (por pedido, com quem lançou e horário).
     * Padrão: ligada. Desligada, sobra só a visão resumida — útil quando a casa
     * não quer expor quem pediu o quê na mesa.
     */
    billDetailedEnabled?: boolean

    /** Pergunta "comer aqui ou levar" no início. Padrão: ligada. */
    askWhereConsume?: boolean
    /**
     * Botão de chamar garçom no cabeçalho (só em `mode=mesa`).
     * Padrão: **desligado** — depende de `POST api/waiter-call` existir e de a
     * casa ter processo para atender a chamada.
     */
    waiterCallEnabled?: boolean
    /** Idiomas do cardápio, ex: ["pt","es","en"] */
    languages?: string[]

    /**
     * Modos que esta branch aceita: `["mesa"]`, `["balcao"]` ou os dois.
     * Ausente = ambos. Se o QR trouxer um modo não permitido, o app usa o
     * primeiro da lista em vez de operar num modo que a casa não suporta.
     */
    allowedModes?: Array<'mesa' | 'balcao'>

    /** Libera o uso de cupons nesta unidade. Ausente ou false mantém desativado. */
    couponsEnabled?: boolean

    /**
     * Banners do início da sessão, em carrossel. Ausente ou vazio = sem banner.
     * Aparecem uma vez por sessão, depois da escolha local/viagem.
     */
    banners?: BranchBanner[]
    /**
     * `true` esconde a saída até o cliente passar por todos os banners.
     * Padrão: `false` — quem está com fome não deveria ser obrigado a ver
     * publicidade para chegar ao cardápio.
     */
    bannersRequired?: boolean

    /**
     * Exige nome e telefone para **enviar pedido** e **ver a conta**.
     * Navegar o cardápio segue livre, como visitante. Padrão: ligado.
     */
    requireIdentification?: boolean

    /**
     * Identidade do cardápio (nome/ícone/cor do PWA).
     * A branch sobrescreve a company — uma unidade pode ter nome próprio.
     * Ver `lib/pwaIdentity.ts` e CONFIGURACAO.md → "Um PWA por empresa".
     */
    menuName?: string
    menuShortName?: string
    menuDescription?: string
    pwaIcon192?: string
    pwaIcon512?: string
    pwaIconApple?: string

    /** URL da política de privacidade, linkada no banner LGPD. */
    privacyPolicyUrl?: string
    /** E-mail do encarregado de dados, para pedidos de exclusão (LGPD art. 18). */
    privacyContactEmail?: string
    /** @deprecated A senha do balcão agora possui sempre 5 caracteres alfanuméricos. */
    passwordDigits?: number

    /**
     * Opção de pagamento "Pagar no totem" no checkout. Padrão: desligado —
     * oferecer o totem numa loja sem totem manda o cliente procurar uma
     * máquina que não existe. Ver `pages/TotemHandoff.tsx`.
     */
    totemPaymentEnabled?: boolean

    /**
     * Validade do carrinho em minutos. Padrão: 240 (4h).
     *
     * `sessionStorage` só morre com a aba, e aba de celular fica semanas aberta:
     * sem prazo, o cliente reabre dias depois com o pedido montado aos preços de
     * então. Vencido, o carrinho e a senha do pedido são descartados.
     *
     * Casa com serviço que atravessa a meia-noite (bar até 3h) pode aumentar.
     * **Não** existe regra de "virou o dia" de propósito: ela cortaria o pedido
     * de quem pediu às 23h50 e voltou 00h30, no mesmo atendimento.
     */
    cartTtlMinutes?: number

    /**
     * Interruptor de pânico: pausa pedidos sem mexer no horário de funcionamento.
     * **Ausente = aceitando** — branch sem o campo continua funcionando.
     *
     * O `Checkout` reconsulta a branch antes de enviar: o boot checou o horário
     * quando o cliente abriu o cardápio, e isso pode ter sido há duas horas.
     */
    acceptingOrders?: boolean
    /** Texto exibido quando `acceptingOrders: false`. Tem padrão. */
    notAcceptingOrdersMessage?: string

    /**
     * A casa **publica** status de pedido? (KDS, PDV ou app do garçom movendo
     * `pending → in_progress → ready`). Ausente = **desligado**.
     *
     * O padrão desligado não é conservadorismo: status que ninguém move é pior
     * que status nenhum. Sem KDS, o cliente fica olhando "Aguardando cozinha"
     * indefinidamente e conclui que o pedido não chegou — e chama o garçom para
     * conferir, que é exatamente o trabalho que o cardápio deveria poupar.
     *
     * Desligado, o app não faz poll nem promete acompanhamento: mostra a senha e
     * a instrução de retirada, que são verdade em qualquer operação.
     */
    orderStatusEnabled?: boolean

    /**
     * Painel de senhas na nuvem: a casa tem tela chamando senha?
     *
     * Separado de `orderStatusEnabled` porque são operações distintas — existe
     * casa com KDS e sem painel (garçom leva à mesa), e casa com painel de senha
     * alimentado à mão, sem KDS.
     *
     * Ligado, o app oferece o link do portal (`orderStatusPortalUrl`) e ajusta o
     * texto para "acompanhe no painel" em vez de "aguarde ser chamado".
     */
    passwordPanelEnabled?: boolean
    /** URL do portal público de consulta de senha. Ver BACKEND.md. */
    orderStatusPortalUrl?: string
    /** Placeholders `{branch}` e `{code}`. Padrão: `?branch={branch}&code={code}`. */
    orderStatusPortalQuery?: string

    /** Pede e-mail do cliente no checkout. Padrão: desligado. */
    askEmail?: boolean
    /**
     * Botão "Continuar com o Google" na identificação.
     * Preenche **nome e e-mail** — o Google não devolve telefone.
     * Exige também `VITE_GOOGLE_CLIENT_ID` no build.
     */
    googleSignInEnabled?: boolean

    [key: string]: unknown
  }
  settingsApp?: Record<string, unknown>
  paymentMethodsDefault: Record<string, unknown>
  paymentMethods: unknown[]
  location?: Record<string, unknown>
  deliveryArea?: Record<string, unknown>
  uiduIntegration?: Record<string, unknown>
  status?: string
  active?: boolean
}

export interface Company {
  _id: string
  name: string
  slug?: string
  settingsTotem?: {
    primaryColor?: string
    logo?: string
    [key: string]: unknown
  }
}

// ─── Carrinho ─────────────────────────────────────────────────────────────────

/** WhereConsume (buying_cicle_enums.dart) */
export type WhereConsume = 'OnLocal' | 'OutsideLocal'

export interface CartComplement {
  _id: string
  name: string
  price: number
  quantity: number
  groupId: string
  groupName: string
  isPackaging?: boolean
  unitFraction?: number
}

export interface CartItem {
  product: Product
  quantity: number
  note: string
  addedComplements: CartComplement[]
  subTotal: number
}

// ─── Payload do pedido ─────────────────────────────────────────────────────────

export interface OrderPayload {
  branch: string
  simpleAuth: string
  consumptioncode: string
  consumptionint: number
  locationType: number
  amount: number
  subtotal: number
  total: number
  totemClientName: string
  phone: string
  cpfCustomer?: string
  note?: string
  paymentMethod: { type: string; kind?: string; label?: string }
  additionalInfo?: { modality: string; whereConsume: string }
  items: OrderItem[]
  origin: 'cardapio'
}

export interface OrderItem {
  product: string
  name: string
  originalPrice: number
  amount: number
  price: number
  quantity: number
  note: string
  complements: OrderComplementGroup[]
}

export interface OrderComplementGroup {
  _id: string
  name: string
  items: OrderComplementItem[]
  fractionalItems?: boolean
  fractions?: number
}

export interface OrderComplementItem {
  _id: string
  name: string
  price: number
  quantity: number
  pdvCode?: string
  unitFraction?: number
}

// ─── App ──────────────────────────────────────────────────────────────────────

export type AppMode = 'mesa' | 'balcao'
export type ClosedReason = 'outsideHours' | 'branchInactive' | null

export interface URLParams {
  branchId: string
  table: string
  mode: AppMode
}

export interface ClientInfo {
  name: string
  phone: string
  cpf: string
  email?: string
}

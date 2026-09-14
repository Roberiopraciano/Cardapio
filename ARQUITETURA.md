# Arquitetura — Cardápio Digital

## Visão Geral

```
QR Code → Browser (React PWA) → Laravel API (existente)
                                      ↓
                              KDS / Cozinha da branch
```

O app é uma **SPA React PWA** completamente estática — nenhum servidor Node em produção. Apenas arquivos HTML/JS/CSS servidos por qualquer CDN ou servidor estático (Nginx, S3, Vercel, etc.).

---

## Fluxo de Boot

```
1. parseQrParams(location.search) → valida antes de qualquer requisição
   ↳ inválido: nem chega na rede, vai direto para a leitura de QR Code
2. GET api/branches (branch + simpleAuth + pixel IDs)
3. GET api/company (logo, primaryColor)
4. applyCompanyTheme(primaryColor) → CSS var --color-brand
5. initAnalyticsIfConsented() → (se já consentiu antes)
6. Promise.all(6 endpoints em paralelo):
   - GET api/product-categories
   - GET api/products
   - GET api/complements-groups
   - GET api/complements-groups-categories
   - GET api/offers
   - GET api/periods
7. buildMenuData() → parse + linkAllDataStructures()
   - Associa products → categories
   - Associa complementItems → complementsGroups
   - Associa complementsGroups → products
   - Vincula productOffer → products
8. checkBranchOpen() → null | 'outsideHours' | 'branchInactive'
9. preloadMenuImages() → Cache API (fire & forget)
10. Renderiza o primeiro portão que se aplicar (ver "Sequência de abertura")
```

### Sequência de abertura

O `Boot` não vai direto para as rotas: existe uma fila de portões, e o **primeiro
que se aplica** ganha a tela inteira. A ordem é deliberada.

```
loading            → Splash
bootError          → ErrorScreen  (link inválido, sem rede, servidor fora)
closedReason       → ClosedScreen (fora do horário, branch inativa)
banners && !visto  → BannerCarousel
askWhereConsume    → WhereConsumePrompt  (idioma + comer aqui/levar)
                   → <Routes> + TabBar + ConsentBanner + ToastContainer
```

**Por que nesta ordem:**

| Portão | Antes de quê, e por quê |
|---|---|
| `ClosedScreen` | antes do banner — anunciar promoção com a loja fechada é convite frustrado |
| `BannerCarousel` | antes das perguntas — é a única tela que o cliente pode pular; as perguntas vêm depois, já com ele decidido a pedir |
| `WhereConsumePrompt` | antes do cardápio — comer aqui ou levar muda preço e embalagem, então não pode ser decidido depois de montar o carrinho |

`bannersSeen` e `whereConsumeAsked` moram no `cartStore` (`sessionStorage`): o
portão vale por **sessão**, não por carregamento. Recarregar a página no meio do
pedido não faz o cliente responder tudo de novo.

### Banners de abertura (`BannerCarousel`)

Cadastro em `branch.settingsWeb.banners` — formato completo em `BACKEND.md`.

O app descarta `active: false` e banner sem `image`, ordena por `seq`, e **não
renderiza a tela** se a lista ficar vazia.

**É um wizard, não um slideshow.** Avanço explícito por botão "Próximo", swipe ou
pontinho, com transição `translateX` numa trilha horizontal. Autoplay de 6s que
**para definitivamente** quando o cliente avança por conta própria.

Dois bugs moraram aqui, e explicam o desenho atual:

1. **Fade em vez de slide** — a versão anterior trocava o conteúdo no mesmo nó.
   Sem deslocamento, a troca parecia falha de renderização.
2. **Autoplay que travava no primeiro banner** — um `onPointerDown` no contêiner
   inteiro marcava "pausado" ao primeiro toque em qualquer lugar, inclusive num
   scroll, e nada despausava. Os pontinhos indicavam 3 banners e o cliente via 1.

Com `bannersRequired: true`, a saída só libera depois de o cliente ter alcançado o
último slide (`seenMax >= last`) — e é `seenMax`, não `index`, para voltar um
slide não retirar a permissão já conquistada.

### Validação do link (`src/lib/qrParams.ts`)

O link do cardápio nunca é digitado: ele nasce do QR Code gerado pelo painel. Então **link malformado não é erro do cliente** — é QR errado, link cortado por app de mensagem, ou URL colada pela metade. O cliente não tem o que consertar, e a única saída é reescanear.

Isso é decidido **antes da primeira requisição**, porque a rede não tem como responder melhor:

| Regra | Motivo |
|---|---|
| `branch` presente | sem ela não existe restaurante |
| `branch` = 24 hex (ObjectId) | um `_id` cortado faz o Mongo estourar → 500 |
| `mode` ∈ `mesa` \| `balcao` (tolera caixa/espaço) | modo desconhecido troca regra de pagamento e senha, e o cliente só descobre no fim |
| `mode=mesa` exige `table` | pedido de salão sem mesa não tem para onde ir |
| `table` = letra/número/espaço/`-`/`_`, até 32 | o valor vai no payload e na comanda impressa |

O motivo exato vai para o `console.error` — é assim que a casa descobre que gerou QR Code errado. Para o cliente, a mensagem nunca cita `objectId`: só diz que o link está incompleto.

### Camadas de erro

Tela branca é bug: o cliente está de pé no restaurante e não vai abrir o console.

```
ErrorBoundary (App.tsx, envolve tudo)     ← erro de render em qualquer lugar
  └─ ErrorScreen (Boot)                    ← 5 motivos, 3 saídas distintas
       └─ Guards de página                 ← produto sumiu, carrinho vazio
```

O que define a tela **não é a falha, é a saída** que o cliente tem:

| Condição | Tela | Saída oferecida |
|---|---|---|
| URL sem `?branch=` | `noBranch` | leitura de QR Code (tela inteira) |
| `branch`/`mode`/`table` malformados | `badLink` | leitura de QR Code (tela inteira) |
| `GET api/branches` vazio, ou 400/404/422 | `notFound` | leitura de QR Code (tela inteira) |
| `ApiError.status === 0` (rede, CORS, timeout 15s) | `network` | "tentar novamente" |
| 5xx, ou exceção inesperada no boot | `server` | "tentar novamente" + chamar atendente |

**Por que cinco e não três**: o boot classificava toda falha como `network`. Um QR Code cortado aparecia como *"Sem conexão com o cardápio — verifique sua internet"*, o que é falso **e** joga no cliente a culpa por um problema que está no adesivo da mesa — ele fica reiniciando o Wi-Fi do restaurante para consertar um QR torto. `ApiError` (em `api/client.ts`) carrega o status justamente para essa decisão:

- `status: 0` — a requisição **não chegou**. É o único caso em que "verifique sua internet" é verdade.
- `400/404/422` — o servidor **recusou o identificador**: o link não aponta para nada. Reescanear.
- `5xx` — o celular chegou ao servidor e **o outro lado falhou**. Não pede para conferir a internet; repetir pode funcionar, mas quem resolve é a casa.

**Regra**: nenhum hook depois de um early return; nenhum `navigate()` durante o render.

### Leitura de QR Code (`QrScanner`)

O scanner valida com o **mesmo** `parseQrParams` antes de navegar. Sem isso, ler um QR torto recarregava a página só para cair na tela de erro — e de lá o cliente voltava a escanear o mesmo QR torto, em círculo.

Três recusas, com tratamentos diferentes:

| Caso | Estado | Comportamento |
|---|---|---|
| QR que não é URL (Wi-Fi, vCard, texto) | — | segue lendo, sem mensagem |
| URL de outro domínio | `foreign` | fecha a câmera e avisa — é o vetor de golpe de QR |
| Domínio certo, parâmetros inválidos | `invalid` | avisa e **continua lendo** |

QR que não serve não desliga a câmera: o cliente ainda vai apontar para o certo. Por isso o loop de leitura fica num ref (`tickRef`), acessível de fora do efeito.

---

## Camadas

### 1. API Layer (`src/api/client.ts`)

Wrapper fino sobre `fetch`. Todos os GETs são públicos (sem token). O POST de pedido usa `simpleAuth` no body.

```
GET  api/branches
GET  api/company
GET  api/product-categories    ?branch=ID&locationTypes[$in][]=8
GET  api/products              ?branch=ID&active=true
GET  api/complements-groups    ?branch=ID&locationTypes[$in][]=8
GET  api/complements-groups-categories
GET  api/periods
GET  api/offers
POST api/orders                body: { simpleAuth, branch, items, ... }
```

Todo GET tem `cache: 'no-store'` e teto de 15s (`AbortSignal.timeout`) — preço e estoque mudam durante o serviço, e rede de restaurante trava sem devolver erro.

**Duas classes de erro, pelo mesmo motivo**: `fetch` só rejeita por rede/CORS/timeout, **nunca** por status HTTP. Sem preservar o status, "servidor recusou" e "não chegou ao servidor" viravam a mesma tela.

| Classe | Onde | Status `0` significa |
|---|---|---|
| `ApiError` | GETs do cardápio | requisição não chegou → decide `network` vs `notFound` vs `server` |
| `OrderError` | `POST api/orders` | idem, e expõe `clientMessage` por status |

### 2. Data Layer (`src/lib/dataLinker.ts`)

Parseia o JSON bruto da API em tipos TypeScript e vincula as referências.

Espelho exato de `socket.dart` (handleCategories, handleProducts, linkAllDataStructures).

Fluxo:
```
rawJson[] → parse*() → Product[] / Category[] / ComplementsGroup[]
                → linkAllDataStructures()
                → categories[].products[] preenchidos
                → groups[].products[] preenchidos
                → products[].complementsGroups[] preenchidos
                → products[].productOffer linkada
```

### 3. Business Logic

| Arquivo | Responsabilidade | Espelho Flutter |
|---|---|---|
| `businessPeriod.ts` | Branch aberta/fechada, fase manhã/noite, countdown | `closed_screen.dart` |
| `stock.ts` | isOutOfStock, checkValidPeriod, getPeriodLabel, findCouponByCode | `CategoryFilterHelper.dart` |
| `qrParams.ts` | Valida `?branch=/table=/mode=` antes de qualquer requisição | — |
| `pricing.ts` | effectivePrice, getCardPrice, includedAllowance, groupCharge, **calcUnitPrice**, fracionado, tmProduto | `product.dart` |
| `gerador_codigo.ts` | consumptioncode (híbrido tempo+aleatório), consumptionint (500–999) | `gerador_codigo.dart` |
| `imageCache.ts` | extractImageUrl, preloadMenuImages, getCachedUrl via Cache API | `image_cacher.dart` |
| `theme.ts` | applyCompanyTheme → CSS var --color-brand | settings Flutter |
| `client_storage.ts` | nome/fone/CPF em localStorage | — |
| `consent.ts` | LGPD granted/denied em localStorage | — |
| `analytics.ts` | Meta Pixel + GA4 unificados, checa consentimento | — |
| `i18n.ts` | idiomas da branch, dicionário pt/es/en | — |
| `useTranslatedContent.ts` | nome/descrição traduzidos de produto e categoria | — |
| `noteTags.ts` | `customSuggestions` como atalho no campo de observação | — |
| `orderAuthor.ts` | decide se o pedido foi do cliente ou do atendente (`origin`) | — |
| `orderHistory.ts` | pedidos guardados no aparelho | — |
| `identity.ts` / `avatar.ts` | identificação e foto do cliente | — |
| `pwaIdentity.ts` | nome, ícone e cor do PWA por empresa | — |
| `googleSignIn.ts` | Continuar com o Google (nome e e-mail) | — |
| `storageScope.ts` | prefixo de `localStorage` por company + migração do legado | — |
| `billFormat.ts` | quantidade fracionada (`0,412 kg`) e soma segura em float | — |
| `statusPanel.ts` | habilitação de KDS/painel, `statusChip`, URL do portal | — |
| `paymentLabel.ts` | selo de pagamento — inclui o estado "não sabemos" | — |
| `mockBill/History/Settings.ts` | **mocks ligados** — desligar antes de produção | — |

> **Horário é sempre local.** `isPeriodOpen` compara minutos desde 00:00
> (`getHours()*60 + getMinutes()`) e é a única fonte da verdade — `checkValidPeriod`
> em `stock.ts` delega para ela. Nunca montar a data de um slot via `toISOString()`:
> em GMT-3 o UTC vira o dia às 21h e tudo aparece fechado. Slots com `to < from`
> atravessam a meia-noite e são tratados olhando também os slots de ontem.

### 4. State Management (Zustand)

**`appStore`** — estado global, em memória (sem persistência):
```
params: URLParams          ← ?branch= &table= &mode=
branch: Branch
company: Company
categories: Category[]     ← com products[] preenchidos
products: Product[]        ← todos os produtos
groups: ComplementsGroup[]
periods: Period[]
offers: Offer[]
loading / booted / closedReason
```

**`cartStore`** — carrinho, persistido em `sessionStorage`:
```
items: CartItem[]
whereConsume: OnLocal | OutsideLocal
consumptioncode / consumptionint  ← gerados na 1ª adição, não por item
comanda                           ← agrupa a conta dentro da mesa
orderNote
clientName / clientPhone / clientCpf  ← partialize fora (vai ao localStorage)
appliedCoupon / couponCode
bannersSeen / whereConsumeAsked    ← portões de abertura, valem por sessão
```

> **Duas persistências no mesmo store, de propósito.** O carrinho é da *visita*
> (`sessionStorage`): fechar a aba e voltar amanhã não deve ressuscitar pedido
> velho. Nome, telefone e CPF são da *pessoa* (`localStorage` via `partialize`):
> quem já se identificou não digita de novo na próxima visita.

### Escopo por company e validade (`storageScope.ts`)

Duas defesas contra dado de uma visita contaminando outra.

**1. Prefixo por company.** Todas as companies servidas pelo mesmo domínio
dividiam o mesmo `localStorage`: o CPF digitado no restaurante A ficava legível
para a página do B. O filtro por branch na tela de histórico é escolha de
exibição, não isolamento — o dado estava lá.

```
cardapio_client  →  cardapio_client__c:6531…
```

`setStorageScope(companyId)` roda no boot, **antes da primeira leitura**. Por isso
nenhum módulo monta a chave no topo do arquivo: todos chamam `scopedKey()` na hora
de ler ou gravar, senão pegariam o escopo vazio.

| Chave | Prefixada | Migra o dado global antigo |
|---|---|---|
| `cardapio_client` (nome, fone, CPF, e-mail) | ✅ | ✅ uma vez |
| `cardapio_avatar` | ✅ | ✅ uma vez |
| `cardapio_order_history` | ✅ | ✅ uma vez |
| `cardapio_consent` | ✅ | ❌ **nunca** |
| `cardapio_lang` | ❌ global | — |

**A migração apaga o legado ao adotar.** Dado global não tem company de origem;
adotá-lo em *todas* reproduziria o vazamento que o prefixo veio consertar. Apagando
na primeira adoção, ele vai para uma company só.

**Consentimento não migra, e não herda de outra company.** Consentir é ato dirigido
a um controlador: aceitar o rastreio do restaurante A não autoriza o do B, ainda
que o app seja o mesmo. Herdar o "aceito" ligaria o Pixel de uma empresa que o
cliente nunca autorizou — e ele não veria banner algum para descobrir. O custo é
responder uma vez por empresa, e é o custo certo.

**Idioma fica global de propósito**: a pessoa fala espanhol independentemente do
restaurante, e não é dado pessoal.

**2. Validade (`ensureFresh`).** `sessionStorage` só morre quando a aba fecha — e
aba de celular fica semanas aberta. Sem prazo, o cliente reabre dias depois com o
pedido montado **aos preços de então**.

`touchedAt` é atualizado em toda mutação; no boot, carrinho mais velho que
`settingsWeb.cartTtlMinutes` (padrão 240) é descartado junto com a senha do
pedido — a de ontem cairia numa comanda já fechada e paga. O cliente é avisado por
toast: itens sumirem sem explicação parece defeito.

Relógio que anda para trás (`age < 0`) também descarta: sem saber a idade real, o
seguro é o preço novo.

> **Não há regra de "virou o dia", de propósito.** Ela cortaria quem pediu às
> 23h50 e voltou às 00h30 — o mesmo atendimento que `businessPeriod` já trata como
> serviço único (slot `to < from`). Casa que atravessa a madrugada aumenta o TTL.

**3. Troca de company (`ensureCompanyScope`).** Escanear o QR de outro restaurante
recarrega a página, e `sessionStorage` sobrevive ao reload: o carrinho anterior
continuava lá, com produtos que não existem no cardápio novo. Prefixar guardaria
**dois** carrinhos; aqui o certo é descartar — ninguém retoma o pedido do
restaurante que já deixou. Os portões de abertura também são zerados: banner e
local/viagem são da casa, e a nova faz as próprias perguntas.

**`langStore`** — idioma escolhido e idiomas habilitados na branch.
**`toastStore`** — fila de toasts.

### 5. Componentes

**Portões de abertura** (ver "Sequência de abertura"):
```
BannerCarousel       ← wizard com slide, autoplay 6s que para no 1º toque do cliente
WhereConsumePrompt   ← idioma + comer aqui/levar, na tela inicial
ClosedScreen         ← manhã/noite + countdown
ErrorScreen          ← 5 motivos de boot → 3 saídas (ver "Camadas de erro")
ScanScreen           ← leitura de QR em tela cheia, câmera abre sozinha
QrScanner            ← BarcodeDetector nativo + fallback jsQR, valida antes de navegar
```

**Cardápio e pedido**:
```
ProductCard          ← piso do card + badges status/oferta/período
ComplementGroup      ← radio / checkbox+counter / fracionado + subcategorias
CartDrawer           ← bottom sheet com editar/remover
ImageWithFallback    ← Cache API + skeleton + fallback
SkeletonLoader       ← shimmer nas categorias e grid
NpsRating            ← avaliação pós-pedido
```

**Interface e infraestrutura**:
```
ErrorBoundary        ← class component, anteparo de erro de render
TabBar               ← Pedido / Conta / Home / Perfil, seleção estilo dock
HeaderButton         ← voltar e refresh padronizados em todas as telas
Icon                 ← nomes semânticos sobre FontAwesome
Flag                 ← bandeiras em SVG inline (emoji não renderiza no Windows)
LanguagePicker       ← troca de idioma no cabeçalho
IdentifyGate         ← exige nome/telefone para pedir e ver conta
GoogleSignInButton   ← preenche nome e e-mail (não devolve telefone)
AvatarPicker         ← foto do perfil, redimensionada localmente
ConfirmModal         ← confirmação com Lottie (substituiu window.confirm)
LottieBox            ← lazy-load do lottie-web, fora do chunk inicial
ConsentBanner        ← LGPD fixed bottom
ToastContainer       ← fila de toasts (validação, status do pedido)
ImageCarousel        ← não usado atualmente
```

### 6. Páginas

```
Home           → tabs categorias (filtram) → grid → busca sem acento → CartDrawer FAB
ProductDetail  → hero → complementos → obs + sugestões → qty → add/update
Checkout       → itens → cupom (desabilitado) → obs geral → identificação → submit
Confirmation   → senha grande → status por polling → NPS
TableBill      → conta resumida (padrão) / detalhada com filtro por pessoa
Profile        → dados do cliente, avatar, idioma, consentimento LGPD
OrderHistory   → pedidos guardados no aparelho
```

---

## Precificação — o piso é um número só

Regra única, e a que mais custou para chegar aqui:

```
piso   = effectivePrice(produto) + Σ includedAllowance(grupo)     ← getCardPrice
preço  = piso + Σ groupCharge(grupo, escolhas)                    ← calcUnitPrice
```

**A partir do piso só entram acréscimos, nunca descontos.**

| Função | Responde |
|---|---|
| `effectivePrice` | preço do produto com oferta aplicada |
| `includedAllowance(grupo)` | quanto de complemento o piso **já cobre** naquele grupo |
| `getCardPrice` | o piso — número do grid **e** do cabeçalho do produto |
| `groupCharge(grupo, escolhas)` | o que passa da franquia |
| `calcUnitPrice(produto, escolhas)` | preço de 1 unidade — **porta única** |

### O que "incluso" significa

Em grupo obrigatório, `includedAllowance` = `mais barato × minQuantity`. O piso embute isso, então escolher justamente o item mais barato **não muda o preço** — é o que a etiqueta "incluso" promete. Trocar a Coca 300ml (R$6,50) pela 500ml (R$8,50) acrescenta R$2,00.

Franquia é **do grupo, não de cada unidade**. Num grupo obrigatório "escolha 1, até 3", descontar o mais barato de cada escolha deixava o cliente levar 3 refrigerantes pelo preço de 1.

### ⚠️ A divergência que morava aqui

Duas funções discordavam sobre o que o preço base contém:

| | Combo delícia 2 (base R$29,40, bebida R$6,50) |
|---|---|
| `getCardPrice` — somava a franquia | **R$35,90** (grid) |
| subtotal do carrinho — partia do base cru **e ainda descontava** o mais barato | **R$29,40** (cobrado) |

O card anunciava R$35,90, a tela do produto abria em R$29,40 e subia para R$35,90 quando o cliente marcava a bebida — como se o "incluso" custasse dinheiro. **A bebida saía de graça duas vezes: R$6,50 de receita por combo vendido.**

Hoje `includedAllowance` é a dobradiça (quem soma e quem desconta leem dela) e `calcUnitPrice` é a única porta. Divergir exigiria mudar as duas.

### Grid sem "a partir de"

O card mostra só o preço. "A partir de" sugeria um mínimo teórico — e, pior, o produto abria num número **menor** que o anunciado, o que contradizia o próprio rótulo.

### Limitação conhecida

Em grupo obrigatório que aceita mais de uma escolha (`minQuantity: 1, maxQuantity: 3`), a etiqueta da 2ª unidade ainda diz "incluso", mas ela é cobrada — a franquia cobre só `minQuantity`. O total está certo; a etiqueta é por item e não sabe quantos foram marcados. Some quando existir `rules.maxPerItem` (Fase 2.5 do `ROADMAP.md`).

---

## Fluxo de Dados — Adição ao Carrinho

O botão "Adicionar" faz mais que empilhar item: ele é o ponto onde a validação dos grupos obrigatórios acontece e onde os códigos do pedido nascem.

```
ProductDetail — handleSubmit()
  ↓ validate()  ← 1º grupo pendente (isGroupPending) interrompe a varredura
  │   └─ ao achar: revealGroup(g._id)  ← expande o grupo + marca invalidGroup
  │                devolve "Selecione pelo menos N em «título»"
  │      ↳ handleSubmit: setError(msg) + toast.error(msg)
  │                      ↳ RETORNA, não adiciona
  ↓ initCodes(mode, table, settingsWeb.passwordDigits)
  │   ↳ só gera na 1ª adição — a senha é do atendimento, não do item
  ↓ buildCartComplements(selectedByGroup) → CartComplement[]
  ↓ isEditMode ? updateItem(editIndex, …) : addItem(product, …)
  │                                          ↳ se whereConsume=OutsideLocal,
  │                                            injeta embalagem de viagem
  ↓ Analytics.addToCart(product, total, qty)   ← só em adição, não em edição
  ↓ navigate(-1)
```

**Rótulo do botão**: `isEditMode ? 'Atualizar' : qty > 1 ? 'Adicionar N×' : 'Adicionar'`.

Dois detalhes que não são óbvios pelo código:

- **O toast existe porque o erro embaixo do botão passa despercebido** com a página rolada. Sem ele o cliente tocava "Adicionar" e nada parecia acontecer.
- **`initCodes` roda antes do ramo de edição**, e é idempotente: gera senha só se ainda não houver. A senha pertence ao atendimento, não ao item — dois itens no mesmo carrinho compartilham `consumptioncode`.

### Avanço automático entre grupos

Ao completar um grupo obrigatório, `advanceFrom(groupId)` colapsa o atual e abre o **próximo obrigatório ainda pendente**.

Só dispara a partir de grupo obrigatório, e por um motivo: em grupo opcional o cliente pode querer adicionar mais de um item, e fechar o grupo embaixo do dedo dele tira a escolha que ele ainda estava fazendo. Em grupo obrigatório, atingir o mínimo é sinal claro de que aquela pergunta foi respondida.

### Preço no cabeçalho

`unitSubtotal = effectivePrice(product) + extrasTotal`, recalculado a cada seleção, com uma linha de composição abaixo (`base + X em opcionais`).

Chama `calcUnitPrice(product, comps)` — a **mesma** função do carrinho e do checkout. Antes cada lado montava a própria soma, e era assim que dois números para o mesmo item apareciam na mesma tela. O rodapé é `unitSubtotal × qty`, derivado do mesmo valor.

Abre no **piso** (`getCardPrice`), não no preço base. Ver "Precificação" abaixo.

## Fluxo de Dados — Edição de Item

```
CartDrawer → navigate('/produto/:id?editIndex=N')
ProductDetail detecta editIndex
  ↓ cartComplementsToSelectedByGroup(items[N].addedComplements)
  ↓ pré-preenche selectedByGroup
  ↓ botão "Atualizar" → cartStore.updateItem(N, complements, note, qty)
  ↓ navigate(-1)
```

Passa pela **mesma** `validate()` da adição: item editado não escapa de grupo obrigatório. O que a edição não faz é disparar `Analytics.addToCart` — senão trocar o refrigerante inflaria a conversão.

## Fluxo de Dados — Envio do Pedido

```
Checkout
  ↓ Analytics.beginCheckout(items, total)
  ↓ validações locais (identificação, CPF, comanda)
  ↓ RECONSULTA GET api/branches  ← a loja ainda aceita pedido?
  │   ├─ settingsWeb.acceptingOrders === false → bloqueia com a mensagem da casa
  │   ├─ checkBranchOpen() com dado fresco    → bloqueia "a loja fechou enquanto…"
  │   └─ falha de rede                        → **segue**, o backend decide
  ↓ monta OrderPayload com:
     - simpleAuth (branch.settingsWeb.simpleAuth)
     - consumptioncode + consumptionint
     - whereConsume → additionalInfo.modality
     - appliedCoupon → payload.coupon
     - tmProduto = total / Σ(peopleCount × qty)
  ↓ POST api/orders
  ↓ Analytics.purchase(items, total, orderId, mode)
  ↓ clearCart() + navigate('/confirmacao')
```

**Por que reconsultar.** O boot checou o horário quando o cliente **abriu** o
cardápio — pode ter sido há duas horas. Nesse meio a casa fecha, o período vira,
ou o gerente pausa os pedidos. Sem reconsulta o pedido entra na cozinha depois de
o fogão desligar, e quem espera é o cliente.

**Falha de rede não bloqueia**, de propósito: travar o pedido por um soluço de
rede impede venda legítima, com o cliente de pé no salão. O POST adiante decide.

> ⚠️ **Isto não substitui a validação do backend.** Roda no aparelho do cliente:
> dá para desligar, adiar, ou estar com dado velho. Serve para **explicar** ("a
> loja fechou enquanto você montava o pedido") em vez de devolver erro genérico.
> Quem tem de recusar é o `POST api/orders` — ver `BACKEND.md`.

## Conta da mesa (`TableBill`)

Duas visões: **resumida** (padrão — itens idênticos somados) e **detalhada** (por
pedido, com filtro por quem lançou). A branch pode desligar a detalhada.

### Duas listas, de propósito

```
visible = todos os pedidos       ← o que aparece na tela
active  = visible sem cancelled  ← o que entra na soma
```

Antes o cancelado era filtrado das duas coisas: **sumia da tela**. Para quem viu o
item ali dois minutos antes, isso parece defeito do app — ou que a casa mexeu na
conta escondido. Riscado, com o rótulo do motivo, responde a pergunta antes de ela
existir.

| Situação | Exibição | Soma |
|---|---|---|
| item `active` (ou sem status) | normal | ✅ |
| item `cancelled` | riscado, "Cancelado · não entra na conta" | ❌ |
| item `transferred` | riscado, "Transferido para MESA_07" | ❌ |
| pedido `cancelled` | tarja vermelha, todos os itens riscados | ❌ |

A resumida **omite** os excluídos das linhas — inflariam a quantidade e a conta
deixaria de fechar — mas informa quantos existem, senão nasce a pergunta "e a
batata que eu pedi?".

`orderTotal` recalcula a partir dos itens ativos **quando há item excluído**, em vez
de confiar no `total` do cabeçalho. O backend deve mandar o total líquido, mas se
não mandar, a tela mostraria um item riscado como "Cancelado" **e** o cobraria — a
contradição mais destrutiva possível, na mesma tela.

### Quantidade fracionada (`billFormat.ts`)

Self-service pesa o prato: a linha vem `0.412` com `unit: 'kg'`. O app **nunca
gera** isso — quem pesa é a balança, quem lança é o PDV — mas exibe.

- `formatQuantity` → `0,412 kg` (vírgula, unidade, sem zeros à direita). Sem
  unidade mantém `2×`; com unidade não usa `×`, porque "0,412 × kg" não é português
- `unitPrice` exibido como `R$89,90/kg` — sem ele, `0,412 kg = R$37,04` é número
  que o cliente não tem como conferir
- **Mesmo produto com unidades diferentes vira linha separada**: `1 un` + `0,4 kg`
  não é `1,4` de coisa nenhuma
- `roundQty` **a cada acumulação**, não só na exibição: `0.412 + 0.385` em float dá
  `0.7970000000000001`, e isso ia direto para a tela do cliente

### Status do pedido (`useOrderPolling` + `statusPanel.ts`)

Poll de 30s em `GET api/orders?consumptioncode=…`, com toast e vibração na
mudança para `ready`.

O vocabulário vem do backend (`pending`, `in_progress`, `ready`, `on_the_way`,
`delivered`, `cancelled`), mas **a mensagem é por modo**: era uma tabela só, e o
`ready` dizia "Saindo para a mesa" inclusive no balcão, onde não existe mesa —
o cliente esperava sentado em vez de ir buscar. `on_the_way` só ocorre em delivery.

#### O app lê status; ele não move nenhum

Quem promove `pending → in_progress → ready` é o KDS, o PDV ou o app do garçom.
Se ninguém promove, o cliente olha "Aguardando cozinha" indefinidamente e conclui
que o pedido não chegou — pior que não mostrar nada.

Por isso o acompanhamento é **habilitado pelo backend e desligado por padrão**:

| Chave | Ausente | Liga |
|---|---|---|
| `orderStatusEnabled` | desligado | cartão de status + poll de 30s |
| `passwordPanelEnabled` | desligado | link "Acompanhar no painel de senhas" |

Duas chaves porque são duas operações: existe casa com KDS e sem painel (garçom
leva à mesa) e painel de senha alimentado à mão, sem KDS.

Desligado, o app **não faz poll** — reler `pending` a vida toda só gasta bateria —
e mostra apenas a senha e a instrução de retirada, que valem em qualquer operação.

`buildStatusPortalUrl` devolve `null` em vez de URL quebrada quando o painel está
desligado, sem URL cadastrada ou sem senha. Só aceita `http(s)`: a URL vem do
cadastro, e `javascript:` num campo que o app injeta em `href` é injeção de script
pela porta da frente.

#### Onde o status aparece, por modo

| Modo | Tela | O que mostra |
|---|---|---|
| Mesa | `/conta` **detalhada** | status por pedido |
| Mesa | `/conta` **resumida** (padrão) | agregado: "2 em produção · 1 pronto" |
| Balcão | `/confirmacao` | status do pedido recém-enviado |
| Balcão | `/pedidos` | chip ao vivo nos pedidos de **hoje** |
| Delivery | — | Fase 4 |
| Cartão | — | Fase 2.6 |

`statusChip()` é compartilhado pelas três telas. Eram três tabelas soltas, e três
tabelas divergem: o mesmo `ready` já apareceu como "Pronto", "Pronto! Saindo…" e
"Saindo para a mesa" em telas diferentes do mesmo app.

**Na resumida o status é agregado, não por linha** — ela junta itens de pedidos com
status diferentes, e "Frango crocante ×3" pode ter um pronto e dois na chapa. Chip
por linha seria mentira.

**Em `/pedidos` só os pedidos de hoje**, no máximo 5 códigos distintos: status de
anteontem não existe mais no backend, e varrer o histórico inteiro a cada abertura
seria gasto sem retorno. A falha é silenciosa — histórico serve mesmo sem status.

## Histórico de pedidos (`OrderHistory`)

Fonte é o `localStorage`, não a API: no balcão não existe conta de mesa, e o cliente
continua tendo direito de ver o que pediu depois de a comanda fechar.

Mostra **todas as unidades da mesma empresa**, não só a do QR atual — seguro porque
o storage já é isolado por company, e é o que o cliente espera: quem pediu na
unidade do shopping e hoje está na do centro continua achando o pedido de ontem.

### Agrupado por dia, com a unidade como etiqueta

`groupByDay` monta "Hoje", "Ontem", "quarta, 22 de julho", colapsáveis, com o total
gasto no dia. A unidade aparece na linha **só quando o histórico tem mais de uma**
(`hasMultipleBranches`) — senão é ruído em toda linha.

**Por data e não por branch**: o cliente típico usa uma unidade só, e agrupar por
branch daria um único grupo colapsável, um toque a mais para não revelar nada. Data
é como se procura pedido passado ("foi ontem").

A chave do dia é **local** (`AAAA-MM-DD` de `getDate()`), nunca `toISOString()`: em
GMT-3 um pedido das 22h viraria o dia seguinte em UTC, e o cliente leria "Ontem" num
pedido que fez à noite — o mesmo erro que já custou caro no horário de funcionamento.

### Pagamento: três estados, não dois (`paymentLabel.ts`)

| Situação | Selo |
|---|---|
| `via: app/pos` + `status: paid` | "Pago no app · Pix" |
| `via: app/pos` sem status | "Pagamento pendente" |
| `via: counter/waiter/totem/on_delivery` | "Pagamento no balcão · **não confirmado no app**" |
| `status: failed` | "Pagamento não aprovado" |

**O terceiro caso é o mais comum, e o mais importante de acertar.** Em balcão,
totem, caixa, garçom e entrega o dinheiro passa por fora: o app sabe que **enviou**
o pedido, não que foi pago. Deduzir pagamento de "o pedido saiu" custa dos dois
lados — quem lê "Pago" sem ter pagado é parado na frente da fila, e quem lê "Pago"
com o caixa discordando confia no celular e discute.

Delivery mostra o endereço **como estava no pedido** (cópia, não referência) com a
taxa cobrada na época, e o troco pedido quando foi dinheiro.

---

## PWA e Cache

### Service Worker (Workbox via vite-plugin-pwa)

- **Estratégia API**: `NetworkFirst` (tenta rede, fallback cache por 30min) para GET de menu
- **Estratégia imagens**: `CacheFirst` (7 dias) para arquivos estáticos e fotos de produtos
- **Precache**: HTML, JS, CSS do build automaticamente

### Cache API de imagens (adicional)

Além do Workbox, o `imageCache.ts` usa a Cache API diretamente para pre-fetch de todas as imagens do menu no boot. Resultado: imagens já carregadas antes do usuário rolar.

```
preloadMenuImages() → batches de 6 → Cache API.put()
ImageWithFallback   → getCachedUrl() → blob URL | URL original
```

### ⚠️ O pré-cache exige CORS no bucket de imagens

`cacheImage()` usa `fetch(url, { mode: 'cors' })`. Os buckets S3 (`klavi-img`,
`berpimagescloud`) **não devolvem `Access-Control-Allow-Origin`**, então o browser
bloqueia a leitura da resposta e o console enche de erro de CORS.

**Nada quebra visualmente** — `<img src>` não precisa de CORS, o `catch {}` engole a
falha e `getCachedUrl()` devolve a URL original. O que se perde:

- O pré-aquecimento (imagem só carrega quando entra na tela)
- Imagens offline no PWA
- Cada imagem é baixada **duas vezes**: o `fetch` que falha + a `<img>` que funciona

**Correção**: configurar CORS no bucket (ver `DEPLOY.md` §4.3). Sem isso, o Workbox
`CacheFirst` de imagens também não consegue cachear — respostas opacas (status 0) são
descartadas a menos que se declare `cacheableResponse: { statuses: [0, 200] }`.

---

## Analytics — Arquitetura

```
User Action
    ↓
Analytics.evento()     ← src/lib/analytics.ts
    ↓ isGranted()      ← src/lib/consent.ts
    ↓ (se denied: sai)
    ↓
    ├── fbq('track', ...) → Platform Pixel (VITE_META_PIXEL_ID)
    │                     → Branch Pixel  (branch.settingsWeb.metaPixelId)
    │
    └── gtag('event', ...) → Platform GA4 (VITE_GA_MEASUREMENT_ID)
                           → Branch GA4   (branch.settingsWeb.gaId)
```

Todos os IDs são inicializados via `fbq('init', id)` / `gtag('config', id)`. Cada evento vai automaticamente para todos os IDs inicializados.

---

## Backend — O Que Precisa Existir

### Obrigatório

```
branch.settingsWeb.simpleAuth   (string token por branch)
POST api/orders aceita simpleAuth no body sem Bearer
```

### Para Analytics

```
branch.settingsWeb.metaPixelId  (string, ex: "123456789012345")
branch.settingsWeb.gaId         (string, ex: "G-XXXXXXXXXX")
```

### Para o Futuro

```
locationType: 9   (mesa)  → filtro separado de produtos para o cardápio
locationType: 8   (totem) → mantém compatibilidade
```

---

## Dependências Diretas

```json
{
  "react": "^19",
  "react-dom": "^19",
  "react-router-dom": "^7",
  "zustand": "^5",
  "vite": "^8",
  "@vitejs/plugin-react": "*",
  "tailwindcss": "^4",
  "@tailwindcss/vite": "*",
  "vite-plugin-pwa": "*",
  "vitest": "^4"
}
```

Sem React Query, sem Axios, sem styled-components. Intencional — mantém o bundle pequeno
(~96 kB gzip).

> `@tanstack/react-query` e `tinyglobby` constam no `package.json` mas não são importados
> em nenhum arquivo. Resíduo de scaffold — podem sair.

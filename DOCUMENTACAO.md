# Cardápio Digital — Documentação Completa

## Visão Geral

App React PWA de cardápio digital para restaurantes. O cliente escaneia um QR Code na mesa ou no balcão, vê o cardápio, monta o pedido com complementos e envia direto para a cozinha da branch. Backend é Laravel (existente, compartilhado com o totem Flutter).

**Dois modos:**
- `mesa` — QR colado na mesa. Identificação opcional. Pagamento com garçom/maquininha.
- `balcao` — QR no balcão (papa-fila). Nome obrigatório (para chamar). Pagamento no balcão.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite 8 |
| Estilo | Tailwind CSS v4 (@tailwindcss/vite) |
| Estado do carrinho | Zustand (sessionStorage) |
| Dados do app | Zustand (em memória) |
| Fetch / cache de API | fetch nativo (sem React Query por ora) |
| Roteamento | React Router DOM v7 |
| Cache de imagens | Cache API do browser |
| Persistência do cliente | localStorage (`cardapio_client`) |

---

## URL de Entrada

```
https://seu-dominio.com/?branch=BRANCH_ID&table=MESA_03&mode=mesa
https://seu-dominio.com/?branch=BRANCH_ID&mode=balcao
```

| Parâmetro | Obrigatório | Exemplo | Descrição |
|---|---|---|---|
| `branch` | ✅ | `64a1f2b3c4d5` | ID da branch no MongoDB |
| `table` | mesa | `MESA_03` | Identificador da mesa |
| `mode` | ❌ | `mesa` \| `balcao` | Padrão: `mesa` |

---

## Variável de Ambiente

```bash
# .env
VITE_API_URL=https://api.seudominio.com.br   # sem barra no final
VITE_META_PIXEL_ID=                          # opcional — pixel da plataforma
VITE_GA_MEASUREMENT_ID=                      # opcional — GA4 da plataforma
```

> As `VITE_*` são compiladas **dentro do bundle** e legíveis por qualquer visitante.
> Nunca colocar segredo. Trocar o valor exige rebuild.
> Sem `VITE_API_URL`, o app loga um erro alto no console no boot.

---

## Estrutura de Arquivos

```
src/
├── types/
│   └── index.ts              # Todos os tipos TS (espelha modelos Flutter)
├── api/
│   └── client.ts             # Endpoints (espelho de rest.dart + codes.dart) + timeout 15s
├── hooks/
│   └── useOrderPolling.ts    # Polling de status a cada 30s + toast + vibração
├── lib/
│   ├── imageCache.ts         # Cache API browser (espelho de ImageCacher.dart)
│   ├── dataLinker.ts         # Parser + linkAllDataStructures (espelho de socket.dart)
│   ├── businessPeriod.ts     # isOpen, countdown, fase manhã/noite (espelho de closed_screen.dart)
│   ├── stock.ts              # isOutOfStock, checkValidPeriod, cupom (espelho de CategoryFilterHelper.dart)
│   ├── pricing.ts            # incluso/diff/fracionado, getCardPrice (lógica discutida)
│   ├── gerador_codigo.ts     # Geração de senha (espelho de gerador_codigo.dart)
│   ├── client_storage.ts     # localStorage para nome/fone/CPF do cliente
│   ├── consent.ts            # Consentimento LGPD (localStorage)
│   ├── analytics.ts          # Meta Pixel + GA4 (plataforma + branch)
│   └── theme.ts              # Aplica primaryColor da empresa como CSS var
├── store/
│   ├── appStore.ts           # Estado global (branch, company, menu, loading)
│   ├── cartStore.ts          # Carrinho + WhereConsume + consumptioncode/int
│   └── toastStore.ts         # Fila de toasts
├── components/
│   ├── ImageWithFallback.tsx # img com cache + skeleton + fallback
│   ├── ImageCarousel.tsx     # (não usado atualmente)
│   ├── ProductCard.tsx       # Card com preço correto + badges de status
│   ├── ComplementGroup.tsx   # Radio / Checkbox / Fracionado + labels incluso/diff
│   ├── CartDrawer.tsx        # Bottom sheet do carrinho (editar/remover)
│   ├── ClosedScreen.tsx      # Tela fechada manhã/noite + countdown (espelho Flutter)
│   ├── ErrorBoundary.tsx     # Anteparo de erro de render — envolve o app inteiro
│   ├── ErrorScreen.tsx       # QR inválido / cardápio não encontrado / sem conexão
│   ├── ConsentBanner.tsx     # Banner LGPD
│   ├── NpsRating.tsx         # Avaliação pós-pedido
│   ├── SkeletonLoader.tsx    # Shimmer de carregamento
│   └── ToastContainer.tsx    # Renderiza a fila de toasts
├── pages/
│   ├── Home.tsx              # Tabs de categoria + grid + busca + FAB do carrinho
│   ├── ProductDetail.tsx     # Produto + complementos + obs + sugestões + qty
│   ├── Checkout.tsx          # Revisão + WhereConsume + cupom + identificação + envio
│   └── Confirmation.tsx      # Senha grande + número do pedido + NPS
└── __tests__/                # 117 testes (businessPeriod, gerador, pricing, stock)
```

---

## Fluxo de Boot (App.tsx)

```
1. Parse dos params da URL (branch, table, mode)
2. GET api/branches + GET api/company (paralelo)
3. applyCompanyTheme(company.settingsTotem.primaryColor)
4. GET categorias + produtos + complementos + complementos-cat + ofertas + períodos (paralelo)
5. buildMenuData() → linkAllDataStructures() → categorias com produtos vinculados
6. checkBranchOpen(branch, periods) → closedReason = null | 'outsideHours' | 'branchInactive'
7. preloadMenuImages() (fire & forget — não bloqueia)
8. Renderiza: ErrorScreen | ClosedScreen | <Routes>
```

### Estados de erro no boot

Toda falha vira tela com texto em português e uma saída — nunca tela branca.

| Condição | Tela | Retry? |
|---|---|---|
| URL sem `?branch=` | `ErrorScreen 'noBranch'` — "QR Code inválido" | não |
| `GET api/branches` volta vazio ou sem `_id` | `ErrorScreen 'notFound'` — "Cardápio não encontrado" | não |
| Exceção ou timeout em qualquer fetch do boot | `ErrorScreen 'network'` — "Sem conexão" | sim |
| Erro de render em qualquer ponto do app | `ErrorBoundary` — "Algo deu errado" | sim (reload) |

Todas as chamadas de `api/client.ts` têm `AbortSignal.timeout(15_000)`. Sem esse teto,
uma rede que trava sem devolver erro deixa o cliente preso na splash indefinidamente.

---

## Endpoints da API (todos públicos — sem Bearer token)

| Método | Endpoint | Auth |
|---|---|---|
| GET | `api/branches?_id=ID` | pública |
| GET | `api/company?_id=ID` | pública |
| GET | `api/product-categories?branch=ID&locationTypes[$in][]=8&disabled=false&$limit=false` | pública |
| GET | `api/products?branch=ID&$limit=false&active=true` | pública |
| GET | `api/complements-groups?branch=ID&$limit=false&locationTypes[$in][]=8` | pública |
| GET | `api/complements-groups-categories?branch=ID&$limit=false` | pública |
| GET | `api/periods?branch=ID&$limit=false` | pública |
| GET | `api/offers?branch=ID&disabled=false&$limit=false` | pública |
| **POST** | `api/orders` | **simpleAuth no body** |

### Endpoints opcionais

Se não existirem, o app **degrada em silêncio** — nada quebra, a funcionalidade só não aparece.

| Método | Endpoint | Usado por | Se faltar |
|---|---|---|---|
| GET | `api/orders?consumptioncode=X&branch=ID&simpleAuth=T` | `useOrderPolling` | Sem notificação de "pedido pronto" |
| POST | `api/waiter-call` | Botão "chamar garçom" | Chamada não chega |
| POST | `api/reviews` | `NpsRating` | Avaliação não é salva |

---

## Autenticação do POST api/orders

O cardápio não tem login de usuário. A autenticação usa o campo `simpleAuth` no body do pedido.

**No backend Laravel (o que precisa existir):**
1. Campo `settingsWeb.simpleAuth` na branch (string token único por branch)
2. Middleware no POST `/api/orders` que aceita a requisição **sem Bearer header** quando `body.simpleAuth === branch.settingsWeb.simpleAuth`

**No app React:**
- `simpleAuth` é lido de `branch.settingsWeb.simpleAuth` (já retornado no GET api/branches)
- Inserido no body do pedido em `src/pages/Checkout.tsx`

### ⚠️ Limite desse desenho

O `simpleAuth` chega ao browser e fica legível no DevTools de qualquer visitante.
Ele autentica a **branch**, não o usuário — isso é premissa do desenho, já que o
cardápio não tem login. A consequência prática: sem rate limit, um `curl` consegue
inundar a cozinha de pedidos falsos.

```php
// Mitigação obrigatória antes de colar QR Code em mesa
Route::post('orders', ...)->middleware('throttle:20,1');
```

---

## Modelos de Dados

### Product (espelho de product.dart)
```typescript
{
  _id, name, description, category,
  price, offerprice?,
  active, seq,
  stock?: { active: boolean, currentQuantity: number },
  relatedPeriod?,          // ID de Period — item só disponível no período
  locationTypes?,          // filtro [8] = totem/cardápio
  complementsGroups[],     // vinculados por linkAllDataStructures
  complementsId[],         // IDs brutos da API
  image,                   // URL extraída: staticImage[0].photo > sliderHeader.image[0].photo
  suggestionCategory?,
  customSuggestions[],
  productOffer?,
}
```

### ComplementsGroupCategory (subcategoria de complemento)

```typescript
{
  _id, name,       // ← é "name", NÃO "title"
  seq,             // ordem de exibição
  active,
}
```

> ⚠️ A categoria **não** lista os grupos que a usam. O vínculo está no **item**:
> cada produto traz `complementGroupCategory: "<catId>"`. A hierarquia real é
>
> ```
> ComplementsGroup   "Escolha o sabor da sua bebida."   ← a pergunta
>   └─ subcategoria  "Refrigerantes"
>        ├─ item     "Coca cola zero"
>        └─ item     "Sprite Zero"
>   └─ subcategoria  "Sucos"
> ```
>
> O agrupamento é montado dentro do `ComplementGroup` (`splitByCategory`), lendo
> `item.complementGroupCategoryID`. **Todo item que declara subcategoria entra
> dentro dela e ela é colapsável — inclusive quando existe uma só.** Só ficam
> soltos, exibidos direto, os itens sem subcategoria nenhuma.
> Subcategorias são ordenadas por `seq` e funcionam como acordeão: abrir uma
> fecha as outras do mesmo grupo.

### ComplementsGroup (espelho de complements-groups.dart)
```typescript
{
  _id, title,
  products[],              // vinculados por linkAllDataStructures
  items[],                 // IDs brutos da API
  minQuantity, maxQuantity,
  obrigatory,              // grupo obrigatório
  ingredients,             // true = fracionado (pizza meia/meia)
  isTakeawayPackaging,     // embalagem para viagem (autoAdd quando OutsideLocal)
  autoAdd,
}
```

> ⚠️ Na API, `minQuantity` / `maxQuantity` / `mandatory` vêm **aninhados em `rules`**,
> não na raiz do grupo. `parseComplementsGroup` já lê de `raw.rules` — não "corrigir"
> isso achando que são campos de topo, ou todo grupo obrigatório vira opcional.

### Period (espelho de period.dart — formato real da API)
```typescript
{
  _id, branch, title,
  period: {
    "monday": [{ from: "08:00", to: "22:00" }],
    "tuesday": [...],
    // ...
  }
}
```

---

## Lógica de Precificação (src/lib/pricing.ts)

### Label de preço dos complementos

| Tipo de grupo | Item vs. mais barato | Label exibido | Preço abaixo do nome |
|---|---|---|---|
| Obrigatório | igual ou mais barato | `incluso` (verde) | **não exibe** |
| Obrigatório | mais caro | `+R$ diferença` (vermelho) | **não exibe** |
| Opcional | qualquer | `R$ preço cheio` | exibe |
| Fracionado | qualquer | contador de frações | `R$X inteira · cada ½ = R$Y` |

### O preço-piso — um número só

```
franquia(grupo) = obrigatório && minQty ≥ 1
                    ? (fracionado ? mais_barato ÷ maxQty : mais_barato) × minQty
                    : 0

piso  = effectivePrice(produto) + Σ franquia(grupo)      ← getCardPrice
preço = piso + Σ groupCharge(grupo, escolhas)            ← calcUnitPrice
```

**A partir do piso só entram acréscimos, nunca descontos.**

O piso aparece em três lugares e é sempre o mesmo número: o card do grid, o
cabeçalho da tela do produto ao abrir, e o que o carrinho cobra quando o cliente
escolhe os itens inclusos.

Exibido **sem** "A partir de": não é mínimo teórico, é o preço que ele paga.

`groupCharge` = soma do grupo **menos a franquia**, nunca negativo. A franquia é
do grupo, não de cada escolha — num grupo "escolha 1, até 3", descontar o mais
barato de cada item deixava levar 3 refrigerantes pelo preço de 1.

> ⚠️ **Nunca calcular preço fora de `calcUnitPrice`.** Duas somas paralelas já
> discordaram: o card anunciava R$35,90 e o carrinho cobrava R$29,40 no mesmo
> combo, porque um somava a franquia e o outro partia do base cru **e ainda
> descontava** o mais barato. Detalhes em `ARQUITETURA.md` → "Precificação".

### Cálculo fracionado
```
preço_contribuição = item.price × (qty_selecionada / maxQuantity)
unitFraction no payload = 1 / maxQuantity
```

---

## Lógica de Status do Produto (src/lib/stock.ts)

```
stock.active === false          → disponível (sem controle de estoque)
stock.active === true           →
  currentQuantity > 0           → disponível
  currentQuantity <= 0          → ESGOTADO (badge "Esgotado", grayscale, não clicável)

product.active === false        → não exibido (filtrado)

relatedPeriod existente         →
  período ativo agora           → disponível
  período inativo agora         → não exibido (fora do período)
```

**Fonte:** `CategoryFilterHelper.dart` (`_checkValidPeriod` + filtro de stock)

---

## Lógica de Horário de Funcionamento (src/lib/businessPeriod.ts)

Verifica se branch está aberta ao carregar o app:

```typescript
checkBranchOpen(branch, periods) → ClosedReason
```

**Prioridade:**
1. `branch.active === false` → `'branchInactive'`
2. Periods da API → `some(isPeriodOpen)` → null ou `'outsideHours'`
3. `branch.settingsWeb.businessHours` (fallback legacy) → mesma lógica
4. Sem configuração → `null` (considera aberto)

**ClosedScreen (espelho de closed_screen.dart):**
- 05h–13h → tema manhã: gradiente aurora, partículas de luz, headline "Ainda não abrimos"
- 13h–05h → tema noite: gradiente escuro, estrelas piscando, headline "Estamos fechados"
- Countdown em tempo real para próxima abertura
- Card com horários de funcionamento do dia atual

---

## Geração de Senha (src/lib/gerador_codigo.ts)

**Espelho de gerador_codigo.dart:**

```typescript
gerarHibridoTempoAleatorio()
// → pega 1º dígito da hora + último dígito do minuto
// → adiciona 2 chars aleatórios (conjunto sem 0/1)
// → embaralha os 4 → ex: "3K4M"

getOrCreateNumero()
// → número 500–999, gerado uma vez por sessão de carrinho
// → equivalente ao _numeroAleatorio200a9999 do Flutter
```

**Quando é gerado:**
- Na primeira adição ao carrinho (`initCodes()` no ProductDetail)
- Fixo até o `clearCart()` (após envio do pedido)
- Mesa: `consumptioncode` = nome da mesa (ex: "MESA_03")
- Balcão: `consumptioncode` = código híbrido (ex: "3K4M")

---

## WhereConsume (src/store/cartStore.ts)

Espelho de `WhereConsume` enum do Flutter (`buying_cicle_enums.dart`):

| Valor | Label exibido | Payload (`additionalInfo.whereConsume`) |
|---|---|---|
| `OnLocal` | Comer aqui | `"OnLocal"` |
| `OutsideLocal` | Para levar | `"OutsideLocal"` |

Aparece no Checkout para **ambos os modos** (mesa e balcão).

> ⚠️ **TODO:** Quando `OutsideLocal`, grupos com `isTakeawayPackaging: true && autoAdd: true` devem ter seus itens de embalagem adicionados automaticamente ao carrinho (espelho de `Product.injectTakeawayPackaging()`). Ainda não implementado — ver `addProductToCart` em `buying_cicle_provider.dart`.

---

## Persistência de Dados do Cliente (src/lib/client_storage.ts)

```
localStorage['cardapio_client'] = { name, phone, cpf }
```

- Salvo automaticamente ao editar qualquer campo no Checkout
- Carregado no `useEffect` de montagem do Checkout (`loadSavedClient()`)
- **Não é limpo no clearCart** — persiste entre pedidos do mesmo cliente
- Funções: `saveClientInfo`, `loadClientInfo`, `clearClientInfo`
- Helpers: `formatCPF`, `formatPhone`, `isValidCPF`

---

## Payload do Pedido (POST api/orders)

```json
{
  "branch": "BRANCH_ID",
  "simpleAuth": "token_do_settingsWeb",
  "consumptioncode": "MESA_03",
  "consumptionint": 742,
  "locationType": 8,
  "amount": 49.90,
  "subtotal": 49.90,
  "total": 49.90,
  "totemClientName": "João",
  "phone": "85999999999",
  "cpfCustomer": "000.000.000-00",
  "note": "sem gelo",
  "paymentMethod": { "type": "table", "kind": "Cardápio", "label": "Pagar na mesa" },
  "additionalInfo": {
    "modality": "Consumir no local",
    "whereConsume": "OnLocal"
  },
  "origin": "cardapio",
  "items": [
    {
      "product": "PRODUCT_ID",
      "name": "Combo 1",
      "originalPrice": 10.00,
      "amount": 12.50,
      "price": 10.00,
      "quantity": 2,
      "note": "sem cebola",
      "complements": [
        {
          "_id": "GROUP_ID",
          "name": "Bebida",
          "items": [
            { "_id": "ITEM_ID", "name": "Suco natural", "price": 1.50, "quantity": 1, "unitFraction": 1 }
          ]
        }
      ]
    }
  ]
}
```

**Campos importantes:**
- `locationType: 8` = mesmo do totem Flutter (confirmar se backend aceita)
- `paymentMethod.type`: `"table"` (mesa) ou `"counter"` (balcão)
- `additionalInfo.modality`: `"Consumir no local"` ou `"Para levar"`

---

## Cache de Imagens (src/lib/imageCache.ts)

**Espelho de ImageCacher.dart:**

```
Flutter: Dio.download → filesystem local (pasta "cache/")
Browser: fetch → Cache API → blob URL em memória (Map<url, blobUrl>)
```

**Função de extração de URL (espelho de socket.dart):**
```typescript
extractImageUrl(item):
  1. item.staticImage[0].photo          (prioridade)
  2. item.sliderHeader.image[0].photo   (se active !== false)
  3. ''                                  (sem imagem)
```

**Pré-carregamento (espelho de cacheImages):**
- `preloadMenuImages(items)` chamado no boot após montar o menu
- Processa em batches de 6 para não saturar a rede
- fire & forget — não bloqueia a renderização
- `ImageWithFallback` usa `getCachedUrl(url)` → blob URL ou URL original

---

## Theming (src/lib/theme.ts)

```typescript
applyCompanyTheme(company.settingsTotem?.primaryColor)
// Aplica: --color-brand, --color-brand-light, --color-brand-medium
// Chamado no boot, após carregar a company
```

Usado em: botões primários, tabs ativas, badge do carrinho, contadores de complementos, tela de confirmação.

---

## Conta da Mesa (`/conta`) — o que o backend precisa

Tela em `src/pages/TableBill.tsx`. Lista os pedidos da mesa, marca quem lançou cada um
e soma o total.

### ⚠️ Estado atual: MOCK LIGADO

A tela usa **dados falsos**. Enquanto isso vale:

- Arquivo: `src/lib/mockBill.ts`, constante `MOCK_BILL = true`
- **Para desabilitar: trocar `MOCK_BILL` para `false`.** É a única mudança necessária
- Com o mock ligado, a tela mostra tarja amarela "Dados de demonstração" e o console
  emite um `console.warn` no boot
- **Não publicar com `MOCK_BILL = true`.** Conta com valor inventado chegando ao
  cliente é pior que a tela não existir: ele confere contra o que comeu, não bate, e
  perde a confiança no cardápio inteiro

### O problema central: qual "mesa 03"?

Hoje o app chama:

```
GET api/orders?consumptioncode=MESA_03&branch=ID&simpleAuth=TOKEN&$sort[createdAt]=-1&$limit=50
```

Isso devolve **todos os pedidos que a MESA_03 já teve**, de qualquer dia. O cliente que
senta hoje veria a conta de ontem somada à dele.

`consumptioncode` identifica a *mesa*, não o *atendimento*. O backend precisa de um
conceito de **sessão/comanda aberta**: o intervalo entre sentar e fechar a conta.

### O que precisa existir no Laravel

**Obrigatório — a tela não funciona corretamente sem isso:**

1. Um marcador de atendimento aberto. Qualquer um destes serve:

   | Abordagem | Como o app consultaria |
   |---|---|
   | **`tableSession` no pedido** (recomendado) | `?tableSession=<id>` — id gerado ao abrir a mesa, novo a cada atendimento |
   | `closedAt` nulo enquanto aberta | `?consumptioncode=MESA_03&closedAt[$eq]=null` |
   | Flag `open` na comanda | `?consumptioncode=MESA_03&open=true` |

   A primeira é a mais robusta: sobrevive a mesa fechada e reaberta no mesmo dia, e não
   depende de filtro por data.

2. Endpoint que devolva os pedidos **apenas do atendimento aberto** daquela mesa,
   autenticado por `simpleAuth` como as demais rotas.

**Recomendado:**

3. **Autoria explícita do pedido.** Hoje o app *infere*: o cardápio manda
   `origin: 'cardapio'` no POST, e pedido sem esse marcador é classificado como
   "Atendente" (`src/lib/orderAuthor.ts`). Funciona, mas é indireto — qualquer canal
   novo que esqueça de mandar `origin` vira "Atendente" por engano.
   Ideal: campo `createdBy: { type: 'customer' | 'staff', name: string }`.
   `orderAuthorName()` já lê `operator` / `user` se vierem populados.

4. `createdAt` no pedido (a tela exibe o horário de cada lançamento).

5. Totais consistentes. A tela aceita `total`, `amount` ou `subtotal` porque os canais
   divergem hoje — convergir para um só nome simplificaria.

**Opcional:**

6. Taxa de serviço / couvert no retorno, para a tela mostrar o valor final em vez do
   aviso "taxas são fechadas no caixa".
7. Divisão por pessoa, se o salão trabalhar assim.

### Como o app classifica a autoria

```
order.origin === 'cardapio'  → "📱 Você"
qualquer outro / ausente     → "🧑‍🍳 Atendente"
```

Enquanto (3) não existir, **"Atendente" significa apenas "não veio do cardápio"**.

---

## Status de Implementação

### Pronto
- ✅ Embalagem takeaway automática (`injectTakeawayPackaging`)
- ✅ CartDrawer com editar/remover item
- ✅ Edição de item no carrinho (`/produto/:id?editIndex=N`)
- ✅ Ofertas (`productOffer`) e cupom no checkout
- ✅ Períodos e badges de status do produto
- ✅ Busca no Home, skeleton loading, PWA offline
- ✅ Sugestões por categoria, `tmProduto` no payload
- ✅ Modo dark via CSS vars
- ✅ Analytics (Meta Pixel + GA4) com consentimento LGPD
- ✅ Polling de status do pedido + toast + vibração
- ✅ NPS pós-pedido
- ✅ Tratamento de erro de boot e de render (`ErrorScreen` + `ErrorBoundary`)
- ✅ Ícones PWA reais (192, 512, apple-touch 180)
- ✅ 117 testes cobrindo as libs de negócio

### Pendente
- [ ] Monitoramento de erro em produção (Sentry) — o `ErrorBoundary` já centraliza, falta reportar do `componentDidCatch`
- [ ] Limpar avisos de lint: `set-state-in-effect` (Home, CartDrawer, ProductDetail, ImageWithFallback), `purity` no `ClosedScreen` (`new Date()` durante o render), `refs` no `ImageCarousel`. Nenhum quebra nada hoje
- [ ] `ImageCarousel.tsx` é código morto — decidir se entra em uso ou sai
- [ ] Remover deps não usadas: `@tanstack/react-query`, `tinyglobby`
- [ ] Contagem de pessoas (`peopleCount`) explícita na UI
- [ ] Animação de adição ao carrinho

---

## Backend Laravel — Checklist

### Obrigatório (sem isso o pedido não é enviado)
- [ ] Campo `settingsWeb.simpleAuth` no model Branch (string token único por branch)
- [ ] Middleware no `POST api/orders`: aceitar sem Bearer header quando `body.simpleAuth` válido para a branch informada
- [ ] **Rate limit no `POST api/orders`** (`throttle:20,1`) — o `simpleAuth` é público no bundle

### Recomendado
- [ ] `GET api/branches` retornar `settingsWeb` populado (já existe no model Branch)
- [ ] `company._id` retornado dentro de `branch` (campo `company`) para o boot carregar a empresa
- [ ] CORS liberando o domínio do cardápio em `GET` e `POST` (ver `DEPLOY.md`)

### Opcional (melhoria)
- [ ] `settingsWeb.metaPixelId` + `settingsWeb.gaId` para analytics por branch
- [ ] Endpoints `GET api/orders`, `POST api/waiter-call`, `POST api/reviews`
- [ ] Campo `settingsWeb.businessHours` na branch como fallback de horário
- [ ] `locationType` específico para cardápio de mesa (ex: `9`) se quiser produtos exclusivos
- [ ] WebSocket para notificar o cardápio quando o pedido muda de status (substituiria o polling de 30s)

---

## Como Rodar

```bash
# Instalar dependências
npm install

# Configurar API
echo "VITE_API_URL=https://sua-api.com.br" > .env

# Desenvolvimento
npm run dev

# URL de teste (mesa)
http://localhost:5173/?branch=ID_DA_BRANCH&table=MESA_03&mode=mesa

# URL de teste (balcão)
http://localhost:5173/?branch=ID_DA_BRANCH&mode=balcao

# Build de produção
npm run build
```

---

## Referências de Código Flutter

| Arquivo Flutter | Espelho React |
|---|---|
| `rest.dart` + `codes.dart` | `src/api/client.ts` |
| `socket.dart` (handleProducts, linkAll...) | `src/lib/dataLinker.ts` |
| `image_cacher.dart` | `src/lib/imageCache.ts` |
| `closed_screen.dart` | `src/components/ClosedScreen.tsx` + `src/lib/businessPeriod.ts` |
| `CategoryFilterHelper.dart` | `src/lib/stock.ts` |
| `gerador_codigo.dart` | `src/lib/gerador_codigo.ts` |
| `buying_cicle_enums.dart` (WhereConsume) | `src/types/index.ts` + `src/store/cartStore.ts` |
| `buying_cicle_provider.dart` (carrinho, payload) | `src/store/cartStore.ts` + `src/pages/Checkout.tsx` |
| `product.dart` (pricing, complements) | `src/lib/pricing.ts` + `src/components/ComplementGroup.tsx` |
| `FractionHelper.dart` | `src/lib/pricing.ts` (getFractionText, fracPrice) |
| `buying_cicle_provider.dart` (getOrCreateNumero) | `src/lib/gerador_codigo.ts` |

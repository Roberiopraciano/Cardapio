# Cardápio Digital — Contexto para Claude Code

## O que é este projeto

App React PWA de cardápio digital para restaurantes. Clientes escaneiam um QR Code colado na mesa ou no balcão, veem o cardápio, montam pedidos com complementos/adicionais e enviam direto para a cozinha da branch. Sem instalação — roda 100% no browser.

O backend é Laravel (existente, compartilhado com um totem Flutter). **Este repo só contém o frontend React.** Todos os tipos e lógicas de negócio foram portados dos arquivos Flutter originais.

## Como rodar

```bash
npm install

# Copiar .env e preencher
cp .env.example .env

npm run dev

# URL de teste — mesa
http://localhost:5173/?branch=BRANCH_ID&table=MESA_03&mode=mesa

# URL de teste — balcão (papa-fila)
http://localhost:5173/?branch=BRANCH_ID&mode=balcao
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `VITE_API_URL` | ✅ | Base URL da API Laravel |
| `VITE_META_PIXEL_ID` | ❌ | Meta Pixel da plataforma (global) |
| `VITE_GA_MEASUREMENT_ID` | ❌ | GA4 da plataforma (global) |

## Dois modos de operação

| Parâmetro URL | Valor | Comportamento |
|---|---|---|
| `mode=mesa` | padrão | Exige `table=`. Identificação, pagamento no garçom |
| `mode=balcao` | papa-fila | Nome obrigatório (para chamar), pagamento no balcão |

O link é validado **antes de qualquer requisição** (`src/lib/qrParams.ts`): `branch`
tem de ser ObjectId de 24 hex, `mode` tem de ser conhecido, e `mode=mesa` exige
`table`. Link malformado vai direto à leitura de QR Code, não à tela de "sem
conexão" — ver `ARQUITETURA.md` → "Camadas de erro".

> `cartao` (cartão de consumação) está previsto na Fase 2.6 do `ROADMAP.md` e
> **não** implementado. Valor desconhecido em `allowedModes` é ignorado.

## O app não cobra, e não sabe se foi pago

Nenhum pagamento passa pelo app hoje: o cliente paga no caixa, com o garçom ou no
totem. Isso tem duas consequências que valem em qualquer mudança de código:

- **Nunca afirmar "Pago"** sem confirmação do próprio app. Existem **três** estados
  — pago, não pago e *não sabemos* — e o terceiro é o mais comum. Ver
  `src/lib/paymentLabel.ts`
- **O app lê status, não move nenhum.** Quem promove `pending → ready` é o KDS/PDV.
  Por isso `settingsWeb.orderStatusEnabled` ausente = desligado: status que ninguém
  move é pior que status nenhum

## Stack

- **React 19 + TypeScript + Vite 8**
- **Tailwind CSS v4** via `@tailwindcss/vite`
- **Zustand** — estado do carrinho (`sessionStorage`) e app (memória)
- **React Router DOM v7**
- **vite-plugin-pwa** — PWA + service worker com Workbox
- **fetch nativo** — sem React Query
- **Vitest** — 279 testes sobre as libs de negócio (`npm test`)

> `@tanstack/react-query` e `tinyglobby` estão no `package.json` mas não são
> importados em lugar nenhum — resíduo de scaffold, candidatos a remoção.

## Estrutura de pastas

```
src/
├── api/client.ts           ← todos os endpoints (espelho de rest.dart) + timeout de 15s
├── hooks/
│   └── useOrderPolling.ts  ← polling de status do pedido a cada 30s
├── lib/
│   ├── analytics.ts        ← Meta Pixel + GA4 unificados
│   ├── billFormat.ts       ← quantidade fracionada (0,412 kg) + soma segura
│   ├── businessPeriod.ts   ← lógica de horário aberto/fechado
│   ├── client_storage.ts   ← nome/fone/CPF/e-mail + validação de CPF
│   ├── consent.ts          ← consentimento LGPD (por company, sem herdar)
│   ├── dataLinker.ts       ← parser + linkAllDataStructures
│   ├── gerador_codigo.ts   ← geração de senha do pedido
│   ├── imageCache.ts       ← Cache API browser (espelho de ImageCacher.dart)
│   ├── paymentLabel.ts     ← selo de pagamento, incluindo "não sabemos"
│   ├── pricing.ts          ← piso, franquia do incluso, fracionado, calcUnitPrice
│   ├── qrParams.ts         ← valida o link do QR antes de qualquer requisição
│   ├── statusPanel.ts      ← KDS/painel habilitáveis, statusChip, URL do portal
│   ├── stock.ts            ← isOutOfStock, checkValidPeriod, findCouponByCode
│   ├── storageScope.ts     ← prefixo de localStorage por company + migração
│   ├── theme.ts            ← CSS var --color-brand da empresa
│   └── mock*.ts            ← ⚠️ MOCKS LIGADOS — desligar antes de produção
├── store/
│   ├── appStore.ts         ← branch, company, menu, loading
│   ├── cartStore.ts        ← carrinho, WhereConsume, códigos, cliente
│   └── toastStore.ts       ← fila de toasts
├── components/
│   ├── CartDrawer.tsx      ← bottom sheet do carrinho
│   ├── QrScanButton.tsx    ← reescanear QR (BarcodeDetector nativo)
│   ├── ClosedScreen.tsx    ← tela fechado manhã/noite
│   ├── ComplementGroup.tsx ← radio/checkbox/fracionado
│   ├── ConsentBanner.tsx   ← banner LGPD
│   ├── ErrorBoundary.tsx   ← anteparo de erro de render (envolve o app inteiro)
│   ├── ErrorScreen.tsx     ← 5 motivos de boot → 3 saídas
│   ├── ScanScreen.tsx      ← leitura de QR em tela cheia
│   ├── QrScanner.tsx       ← BarcodeDetector + jsQR, valida antes de navegar
│   ├── BannerCarousel.tsx  ← wizard com slide (não fade)
│   ├── TabBar.tsx          ← Cardápio / Pedido / Conta / Perfil
│   ├── ImageCarousel.tsx   ← (não usado atualmente)
│   ├── ImageWithFallback.tsx
│   ├── NpsRating.tsx       ← avaliação pós-pedido
│   ├── ProductCard.tsx
│   ├── SkeletonLoader.tsx
│   └── ToastContainer.tsx
└── pages/
    ├── Home.tsx            ← tabs + grid + busca + CartDrawer
    ├── ProductDetail.tsx   ← detalhe + complementos + edit mode
    ├── Checkout.tsx        ← revisão + identificação + reverifica loja aberta
    ├── Confirmation.tsx    ← senha + status + painel + NPS
    ├── TableBill.tsx        ← conta resumida/detalhada, cancelado, fração
    ├── OrderHistory.tsx    ← histórico por dia, pagamento, endereço
    └── Profile.tsx         ← dados do cliente, avatar, idioma, LGPD
```

## Convenções de código

- Componentes: PascalCase, um por arquivo
- CSS: `var(--bg-card)`, `var(--text-hi)`, `var(--color-brand)` — nunca hex hardcoded em componentes
- Tema **travado em claro** (`color-scheme: light`, fundo branco). O
  `@media (prefers-color-scheme: dark)` foi removido: o cardápio é a vitrine do
  restaurante e não deve mudar de cor conforme o celular do cliente. As CSS vars
  continuam sendo o único ponto de troca — a empresa sobrescreve em runtime
- Tipos: espelham modelos Flutter — ver `src/types/index.ts`
- **Hooks antes de qualquer `return`.** Nenhum `useState`/`useMemo`/`useEffect`
  pode ficar depois de um early return — a ordem dos hooks muda entre renders e o
  React quebra. Guards de "não encontrado" ficam *abaixo* de todos os hooks.
- **Data é sempre local, nunca UTC.** Horário comercial compara minutos desde
  00:00 (`getHours()*60 + getMinutes()`); a chave de dia do histórico usa
  `getFullYear/getMonth/getDate`. Nunca `toISOString()` para montar data — em GMT-3
  isso vira o dia seguinte depois das 21h: a branch aparece fechada, e um pedido
  das 22h aparece como "Ontem".
- **Preço sai de `calcUnitPrice`, e de lugar nenhum mais.** Duas somas paralelas
  já divergiram em produção — o card anunciava R$35,90 e o carrinho cobrava
  R$29,40 no mesmo combo. O piso é `getCardPrice`; a partir dele só entram
  acréscimos, nunca descontos.
- **Não afirmar o que o app não sabe.** Pagamento fora do app não é "pago"; status
  sem KDS não é "aguardando"; campo do cadastro que não se entende é ignorado, não
  adotado. Na dúvida entre calar e chutar, calar.
- **Nada de `Math.random()` ou `new Date()` no corpo do render.** O `ClosedScreen`
  re-renderiza 1×/s; valores sorteados no render mudam a cada tique.
- **Nada de `navigate()` durante o render** — sempre dentro de `useEffect`.
- Toda tela que pode falhar precisa de saída visível. Tela branca é bug:
  o cliente está de pé no restaurante com o celular na mão.

## Estado de produção

O app está pronto para piloto. Antes de colar QR Code em mesa, ler o `DEPLOY.md`:
ele cobre o fallback de SPA (sem ele, refresh em `/checkout` dá 404), CORS,
HTTPS e o rate limit obrigatório no `POST api/orders`.

⚠️ **Três mocks estão LIGADOS** e precisam ser desligados antes de produção:

| Arquivo | Constante | O que finge |
|---|---|---|
| `src/lib/mockBill.ts` | `MOCK_BILL` | conta da mesa **e** progressão de status |
| `src/lib/mockHistory.ts` | `MOCK_HISTORY` | histórico de pedidos |
| `src/lib/mockSettings.ts` | `MOCK_SETTINGS` | idiomas, banners, comanda, KDS/painel |

Cada um avisa no console ao carregar e mostra tarja na tela. `MOCK_SETTINGS` liga
`orderStatusEnabled` e `passwordPanelEnabled`, que em produção são **desligados por
padrão**.

⚠️ O `simpleAuth` é compilado dentro do bundle e é legível por qualquer visitante.
Ele autentica a **branch**, não o usuário — o backend precisa de throttle.

## O que NÃO está neste repo

- Backend Laravel (endpoints existentes)
- Scripts de geração de QR Code (feito pelo painel Laravel)
- Painel administrativo de branches

## Documentação

| Arquivo | Conteúdo |
|---|---|
| `DOCUMENTACAO.md` | Endpoints, modelos de dados, payload do pedido, precificação |
| `ARQUITETURA.md` | Camadas, fluxos de dados, precificação, storage, status, PWA |
| `BACKEND.md` | **Contrato completo do Laravel** — o que precisa existir e por quê |
| `CONFIGURACAO.md` | Todas as chaves de `settingsWeb`, com padrões |
| `ROADMAP.md` | Fases, plano de teste, dívida conhecida |
| `DEPLOY.md` | Configuração de servidor, CORS, roteiro de teste em produção |
| `MEMORY.md` | Decisões tomadas e o porquê delas — **ler antes de mudar regra** |
| `SPEC-FLUTTER-APP.md` | Especificação para construir app similar em Flutter |
| `STYLE.md` | Tokens visuais e padrões de UI |

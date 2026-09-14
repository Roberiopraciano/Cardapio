# Cardápio Digital

App React PWA de cardápio digital para restaurantes. O cliente escaneia um QR Code na
mesa ou no balcão, monta o pedido com complementos e envia direto para a cozinha.
Sem instalação — roda 100% no browser.

O backend é Laravel (existente, compartilhado com um totem Flutter). **Este repo só
contém o frontend React.**

---

## Rodar localmente

```bash
npm install
cp .env.example .env     # preencher VITE_API_URL
npm run dev
```

```
# Mesa
http://localhost:5173/?branch=BRANCH_ID&table=MESA_03&mode=mesa

# Balcão (papa-fila)
http://localhost:5173/?branch=BRANCH_ID&mode=balcao
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (Vite) |
| `npm run build` | Typecheck + build de produção em `dist/` |
| `npm run preview` | Serve o `dist/` localmente |
| `npm test` | Vitest em modo watch |
| `npm run test:run` | Vitest uma vez (CI) |
| `npm run lint` | ESLint |

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `VITE_API_URL` | ✅ | Base URL da API Laravel (sem barra no final) |
| `VITE_META_PIXEL_ID` | ❌ | Meta Pixel da plataforma (global) |
| `VITE_GA_MEASUREMENT_ID` | ❌ | GA4 da plataforma (global) |

> As `VITE_*` são compiladas dentro do bundle e legíveis por qualquer visitante.
> Nunca colocar segredo. Trocar o valor exige rebuild.

## Modos de operação

| `mode` | Comportamento |
|---|---|
| `mesa` (padrão) | Identificação opcional, pagamento no garçom |
| `balcao` | Nome obrigatório (para chamar), pagamento no balcão |

## Stack

React 19 · TypeScript · Vite 8 · Tailwind CSS v4 · Zustand · React Router v7 ·
vite-plugin-pwa (Workbox) · Vitest

Sem React Query, sem Axios — `fetch` nativo. Bundle: ~96 kB gzip.

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Contexto rápido do projeto e convenções de código |
| [`DOCUMENTACAO.md`](DOCUMENTACAO.md) | Endpoints, modelos de dados, payload, precificação |
| [`ARQUITETURA.md`](ARQUITETURA.md) | Camadas, fluxos de dados, PWA, analytics |
| [`DEPLOY.md`](DEPLOY.md) | **Ler antes de subir** — servidor, CORS, roteiro de teste |
| [`MEMORY.md`](MEMORY.md) | Decisões tomadas e o porquê |
| [`STYLE.md`](STYLE.md) | Tokens visuais e padrões de UI |

## Antes de ir para produção

Dois itens no backend Laravel, sem os quais o cardápio carrega mas **não envia pedido**:

1. Campo `settingsWeb.simpleAuth` no model Branch
2. Middleware no `POST api/orders` aceitando sem Bearer quando `body.simpleAuth` bate

E um terceiro que é de segurança: **rate limit** no `POST api/orders`. O `simpleAuth`
vai no bundle e é legível por qualquer visitante — ele autentica a branch, não o
usuário. Detalhes e checklist completo no [`DEPLOY.md`](DEPLOY.md).

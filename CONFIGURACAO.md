# Guia de Configuração — Cardápio e Totem

Como ligar cada recurso, o que o backend precisa ter, e o que reaproveitar no
totem Flutter.

> Referência técnica completa do contrato da API: [`BACKEND.md`](BACKEND.md).
> Este arquivo é o guia prático de "quero ligar X, o que faço".

---

## Sumário

1. [Onde mora a configuração](#1-onde-mora-a-configuração)
2. [Receitas — ligar recurso por recurso](#2-receitas--ligar-recurso-por-recurso)
3. [O que o backend precisa entregar](#3-o-que-o-backend-precisa-entregar)
4. [Reaproveitando no totem](#4-reaproveitando-no-totem)
5. [Ambiente e build](#5-ambiente-e-build)
6. [Checklist de publicação](#6-checklist-de-publicação)

---

## 1. Onde mora a configuração

São **três** lugares, e a distinção importa:

| Lugar | Muda por | Quem edita | Efeito |
|---|---|---|---|
| `Branch.settingsWeb` | branch | painel Laravel | imediato, sem rebuild |
| `Company.settingsTotem` | empresa | painel Laravel | imediato, sem rebuild |
| `.env` do app | deploy | quem publica | **exige rebuild** |

Regra prática: **tudo que varia por restaurante vai em `settingsWeb`.** O `.env`
guarda só o que é da plataforma inteira (URL da API, IDs globais de analytics,
Client ID do Google).

### Todas as chaves de `settingsWeb`

```jsonc
{
  // ── Obrigatório ────────────────────────────────────────────────
  "simpleAuth": "token-unico-da-branch",

  // ── Modo de operação ───────────────────────────────────────────
  "allowedModes": ["mesa", "balcao"],   // padrão: ambos

  // ── Abertura da sessão ─────────────────────────────────────────
  "askWhereConsume": true,              // padrão: true
  "waiterCallEnabled": false,           // padrão: false (só em mesa)
  "banners": [ /* ver §2.4 */ ],
  "bannersRequired": false,             // padrão: false
  "languages": ["pt", "es", "en"],      // padrão: ["pt"]

  // ── Identificação do cliente ───────────────────────────────────
  "requireIdentification": true,        // padrão: true
  "askEmail": false,                    // padrão: false
  "googleSignInEnabled": false,         // padrão: false

  // ── Conta e comanda ────────────────────────────────────────────
  "billEnabled": true,                  // padrão: true
  "billDetailedEnabled": true,          // padrão: true
  "comandaEnabled": false,              // padrão: false
  "comandaLabel": "Comanda",
  "comandaRequired": false,

  // ── Comercial ──────────────────────────────────────────────────
  "couponsEnabled": false,              // padrão: false

  // ── Analytics ──────────────────────────────────────────────────
  "metaPixelId": "123456789012345",
  "gaId": "G-XXXXXXXXXX",

  // ── LGPD ───────────────────────────────────────────────────────
  "privacyPolicyUrl": "https://...",
  "privacyContactEmail": "privacidade@...",

  // ── Legado ─────────────────────────────────────────────────────
  "businessHours": [ { "open": "08:00", "close": "22:00", "label": "Almoço" } ]
}
```

> **Ausente ≠ desligado.** Cada chave tem um padrão próprio: `billEnabled` sem
> valor é `true`, `couponsEnabled` sem valor é `false`. A coluna "padrão" acima
> é o que vale quando o campo não existe.

---

## 2. Receitas — ligar recurso por recurso

### 2.1 Restaurante que só atende no salão

```json
{ "allowedModes": ["mesa"] }
```

QR com `mode=balcao` cai automaticamente em `mesa`. Evita gerar senha de balcão
onde não há balcão para chamar.

### 2.1.1 Chamar garçom

```json
{ "waiterCallEnabled": true }
```

Botão 🛎 no cabeçalho, só em `mode=mesa`. **Desligado por padrão.**

Antes de ligar, confirme os dois lados: `POST api/waiter-call` existe **e** a
chamada chega em algum lugar que o salão olha. Sem isso o cliente toca um botão
que não produz nada — pior que não ter o botão.

### 2.1.2 Um PWA por empresa

O mesmo servidor atende várias empresas, mas quem escaneia o QR da **Bebelu**
precisa instalar "Bebelu", com o ícone da Bebelu — não um "Cardápio Digital"
genérico que ele não reconhece na tela inicial e desinstala.

```json
{
  "menuName": "Bebelu Lanches",
  "menuShortName": "Bebelu",
  "menuDescription": "Peça pelo celular, na mesa ou no balcão",
  "pwaIcon192": "https://cdn.../bebelu-192.png",
  "pwaIcon512": "https://cdn.../bebelu-512.png",
  "pwaIconApple": "https://cdn.../bebelu-180.png"
}
```

Pode ficar em `company.settingsTotem` (vale para todas as unidades) ou em
`branch.settingsWeb` (a branch sobrescreve — útil para "Bebelu Shopping").
Sem nada preenchido, cai no nome da company.

Cor vem de `primaryColor`, a mesma do tema.

#### ⚠️ O que funciona em cada plataforma

| Plataforma | Nome e ícone dinâmicos | Como |
|---|---|---|
| **iOS / Safari** | ✅ confiável | `apple-touch-icon` + `apple-mobile-web-app-title`, trocados em runtime |
| **Android / Chrome** | ⚠️ funciona, mas frágil | manifest injetado via `blob:` — não é garantido por especificação |
| Título da aba, favicon | ✅ | sempre |

O app já troca tudo em runtime (`lib/pwaIdentity.ts`). Para **Android**, isso é
rede de segurança, não a solução definitiva.

#### ► A solução robusta: uma URL por empresa

Como você já vai gerar uma URL específica por company, use isso a favor:

```
https://bebelu.cardapio.com.br/?branch=...&table=MESA_03&mode=mesa
https://4estylos.cardapio.com.br/?branch=...&mode=balcao
```

ou por caminho:

```
https://cardapio.com.br/bebelu/?branch=...&table=MESA_03
```

Com URL própria, o servidor entrega um **`manifest.webmanifest` estático por
empresa** — que é o que o Chrome espera. Duas formas:

**A) Um build por empresa** (mais simples, mais arquivos)
```bash
VITE_MENU_NAME="Bebelu" VITE_MENU_ICON=/bebelu-512.png npm run build
```

**B) Um build só, manifest servido pelo nginx** (recomendado)
```nginx
# /etc/nginx/conf.d/cardapio.conf
server {
  server_name ~^(?<tenant>.+)\.cardapio\.com\.br$;
  root /var/www/cardapio/dist;

  # manifest por empresa, gerado pelo painel em /var/www/manifests/
  location = /manifest.webmanifest {
    alias /var/www/manifests/$tenant.webmanifest;
    add_header Content-Type application/manifest+json;
    add_header Cache-Control "no-cache";
  }

  location / { try_files $uri $uri/ /index.html; }
}
```

O painel Laravel gera `bebelu.webmanifest`, `4estylos.webmanifest` etc. a partir
dos mesmos campos acima. **Um bundle, N identidades.**

> **`start_url` importa.** O manifest injetado em runtime preserva
> `?branch=&table=&mode=`, então quem instalar na mesa 3 reabre na mesa 3. Se
> você servir manifest estático, decida: `start_url` com `branch` fixo abre
> direto no cardápio da unidade (bom para balcão), sem `branch` cai na tela de
> leitura de QR (bom para mesa, que muda).

### 2.2 Comanda por pessoa na mesa

```json
{
  "comandaEnabled": true,
  "comandaLabel": "Comanda",
  "comandaRequired": true
}
```

**O que muda:** campo de comanda no checkout, `comanda` no payload do pedido, e
a conta agrupa por comanda em vez de por pessoa.

**Backend precisa:** aceitar `comanda` no `POST api/orders` e devolvê-la no
`GET api/orders`.

> A comanda é a **chave de cobrança**; o nome é rótulo humano. Não peça os dois
> como obrigatórios — o nome já vem do aparelho em visita repetida.

### 2.3 Idiomas

```json
{ "languages": ["pt", "es", "en"] }
```

Com menos de dois idiomas o seletor não aparece. Português é sempre a base.

**Backend precisa:** preencher `translations` nos produtos e categorias:

```json
{
  "translations": {
    "en": { "name": "Crispy chicken", "description": "..." },
    "es": { "name": "Pollo crujiente", "description": "..." }
  }
}
```

Tradução vazia cai para o português — um cardápio meio traduzido é utilizável,
um com linhas em branco não.

### 2.4 Banners de abertura

```json
{
  "banners": [
    {
      "image": "https://cdn.exemplo.com/combo.jpg",
      "title": "Combo do dia",
      "subtitle": "Hambúrguer + batata + bebida por R$ 39,90",
      "link": "/produto/693b06b556be4a4bd00c509f",
      "linkLabel": "Ver o combo",
      "active": true,
      "seq": 1
    }
  ],
  "bannersRequired": false
}
```

| Campo | Obrigatório | Nota |
|---|---|---|
| `image` | ✅ | 4:5 (ex. 1080×1350). Sem ela o banner é ignorado |
| `link` | ❌ | Interno (`/produto/<id>`) ou externo (`https://`) |
| `active` | ❌ | `false` esconde sem apagar |
| `seq` | ❌ | Ordem |

Aparece **uma vez por sessão**, antes da escolha de idioma/consumo. Wizard com
"Próximo", setas, swipe e pontinhos.

`bannersRequired: true` esconde a saída até o último banner. Pense antes: quem
escaneou o QR está com fome e sentado.

### 2.5 Identificação do cliente

```json
{ "requireIdentification": true, "askEmail": true }
```

| Ação | Sem identificação |
|---|---|
| Navegar, ver preços, montar carrinho | livre |
| Enviar pedido | exige nome + telefone |
| Ver a conta | exige nome + telefone |

Validação: nome com 2+ caracteres, telefone com 10–13 dígitos.

### 2.6 Google Sign-In

```json
{ "googleSignInEnabled": true }
```
```bash
# .env — exige rebuild
VITE_GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
```

**Preenche nome e e-mail. Não preenche telefone** — não existe escopo de
telefone no Google Identity Services. O `phoneNumbers` da People API exige o
escopo `contacts`, sensível, com verificação anual do app.

Como obter o Client ID:
1. [console.cloud.google.com](https://console.cloud.google.com) → APIs e Serviços → Credenciais
2. Criar credencial → ID do cliente OAuth → **Aplicativo da Web**
3. Em "Origens JavaScript autorizadas", adicionar o domínio do cardápio
   (`https://cardapio.seudominio.com.br`) e `http://localhost:5173` para testes

> Antes de ligar: o `autocomplete` nativo do navegador já preenche nome, e-mail
> e telefone de quem tem os dados salvos, com um toque, sem login e sem carregar
> script de terceiro. O Google adiciona mais um terceiro ao consentimento LGPD
> para resolver metade do problema.

### 2.7 Conta da mesa

```json
{ "billEnabled": true, "billDetailedEnabled": true }
```

- `billEnabled: false` → aba some e `/conta` redireciona ao cardápio
- `billDetailedEnabled: false` → só a visão resumida (não expõe quem pediu o quê)

Padrão da tela é a **resumida** (itens iguais somados, como a conta do caixa).

### 2.8 LGPD

```json
{
  "privacyPolicyUrl": "https://restaurante.com.br/privacidade",
  "privacyContactEmail": "privacidade@restaurante.com.br"
}
```

Sem `privacyPolicyUrl`, "Aceitar" no banner não é consentimento **informado**.
Sem `privacyContactEmail`, o cliente só consegue apagar o que está no celular —
os pedidos no servidor ficam, e ele tem direito à exclusão (art. 18, VI).

### 2.9 Pixels

```json
{ "metaPixelId": "123456789012345", "gaId": "G-XXXXXXXXXX" }
```

| Campo | Formato | Onde o dono acha |
|---|---|---|
| `metaPixelId` | 15–16 dígitos | Meta Events Manager → Fontes de dados → ID do pixel |
| `gaId` | `G-` + 10 alfanuméricos | GA4 → Administrador → Fluxos de dados → ID da métrica |

Erro comum: colar o ID da **conta** no lugar do **pixel**. Vale um regex no painel.

Os IDs da plataforma (`.env`) e os da branch rodam **em paralelo** — cada evento
vai para os dois. Nada é injetado antes do aceite no banner.

---

## 3. O que o backend precisa entregar

### Bloqueia o funcionamento

- [ ] `settingsWeb.simpleAuth` no model Branch
- [ ] `POST api/orders` aceitando `simpleAuth` no body, sem Bearer
- [ ] `throttle:20,1` no `POST api/orders` — o token é público no bundle
- [ ] CORS liberando o domínio do cardápio
- [ ] `branch.company` populado no `GET api/branches`
- [ ] Backend multiplicando `complemento.quantity × item.quantity`

### Conta da mesa (hoje em mock)

- [ ] Conceito de **atendimento aberto** (`tableSession` recomendado) — sem isso
      a MESA_03 de hoje soma a conta de ontem
- [ ] `GET api/orders` filtrando pelo atendimento aberto
- [ ] Objeto `session` com `openedAt` e `waiter`
- [ ] `createdAt`, `discount`, `serviceTax`, `coupon` no pedido; `discount` no item
- [ ] `createdBy: { type: "customer" | "staff", name }` — hoje é inferido por `origin`

### Painel

- [ ] Editor de `settingsWeb` com os campos da §1
- [ ] Upload de banners com preview 4:5
- [ ] Campos de tradução por produto e categoria
- [ ] **Geração de QR Code em lote** por branch, PDF de etiquetas (ver `BACKEND.md` §7)

---

## 4. Reaproveitando no totem

O totem Flutter e o cardápio consomem **a mesma API** e o mesmo
`locationType: 8`. O que dá para compartilhar:

### Compartilhe

| Recurso | Como |
|---|---|
| `settingsWeb` inteiro | Mesmo objeto, mesmos padrões — não crie `settingsTotem2` |
| `translations` | Mesmo formato `{ en: {...}, es: {...} }` |
| `banners` | Mesmo array; o totem pode usar 9:16 em vez de 4:5 |
| Comanda | Mesmo campo `comanda` no payload |
| Autoria (`origin`) | Totem manda `origin: "totem"`, cardápio manda `"cardapio"` |

> **Use um `origin` distinto no totem.** Hoje a conta classifica como
> "Atendente" tudo que não vem do cardápio. Se o totem mandar `origin: "totem"`,
> dá para diferenciar os três canais sem mudar o app.

### Não compartilhe

| Recurso | Por quê |
|---|---|
| `requireIdentification` | Totem é autoatendimento com fila atrás; exigir cadastro trava o fluxo |
| `askWhereConsume` | O totem já pergunta isso no fluxo dele |
| Google Sign-In | Digitar login em tela pública, com fila esperando, não funciona |
| Histórico local | O totem é compartilhado — histórico ali seria de outra pessoa |

Se precisar divergir, prefira uma chave separada (`settingsWeb.totem.*`) a
reinterpretar a mesma chave com significado diferente em cada canal.

### Lógicas já portadas que valem conferir

O cardápio portou do Flutter e **corrigiu bugs no caminho**. Vale trazer de volta:

| Lógica | Arquivo no cardápio | O que foi corrigido |
|---|---|---|
| Horário aberto/fechado | `lib/businessPeriod.ts` | Comparação em minutos **locais**; a versão com `toISOString()` fechava a loja das 21h à meia-noite em GMT-3 |
| Slots virando meia-noite | `lib/businessPeriod.ts` | `to < from` (18:00→02:00) era tratado como fechado a noite toda |
| Quantidade de complemento | `pages/Checkout.tsx` | É **por unidade**; exibir cru mostrava "2× Coca" cobrando 4 |
| Subcategorias de complemento | `components/ComplementGroup.tsx` | A categoria não lista grupos — quem aponta é o **item**, via `complementGroupCategory` |
| Regras do grupo | `lib/dataLinker.ts` | `minQuantity`/`maxQuantity`/`mandatory` vêm dentro de `rules`, não na raiz |

---

## 5. Ambiente e build

```bash
# .env
VITE_API_URL=https://api.seudominio.com.br   # obrigatório, sem barra final
VITE_META_PIXEL_ID=                          # opcional, plataforma
VITE_GA_MEASUREMENT_ID=                      # opcional, plataforma
VITE_GOOGLE_CLIENT_ID=                       # opcional, Google Sign-In
```

> As `VITE_*` são **compiladas dentro do bundle** e legíveis por qualquer
> visitante. Nunca coloque segredo. Trocar o valor exige rebuild.

```bash
npm ci
npm run build     # dist/ estático
```

### Testando no celular pelo túnel HTTPS

Câmera (scanner de QR), Service Worker e `navigator.vibrate` **não funcionam em
HTTP** fora de `localhost`. Para testar de verdade no celular, precisa de um
túnel HTTPS:

```bash
npm run dev          # terminal 1
ngrok http 5173      # terminal 2 → pega a URL https://xxxx.ngrok-free.dev
```

O `vite.config.ts` já libera os domínios de túnel em `server.allowedHosts`
(`ngrok`, `cloudflared`, `localtunnel`). Se aparecer:

```
Blocked request. This host ("xxx") is not allowed.
```

…é porque o domínio do seu túnel não está na lista — adicione com `.` na frente
para casar qualquer subdomínio.

> **Não troque por `allowedHosts: true`.** A checagem existe contra DNS
> rebinding: um site malicioso aponta um domínio para `127.0.0.1` e passa a ler
> o que o seu dev server serve. Liberar por domínio custa uma linha.

**URL de teste no celular:**
```
https://xxxx.ngrok-free.dev/?branch=SEU_BRANCH_ID&table=MESA_03&mode=mesa
```

Se o hot reload não reconectar pelo túnel, é o websocket do HMR tentando a porta
local. Recarregar a página resolve; para corrigir de vez, `server.hmr:
{ clientPort: 443, protocol: 'wss' }` — mas isso quebra o dev em localhost,
então só ligue enquanto estiver testando por túnel.

### Testando a instalação do PWA

**`npm run dev` não instala o PWA, mesmo em HTTPS.** O `vite-plugin-pwa` só gera
o service worker no build; em desenvolvimento não existe SW, e sem SW o navegador
não oferece instalação.

Para testar de verdade:

```bash
npm run preview:tunnel   # terminal 1 → build + serve o dist/ na 4173
ngrok http 4173          # terminal 2
```

Isso serve **o mesmo bundle que vai para produção**, com service worker,
manifest e cache reais.

| Plataforma | Como instalar | Observação |
|---|---|---|
| **Android / Chrome** | banner automático, ou ⋮ → "Instalar app" | precisa de SW + manifest + HTTPS |
| **iOS / Safari** | Compartilhar → "Adicionar à Tela de Início" | iOS **nunca** mostra prompt automático |
| Desktop Chrome/Edge | ícone de instalar na barra de endereço | |

**Conferir depois de instalar:**
- [ ] Ícone e nome corretos na tela inicial
- [ ] Abre em tela cheia (sem barra do navegador)
- [ ] Abrindo pelo ícone (sem `?branch=`) → tela de QR inválido com botão de câmera
- [ ] Publicar nova versão → o app atualiza sozinho no próximo boot

> Se precisar iterar no comportamento do próprio service worker, dá para ligá-lo
> em desenvolvimento com `VITE_PWA_DEV=true npm run dev`. Fica **desligado por
> padrão** de propósito: o SW cacheia módulos e faz a tela mostrar código velho
> depois de salvar, o que vira horas de depuração de um bug que não existe.

---

## 6. Checklist de publicação

### Desligar os mocks

Três arquivos fingem dados para permitir visualizar as telas sem backend:

```bash
grep -rn "MOCK_BILL = \|MOCK_HISTORY = \|MOCK_SETTINGS = " src/lib/
# os três precisam dizer false
```

| Arquivo | Finge |
|---|---|
| `src/lib/mockBill.ts` | Pedidos e sessão da conta |
| `src/lib/mockHistory.ts` | Histórico do aparelho |
| `src/lib/mockSettings.ts` | Idiomas, comanda, banners, e-mail, Google |

Cada um mostra tarja amarela e avisa no console. Conta com valor inventado
chegando ao cliente é pior que a tela não existir.

### Servidor

- [ ] HTTPS (Service Worker e câmera não funcionam sem)
- [ ] Fallback de SPA — sem ele, refresh em `/checkout` dá 404
- [ ] `Cache-Control: no-cache` em `sw.js`, `registerSW.js` e `index.html`
- [ ] CORS nos buckets de imagem (ver `DEPLOY.md` §4.3)

### Teste em celular real

Roteiro completo no [`DEPLOY.md`](DEPLOY.md) §6. Os que mais pegam:

- [ ] Testar **depois das 21h** (já houve bug de fuso fechando a loja)
- [ ] QR inválido → botão de câmera funciona no iOS **e** no Android
- [ ] Pedido com 2× de um item que tem 2× de bebida → conta 4 bebidas
- [ ] Trocar modalidade com carrinho cheio → modal avisa antes de esvaziar

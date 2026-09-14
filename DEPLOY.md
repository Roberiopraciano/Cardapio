# Deploy — Colocar o Cardápio em Produção

Guia para subir o app e rodar o primeiro teste real em uma branch piloto.

---

## 0. ⚠️ Antes de qualquer coisa: desligar os mocks

Três arquivos estão com dados falsos ligados para permitir visualizar as telas antes
do backend existir. **Todos precisam ir para `false` antes de publicar.**

| Arquivo | Constante | O que finge |
|---|---|---|
| `src/lib/mockBill.ts` | `MOCK_BILL` | Pedidos e sessão da conta da mesa |
| `src/lib/mockHistory.ts` | `MOCK_HISTORY` | Histórico de pedidos do aparelho |
| `src/lib/mockSettings.ts` | `MOCK_SETTINGS` | Idiomas, comanda e banners na branch |

Cada um exibe tarja amarela na tela e grita no console no boot, justamente para não
passar despercebido. Conta ou histórico com valor inventado chegando ao cliente é pior
que a tela não existir: ele confere contra o que comeu, não bate, e perde a confiança
no cardápio inteiro.

```bash
# conferência antes do build — os três têm que dizer false
grep -rn "MOCK_BILL = \|MOCK_HISTORY = \|MOCK_SETTINGS = " src/lib/
```

---

## 1. Pré-requisitos no backend Laravel

Sem estes dois itens o app carrega o cardápio mas **não consegue enviar pedido**:

| # | Item | Onde |
|---|---|---|
| 1 | Campo `settingsWeb.simpleAuth` na Branch (token único por branch) | model `Branch` |
| 2 | Middleware do `POST /api/orders` aceitando requisição **sem Bearer** quando `body.simpleAuth` bate com o da branch | rota `api/orders` |

E para a tela `/conta` sair do mock:

| # | Item | Por quê |
|---|---|---|
| 3 | Conceito de **atendimento aberto** por mesa (`tableSession`, `closedAt` nulo ou flag `open`) | `consumptioncode` identifica a mesa, não o atendimento — sem isso a MESA_03 de hoje soma a conta de ontem |
| 4 | Autoria explícita do pedido (`createdBy`) | hoje é inferida por `origin: 'cardapio'` |

Detalhamento completo em `DOCUMENTACAO.md` → "Conta da Mesa".

Além disso, confira:

- `GET api/branches?_id=X` retorna `settingsWeb` populado e o campo `company`
- **CORS** libera o domínio do cardápio nos métodos `GET` e `POST`
  ```php
  // config/cors.php
  'paths' => ['api/*'],
  'allowed_methods' => ['GET', 'POST'],
  'allowed_origins' => ['https://cardapio.seudominio.com.br'],
  'allowed_headers' => ['Content-Type'],
  ```
- **Rate limit** no `POST api/orders`. O `simpleAuth` viaja no bundle JavaScript e é
  legível por qualquer cliente — ele autentica a branch, não o usuário. Sem throttle,
  um curl consegue inundar a cozinha de pedidos falsos.
  ```php
  Route::post('orders', ...)->middleware('throttle:20,1');
  ```

Endpoints **opcionais** — se não existirem, o app degrada em silêncio e nada quebra:
`GET api/orders` (polling de status), `POST api/waiter-call`, `POST api/reviews`.

---

## 2. Variáveis de ambiente

```bash
cp .env.example .env
```

```env
VITE_API_URL=https://api.seudominio.com.br   # sem barra no final
VITE_META_PIXEL_ID=
VITE_GA_MEASUREMENT_ID=
```

> As `VITE_*` são **compiladas dentro do bundle** — qualquer visitante consegue lê-las.
> Nunca coloque segredo aqui. Trocar o valor exige rebuild, não basta reiniciar.

---

## 3. Build

```bash
npm ci
npm run build     # gera dist/
```

O `dist/` é estático — serve em qualquer host (nginx, Apache, S3+CloudFront, Vercel, Netlify).

---

## 4. Configuração do servidor (obrigatória)

### 4.1 Fallback de SPA

O app usa `BrowserRouter`. Sem fallback, um refresh em `/checkout` ou `/produto/123`
devolve **404** — a falha mais comum nesse tipo de deploy.

**nginx**
```nginx
server {
  listen 443 ssl;
  server_name cardapio.seudominio.com.br;
  root /var/www/cardapio/dist;

  location / {
    try_files $uri $uri/ /index.html;
  }

  # O service worker nunca pode ser cacheado, senão o app trava numa versão velha
  location = /sw.js {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
  }
  location = /registerSW.js {
    add_header Cache-Control "no-cache";
  }
  location = /index.html {
    add_header Cache-Control "no-cache";
  }
  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
}
```

**Apache** — `dist/.htaccess`
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

**Vercel** — `vercel.json`
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

**Netlify** — `public/_redirects`
```
/*  /index.html  200
```

### 4.2 HTTPS é obrigatório

Service Worker, Cache API de imagens e `navigator.vibrate` **só funcionam em HTTPS**.
Em HTTP o app abre, mas sem PWA e sem cache de imagem.

### 4.3 CORS nos buckets de imagem

Os buckets S3 (`klavi-img`, `berpimagescloud`) hoje **não devolvem
`Access-Control-Allow-Origin`**. Sintoma no console:

```
Access to fetch at 'https://klavi-img.s3.amazonaws.com/....png'
has been blocked by CORS policy
GET .... net::ERR_FAILED 200 (OK)
```

O `200 (OK)` denuncia o que está acontecendo: o arquivo **foi entregue**, o browser é que
recusou passá-lo para o JavaScript.

**Nada quebra visualmente** — `<img src>` não precisa de CORS, então as fotos aparecem
normalmente. O que se perde é o pré-cache: as imagens só carregam quando entram na tela,
não ficam disponíveis offline, e cada uma é baixada duas vezes (o `fetch` que falha + a
`<img>` que funciona).

Para recuperar isso, adicionar no bucket (S3 → Permissions → CORS):

```json
[
  {
    "AllowedOrigins": ["https://cardapio.seudominio.com.br", "http://localhost:5173"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Type"],
    "MaxAgeSeconds": 86400
  }
]
```

Se o bucket estiver atrás de CloudFront, liberar também o forward do header `Origin`.

Sem esse ajuste, o `CacheFirst` de imagens do Workbox também não cacheia: respostas
opacas chegam com status `0` e são descartadas, a menos que se declare
`cacheableResponse: { statuses: [0, 200] }` no `vite.config.ts`.

---

## 5. URLs de QR Code

```
https://cardapio.seudominio.com.br/?branch=<BRANCH_ID>&table=MESA_03&mode=mesa
https://cardapio.seudominio.com.br/?branch=<BRANCH_ID>&mode=balcao
```

Gere um QR por mesa. `mode=mesa` é o padrão se omitido.

---

## 6. Roteiro de teste (fazer antes de liberar para cliente)

Rode no **celular real**, não só no desktop. Idealmente iOS + Android.

### Boot
- [ ] QR da mesa abre o cardápio com a cor da marca correta
- [ ] URL sem `?branch=` mostra "QR Code inválido" (não tela branca)
- [ ] `?branch=id_inexistente` mostra "Cardápio não encontrado"
- [ ] Modo avião → mostra "Sem conexão" com botão de tentar novamente
- [ ] Fora do horário de funcionamento → `ClosedScreen` com os horários certos
- [ ] **Testar depois das 21h** — o horário é comparado em hora local; já houve bug de
      fuso que fechava a branch das 21h à meia-noite
- [ ] Se a branch fecha depois da meia-noite (ex: 18:00→02:00), conferir se continua
      aberta à 01:00

### Cardápio
- [ ] Categorias e produtos aparecem na ordem correta (`seq`)
- [ ] Produto esgotado (`stock.active = true`, `currentQuantity = 0`) aparece bloqueado
- [ ] Preço do card bate: preço + mais barato de cada grupo obrigatório
- [ ] Busca filtra corretamente
- [ ] Imagens carregam; produto sem imagem mostra o fallback cinza

### Pedido
- [ ] Grupo obrigatório bloqueia envio até atingir `minQuantity`
- [ ] Badge "incluso" no item mais barato do grupo obrigatório; "+R$X" nos demais
- [ ] Fracionado (meia/meia) cobra a fração certa
- [ ] "Para levar" adiciona embalagem automática; voltar para "Comer aqui" remove
- [ ] Editar item no carrinho reabre com as seleções preenchidas
- [ ] Cupom válido aplica desconto; inválido mostra erro

### Checkout
- [ ] `mode=balcao` exige nome
- [ ] Abrir `/checkout` com carrinho vazio volta para o cardápio (não quebra)
- [ ] **Pedido chega na cozinha com itens, complementos, senha e observações corretos**
- [ ] Confirmação mostra a senha; em mesa é o nome da mesa, em balcão é o código gerado
- [ ] Recarregar a página com itens no carrinho mantém o carrinho (sessionStorage)
- [ ] Derrubar a rede no meio do envio mostra erro e permite tentar de novo

### Conferir no backend
- [ ] `amount`, `subtotal` e `total` batem com o exibido na tela
- [ ] `consumptioncode` / `consumptionint` chegam corretos
- [ ] Nenhum pedido duplicado após duplo toque no botão

---

## 7. Rollout sugerido

1. Subir com **uma branch piloto** e QR Codes só em 2–3 mesas
2. Acompanhar os pedidos no painel por um serviço inteiro
3. Conferir totais no fechamento do caixa contra o que o app enviou
4. Só então expandir para o salão todo

---

## 8. Limitações conhecidas

| Item | Impacto | Situação |
|---|---|---|
| `simpleAuth` legível no bundle | Autentica a branch, não o usuário | Mitigar com rate limit no backend |
| `start_url: "/"` no manifest | PWA instalado abre sem `?branch=` e cai na tela de QR inválido | Aceitável — o fluxo real é sempre via QR |
| `locationType: 8` | Compartilhado com o totem Flutter | Criar `9` se quiser produtos exclusivos do cardápio |
| Status do pedido | Polling de 30s, depende de `GET api/orders` existir | Falha em silêncio se o endpoint não existir |
| Sem monitoramento de erro | Erro em produção só aparece no console do cliente | Considerar Sentry (ver §9) |

---

## 9. Monitoramento (recomendado antes de escalar)

Sourcemaps já estão ligados no build. Para capturar erros reais dos clientes:

```bash
npm i @sentry/react
```

O `ErrorBoundary` em `src/components/ErrorBoundary.tsx` já centraliza os erros de
render — basta reportar de dentro do `componentDidCatch`.

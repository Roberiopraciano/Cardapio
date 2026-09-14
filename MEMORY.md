# Memory — Decisões e Contexto do Projeto

## Origem

O frontend foi desenvolvido com base em:
1. **Backend Laravel existente** (API compartilhada com um totem Flutter)
2. **Código Flutter** dos modelos de dados e lógicas de negócio

Todos os arquivos `.dart` foram lidos e as lógicas foram portadas para TypeScript.

---

## Decisões de Arquitetura

### Autenticação (POST api/orders)
- **Decisão**: usar campo `simpleAuth` no body do pedido, sem Bearer header
- **Motivo**: o cardápio não tem login de usuário. Solução mais simples que mantém segurança por branch
- **Implementação**: `branch.settingsWeb.simpleAuth` → enviado no body de todo POST
- **Pendência no backend**: middleware Laravel precisa aceitar `simpleAuth` no body sem Bearer

### locationType
- **Decisão**: usar `8` (mesmo do totem Flutter)
- **Motivo**: backend ainda não tem tipo separado para cardápio de mesa
- **Para o futuro**: quando tiver `locationType: 9` (mesa), ajustar o filtro em `api/client.ts` e `dataLinker.ts`

### Period format (API real)
- **Formato**: `period.period = { "monday": [{from: "08:00", to: "22:00"}], ... }`
- **NÃO é**: `{ open: "08:00", close: "22:00" }` (esse formato era legacy)
- **Arquivo**: `src/lib/businessPeriod.ts` + `src/lib/stock.ts`

### Horário comercial é SEMPRE local, nunca UTC
- **Decisão**: toda comparação de horário acontece em **minutos desde 00:00 local**
  (`getHours() * 60 + getMinutes()`), sem nunca construir `Date` a partir de string
- **Motivo**: o código antigo montava `new Date(\`${todayStr} ${slot.from}\`)` com
  `todayStr` vindo de `toISOString()` — que é UTC. Em GMT-3, das 21h à meia-noite o UTC
  já está no dia seguinte, então o slot era montado com a data de **amanhã** e a
  comparação dava sempre "fechado". Resultado: a branch aparecia fechada todas as noites
  das 21h à meia-noite, e produtos com `relatedPeriod` sumiam do cardápio no mesmo horário
- **Bônus**: o formato `"YYYY-MM-DD HH:mm"` nem é padrão ECMAScript — funciona no V8 por
  tolerância, não por especificação
- **Onde estava**: `businessPeriod.ts:26` (`isPeriodOpen`), `businessPeriod.ts:47`
  (`nextOpenDateFromPeriod`) e `stock.ts:29` (`checkValidPeriod`) — o mesmo bug copiado
  em três lugares
- **Agora**: `checkValidPeriod` delega para `isPeriodOpen`. A comparação de horário mora
  num lugar só, senão o bug volta a divergir entre arquivos
- **Teste de regressão**: `businessPeriod.test.ts` cobre 21:17 e 23:59 explicitamente.
  Os testes antigos passavam por sorte — todos usavam horários antes das 21h

### Slots que atravessam a meia-noite
- **Decisão**: `to < from` significa que o slot vira o dia (ex: bar 18:00 → 02:00)
- **Implementação**: `isPeriodOpen` checa os slots de hoje **e** os de ontem que
  atravessaram a meia-noite e ainda estão correndo
- **Antes**: um bar com `{from:"18:00", to:"02:00"}` aparecia fechado a noite inteira,
  porque `to >= now` era falso às 20h

### Complements — a hierarquia real (corrigido)

O tipo `ComplementsGroupCategory` estava errado: assumia `{ _id, title, groups[] }`.
A API **não devolve nada disso**. O retorno real de `api/complements-groups-categories`:

```json
{ "_id": "...", "seq": 2, "name": "Sucos", "active": true, "complementGroup": "" }
```

- É **`name`**, não `title`
- **Não existe** array `groups` — a categoria não sabe quais grupos a usam

O vínculo é ao contrário: **cada item aponta para a subcategoria**. No `api/products`,
o item traz `complementGroupCategory: "<catId>"`. Logo a hierarquia é:

```
ComplementsGroup   "Escolha o sabor da sua bebida."   ← a pergunta
  └─ subcategoria  "Refrigerantes"                     ← agrupa os itens
       ├─ item     "Coca cola zero"
       └─ item     "Sprite Zero"
  └─ subcategoria  "Sucos"
```

Consequência: o agrupamento é resolvido **dentro** do `ComplementGroup`, lendo
`item.complementGroupCategoryID`. Não existe nível acima do grupo.

### Group rules vêm aninhadas
`minQuantity`, `maxQuantity` e `mandatory` moram em `raw.rules`, não na raiz do grupo.
`parseComplementsGroup` já lê de lá — não "consertar" isso achando que são campos de topo.

### Stock format (API real)
- **Formato**: `{ active: boolean, currentQuantity: number }`
- **Lógica**: `active === false` = sem controle → disponível. `active === true && currentQuantity <= 0` = esgotado
- **Fonte**: `CategoryFilterHelper.dart`

### Sem React Query
- **Decisão**: usar fetch nativo + Zustand
- **Motivo**: os dados do cardápio são carregados uma vez no boot e ficam em memória. Sem necessidade de re-fetch contínuo nem cache de servidor
- **Nota**: `@tanstack/react-query` ficou no `package.json` mas nunca foi importado. Junto com `tinyglobby`, é resíduo de scaffold — pode sair

### Cardápio sempre fresco, sem cache
- **Decisão**: `cache: 'no-store'` em todo GET + `NetworkOnly` no Workbox para as rotas de API
- **Motivo**: preço e estoque mudam durante o serviço. Com `NetworkFirst`, uma rede lenta
  servia cardápio de até 30min atrás e o cliente pedia por um preço que não existe mais.
  Boot 1s mais lento é melhor que conta divergente no caixa
- **Migração**: `clearStaleApiCache()` roda no boot e apaga o `api-cache` deixado por
  versões anteriores do app, que senão sobreviveria no disco até expirar
- **Custo aceito**: o cardápio não abre mais offline. Imagens continuam cacheadas

### Uma categoria por vez na Home
- **Decisão**: a aba de categoria **filtra** o grid; antes ela só dava `scrollIntoView`
  numa página que listava todas as categorias empilhadas
- **Detalhe**: `key={currentCat._id}` no grid força remontar ao trocar de aba, senão o
  React reaproveita os cards da categoria anterior por posição

### Tema travado em claro
- **Decisão**: removido o `@media (prefers-color-scheme: dark)` do `index.css`;
  `:root` agora declara `color-scheme: light` e `--bg-page: #ffffff`
- **Motivo**: o cardápio é a vitrine do restaurante. Seguir o tema do aparelho fazia
  cada cliente ver uma cor diferente da que o dono aprovou, e quem estava com o celular
  no escuro via o cardápio escuro
- **Efeito colateral tratado**: com `--bg-page` e `--bg-card` ambos brancos, os cartões
  perderiam o contorno — `--border` subiu de `#f0f0f0` para `#e5e7eb`
- **A empresa ainda sobrescreve** em runtime via `applyCompanyTheme`

### Cor de fundo da empresa: não chutar nome de campo
- `secondaryColor` esteve na lista de candidatos a cor de fundo e **foi um erro**:
  cor secundária é acento de marca, não fundo. Onde a empresa tinha secundária escura,
  o cardápio inteiro ficava escuro
- **Regra**: na dúvida sobre um campo, ignorar e manter o tema padrão. Pintar a tela
  toda com um palpite é pior que não aplicar a cor

### Complementos colapsados
- **Decisão**: grupos e subcategorias começam **fechados**
- **Sem achatamento**: todo item com subcategoria entra dentro dela, e ela é colapsável,
  **inclusive quando o grupo tem uma subcategoria só**. Chegou a existir um atalho que
  achatava esse caso para poupar um toque — foi revertido, a hierarquia do cadastro
  tem que aparecer como está cadastrada
- **Acordeão nas subcategorias**: abrir uma fecha as outras **do mesmo grupo**. A chave é
  `"grupoId:categoriaId"` — o prefixo delimita o escopo
- **Grupos** continuam podendo ficar vários abertos ao mesmo tempo
- **Validação**: com tudo fechado, dizer "selecione uma bebida" não bastava — o cliente
  não achava onde. `revealGroup()` abre o grupo pendente e marca a borda em vermelho
- **Cabeçalho fechado** mostra o que já foi escolhido, senão o grupo vira caixa-preta

### Complemento no carrinho: exibir quantidade efetiva
- `CartComplement.quantity` é **por unidade do produto**
- `calcCartItemSubtotal` = `(base + extras) * item.quantity` — o total já multiplica
- **Bug corrigido**: o carrinho e o checkout exibiam `comp.quantity` cru. Com 2× Frango
  contendo 2× Coca, aparecia "2× Coca cola" e cobrava 4. O carrinho contradizia a conta
- **Regra**: na exibição sempre `comp.quantity * item.quantity`. No **payload** continua
  cru — o backend recebe a quantidade por unidade + `quantity` do item e multiplica.
  Multiplicar no payload dobraria o pedido na cozinha

### Conta da mesa (`/conta`)
- `TableBill.tsx` lista os pedidos por `consumptioncode` via `GET api/orders`
- **Autoria** (`lib/orderAuthor.ts`): o cardápio envia `origin: 'cardapio'` no POST.
  Pedido sem esse marcador veio de outro canal (PDV/totem/comanda) → "Atendente"
- ⚠️ **É inferência, não campo dedicado.** Enquanto o Laravel não expuser o autor
  explicitamente, "Atendente" significa só "não veio do cardápio". Se o backend passar a
  mandar operador/usuário, `orderAuthorName()` já lê `operator`/`user`
- Em mesa o código vem de `params.table` (funciona sem carrinho aberto); em balcão, do
  `consumptioncode` do carrinho

### Cupom desabilitado
- `COUPONS_ENABLED = false` no topo de `Checkout.tsx`
- A lógica (`findCouponByCode`, `totalWithCoupon`) continua inteira e testada — só a
  entrada está bloqueada. Reativar é trocar a constante

### Reescanear QR Code
- `QrScanButton.tsx` usa o `BarcodeDetector` **nativo** — sem dependência nova
- Existe no Chrome/Edge Android; no iOS o Safari não implementa e o componente troca
  para uma instrução de usar o app de Câmera, em vez de um botão que não funcionaria
- **Segurança**: só navega para URLs do **mesmo origin** e que tenham `?branch=`.
  Um QR codifica qualquer endereço — seguir um scan cegamente é o vetor de golpe de QR

### Timeout de 15s em todo fetch
- **Decisão**: `AbortSignal.timeout(15_000)` em todas as chamadas de `api/client.ts`
- **Motivo**: rede de restaurante trava sem devolver erro. Sem teto, a promise nunca resolve e o cliente fica preso na splash para sempre — não é um erro que ele consiga interpretar ou contornar
- **Arquivo**: `src/api/client.ts` (`withTimeout`)

### Zustand com sessionStorage
- **Carrinho**: `sessionStorage` — persiste entre reloads na mesma aba, limpa ao fechar
- **Cliente (nome/fone/CPF)**: `localStorage` via `client_storage.ts` — persiste entre sessões
- **App state** (branch, products, etc.): apenas memória — recarregado a cada sessão

---

## Tratamento de Erro — "tela branca é bug"

O cliente está de pé no restaurante, com o celular na mão e fome. Ele não recarrega,
não abre o console, não sabe o que é um erro de JavaScript. Toda falha precisa virar
uma tela com texto em português e uma saída.

### Camadas de proteção

| Camada | Arquivo | Cobre |
|---|---|---|
| `ErrorBoundary` | `components/ErrorBoundary.tsx` | Qualquer erro de render — envolve o app inteiro em `App.tsx` |
| `ErrorScreen` | `components/ErrorScreen.tsx` | Falhas de boot: `noBranch`, `notFound`, `network` |
| Guard de produto | `pages/ProductDetail.tsx` | Produto que saiu do cardápio ou link velho |
| Guard de carrinho | `pages/Checkout.tsx` | `/checkout` aberto com carrinho vazio |

### Estados de boot (`App.tsx`)
```
sem ?branch=          → ErrorScreen 'noBranch'   (QR Code inválido)
branch sem _id        → ErrorScreen 'notFound'   (unidade não existe)
exceção no fetch      → ErrorScreen 'network'    (com botão de retry)
```

### Bugs que causavam tela branca (corrigidos)
1. **`Checkout.tsx`** — `useEffect` lia `finalTotal`, declarado depois de um `return null`. Carrinho vazio → `ReferenceError` no TDZ. Além disso, `navigate()` era chamado durante o render
2. **`ProductDetail.tsx`** — 4 hooks depois de `if (!product) return null`. Ordem de hooks variável entre renders derruba o React
3. **`App.tsx`** — erro de boot só ia para o `console.error`; o cliente via cardápio vazio sem explicação

### Regra que saiu daí
**Nenhum hook depois de um early return. Nenhum `navigate()` durante o render.**
Guards de "não encontrado" ficam abaixo de todos os hooks.

---

## Service Worker — registro único

- O `vite-plugin-pwa` já injeta `/registerSW.js` no `index.html` do build (`injectRegister: 'auto'`)
- O registro manual que existia no `main.tsx` era uma **segunda** inscrição no mesmo SW — removido
- **No servidor**: `sw.js`, `registerSW.js` e `index.html` precisam de `Cache-Control: no-cache`. Cacheados, o app trava numa versão velha e nenhum deploy chega no cliente

---

## Lógica de Precificação

### 🐛 "incluso" cobrava o preço cheio
- **Sintoma**: "Combo delícia 2", base R$29,40, bebida marcada **incluso** — e o
  rodapé fechava em **R$35,90**
- **Causa**: `getComplementPriceLabel` calculava a **diferença** ("incluso",
  "+R$2,00"), mas `calcCartItemSubtotal` somava o **preço cheio** do item. A
  etiqueta e a cobrança usavam regras diferentes
- **Regra correta** (confirmada com o dono): em grupo **obrigatório**, o item
  mais barato **já está no preço do produto**; o cliente paga só a diferença.
  Trocar Coca 300ml (R$6,50) por 500ml (R$8,50) custa **R$2,00**
- **Grupo opcional** continua somando o preço cheio — ali nada está incluso
- **Fracionado** usa o rateio, sem referência de "mais barato"

### 🐛 …e a correção estava pela metade: card e carrinho discordavam

A primeira correção fez a etiqueta e o subtotal concordarem, mas deixou **duas
funções discordando sobre o que o preço base contém**:

| | Combo delícia 2 (base R$29,40 · bebida R$6,50) |
|---|---|
| `getCardPrice` — **somava** a franquia | **R$35,90** anunciado no grid |
| subtotal — partia do base cru **e ainda descontava** o mais barato | **R$29,40** cobrado |

- **Sintoma visível**: o grid dizia R$35,90, a tela do produto abria em R$29,40, e
  o valor **subia** para R$35,90 quando o cliente marcava a bebida — como se o
  "incluso" custasse dinheiro
- **Sintoma invisível, e o que importava**: a bebida inclusa saía de graça **duas
  vezes**. R$6,50 de receita por combo vendido
- **Regra definida pelo dono**: o piso do card é a verdade. "Incluso" significa
  "não acrescenta ao piso", **não** "sai do base"

**Modelo atual — uma porta só:**

```
franquia(grupo) = obrigatório && minQty ≥ 1 ? mais_barato × minQty : 0
piso            = effectivePrice + Σ franquia(grupo)      ← getCardPrice
preço unitário  = piso + Σ groupCharge(grupo, escolhas)   ← calcUnitPrice
```

- `includedAllowance()` é a **dobradiça**: quem soma a franquia e quem a desconta
  leem da mesma função. Divergir de novo exigiria mudar as duas
- `calcUnitPrice()` é a **porta única** — tela do produto, carrinho e checkout
  chamam ela. Antes cada lado montava a própria soma
- **A partir do piso só entram acréscimos, nunca descontos**
- **Franquia é do grupo, não de cada unidade**: descontar o mais barato por item
  deixava marcar 3 refrigerantes num grupo "escolha 1, até 3" e pagar por um
- 6 testes que codificavam o comportamento errado foram substituídos — todos
  falhavam por exatamente R$6,50

> **Lição que vale além do preço:** duas funções que respondem "quanto custa" são
> uma a mais. O bug sobreviveu a uma correção porque a correção tratou o sintoma
> (etiqueta ≠ subtotal) e não a causa (dois donos do mesmo número).

### Grid sem "A partir de"
- O piso não é mínimo teórico: é o que o cliente paga escolhendo os inclusos
- "A partir de" prometia um valor menor que a própria tela do produto abria

### getCardPrice: `× minQuantity` e fracionado
- Somava o mais barato **uma vez** por grupo, ignorando `minQuantity`: grupo
  exigindo 2 escolhas de R$4 prometia +R$4 no card e cobrava +R$8
- **Grupo fracionado era ignorado**: pizza com base 0 (onde o sabor carrega o
  valor) mostrava **R$ 0,00** no card
- Agora: `base + Σ(mais barato × minQuantity)`, com fracionado rateado por
  `maxQuantity`

### Complementos em grupos obrigatórios
- Referência = item mais barato do grupo
- Igual ao mais barato → badge "incluso" (verde) + sem preço abaixo do nome
- Mais caro → badge "+R$diff" (vermelho) + sem preço abaixo do nome
- Grupos opcionais → preço cheio abaixo do nome

### Preço no card da lista
É o **piso** (`getCardPrice`), o mesmo número que a tela do produto abre exibindo —
ver "card e carrinho discordavam" acima. Exibido **sem** "A partir de".

### effectivePrice (prioridade)
1. `product.offerprice` (se menor que price)
2. `applyOffer(product.price, product.productOffer)` (se offer vinculada)
3. `product.price`

### Fracionado (ingredients: true)
- `maxQuantity` = número de frações (ex: 2 = meia pizza, 4 = quatro sabores)
- **Preço cobrado = `item.price × qty × (1 / maxQuantity)`** — o preço do item é
  rateado pela fração ocupada, nunca somado inteiro
- No payload: `unitFraction = 1 / maxQuantity`

#### Dois cadastros, mesma regra
| Tipo | Preço do item significa | Exemplo |
|---|---|---|
| **A** | o produto inteiro | pizza: sabor R$60, meia = R$30 |
| **B** | um acréscimo | sopa R$20 + ovo R$4, meio ovo = +R$2 → R$22 |

#### 🐛 Bug corrigido: `unitFraction` não entrava na conta
- `buildCartComplements` gravava `unitFraction` e o payload enviava, mas
  `calcCartItemSubtotal` fazia só `c.price * c.quantity` — **ignorando a fração**
- Duas metades de R$60 e R$70 exibiam R$65 na tela do produto e cobravam **R$130**
  no total. A tela e a conta se contradiziam
- Corrigido com `complementPrice()` em `pricing.ts`, usado também em
  `ProductDetail` (subtotal) e `CartDrawer` (linha do complemento)
- **8 testes de regressão** em `pricing.test.ts`, cobrindo meia/meia, inteira,
  quartos, terços, tipo B (sopa) e complemento normal sem fração
- ⚠️ **O payload continua mandando o preço inteiro + `unitFraction`.** O backend
  precisa multiplicar, igual faz com `quantity` — senão a cozinha recebe dobrado
  mesmo com o app certo

---

## Geração de Senha (Pedido)

Espelho exato de `GeradorDeCodigo.dart`:

```
consumptioncode (mesa)   = nome da mesa (ex: "MESA_03")
consumptioncode (balcão) = gerarCodigoAlfaNumerico() = ex: "A042"
consumptionint           = getOrCreateNumero() = 500..999  (nº do pedido, não a senha)
```

### Formato da senha do balcão — corrigido
- **Era** `gerarHibridoTempoAleatorio()` → `3K4M`, letras e números embaralhados
- **É** `gerarCodigoAlfaNumerico()` → `A042`, 1 letra + N dígitos
- **Motivo**: a senha é **chamada em voz alta** no painel. Soletrar
  "três-K-quatro-M" no microfone é lento e confunde; `A042` é o padrão de painel
  e o mesmo do totem
- **Alfabeto sem `I` e `O`**: lidos de longe viram `1` e `0` e o cliente vai ao
  balcão com a senha errada
- **Dígitos configuráveis** em `settingsWeb.passwordDigits` (padrão 3)

### ⚠️ Colisão de senha
O sorteio é local, sem consultar o que já existe:

| Dígitos | Combinações | ~50% de repetir em |
|---|---|---|
| 3 | 24.000 | **~180 pedidos** |
| 4 | 240.000 | ~580 pedidos |

Em casa movimentada, 3 dígitos repetem no mesmo serviço e duas pessoas atendem à
mesma chamada. **A solução é o backend devolver `consumptioncode` no POST** —
`Confirmation.tsx` já lê `state.order.consumptioncode` se vier. Enquanto isso,
usar `passwordDigits: 4`.

- Gerado uma vez na primeira adição ao carrinho (`initCodes()`)
- Fixo até `clearCart()` após envio

---

## Analytics

### Modelo "os dois em paralelo"
- Branch vê os próprios eventos no Pixel/GA4 dela
- Plataforma vê tudo consolidado nos IDs globais (.env)
- Meta Pixel: `fbq('init', ID1)` + `fbq('init', ID2)` — todos os eventos vão para os dois
- GA4: `gtag('config', ID1)` + `gtag('config', ID2)` — idem

### Consentimento LGPD
- Chave: `localStorage['cardapio_consent'] = 'granted' | 'denied'`
- Scripts só são injetados após aceite
- `ConsentBanner.tsx` só aparece se `hasAnswered() === false`
- Em visitas posteriores: `initAnalyticsIfConsented()` chamado no boot

### IDs por branch
```json
// branch.settingsWeb (campo novo a criar no backend)
{
  "metaPixelId": "123456789012345",
  "gaId": "G-XXXXXXXXXX"
}
```

---

## Embalagem Takeaway

Espelho de `Product.injectTakeawayPackaging()`:
- Quando `whereConsume` muda para `OutsideLocal`, grupos com `isTakeawayPackaging: true && autoAdd: true` têm seus itens adicionados automaticamente com `isPackaging: true`
- Na volta para `OnLocal`, itens de embalagem são removidos
- Itens de embalagem são excluídos do display de complementos no carrinho (filtro `c.isPackaging`)

---

## Edição de Item no Carrinho

- URL: `/produto/:id?editIndex=N`
- `ProductDetail` detecta `editIndex` param
- `cartComplementsToSelectedByGroup()` reconstrói o Map de seleções a partir de `CartComplement[]`
- Ao salvar: `updateItem(index, ...)` ao invés de `addItem()`

---

## Cache de Imagens

Espelho de `ImageCacher.dart`:
1. `extractImageUrl()` — prioridade: `staticImage[0].photo` > `sliderHeader.image[0].photo`
2. `preloadMenuImages()` — batches de 6 para não saturar a rede
3. `getCachedUrl()` — retorna blob URL da Cache API ou URL original
4. `ImageWithFallback` — skeleton → imagem com fade, fallback cinza

### Pendência conhecida: CORS nos buckets S3

Os buckets `klavi-img` e `berpimagescloud` não devolvem `Access-Control-Allow-Origin`.
Como `cacheImage()` usa `fetch(url, { mode: 'cors' })`, o browser bloqueia a leitura e
o console enche de erro. Sinal característico: **`net::ERR_FAILED` acompanhado de
`200 (OK)`** — o arquivo foi entregue, o browser é que não deixou o JS lê-lo.

**Não quebra nada visualmente**: `<img src>` não precisa de CORS, o `catch {}` engole a
falha e `getCachedUrl()` devolve a URL original. Custo real:
- Sem pré-aquecimento — a imagem só carrega quando entra na tela
- Sem imagens offline no PWA
- Cada imagem baixada duas vezes (o `fetch` que falha + a `<img>` que funciona)

**Correção**: CORS no bucket (config em `DEPLOY.md` §4.3). Alternativa sem mexer no
bucket: trocar o `fetch`+Cache API por `new Image()`, que aquece o cache HTTP normal
sem CORS — mas aí perde-se o offline.

---

## Validação de CPF
- `isValidCPF` confere os **dois dígitos verificadores** e recusa sequências
  repetidas (`111.111.111-11` passa na conta, mas a Receita não emite)
- `maskCPFInput` formata enquanto digita e **corta em 11 dígitos** — sem o corte
  o campo aceitava 15 números e o CPF chegava truncado na nota
- `cpfState` → `empty` | `incomplete` | `invalid` | `valid`. **Vazio não é erro**:
  o campo é opcional
- **O Checkout não validava** — só o Perfil. CPF errado ia para a nota fiscal e o
  cliente descobria no caixa. Agora bloqueia o envio com toast
- No payload vai **só dígitos** (`replace(/\D/g,'')`), sem máscara
- 37 testes em `cpf.test.ts`

## Avatar do cliente
- Foto no perfil, guardada em `localStorage['cardapio_avatar']` como data URL
- **Nunca vai no pedido nem para o servidor** — é enfeite para o cliente
  reconhecer o próprio perfil. Foto de rosto é dado pessoal e o restaurante não
  tem finalidade para ela
- **Redimensiona para 256px e comprime a 82%** antes de gravar: foto de celular
  tem 4–8 MB e o localStorage inteiro tem ~5 MB. Sem isso, estourava a cota e
  derrubava **também** nome, telefone e histórico, que moram no mesmo storage
- Recorte central quadrado — avatar redondo com foto esticada fica torto
- `clearAvatar()` no "apagar meus dados": a foto está em chave separada e
  sobreviveria à limpeza, que é o oposto do que o cliente espera
- Aparece na aba de Perfil substituindo o ícone
- Sem `capture` no input, de propósito: com ele o sistema força a câmera e tira
  a opção de usar foto da galeria

## Imagem ausente
- Mostra a **inicial do item** sobre fundo da cor da marca
- Antes era um ícone genérico de "foto", que lia como **imagem quebrada** — o
  cliente achava que o app tinha falhado. A inicial parece decisão de design e
  distingue um item do outro na grade
- Tamanho da fonte em `clamp(11px, 42%, 64px)`: o mesmo componente serve a foto
  de 24px da aba de categoria e o hero de 256px do produto

## Segurança do `simpleAuth`

O `simpleAuth` vem no `GET api/branches` e é compilado dentro do bundle JavaScript.
**Qualquer visitante consegue extraí-lo** abrindo o DevTools.

- Ele autentica a **branch**, não o usuário — essa é a premissa do desenho, não um defeito
- Consequência: sem rate limit no `POST api/orders`, um `curl` inunda a cozinha de pedidos falsos
- **Mitigação obrigatória no backend**: `throttle:20,1` na rota de pedidos
- O mesmo vale para as `VITE_*` do `.env` — são públicas por natureza. Nunca colocar segredo ali

---

## Link do QR: validar antes de gastar requisição

### 🐛 "Sem conexão" era o destino de toda falha
- **Sintoma**: `?branch=658afd3d0ce8b35` (15 caracteres, não 24) dava
  *"Sem conexão com o cardápio — verifique sua internet"*
- **Causa**: o `_id` cortado ia para a API, o Mongo estourava, e o `catch` do boot
  tinha uma linha: `setBootError('network')`
- **Duplo erro**: a mensagem era falsa **e** jogava no cliente a culpa por um
  problema que estava no adesivo da mesa — ele reinicia o Wi-Fi do restaurante
  para consertar um QR torto
- **Correção em duas frentes**:
  - `qrParams.ts` valida formato **sem rede** (ObjectId 24 hex, `mode` conhecido,
    `mode=mesa` exige `table`) → link ruim vai direto à leitura de QR
  - `ApiError` guarda o status: `0` = não chegou (única "sem conexão" verdadeira),
    400/404/422 = link não aponta para nada, 5xx = servidor caiu
- **5 motivos de boot, 3 saídas** — a tela é definida pela **saída que o cliente
  tem**, não pela falha
- O motivo técnico vai para o `console.error` ("tem 15 de 24 caracteres"): é assim
  que a casa descobre que gerou QR errado. O cliente só lê "Link incompleto"

### Valor desconhecido é ignorado, nunca adotado
- `allowedModes: ["cartao"]` fazia o app adotar `cartao` como modo interno **em
  silêncio** — sem erro, sem tela, só com a regra de pagamento e a senha erradas
- Agora `allowedModes` é filtrado por `isKnownMode`; sem nenhum válido, vale o modo
  do QR

### Scanner: QR que não serve não desliga a câmera
- Ler um QR torto recarregava a página, caía na tela de erro, e o cliente
  escaneava o mesmo QR de novo — em círculo
- Valida com o **mesmo** `parseQrParams` antes de navegar, e continua lendo
- Bug irmão: o branch de "não é URL" agendava um `readFrame` e jogava o resultado
  fora — o loop morria e a câmera ficava aberta sem ler nada

---

## Storage: escopo por company e validade

### 🐛 Todas as empresas dividiam o mesmo localStorage
- Servidas pelo mesmo domínio, o CPF digitado no restaurante A ficava legível para
  a página do B. O filtro por branch na tela de histórico é **exibição**, não
  isolamento — o dado estava lá
- `storageScope.ts` prefixa: `cardapio_client__c:<companyId>`
- `setStorageScope()` roda no boot **antes da primeira leitura**; por isso nenhum
  módulo monta a chave no topo do arquivo

### Migração apaga o legado ao adotar
- Dado global não tem company de origem. Adotá-lo em *todas* reproduziria o
  vazamento que o prefixo veio consertar
- Apagando na primeira adoção, ele vai para **uma** company só

### Consentimento não migra nem herda — decisão jurídica, não técnica
- Consentir é ato dirigido a um **controlador**: aceitar o rastreio do restaurante
  A não autoriza o do B, ainda que o app e a pessoa sejam os mesmos
- Herdar o "aceito" ligaria o Pixel de uma empresa que o cliente nunca autorizou —
  e ele não veria banner algum para descobrir
- Custa responder uma vez por empresa. É o custo certo
- **Idioma fica global** de propósito: a pessoa fala espanhol em qualquer
  restaurante, e não é dado pessoal

### Carrinho: descartado, não prefixado
- `sessionStorage` sobrevive ao reload, e o scanner recarrega a página: escanear o
  QR de outra company mantinha o carrinho anterior, com produtos inexistentes no
  cardápio novo
- Prefixar guardaria **dois** carrinhos. Ninguém retoma o pedido do restaurante
  que já deixou

### Validade (`cartTtlMinutes`, padrão 4h)
- `sessionStorage` só morre com a aba, e aba de celular fica **semanas** aberta:
  o cliente reabria dias depois com o pedido montado aos preços de então
- A senha (`consumptioncode`) vence junto: a de ontem cai numa comanda já paga
- Relógio que anda para trás também descarta — sem saber a idade real, o seguro é
  o preço novo
- **Sem regra de "virou o dia", de propósito**: cortaria quem pediu às 23h50 e
  voltou às 00h30, o mesmo atendimento que `businessPeriod` já trata como serviço
  único. Casa que atravessa a madrugada aumenta o TTL

---

## Conta: mostrar sem somar

### 🐛 Pedido cancelado sumia da tela
- Era filtrado do total **e** da lista. Para quem viu o item ali dois minutos
  antes, isso parece defeito do app — ou que a casa mexeu na conta escondido
- Agora: `visible` (tudo que aparece) e `active` (o que soma) são listas separadas
- Item `cancelled`/`transferred` aparece riscado, com o motivo. `transferred` diz
  para onde foi
- Cancelamento **por item** não existia no modelo: um item cancelado dentro de um
  pedido de 5 era **somado**
- `orderTotal` recalcula pelos itens ativos quando há excluído, em vez de confiar
  no cabeçalho: um item riscado como "Cancelado" sendo cobrado no total é a
  contradição mais destrutiva possível, na mesma tela

### Fração vem sempre de fora
- Self-service pesa o prato: `quantity: 0.412` com `unit: 'kg'`
- **O app nunca lança item fracionado** — não há caminho na interface e não deve
  haver. É somente leitura para essas linhas
- `roundQty` **a cada acumulação**: `0.412 + 0.385` em float dá
  `0.7970000000000001`, e isso ia direto para a tela do cliente
- Mesmo produto com unidades diferentes vira **linha separada**: `1 un` + `0,4 kg`
  não é `1,4` de nada

---

## Status do pedido: o app lê, ninguém move

### Habilitado pelo backend, desligado por padrão
- Quem promove `pending → in_progress → ready` é o **KDS/PDV**, não o app
- Sem KDS, o cliente olha "Aguardando cozinha" indefinidamente, conclui que o
  pedido não chegou, e **chama o garçom para conferir** — exatamente o trabalho
  que o cardápio deveria poupar
- Por isso `orderStatusEnabled` ausente = **desligado**: status que ninguém move é
  pior que status nenhum. Desligado, o app não faz poll nem promete nada
- `passwordPanelEnabled` é chave **separada**: existe casa com KDS e sem painel
  (garçom leva à mesa) e painel alimentado à mão sem KDS

### 🐛 "Saindo para a mesa" no balcão
- A tabela de mensagens era única, e o `ready` dizia "Saindo para a mesa" também
  no balcão — onde não existe mesa. O cliente esperava sentado em vez de buscar
- Mensagens agora são por **modo**; `on_the_way` só ocorre em delivery
- `statusChip()` é compartilhado pelas três telas: eram três tabelas soltas, e o
  mesmo `ready` já apareceu como "Pronto", "Pronto! Saindo…" e "Saindo para a mesa"
  no mesmo app

### Status na conta resumida é agregado, não por linha
- A resumida junta itens de pedidos **com status diferentes**: "Frango crocante ×3"
  pode ter um pronto e dois na chapa. Chip por linha seria mentira
- Agregado por pedido ("2 em produção · 1 pronto"), em ordem fixa para a fila não
  dançar entre atualizações

---

## Histórico: pagamento tem três estados

### Não sabemos é um estado, e é o mais comum
- Em **balcão, totem, caixa, garçom e entrega** o dinheiro passa por fora: o app
  sabe que **enviou** o pedido, não que foi pago
- Deduzir pago de "o pedido saiu" custa dos dois lados: quem lê "Pago" sem ter
  pagado é parado na frente da fila; quem lê "Pago" com o caixa discordando
  confia no celular e discute
- Só `via: app|pos` **com** `status: paid` produz "Pago". O resto diz
  "Pagamento no balcão · **não confirmado no app**"
- `status` ausente é a resposta correta do backend, não uma falha de preenchimento

### Agrupado por data, não por branch
- O cliente típico usa uma unidade só: agrupar por branch daria um único grupo
  colapsável — um toque a mais para não revelar nada
- Data é como se procura pedido passado ("foi ontem"). A unidade entra como
  etiqueta, e só quando há mais de uma
- Chave do dia é **local**, nunca `toISOString()`: em GMT-3 um pedido das 22h
  viraria o dia seguinte e o cliente leria "Ontem" num pedido feito à noite
- Mostra todas as unidades da **mesma empresa** — seguro porque o storage já é
  isolado por company

### Endereço no pedido é cópia, não referência
- Editar "Casa" depois faria a comanda de ontem mostrar o endereço novo, e o
  histórico deixaria de bater com o que foi entregue

---

## Loja aceitando pedido: reverificar antes de enviar

- O boot checa o horário quando o cliente **abre** o cardápio — pode ter sido há
  duas horas. Nesse meio a casa fecha, o período vira, o gerente pausa
- O `Checkout` reconsulta `GET api/branches` antes do POST e respeita
  `acceptingOrders` (ausente = aceitando)
- **Falha de rede não bloqueia**: travar o pedido por soluço de rede impede venda
  legítima com o cliente de pé no salão. O POST decide
- **Não substitui a validação do backend**: roda no aparelho do cliente. Serve
  para *explicar* ("a loja fechou enquanto você montava o pedido") em vez de
  devolver erro genérico

---

## O Que Ainda Falta

### Backend (bloqueia o envio de pedido)
1. Campo `settingsWeb.simpleAuth` no model Branch
2. Middleware no `POST api/orders` aceitando sem Bearer quando `body.simpleAuth` bate
3. Rate limit na rota de pedidos (ver seção acima)

### Backend (opcional — o app degrada em silêncio se faltar)
4. `settingsWeb.metaPixelId` + `settingsWeb.gaId` para analytics por branch
5. `GET api/orders` (polling de status), `POST api/waiter-call`, `POST api/reviews`

### Infra
6. Fallback de SPA no servidor — sem ele, refresh em `/checkout` dá 404 (ver `DEPLOY.md`)
7. CORS liberando o domínio do cardápio
8. HTTPS — Service Worker, Cache API e `vibrate` não funcionam em HTTP

### Frontend
9. Testar com API real e ajustar mapeamentos de JSON se necessário
10. Monitoramento de erro (Sentry) — o `ErrorBoundary` já centraliza, falta reportar
11. Limpar avisos de lint remanescentes: `set-state-in-effect` (Home, CartDrawer, ProductDetail, ImageWithFallback), `purity` no `ClosedScreen` (`new Date()` durante o render), `refs` no `ImageCarousel`. Nenhum quebra nada hoje
12. `ImageCarousel.tsx` é código morto — decidir se entra em uso ou sai

### Resolvido
- ✅ Ícones PWA reais (`icon-192.png` 192×192, `icon-512.png` 512×512, `apple-touch-icon.png` 180×180)
- ✅ Embalagem takeaway automática, CartDrawer, edição de item, cupom, busca, ofertas, skeleton
- ✅ Tratamento de erro de boot e de render

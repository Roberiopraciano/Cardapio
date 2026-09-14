# Backend Laravel — Tudo que o Cardápio Precisa

Contrato completo entre o app React e a API. Organizado por prioridade: sem os itens
**obrigatórios** o cardápio não fecha pedido; os demais degradam em silêncio.

> Convenção deste documento: `settingsWeb` é o objeto de configuração do cardápio
> dentro do model **Branch**. Tudo que é por-unidade mora lá.

---

## Sumário

1. [Autenticação](#1-autenticação)
2. [Endpoints de leitura](#2-endpoints-de-leitura)
3. [Envio do pedido](#3-envio-do-pedido)
4. [Conta da mesa](#4-conta-da-mesa)
5. [Comanda por cliente](#5-comanda-por-cliente)
6. [Idiomas](#6-idiomas)
7. [Geração de QR Code](#7-geração-de-qr-code)
8. [Analytics e tema](#8-analytics-e-tema)
9. [Endpoints auxiliares](#9-endpoints-auxiliares)
10. [Infraestrutura](#10-infraestrutura)
11. [Checklist](#11-checklist)

---

## 1. Autenticação

O cardápio **não tem login**. A autenticação é por branch, via `simpleAuth`.

### Obrigatório

```
Branch.settingsWeb.simpleAuth : string   // token único por branch
```

- `GET api/branches` deve retornar `settingsWeb` populado
- Middleware no `POST api/orders` aceita a requisição **sem Bearer** quando
  `body.simpleAuth` bate com o da branch informada em `body.branch`

### ⚠️ Limite do desenho — e a mitigação obrigatória

O `simpleAuth` chega ao browser e é legível no DevTools de qualquer visitante. Ele
autentica a **branch**, não o usuário — isso é premissa, não defeito. A consequência
prática é que um `curl` consegue inundar a cozinha de pedidos falsos.

```php
// Sem isto, não colar QR Code em mesa
Route::post('orders', ...)->middleware('throttle:20,1');
Route::get('orders', ...)->middleware('throttle:60,1');
```

Considerar também: rejeitar pedido cuja mesa não tenha atendimento aberto (§4) — isso
sozinho já barra a maior parte do abuso.

---

## 2. Endpoints de leitura

Todos públicos, sem Bearer. O app dispara os seis últimos em paralelo no boot.

| Método | Endpoint |
|---|---|
| GET | `api/branches?_id=ID` |
| GET | `api/company?_id=ID` |
| GET | `api/product-categories?branch=ID&locationTypes[$in][]=8&disabled=false&$limit=false` |
| GET | `api/products?branch=ID&$limit=false&active=true` |
| GET | `api/complements-groups?branch=ID&$limit=false&locationTypes[$in][]=8` |
| GET | `api/complements-groups-categories?branch=ID&$limit=false` |
| GET | `api/periods?branch=ID&$limit=false` |
| GET | `api/offers?branch=ID&disabled=false&$limit=false` |

### Requisitos

- `branch.company` populado com o `_id` da empresa (o boot usa para buscar o tema)
- `Cache-Control: no-store` nessas rotas, ou pelo menos não cachear — o app já manda
  `no-store`, mas proxy intermediário pode ignorar
- **Preço e estoque precisam estar corretos em tempo real.** O app não cacheia mais
  nada de API justamente por isso

### Formatos que o app espera

**Period** — dias da semana com faixas:
```json
{ "period": { "monday": [{ "from": "08:00", "to": "22:00" }], "tuesday": [] } }
```
Faixa que vira a meia-noite (`to < from`, ex: `18:00`→`02:00`) é suportada.

**Stock**:
```json
{ "stock": { "active": true, "currentQuantity": 0 } }
```
`active: false` = sem controle de estoque → disponível.

**Complements group** — regras **aninhadas em `rules`**:
```json
{ "rules": { "minQuantity": 1, "maxQuantity": 1, "mandatory": true } }
```

> **Falta `maxPerItem`** — quantas vezes o **mesmo** item pode entrar. Sem ele o
> app não distingue "escolha 3 sabores, um de cada" (checkbox) de "até 5 porções
> de bacon" (contador), e usa contador nos dois. Ver `ROADMAP.md` Fase 2.5.

**Complements group category** — é `name`, e **não** lista os grupos:
```json
{ "_id": "...", "name": "Refrigerantes", "seq": 3, "active": true }
```
Quem aponta para a subcategoria é o **item**, via `complementGroupCategory`.
Hierarquia: grupo ("Escolha o sabor da sua bebida") → subcategorias → itens.

---

## 3. Envio do pedido

```
POST api/orders
```

Payload montado em `src/pages/Checkout.tsx`:

```jsonc
{
  "branch": "<branchId>",
  "simpleAuth": "<token da branch>",
  "consumptioncode": "MESA_03",   // mesa: nome da mesa · balcão: senha gerada
  "consumptionint": 812,          // 500..999
  "locationType": 8,
  "amount": 64.8, "subtotal": 64.8, "total": 64.8,
  "totemClientName": "Ana",
  "phone": "11955554321",
  "cpfCustomer": "...",           // opcional
  "comanda": "12",                // só quando settingsWeb.comandaEnabled
  "note": "sem cebola",
  "paymentMethod": { "type": "table", "kind": "Cardápio", "label": "Pagar na mesa" },
  "additionalInfo": { "modality": "Consumir no local", "whereConsume": "OnLocal" },
  "origin": "cardapio",           // ← marca a autoria, ver §4
  "items": [
    {
      "product": "<id>", "name": "Frango crocante",
      "originalPrice": 25.9, "price": 25.9, "amount": 51.8,
      "quantity": 2, "note": "",
      "complements": [
        { "_id": "<grupoId>", "name": "Deseja uma Bebida?",
          "items": [{ "_id": "<itemId>", "name": "Coca cola 300ml",
                      "price": 6.5, "quantity": 2, "unitFraction": 1 }] }
      ]
    }
  ]
}
```

### ⚠️ Quantidade de complemento é POR UNIDADE

`complements[].items[].quantity` é a quantidade **por unidade do produto**. No exemplo
acima: 2 Frangos, cada um com 2 Cocas = **4 Cocas** no total.

**O backend precisa multiplicar** `complemento.quantity × item.quantity`. O app já faz
isso no preço enviado (`amount`) e na exibição, mas o payload mantém a forma aninhada
para não divergir do totem Flutter.

### "Adicione também" e observações prontas

Dois recursos que hoje **não têm administração de verdade** no painel.

#### `customSuggestions` — observações prontas

```jsonc
{ "customSuggestions": ["Natural", "Sem gelo"] }
```

Array de textos que o app oferece como **atalho no campo de observação**. No
cadastro real vem `["Natural"]` em latas de refrigerante — pedido de bebida não
gelada.

O app mostra cada item como chip; tocar insere no campo, tocar de novo remove. A
observação continua texto livre.

**O que falta no painel:** editor desses textos por produto. Hoje só dá para
preencher direto no banco.

> Estavam sendo exibidos como bloco decorativo "Vai bem com…", com chips não
> clicáveis — o cliente lia "Natural" e ainda tinha de digitar a palavra.

#### `suggestionCategory` — o "Adicione também"

```jsonc
{ "suggestionCategory": "global" }   // ou um id/rótulo de agrupamento
```

Regra atual do app: se o produto tem `suggestionCategory` **diferente** de
`"global"`, sugere outros produtos com a mesma `suggestionCategory` ou com
`"global"`.

**⚠️ Isso não funciona na prática.** No cadastro real **quase todo produto** tem
`suggestionCategory: "global"`, então a regra vira "sugira qualquer coisa" — e o
resultado é aleatório.

Pior: **item de complemento é um `Product` na mesma collection.** "Trocar pão
árabe para o pão bola" (R$1,00) aparecia como sugestão porque é Product e tem
`suggestionCategory: "global"`.

**Filtros que o app aplica hoje** para não exibir lixo:

| Filtro | Motivo |
|---|---|
| `category` não vazia | item de complemento não pertence a categoria do cardápio |
| não estar nos `items` dos grupos do próprio produto | já é complemento dele |
| não esgotado | sugerir o que acabou é frustrante |
| preço > 0 | item de R$0,00 não é venda adicional |

**O que deveria existir no backend** — sugestão explícita, não inferida:

```jsonc
// Opção A (recomendada): lista por produto
{ "suggestedProducts": ["<idSobremesa>", "<idBebida>"] }

// Opção B: por categoria, para não cadastrar item a item
{ "suggestedCategories": ["<idSobremesas>"] }
```

| # | Item | Por quê |
|---|---|---|
| S1 | `suggestedProducts` explícito por produto | quem conhece o cardápio escolhe o que combina |
| S2 | Fallback por categoria | evita cadastrar produto a produto |
| S3 | Ordem controlada | o primeiro item é o que mais converte |
| S4 | Nunca sugerir item de complemento | filtrar por `category` no backend também |

> **Venda adicional é decisão comercial, não estatística.** "Adicione uma
> sobremesa" ao lado de um combo funciona; "Trocar pão árabe" ao lado de um
> milkshake só ocupa espaço e ensina o cliente a ignorar o bloco.

### ⚠️ Pedido do celular NÃO define forma de pagamento

O `paymentMethod` que o app envia é **rótulo de intenção**, não escolha de meio
de pagamento:

```jsonc
{
  "paymentMethod": {
    "type": "table",          // table | counter — onde o cliente vai pagar
    "kind": "Cardápio",       // canal de origem
    "label": "Pagar na mesa"  // texto para o operador ler
  }
}
```

**O backend não deve exigir forma de pagamento neste POST.** O cliente está
montando pedido no celular, não pagando: quem escolhe dinheiro, cartão, Pix ou
voucher é o caixa, no momento de fechar.

| Modo | Quando o pagamento é definido |
|---|---|
| `mesa` | no fechamento da conta, pelo garçom ou caixa |
| `balcao` | na retirada, no balcão |
| `delivery` | no checkout (aí sim o app escolhe) — ver `ROADMAP.md` Fase 4 |

**O que o Laravel precisa fazer:**

- [ ] `paymentMethod.type` e `label` são informativos — não validar contra a
      tabela de meios de pagamento cadastrados
- [ ] Aceitar pedido **sem** `paymentMethodId` / `formaPagamento`
- [ ] Criar o pedido em estado **"aguardando pagamento"**, não "pago"
- [ ] Deixar o caixa/garçom atribuir o meio real no fechamento
- [ ] `branch.paymentMethods` continua servindo ao PDV; o cardápio não usa

> **Por que insistir nisso:** se o `POST api/orders` exigir forma de pagamento, o
> app precisa perguntar "como você vai pagar?" antes de mandar para a cozinha —
> uma pergunta que o cliente na mesa não sabe responder (ele nem pediu a conta) e
> que o garçom vai ter de corrigir depois. Um campo obrigatório no lugar errado
> gera retrabalho no salão todo dia.

**Quando o app passar a cobrar**, isso muda — e por modo, não de uma vez. Os
caminhos previstos estão em `ROADMAP.md` Fase 3.5: gateway no app, POS online
(cobrança empurrada para a maquininha), contra-senha para pagar no TEF do totem,
caixa, e pagar na entrega com troco. Todos ligáveis por célula em
`settingsWeb.paymentMethods`, e **todos desligados por padrão** — o
comportamento atual (não cobrar) continua sendo o certo até o contrário ser
configurado.

### ⚠️ `unitFraction` — grupos fracionados

Grupo com `ingredients: true` (pizza meia a meia, sopa de dois sabores) manda cada
item com o **preço cheio** e um `unitFraction`:

```jsonc
{
  "_id": "<grupoId>", "name": "Escolha os sabores",
  "items": [
    { "name": "Calabresa",  "price": 60, "quantity": 1, "unitFraction": 0.5 },
    { "name": "Marguerita", "price": 70, "quantity": 1, "unitFraction": 0.5 }
  ]
}
```

Fórmula completa que o backend precisa aplicar:

```
valor_do_complemento = price × quantity × unitFraction × quantity_do_item
```

No exemplo: `60×1×0.5 + 70×1×0.5` = **R$ 65,00** — não R$ 130,00.

Vale para os dois cadastros:
- **Pizza**: o `price` é o da pizza inteira, e a fração rateia
- **Sopa/açaí**: o `price` é um acréscimo (ovo R$4), e a fração rateia igual → +R$2

> Esse mesmo erro existia no app: `unitFraction` era enviado mas não entrava na
> conta, e a pizza saía pelo dobro. Corrigido no frontend com testes de regressão.
> **Conferir com um pedido real que o Laravel também aplica**, senão a cozinha
> recebe o valor dobrado mesmo com o app correto.

---

## 4. Conta da mesa

Tela `/conta` (`src/pages/TableBill.tsx`). **Hoje roda com mock** — ver
`src/lib/mockBill.ts`, constante `MOCK_BILL`.

### O problema central: qual "MESA_03"?

O app consulta:
```
GET api/orders?consumptioncode=MESA_03&branch=ID&simpleAuth=TOKEN&$sort[createdAt]=-1&$limit=50
```

Isso devolve **todos os pedidos que a MESA_03 já teve, de qualquer dia**. Quem senta
hoje veria a conta de ontem somada à sua. `consumptioncode` identifica a *mesa*, não o
*atendimento*.

### Obrigatório: conceito de atendimento aberto

| Abordagem | Consulta | Observação |
|---|---|---|
| **`tableSession`** (recomendado) | `?tableSession=<id>` | id novo a cada abertura; sobrevive a mesa fechada e reaberta no mesmo dia |
| `closedAt` nulo | `?consumptioncode=MESA_03&closedAt[$eq]=null` | simples, mas exige disciplina no fechamento |
| Flag `open` | `?consumptioncode=MESA_03&open=true` | idem |

Com `tableSession`, o QR Code da mesa continua estático — o app manda o
`consumptioncode` e o backend resolve qual sessão está aberta.

### Resposta esperada

```jsonc
{
  "data": [ /* pedidos SÓ da sessão aberta */ ],
  "session": {
    "id": "sess_7f3a",                     // muda a cada abertura de mesa
    "status": "open",                      // open | closed | paid | cancelled
    "openedAt": "2026-07-29T19:30:00Z",
    "closedAt": null,                      // preenchido ao fechar
    "waiter": { "name": "Marcos" },        // garçom responsável pela MESA
    "table": "MESA_03"
  }
}
```

### Ciclo de vida da sessão

```
abre mesa → open → (pedidos) → garçom fecha → closed/paid → nova sessão
```

**Regras que o backend precisa garantir:**

1. Abrir a mesa gera `session.id` **novo**. A mesma MESA_03 amanhã é outra sessão
2. `GET api/orders` devolve **apenas** os pedidos da sessão aberta
3. `POST api/orders` **rejeita** pedido em mesa sem sessão aberta
4. Fechar/pagar muda `status` e preenche `closedAt`

> **Regra 3 não é só higiene, é segurança.** O `simpleAuth` é público (§1). Se o
> backend aceitar pedido em mesa fechada, qualquer um lança pedido em qualquer
> mesa a qualquer hora. Recusar fora de sessão aberta corta a maior parte disso
> sem depender só do rate limit.

**O problema concreto que a sessão resolve:** garçom fecha a MESA_03, outro
cliente senta em seguida. O celular do cliente anterior, ainda com o app aberto,
continua enxergando a mesa e consegue lançar pedido na comanda de quem chegou
depois — cobrando a pessoa errada. Com `session.id`, o app detecta a troca no
próximo poll e se encerra.

### Sessão no balcão — ciclo diferente

**No balcão não existe mesa para abrir e fechar.** O cliente pede, paga na hora e
leva. Tratar os dois modos com o mesmo conceito é o erro a evitar:

| | Mesa | Balcão |
|---|---|---|
| O que agrupa | o **atendimento** da mesa | o **pedido** |
| Chave | `session.id` da mesa | o próprio `consumptioncode` (senha) |
| Vários pedidos juntos | sim, acumulam na conta | não, cada senha é uma venda |
| Quem encerra | garçom, ao fechar e receber | pagamento no balcão |
| Encerra quando | `status: closed/paid` | pedido entregue |
| Tela de conta | soma tudo da sessão | **não existe** — é "Meus pedidos", local |

**Consequência para o backend:**

```jsonc
// mesa → sessão de verdade
GET api/orders?tableSession=sess_7f3a
{ "session": { "id": "sess_7f3a", "status": "open", "openedAt": "...", "waiter": {...} },
  "data": [ /* todos os pedidos da mesa */ ] }

// balcão → sem sessão; a senha já delimita
GET api/orders?consumptioncode=3K4M&branch=...
{ "data": [ /* os pedidos daquela senha */ ] }   // "session" ausente
```

O app já lida com `session` ausente — a tela simplesmente não mostra o cabeçalho
de abertura/garçom. **Não invente uma sessão sintética para o balcão**: ela não
tem quem a feche, ficaria aberta para sempre e viraria lixo no banco.

**O que encerra a sessão de balcão no cliente:** o `consumptioncode` é gerado na
primeira adição ao carrinho e limpo no `clearCart()` após o envio. Cada pedido
novo gera uma senha nova. É o suficiente — não há estado compartilhado entre
clientes como na mesa.

A tela mostra o horário de abertura e o tempo decorrido ("há 1h 25min"), atualizado a
cada minuto.

### Campos de cada pedido

```jsonc
{
  "_id": "...",
  "status": "pending|in_progress|ready|delivered|cancelled",
  "createdAt": "2026-07-29T20:14:00Z",
  "origin": "cardapio",            // ausente = veio do PDV/garçom
  "totemClientName": "Ana Paula",  // quem pediu
  "phone": "11955554321",          // a tela exibe só os 4 últimos dígitos
  "comanda": "12",                 // quando a branch usa comanda
  "total": 64.8,
  "discount": 6.48,                // desconto do pedido (cupom)
  "serviceTax": 6.48,              // taxa de serviço
  "coupon": { "_id": "...", "title": "BEMVINDO10" },
  "operator": { "name": "Marcos" },// quem lançou, quando foi o atendente
  "items": [
    { "name": "...", "quantity": 2, "amount": 51.8,
      "discount": 5,               // desconto NESTE item (cortesia)
      "complements": [ { "name": "...", "items": [ { "name": "...", "quantity": 4 } ] } ] }
  ]
}
```

### Autoria: como o app decide hoje

```
order.origin === 'cardapio'  → "📱 Você" (se telefone bate) ou o nome da pessoa
qualquer outro / ausente     → "🧑‍🍳 Atendente"
```

**É inferência.** Enquanto não houver campo dedicado, "Atendente" significa apenas
"não veio do cardápio" — um canal novo que esqueça de mandar `origin` é classificado
errado.

**Recomendado:**
```json
{ "createdBy": { "type": "customer" | "staff", "name": "Marcos" } }
```

### Chaves que ligam e desligam a tela

```
Branch.settingsWeb.billEnabled         : boolean   // padrão TRUE
Branch.settingsWeb.billDetailedEnabled : boolean   // padrão TRUE
```

| Chave | `true` (padrão) | `false` |
|---|---|---|
| `billEnabled` | aba "Conta" aparece e `/conta` funciona | aba some e a rota redireciona para o cardápio |
| `billDetailedEnabled` | cliente alterna entre **Resumida** (padrão) e **Detalhada** | só a resumida; o seletor some |

Desligar `billDetailedEnabled` faz sentido onde a casa não quer expor quem pediu o
quê na mesa — a resumida mostra o consumo somado, sem autoria.

> No **modo balcão** a aba "Conta" nem existe: não há conta de mesa para consultar.
> Ali a terceira aba é "Pedidos", que lê o histórico local do aparelho
> (`src/lib/orderHistory.ts`), sem depender da API.

### Horário de atualização — por que importa

A tela carimba "Atualizado às HH:MM" no rodapé e destaca em âmbar quando o dado passa
de 2 minutos ou a última busca falhou.

Isso não é enfeite: quando a API cai, a tela segue exibindo o último dado que
conseguiu buscar. Sem o carimbo, o cliente compara com o app do garçom, vê valores
diferentes e conclui que **alguém está cobrando errado**. Com o carimbo, a diferença
tem explicação visível na própria tela.

Se o backend expuser um horário próprio de fechamento parcial, mandar em
`session.updatedAt` — a tela passa a preferir esse valor ao horário do fetch.

### Delivery — endereços do cliente e taxa de entrega

> Depende da Fase 4 (cardápio de delivery). Documentado aqui porque a **taxa é
> cálculo de servidor**, e essa decisão não deve esperar a implementação.

#### Endereços: vários por cliente

O cliente pede de casa, do trabalho e da casa da mãe. Guardar um endereço só
obriga a redigitar a cada pedido, e é onde ele desiste.

```jsonc
// GET api/customer-addresses?phone=5511988887777&branch=…&simpleAuth=…
{ "data": [
  { "_id": "addr_1", "label": "Casa", "isDefault": true,
    "street": "Rua das Flores", "number": "123", "complement": "ap 42",
    "district": "Centro", "city": "Fortaleza", "state": "CE",
    "zip": "60000000", "reference": "portão azul",
    "lat": -3.7319, "lng": -38.5267 },
  { "_id": "addr_2", "label": "Trabalho", "isDefault": false, "…": "…" }
] }
```

| # | Item | Nota |
|---|---|---|
| E1 | `GET/POST/PUT/DELETE api/customer-addresses` | CRUD, com o cliente identificado |
| E2 | Chave do cliente: **telefone**, não CPF | é o que o app já exige e o que o entregador usa |
| E3 | `label` livre (`Casa`, `Trabalho`) | o cliente escolhe na hora do pedido |
| E4 | `isDefault` — um só por cliente | evita perguntar quando há um óbvio |
| E5 | `lat`/`lng` gravados na criação | recalcular geocódigo a cada pedido é lento e caro |
| E6 | `reference` (ponto de referência) | é o campo que salva entrega em rua sem numeração |
| E7 | Endereço **por company**, não global da plataforma | o cliente não autorizou compartilhar entre empresas |
| E8 | Excluir endereço não apaga pedido antigo | a comanda guarda o endereço **como estava** |

> **E8 não é detalhe.** O pedido tem de gravar uma **cópia** do endereço, não uma
> referência. Se o cliente editar "Casa" depois, a comanda de ontem passaria a
> mostrar o endereço novo — e o histórico deixa de bater com o que foi entregue.

#### Taxa de entrega: calculada no servidor, sempre

```jsonc
// POST api/delivery-quote
{ "branch": "…", "simpleAuth": "…",
  "address": "addr_1",              // ou o endereço inteiro, se ainda não salvo
  "subtotal": 68.90 }               // para regra de frete grátis

→ { "deliverable": true,
    "fee": 8.50,
    "distanceKm": 3.2,
    "etaMinutes": 45,
    "freeFrom": 80.00,              // "faltam R$11,10 para frete grátis"
    "minOrder": 25.00,
    "reason": null }                // preenchido quando deliverable=false
```

| # | Item | Nota |
|---|---|---|
| T1 | **A taxa nunca é calculada no app** | ver o aviso abaixo |
| T2 | Regra por bairro, por raio (km) ou por faixa de distância | a casa escolhe; o app só exibe |
| T3 | `deliverable: false` + `reason` legível | "fora da área de entrega" precisa ser dito, não deduzido |
| T4 | `minOrder` — pedido mínimo por região | comum em bairro distante |
| T5 | `freeFrom` — frete grátis acima de X | o app mostra quanto falta, e isso aumenta o ticket |
| T6 | `etaMinutes` estimado | o cliente pergunta isso antes de qualquer coisa |
| T7 | Reconsultar a cotação **no envio do pedido** | ele pode ter passado 20min montando |
| T8 | `POST api/orders` **recalcula e ignora** a taxa que o app mandou | idem preço: o app roda no aparelho do cliente |
| T9 | Cotação com validade curta (`expiresAt`) | tabela de frete muda, combustível muda |

> ⚠️ **Nunca replicar a regra de frete no app.** É tentador: "por bairro é só uma
> tabelinha". Mas a regra muda (chuva, feriado, bairro novo, motoboy a menos) e
> quem muda é o painel — se o app tem a própria cópia, ele cobra o frete velho e a
> diferença sai do bolso de alguém. O app envia endereço e subtotal, e **exibe** o
> que o servidor responder. Mesma disciplina do preço dos produtos.

### ⚠️ Verificar se a loja aceita pedido — antes de cada envio

O boot checa o horário **quando o cliente abre o cardápio**. Ele pode ficar meia
hora escolhendo, ou abrir o app às 14h e fechar o pedido às 22h. Nesse meio a
casa fecha, o período vira, o gerente pausa os pedidos — e sem reconsultar, o
pedido entra na cozinha depois de o fogão desligar.

**O que o app faz hoje:** reconsulta `GET api/branches` no `Checkout`, imediatamente
antes do `POST api/orders`, e reavalia horário + o interruptor abaixo.

```jsonc
"settingsWeb": {
  // Ausente = aceitando. Branch sem o campo continua funcionando.
  "acceptingOrders": false,
  "notAcceptingOrdersMessage": "Cozinha em manutenção, volte em 30min"
}
```

| # | Item | Nota |
|---|---|---|
| A1 | `acceptingOrders` em `settingsWeb` | pausa pedidos **sem** mexer no horário |
| A2 | `notAcceptingOrdersMessage` | o motivo evita o cliente insistir |
| A3 | Botão de pausa no painel, com efeito imediato | é usado em pico de fila e em pane de cozinha |
| A4 | **`POST api/orders` recusa quando fechado ou pausado** | ver o aviso abaixo |
| A5 | Recusa com status distinto (`409` ou `422` + código) | para o app dizer "fechou" em vez de "erro" |

> ⚠️ **A validação do app não substitui a do backend.** Ela roda no aparelho do
> cliente: dá para desligar, adiar, ou simplesmente estar com dado velho. A
> checagem no cliente existe para **explicar** ("a loja fechou enquanto você
> montava o pedido") em vez de devolver um erro genérico. Quem tem de recusar é o
> `POST api/orders`.

> **Falha de rede na reconsulta não bloqueia o envio.** Se a consulta não
> responde, o app segue para o POST e deixa o backend decidir. Travar o pedido por
> um soluço de rede impediria venda legítima, com o cliente de pé no salão.

### Validade do carrinho

```jsonc
"settingsWeb": { "cartTtlMinutes": 240 }   // padrão: 240 (4h)
```

O carrinho vive em `sessionStorage`, que **só morre quando a aba fecha** — e aba
de celular fica semanas aberta. Sem prazo, o cliente reabre o app dias depois com
o pedido montado **aos preços de então**: item que subiu, promoção que acabou,
produto que saiu do cardápio.

Vencido, o app descarta o carrinho **e a senha do pedido** (`consumptioncode`), e
avisa o cliente. A senha vence junto por motivo próprio: a de ontem cai numa
comanda que já foi fechada e paga.

> **Não existe regra de "virou o dia", de propósito.** Ela cortaria o pedido de
> quem pediu às 23h50 e voltou às 00h30, no mesmo atendimento — justamente o caso
> que a lógica de período já trata como serviço único (slot `to < from`). Casa que
> atravessa a madrugada deve **aumentar** `cartTtlMinutes`, não contar com data.

### Status do pedido — vocabulário único, significado por modo

O app **não inventa status**: ele exibe o que vier em `order.status`. O backend é a
única fonte, e o vocabulário precisa ser fechado.

| `status` | Mesa | Balcão | Delivery |
|---|---|---|---|
| `pending` | aguardando cozinha | aguardando cozinha | aguardando cozinha |
| `in_progress` | **em produção** | **em produção** | **em produção** |
| `ready` | pronto, saindo para a mesa | **pronto, retire no balcão** | pronto, aguardando entregador |
| `on_the_way` | — | — | **a caminho** |
| `delivered` | entregue | retirado | **entregue** |
| `cancelled` | cancelado | cancelado | cancelado |

**A mesma palavra pede ação diferente em cada modo**, e é por isso que o app
traduz `ready` conforme o modo em vez de ter um texto só. No balcão o cliente
precisa saber que é ele quem busca; no delivery, que o pedido saiu. Mandar
"Saindo para a mesa" num pedido de retirada faz o cliente esperar sentado.

**Regras:**

- `on_the_way` só em delivery. Nos outros modos ele não deve ocorrer
- Mesa costuma parar em `in_progress` → `delivered`; `ready` é opcional
- Status desconhecido é exibido cru em vez de sumir — melhor um rótulo estranho
  que uma tela sem informação
- O app consulta a cada 30s via `GET api/orders?consumptioncode=…` e avisa com
  toast e vibração na mudança para `ready`

### ⚠️ Quem **move** o status — KDS e painel, habilitáveis por branch

O app **lê** status; ele não move nenhum. Se ninguém do outro lado promove
`pending → in_progress → ready`, o cliente fica olhando "Aguardando cozinha"
indefinidamente, conclui que o pedido não chegou, e chama o garçom para conferir —
exatamente o trabalho que o cardápio deveria poupar.

Por isso o acompanhamento é **habilitado pelo backend e desligado por padrão**:

```jsonc
"settingsWeb": {
  // A casa publica status? (KDS, PDV ou app do garçom movendo o pedido)
  "orderStatusEnabled": false,

  // A casa tem painel de senhas chamando o cliente?
  "passwordPanelEnabled": false,
  "orderStatusPortalUrl": "https://painel.exemplo.com/senha",
  "orderStatusPortalQuery": "?branch={branch}&code={code}"
}
```

| Chave | Ausente | Efeito no app quando `true` |
|---|---|---|
| `orderStatusEnabled` | **desligado** | mostra o status e liga o poll de 30s |
| `passwordPanelEnabled` | **desligado** | mostra o link "Acompanhar no painel de senhas" |

**São duas chaves porque são duas operações**, e existe casa com uma sem a outra:

| Operação | `orderStatusEnabled` | `passwordPanelEnabled` |
|---|---|---|
| KDS na cozinha, garçom leva à mesa | ✅ | ❌ |
| Painel de senha alimentado à mão, sem KDS | ❌ | ✅ |
| Balcão com KDS e painel na parede | ✅ | ✅ |
| Casa sem nenhum dos dois (a maioria hoje) | ❌ | ❌ |

**Desligado, o app não promete acompanhamento**: mostra a senha e a instrução de
retirada, que são verdade em qualquer operação. E **não faz poll** — gastar
bateria e rede para reler `pending` a vida toda não ajuda ninguém.

#### O que precisa existir do lado do KDS

| # | Item | Nota |
|---|---|---|
| K1 | KDS (ou PDV) promovendo o status do pedido | é o que faz o status existir |
| K2 | Pedido do cardápio **chega no KDS** junto dos do PDV | `origin: 'cardapio'` não pode virar fila separada esquecida |
| K3 | `ready` disparado por ação humana, não por tempo | timer estimado mente e o cliente vai buscar comida que não está pronta |
| K4 | Painel de senha lendo o mesmo status | senha chamada no painel e status no celular não podem divergir |
| K5 | Ligar `orderStatusEnabled` **só depois** de K1 e K2 | a chave declara um fato operacional, não uma intenção |

> **K5 é o item que mais importa.** A chave não é enfeite de configuração: ela
> afirma "nossa cozinha publica status". Ligada sem KDS, o app passa a mentir com
> mais confiança do que se estivesse desligado — e a reclamação chega ao garçom,
> não a quem configurou.

> **Para testar sem KDS:** `src/lib/mockBill.ts` traz `getMockOrderStatus`, que
> percorre `pending → in_progress → ready → (on_the_way) → delivered` em 1 minuto,
> com poll de 5s. Mesmos estados, mesma ordem, tempo comprimido. Some com
> `MOCK_BILL = false`.

### Pagamento no histórico — o app não pode afirmar o que não sabe

O histórico local mostra como cada pedido foi pago. O ponto delicado: **em balcão,
totem, caixa, garçom e entrega o dinheiro passa por fora do app**. Ele sabe que
*enviou* o pedido, não que foi pago.

São **três** estados, não dois: pago, não pago, e **não sabemos** — e o terceiro é
o mais comum hoje.

```jsonc
// O que o backend deve devolver junto do pedido, quando houver
{
  "payment": {
    "via": "counter",          // app | pos | totem | counter | waiter | on_delivery
    "status": "paid",          // AUSENTE = o app não sabe. Nunca deduzir.
    "method": "pix",           // pix | credit | debit | cash | voucher
    "paidAt": "2026-07-30T21:14:00Z",
    "handoffCode": "T-4827",   // quando foi entregue ao totem
    "changeFor": 100.00        // troco pedido, em dinheiro na entrega
  }
}
```

| `via` | `status: 'paid'` faz sentido? | O app exibe |
|---|---|---|
| `app`, `pos` | ✅ o app acompanha | "Pago no app · Pix" |
| `app`, `pos` sem status | — | "Pagamento pendente" |
| `counter`, `waiter`, `totem`, `on_delivery` | só se o backend confirmar | "Pagamento no balcão · **não confirmado no app**" |

> ⚠️ **Nunca preencher `status: 'paid'` por dedução.** "O pedido saiu, logo foi
> pago" é falso em toda operação com caixa. Quem lê "Pago" e não pagou passa pela
> porta e é parado na frente da fila; quem lê "Pago" e o caixa discorda confia no
> celular e discute. O campo ausente é a resposta correta — e a interface já sabe
> dizer "não confirmado no app" sem constranger ninguém.

> **`handoffCode` importa mesmo sem confirmação.** No totem, é o que o cliente
> digita na máquina. Mostrar a contra-senha no histórico salva quem fechou a tela
> de confirmação antes de anotar.

#### Endereço no pedido de delivery

```jsonc
{ "address": { "label": "Casa", "street": "…", "number": "123",
               "complement": "ap 42", "district": "Centro",
               "reference": "portão azul", "deliveryFee": 8.50 } }
```

**Cópia, não referência** — ver `api/customer-addresses` acima. Se o cliente editar
"Casa" depois, um pedido que aponte para o endereço passaria a mostrar o novo, e o
histórico deixaria de bater com o que foi entregue. `deliveryFee` também é
histórica: a tabela de frete muda.

### Portal de senha do balcão

No balcão o cliente pode não ficar com o app aberto. O portal é a tela pública
onde ele acompanha a senha — no próprio celular ou no painel da loja.

```jsonc
"settingsWeb": {
  // URL do portal. Ausente ou vazia → o app não mostra o link
  "orderStatusPortalUrl": "https://painel.exemplo.com/senha",
  // Como o app monta o link (o backend define o contrato)
  "orderStatusPortalQuery": "?branch={branch}&code={code}"
}
```

| Campo | Obrigatório | Observação |
|---|---|---|
| `orderStatusPortalUrl` | ❌ | sem ela o app só mostra a senha, sem link |
| `orderStatusPortalQuery` | ❌ | placeholders `{branch}` e `{code}`. Padrão: `?branch={branch}&code={code}` |

**O que o portal precisa fazer:**

| # | Item | Nota |
|---|---|---|
| Q1 | Consulta por **branch + senha**, sem login | a senha é o que o cliente tem na mão |
| Q2 | Chamar quando ficar pronto | som, vibração ou destaque — é a razão do portal existir |
| Q3 | Não expor dados do cliente | senha e status bastam; nome e telefone não |
| Q4 | Senha expira junto do pedido | senha reaproveitada não pode mostrar pedido de outro |
| Q5 | Throttle por IP | consulta pública sem login é varredura fácil |
| Q6 | Funcionar sem o app instalado | o cliente pode abrir num navegador qualquer |

> ⚠️ **Q3 e Q4 não são detalhe.** Uma URL pública com `?code=A047` que devolve
> nome e telefone é vazamento de dado pessoal — e a senha, sendo curta, é
> adivinhável por tentativa. O portal deve responder **só** senha e status, e
> parar de responder quando o pedido é encerrado.

### Itens cancelados e transferidos — mostrar sem somar

**Nunca apague o item do JSON. Marque.**

O cliente viu "Porção de batata" na tela dois minutos antes. Se o item
simplesmente desaparecer, ele conclui uma de duas coisas: o app está com defeito,
ou a casa mexeu na conta sem avisar. Nas duas ele chama o garçom desconfiado. Um
item riscado com "Cancelado" ao lado responde a pergunta antes de ela existir.

```jsonc
{
  "_id": "6531…",
  "status": "confirmed",              // status do PEDIDO
  "total": 28.50,                     // ⚠️ JÁ LÍQUIDO — sem os excluídos
  "items": [
    { "name": "Salada Tradicional", "quantity": 1, "amount": 28.50 },

    { "name": "Pastel de queijo", "quantity": 2, "amount": 19.00,
      "status": "cancelled" },

    { "name": "Água com gás 500ml", "quantity": 1, "amount": 5.50,
      "status": "transferred",
      "transferredTo": "MESA_07" }
  ]
}
```

| Campo | Obrigatório | Observação |
|---|---|---|
| `items[].status` | ❌ | `active` \| `cancelled` \| `transferred`. **Ausente = `active`** |
| `items[].transferredTo` | ❌ | destino legível (`MESA_07`, `Cartão 12`). Só em `transferred` |
| `status` (do pedido) | ✅ | `cancelled` no cabeçalho risca **todos** os itens |

**Regras:**

1. **`total` do pedido vem já líquido**, sem os itens excluídos. O app não deve
   ter de recalcular o que o servidor já sabe
2. Item excluído mantém `amount` e `quantity` originais — é o valor que **não**
   está sendo cobrado, e o cliente precisa vê-lo para entender o cancelamento
3. Item transferido **não pode aparecer como ativo nas duas contas**. Sai desta,
   entra na de destino
4. Pedido `cancelled` continua na resposta de `GET api/orders`
5. Desconto de item cancelado não é somado — o item não está sendo cobrado

> **Motivo do cancelamento: não mande.** Ou mande num campo separado e explícito
> como `clientVisibleReason`. Justificativa de operação ("erro do garçom", "furou
> o estoque", "cliente reclamou") é registro interno; na tela do cliente ela
> constrange o funcionário ou expõe problema da casa sem necessidade. "Cancelado"
> basta — quem quiser detalhe pergunta ao garçom.

> **O que o app faz se o `total` vier errado:** se o pedido tem item excluído, a
> tela **recalcula** somando só os ativos, em vez de confiar no cabeçalho. É
> defesa contra a pior contradição possível — um item riscado como "Cancelado"
> sendo cobrado no total, na mesma tela. Não conte com isso: mande o total certo.

### Quantidade fracionada (self-service)

Em self-service o prato é pesado, e a linha vira `0,412 kg × R$89,90/kg`.

```jsonc
{ "name": "Buffê por quilo",
  "quantity": 0.412,        // decimal
  "unit": "kg",             // sem isso, "0,412×" não significa nada
  "unitPrice": 89.90,       // para o cliente conferir a conta
  "amount": 37.04 }
```

| Campo | Observação |
|---|---|
| `quantity` | pode ser decimal. Até 3 casas (a balança trabalha em gramas) |
| `unit` | `kg`, `L`, `un`. **Obrigatório quando `quantity` é decimal** |
| `unitPrice` | preço por unidade. Sem ele o cliente não tem como checar `amount` |

**Regras:**

1. **O app nunca lança item fracionado** — não existe caminho na interface e não
   deve existir. Quem pesa é a balança, quem lança é o PDV. O app é somente
   leitura para essas linhas
2. Mesmo produto com unidades diferentes vira **linha separada** na conta
   resumida: `1 un` + `0,4 kg` não é `1,4` de coisa nenhuma
3. `amount` sempre calculado no servidor, nunca `quantity × price` pelo app —
   arredondamento de peso é decisão fiscal

> ⚠️ **Mande `unit` junto do decimal, sempre.** Sem `unit`, o app exibe `0,412×`,
> que o cliente lê como quantidade absurda. Com `unit`, ele lê `0,412 kg` e
> confere contra a etiqueta da balança.

### Regras de exibição que o backend precisa respeitar

- **A tela nunca calcula taxa de serviço.** Só exibe `serviceTax` se vier. Número de
  dinheiro inventado numa conta é o erro que o cliente descobre na hora de pagar
- Descontos de item entram no total geral: a tela soma `order.discount` + Σ`item.discount`
- Pedido `cancelled` **aparece na tela**, com tarja, e não entra no total
- Item `cancelled` / `transferred` aparece riscado e não entra no total
- A conta resumida omite os excluídos das linhas, mas **avisa quantos existem**
- `amount` do item e `total` do pedido são a fonte da verdade — o app só soma

---

## 5. Comanda por cliente

Numa mesa, cada pessoa pede do próprio celular. A comanda é a **chave de cobrança**;
o nome é rótulo humano.

```
Branch.settingsWeb.comandaEnabled  : boolean   // padrão false
Branch.settingsWeb.comandaLabel    : string    // "Comanda" | "Cartão" | "Ficha"
Branch.settingsWeb.comandaRequired : boolean   // exige informar para pedir
```

- Desligado: a mesa é uma conta só
- Ligado: o cliente informa a comanda no checkout, ela vai no payload como `comanda`,
  e a conta agrupa por ela — a mesma mesa pode ter várias comandas, ou todas na mesma
- O backend deve aceitar `comanda` no `POST api/orders` e devolvê-la no `GET`

---

## 5.1 Outras chaves de comportamento

```
Branch.settingsWeb.askWhereConsume : boolean   // padrão TRUE
```

Com `true`, o cardápio pergunta **antes do menu** se é para comer no local ou levar —
igual ao totem. A escolha muda embalagem (grupos com `isTakeawayPackaging` + `autoAdd`)
e pode mudar preço, então perguntar só no checkout faria o cliente montar o pedido
inteiro vendo um valor que não é o dele.

Resumo de tudo que vive em `settingsWeb`:

| Chave | Tipo | Padrão | O que faz |
|---|---|---|---|
| `simpleAuth` | string | — | **Obrigatória.** Token da branch |
| `businessHours` | array | — | Fallback de horário quando não há `periods` |
| `allowedModes` | `("mesa"\|"balcao")[]` | ambos | Modos que a branch aceita |
| `billEnabled` | boolean | `true` | Liga a tela de conta |
| `billDetailedEnabled` | boolean | `true` | Liga a visão detalhada da conta |
| `comandaEnabled` | boolean | `false` | Comanda por cliente na mesa |
| `comandaLabel` | string | `"Comanda"` | Rótulo exibido |
| `comandaRequired` | boolean | `false` | Exige comanda para pedir |
| `couponsEnabled` | boolean | `false` | Campo de cupom no checkout |
| `askWhereConsume` | boolean | `true` | Pergunta local/viagem no início |
| `waiterCallEnabled` | boolean | `false` | Botão de chamar garçom (só em mesa) |
| `banners` | array | — | Carrossel promocional de abertura |
| `bannersRequired` | boolean | `false` | Obriga a passar por todos os banners |
| `requireIdentification` | boolean | `true` | Nome + telefone para pedir e ver a conta |
| `languages` | string[] | `["pt"]` | Idiomas do seletor |
| `passwordDigits` | number | `3` | Dígitos da senha do balcão (`A042` vs `K1725`) |
| `askEmail` | boolean | `false` | Pede e-mail no checkout e no perfil |
| `googleSignInEnabled` | boolean | `false` | Botão "Continuar com o Google" |
| `privacyPolicyUrl` | string | — | Link da política, no banner LGPD e no perfil |
| `privacyContactEmail` | string | — | Canal para pedido de exclusão (LGPD art. 18) |
| `menuName` | string | nome da company | Nome do cardápio e do PWA instalado |
| `menuShortName` | string | 12 chars de `menuName` | Nome embaixo do ícone |
| `pwaIcon192` / `pwaIcon512` / `pwaIconApple` | string | `logo` | Ícones do PWA |
| `metaPixelId` | string | — | Meta Pixel da branch |
| `gaId` | string | — | Google Analytics 4 da branch |

### `askEmail` — e-mail do cliente

Desligado por padrão de propósito: coletar dado sem finalidade definida é
exatamente o que a LGPD veda. Ligar só onde o restaurante vai de fato usar o
e-mail (nota fiscal, programa de fidelidade).

Ligado, o campo aparece no checkout e no perfil, é salvo no aparelho junto de
nome/telefone e vai no payload do pedido como `email`.

### `googleSignInEnabled` — Continuar com o Google

Exige **duas** coisas para o botão aparecer:

1. `settingsWeb.googleSignInEnabled: true` na branch
2. `VITE_GOOGLE_CLIENT_ID` no `.env` do build (Client ID OAuth tipo "Aplicativo
   da Web", com o domínio do cardápio nas origens autorizadas)

#### ⚠️ O Google não devolve telefone

| Dado | Google Sign-In |
|---|---|
| Nome | ✅ |
| E-mail | ✅ |
| Foto | ✅ (não usada) |
| **Telefone** | ❌ **não existe escopo** |

O `phoneNumbers` da People API exige o escopo `contacts`, classificado como
sensível — precisa de verificação anual do app e justificativa de uso, o que um
cardápio digital não sustenta na revisão do Google.

Ou seja: o botão economiza dois campos, e o telefone — justamente o
obrigatório — continua digitado. A UI diz isso explicitamente ("Preenche nome e
e-mail. O telefone você digita"), para o cliente não achar que o login resolveu
tudo e travar no botão de enviar.

> **Antes de ligar, considere:** o `autocomplete` nativo do navegador já
> preenche nome, e-mail e telefone de quem tem os dados salvos, com um toque,
> sem login e sem carregar script de terceiro. O Google Sign-In adiciona um
> terceiro ao consentimento LGPD para resolver metade do problema.

#### Se o backend for confiar nessa identidade

Hoje o app **decodifica o JWT sem validar assinatura**, porque o token não
autentica nada — só preenche dois campos de formulário no aparelho. Nenhuma
decisão de servidor depende dele.

Se um dia o Laravel passar a tratar isso como login, o `credential` cru precisa
ir para o backend e ser validado lá (`tokeninfo` ou biblioteca oficial). Validar
no cliente não vale nada: qualquer um edita o payload.

### LGPD — o que o backend precisa fornecer

```json
{
  "privacyPolicyUrl": "https://restaurante.com.br/privacidade",
  "privacyContactEmail": "privacidade@restaurante.com.br"
}
```

| Campo | Onde aparece | Por que importa |
|---|---|---|
| `privacyPolicyUrl` | link no banner de consentimento e no perfil | Sem ele, "Aceitar" não é consentimento **informado** — é só um botão |
| `privacyContactEmail` | botão "Solicitar exclusão dos meus dados" no perfil | O botão local só limpa o celular; os pedidos ficam no servidor do restaurante, e o titular tem direito à exclusão (art. 18, VI) |

O app monta um `mailto:` já preenchido com nome e telefone do cliente. Se o
backend preferir um endpoint (`POST api/privacy-requests`), é trocar o link —
mas o canal precisa existir de alguma forma.

> Sem esses dois campos, os elementos simplesmente não aparecem. O app não
> inventa política nem canal de contato.

### `allowedModes` — mesa, balcão ou os dois

```json
{ "allowedModes": ["mesa"] }
```

- Ausente ou vazio → a branch aceita os dois modos
- `["mesa"]` → casa que só atende no salão
- `["balcao"]` → casa que só tem papa-fila

Se o QR trouxer `mode=balcao` numa branch que só aceita `mesa`, o app **usa o
primeiro modo permitido** em vez de operar num modo que a casa não atende — evita
gerar senha de balcão onde não existe balcão para chamar.

**Valor desconhecido é ignorado.** O app filtra `allowedModes` pelos modos que
implementa (`mesa`, `balcao`) e, se não sobrar nenhum, mantém o modo do QR Code.

> **Um terceiro valor está previsto: `cartao`** (cartão de consumação, usado em
> self-service e bares) — Fase 2.6 do `ROADMAP.md`, **não implementado**.
> Gravar `["cartao"]` hoje é inofensivo: a branch volta a aceitar o modo do QR.
> Antes do filtro, isso fazia o app adotar `cartao` como modo interno **em
> silêncio** — sem erro e sem tela, só com a regra de pagamento e a senha
> erradas. Vale a lição geral: ignorar o que não se entende, nunca adotar.

### Senha do balcão — `consumptioncode`

Formato **1 letra + N dígitos**: `A042`, `K1725`. Mesmo padrão do totem, feito
para ser chamado em voz alta no painel de senhas.

```json
{ "passwordDigits": 4 }
```

O alfabeto exclui **I** e **O**: impressos ou lidos de longe viram `1` e `0`, e
o cliente vai ao balcão com a senha errada.

| Modo | `consumptioncode` |
|---|---|
| `mesa` | nome da mesa (`MESA_03`) |
| `balcao` | senha gerada (`A042`) |

Além dela, todo pedido leva `consumptionint` (500–999), que é o **número do
pedido**, não a senha.

#### ⚠️ A senha é sorteada no cliente — e pode repetir

| Dígitos | Combinações | ~50% de chance de repetir em |
|---|---|---|
| 3 | 24.000 | **~180 pedidos** |
| 4 | 240.000 | ~580 pedidos |

Numa casa movimentada, 3 dígitos **repetem dentro do mesmo serviço** — e duas
pessoas atendem à mesma chamada. Subir para 4 reduz muito, mas não elimina: o
app não sabe quais senhas já estão em uso.

**A solução correta é o backend devolver a senha no `POST api/orders`:**

```jsonc
// resposta do POST
{ "_id": "...", "consumptioncode": "A042", "consumptionint": 812 }
```

Com o Laravel gerando (sequencial ou sorteio com verificação de unicidade no
dia), a colisão deixa de existir. O app já usa o que vier na resposta —
`Confirmation.tsx` lê `state.order.consumptioncode`. Enquanto o backend não
devolver, vale o sorteio local com `passwordDigits: 4`.

### `waiterCallEnabled` — chamar garçom

```json
{ "waiterCallEnabled": true }
```

Botão 🛎 no cabeçalho, **só em `mode=mesa`** — no balcão não há mesa para o
garçom ir até.

**Desligado por padrão.** Ele dispara `POST api/waiter-call`, e numa casa sem
esse endpoint — ou sem processo para atender a chamada — o cliente toca um botão
que não produz nada visível para ninguém. Pior que não ter o botão.

Antes de ligar, confirmar os dois lados:
1. `POST api/waiter-call` existe e responde
2. A chamada chega em algum lugar que o salão realmente olha (KDS, painel, app do garçom)

Cooldown de 60s no cliente para evitar toque repetido.

### `couponsEnabled` — sistema de cupons

```json
{ "couponsEnabled": true }
```

Desligado por padrão. Um campo de cupom que só responde "cupom inválido" é pior que
campo nenhum. Com `true`, o checkout valida contra `GET api/offers` e envia o cupom
aplicado no payload do pedido.

### `banners` — carrossel de abertura

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
  ]
}
```

| Campo | Obrigatório | Observação |
|---|---|---|
| `image` | ✅ | Sem ela o banner é ignorado. Recomendado 4:5 (ex: 1080×1350) |
| `title` | ❌ | Sobreposto na base da imagem |
| `subtitle` | ❌ | Linha de apoio |
| `link` | ❌ | Interno (`/produto/<id>`, `/`) ou externo (`https://…`) |
| `linkLabel` | ❌ | Rótulo do botão. Padrão: `"Ver"` |
| `active` | ❌ | `false` esconde sem apagar o cadastro |
| `seq` | ❌ | Ordem no carrossel |

**Onde mora:** dentro de `branch.settingsWeb`, junto das outras chaves desta
seção — é array na própria branch, não endpoint separado:

```jsonc
// GET api/branches?_id=…
{ "data": [ { "_id": "…", "settingsWeb": {
    "banners": [ /* … */ ],
    "bannersRequired": false
} } ] }
```

**Filtro e ordem** (feitos no app, mas o cadastro precisa cooperar):

1. Descarta `active: false` e banner sem `image` — banner sem imagem não renderiza nada
2. Ordena por `seq` crescente; ausente conta como `0`
3. Lista vazia depois do filtro → **a tela nem aparece**, vai direto ao cardápio

**Comportamento na tela:**

- Aparece **uma vez por sessão**, antes de idioma e local/viagem
- **Wizard com slide horizontal**: botão "Próximo", swipe e pontinhos clicáveis.
  A transição é `translateX` numa trilha — trocar conteúdo no mesmo nó dava efeito
  de fade, que o cliente descreveu como "agonia"
- Autoplay a cada **6s**, e **para de vez** quando o cliente avança por conta
  própria — quem tomou o controle não quer a tela mudando sozinha
- Link `https://` abre em nova aba (`noopener`), não tira o cliente do pedido
- Link interno (`/produto/<id>`, `/`) navega no app e fecha o carrossel
- Com `bannersRequired: false`, o botão de sair aparece desde o primeiro segundo —
  o cliente está com fome e o banner está entre ele e a comida

> **`seq` merece cuidado no cadastro.** Se todos vierem sem `seq`, a ordem é a do
> array — e a promoção que a casa quer em primeiro pode cair no fim. Vale o painel
> gravar `seq` sempre, e não só quando o operador reordena.

> A imagem precisa de **CORS liberado** ou pelo menos ser servida por HTTPS
> acessível — vale o mesmo alerta dos buckets S3 em §10.

> **Para testar sem backend:** `src/lib/mockSettings.ts` injeta 3 banners de
> exemplo. Ver `CONFIGURACAO.md` para desligar antes de produção.

### `bannersRequired` — obrigar a ver todos

```json
{ "bannersRequired": true }
```

Com `true`, o botão "Ir ao cardápio" só aparece depois que o cliente chega ao
último banner. O botão principal vira "Próximo" e só no fim vira "Ver o cardápio".

Padrão `false`. Vale pesar antes de ligar: quem escaneou o QR está com fome e
sentado à mesa. Obrigá-lo a passar por três telas de publicidade para chegar ao
cardápio troca alcance garantido por irritação — e a saída fácil não reduz muito
a visualização, já que o banner ocupa a tela inteira de qualquer jeito.

### `requireIdentification` — visitante vs. cliente identificado

```json
{ "requireIdentification": true }
```

| Ação | Sem identificação |
|---|---|
| Navegar o cardápio, ver preços, montar carrinho | ✅ livre |
| **Enviar pedido** | ❌ exige nome + telefone |
| **Ver a conta da mesa** | ❌ exige nome + telefone |

O corte é proposital. Pedir cadastro para *ver preço* afasta o cliente sem
contrapartida — e coletar dado sem finalidade é o que a LGPD veda. Já enviar
pedido e abrir a conta têm finalidade concreta: a cozinha precisa saber de quem
é, e a conta da mesa expõe o consumo das outras pessoas sentadas ali.

Validação aplicada: nome com 2+ caracteres, telefone com 10 a 13 dígitos (aceita
fixo, celular e número estrangeiro).

Com `false`, tudo fica opcional — só o modo balcão continua exigindo nome, porque
sem ele não há como chamar o cliente.

---

## 6. Idiomas

```
Branch.settingsWeb.languages : string[]   // ex: ["pt","es","en"]
```

- Ausente ou com um item só → o seletor de idioma **não aparece**
- Português é sempre o idioma base (é o dos dados de origem)

### Tradução do conteúdo

O payload de produtos **já traz** o formato certo:

```json
{
  "translations": {
    "en": { "name": "Crispy chicken", "description": "...", "slug": "" },
    "es": { "name": "Pollo crujiente", "description": "...", "slug": "" }
  }
}
```

O app usa `translations[lang].name` e cai para o português quando está vazio — um
cardápio meio traduzido é utilizável; um com linhas em branco não.

**Estender o mesmo formato para `product-categories`** (hoje o app já lê `translations`
nas categorias; falta o painel preencher).

Textos da interface (botões, avisos) são traduzidos no app, em `src/lib/i18n.ts` — não
dependem do backend.

---

## 7. Geração de QR Code

O QR Code é gerado no painel Laravel, por branch. **Não** é gerado pelo app.

### Formato da URL

```
https://<dominio-do-cardapio>/?branch=<BRANCH_ID>&table=<MESA>&mode=mesa
https://<dominio-do-cardapio>/?branch=<BRANCH_ID>&mode=balcao
```

| Parâmetro | Obrigatório | Valores | Observação |
|---|---|---|---|
| `branch` | ✅ | `_id` da branch | sem ele o app mostra "QR Code inválido" |
| `table` | mesa | `MESA_03`, `01`, `VARANDA_2` | vira o `consumptioncode` do pedido |
| `mode` | ❌ | `mesa` (padrão) \| `balcao` | balcão exige nome, mesa não |

> `table` aparece na tela para o cliente ("Mesa MESA_03") e vai no pedido. Usar o
> mesmo identificador que o salão e o PDV usam, senão o garçom recebe um código que
> não reconhece.

### O que o painel precisa oferecer

**Por branch:**

1. **Geração em lote** — informar a faixa de mesas (ex: 1 a 40) e baixar um PDF com um
   QR por página/etiqueta, cada um rotulado com o número da mesa
2. **Geração individual** — para mesa nova ou etiqueta danificada
3. **QR de balcão** — um por branch, sem `table`, com `mode=balcao`
4. **Reimpressão** — o QR é determinístico (mesma URL = mesmo código), então
   reimprimir não invalida o antigo

**Por company:** listar as branches e permitir gerar o lote de qualquer uma, já que a
mesma empresa administra várias unidades.

### Recomendações de impressão

- **Correção de erro nível H (30%)** — a etiqueta vai viver em mesa de restaurante,
  com gordura, respingo e atrito
- **Mínimo 3×3 cm** impressos; abaixo disso celular antigo não lê a 30 cm
- Margem branca (*quiet zone*) de pelo menos 4 módulos ao redor
- Rótulo legível com o número da mesa **fora** do QR — quando o código não lê, o
  garçom ainda sabe qual etiqueta é
- Laminação ou etiqueta de vinil

### Segurança

- **Não colocar `simpleAuth` na URL do QR.** Ele já vem no `GET api/branches`
- URL curta ajuda a legibilidade: encurtador próprio no mesmo domínio é aceitável,
  encurtador de terceiro não — o app só segue QR do próprio domínio ao reescanear
  (`src/components/QrScanButton.tsx`), e um domínio de terceiro seria rejeitado

### Endpoint sugerido (painel, autenticado)

```
GET  api/branches/{id}/qrcodes?from=1&to=40&format=pdf
POST api/branches/{id}/qrcodes   { "tables": ["MESA_01","VARANDA_1"], "mode": "mesa" }
```

Não é consumido pelo app — é ferramenta de operação do painel.

---

## 8. Analytics e tema

### Pixels — campos no painel

Dois campos por branch, ambos opcionais:

```
Branch.settingsWeb.metaPixelId : string   // "123456789012345"  (Meta/Facebook)
Branch.settingsWeb.gaId        : string   // "G-XXXXXXXXXX"     (Google Analytics 4)
```

**Validação sugerida no painel**, para o dono não colar o valor errado:

| Campo | Formato | Onde ele encontra |
|---|---|---|
| `metaPixelId` | 15–16 dígitos, só números | Meta Events Manager → Fontes de dados → ID do pixel |
| `gaId` | `G-` + 10 caracteres alfanuméricos | GA4 → Administrador → Fluxos de dados → ID da métrica |

> Erro comum: colar o **ID da conta** (`UA-…`, ou o número da conta Meta) no lugar
> do pixel. Um regex simples no painel evita o suporte depois.

### Modelo "os dois em paralelo"

Existem duas camadas de IDs:

- **Plataforma** — vêm do `.env` do app (`VITE_META_PIXEL_ID`, `VITE_GA_MEASUREMENT_ID`)
- **Branch** — vêm de `settingsWeb`, cadastrados pelo dono do restaurante

Os dois são inicializados juntos (`fbq('init', …)` / `gtag('config', …)`), e cada
evento vai para ambos. Assim a plataforma vê tudo consolidado e cada branch vê o
próprio movimento.

**Nada é injetado antes do aceite no banner LGPD.** Se o cliente recusar, nenhum
script de terceiro é carregado.

### Tema

```
Company.settingsTotem.primaryColor : string   // "#1D9E75"
Company.settingsTotem.logo         : string   // URL
```

O app também procura cor de **fundo** sob `backgroundColor` / `bgColor` / `corFundo`.
Se nenhum existir, mantém o tema claro padrão.

> Não usar `secondaryColor` para fundo: cor secundária é acento de marca. Já houve
> bug por causa disso e o app não a lê mais como fundo.

---

## 9. Endpoints auxiliares

Se não existirem, o app **degrada em silêncio** — a funcionalidade some, nada quebra.

| Método | Endpoint | Usado por | Se faltar |
|---|---|---|---|
| GET | `api/orders?consumptioncode=…` | status do pedido + conta | sem "pedido pronto", conta vazia |
| POST | `api/waiter-call` | botão 🛎 chamar garçom | chamada não chega |
| POST | `api/reviews` | pesquisa de satisfação (NPS) | avaliação perdida |

```jsonc
// POST api/waiter-call
{ "table": "MESA_03", "branch": "<id>", "simpleAuth": "<token>" }

// POST api/reviews
{ "branch": "<id>", "consumptioncode": "MESA_03", "rating": 5, "simpleAuth": "<token>" }
```

### Status do pedido

O app faz polling a cada 30s. Valores reconhecidos:
`pending` · `in_progress` · `ready` · `delivered` · `cancelled`

WebSocket substituiria o polling com folga, se um dia houver.

---

## 10. Infraestrutura

### CORS

```php
// config/cors.php
'paths' => ['api/*'],
'allowed_methods' => ['GET', 'POST'],
'allowed_origins' => ['https://cardapio.seudominio.com.br'],
'allowed_headers' => ['Content-Type'],
```

### CORS nos buckets de imagem

Os buckets S3 (`klavi-img`, `berpimagescloud`) **não devolvem
`Access-Control-Allow-Origin`**. As fotos aparecem (a tag `<img>` não exige CORS), mas
o pré-cache falha e cada imagem é baixada duas vezes. Config em `DEPLOY.md` §4.3.

### HTTPS

Obrigatório. Service Worker, Cache API e `navigator.vibrate` não funcionam em HTTP —
e sem eles o PWA não instala.

---

## 11. Checklist

### Bloqueia o funcionamento
- [ ] `settingsWeb.simpleAuth` no model Branch
- [ ] Middleware no `POST api/orders` aceitando `simpleAuth` no body sem Bearer
- [ ] **`POST api/orders` NÃO exigir forma de pagamento** (ver §3)
- [ ] `throttle:20,1` no `POST api/orders`
- [ ] CORS liberando o domínio do cardápio
- [ ] `branch.company` populado no `GET api/branches`
- [ ] Backend multiplica `complemento.quantity × item.quantity`

### Conta da mesa (hoje em mock)
- [ ] Conceito de atendimento aberto (`tableSession` recomendado)
- [ ] `GET api/orders` filtrando pelo atendimento aberto
- [ ] Objeto `session` com `openedAt` e `waiter`
- [ ] `createdAt` em cada pedido
- [ ] `discount` / `serviceTax` / `coupon` no pedido e `discount` no item
- [ ] `createdBy` explícito (substitui a inferência por `origin`)

### QR Code
- [ ] Geração em lote por branch, com PDF de etiquetas
- [ ] QR de balcão (`mode=balcao`, sem `table`)
- [ ] Listagem por company

### Opcionais
- [ ] `settingsWeb.comandaEnabled` / `comandaLabel` / `comandaRequired`
- [ ] `settingsWeb.languages` + `translations` nas categorias
- [ ] `settingsWeb.metaPixelId` / `gaId`
- [ ] `POST api/waiter-call`, `POST api/reviews`
- [ ] `locationType: 9` para produtos exclusivos do cardápio de mesa
- [ ] WebSocket de status

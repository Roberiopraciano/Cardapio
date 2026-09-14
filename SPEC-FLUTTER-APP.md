# Especificação — App de Cardápio com Fidelidade (Flutter)

Documento para construir um app similar a este cardápio web, em Flutter,
**instalável**, com **cupons, cashback e programa de fidelidade**.

Escrito para ser compartilhado com quem vai implementar. Reúne o contrato da
API, o modelo de dados, as regras de negócio que já foram descobertas na prática
(incluindo os bugs que custaram caro), e o desenho proposto para fidelidade.

> **Base:** este documento descreve o backend Laravel existente (MongoDB),
> compartilhado hoje por um totem Flutter e um cardápio web React.
> Referências no repo: [`BACKEND.md`](BACKEND.md) · [`CONFIGURACAO.md`](CONFIGURACAO.md) · [`ROADMAP.md`](ROADMAP.md)

---

## Sumário

1. [Visão geral e modos de operação](#1-visão-geral-e-modos-de-operação)
2. [Autenticação](#2-autenticação)
3. [Endpoints — leitura do cardápio](#3-endpoints--leitura-do-cardápio)
4. [Modelo de dados](#4-modelo-de-dados)
5. [Vinculação dos dados (o passo que ninguém documenta)](#5-vinculação-dos-dados)
6. [Imagens — onde estão e como usar](#6-imagens)
7. [Como apresentar o cardápio](#7-como-apresentar-o-cardápio)
8. [Complementos — a parte mais difícil](#8-complementos)
9. [Precificação](#9-precificação)
10. [Dados do cliente](#10-dados-do-cliente)
11. [Enviar o pedido](#11-enviar-o-pedido)
12. [Acompanhamento e conta](#12-acompanhamento-e-conta)
13. [Horário de funcionamento](#13-horário-de-funcionamento)
14. [Tema e identidade](#14-tema-e-identidade)
15. [Fidelidade, cashback e cupons](#15-fidelidade-cashback-e-cupons)
16. [Armadilhas — bugs que já custaram caro](#16-armadilhas)
17. [Checklist de implementação](#17-checklist-de-implementação)

---

## 1. Visão geral e modos de operação

```
QR Code / link → App → API Laravel → KDS / cozinha da branch
```

**Hierarquia:** `Company` (empresa) → `Branch` (unidade) → `Category` → `Product`

| Modo | Como entra | Identificação | Pagamento |
|---|---|---|---|
| `mesa` | QR na mesa, com `table` | nome + telefone | garçom |
| `balcao` | QR no balcão | nome + telefone | no balcão |
| `delivery` | link/slug | + endereço | online ou entrega |

> `delivery` ainda não existe no backend — ver `ROADMAP.md` Fase 4.

**Parâmetros de entrada (URL do QR ou deep link):**

```
https://cardapio.exemplo.com.br/?branch=<BRANCH_ID>&table=MESA_03&mode=mesa
https://cardapio.exemplo.com.br/?branch=<BRANCH_ID>&mode=balcao
```

| Parâmetro | Obrigatório | Exemplo |
|---|---|---|
| `branch` | ✅ | `658afd3d0ce8b356f9f9ce20` |
| `table` | mesa | `MESA_03` |
| `mode` | ❌ (padrão `mesa`) | `mesa` \| `balcao` |

**No Flutter**, capture via deep link / App Link:

```dart
// AndroidManifest.xml e Info.plist configurados para o domínio
final uri = Uri.parse(deepLink);
final branchId = uri.queryParameters['branch'];
final table    = uri.queryParameters['table'] ?? 'BALCAO';
final mode     = uri.queryParameters['mode'] ?? 'mesa';
```

Sem `branch`, leve o usuário para a **tela de leitura de QR** — não para um erro
genérico. É o único caminho adiante que ele tem.

---

## 2. Autenticação

**Não há login de usuário.** A autenticação é por unidade, via `simpleAuth`.

```
GET  api/branches?_id=<id>        → devolve settingsWeb.simpleAuth
POST api/orders                   → body.simpleAuth (sem Bearer header)
```

### ⚠️ O que isso significa para a segurança

O `simpleAuth` chega ao app e pode ser extraído de um APK descompilado. Ele
autentica a **branch**, não o usuário. É premissa do desenho, não defeito.

**Consequências que o backend precisa mitigar:**

| Risco | Mitigação |
|---|---|
| Inundar a cozinha de pedidos falsos | `throttle:20,1` no `POST api/orders` |
| Pedido em mesa sem cliente | rejeitar fora de sessão aberta |
| Ler conta de qualquer mesa | exigir sessão aberta + identificação |

Se o app de fidelidade tiver **conta de usuário** (§15), aí sim vale token real
por cliente — e é a oportunidade de corrigir esse modelo.

---

## 3. Endpoints — leitura do cardápio

Todos públicos, sem Bearer. Disparar os seis últimos **em paralelo** no boot.

```
GET api/branches?_id=<branchId>
GET api/company?_id=<companyId>            ← companyId vem de branch.company

GET api/product-categories?branch=<id>&locationTypes[$in][]=8&disabled=false&$limit=false
GET api/products?branch=<id>&$limit=false&active=true
GET api/complements-groups?branch=<id>&$limit=false&locationTypes[$in][]=8
GET api/complements-groups-categories?branch=<id>&$limit=false
GET api/periods?branch=<id>&$limit=false
GET api/offers?branch=<id>&disabled=false&$limit=false
```

Resposta padrão (estilo FeathersJS):

```jsonc
{ "total": 19, "limit": null, "skip": 0, "data": [ /* … */ ] }
```

### `locationType: 8`

Filtro que separa o que aparece no totem/cardápio do que é só PDV. **Use 8.**
Produto com `locationTypes: []` (vazio) **não** é filtrado — passa.

### Não cachear

```dart
// Preço e estoque mudam durante o serviço.
final res = await dio.get(url, options: Options(
  headers: {'Cache-Control': 'no-cache'},
  // e NÃO usar cache interceptor nessas rotas
));
```

Cardápio com preço velho gera pedido que a cozinha recebe por outro valor.

### Timeout

```dart
Dio(BaseOptions(connectTimeout: Duration(seconds: 15),
                receiveTimeout: Duration(seconds: 15)));
```

Rede de restaurante trava sem devolver erro. Sem teto, o app fica no splash para
sempre — e o cliente não tem como interpretar isso.

---

## 4. Modelo de dados

### Branch

```jsonc
{
  "_id": "658afd...",
  "name": "Bebelu Centro",
  "company": "6441ae...",        // ← usar para buscar a company
  "active": true,
  "settingsWeb": { /* §14, §15 */ },
  "settingsTotem": {}
}
```

### Category

```jsonc
{
  "_id": "693b06...",
  "name": "Burguers",
  "seq": 2,                      // ordem de exibição
  "disabled": false,
  "staticImage": [{ "photo": "https://..." }],
  "translations": { "en": {...}, "es": {...} }
}
```

### Product

```jsonc
{
  "_id": "693b06b556be4a4bd00c509f",
  "name": "Franbacon simples",
  "description": "Pão, 120g de hambúrguer de frango…",
  "category": "693b06b556be4a4bd00c507c",   // → Category._id
  "seq": 66414,
  "active": true,
  "price": 21.9,
  "offerprice": null,
  "code": "74",
  "peopleCount": 1,
  "preparationTime": 8,

  "complementsGroups": ["693b...5067", "693b...5068"],   // → ids dos grupos
  "complementGroupCategory": "693b...5063",              // → subcategoria (§8)

  "relatedPeriod": "",                       // → Period._id (opcional)
  "locationTypes": [8],

  "stock": { "active": false, "currentQuantity": 0, "totemSoldOut": false },

  "staticImage": [{ "photo": "https://...", "active": true }],
  "sliderHeader": { "slideImageEnabled": true, "image": [{ "photo": "https://...", "active": true }] },

  "suggestionCategory": "global",
  "customSuggestions": [],
  "translations": { "en": { "name": "", "description": "" }, "es": {...} }
}
```

### ComplementsGroup

```jsonc
{
  "_id": "6a1a78092fb151cb630ec865",
  "title": "Escolha o sabor da sua bebida.",
  "seq": 4112,
  "ingredients": false,           // true = FRACIONADO (§8)
  "rules": {                      // ⚠️ ANINHADO, não na raiz
    "minQuantity": 1,
    "maxQuantity": 1,
    "mandatory": true
  },
  "locationTypes": [8],
  "items": ["6a1a...8b6", "6a1a...897"]      // → ids de Product
}
```

> **`rules` é aninhado.** Ler `raw['minQuantity']` direto devolve `null` e todo
> grupo obrigatório vira opcional. Já aconteceu.

### ComplementsGroupCategory (subcategoria)

```jsonc
{
  "_id": "6a1a78092fb151cb630ec852",
  "name": "Sucos",                // ⚠️ é "name", NÃO "title"
  "seq": 2,
  "active": true
}
```

> **Não tem lista de grupos.** Quem aponta é o **item**, via
> `product.complementGroupCategory`. Ver §8.

### Period

```jsonc
{
  "_id": "…", "branch": "…", "title": "Almoço",
  "period": {
    "monday":    [{ "from": "11:00", "to": "15:00" }],
    "tuesday":   [{ "from": "11:00", "to": "15:00" }],
    "friday":    [{ "from": "18:00", "to": "02:00" }],   // vira a meia-noite
    "saturday":  [], "sunday": []
  }
}
```

### Offer

```jsonc
{
  "_id": "…", "title": "BEMVINDO10", "disabled": false,
  "triggers": { "coupon": { "code": "BEMVINDO10" } },
  "rules": {},
  "rewards": { "discountType": { "type": 1, "value": 10 } }
  // type 1 = percentual · type 2 = valor fixo
}
```

---

## 5. Vinculação dos dados

O backend devolve **listas planas com ids**. Montar o grafo no cliente é o passo
que dá mais trabalho e ninguém documenta. Ordem correta:

```dart
void linkAll(List<Product> products,
             List<ComplementsGroup> groups,
             List<ComplementsGroupCategory> groupCats,
             List<Offer> offers,
             List<Category> categories) {

  final productMap  = { for (final p in products)   p.id: p };
  final groupMap    = { for (final g in groups)      g.id: g };
  final catMap      = { for (final c in categories) c.id: c };

  // 1. group.items (ids) → objetos Product
  //    Um "item de complemento" É um Product. Mesma collection.
  for (final g in groups) {
    g.products = g.items
        .map((id) => productMap[id])
        .whereType<Product>()
        .toList();
  }

  // 2. product.complementsGroups (ids) → objetos ComplementsGroup
  //    Preservar a ORDEM do array: é a ordem que o painel definiu
  for (final p in products) {
    p.groups = p.complementsIds
        .map((id) => groupMap[id])
        .whereType<ComplementsGroup>()
        .toList();
  }

  // 3. product.category → Category.products
  for (final p in products) {
    catMap[p.categoryId]?.products.add(p);
  }

  // 4. offers → product.productOffer (quando houver vínculo)
  //    ⚠️ conferir como o backend expressa isso na sua base
}
```

**Depois:** ordenar categorias por `seq`, produtos por `seq`, e descartar
categorias que ficaram sem produtos visíveis.

---

## 6. Imagens

### Onde estão

Prioridade de extração — **nesta ordem**:

```dart
String extractImageUrl(Map<String, dynamic> raw) {
  // 1. staticImage[0].photo
  final static = raw['staticImage'];
  if (static is List && static.isNotEmpty) {
    final photo = static[0]?['photo'];
    if (photo is String && photo.isNotEmpty) return photo;
  }

  // 2. sliderHeader.image[0].photo — só se active != false
  final slider = raw['sliderHeader'];
  if (slider is Map) {
    final imgs = slider['image'];
    if (imgs is List && imgs.isNotEmpty) {
      final first = imgs[0];
      if (first?['active'] != false) {
        final photo = first?['photo'];
        if (photo is String && photo.isNotEmpty) return photo;
      }
    }
  }

  return '';   // sem imagem → placeholder
}
```

> **Atenção:** `staticImage` às vezes vem como **string vazia** `""` em vez de
> lista. Checar o tipo antes de indexar, senão crasha.

### Hosts

```
https://berpimagescloud.s3.amazonaws.com/<hash>.png
https://berpimagescloud.s3.sa-east-1.amazonaws.com/<pasta>/<uuid>.jpg
https://klavi-img.s3.amazonaws.com/<hash>.png
```

### ⚠️ CORS

Os buckets **não devolvem `Access-Control-Allow-Origin`**. No web isso quebra o
pré-cache via `fetch`. **No Flutter nativo não há CORS** — `CachedNetworkImage`
funciona sem problema. Só importe isso se for compilar para Flutter Web.

### Cache no Flutter

```dart
CachedNetworkImage(
  imageUrl: product.image,
  fadeInDuration: const Duration(milliseconds: 200),
  placeholder: (_, __) => const _Skeleton(),
  errorWidget: (_, __, ___) => const _ImagePlaceholder(),
  memCacheWidth: 600,          // não decodificar 2000px para um card de 180
)
```

**Pré-carregar no boot**, em lotes, para o cliente não ver imagem carregando ao
rolar:

```dart
Future<void> preloadMenuImages(List<String> urls, BuildContext ctx) async {
  const batch = 6;   // mais que isso satura a rede do restaurante
  for (var i = 0; i < urls.length; i += batch) {
    await Future.wait(
      urls.skip(i).take(batch).map((u) =>
        precacheImage(CachedNetworkImageProvider(u), ctx)
            .catchError((_) {})),   // falha em uma não pode parar o resto
    );
  }
}
```

---

## 7. Como apresentar o cardápio

### Estrutura de telas

```
┌─ Abertura (uma vez por sessão) ────────────────────────┐
│  1. Banner promocional (carrossel, opcional)           │
│  2. Idioma + "comer aqui ou levar"                     │
└────────────────────────────────────────────────────────┘
              ↓
┌─ Cardápio ─────────────────────────────────────────────┐
│  Header: voltar/recomeçar · logo · nome + modalidade   │
│          · idioma · chamar garçom (opcional)           │
│  Busca sempre visível (sem acento)                     │
│  Abas de categoria (com foto pequena)                  │
│  Grid 2 colunas de produtos                            │
│  FAB do carrinho                                       │
│  Tab bar: Cardápio · Pedido · Conta · Perfil           │
└────────────────────────────────────────────────────────┘
              ↓
Produto → Carrinho → Checkout → Confirmação (senha + NPS)
```

### Decisões de UX que valem copiar

| Decisão | Por quê |
|---|---|
| **Uma categoria por vez** (aba filtra, não rola) | lista com todas empilhadas some no scroll |
| **Busca sempre aberta**, sem botão de lupa | atrás de ícone, ninguém acha |
| **Busca ignora acento** | "acai" precisa achar "Açaí" |
| **Modalidade sempre visível no header** | ela muda preço; sem lembrete o cliente monta tudo sem saber |
| **Trocar modalidade só na tela inicial** | com carrinho montado exigiria recalcular tudo |
| **Esgotado aparece, riscado** | some-lo faz o cliente procurar e chamar o garçom |
| **Tela branca é bug** | cliente está de pé, com fome, e não abre console |

### Busca sem acento

```dart
String deaccent(String v) => removeDiacritics(v).toLowerCase();
// pacote: diacritic  ·  ou implementar com NFD + regex de combining marks

final q = deaccent(query.trim());
final results = allProducts.where((p) =>
    deaccent(tr.name(p)).contains(q) ||
    deaccent(tr.description(p) ?? '').contains(q));
```

Buscar no nome **traduzido**, não no original — senão o cliente com o app em
espanhol busca "pollo" e não acha nada.

### Estados do produto

```dart
enum ProductStatus { available, outOfStock, inactive, unavailablePeriod }

ProductStatus statusOf(Product p, List<Period> periods) {
  if (!p.active) return ProductStatus.inactive;          // nem deve aparecer
  if (isOutOfStock(p)) return ProductStatus.outOfStock;  // aparece, bloqueado
  if (p.relatedPeriod.isNotEmpty && !isPeriodOpen(periods, p.relatedPeriod)) {
    return ProductStatus.unavailablePeriod;              // aparece com horário
  }
  return ProductStatus.available;
}

bool isOutOfStock(dynamic item) {          // serve para Product E complemento
  final s = item.stock;
  if (s == null) return false;
  if (s.active == false) return false;     // sem controle → disponível
  return s.currentQuantity <= 0;
}
```

| Estado | Aparece? | Como |
|---|---|---|
| `inactive` | ❌ | filtrado na query (`active=true`) e no parse |
| `outOfStock` | ✅ | badge "Esgotado", cinza, não clicável |
| `unavailablePeriod` | ✅ | badge "Disponível 18h–22h" |
| `available` | ✅ | normal |

> **Complemento também esgota.** Checar `isOutOfStock` em cada item do grupo —
> esquecer isso deixa o cliente escolher uma bebida que acabou.

---

## 8. Complementos

A parte com mais regra de negócio. Leia inteiro antes de codar.

### Hierarquia real

```
Product
 └─ ComplementsGroup  "Escolha o sabor da sua bebida."   ← a PERGUNTA
     ├─ subcategoria  "Refrigerantes"                    ← agrupa os itens
     │   ├─ item      "Coca-Cola 350ml"
     │   └─ item      "Guaraná 350ml"
     └─ subcategoria  "Sucos"
         └─ item      "Suco de laranja"
```

**A subcategoria NÃO lista os grupos.** Quem aponta é o item:

```dart
// Cada item (que é um Product) tem:
item.complementGroupCategory   // → ComplementsGroupCategory._id

// Então o agrupamento é feito DENTRO do grupo:
Map<String, List<Item>> splitByCategory(
    List<Item> items, Map<String, GroupCategory> cats) {
  final buckets = <String, List<Item>>{};
  final loose = <Item>[];

  for (final i in items) {
    final cat = cats[i.complementGroupCategory];
    if (cat == null) { loose.add(i); continue; }
    buckets.putIfAbsent(cat.id, () => []).add(i);
  }

  // Se NENHUM item tem subcategoria → lista plana, sem nível extra
  if (buckets.isEmpty) return {'': loose};

  // Se há subcategorias, os sem-categoria viram uma seção "Outros"
  if (loose.isNotEmpty) buckets['__outros__'] = loose;

  return buckets;   // ordenar por cat.seq
}
```

### Tipos de grupo

| `ingredients` | `maxQuantity` | Tipo | UI |
|---|---|---|---|
| `false` | 1 | **Radio** | escolha única |
| `false` | > 1 | **Contador** | −/+ até o máximo |
| `true` | N | **Fracionado** | frações (pizza, sopa) |

`rules.mandatory` → grupo obrigatório. `rules.minQuantity` → mínimo exigido.

### UI recomendada

- Grupos e subcategorias **colapsados** por padrão
- Cabeçalho fechado mostra **o que já foi escolhido** ("2× Coca-Cola"), senão
  vira caixa-preta
- Subcategorias como **acordeão**: abrir uma fecha as outras do mesmo grupo
- **Toque na linha inteira adiciona**; diminuir só no botão −
  (alvo de 20px é pequeno para quem tem o celular numa mão)
- Ao preencher um grupo obrigatório, **abrir o próximo automaticamente**
- Validação falhando: **toast + abrir o grupo pendente** com borda vermelha
  (com tudo colapsado, apontar o erro não basta)

### Labels de preço

```dart
PriceLabel labelFor(double itemPrice, ComplementsGroup g) {
  if (g.ingredients) {
    final u = itemPrice / g.maxQuantity;
    return PriceLabel.price('${fmt(u)}/fração');
  }
  if (!g.mandatory) {
    return itemPrice <= 0
        ? PriceLabel.free()
        : PriceLabel.price(fmt(itemPrice));
  }
  // Grupo obrigatório: referência é o item mais barato do grupo
  final cheapest = g.products.map((p) => p.price).reduce(min);
  final diff = itemPrice - cheapest;
  return diff <= 0
      ? PriceLabel.included()              // "incluso", sem preço embaixo
      : PriceLabel.diff('+${fmt(diff)}');  // "+R$ 4,00"
}
```

---

## 9. Precificação

### Preço efetivo do produto

```dart
double effectivePrice(Product p) {
  if (p.offerprice != null && p.offerprice! < p.price) return p.offerprice!;
  if (p.productOffer != null) return applyOffer(p.price, p.productOffer!);
  return p.price;
}
```

### Preço exibido no card da lista

```dart
double cardPrice(Product p) {
  var price = effectivePrice(p);
  for (final g in p.groups) {
    // Grupo obrigatório NÃO fracionado soma o mais barato — é o mínimo
    // que o cliente vai pagar. Fracionado não entra: o rateio muda tudo.
    if (g.mandatory && g.minQuantity >= 1 && !g.ingredients) {
      price += g.products.map((i) => i.price).reduce(min);
    }
  }
  return price;
}
```

Exibir como **"A partir de R$ X"** quando o produto tem complementos.

### 🍕 Fracionado — o rateio

> **A regra em uma linha:** o preço do item é **rateado pela fração ocupada**,
> nunca somado inteiro.
>
> ```
> valor = preço_do_item × frações_escolhidas ÷ maxQuantity
> ```

**Dois cadastros usam a mesma regra, com significados diferentes:**

**Tipo A — o item vale o produto inteiro** (pizza)

| Escolha | Conta | Total |
|---|---|---|
| Meia Calabresa (60) + meia Marguerita (70) | 60÷2 + 70÷2 | **R$ 65,00** |
| Pizza inteira de Calabresa (2/2) | 60×2÷2 | **R$ 60,00** |
| 4 sabores: 80, 80, 100, 120 | cada ÷4 | **R$ 95,00** |
| 4 frações, 2 sabores (2/4 cada): 80 e 120 | cada ×2÷4 | **R$ 100,00** |

**Tipo B — o item é um acréscimo** (sopa, açaí, marmita)

| Escolha | Conta | Total |
|---|---|---|
| Sopa R$20, meio feijão (0) + **meio ovo (4)** | 20 + 0 + 4÷2 | **R$ 22,00** |
| Sopa R$20, sopa inteira de ovo (2/2) | 20 + 4×2÷2 | **R$ 24,00** |

```dart
double complementPrice(CartComplement c) =>
    c.price * c.quantity * (c.unitFraction ?? 1);

double cartItemSubtotal(CartItem item) {
  final base = effectivePrice(item.product);
  final extras = item.complements.fold(0.0, (a, c) => a + complementPrice(c));
  return (base + extras) * item.quantity;
}
```

`unitFraction = 1 / maxQuantity` em grupo fracionado, `1` nos demais.

> ⚠️ **Este é o bug que mais custou.** O `unitFraction` era gravado e enviado,
> mas não entrava na conta: duas metades de R$60 e R$70 exibiam R$65 na tela e
> cobravam **R$130** no total. Escreva teste para isso **antes** de liberar pizza.

### Embalagem para viagem

Grupos com `isTakeawayPackaging: true && autoAdd: true` têm seus itens
**adicionados automaticamente** quando a modalidade é "para levar", e removidos
ao voltar para "comer aqui". Marcar com `isPackaging: true` e **excluir da
exibição** de complementos no carrinho.

---

## 10. Dados do cliente

### O que coletar

| Campo | Quando | Onde guardar |
|---|---|---|
| Nome | obrigatório para pedir | local |
| Telefone | obrigatório para pedir | local |
| CPF | opcional (nota fiscal) | local |
| E-mail | opcional, se a casa usar | local |
| Endereço | só delivery | local + backend |

```dart
// Flutter: shared_preferences ou hive
class ClientInfo {
  final String name, phone, cpf, email;
  // Nunca enviar antes do pedido. Fica no aparelho.
}
```

### Visitante vs. identificado

```
Navegar, ver preços, montar carrinho  → livre
Enviar pedido                          → nome + telefone
Ver a conta da mesa                    → nome + telefone
```

Pedir cadastro para *ver preço* afasta o cliente sem contrapartida — e coletar
dado sem finalidade é o que a LGPD veda. Enviar pedido e abrir a conta têm
finalidade concreta: a cozinha precisa saber de quem é, e a conta expõe o
consumo das outras pessoas da mesa.

**Validação:** nome com 2+ caracteres, telefone com 10–13 dígitos (aceita fixo,
celular e estrangeiro).

### LGPD — obrigações práticas

| Item | Implementação |
|---|---|
| Consentimento **informado** | banner com **link para a política**; sem link não é consentimento |
| Scripts de terceiros | só carregar **após** o aceite |
| Direito de exclusão (art. 18) | canal de contato; apagar local **não basta** — os pedidos ficam no servidor |
| Minimização | não pedir e-mail se a casa não vai usar |

### Google Sign-In — o que ele resolve

| Dado | Google entrega? |
|---|---|
| Nome | ✅ |
| E-mail | ✅ |
| Foto | ✅ |
| **Telefone** | ❌ **não existe escopo** |

`phoneNumbers` da People API exige escopo `contacts`, sensível, com verificação
anual — não passa para um cardápio. **O telefone continua digitado.**

Em Flutter, o autofill nativo já ajuda:

```dart
TextField(autofillHints: const [AutofillHints.telephoneNumber]),
TextField(autofillHints: const [AutofillHints.name]),
TextField(autofillHints: const [AutofillHints.email]),
```

---

## 11. Enviar o pedido

```
POST api/orders
```

```jsonc
{
  "branch": "<branchId>",
  "simpleAuth": "<token da branch>",

  "consumptioncode": "MESA_03",     // mesa: nome da mesa · balcão: senha
  "consumptionint": 812,            // número do pedido, 500–999
  "locationType": 8,

  "amount": 64.8, "subtotal": 64.8, "total": 64.8,

  "totemClientName": "Ana Paula",
  "phone": "11955554321",
  "cpfCustomer": "12345678901",     // opcional
  "email": "ana@exemplo.com",       // opcional
  "comanda": "12",                  // se a branch usa comanda

  "note": "sem cebola",

  "paymentMethod": {
    "type": "table",                // table | counter
    "kind": "Cardápio",
    "label": "Pagar na mesa"
  },
  "additionalInfo": {
    "modality": "Consumir no local",
    "whereConsume": "OnLocal"       // OnLocal | OutsideLocal
  },

  "origin": "cardapio",             // ← MARCA A AUTORIA. Use "app" no seu app
  "tmProduto": 32.4,                // total ÷ Σ(peopleCount × qty), opcional

  "coupon": { "_id": "…", "title": "BEMVINDO10",
              "triggers": {}, "rules": {}, "rewards": {} },

  "items": [
    {
      "product": "<productId>",
      "name": "Frango crocante",
      "originalPrice": 25.9,
      "price": 25.9,
      "amount": 51.8,               // já com complementos e quantidade
      "quantity": 2,
      "note": "",
      "complements": [
        {
          "_id": "<grupoId>",
          "name": "Deseja uma Bebida?",
          "items": [
            { "_id": "<itemId>", "name": "Coca cola 300ml",
              "price": 6.5, "quantity": 2, "unitFraction": 1 }
          ]
        }
      ]
    }
  ]
}
```

### ⚠️ Duas multiplicações que o backend precisa fazer

```
1. complemento.quantity × item.quantity
   2 Frangos × 2 Cocas cada = 4 Cocas

2. complemento.price × quantity × unitFraction × item.quantity
   Pizza meia a meia: 60×1×0.5 + 70×1×0.5 = R$ 65 (não R$ 130)
```

**Confirme com um pedido real que o backend aplica as duas.** O app pode estar
certo e a cozinha receber o valor dobrado.

### Senha do balcão

Formato **1 letra + 3 dígitos**: `A042`. Feito para ser chamado em voz alta.

```dart
const _letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // sem I e O

String gerarSenha([int digitos = 3]) {
  final l = _letras[_rnd.nextInt(_letras.length)];
  final n = _rnd.nextInt(pow(10, digitos).toInt())
              .toString().padLeft(digitos, '0');
  return '$l$n';
}
```

**Sem `I` e `O`:** lidos de longe viram `1` e `0` e o cliente vai ao balcão com
a senha errada.

**Risco de colisão** (janela de 30 min, 24.000 combinações):

| Pedidos em 30 min | Chance de duas iguais |
|---|---|
| 10 | 0,19% |
| 20 | 0,79% |
| 40 | 3,2% |
| 100 | 18,6% |

Até movimento médio é aceitável. **O ideal é o backend gerar a senha** e
devolvê-la na resposta do POST — aí a colisão deixa de existir.

### Idempotência

Duplo toque em "fazer pedido" **não pode duplicar**. Desabilite o botão durante
o envio **e** mande um `Idempotency-Key`:

```dart
final key = const Uuid().v4();   // gerado UMA vez por tentativa de pedido
await dio.post('/api/orders', data: payload,
               options: Options(headers: {'Idempotency-Key': key}));
```

> O backend ainda não trata isso — vale pedir. Sem idempotência, um retry por
> timeout pode gerar dois pedidos na cozinha.

---

## 12. Acompanhamento e conta

### Status do pedido

```
GET api/orders?consumptioncode=<code>&branch=<id>&simpleAuth=<token>&$sort[createdAt]=-1&$limit=50
```

Polling a cada 30s. Estados: `pending` · `in_progress` · `ready` · `delivered` ·
`cancelled`.

```dart
// Notificar quando ficar pronto — vibração + notificação local
if (status == 'ready' && previous != 'ready') {
  HapticFeedback.heavyImpact();
  await _localNotifications.show(0, 'Pedido pronto!',
      'Sua senha $senha foi chamada.', _details);
}
```

> **No Flutter você tem vantagem sobre a web aqui:** notificação local e push
> real. Vale usar — é a diferença entre o cliente olhar a tela e ser avisado.

### Conta da mesa

Precisa de **sessão de mesa**, que ainda não existe no backend:

```jsonc
{
  "session": {
    "id": "sess_7f3a",       // muda a cada abertura de mesa
    "status": "open",        // open | closed | paid | cancelled
    "openedAt": "2026-07-29T19:30:00Z",
    "closedAt": null,
    "waiter": { "name": "Marcos" },
    "table": "MESA_03"
  },
  "data": [ /* pedidos SÓ desta sessão */ ]
}
```

**Sem isso, `consumptioncode=MESA_03` devolve todos os pedidos que a mesa já
teve** — a conta de hoje vem somada à de ontem.

E há um problema pior: garçom fecha a MESA_03, outro cliente senta, e o celular
do cliente anterior — ainda com o app aberto — **consegue lançar pedido na
comanda de quem chegou depois**. Cobra a pessoa errada.

**No app:** guardar `session.id`, comparar a cada poll, e ao detectar `id`
diferente ou `status: closed/paid` → limpar carrinho, códigos e comanda, e mostrar
"conta encerrada".

**No balcão não existe sessão** — o `consumptioncode` já delimita o pedido, e
não há quem feche uma sessão de balcão. Não invente uma sintética.

### Duas visões da conta

| Visão | Conteúdo |
|---|---|
| **Resumida** (padrão) | itens iguais somados, como a conta do caixa |
| **Detalhada** | por pedido, com quem lançou e horário, filtrável por pessoa |

**Carimbe o horário da última atualização.** Se a API cai, a tela segue mostrando
o último dado — e sem o carimbo o cliente compara com o app do garçom, vê valores
diferentes e conclui que alguém está cobrando errado.

### Autoria de cada pedido

```
order.origin == 'cardapio' | 'app'  → o cliente
ausente / outro                     → atendente (PDV, comanda)
```

É **inferência**. O ideal é o backend mandar
`createdBy: { type: 'customer' | 'staff', name }`.

**Use um `origin` próprio no seu app** (`"app"`), para distinguir dos três canais.

---

## 13. Horário de funcionamento

```dart
/// Horário comercial é SEMPRE local. Comparar em minutos desde 00:00.
int _toMinutes(String hhmm) {
  final m = RegExp(r'^\s*(\d{1,2}):(\d{2})').firstMatch(hhmm);
  if (m == null) return -1;
  final h = int.parse(m.group(1)!), min = int.parse(m.group(2)!);
  if (h > 23 || min > 59) return -1;
  return h * 60 + min;
}

bool isPeriodOpen(Period period) {
  final now = DateTime.now();
  final nowMin = now.hour * 60 + now.minute;
  final today = now.weekday % 7;   // Dart: 1=seg..7=dom → 0=dom..6=sáb

  for (final slot in period.forDay(today)) {
    final from = _toMinutes(slot.from), to = _toMinutes(slot.to);
    if (from < 0 || to < 0) continue;
    if (to > from)  { if (nowMin >= from && nowMin <= to) return true; }
    else if (to < from) { if (nowMin >= from) return true; }  // vira o dia
  }

  // Faixa de ONTEM que atravessou a meia-noite e ainda corre
  final yesterday = (today + 6) % 7;
  for (final slot in period.forDay(yesterday)) {
    final from = _toMinutes(slot.from), to = _toMinutes(slot.to);
    if (from < 0 || to < 0) continue;
    if (to < from && nowMin <= to) return true;
  }

  return false;
}
```

> ⚠️ **Nunca converta para UTC para montar a data do slot.** Em GMT-3, das 21h à
> meia-noite o UTC já está no dia seguinte, e a loja aparece fechada a noite
> toda. Esse bug existiu e passou desapercebido porque todos os testes usavam
> horários antes das 21h.
>
> ⚠️ **Faixa `to < from`** (18:00→02:00) precisa ser tratada, senão um bar
> aberto até 2h aparece fechado a noite inteira.

**Fora do horário:** mostrar tela de "fechado" com os horários e contagem
regressiva para a próxima abertura. Em delivery, fechar **pedidos** mas manter o
cardápio navegável.

---

## 14. Tema e identidade

```jsonc
// company.settingsTotem
{
  "primaryColor": "#1D9E75",
  "logo": "https://..."
}

// branch.settingsWeb — sobrescreve a company
{
  "menuName": "Bebelu Lanches",
  "menuShortName": "Bebelu",
  "pwaIcon512": "https://..."
}
```

**No Flutter isso é mais simples que na web:** o app tem nome e ícone próprios no
build, e a cor da marca entra no `ThemeData`:

```dart
ThemeData buildTheme(String brandHex) {
  final brand = Color(int.parse('FF${brandHex.substring(1)}', radix: 16));
  return ThemeData(
    colorScheme: ColorScheme.fromSeed(seedColor: brand),
    useMaterial3: true,
  );
}
```

> **Não use `secondaryColor` como cor de fundo.** Cor secundária é acento de
> marca; usá-la como fundo deixou o app inteiro escuro numa empresa. Já aconteceu.

**Tema claro fixo é uma escolha defensável:** o cardápio é a vitrine do
restaurante e não deveria mudar de cor conforme o celular do cliente. Se seguir
o tema do sistema, teste as duas variações com as cores de cada empresa.

### Idiomas

```jsonc
{ "languages": ["pt", "es", "en"] }
```

Traduções de produto/categoria vêm do backend:

```jsonc
{ "translations": { "en": { "name": "Crispy chicken", "description": "…" } } }
```

Tradução vazia **cai para o português** — cardápio meio traduzido é utilizável,
com linhas em branco não é.

> `translations` às vezes vem como **array vazio** `[]` em vez de objeto. Checar
> o tipo antes de indexar.

**Bandeiras: use SVG/asset, não emoji.** Emoji de bandeira não renderiza no
Windows e em alguns Androids — aparece "BR" no lugar.

---

## 15. Fidelidade, cashback e cupons

Esta é a parte **nova** do seu app — não existe no backend hoje. Abaixo, o
desenho proposto.

### 15.1 A decisão que vem antes de tudo: identidade do cliente

O cardápio atual **não tem login**. Fidelidade **exige** identidade persistente.
Três caminhos:

| Modelo | Como funciona | Prós | Contras |
|---|---|---|---|
| **Telefone + OTP** ⭐ | SMS/WhatsApp com código | familiar no Brasil, sem senha, telefone já é coletado | custo do SMS |
| CPF | cliente digita CPF | zero atrito, sem custo | fácil de errar/fraudar, dado sensível |
| Login social | Google/Apple | rápido | não dá telefone; menos aderência no público de balcão |

**Recomendação: telefone + OTP**, com CPF opcional para nota fiscal. O telefone
já é obrigatório para pedir — a fidelidade vira um "quer acumular pontos?" no
mesmo campo, sem cadastro extra.

```jsonc
POST api/auth/otp/request   { "phone": "11955554321" }
POST api/auth/otp/verify    { "phone": "…", "code": "123456" }
→ { "token": "<jwt>", "customer": { "id": "…", "name": "Ana", "points": 340, "cashback": 12.50 } }
```

> **Aproveite para consertar o `simpleAuth`.** Com JWT por cliente, o pedido
> passa a ser autenticado de verdade, e o token público de branch deixa de ser
> a única barreira.

### 15.2 Escolha UM mecanismo principal

O erro mais comum é ligar pontos + cashback + cupons ao mesmo tempo. O cliente
não entende, o caixa não sabe explicar, e ninguém usa.

| Mecanismo | Como o cliente entende | Melhor para |
|---|---|---|
| **Cashback** | "8% do que gastei volta como crédito" | fácil de explicar, gera recompra rápida |
| **Pontos** | "cada R$1 = 1 ponto, 500 pontos = um lanche" | ticket alto, prêmios aspiracionais |
| **Selos** | "compre 9, o 10º é grátis" | item único e repetitivo (café, açaí) |
| **Cupons** | código com desconto | campanha pontual, aquisição |

**Recomendação: comece com cashback + cupons.** Cashback é o mais direto de
comunicar, e cupom você já tem meio-caminho no backend (`api/offers`).

### 15.3 Cashback — modelo de dados

```jsonc
// Configuração, em branch.settingsWeb ou company
{
  "cashback": {
    "enabled": true,
    "percent": 8,                    // 8% do valor do pedido
    "minOrderValue": 30,             // só gera acima de R$30
    "expiresInDays": 90,             // crédito expira
    "maxUsePercent": 50,             // pode pagar até 50% do pedido com crédito
    "creditAfter": "delivered",      // só credita quando entregue (evita fraude
                                     // de pedido cancelado)
    "creditDelayHours": 24           // carência contra estorno
  }
}
```

```jsonc
// Carteira do cliente
GET api/customers/me/wallet
{
  "balance": 12.50,
  "expiring": [ { "amount": 4.20, "expiresAt": "2026-09-15" } ],
  "history": [
    { "type": "earned", "amount": 3.60, "orderId": "…", "at": "…" },
    { "type": "spent",  "amount": -8.00, "orderId": "…", "at": "…" },
    { "type": "expired", "amount": -2.10, "at": "…" }
  ]
}
```

**No pedido:**

```jsonc
{
  "cashbackUsed": 8.00,        // quanto do crédito foi aplicado
  "cashbackToEarn": 4.55       // informativo; o backend recalcula e credita
}
```

> **O backend recalcula sempre.** Nunca confie no valor de cashback que o app
> mandou — é dinheiro, e o app roda no aparelho do cliente.

### 15.4 Pontos — se preferir esse caminho

```jsonc
{
  "loyalty": {
    "enabled": true,
    "pointsPerCurrency": 1,          // R$1 = 1 ponto
    "rewards": [
      { "id": "r1", "points": 500, "type": "product",  "productId": "…",
        "title": "Hambúrguer simples grátis" },
      { "id": "r2", "points": 300, "type": "discount", "value": 15,
        "title": "R$15 de desconto" },
      { "id": "r3", "points": 800, "type": "percent",  "value": 30,
        "title": "30% off no próximo pedido" }
    ],
    "tiers": [                        // opcional — níveis
      { "name": "Bronze", "minPoints": 0,    "multiplier": 1.0 },
      { "name": "Prata",  "minPoints": 1000, "multiplier": 1.2 },
      { "name": "Ouro",   "minPoints": 3000, "multiplier": 1.5 }
    ],
    "expiresInDays": 365
  }
}
```

### 15.5 Cupons — o que já existe e o que falta

**Já existe** em `api/offers`:

```jsonc
{
  "_id": "…", "title": "BEMVINDO10", "disabled": false,
  "triggers": { "coupon": { "code": "BEMVINDO10" } },
  "rewards": { "discountType": { "type": 1, "value": 10 } }
  // type 1 = percentual · type 2 = valor fixo
}
```

**Falta para um sistema de verdade:**

| # | Item | Por quê |
|---|---|---|
| C1 | **Validação no backend** | hoje o app valida contra a lista pública — dá para forjar |
| C2 | Limite de uso por cliente | senão um cupom de boas-vindas roda para sempre |
| C3 | Limite total de resgates | controle de budget da campanha |
| C4 | Validade (início e fim) | |
| C5 | Valor mínimo do pedido | |
| C6 | Restrição por produto/categoria | "10% em pizzas" |
| C7 | Primeira compra apenas | cupom de aquisição |
| C8 | Não acumular com cashback | regra de negócio explícita |
| C9 | Cupom pessoal (código único por cliente) | recuperação de cliente inativo |

```jsonc
// Validação server-side — o app manda, o backend decide
POST api/coupons/validate
{ "code": "BEMVINDO10", "branch": "…", "items": [ /* carrinho */ ], "subtotal": 64.80 }

→ 200 { "valid": true, "discount": 6.48, "title": "10% de boas-vindas",
        "appliesTo": ["<itemId>"], "stackableWithCashback": false }
→ 422 { "valid": false, "reason": "min_order_value",
        "message": "Válido em pedidos acima de R$ 80,00" }
```

**A mensagem de recusa importa.** "Cupom inválido" faz o cliente achar que o
código está errado e desistir. "Válido acima de R$80" faz ele adicionar mais um
item.

### 15.6 Ideias que funcionam em restaurante

Ordenadas por relação esforço/retorno:

| Ideia | Como | Por que funciona |
|---|---|---|
| **Cashback progressivo** | 5% normal, 10% em dia parado (terça) | enche o salão no dia fraco, sem descontar no dia cheio |
| **Selo digital de item** | "compre 9 açaís, o 10º é grátis" | visual, viciante, e o cliente conta junto |
| **Cupom no NPS** | avaliou 5 estrelas → cupom para a próxima | fecha o ciclo: avaliação vira recompra |
| **Aniversário** | sobremesa grátis no mês | altíssima conversão, custo baixo |
| **Recuperação de inativo** | 30 dias sem pedir → cupom pessoal | recuperar é mais barato que adquirir |
| **Cashback dobrado no primeiro pedido** | 16% na estreia | tira o cliente da inércia de instalar |
| **Indicação** | ambos ganham crédito | aquisição paga por si |
| **Bônus por horário** | +5% fora do pico | espalha a demanda sem contratar |
| **Meta de gasto** | "faltam R$18 para R$20 de crédito" | aumenta ticket médio |
| **Combo de fidelidade** | prêmio é produto, não desconto | protege a margem melhor que % |

### 15.7 Como mostrar no app

```
┌─ Home ─────────────────────────────────────────┐
│  Saldo: R$ 12,50 disponível        [Ver mais]  │
│  ▓▓▓▓▓▓▓░░░  faltam R$18 p/ +R$20              │
└────────────────────────────────────────────────┘

┌─ Checkout ─────────────────────────────────────┐
│  Subtotal            R$ 64,80                  │
│  ☑ Usar R$ 8,00 de crédito      −R$ 8,00       │
│  Cupom BEMVINDO10               −R$ 6,48       │
│  ───────────────────────────────────────       │
│  Total                          R$ 50,32       │
│  ✨ Você vai ganhar R$ 4,03 de volta           │
└────────────────────────────────────────────────┘
```

**Regras de interface que evitam suporte:**

1. **Mostrar o que vai ganhar antes de pagar** — o incentivo tem que estar
   visível na hora da decisão, não depois
2. **Nunca deixar o crédito zerar sem aviso** — notificar 7 dias antes de expirar
3. **Uma linha por benefício no total** — cliente precisa conferir a conta
4. **Se não pode acumular, dizer qual escolher** e mostrar qual compensa mais
5. **Extrato sempre acessível** — "onde foram meus pontos?" é a dúvida nº 1
6. **Não gamificar demais** — barra de progresso e selos, sim; ranking e
   competição, não. Ninguém quer competir para comprar comida

### 15.8 Riscos a tratar desde o desenho

| Risco | Mitigação |
|---|---|
| Crédito em pedido cancelado | creditar só em `delivered`, com carência de 24h |
| Fraude de múltiplas contas | 1 conta por telefone verificado; limite de cupom por CPF |
| Cashback + cupom zerando a conta | `maxUsePercent` e `stackableWithCashback: false` |
| Passivo contábil crescendo | validade obrigatória (`expiresInDays`) |
| Cliente perde o telefone | recuperação por CPF + validação no caixa |
| App offline no resgate | resgate **sempre** validado no servidor; nunca confiar no saldo local |

---

## 16. Armadilhas

Bugs que já aconteceram neste projeto. Cada um custou depuração.

| # | Bug | Sintoma | Causa |
|---|---|---|---|
| 1 | **Fracionado cobrando o dobro** | tela mostra R$65, total cobra R$130 | `unitFraction` não entrava no cálculo |
| 2 | **Loja fechada das 21h à meia-noite** | "estamos fechados" com a loja aberta | `toISOString()` (UTC) para montar a data do slot |
| 3 | **Bar até 2h fechado a noite toda** | idem | faixa `to < from` não tratada |
| 4 | **"2× Coca" cobrando 4** | carrinho contradiz o total | quantidade de complemento é **por unidade** |
| 5 | **Subcategoria de complemento vazia** | grupos sem agrupamento | a categoria não lista grupos; o **item** aponta |
| 6 | **Grupo obrigatório virando opcional** | pedido sem escolha obrigatória | `rules` é aninhado, não raiz |
| 7 | **Complemento esgotado selecionável** | cliente escolhe o que acabou | `isOutOfStock` não checado no complemento |
| 8 | **App inteiro escuro** | cores erradas | `secondaryColor` usada como fundo |
| 9 | **Bandeira virando "BR"** | seletor de idioma sem ícone | emoji de bandeira não renderiza no Windows |
| 10 | **Tela branca no carrinho vazio** | app morre | variável lida antes de ser inicializada |

**A lição transversal:** os cinco primeiros são erros de **dinheiro ou
disponibilidade**, e nenhum foi pego por teste porque os testes usavam os casos
fáceis. Escreva teste para meia pizza, para 21h30, e para 2 unidades com 2
complementos — antes de abrir.

---

## 17. Checklist de implementação

### Fase 1 — Cardápio funcionando
- [ ] Deep link capturando `branch`, `table`, `mode`
- [ ] Boot paralelo dos 8 endpoints, com timeout de 15s
- [ ] `linkAll` montando o grafo (§5)
- [ ] Tela de erro → **leitura de QR**, não mensagem genérica
- [ ] Categorias com foto, uma por vez
- [ ] Busca sem acento, no nome traduzido
- [ ] Estados: esgotado, fora do horário, inativo
- [ ] Horário local, com faixa virando meia-noite

### Fase 2 — Pedido
- [ ] Complementos: radio, contador, fracionado
- [ ] Subcategorias por `complementGroupCategory`
- [ ] Grupos colapsados, com resumo no cabeçalho
- [ ] Toque na linha adiciona; − remove
- [ ] Validação abrindo o grupo pendente
- [ ] **Teste de rateio fracionado (tipo A e tipo B)**
- [ ] Embalagem automática em "para levar"
- [ ] Carrinho persistido na sessão
- [ ] Identificação: nome + telefone
- [ ] POST com `origin: "app"` e `Idempotency-Key`
- [ ] Botão desabilitado durante o envio

### Fase 3 — Acompanhamento
- [ ] Polling de status a cada 30s
- [ ] **Notificação local** ao ficar pronto
- [ ] Senha letra+3 dígitos (sem I e O)
- [ ] Conta da mesa, resumida e detalhada
- [ ] Carimbo de última atualização
- [ ] NPS após o pedido

### Fase 4 — Fidelidade
- [ ] Login por telefone + OTP
- [ ] Carteira: saldo, extrato, expiração
- [ ] Cashback exibido **antes** de pagar
- [ ] Cupom validado **no servidor**
- [ ] Mensagem de recusa explicando o motivo
- [ ] Notificação de crédito expirando
- [ ] Cupom de aniversário e de NPS

### Fase 5 — Operação
- [ ] Sessão de mesa (`session.id`, `status`)
- [ ] LGPD: política, consentimento, exclusão
- [ ] Analytics após aceite
- [ ] Monitoramento de erro (Sentry/Crashlytics)
- [ ] Testes E2E do fluxo de pedido

---

## Apêndice — Diferenças Flutter vs. Web

O que fica **mais fácil** em Flutter:

| Item | Na web | Em Flutter |
|---|---|---|
| Instalação | PWA, frágil no Android | app de verdade, com nome e ícone |
| Notificação | permissão frágil, iOS limitado | push e notificação local nativas |
| Câmera / QR | `BarcodeDetector` + fallback jsQR | `mobile_scanner`, uniforme |
| CORS de imagem | bloqueia o pré-cache | não existe |
| Vibração | `navigator.vibrate`, só HTTPS | `HapticFeedback` |
| Armazenamento | localStorage, cota apertada | Hive/SQLite |
| Cor do sistema | CSS vars | `ThemeData` |

O que fica **mais difícil**:

| Item | Nota |
|---|---|
| Distribuição | loja, revisão, atualização — não é `git push` |
| Deep link | precisa de App Links/Universal Links configurados |
| Descoberta | QR abre o navegador; app exige instalação prévia |
| Tamanho | ~15 MB vs. ~200 KB |

> **Consequência prática:** o cardápio de mesa/balcão continua fazendo mais
> sentido na web (QR → abre → pede, sem instalar). O app instalável faz sentido
> **para o cliente recorrente** — que é exatamente o público de fidelidade.
> Os dois convivem: web para a primeira visita, app para quem volta.

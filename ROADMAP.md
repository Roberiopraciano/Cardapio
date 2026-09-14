# Roadmap e Plano de Testes

Estado do projeto, o que falta, e o roteiro de teste antes de colar QR Code em mesa.

> Guia de configuração: [`CONFIGURACAO.md`](CONFIGURACAO.md) ·
> Contrato da API: [`BACKEND.md`](BACKEND.md) ·
> Publicação: [`DEPLOY.md`](DEPLOY.md)

---

## 1. Onde estamos

### Pronto e testado por unidade
- Precificação: piso do card, franquia do "incluso", oferta, **fracionado** —
  `calcUnitPrice` é a porta única de tela, carrinho e checkout
- Horário de funcionamento, incluindo faixas que viram a meia-noite
- Estoque, períodos de produto, cupom
- Geração de senha (`consumptioncode` / `consumptionint`)
- Validação do link do QR (`qrParams`) e filtro de `allowedModes`
- Escopo de storage por company, com migração do dado global antigo
- Formatação de quantidade fracionada na conta (`billFormat`)
- 253 testes automatizados

### Pronto, **sem teste automatizado**
- Fluxo de pedido ponta a ponta
- Conta da mesa (em mock), com cancelado/transferido/fração
- Histórico local (em mock)
- Idiomas, banners, comanda, identificação
- PWA, scanner de QR
- Validade do carrinho (`cartTtlMinutes`, padrão 4h)
- Reverificação de loja aberta antes de enviar o pedido
- Habilitação de status/painel por branch (`orderStatusEnabled`,
  `passwordPanelEnabled`) — **desligados por padrão**, com mock de progressão

### Bloqueado no backend
- `simpleAuth` + middleware do `POST api/orders`
- Sessão de mesa aberta (`tableSession`)
- `createdBy` explícito no pedido
- `acceptingOrders` — pausa de pedidos sem mexer no horário
- `items[].status` — cancelado e transferido na conta
- Recusa do `POST api/orders` com a loja fechada ou pausada

---

## 2. Roadmap

### Fase 1 — Destravar o piloto

| # | Item | Onde | Bloqueia |
|---|---|---|---|
| 1 | `settingsWeb.simpleAuth` no model Branch | Laravel | envio de pedido |
| 2 | Middleware aceitando `simpleAuth` sem Bearer | Laravel | envio de pedido |
| 3 | `throttle:20,1` no `POST api/orders` | Laravel | segurança |
| 4 | CORS do domínio do cardápio | Laravel | tudo |
| 5 | Backend multiplicar `complemento.quantity × item.quantity` | Laravel | valor do pedido |
| 5b | **`POST api/orders` não exigir forma de pagamento** | Laravel | pedido do celular não é pagamento — ver `BACKEND.md` §3 |
| 6 | HTTPS + fallback de SPA | infra | PWA e rotas |
| 7 | Desligar os 3 mocks | frontend | dados reais |

### Fase 2 — Sessão de mesa

O item mais estrutural do roadmap. Hoje o app não tem noção de **sessão**: ele
sabe qual mesa, não qual *atendimento* daquela mesa.

| # | Item | Nota |
|---|---|---|
| 8 | `tableSession` (atendimento aberto) | sem isso a MESA_03 de hoje soma a conta de ontem |
| 9 | `GET api/orders` filtrado pela sessão aberta | |
| 10 | `session: { id, openedAt, closedAt, waiter, status }` no retorno | tela já consome `openedAt` e `waiter` |
| 10b | Estado **`closing`** entre `open` e `paid` | base para o pagamento no celular — ver Fase 3.5 |
| 11 | Encerrar a sessão no cliente quando a mesa fecha | ver ciclo abaixo |
| 12 | `discount` / `serviceTax` / `coupon` no pedido | tela já exibe se vier |
| 13 | `createdBy: { type, name }` | substitui a inferência por `origin` |
| 13b | **Backend gerar `consumptioncode` do balcão** | hoje é sorteado no cliente e repete a cada ~180 pedidos com 3 dígitos |

#### O ciclo que precisa existir

```
   cliente senta          pede            pede           garçom fecha e recebe
        │                  │               │                      │
        ▼                  ▼               ▼                      ▼
   ┌──────────┐      ┌──────────┐   ┌──────────┐          ┌───────────────┐
   │ ABERTA   │─────▶│ ABERTA   │──▶│ ABERTA   │─────────▶│   ENCERRADA   │
   │ openedAt │      │ 1 pedido │   │ 2 pedidos│          │ closedAt/paid │
   └──────────┘      └──────────┘   └──────────┘          └───────────────┘
        │                                                          │
        │                                                          ▼
        │                                          ┌──────────────────────────┐
        │                                          │ app zera carrinho,       │
        │                                          │ códigos e comanda,       │
        └── mesma sessão em todos os celulares ───▶│ mostra "conta encerrada" │
                                                   └──────────────────────────┘
```

#### O que o backend precisa expor

```jsonc
// GET api/orders?consumptioncode=MESA_03&branch=...&simpleAuth=...
{
  "session": {
    "id": "sess_7f3a",              // muda a cada abertura de mesa
    "status": "open",               // open | closed | paid | cancelled
    "openedAt": "2026-07-29T19:30:00Z",
    "closedAt": null,               // preenchido ao fechar
    "waiter": { "name": "Marcos" },
    "table": "MESA_03"
  },
  "data": [ /* pedidos SÓ desta sessão */ ]
}
```

**Regras:**

1. Abrir a mesa gera um `session.id` novo. A mesma MESA_03 amanhã é outra sessão
2. `GET api/orders` devolve **apenas** os pedidos da sessão aberta
3. `POST api/orders` **rejeita** pedido em mesa sem sessão aberta — isso sozinho
   barra boa parte do abuso do `simpleAuth` público
4. Fechar/pagar muda `status` e preenche `closedAt`

#### Validação da mesa no boot — a mesa existe? está livre?

Hoje o app valida apenas o **formato** de `?table=` (`src/lib/qrParams.ts`): ele
sabe rejeitar `MESA_@#$`, mas não sabe se `MESA_99` existe na branch. Quem sabe é
o backend, e hoje ele não é perguntado.

```jsonc
// GET api/tables?branch=…&code=MESA_03&simpleAuth=…
{
  "exists": true,
  "table": {
    "code": "MESA_03",
    "name": "Mesa 3 — varanda",
    "status": "occupied",          // free | occupied | reserved | closing | blocked
    "acceptsOrders": true,         // a resposta que o app realmente consome
    "session": { "id": "sess_7f3a", "status": "open", "openedAt": "…" }
  }
}
```

| # | Item | Por quê |
|---|---|---|
| V1 | `exists: false` → app manda para a **leitura de QR Code** | QR de mesa que foi removida do cadastro continua colado na parede |
| V2 | `status` explícito, com vocabulário fechado | "bloqueada para manutenção" e "livre" não podem ser o mesmo silêncio |
| V3 | **`acceptsOrders` calculado no servidor** | a regra de quem pode pedir é da casa, não do app; o app não deve remontar essa lógica |
| V4 | `blocked` / `reserved` → tela explicando, com opção de chamar atendente | tela branca ou "sem conexão" seria a resposta errada |
| V5 | `closing` → cardápio em leitura, sem enviar pedido | a conta já foi congelada (ver Fase 3.5) |
| V6 | Mesa livre + `mode=mesa` → abre sessão no 1º pedido, não no boot | escanear o QR para olhar o cardápio não pode ocupar mesa |
| V7 | Endpoint público, mas com `simpleAuth` e throttle | responde "esta mesa está ocupada?" — dá para varrer o salão inteiro |

> **`acceptsOrders` é o campo que importa.** Sem ele, cada cliente (este app, o
> totem, o app do garçom) reimplementa "pode pedir?" a partir de `status`, e as
> três versões divergem no primeiro caso de borda. Um booleano decidido pelo
> servidor é a única forma de as três concordarem.

> **Por que não bloquear no boot por padrão:** exigir mesa livre para abrir o
> cardápio quebra o caso mais comum — a pessoa senta, escaneia e fica olhando o
> menu por dez minutos antes de chamar alguém. A validação serve para **recusar
> o pedido** e para explicar mesa inexistente ou bloqueada, não para barrar a
> leitura do cardápio.

#### O que o app precisa fazer

| # | Comportamento | Por quê |
|---|---|---|
| 14 | Guardar o `session.id` recebido | comparar com o próximo poll |
| 15 | Poll detecta `id` diferente → **sessão nova** | mesa foi fechada e reaberta; o carrinho é de outra pessoa |
| 16 | Poll detecta `status: closed/paid` → **encerrar** | limpa carrinho, códigos e comanda; mostra "conta encerrada, obrigado" |
| 17 | Bloquear envio de pedido com sessão encerrada | senão o pedido cai numa comanda já paga |
| 18 | Reabrir o app depois de encerrada → tela de leitura de QR | a mesa pode estar com outro cliente agora |

> **Por que isso importa mais do que parece:** hoje, se o garçom fecha a MESA_03
> e outro cliente senta em seguida, o celular do cliente anterior — se ainda
> estiver com o app aberto — continua enxergando a mesa e **consegue lançar
> pedido na comanda de quem chegou depois**. É o cenário que mais dói: cobra a
> pessoa errada.

#### ⚠️ Balcão não tem sessão

Tratar os dois modos com o mesmo conceito é o erro a evitar. No balcão o cliente
pede, paga e leva — não há mesa para abrir nem para fechar.

| | Mesa | Balcão |
|---|---|---|
| O que agrupa | o **atendimento** da mesa | o **pedido** |
| Chave | `session.id` | o `consumptioncode` (senha) |
| Pedidos acumulam | sim, na conta | não, cada senha é uma venda |
| Quem encerra | garçom, ao receber | pagamento no balcão |
| Tela de conta | soma da sessão | **não existe** — vira "Meus pedidos", local |

O app já lida com `session` ausente: a tela só não mostra o cabeçalho de
abertura/garçom. **Não criar sessão sintética para o balcão** — ela não teria
quem a fechasse, ficaria aberta para sempre e viraria lixo no banco.

#### Casos de teste da sessão

| # | Cenário | Esperado |
|---|---|---|
| 1 | Dois celulares na mesma mesa | mesma sessão, conta soma os dois |
| 2 | Garçom fecha a mesa | ambos veem "conta encerrada" no próximo poll |
| 3 | Tentar pedir com a mesa fechada | bloqueado, com mensagem |
| 4 | Mesa reaberta para novo cliente | sessão nova; carrinho e códigos zerados |
| 5 | Celular do cliente anterior ainda aberto | **não** consegue lançar na sessão nova |
| 6 | App reaberto no dia seguinte | conta vazia, não a de ontem |
| 7 | Rede cai e volta | recupera a sessão certa, sem duplicar pedido |
| 8 | Mesa fechada com carrinho não enviado | avisa que a mesa fechou; carrinho descartado |
| 9 | **Balcão**: dois pedidos seguidos | senhas diferentes, sem acumular |
| 10 | **Balcão**: abrir `/conta` | aba é "Pedidos" (histórico local), não conta de mesa |
| 11 | **Balcão**: retorno sem `session` no JSON | tela funciona, só sem cabeçalho de mesa |
| 12 | QR de mesa que não existe mais no cadastro | vai para a leitura de QR Code |
| 13 | Mesa `blocked` | tela explicando + chamar atendente, nunca "sem conexão" |
| 14 | Mesa `free`, cliente só olha o cardápio | **não** abre sessão |
| 15 | Endpoint de mesa fora do ar | cardápio abre; o pedido é que falha, com motivo |

### Fase 3 — Identidade por empresa e painel

| # | Item | Nota |
|---|---|---|
| 14 | URL própria por company (subdomínio ou caminho) | base para o PWA por empresa |
| 15 | `manifest.webmanifest` estático por company | Chrome só é confiável assim — ver `CONFIGURACAO.md` §2.1.2 |
| 16 | Upload de ícones 192/512/180 por company | hoje cai no `logo` |
| 17 | Editor de `settingsWeb` (chaves de `CONFIGURACAO.md` §1) | |
| 18 | Geração de QR Code em lote por branch, PDF de etiquetas | |
| 19 | Upload de banners com preview 4:5 | |
| 20 | Campos de tradução por produto e categoria | |
| 21 | Validação de formato de `metaPixelId` e `gaId` | |

#### Sobre o PWA por empresa

Já implementado no cliente (`lib/pwaIdentity.ts`): título, favicon,
`apple-touch-icon`, `apple-mobile-web-app-title`, `theme-color` e um manifest
injetado em runtime.

| Plataforma | Estado |
|---|---|
| **iOS** | ✅ funciona — Safari usa `apple-touch-icon` + `apple-mobile-web-app-title` |
| **Android** | ⚠️ funciona via `blob:`, mas não é garantido por especificação |
| Aba do navegador | ✅ |

**Por isso os itens 14–15.** Com URL por empresa, o nginx serve um manifest
estático por tenant e o Chrome passa a ser confiável — um bundle só, N
identidades. Receita pronta em `CONFIGURACAO.md` §2.1.2.

**Casos de teste:**

| # | Cenário | Esperado |
|---|---|---|
| 1 | Instalar pelo QR da Bebelu (Android) | ícone e nome "Bebelu" |
| 2 | Instalar pelo QR da 4 Estylos, mesmo celular | segundo ícone, "4 Estylos" |
| 3 | Instalar no iOS | nome curto correto embaixo do ícone |
| 4 | Abrir o PWA instalado | volta na mesma unidade |
| 5 | Company sem ícone cadastrado | cai no logo, sem quebrar |

### Fase 2.5 — Grupo de múltipla escolha com item único (checkbox vs. contador)

> **Planejamento.** Depende de um campo novo no backend.

#### O problema

Hoje o app decide a interface só por `rules.maxQuantity`:

| `maxQuantity` | Interface | Cliente pode |
|---|---|---|
| `1` | radio | escolher **um** item |
| `> 1` | contador −/+ | escolher **N do mesmo** item |

Mas `maxQuantity > 1` cobre **dois casos de negócio diferentes**, e a API não os
distingue:

**(a) Escolha até 3 sabores, um de cada** → deveria ser **checkbox**
```
☑ Chocolate     ☑ Morango     ☐ Baunilha     ← 2 de 3 marcados
```

**(b) Adicione até 5 porções de bacon** → contador está certo
```
Bacon   − 3 +     ← três porções do mesmo
```

Com o contador em todo grupo, o caso (a) deixa o cliente pedir **3× Chocolate**
numa promoção de "3 sabores". A cozinha manda um, e a reclamação vem — ou pior,
manda três e a margem vai embora.

#### O que acho

**Vale, e o caso (a) é provavelmente o mais comum.** Em restaurante, "escolha
até 3 acompanhamentos" e "escolha 2 sabores" aparecem muito mais que "quantas
porções de bacon você quer". Hoje o app está otimizado para o caso raro.

Mas **não dá para inferir**. Já tentei imaginar heurísticas e todas erram:

| Heurística | Onde quebra |
|---|---|
| "grupo obrigatório → checkbox" | "escolha 2 porções de queijo" é obrigatório e é contador |
| "itens de preço igual → checkbox" | sabores com preços diferentes existem |
| "poucos itens → checkbox" | grupo de 2 adicionais com contador existe |
| "título contém 'sabor' → checkbox" | frágil e quebra em outro idioma |

Chutar aqui erra em dinheiro nas duas direções. **Precisa de campo explícito.**

#### O que o backend precisa

```jsonc
{
  "rules": {
    "minQuantity": 1,
    "maxQuantity": 3,
    "mandatory": true,
    "maxPerItem": 1        // ← NOVO: quantas vezes o MESMO item pode entrar
  }
}
```

| `maxPerItem` | Interface | Significado |
|---|---|---|
| `1` | **checkbox** | até `maxQuantity` itens distintos, um de cada |
| ausente ou `> 1` | contador −/+ | pode repetir o mesmo item |
| `= maxQuantity` | contador | comportamento atual, sem limite por item |

`maxPerItem` é mais expressivo que um booleano `uniqueItems`: cobre também
"até 5 no total, no máximo 2 de cada".

#### Implementação no app

| # | Item |
|---|---|
| U1 | Ler `rules.maxPerItem` no `parseComplementsGroup` |
| U2 | `maxPerItem === 1` → renderizar checkbox, não contador |
| U3 | Bloquear ao atingir `maxQuantity` itens marcados |
| U4 | Contador respeitando `maxPerItem` quando ele for entre 2 e `maxQuantity` |
| U5 | Cabeçalho dizendo a regra: "escolha até 3, um de cada" |
| U6 | Padrão por branch (`settingsWeb.defaultMaxPerItem`) para não recadastrar tudo |

#### Migração — o ponto sensível

Ligar `maxPerItem: 1` como padrão global **muda o comportamento de grupos já
cadastrados**, e alguns deles dependem de repetir item. Sugestão:

1. Backend aceita o campo; **ausente mantém o comportamento atual**
2. Painel mostra o campo no editor de grupo, com explicação dos dois casos
3. A casa ajusta grupo por grupo, conferindo os que fazem promoção de sabores
4. Só então avaliar mudar o padrão

> Enquanto o campo não existir, o contador continua — está errado para o caso
> (a), mas é o erro **conhecido**. Trocar para checkbox por palpite quebraria os
> grupos que legitimamente repetem item, e esses a gente não sabe quais são.

#### Casos de teste

| # | Cenário | Esperado |
|---|---|---|
| 1 | `maxQuantity: 3, maxPerItem: 1` | checkbox; 3 marcados bloqueiam o 4º |
| 2 | idem, desmarcar um | libera marcar outro |
| 3 | `maxQuantity: 5` sem `maxPerItem` | contador, comportamento atual |
| 4 | `maxQuantity: 5, maxPerItem: 2` | contador travando em 2 por item |
| 5 | `maxQuantity: 1` | radio, inalterado |
| 6 | Obrigatório com `minQuantity: 2, maxPerItem: 1` | exige 2 itens **distintos** |
| 7 | Preço no card | mais barato × `minQuantity`, já correto |

---

### Fase 2.6 — Cartão de consumação (terceiro modo)

> **Planejamento.** Nada implementado. Depende da Fase 2 (sessão), e é onde a
> sessão passa a valer a pena de verdade.

Sua leitura está certa: **é um híbrido, e pende para o lado da mesa.** O que ele
herda de cada um:

| Característica | Mesa | Balcão | **Cartão** |
|---|---|---|---|
| Acumula itens ao longo do tempo | ✅ | ❌ paga por pedido | ✅ **como mesa** |
| Precisa de sessão aberta/fechada | ✅ | ❌ | ✅ **como mesa** |
| Individual | ❌ compartilhada | ✅ | ✅ **como balcão** |
| Precisa de comanda para separar pessoas | ✅ | — | ❌ **o cartão já é a comanda** |
| Tem garçom lançando itens | ✅ | ❌ | às vezes |
| Paga ao sair, não ao pedir | ✅ | ❌ | ✅ **como mesa** |
| Chave da sessão | número da mesa | — | **número do cartão** |

**A diferença que mais importa para o código:** a chave de sessão deixa de ser a
mesa e passa a ser o cartão. Isso é bom — o cartão é naturalmente individual,
então **o problema da comanda desaparece**: não precisa perguntar nome para
separar a conta, porque cada cartão já é uma conta. Ver Fase 2 §"Comanda".

E o problema do "qual MESA_03?" continua igual, com um agravante: o cartão nº 47
roda **várias vezes no mesmo dia**, não uma por dia. Sem `session.id` a conta do
cliente anterior aparece para o próximo — e aqui isso não é caso de borda, é o
comportamento normal do salão.

```
URL do QR:  ?branch=…&mode=cartao&card=047
```

| # | Item | Nota |
|---|---|---|
| C1 | `mode=cartao` em `qrParams.ts`, exigindo `card=` | mesma validação de formato que `table` |
| C2 | `allowedModes` aceitando `cartao` | branch que só usa cartão não deve oferecer mesa |
| C3 | Sessão indexada pelo cartão, com `session.id` obrigatório | rotatividade alta; sem isso mistura contas |
| C4 | Cartão sem sessão aberta → tela "peça seu cartão na entrada" | não abrir sessão pelo app |
| C5 | Comanda desligada neste modo | o cartão já separa; perguntar seria redundante |
| C6 | Conta = extrato do cartão, sem filtro por pessoa | a view detalhada por pessoa não faz sentido aqui |
| C7 | Cartão perdido / trocado → tratamento no PDV | o app só reflete; **não** pode oferecer "transferir conta" |
| C8 | Consumação mínima, se a casa usar | mostrar quanto falta atingir |

> ⚠️ **Cartão perdido é problema de operação, não de app.** É tentador oferecer
> "perdi meu cartão" no celular, mas quem decide o que fazer com uma conta aberta
> sem cartão é o gerente, no caixa. Um botão desses no aparelho do cliente é
> convite a fraude: ele reivindica um cartão que não é o dele.

#### Self-service: a conta tem fração

Este é o ponto técnico novo. Em self-service o prato é **pesado**, e a linha da
conta vira `0,412 kg × R$89,90/kg`. Hoje o app trata `quantity` como inteiro.

**Restrição de escopo, não limitação temporária: este app nunca lança item
fracionado.** Não existe caminho na interface para isso e não deve existir — quem
pesa é a balança, e quem lança é o PDV ou a integração da balança. O app é
**somente leitura** para essas linhas.

Isso simplifica o trabalho: nada de campo de peso, nada de teclado decimal, nada
de validar gramatura. Sobra **exibir**, e é aí que hoje quebra:

| # | Item | Nota |
|---|---|---|
| F1 | Aceitar `quantity` decimal nos itens da conta | `TableBill` renderiza `{line.quantity}×` cru |
| F2 | Campo `unit` no item (`kg`, `un`, `L`) e exibir a unidade | "0,412×" não significa nada; "0,412 kg" sim |
| F3 | Formatar decimal em **pt-BR** | hoje sairia `0.412`, com ponto |
| F4 | Arredondar a exibição em 3 casas | ver o alerta de float abaixo |
| F5 | **Nunca somar quantidades de unidades diferentes** na view consolidada | 1 un + 0,4 kg não é 1,4 de nada |
| F6 | Preço por unidade visível (`R$89,90/kg`) | sem ele o cliente não confere a conta |
| F7 | Item pesado não é editável nem removível pelo app | quem tirou do buffê já pesou |
| F8 | Item fracionado **nunca** entra no carrinho do app | o carrinho é só do que o cliente pede pelo celular |
| F9 | Conta = itens do app **+** itens externos, vindos do backend | o app não conhece o peso; ele só recebe a linha pronta |

> ⚠️ **Artefato de float na conta consolidada.** A view resumida soma quantidades
> (`line.quantity += item.quantity`). Com decimais, `0.412 + 0.385` em JavaScript
> dá `0.7970000000000001`, e o valor vai **direto para a tela** — o cliente lê
> isso na conta dele. Somar em gramas (inteiro) e dividir só na exibição, ou
> arredondar em cada acumulação. É bug garantido no dia em que o backend mandar o
> primeiro decimal, não uma possibilidade remota.

> **O papel do app encolhe no self-service, e isso é esperado.** O cliente não
> pede comida pelo celular: ele monta o prato e pesa. O app serve para **ver o
> extrato do cartão**, pedir bebida e sobremesa, e pagar na saída. Vale desenhar
> a tela de conta como a principal deste modo — não o cardápio.

#### Casos de teste

| # | Cenário | Esperado |
|---|---|---|
| 1 | `?mode=cartao` sem `card=` | tela de leitura de QR Code |
| 2 | Cartão 047 usado 2× no mesmo dia | contas separadas por `session.id` |
| 3 | Cartão sem sessão aberta | "peça seu cartão na entrada", sem abrir sessão |
| 4 | Branch com `allowedModes: ['cartao']` | QR de mesa cai em `cartao` |
| 5 | Conta com item de 0,412 kg | exibe "0,412 kg", com vírgula e unidade |
| 6 | Consolidada com 0,412 + 0,385 kg | "0,797 kg" — sem cauda de float |
| 7 | Consolidada com 1 un + 0,4 kg do mesmo produto | linhas separadas por unidade |
| 8 | Item pesado na conta | sem botão de editar ou remover |
| 9 | Consumação mínima não atingida | mostra o quanto falta |
| 10 | Cartão vira `paid` | app encerra e limpa a sessão |

---

### Fase 2.7 — Status do pedido: KDS, painel de senha e onde o cliente vê

> **Parcialmente pronto.** As chaves de habilitação e o mock existem; falta o KDS
> do outro lado e o status nas telas onde o cliente procura.

#### O app lê status; ninguém move

Este é o ponto que faz a função existir ou não: `useOrderPolling` consulta e exibe,
mas quem promove `pending → in_progress → ready` é o **KDS, o PDV ou o app do
garçom**. Sem isso o cliente olha "Aguardando cozinha" indefinidamente, conclui que
o pedido não chegou, e chama o garçom para conferir — o trabalho que o cardápio
deveria poupar.

Por isso as duas chaves, **desligadas por padrão**:

```jsonc
"settingsWeb": {
  "orderStatusEnabled": false,      // a casa publica status?
  "passwordPanelEnabled": false,    // a casa tem painel chamando senha?
  "orderStatusPortalUrl": "https://painel.exemplo.com/senha",
  "orderStatusPortalQuery": "?branch={branch}&code={code}"
}
```

| Operação | `orderStatusEnabled` | `passwordPanelEnabled` |
|---|---|---|
| KDS na cozinha, garçom leva à mesa | ✅ | ❌ |
| Painel de senha alimentado à mão | ❌ | ✅ |
| Balcão com KDS e painel na parede | ✅ | ✅ |
| Casa sem nenhum dos dois (a maioria hoje) | ❌ | ❌ |

#### Integração com KDS / painel de senha na nuvem

| # | Item | Onde |
|---|---|---|
| S1 | KDS promovendo status do pedido | backend / KDS |
| S2 | Pedido do cardápio **na mesma fila** dos do PDV | backend |
| S3 | `ready` por ação humana, nunca por timer | KDS |
| S4 | Painel de senha lendo o mesmo status do app | backend |
| S5 | Ligar `orderStatusEnabled` só **depois** de S1 e S2 | operação |
| S6 | Portal público de consulta por branch + senha | backend — ver `BACKEND.md` |
| S7 | Webhook/push em vez de poll de 30s | otimização, depois de S1 |

> **S5 é o item que mais importa.** A chave afirma um fato operacional — "nossa
> cozinha publica status" — não uma intenção. Ligada sem KDS, o app passa a mentir
> com mais confiança do que se estivesse desligado, e a reclamação chega ao garçom,
> não a quem configurou.

> ⚠️ **S3:** timer estimado ("pronto em 15min") mente. O cliente vai ao balcão
> buscar comida que não está pronta, e a fila que o papa-fila deveria resolver
> aparece de volta — agora com gente irritada.

#### Onde o cliente vê o status — o que falta

| Modo | Tela | Situação |
|---|---|---|
| Mesa, conta **detalhada** | status por pedido | ✅ |
| Mesa, conta **resumida** (padrão) | agregado "2 em produção · 1 pronto" | ✅ **W1 pronto** |
| Balcão, `/confirmacao` | status do pedido recém-enviado | ✅ |
| Balcão, `/pedidos` | chip de status ao vivo nos pedidos de hoje | ✅ **W2 pronto** |
| Delivery | — | ❌ **W3** — Fase 4 |
| Cartão de consumação | — | ❌ **W4** — Fase 2.6 |

| # | Item | Estado |
|---|---|---|
| W1 | Andamento agregado na conta resumida | ✅ |
| W2 | `/pedidos` consultando status ao vivo | ✅ |
| W3 | Delivery: `produção → pronto → a caminho → entregue` | `on_the_way` já no tipo |
| W4 | Cartão: extrato com status por item lançado | a conta é a tela principal do modo |
| W5 | Nada de status quando `orderStatusEnabled` desligado | ✅ |

**Como W1 ficou:** chip por linha na resumida seria **mentira** — ela junta itens de
pedidos com status diferentes, e "Frango crocante ×3" pode ter um pronto e dois na
chapa. O agregado por pedido informa sem atribuir status a uma linha que não tem
um só. Ordem fixa (cozinha → produção → pronto → a caminho) para a fila não dançar
entre atualizações.

**Como W2 ficou:** consulta só os pedidos de **hoje**, no máximo 5 códigos
distintos. Status de anteontem não existe mais no backend, e varrer o histórico
inteiro a cada abertura seria gasto sem retorno. Falha silenciosa — o histórico
serve mesmo sem status.

#### Casos de teste

| # | Cenário | Esperado |
|---|---|---|
| 1 | `orderStatusEnabled` ausente | sem cartão de status, **sem poll** |
| 2 | `orderStatusEnabled: true`, KDS movendo | status muda, toast + vibração no `ready` |
| 3 | `passwordPanelEnabled: false` com URL cadastrada | link não aparece |
| 4 | `passwordPanelEnabled: true` sem URL | link não aparece (em vez de link quebrado) |
| 5 | `orderStatusPortalUrl` com `javascript:` | recusado |
| 6 | URL base já com query | separador `&`, não `?` |
| 7 | Balcão, `ready` | "Retire no balcão", nunca "Saindo para a mesa" |
| 8 | Delivery, `on_the_way` | "Pedido a caminho" |
| 9 | `MOCK_BILL` ligado | ciclo completo em 1 min, poll de 5s |

---

### Fase 2.8 — Cerca geográfica (o cliente está mesmo na loja?)

> **Planejamento. Nada implementado.** Depende de o backend gravar a coordenada
> da branch — hoje ela vem preenchida com a string `"undefined"`.

#### O problema

O link do QR Code é público e viaja: basta uma foto no grupo do WhatsApp para
qualquer pessoa lançar pedido na MESA_03 sem estar sentada nela. A cozinha
produz, o garçom entrega a ninguém, e a conta fica com quem está na mesa.

A pergunta que resolveria isso é simples — *este celular está no restaurante?* —
e o navegador sabe responder. Falta pedir.

#### O dado da branch está quebrado na origem

`Branch.location` já existe no tipo (`src/types/index.ts`), tipado como saco
genérico (`Record<string, unknown>`), e **não é lido em lugar nenhum do app**. O
que o backend devolve hoje:

```jsonc
"location": {
  "type": "Point",
  "coordinates": {
    "latitude": "undefined",       // ← string, não número
    "longitude": "undefined"       //   alguém concatenou um undefined de JS
  }
}
```

| # | Item | Onde |
|---|---|---|
| G0 | **Gravar lat/lng no cadastro da branch** | Laravel + painel |
| G0b | Coordenada como **número**, nunca string | Laravel |
| G0c | Parser aceitando as duas formas: objeto `{latitude, longitude}` **e** GeoJSON `coordinates: [lng, lat]` | app |

> **G0 é o passo zero.** Enquanto o painel não gravar a coordenada, o recurso
> fica desligado em 100% das lojas — não adianta codar o portão antes. E atenção
> ao formato: GeoJSON padrão manda `[lng, lat]`, array e **longitude primeiro**;
> o backend hoje usa objeto. O parser tem de engolir os dois e tratar qualquer
> coisa não-numérica como *branch sem geo*, nunca como *cliente longe*.

#### As três ressalvas que definem o desenho

**1. GPS dentro de restaurante é ruim, e o erro sempre pende para o lado que
prejudica.** Sob laje, em shopping, sem Wi-Fi, `coords.accuracy` vem em 50–500 m
com facilidade. Comparar só `distância ≤ raio` reprova o cliente que está sentado
à mesa.

**2. Isso é atrito, não segurança.** Geolocalização de browser é falsificável em
dois cliques (sensor override no DevTools, fake GPS no Android). Serve para
barrar o engraçadinho que recebeu o link no grupo, não um atacante. Quem barra de
verdade é o `POST api/orders`, com a coordenada do cliente no payload e a decisão
no servidor — como já vale para preço e para loja fechada.

**3. Negar permissão não é fraude.** Uma fatia real do público recusa o GPS por
privacidade, e no iOS não dá para reverter sem ir em Ajustes. Bloquear por
negativa é bloquear por privacidade — e o cliente está de pé na loja, com fome.

#### As chaves

```jsonc
"settingsWeb": {
  "geofenceMode": "off",              // off | warn | block  — padrão: off
  "geofenceRadiusMeters": 300,        // padrão: 300
  "geofenceMaxAccuracyMeters": 1000,  // leitura pior que isso = "não sabemos"
  "geofenceMessage": "Você precisa estar no restaurante para pedir por aqui."
}
```

| Modo | O que faz | Quando usar |
|---|---|---|
| `off` | nem pede a posição | **padrão** — branch sem coordenada cadastrada |
| `warn` | envia o pedido com a flag; a casa vê no KDS e decide | piloto, e provavelmente o destino final |
| `block` | recusa o envio, com saída "Chamar garçom" | só depois de medir o `warn` |

> **`off` por padrão, pelo mesmo motivo de `orderStatusEnabled`:** portão que
> ninguém configurou só reprova venda legítima. E **`warn` antes de `block`** —
> ligar o bloqueio sem antes medir quanto do público real seria barrado é
> descobrir o número pelo caixa, com o cliente na frente.

#### A avaliação, caso a caso

| Situação | Veredito | Efeito em `block` |
|---|---|---|
| Branch sem coordenada válida (inclusive `"undefined"`) | `unknown` | passa |
| Permissão negada, ou API indisponível | `unknown` | passa |
| `accuracy` > `geofenceMaxAccuracyMeters` | `unknown` | passa |
| `distância − accuracy` ≤ raio | `inside` | passa |
| Demais casos | `outside` | **barra** |

Subtrair a `accuracy` da distância é o que faz o portão errar para o lado certo:
se o círculo de erro encosta na loja, o cliente pode estar dentro dela — e a
dúvida vira permissão, não recusa. Mesma disciplina de "na dúvida entre calar e
chutar, calar" (`CLAUDE.md`).

#### Implementação no app

| # | Item | Nota |
|---|---|---|
| G1 | `src/lib/geofence.ts`: parse do `location` (duas formas) + haversine + `evaluate → inside \| outside \| unknown` | lógica pura, testável — padrão de `businessPeriod`/`stock` |
| G2 | Testes em `src/__tests__/geofence.test.ts` | incluindo `"undefined"`, array GeoJSON e accuracy alta |
| G3 | Tipar as chaves em `Branch['settingsWeb']` e trocar `location` por tipo real | hoje é `Record<string, unknown>` |
| G4 | Pedir a posição **no `handleSubmit`**, junto da reverificação de loja aberta | ver `Checkout.tsx` |
| G5 | Timeout curto na `getCurrentPosition` (~8s) e `maximumAge` de ~1 min | GPS travado não pode segurar o envio |
| G6 | `clientLocation` no payload do pedido | ver contrato abaixo |
| G7 | Em `block`, tela com o motivo **e** botão de chamar atendente | tela sem saída é bug |
| G8 | Só em `mesa` e `balcao` | delivery quer o endereço, não a proximidade — lógica oposta |
| G9 | Entradas em `CONFIGURACAO.md` §1 e no contrato do `BACKEND.md` | |

> **Por que no envio e não no boot.** Prompt de GPS na primeira pintura derruba
> conversão e ainda não é o momento em que a resposta importa — o mesmo raciocínio
> que mantém a validação de mesa fora do boot (Fase 2, V6). Quem só quer olhar o
> cardápio não deveria ter de autorizar nada.

#### Contrato

```jsonc
// POST api/orders — campo novo, opcional
"clientLocation": {
  "lat": -3.7319,
  "lng": -38.5267,
  "accuracy": 42,                          // metros, do próprio navegador
  "capturedAt": "2026-07-31T19:22:10Z",
  "verdict": "inside"                      // inside | outside | unknown
}
```

| # | Item | Por quê |
|---|---|---|
| G10 | Backend **recalcula** o veredito; nunca confia no `verdict` do app | o app roda no aparelho do cliente |
| G11 | Recusa com motivo legível quando a branch está em `block` | igual à recusa de loja fechada |
| G12 | Campo ausente é aceito | branch em `off`, ou cliente que negou a permissão |
| G13 | Gravar o veredito no pedido | é o dado que diz se vale a pena ligar o `block` |

#### LGPD

Posição é dado pessoal. Entra no `ConsentBanner` e na política
(`privacyPolicyUrl`), com finalidade declarada — *confirmar presença no
estabelecimento* — e sem uso para outra coisa. Guardar junto do pedido, não como
rastro contínuo: o app pergunta uma vez, no envio, e não fica seguindo ninguém.

#### Casos de teste

| # | Cenário | Esperado |
|---|---|---|
| 1 | Branch com `"latitude": "undefined"` | portão desligado, pedido normal |
| 2 | `geofenceMode` ausente | nem pede permissão de GPS |
| 3 | `warn`, cliente a 2 km | pedido **enviado**, com `verdict: "outside"` |
| 4 | `block`, cliente a 2 km | barrado, com mensagem e "Chamar garçom" |
| 5 | `block`, permissão negada | **passa** (`unknown`) |
| 6 | `block`, `accuracy` de 800 m com teto de 1000 | passa |
| 7 | Cliente a 320 m com `accuracy` 100 e raio 300 | passa — o erro encosta na loja |
| 8 | GPS não responde em 8s | segue o envio, sem travar |
| 9 | `coordinates` em array `[lng, lat]` | interpretado certo, sem inverter |
| 10 | Lat/lng invertidas no cadastro (loja no meio do oceano) | todo cliente vira `outside` — conferir no piloto |
| 11 | Modo `delivery` (Fase 4) | portão não se aplica |
| 12 | Backend recebe `verdict: "inside"` forjado e recalcula | recusa mesmo assim |

---

### Fase 3.5 — Gateway de pagamento

> **Planejamento.** Nada implementado. Depende da Fase 2 (sessão de mesa).

Hoje o app **nunca cobra** — ele lança pedido, e o pagamento acontece fora dele
(garçom, caixa, balcão). Pagar pelo celular muda o produto: passa a mexer com
dinheiro, estorno e conciliação.

#### Os três cenários, em ordem de dificuldade

**A) Balcão — pagar antes de retirar** *(mais simples)*

```
monta pedido → paga no app → senha só é gerada após aprovação → retira
```

| # | Item |
|---|---|
| P1 | Pix (QR ou copia-e-cola) — menor taxa, aprovação em segundos |
| P2 | Cartão de crédito/débito via gateway |
| P3 | Só mandar o pedido para a cozinha **após** aprovação |
| P4 | Timeout de pagamento: liberar o pedido se não pagar em N minutos |
| P5 | Comprovante na tela e no histórico |

> **Ordem importa aqui.** Se o pedido vai para a cozinha antes da aprovação, uma
> recusa de cartão significa comida pronta que ninguém pagou.

**B) Delivery — pagar no checkout** *(médio)*

Mesmo fluxo do balcão, mais: pagar na entrega (dinheiro com troco, cartão na
maquininha) como alternativa. Ver Fase 4.

**C) Mesa — pagar quando o garçom ou o caixa abre o fechamento** *(mais complexo)*

Este é o que exige desenho novo. O cliente **não** paga quando quer: ele paga
quando a conta é fechada do lado do restaurante.

```
mesa aberta          garçom/caixa aciona           cliente paga         mesa
(pedindo)      →     "fechamento"            →     no celular      →   encerrada
                     status: closing               ou no caixa          paid
```

| # | Item | Nota |
|---|---|---|
| P6 | Estado **`closing`** na sessão de mesa | entre `open` e `paid` |
| P7 | Garçom/caixa aciona o fechamento no PDV | não é o cliente que decide |
| P8 | App detecta `closing` no poll → **libera o botão de pagar** | antes disso o botão não existe |
| P9 | Bloquear **novos pedidos** em `closing` | senão entra item depois da conta fechada |
| P10 | Pagamento parcial / dividir entre pessoas | por comanda, se a branch usa comanda |
| P11 | Taxa de serviço opcional (10%), com o cliente podendo recusar | é opcional por lei |
| P12 | Gorjeta extra | separada da taxa de serviço |
| P13 | Sessão vira `paid` e o app encerra | limpa carrinho, códigos, comanda |
| P14 | Conciliação: pagamento parcial + resto no caixa | conta pode fechar em dois meios |

**Por que o cliente não pode pagar a qualquer momento:** a mesa continua
recebendo pedidos até o garçom fechar. Se o cliente pagar às 20h e pedir uma
sobremesa às 20h15, existem duas contas para a mesma mesa — e o caixa não sabe
qual fechar. O estado `closing` é o que impede isso: ele congela a conta e só
então libera o pagamento.

**Os dois botões da mesa** (P15/P16 abaixo) existem porque o cliente precisa de
uma ação enquanto o pagamento não é dele:

| Botão | Quando aparece | O que faz |
|---|---|---|
| **Solicitar a conta** | mesa `open` | avisa o garçom (mesma via do `waiter-call`) e é o que **provoca** o `closing` |
| **Pagamento só com o garçom** | mesa `open`, e sempre que a branch não tem gateway | não é botão: é aviso fixo na conta, para o cliente não ficar procurando onde pagar |

| # | Item | Nota |
|---|---|---|
| P15 | Botão "Solicitar a conta" na tela de conta | reaproveita `POST api/waiter-call` com `reason: 'bill'` |
| P16 | Aviso "o pagamento é feito com o garçom" quando não há gateway | remove a busca por um botão que não existe |
| P17 | Depois de solicitar, botão vira "conta solicitada" com horário | evita o cliente chamar cinco vezes |

**D) Totem — pagar no TEF com contra-senha** *(caminho mais curto para cobrar de verdade)*

O cliente monta o pedido no celular, o app devolve uma **contra-senha**, e ele a
digita no totem: o totem recupera o pedido, carrega o próprio carrinho e cobra
pelo **TEF já homologado** que está ali.

```
celular: monta pedido → POST api/orders (status: awaiting_totem)
                      → app mostra contra-senha  ex: T-4827
                                    ↓
totem:   cliente digita T-4827 → GET api/orders/by-handoff/T-4827
                               → preenche o carrinho local
                               → cobra no TEF (crédito/débito/pix)
                               → confirma o pedido → cozinha
```

**Por que este é o atalho:** não exige gateway, não exige webhook, não exige
certificação PCI e não mexe com repasse. A maquininha do totem já resolve
dinheiro, e o app só transporta o pedido até ela. O celular vira o cardápio
confortável; o totem continua sendo o caixa.

| # | Item | Nota |
|---|---|---|
| T1 | Status `awaiting_totem` — pedido **não** vai para a cozinha | só depois do TEF aprovar |
| T2 | Contra-senha curta, legível em voz alta e digitável | `T` + 4 dígitos; ver a discussão de colisão em `DOCUMENTACAO.md` |
| T3 | `GET api/orders/by-handoff/{codigo}` — devolve o pedido inteiro | itens, complementos, observações, `whereConsume` |
| T4 | Expiração da contra-senha (10–15 min) | pedido abandonado não pode ficar pendurado |
| T5 | Consumo único: recuperada uma vez, a contra-senha morre | senão o mesmo pedido entra duas vezes |
| T6 | Totem valida preço **do servidor**, não o que o celular calculou | o app roda no aparelho do cliente |
| T7 | Cancelamento no totem devolve o pedido ao celular, ou descarta | o cliente pode desistir na frente da máquina |
| T8 | Tela no celular com a contra-senha grande + instrução | é o único passo em que ele sai do app |

> **Escopo dividido.** T3–T7 são backend; a leitura da contra-senha e o
> preenchimento do carrinho são do **totem Flutter**, fora deste repo. Este app
> só precisa de T1, T2 e T8.

**E) POS online — empurrar a cobrança para uma maquininha** *(alternativa ao gateway)*

Mesma ideia do totem, com o destino trocado: em vez de o cliente ir até a
máquina, **a cobrança vai até ela**. O app cria a intenção, o backend a envia
para um POS inteligente registrado na branch, e a maquininha acorda com o valor
já na tela — o garçom só leva na mão e o cliente passa o cartão ou aproxima.

```
celular: pede a conta → POST api/payments/pos-intent { posId, amount }
backend: empurra para o POS (API do adquirente / SDK do POS)
POS:     acorda com o valor na tela → cliente paga → adquirente confirma
backend: webhook do adquirente marca pago → app vê no poll → sessão encerra
```

**Por que vale ter os dois:** o gateway resolve pagamento **sem presença** (pix e
cartão no celular, delivery, retirada). O POS online resolve pagamento
**presencial** aproveitando maquininha e taxa que a casa já negociou, sem
implicar em certificação nem em novo repasse. São complementares, não
concorrentes — e por isso ambos entram em `paymentMethods` como opções ligáveis
por branch.

| # | Item | Nota |
|---|---|---|
| S1 | Cadastro de POS por branch: `id`, apelido, adquirente | "POS Caixa 1", "POS Garçom Ana" |
| S2 | `POST api/payments/pos-intent` com `posId` e valor **do servidor** | idem regra do gateway: nunca o total do app |
| S3 | Escolha do POS: fixo por mesa/setor, ou o garçom escolhe no PDV | decisão de operação — definir antes de codar |
| S4 | Status intermediário `sent_to_pos` visível no app | senão o cliente toca "pagar" e nada parece acontecer |
| S5 | Timeout: POS não responde em N minutos → libera para outro meio | maquininha sem bateria ou fora de rede acontece |
| S6 | Cancelar a intenção no POS pelo PDV | cliente muda de ideia com a máquina na mão |
| S7 | Confirmação **só por webhook do adquirente** | a tela do POS não é fonte da verdade para o backend |
| S8 | Uma intenção ativa por POS | duas cobranças na mesma máquina confundem o garçom |

> ⚠️ **Depende do adquirente.** Empurrar cobrança para POS remoto não é padrão de
> mercado: Stone, Cielo, PagSeguro e Rede expõem isso de formas diferentes, e
> algumas só via SDK rodando **no próprio** POS (Android). **Confirmar a
> viabilidade com o adquirente antes de prometer a função** — pode virar
> "o POS consulta pedidos pendentes" em vez de "o backend empurra", o que muda
> o desenho inteiro (poll no POS, não push do servidor).

#### Onde o cliente pode pagar, por modo

Nem todo modo aceita todo meio, e a branch tem de poder desligar cada um:

| Modo | App (gateway) | POS online | Totem (TEF) | Caixa | Na entrega | Com o garçom |
|---|---|---|---|---|---|---|
| **Balcão** | quando houver gateway | ✅ | ✅ contra-senha | ✅ padrão hoje | — | — |
| **Mesa** | só em `closing` | ✅ garçom leva a máquina | ✅ contra-senha em `closing` | ✅ | — | ✅ padrão hoje |
| **Cartão de consumação** | ✅ na saída | ✅ | ✅ contra-senha | ✅ padrão | — | — |
| **Delivery** | ✅ (obrigatório se o entregador não tem maquininha) | — | — | — | ✅ dinheiro/cartão/pix | — |
| **Totem** | — | — | ✅ | — | — | — |

**Mesa pagando no totem** é o mesmo mecanismo do balcão com um objeto diferente: a
contra-senha carrega a **sessão da mesa**, não um pedido.

```
garçom aciona fechamento → mesa entra em closing
celular mostra contra-senha da conta   ex: C-9143
cliente vai ao totem → digita → totem puxa a conta fechada
                              → cobra no TEF → sessão vira paid
```

| # | Item | Nota |
|---|---|---|
| T9 | Contra-senha de **sessão**, só emitida em `closing` | conta aberta não pode ser paga: ainda entra pedido |
| T10 | `GET api/table-sessions/by-handoff/{codigo}` | devolve conta consolidada, taxa e descontos |
| T11 | Totem não deixa alterar itens da conta | ele é caixa aqui, não ponto de venda |
| T12 | Pagamento parcial no totem → sessão continua em `closing` | mesa dividida entre pessoas |
| T13 | Contra-senha morre quando a sessão vira `paid` | inclusive se quem pagou foi outro meio |

> **Por que mesa no totem vale a pena:** é o caminho para cobrar mesa **sem
> gateway**. O cliente sai da mesa, passa no totem e paga com o TEF homologado. A
> casa ganha pagamento no celular-quase: o pedido e a conta vêm do app, só o
> dinheiro passa pela máquina.

Cada célula é uma chave, não uma suposição:

```jsonc
"settingsWeb": {
  "paymentMethods": {
    "mesa":     { "app": false, "pos": true,  "cashier": true, "waiter": true },
    "balcao":   { "app": false, "pos": true,  "cashier": true, "totem": true },
    "delivery": { "app": true,  "onDelivery": ["cash", "credit", "debit", "pix"] }
  }
}
```

| # | Item | Nota |
|---|---|---|
| P18 | `settingsWeb.paymentMethods` por modo **e** por meio | granularidade de célula, não de branch |
| P19 | Nenhum meio habilitado → app não mostra pagamento | **é o padrão**: volta ao comportamento de hoje |
| P20 | Um único meio habilitado → sem tela de escolha | não perguntar o que só tem uma resposta |

#### Pagar na entrega (delivery)

Dinheiro exige uma pergunta que os outros meios não exigem: **troco para quanto**.

| # | Item | Nota |
|---|---|---|
| D1 | Escolha do meio no checkout: dinheiro, pix, crédito, débito | crédito/débito = maquininha do entregador |
| D2 | **Dinheiro → campo "troco para"**, opcional | vazio = "não preciso de troco" |
| D3 | Validar `trocoPara ≥ total` | R$20 para uma conta de R$45 é erro de digitação |
| D4 | Mandar `changeFor` no payload e **imprimir na comanda** | o entregador sai com o troco certo, e é a única razão do campo existir |
| D5 | Pix na entrega: quem gera o QR é o entregador ou o backend? | decisão de negócio — sem definir, não implementar |
| D6 | Cartão na entrega: registrar só a intenção | a aprovação acontece na maquininha, fora do app |

> **O troco não é detalhe de interface.** Sem ele o entregador sai sem trocado,
> o cliente não tem nota menor e a venda trava na porta. É o campo mais barato
> de implementar e o que mais dói faltando.

#### Contrato sugerido

```jsonc
// A sessão passa a ter um estado a mais
{ "session": { "id": "sess_7f3a", "status": "closing",
               "closingStartedAt": "2026-07-30T21:14:00Z",
               "total": 187.40, "serviceTax": 18.74, "paid": 0 } }

// App cria a intenção de pagamento
POST api/payments/intent
{ "tableSession": "sess_7f3a", "branch": "…", "simpleAuth": "…",
  "amount": 206.14, "method": "pix", "includeServiceTax": true,
  "comanda": "12" }              // pagamento parcial, se aplicável
→ { "paymentId": "pay_…", "status": "pending",
    "pix": { "qrCode": "…", "copyPaste": "00020126…", "expiresAt": "…" } }

// Confirmação vem por WEBHOOK no backend, nunca pelo cliente
POST /webhooks/gateway → backend valida assinatura e marca pago
GET  api/payments/pay_…  → o app faz poll até status mudar
```

#### Regras que não podem ser negociadas

| Regra | Por quê |
|---|---|
| **Valor calculado no servidor** | o app roda no aparelho do cliente; nunca confiar no total que ele mandou |
| **Confirmação só por webhook** | resposta do app pode ser forjada ou perdida |
| **Idempotência na intenção** | duplo toque não pode gerar duas cobranças |
| **Nada de dado de cartão no app** | usar SDK/checkout do gateway; PCI fora do escopo |
| **Estorno pelo PDV, não pelo app** | cliente não pode se auto-reembolsar |
| **Registrar quem acionou o fechamento** | auditoria de caixa |

#### Escolha do gateway — o que pesar

| Critério | Nota |
|---|---|
| **Pix com webhook confiável** | é o meio dominante e o de menor taxa |
| Split de pagamento | necessário se a plataforma retém comissão por branch |
| Suporte a estorno parcial | mesa paga em dois meios acontece |
| Ambiente de sandbox decente | testar fechamento de mesa sem dinheiro real |
| Conciliação (extrato por transação) | o financeiro do restaurante vai pedir |

Candidatos no Brasil: Mercado Pago, Pagar.me, Asaas, Stone, Efí. **Decisão de
negócio antes da técnica** — taxa e prazo de repasse pesam mais que a API.

#### Casos de teste

| # | Cenário | Esperado |
|---|---|---|
| 1 | Mesa `open` | botão de pagar **não** aparece |
| 2 | Garçom aciona fechamento | botão aparece nos celulares da mesa |
| 3 | Tentar pedir em `closing` | bloqueado com mensagem |
| 4 | Pix aprovado | sessão vira `paid`, app encerra |
| 5 | Pix expirado sem pagar | volta para `closing`, permite tentar de novo |
| 6 | Cartão recusado no balcão | pedido **não** vai para a cozinha |
| 7 | Duplo toque em pagar | uma cobrança só |
| 8 | Dois celulares pagando a mesma conta | segundo vê "já foi paga" |
| 9 | Pagamento parcial por comanda | saldo restante correto |
| 10 | App fecha durante o pagamento | ao reabrir, mostra o status real |
| 11 | Rede cai após aprovar | webhook garante o registro; app recupera no poll |
| 12 | Cliente recusa a taxa de serviço | total recalculado, sem a taxa |
| 13 | Mesa `open`, botão "Solicitar a conta" | avisa o garçom; vira "conta solicitada HH:MM" |
| 14 | Branch sem gateway | aviso "pagamento com o garçom", sem botão de pagar |
| 15 | Contra-senha do totem recuperada 2× | segunda vez recusa: já foi consumida |
| 16 | Contra-senha expirada | totem recusa e orienta refazer no celular |
| 17 | TEF do totem recusa o cartão | pedido **não** vai para a cozinha |
| 18 | Cobrança enviada ao POS, maquininha offline | timeout libera outro meio |
| 19 | Duas intenções para o mesmo POS | segunda recusada |
| 20 | Delivery em dinheiro, "troco para" R$20 numa conta de R$45 | bloqueado na validação |
| 21 | Delivery em dinheiro, "troco para" vazio | aceito como "sem troco" |
| 22 | `changeFor` preenchido | valor aparece na comanda impressa |
| 23 | Só um meio habilitado na branch | app não mostra tela de escolha |

---

### Fase 4 — Cardápio de delivery (sem QR Code)

> **Só planejamento — nada implementado.** Registrado aqui para as decisões de
> hoje não fecharem portas amanhã.

Hoje o app **depende do QR Code**: sem `?branch=` na URL ele não sabe qual
restaurante mostrar e cai na tela de leitura. Um cardápio de delivery, no molde
de **CardápioWeb** ou **AnotaAí**, inverte isso: o cliente chega por link
compartilhado, busca no Google ou pelo Instagram da loja, e a URL é a
identidade — `cardapio.com.br/bebelu`.

#### O que muda

| Aspecto | Hoje (mesa/balcão) | Delivery |
|---|---|---|
| Como o cliente chega | escaneia o QR da mesa | link, Google, bio do Instagram |
| Identidade na URL | `?branch=<id>` | `/bebelu` (slug) |
| Onde consome | no local | endereço do cliente |
| Identificação | nome + telefone | + **endereço completo** |
| Pagamento | garçom ou balcão | online ou na entrega |
| Frete | não existe | por distância/bairro/zona |
| Horário | fecha o cardápio | fecha **pedidos**, cardápio segue visível |
| Prazo | senha/mesa | previsão de entrega |
| Acompanhamento | polling na mesa | status até a porta |

#### O que já serve

| Pronto | Nota |
|---|---|
| Catálogo, categorias, busca sem acento | inalterado |
| Complementos, fracionado, embalagem | inalterado |
| Precificação, ofertas, cupom | cupom já implementado, só desligado |
| Identidade por empresa (`menuName`, ícones) | **a URL por company da Fase 3 é a mesma base** |
| Idiomas | inalterado |
| Carrinho, LGPD, analytics | inalterado |
| PWA | ganha mais sentido aqui — cliente recorrente instala de verdade |

#### O que falta

**Rota e identidade**
| # | Item |
|---|---|
| D1 | Rota por slug: `/:slug` resolvendo a branch, sem `?branch=` |
| D2 | Terceiro `mode`: `mesa` \| `balcao` \| `delivery` |
| D3 | SEO — hoje o `index.html` tem `noindex`; delivery precisa ser achado |
| D4 | Open Graph / preview ao compartilhar no WhatsApp |

**Endereço e frete** — contrato completo em `BACKEND.md` → "Delivery"

| # | Item | Onde |
|---|---|---|
| D5 | Cadastro de endereço com CEP, número, complemento, referência | app + backend |
| D6 | **Vários endereços por cliente**, com `label` (Casa, Trabalho) e `isDefault` | `api/customer-addresses` |
| D7 | **Cálculo de frete no servidor** (bairro, raio ou zona) | `POST api/delivery-quote` |
| D8 | `deliverable: false` + `reason` legível bloqueia o fechamento | backend decide, app explica |
| D9 | Pedido mínimo por região (`minOrder`) | backend |
| D18 | Frete grátis acima de X (`freeFrom`), mostrando quanto falta | aumenta ticket médio |
| D19 | `lat`/`lng` gravados na criação do endereço | geocodificar a cada pedido é lento e caro |
| D20 | Pedido grava **cópia** do endereço, não referência | editar "Casa" não pode reescrever a comanda de ontem |
| D21 | Endereço por company, não global da plataforma | o cliente não autorizou compartilhar entre empresas |
| D22 | Recotar o frete **no envio**, e `POST api/orders` recalcular | ele passou 20min montando |

> ⚠️ **A regra de frete não pode ser replicada no app.** É tentador — "por bairro
> é só uma tabelinha". Mas a regra muda (chuva, feriado, bairro novo, um motoboy a
> menos) e quem muda é o painel. Com uma cópia no app, ele cobra o frete velho e a
> diferença sai do bolso de alguém. Mesma disciplina do preço dos produtos: o app
> manda endereço e subtotal, e **exibe** o que o servidor responder.

**Pagamento**
| # | Item |
|---|---|
| D10 | Escolha do meio: dinheiro (com troco), cartão na entrega, Pix, online |
| D11 | Integração de pagamento online — **decisão de negócio antes da técnica** |
| D12 | Comprovante e status de pagamento |

**Operação**
| # | Item |
|---|---|
| D13 | Previsão de entrega e prazo por região |
| D14 | Acompanhamento: recebido → produção → saiu para entrega → entregue |
| D15 | Fechar **pedidos** fora do horário mantendo o cardápio navegável |
| D16 | Agendamento de pedido |
| D17 | Cancelamento pelo cliente dentro de uma janela |

#### Decisões a tomar antes de começar

1. **Mesmo app ou app separado?** Compartilhar catálogo e complementos é
   tentador, mas delivery traz endereço, frete e pagamento — metade do código
   passa a ser condicional. Um app que faz os dois mal é pior que dois apps.
2. **A URL por company** (Fase 3, item 14) é pré-requisito e já está no plano
   por outro motivo. Vale desenhá-la pensando nos dois usos desde já.
3. **`noindex`** hoje é proposital: cardápio de mesa não deve aparecer no
   Google. Delivery precisa do oposto — não pode ser um flag esquecido.
4. **Estoque em tempo real pesa mais.** Na mesa o garçom conserta na hora; no
   delivery o cliente descobre que faltou o item quando a comida chega.

---

### Fase 5 — Qualidade

| # | Item | Por quê |
|---|---|---|
| 18 | Sentry (ou similar) | hoje erro em produção só aparece no console do cliente |
| 19 | Reduzir bundle (hoje **292 KB gzip**, começou em 96) | Lottie ~100 KB, FontAwesome ~55 KB — ver §5 |
| 20 | Traduzir o texto fixo restante | infra de i18n pronta, telas ainda em português cru |
| 21 | Testes E2E do fluxo de pedido | é o caminho que envolve dinheiro e não tem rede de proteção |
| 22 | CORS nos buckets S3 | pré-cache de imagem falha, cada foto baixa 2× |
| 23 | WebSocket de status | substitui o polling de 30s |

---

## 3. Plano de teste

Rodar em **celular real**, iOS e Android. Emulador não cobre câmera, autofill
nem safe-area.

### 3.1 🍕 Fracionado — pizza e produtos que dividem o valor

> **Este é o bloco mais importante.** Foi exatamente aqui que apareceu um bug de
> cobrança: `unitFraction` era gravado no complemento e enviado no payload, mas
> **não entrava no cálculo do carrinho**. Duas metades de R$60 e R$70 exibiam
> R$65 na tela do produto e cobravam **R$130** no total.
>
> Corrigido em `pricing.ts` (`complementPrice`), com 5 testes de regressão. Mas
> a conferência ponta a ponta ainda precisa ser feita **contra o que a cozinha
> recebe**.

#### A regra, em uma linha

> O preço cadastrado no item é **rateado pela fração ocupada**, nunca somado inteiro.
>
> ```
> valor = preço_do_item × frações_escolhidas ÷ maxQuantity
> ```

#### Como o cadastro precisa estar

```jsonc
{
  "title": "Escolha os sabores",
  "ingredients": true,          // ← ativa o modo fracionado
  "rules": {
    "minQuantity": 1,
    "maxQuantity": 2,           // ← 2 = meia a meia · 4 = quatro sabores
    "mandatory": true
  },
  "items": ["<id-sabor-1>", "<id-sabor-2>", ...]
}
```

#### ⚠️ Dois cadastros diferentes usam a mesma regra

O cálculo é o mesmo, mas o **significado do preço do item** muda. Testar os dois:

**Tipo A — o item vale o produto inteiro** (pizza)

O produto tem preço base 0 e cada sabor é cadastrado com o preço da pizza inteira.

| Escolha | Conta | Total |
|---|---|---|
| Meia Calabresa (R$60) + meia Marguerita (R$70) | 60÷2 + 70÷2 | **R$ 65,00** |
| Pizza inteira de Calabresa (2/2) | 60×2÷2 | **R$ 60,00** |
| 4 sabores: 80, 80, 100, 120 | cada ÷4 | **R$ 95,00** |
| 4 sabores, mas 2 sabores ocupando 2/4 cada: 80 e 120 | cada ×2÷4 | **R$ 100,00** |

**Tipo B — o item é um acréscimo** (sopa, açaí, marmita)

O produto tem preço base próprio e o item soma por cima — também rateado.

| Escolha | Conta | Total |
|---|---|---|
| Sopa R$20, metade feijão (R$0) + metade **ovo (R$4)** | 20 + 0 + 4÷2 | **R$ 22,00** |
| Sopa R$20, sopa inteira de ovo (2/2) | 20 + 4×2÷2 | **R$ 24,00** |

> O ovo custa R$4 inteiro, mas como foi **metade**, acrescenta só R$2. Foi
> exatamente esse rateio que estava faltando no carrinho.

#### Casos a conferir

| # | Cenário | Esperado na tela | Esperado no total | Esperado na cozinha |
|---|---|---|---|---|
| 1 | **A** — inteira de um sabor (2/2 Calabresa R$60) | "2/2 frações" | **R$ 60,00** | 1 pizza Calabresa |
| 2 | **A** — meia R$60 + meia R$70 | "½" em cada | **R$ 65,00** | meia/meia |
| 3 | **A** — 4 sabores (80/80/100/120) | "¼" em cada | **R$ 95,00** | 4 sabores |
| 4 | **A** — 4 frações, 2 sabores (2/4 cada) | "2/4" em cada | **R$ 100,00** | 2 sabores |
| 5 | **B** — sopa R$20 + meio ovo (R$4) | "R$2,00/fração" | **R$ 22,00** | meia/meia |
| 6 | **B** — sopa R$20 + ovo inteiro (2/2) | — | **R$ 24,00** | — |
| 7 | 2 unidades do produto (qty = 2) | — | **dobro** do item | 2 unidades |
| 8 | Grupo de 3: 1/3 A (R$90) + 2/3 B (R$60) | "⅓" e "2/3" | **R$ 70,00** | — |
| 9 | Passar do máximo de frações | botão **+** bloqueado | — | — |
| 10 | Enviar com frações incompletas (1 de 2) | erro + grupo abre | não envia | — |

**Conferir em cada caso:**
- [ ] Preço na tela do produto (rodapé) = preço no carrinho = preço no checkout
- [ ] Preço no checkout = **valor que chega no pedido** (conferir no painel/KDS)
- [ ] O payload leva `unitFraction: 0.5` (ou `1/3`) em cada item do grupo
- [ ] O sublabel mostra `R$X inteira · cada ½ = R$Y` com Y = X/2
- [ ] Editar o item pelo carrinho reabre com as frações certas
- [ ] Conta da mesa mostra o valor fracionado, não o inteiro

> ⚠️ **O payload manda o preço inteiro + `unitFraction`.** O backend precisa
> multiplicar, igual faz com `quantity`. Se o Laravel ignorar `unitFraction`, a
> cozinha recebe o valor dobrado mesmo com o app correto. **Confirmar isso com
> um pedido real antes de liberar pizza no cardápio.**

#### Onde mais o fracionado aparece

Qualquer grupo com `ingredients: true`. Além de pizza, os casos do **tipo B**:
- Sopa com dois sabores
- Açaí com dois cremes
- Marmita com duas guarnições
- Combo com meia porção de dois acompanhamentos

**Testar pelo menos um caso tipo B**, porque o cadastro é diferente do de pizza
(preço base no produto + acréscimo no item, em vez de preço cheio no item) e é
onde o erro de rateio passa mais despercebido — R$2 de diferença numa sopa não
chama atenção como R$65 numa pizza.

---

### 3.2 Complementos normais (somam, não dividem)

| # | Cenário | Esperado |
|---|---|---|
| 1 | Grupo obrigatório, item mais barato | badge "incluso", sem preço abaixo do nome |
| 2 | Grupo obrigatório, item mais caro | badge "+R$ diferença" |
| 3 | Grupo opcional | preço cheio abaixo do nome |
| 4 | 2× de um produto com 2× de bebida | conta **4 bebidas**, não 2 |
| 5 | Subcategorias (Refrigerantes/Sucos) | cada uma colapsável, incluindo quando há só uma |
| 6 | Abrir uma subcategoria | fecha as outras **do mesmo grupo** |
| 7 | Preencher grupo obrigatório | avança sozinho para o próximo |
| 8 | Enviar sem preencher obrigatório | toast + grupo abre com borda vermelha |

---

### 3.3 Abertura da sessão

| # | Cenário | Esperado |
|---|---|---|
| 1 | QR válido | banner → idioma + consumo → cardápio |
| 2 | Carrossel com 3 banners | "Próximo" avança, setas, swipe, pontinhos |
| 3 | `bannersRequired: true` | saída só aparece no último |
| 4 | Banner com link externo | abre em nova aba, não perde o pedido |
| 5 | Recarregar a página | banner e perguntas **não** repetem |
| 6 | Trocar idioma na tela inicial | cardápio inteiro muda |
| 7 | URL sem `?branch=` | "QR Code inválido" + botão de câmera |
| 8 | Botão de câmera no **iOS** | abre e lê (jsQR) |
| 9 | Botão de câmera no **Android** | abre e lê (BarcodeDetector) |
| 10 | Escanear QR de outro domínio | recusa com mensagem |
| 11 | Perfil → "Escanear outro QR Code" | abre a câmera |
| 12 | Escanear a MESA_05 estando na MESA_03 | troca de mesa, carrinho e códigos zerados |
| 13 | Conta sem mesa identificada | botão de escanear no estado vazio |

---

### 3.4 Cardápio

| # | Cenário | Esperado |
|---|---|---|
| 1 | Trocar de categoria | grid substituído, volta ao topo |
| 2 | Categoria sem itens disponíveis | mensagem, não tela vazia |
| 3 | Buscar "acai" | acha **Açaí** (sem acento) |
| 4 | Buscar "pao" | acha **Pão** |
| 5 | Buscar com o app em espanhol | busca no nome traduzido |
| 6 | Produto esgotado | card bloqueado |
| 7 | Produto fora do período | badge de horário |
| 8 | Botão "recomeçar" com carrinho cheio | modal Lottie avisa antes |

---

### 3.5 Pedido

| # | Cenário | Esperado |
|---|---|---|
| 1 | Enviar sem nome/telefone | bloqueia com toast |
| 2 | Telefone com 10 dígitos (fixo) | aceita |
| 3 | Modo balcão | exige nome |
| 4 | Comanda obrigatória | bloqueia sem preencher |
| 5 | "Para levar" | embalagem entra automaticamente |
| 6 | Trocar modalidade no checkout | modal avisa que esvazia o carrinho |
| 7 | Abrir `/checkout` com carrinho vazio | volta ao cardápio, **sem tela branca** |
| 8 | Derrubar a rede no envio | erro claro, permite tentar de novo |
| 9 | Duplo toque em "fazer pedido" | **não** duplica |
| 10 | Após enviar | senha correta + NPS aparece |

**Conferir no backend:** `amount`, `subtotal`, `total`, `consumptioncode`,
`consumptionint`, `comanda`, complementos com `quantity` e `unitFraction`.

---

### 3.6 Conta e histórico

| # | Cenário | Esperado |
|---|---|---|
| 1 | Sem identificação | pede nome + telefone |
| 2 | Visão resumida (padrão) | itens iguais somados |
| 3 | Visão detalhada | por pedido, com autor e horário |
| 4 | Filtro por pessoa | só os pedidos dela |
| 5 | Pedido do garçom | selo "Atendente" |
| 6 | Meu pedido | selo "Você" + telefone mascarado |
| 7 | Desconto no item | preço riscado + valor do desconto |
| 8 | Taxa de serviço | só aparece se o backend mandar |
| 9 | Servidor fora do ar | carimbo de atualização em âmbar |
| 10 | **MESA_03 reaberta no mesmo dia** | **só a conta atual** ← depende da Fase 2 |
| 11 | Modo balcão | aba vira "Pedidos" (histórico local) |

---

### 3.7 Horário

| # | Cenário | Esperado |
|---|---|---|
| 1 | **Testar depois das 21h** | loja aberta (já houve bug de fuso) |
| 2 | Faixa 18:00→02:00 às 23h | aberta |
| 3 | Faixa 18:00→02:00 à 01h | aberta |
| 4 | Faixa 18:00→02:00 às 03h | fechada |
| 5 | Fora do horário | `ClosedScreen` com horários certos |

---

### 3.8 PWA e resiliência

| # | Cenário | Esperado |
|---|---|---|
| 1 | Instalar na tela inicial | ícone e nome corretos |
| 2 | Abrir pelo ícone (sem `?branch=`) | tela de QR inválido com botão de câmera |
| 3 | Recarregar em `/checkout` | carrega (fallback de SPA) |
| 4 | Modo avião no boot | "Sem conexão" com retry |
| 5 | Publicar nova versão | cliente recebe sem limpar cache |
| 6 | Preço alterado no painel | aparece no próximo boot (sem cache de API) |

---

## 4. Checklist antes de liberar

```bash
grep -rn "MOCK_BILL = \|MOCK_HISTORY = \|MOCK_SETTINGS = " src/lib/   # os 3 = false
grep -n "VITE_API_URL" .env                                          # domínio real
npm run build && npx vitest run                                      # verde
```

- [ ] Fase 1 completa
- [ ] §3.1 (fracionado) conferido **contra o pedido que chega na cozinha**
- [ ] §3.5 conferido contra o painel
- [ ] Testado em iOS e Android reais
- [ ] Testado depois das 21h
- [ ] Piloto em 2–3 mesas antes do salão todo

---

## 5. Dívida conhecida

| Item | Impacto | Custo de resolver |
|---|---|---|
| Bundle 199 KB gzip (era 96) | +1–2s no primeiro load em wifi ruim | SVG no lugar do FontAwesome: ~55 KB · code-splitting por rota |
| Texto fixo em português | idioma só traduz produtos | infra pronta, é aplicar `t()` tela a tela |
| Autoria por `origin` | canal novo sem `origin` vira "Atendente" | `createdBy` no backend |
| Sem monitoramento | erro só no console do cliente | Sentry no `ErrorBoundary` |
| Sem E2E | o caminho do dinheiro não tem rede | Playwright no fluxo de pedido |
| `branch.location` com `"undefined"` | coordenada da loja inexistente; bloqueia a Fase 2.8 | gravar lat/lng como número no cadastro (Laravel) |
| `ImageCarousel.tsx` | código morto | apagar ou usar |
| `@tanstack/react-query`, `tinyglobby` | deps não importadas | `npm uninstall` |
| Lint: `set-state-in-effect`, `purity` | avisos do React 19, não quebram | limpeza gradual |

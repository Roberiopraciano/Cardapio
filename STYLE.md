# Style Guide — Cardápio Digital

## TypeScript

- **Strict mode** ativado. Sem `any` explícito — use `unknown` e type guards
- **Interfaces** para modelos de dados (espelham os `.dart`). **Type** para unions e utilitários
- Prefira `const` sobre `let`. Nunca `var`
- Imports: tipos com `import type { ... }` quando não são usados em runtime
- Sem `//eslint-disable` — corrija o erro em vez de suprimir

```ts
// ✅ Bom
import type { Product } from '../types'
const price: number = effectivePrice(product)

// ❌ Ruim
import { Product } from '../types'  // import de runtime desnecessário
const price: any = product.price
```

## React

- Só **functional components** com hooks — sem class components
- `export default` para componentes de página/rota
- `export function` para componentes utilitários
- Props: interface acima do componente com nome `Props`
- Evite prop drilling além de 2 níveis — use Zustand
- `useEffect` com array de deps explícito, sempre

```tsx
// ✅ Bom
interface Props { product: Product }
export default function ProductCard({ product }: Props) { ... }

// ❌ Ruim
export default function ProductCard(props: any) { ... }
```

## Estilo Visual (CSS)

### CSS vars obrigatórias — NUNCA hex hardcoded em componentes

| Intenção | CSS var | Hex equivalente (light) |
|---|---|---|
| Fundo da página | `var(--bg-page)` | `#ffffff` |
| Fundo de card/modal | `var(--bg-card)` | `#ffffff` |
| Fundo de input | `var(--bg-input)` | `#f4f4f5` |
| Texto principal | `var(--text-hi)` | `#111111` |
| Texto secundário | `var(--text-lo)` | `#6b7280` |
| Borda | `var(--border)` | `#e5e7eb` |
| Cor da marca | `var(--color-brand)` | dinâmico (empresa) |
| Cor da marca clara | `var(--color-brand-light)` | dinâmico + 12% opacidade |

```tsx
// ✅ Bom
<div style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>

// ❌ Ruim — ignora o tema da empresa
<div className="bg-white border-gray-100">
```

> O app é travado em claro (`color-scheme: light`), mas as CSS vars continuam
> obrigatórias: `applyCompanyTheme` sobrescreve fundo, texto e bordas em runtime
> com as cores da empresa. Cor hardcoded escapa disso e fica destoando do resto.

### Tailwind — apenas para layout e utilitários

Usar Tailwind para: flexbox, grid, padding/margin, border-radius, font-size, font-weight, overflow, z-index, position.

Não usar Tailwind para: cores de fundo, cores de texto, cores de borda — usar CSS vars.

```tsx
// ✅ Bom — layout com Tailwind, cores com CSS vars
<div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>

// ❌ Evitar — cor hardcoded via Tailwind
<div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border-gray-100">
```

### Exceções permitidas para cor hardcoded

- `ClosedScreen.tsx` — gradientes noturnos/auroras são intencionalmente hardcoded (a tela representa manhã/noite, não o tema do app)
- Badges de status emergencial (`text-red-600`, `bg-red-50`) — ok quando o significado semântico é universal
- Sugestões (`bg-amber-50`, `text-amber-700`) — ok para contextos específicos de UI

## Tamanhos de Toque (Mobile-First)

Toda área clicável tem mínimo **44×44px** (guideline Apple HIG / WCAG):

```tsx
// ✅ Bom
<button className="w-11 h-11 flex items-center justify-center">

// ❌ Ruim — muito pequeno no mobile
<button className="w-5 h-5">
```

## Nomes de Arquivos

- Componentes: `PascalCase.tsx`
- Hooks: `useNome.ts`
- Libs/utils: `camelCase.ts`
- Stores Zustand: `camelCaseStore.ts`
- Tipos: `index.ts` (central)

## Comentários

- Comentários em **português** (alinhado com o contexto de negócio)
- Sempre mencionar a **fonte Flutter** quando relevante:

```ts
/** Espelho de GeradorDeCodigo.gerarHibridoTempoAleatorio() */
export function gerarHibridoTempoAleatorio(): string { ... }
```

- Não comentar código óbvio. Comentar intenções não-óbvias e edge cases

## Zustand

- Setters simples ficam no store
- Lógica complexa (ex: `injectTakeawayPackaging`) como função pura fora do store, chamada dentro do setter
- Não importar stores dentro de outros stores — passe dados como parâmetros

```ts
// ✅ Bom
function injectPackaging(item: CartItem): CartItem { ... }  // pura, testável

setWhereConsume: (w) => {
  set((s) => ({ items: s.items.map(item => injectPackaging(item)) }))
}

// ❌ Ruim — lógica complexa inline
setWhereConsume: (w) => {
  set((s) => ({
    items: s.items.map(item => {
      // 50 linhas de lógica inline
    })
  }))
}
```

## Analytics

Todo novo evento deve passar pela função `Analytics.*` em `src/lib/analytics.ts`:

```ts
// ✅ Bom — usa o helper tipado
Analytics.addToCart(product, total, qty)

// ❌ Ruim — chama fbq/gtag diretamente sem verificar consentimento
window.fbq('track', 'AddToCart', { value: total })
```

## Organização de Imports

Ordem: libs externas → libs internas por tipo → componentes → tipos

```ts
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAppStore } from '../store/appStore'
import { useCartStore } from '../store/cartStore'
import { formatCurrency } from '../lib/pricing'
import { Analytics } from '../lib/analytics'

import ProductCard from '../components/ProductCard'
import CartDrawer from '../components/CartDrawer'

import type { Product } from '../types'
```

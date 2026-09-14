import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CartItem, CartComplement, Product, ComplementsGroup, WhereConsume, Offer } from '../types'
import { calcCartItemSubtotal, calcCartTotal } from '../lib/pricing'
import { saveClientInfo, loadClientInfo } from '../lib/client_storage'
import { gerarConsumptionCode, getOrCreateNumero, resetNumero } from '../lib/gerador_codigo'

interface CartStore {
  items: CartItem[]
  orderNote: string
  clientName: string; clientPhone: string; clientCpf: string; clientEmail: string
  setClientEmail: (e: string) => void
  /** Comanda do cliente dentro da mesa. Só usado se branch.settingsWeb.comandaEnabled */
  comanda: string
  setComanda: (c: string) => void
  /** O cliente já respondeu "comer aqui ou levar" nesta sessão? */
  whereConsumeAsked: boolean
  setWhereConsumeAsked: (v: boolean) => void
  /** Banners já foram exibidos nesta sessão? */
  bannersSeen: boolean
  setBannersSeen: (v: boolean) => void
  whereConsume: WhereConsume
  consumptioncode: string; consumptionint: number
  appliedCoupon: Offer | null; couponCode: string

  addItem: (product: Product, complements: CartComplement[], note: string, qty: number) => void
  updateItem: (index: number, complements: CartComplement[], note: string, qty: number) => void
  removeItem: (index: number) => void
  updateItemQty: (index: number, qty: number) => void
  updateItemNote: (index: number, note: string) => void
  setOrderNote: (n: string) => void
  setWhereConsume: (w: WhereConsume) => void
  setCoupon: (coupon: Offer | null, code: string) => void
  clearCart: () => void
  clearCartKeepCodes: () => void  // mantém consumptioncode para 'pedir mais'
  /** Company do carrinho atual — vazio antes do primeiro boot. */
  companyScope: string
  /** Descarta o carrinho se a company mudou. Chamado no boot. */
  ensureCompanyScope: (companyId: string | undefined | null) => void
  /** Epoch ms da última mexida no carrinho. 0 = carrinho vazio/novo. */
  touchedAt: number
  /**
   * Descarta carrinho e códigos vencidos. Chamado no boot.
   * @returns `true` se descartou, para a tela poder avisar
   */
  ensureFresh: (ttlMinutes?: number) => boolean
  setClientName: (n: string) => void
  setClientPhone: (p: string) => void
  setClientCpf: (c: string) => void
  loadSavedClient: () => void
  /** @param digitos dígitos da senha do balcão (settingsWeb.passwordDigits) */
  initCodes: (mode: 'mesa' | 'balcao', table: string, digitos?: number) => void
  total: () => number
  totalWithCoupon: () => number
  itemCount: () => number
}

/** Espelho de Product.injectTakeawayPackaging() */
function injectPackaging(item: CartItem): CartItem {
  const comps = item.addedComplements.filter((c) => !c.isPackaging)
  for (const g of item.product.complementsGroups) {
    if (g.isTakeawayPackaging && g.autoAdd) {
      for (const p of g.products) {
        const already = comps.some((c) => c._id === (p as unknown as {_id:string})._id && c.isPackaging)
        if (!already) {
          comps.push({
            _id: (p as unknown as {_id:string})._id,
            name: (p as unknown as {name:string}).name,
            price: (p as unknown as {price:number}).price ?? 0,
            quantity: 1,
            groupId: g._id,
            groupName: g.title,
            isPackaging: true,
            unitFraction: 1,
          })
        }
      }
    }
  }
  const updated = { ...item, addedComplements: comps }
  return { ...updated, subTotal: calcCartItemSubtotal(updated) }
}

/** Espelho de Product.removeTakeawayPackaging() */
function removePackaging(item: CartItem): CartItem {
  const comps = item.addedComplements.filter((c) => !c.isPackaging)
  const updated = { ...item, addedComplements: comps }
  return { ...updated, subTotal: calcCartItemSubtotal(updated) }
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [], orderNote: '',
      clientName: '', clientPhone: '', clientCpf: '', clientEmail: '', comanda: '',
      companyScope: '', touchedAt: 0,
      whereConsume: 'OnLocal',
      consumptioncode: '', consumptionint: 0,
      appliedCoupon: null, couponCode: '',

      addItem: (product, complements, note, qty = 1) => {
        let newItem: CartItem = { product, quantity: qty, note, addedComplements: complements, subTotal: 0 }
        if (get().whereConsume === 'OutsideLocal') newItem = injectPackaging(newItem)
        else newItem.subTotal = calcCartItemSubtotal(newItem)
        // `touchedAt` a cada mexida: é dele que sai a validade do carrinho.
        // `Date.now()` aqui é seguro — ação de store, nunca corpo de render.
        set((s) => ({ items: [...s.items, newItem], touchedAt: Date.now() }))
      },

      updateItem: (index, complements, note, qty) =>
        set((s) => {
          const items = [...s.items]
          if (!items[index]) return s
          let updated = { ...items[index], addedComplements: complements, note, quantity: qty }
          if (s.whereConsume === 'OutsideLocal') updated = injectPackaging(updated)
          else updated.subTotal = calcCartItemSubtotal(updated)
          items[index] = updated
          return { items, touchedAt: Date.now() }
        }),

      removeItem: (index) =>
        set((s) => ({ items: s.items.filter((_, i) => i !== index), touchedAt: Date.now() })),

      updateItemQty: (index, qty) =>
        set((s) => {
          const items = [...s.items]
          if (!items[index]) return s
          const updated = { ...items[index], quantity: Math.max(1, qty) }
          updated.subTotal = calcCartItemSubtotal(updated)
          items[index] = updated
          return { items, touchedAt: Date.now() }
        }),

      updateItemNote: (index, note) =>
        set((s) => {
          const items = [...s.items]
          if (!items[index]) return s
          items[index] = { ...items[index], note }
          return { items, touchedAt: Date.now() }
        }),

      setOrderNote: (note) => set({ orderNote: note }),
      setComanda: (comanda) => set({ comanda }),
      whereConsumeAsked: false,
      setWhereConsumeAsked: (whereConsumeAsked) => set({ whereConsumeAsked }),
      bannersSeen: false,
      setBannersSeen: (bannersSeen) => set({ bannersSeen }),

      /** Espelho de BuyingCicleProvider.setWhereConsume() — injeta/remove embalagem */
      setWhereConsume: (w) => {
        const prev = get().whereConsume
        set({ whereConsume: w })
        if (prev === w) return
        set((s) => ({
          items: s.items.map((item) =>
            w === 'OutsideLocal' ? injectPackaging(item) : removePackaging(item)
          ),
        }))
      },

      setCoupon: (coupon, code) => set({ appliedCoupon: coupon, couponCode: code }),

      clearCart: () => {
        resetNumero()
        set({ items: [], orderNote: '', consumptioncode: '', consumptionint: 0, appliedCoupon: null, couponCode: '' })
      },

      /**
       * Descarta o carrinho quando a company muda.
       *
       * O carrinho vive em `sessionStorage`, que **sobrevive ao reload** na mesma
       * aba. Escanear o QR de outro restaurante recarrega a página (é o que o
       * `QrScanner` faz) e o carrinho anterior continuava lá — com produtos que
       * não existem no cardápio novo, e preço de outra casa.
       *
       * Prefixar a chave por company guardaria **dois** carrinhos; aqui o certo é
       * jogar fora. Ninguém quer retomar o pedido do restaurante que já deixou.
       *
       * Também zera os portões de abertura: banner e local/viagem são da casa, e
       * a nova precisa fazer as próprias perguntas.
       */
      /**
       * Validade do carrinho e dos códigos do pedido.
       *
       * `sessionStorage` só morre quando a aba fecha — e aba de celular fica
       * semanas aberta. Sem prazo, o cliente reabre o app dias depois com o
       * carrinho montado **aos preços de então**: item que subiu, promoção que
       * acabou, produto que saiu do cardápio. Ele fecha o pedido e a conta vem
       * diferente do que a tela mostrou.
       *
       * Os códigos vencem junto, e por motivo próprio: `consumptioncode` é a
       * senha do atendimento. Reaproveitar a de ontem coloca o pedido de hoje
       * numa comanda que já foi fechada e paga.
       *
       * O prazo é generoso (4h por padrão) porque o risco dos dois lados não é
       * simétrico: apagar o carrinho de quem está decidindo há 40 minutos é
       * estrago imediato e visível; preço velho aparece na conta. Uma refeição
       * longa cabe em 4h — dias, não.
       */
      ensureFresh: (ttlMinutes) => {
        const ttl = (ttlMinutes && ttlMinutes > 0 ? ttlMinutes : 240) * 60_000
        const { touchedAt, items, consumptioncode } = get()
        if (!touchedAt) return false
        if (items.length === 0 && !consumptioncode) return false

        const age = Date.now() - touchedAt
        // `age < 0`: relógio do aparelho andou para trás. Sem saber a idade
        // real, o seguro é descartar — preço velho silencioso é pior.
        if (age >= 0 && age < ttl) return false

        resetNumero()
        set({
          items: [], orderNote: '',
          consumptioncode: '', consumptionint: 0,
          appliedCoupon: null, couponCode: '',
          touchedAt: 0,
        })
        return true
      },

      ensureCompanyScope: (companyId) => {
        const id = (companyId ?? '').trim()
        if (get().companyScope === id) return
        resetNumero()
        set({
          companyScope: id,
          items: [], orderNote: '',
          consumptioncode: '', consumptionint: 0,
          appliedCoupon: null, couponCode: '',
          comanda: '',
          bannersSeen: false, whereConsumeAsked: false,
        })
      },

      // Limpa itens mas mantém os códigos para o cliente pedir mais na mesma mesa
      clearCartKeepCodes: () => {
        set({ items: [], orderNote: '', appliedCoupon: null, couponCode: '' })
        // consumptioncode e consumptionint MANTIDOS propositalmente
      },

      setClientName: (clientName) => {
        set({ clientName })
        const s = get()
        saveClientInfo({ name: clientName, phone: s.clientPhone, cpf: s.clientCpf, email: s.clientEmail })
      },
      setClientPhone: (clientPhone) => {
        set({ clientPhone })
        const s = get()
        saveClientInfo({ name: s.clientName, phone: clientPhone, cpf: s.clientCpf, email: s.clientEmail })
      },
      setClientCpf: (clientCpf) => {
        set({ clientCpf })
        const s = get()
        saveClientInfo({ name: s.clientName, phone: s.clientPhone, cpf: clientCpf, email: s.clientEmail })
      },
      setClientEmail: (clientEmail) => {
        set({ clientEmail })
        const s = get()
        saveClientInfo({ name: s.clientName, phone: s.clientPhone, cpf: s.clientCpf, email: clientEmail })
      },
      loadSavedClient: () => {
        const saved = loadClientInfo()
        if (saved) set({
          clientName: saved.name ?? '',
          clientPhone: saved.phone ?? '',
          clientCpf: saved.cpf ?? '',
          clientEmail: saved.email ?? '',
        })
      },

      initCodes: (mode, table, digitos) => {
        if (get().consumptioncode) return
        set({
          consumptioncode: gerarConsumptionCode(mode, table, digitos),
          consumptionint: getOrCreateNumero(),
          // A senha entra na contagem de validade: senha de ontem cai numa
          // comanda que já foi fechada e paga
          touchedAt: Date.now(),
        })
      },

      total: () => calcCartTotal(get().items),
      totalWithCoupon: () => {
        const base = calcCartTotal(get().items)
        const coupon = get().appliedCoupon
        if (!coupon?.rewards?.discountType) return base
        const { type, value } = coupon.rewards.discountType
        if (type === 2) return Math.max(0, base - value)
        if (type === 1) return base * ((100 - value) / 100)
        return base
      },
      itemCount: () => get().items.reduce((acc, i) => acc + i.quantity, 0),
    }),
    {
      name: 'cardapio-cart',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        items: s.items, orderNote: s.orderNote,
        whereConsume: s.whereConsume,
        // Precisa persistir: é comparando com a company do boot que o carrinho
        // de outro restaurante é detectado e descartado
        companyScope: s.companyScope,
        // Idem para a validade: sem persistir, todo reload pareceria carrinho novo
        touchedAt: s.touchedAt,
        consumptioncode: s.consumptioncode, consumptionint: s.consumptionint,
        couponCode: s.couponCode,
        // A comanda vale para a sessão inteira: o cliente informa uma vez e
        // segue pedindo sem redigitar a cada rodada
        comanda: s.comanda,
        // Perguntar "comer aqui ou levar" a cada reload seria irritante
        whereConsumeAsked: s.whereConsumeAsked,
        // Idem para o banner: promoção que reaparece vira obstáculo
        bannersSeen: s.bannersSeen,
      }),
    }
  )
)

export function buildCartComplements(
  selectedByGroup: Map<string, { item: Product; qty: number }[]>,
  groups: ComplementsGroup[]
): CartComplement[] {
  const result: CartComplement[] = []
  const groupMap = new Map(groups.map((g) => [g._id, g]))
  for (const [groupId, selections] of selectedByGroup.entries()) {
    const group = groupMap.get(groupId)
    if (!group) continue
    for (const { item, qty } of selections) {
      if (qty <= 0) continue
      result.push({
        _id: item._id,
        name: item.name,
        price: (item as unknown as { price: number }).price ?? 0,
        quantity: qty,
        groupId,
        groupName: group.title,
        unitFraction: group.ingredients ? 1 / group.maxQuantity : 1,
      })
    }
  }
  return result
}

/** Converte CartComplement[] de volta para selectedByGroup (para edição) */
export function cartComplementsToSelectedByGroup(
  addedComplements: CartComplement[]
): Map<string, Record<string, number>> {
  const map = new Map<string, Record<string, number>>()
  for (const c of addedComplements) {
    if (c.isPackaging) continue
    if (!map.has(c.groupId)) map.set(c.groupId, {})
    const g = map.get(c.groupId)!
    g[c._id] = (g[c._id] ?? 0) + c.quantity
  }
  return map
}

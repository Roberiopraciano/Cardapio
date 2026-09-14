import { create } from 'zustand'
import type { Branch, Company, Category, Product, ComplementsGroup, ComplementsGroupCategory, Period, Offer, URLParams } from '../types'
import type { ClosedReason } from '../lib/businessPeriod'

interface AppStore {
  params: URLParams | null
  setParams: (p: URLParams) => void
  loading: boolean
  booted: boolean
  closedReason: ClosedReason
  setLoading: (v: boolean) => void
  setBooted: (v: boolean) => void
  setClosedReason: (r: ClosedReason) => void
  branch: Branch | null
  company: Company | null
  categories: Category[]
  products: Product[]
  groups: ComplementsGroup[]
  groupCategories: ComplementsGroupCategory[]
  periods: Period[]
  offers: Offer[]
  setBranch: (b: Branch) => void
  setCompany: (c: Company) => void
  setMenuData: (data: {
    categories: Category[]
    products: Product[]
    groups: ComplementsGroup[]
    groupCategories: ComplementsGroupCategory[]
    periods: Period[]
    offers: Offer[]
  }) => void
}

export const useAppStore = create<AppStore>((set) => ({
  params: null, setParams: (p) => set({ params: p }),
  loading: true, booted: false, closedReason: null,
  setLoading: (v) => set({ loading: v }),
  setBooted: (v) => set({ booted: v }),
  setClosedReason: (r) => set({ closedReason: r }),
  branch: null, company: null,
  categories: [], products: [], groups: [], groupCategories: [], periods: [], offers: [],
  setBranch: (b) => set({ branch: b }),
  setCompany: (c) => set({ company: c }),
  setMenuData: (data) => set(data),
}))

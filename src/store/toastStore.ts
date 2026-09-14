import { create } from 'zustand'

export type ToastType = 'info' | 'success' | 'warning' | 'error' | 'ready'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  sticky?: boolean   // não auto-remove
  duration?: number  // ms para auto-remoção (padrão 3500)
}

interface ToastStore {
  toasts: ToastItem[]
  show: (message: string, type?: ToastType, options?: { sticky?: boolean; duration?: number }) => string
  dismiss: (id: string) => void
  clear: () => void
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  show: (message, type = 'info', options = {}) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    const item: ToastItem = { id, message, type, ...options }
    set((s) => ({ toasts: [...s.toasts.slice(-2), item] })) // max 3 toasts

    if (!options.sticky) {
      const duration = options.duration ?? (type === 'ready' ? 8000 : 3500)
      setTimeout(() => get().dismiss(id), duration)
    }
    return id
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}))

/** Helper para usar fora de componentes React */
export const toast = {
  info: (msg: string, opts?: Parameters<ToastStore['show']>[2]) =>
    useToastStore.getState().show(msg, 'info', opts),
  success: (msg: string, opts?: Parameters<ToastStore['show']>[2]) =>
    useToastStore.getState().show(msg, 'success', opts),
  warning: (msg: string, opts?: Parameters<ToastStore['show']>[2]) =>
    useToastStore.getState().show(msg, 'warning', opts),
  error: (msg: string, opts?: Parameters<ToastStore['show']>[2]) =>
    useToastStore.getState().show(msg, 'error', opts),
  ready: (msg: string) =>
    useToastStore.getState().show(msg, 'ready', { sticky: true, duration: 12000 }),
}

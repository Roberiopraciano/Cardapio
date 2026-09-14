import { create } from 'zustand'
import {
  DEFAULT_LANG, detectLang, loadLang, saveLang, translate,
} from '../lib/i18n'
import type { Lang } from '../lib/i18n'

interface LangStore {
  lang: Lang
  /** Idiomas habilitados na branch. Com menos de 2, o seletor some. */
  available: Lang[]
  setLang: (l: Lang) => void
  /** Chamado no boot com o que a branch permite. */
  initLanguages: (available: Lang[]) => void
  t: (key: string) => string
}

export const useLangStore = create<LangStore>((set, get) => ({
  lang: DEFAULT_LANG,
  available: [DEFAULT_LANG],

  setLang: (lang) => {
    saveLang(lang)
    set({ lang })
  },

  initLanguages: (available) => {
    // Escolha do cliente ganha do idioma do aparelho; ambos só valem se a
    // branch habilitar o idioma — senão o cardápio ficaria meio traduzido.
    const saved = loadLang()
    const lang = saved && available.includes(saved) ? saved : detectLang(available)
    set({ available, lang })
  },

  t: (key) => translate(get().lang, key),
}))

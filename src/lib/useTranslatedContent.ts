/**
 * Nome e descrição de produto/categoria no idioma escolhido.
 *
 * Cai para o português quando a tradução do item não está preenchida no painel
 * — um cardápio meio traduzido ainda é utilizável; um com linhas em branco não.
 */

import { useLangStore } from '../store/langStore'
import { translatedName, translatedDescription } from './i18n'

interface Translatable {
  name: string
  description?: string
  translations?: unknown
}

export function useContentTranslator() {
  const lang = useLangStore((s) => s.lang)

  return {
    lang,
    name: (item: Translatable) => translatedName(item.name, item.translations, lang),
    description: (item: Translatable) =>
      translatedDescription(item.description, item.translations, lang),
  }
}

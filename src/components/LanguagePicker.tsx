import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLangStore } from '../store/langStore'
import { LANG_META } from '../lib/i18n'
import Icon from './Icon'
import Flag from './Flag'
import type { Lang } from '../lib/i18n'

/**
 * Seletor de idioma no cabeçalho.
 *
 * Só aparece quando a branch habilita mais de um idioma
 * (`settingsWeb.languages`). Com um idioma só, o botão seria ruído.
 */
export default function LanguagePicker() {
  const { lang, available, setLang } = useLangStore()
  const [open, setOpen] = useState(false)

  if (available.length < 2) return null

  const pick = (l: Lang) => {
    setLang(l)
    setOpen(false)
  }

  return (
    <>
      {/* Mesma altura e borda do HeaderButton, só mais largo para caber a
          sigla do idioma */}
      <button
        onClick={() => setOpen(true)}
        className="h-10 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold flex-shrink-0 border active:scale-90 transition-transform"
        style={{
          background: 'var(--bg-input)',
          borderColor: 'var(--border)',
          color: 'var(--text-hi)',
        }}
        aria-label={LANG_META[lang].label}
      >
        <Flag lang={lang} size={18} />
        {LANG_META[lang].short}
      </button>

      {/*
        Portal para o body de propósito. O cabeçalho da Home é
        `sticky ... z-20`, e elemento posicionado com z-index cria contexto de
        empilhamento próprio: o `z-50` daqui ficava confinado dentro do z-20 do
        header e a folha aparecia **atrás** do botão do carrinho e da TabBar.
      */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: 'rgba(0,0,0,.45)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl p-4 pb-8 flex flex-col gap-2"
            style={{ background: 'var(--bg-card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="w-10 h-1 rounded-full mx-auto mb-2"
              style={{ background: 'var(--border)' }}
            />
            {available.map((l) => (
              <button
                key={l}
                onClick={() => pick(l)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left"
                style={l === lang
                  ? { background: 'var(--color-brand-light)', color: 'var(--color-brand)' }
                  : { background: 'var(--bg-input)', color: 'var(--text-hi)' }
                }
              >
                <Flag lang={l} size={24} />
                <span className="text-sm font-medium flex-1">{LANG_META[l].label}</span>
                {l === lang && <Icon name="check" size={13} />}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

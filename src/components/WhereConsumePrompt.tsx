import { useCartStore } from '../store/cartStore'
import type { WhereConsume } from '../types'
import Icon from './Icon'
import type { IconName } from './Icon'
import { useLangStore } from '../store/langStore'
import { LANG_META } from '../lib/i18n'
import Flag from './Flag'

/**
 * Primeira pergunta do cardápio, como no totem: comer aqui ou levar.
 *
 * Vem **antes** do menu de propósito. A escolha muda preço e condição — grupos
 * de embalagem com `autoAdd` entram no carrinho quando é para viagem, e a
 * branch pode ter regra de preço diferente. Perguntar só no checkout faria o
 * cliente montar o pedido inteiro vendo um preço que não é o dele.
 */
export default function WhereConsumePrompt({
  onDone,
  allowed,
}: {
  onDone: () => void
  allowed: WhereConsume[]
}) {
  const { setWhereConsume } = useCartStore()
  const { lang, available, setLang, t } = useLangStore()

  const choose = (w: WhereConsume) => {
    setWhereConsume(w)
    onDone()
  }

  const OPTIONS: Array<{ value: WhereConsume; icon: IconName; title: string; text: string }> = [
    {
      value: 'OnLocal',
      icon: 'menu',
      title: t('where.eatHere'),
      text: t('where.eatHereHint'),
    },
    {
      value: 'OutsideLocal',
      icon: 'takeaway',
      title: t('where.takeAway'),
      text: t('where.takeAwayHint'),
    },
  ]

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-6"
      style={{ background: 'var(--bg-page)' }}>
      {/* Idioma junto da primeira pergunta: é o momento em que o cliente já
          está parado lendo, e é a última chance antes do cardápio inteiro
          aparecer no idioma errado. Some quando a branch só tem um idioma. */}
      {available.length > 1 && (
        <div className="w-full max-w-sm flex justify-center gap-2">
          {available.map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-bold transition-colors"
              style={l === lang
                ? { background: 'var(--color-brand-light)', borderColor: 'var(--color-brand-medium)', color: 'var(--color-brand)' }
                : { background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-lo)' }
              }
              aria-label={LANG_META[l].label}
            >
              <Flag lang={l} size={18} />
              {LANG_META[l].short}
            </button>
          ))}
        </div>
      )}

      <div className="text-center">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-hi)' }}>
          {t('where.title')}
        </h1>
        <p className="text-sm mt-1.5" style={{ color: 'var(--text-lo)' }}>
          {t('where.subtitle')}
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-3">
        {OPTIONS.filter((option) => allowed.includes(option.value)).map((o) => (
          <button
            key={o.value}
            onClick={() => choose(o.value)}
            className="w-full flex items-center gap-4 px-5 py-5 rounded-2xl border text-left active:scale-[0.98] transition-transform"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <span className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--color-brand-light)' }}>
              <Icon name={o.icon} size={24} color="var(--color-brand)" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-base font-bold" style={{ color: 'var(--text-hi)' }}>
                {o.title}
              </span>
              <span className="block text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
                {o.text}
              </span>
            </span>
            <span className="flex-shrink-0" style={{ color: 'var(--color-brand)', transform: 'rotate(180deg)' }}>
              <Icon name="back" size={16} />
            </span>
          </button>
        ))}
      </div>

      <p className="text-xs text-center max-w-xs" style={{ color: 'var(--text-lo)' }}>
        {t('where.canChange')}
      </p>
    </div>
  )
}

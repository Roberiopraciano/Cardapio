import { useLocation, useNavigate } from 'react-router-dom'
import { useCartStore } from '../store/cartStore'
import { useAppStore } from '../store/appStore'
import Icon from './Icon'
import { loadAvatar } from '../lib/avatar'
import type { IconName } from './Icon'

interface Tab {
  path: string
  icon: IconName
  label: string
  /** Rotas que também acendem esta aba */
  match?: string[]
}

/**
 * A terceira aba muda com o modo: no balcão não existe conta de mesa para
 * consultar — o cliente paga e leva. Ali o que faz sentido é o histórico do
 * próprio aparelho.
 */
function buildTabs(mode: 'mesa' | 'balcao'): Tab[] {
  return [
    { path: '/', icon: 'menu', label: 'Cardápio', match: ['/produto'] },
    { path: '/checkout', icon: 'cart', label: 'Pedido' },
    mode === 'balcao'
      ? { path: '/pedidos', icon: 'bill', label: 'Pedidos' }
      : { path: '/conta', icon: 'bill', label: 'Conta' },
    { path: '/perfil', icon: 'profile', label: 'Perfil' },
  ]
}

/**
 * Navegação inferior, com seleção no estilo dock do macOS: o item ativo sobe,
 * cresce e ganha uma pastilha da cor da marca atrás.
 *
 * Escondida apenas em telas que **não são destino de aba** e já têm ação fixa
 * no rodapé — detalhe do produto e confirmação. O checkout continua com a barra
 * porque é o destino da aba "Pedido": sumir ali deixaria o cliente sem saída.
 */
export default function TabBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const count = useCartStore((s) => s.itemCount())
  const mode = useAppStore((s) => s.params?.mode) ?? 'mesa'
  const TABS = buildTabs(mode)

  // Lido a cada render de propósito: é um `localStorage.getItem` barato, e
  // assim a foto aparece na aba no mesmo instante em que é escolhida no perfil
  const avatar = loadAvatar()

  const HIDE_ON = ['/produto', '/confirmacao']
  if (HIDE_ON.some((p) => pathname.startsWith(p))) return null

  const isActive = (tab: Tab) =>
    tab.path === '/'
      ? pathname === '/' || (tab.match ?? []).some((m) => pathname.startsWith(m))
      : pathname.startsWith(tab.path)

  return (
    <nav
      // z-40: acima das barras fixas de total (z-20) das telas internas
      className="fixed bottom-0 left-0 right-0 z-40 flex justify-around px-2 pt-2"
      style={{
        background: 'color-mix(in srgb, var(--bg-card) 88%, transparent)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid var(--border)',
        // Respeita a barra de gestos do iPhone
        paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {TABS.map((tab) => {
        const active = isActive(tab)
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className="relative flex-1 flex flex-col items-center justify-end gap-1 pb-0.5"
            style={{ WebkitTapHighlightColor: 'transparent' }}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.label}
          >
            {/* Pastilha do dock */}
            <span
              className="absolute inset-x-2 rounded-2xl transition-all duration-300"
              style={{
                top: -2,
                bottom: -2,
                background: active ? 'var(--color-brand-light)' : 'transparent',
                transform: active ? 'scale(1)' : 'scale(.8)',
                opacity: active ? 1 : 0,
              }}
              aria-hidden
            />

            <span
              className="relative leading-none transition-transform duration-300 flex items-center justify-center"
              style={{
                height: 24,
                transform: active ? 'translateY(-3px) scale(1.2)' : 'none',
              }}
            >
              {/* Na aba de perfil, a foto do cliente substitui o ícone */}
              {tab.path === '/perfil' && avatar ? (
                <img
                  src={avatar}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover"
                  style={{
                    border: `1.5px solid ${active ? 'var(--color-brand)' : 'var(--border)'}`,
                  }}
                />
              ) : (
                <Icon
                  name={tab.icon}
                  size={20}
                  color={active ? 'var(--color-brand)' : 'var(--text-lo)'}
                />
              )}
              {tab.path === '/checkout' && count > 0 && (
                <span
                  className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                  style={{ background: 'var(--color-brand)' }}
                >
                  {count}
                </span>
              )}
            </span>

            <span
              className="relative text-[10px] transition-all duration-300"
              style={{
                color: active ? 'var(--color-brand)' : 'var(--text-lo)',
                fontWeight: active ? 700 : 500,
              }}
            >
              {tab.label}
            </span>

            {/* Pontinho do item ativo, igual ao indicador do dock */}
            <span
              className="relative rounded-full transition-all duration-300"
              style={{
                width: active ? 4 : 0,
                height: active ? 4 : 0,
                background: 'var(--color-brand)',
                opacity: active ? 1 : 0,
              }}
              aria-hidden
            />
          </button>
        )
      })}
    </nav>
  )
}

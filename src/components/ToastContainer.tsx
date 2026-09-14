import { useToastStore, type ToastType } from '../store/toastStore'

const STYLE: Record<ToastType, { bg: string; border: string; icon: string }> = {
  info:    { bg: '#1c1c1e', border: 'rgba(255,255,255,.12)', icon: 'ℹ️' },
  success: { bg: '#064e3b', border: 'rgba(16,185,129,.4)',   icon: '✓' },
  warning: { bg: '#78350f', border: 'rgba(251,191,36,.4)',   icon: '⚠️' },
  error:   { bg: '#7f1d1d', border: 'rgba(239,68,68,.4)',    icon: '✕' },
  ready:   { bg: '#064e3b', border: 'rgba(52,211,153,.5)',   icon: '🍽' },
}

export default function ToastContainer() {
  const { toasts, dismiss } = useToastStore()
  if (!toasts.length) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 56,
        left: 12,
        right: 12,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => {
        const s = STYLE[t.type]
        return (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: 14,
              padding: '10px 14px',
              boxShadow: '0 8px 24px rgba(0,0,0,.35)',
              animation: 'toast-in .25s cubic-bezier(.4,0,.2,1)',
              pointerEvents: 'all',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: t.type === 'ready' ? 20 : 14, flexShrink: 0 }}>{s.icon}</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: t.type === 'ready' ? 600 : 400, color: '#fff', lineHeight: 1.4 }}>
              {t.message}
            </span>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,.5)', flexShrink: 0 }}>×</span>
          </div>
        )
      })}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px) scale(.96); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  )
}

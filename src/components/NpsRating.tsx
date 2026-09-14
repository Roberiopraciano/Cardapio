import { useState, useEffect } from 'react'
import { api } from '../api/client'
import { toast } from '../store/toastStore'
import { useAppStore } from '../store/appStore'

interface Props {
  consumptioncode: string
  delayMs?: number
  onDismiss?: () => void
}

/**
 * Widget de avaliação NPS — aparece N segundos após a confirmação.
 * Estrelas 1–5 → POST api/reviews.
 * Auto-dismiss após envio ou clique em "Agora não".
 */
export default function NpsRating({ consumptioncode, delayMs = 3000, onDismiss }: Props) {
  const { branch, params } = useAppStore()
  const [visible, setVisible] = useState(false)
  const [hovered, setHovered] = useState(0)
  const [selected, setSelected] = useState(0)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs])

  if (!visible) return null

  const dismiss = () => { setVisible(false); onDismiss?.() }

  const handleRate = async (rating: number) => {
    setSelected(rating)
    setSending(true)
    try {
      await api.postReview({
        branch: params?.branchId ?? '',
        consumptioncode,
        rating,
        simpleAuth: branch?.settingsWeb?.simpleAuth ?? '',
      })
      setSent(true)
      toast.success('Obrigado pela avaliação! 🙏')
      setTimeout(() => { setVisible(false); onDismiss?.() }, 1500)
    } catch {
      toast.error('Não foi possível enviar a avaliação.')
      setSending(false)
    }
  }

  const LABELS = ['', 'Muito ruim', 'Ruim', 'Regular', 'Bom', 'Excelente!']
  const display = hovered || selected

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        padding: '0 16px 20px',
        animation: 'slide-up-nps .35s cubic-bezier(.4,0,.2,1)',
      }}
    >
      <style>{`
        @keyframes slide-up-nps {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
      `}</style>
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 20,
          padding: '18px 20px',
          boxShadow: '0 -4px 32px rgba(0,0,0,.18)',
          border: '1px solid var(--border)',
          textAlign: 'center',
        }}
      >
        {sent ? (
          <div>
            <div style={{ fontSize: 36 }}>🙏</div>
            <p style={{ fontSize: 14, fontWeight: 600, marginTop: 8, color: 'var(--text-hi)' }}>
              Obrigado pela avaliação!
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-hi)', marginBottom: 4 }}>
              Como foi sua experiência?
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-lo)', marginBottom: 14 }}>
              Sua opinião ajuda a melhorar o serviço
            </p>

            {/* Stars */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => !sending && handleRate(star)}
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  disabled={sending}
                  style={{
                    fontSize: 36,
                    background: 'none',
                    border: 'none',
                    cursor: sending ? 'not-allowed' : 'pointer',
                    padding: 0,
                    transform: display >= star ? 'scale(1.15)' : 'scale(1)',
                    transition: 'transform .15s',
                    opacity: selected > 0 && selected !== star ? 0.4 : 1,
                    filter: display >= star ? 'none' : 'grayscale(1)',
                  }}
                  aria-label={`${star} estrela${star > 1 ? 's' : ''}`}
                >
                  ⭐
                </button>
              ))}
            </div>

            {/* Label do rating */}
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-brand)', height: 18, marginBottom: 12 }}>
              {LABELS[display] || ''}
            </p>

            <button
              onClick={dismiss}
              style={{ fontSize: 12, color: 'var(--text-lo)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
            >
              Agora não
            </button>
          </>
        )}
      </div>
    </div>
  )
}

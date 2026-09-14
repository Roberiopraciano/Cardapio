import { useState } from 'react'
import { hasAnswered, setConsent, isGranted } from '../lib/consent'
import { initAnalytics } from '../lib/analytics'
import { useAppStore } from '../store/appStore'

/**
 * Banner de consentimento LGPD.
 * Aparece apenas na primeira visita (hasAnswered() === false).
 * Ao aceitar: inicializa Meta Pixel + GA4.
 * Ao recusar: fecha sem carregar scripts.
 * Z-index 25 — abaixo do carrinho (z-30) mas acima do conteúdo.
 */
export default function ConsentBanner() {
  const { branch } = useAppStore()
  const [visible, setVisible] = useState(!hasAnswered())

  /**
   * A LGPD exige que o titular saiba o que é coletado antes de consentir.
   * Sem o link, "Aceitar" não é consentimento informado — é só um botão.
   * Vem de `settingsWeb.privacyPolicyUrl`; sem ele o link não aparece.
   */
  const privacyUrl = branch?.settingsWeb?.privacyPolicyUrl?.trim()

  if (!visible) return null

  const handleAccept = () => {
    setConsent('granted')
    setVisible(false)
    initAnalytics({
      branchPixelId: branch?.settingsWeb?.['metaPixelId'] as string | undefined,
      branchGaId: branch?.settingsWeb?.['gaId'] as string | undefined,
      platformPixelId: import.meta.env.VITE_META_PIXEL_ID as string | undefined,
      platformGaId: import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined,
    })
  }

  const handleDecline = () => {
    setConsent('denied')
    setVisible(false)
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-25 px-4 py-3"
      style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', zIndex: 25 }}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <p className="flex-1 text-xs leading-relaxed" style={{ color: 'var(--text-lo)' }}>
          Este cardápio usa cookies analíticos para melhorar a experiência.{' '}
          <span style={{ color: 'var(--text-hi)' }}>Seus dados não são compartilhados com terceiros.</span>
          {privacyUrl && (
            <>
              {' '}
              <a
                href={privacyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold"
                style={{ color: 'var(--color-brand)' }}
              >
                Política de privacidade
              </a>
            </>
          )}
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleDecline}
            className="text-xs px-3 py-1.5 rounded-lg border font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text-lo)' }}
          >
            Recusar
          </button>
          <button
            onClick={handleAccept}
            className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  )
}

/** Inicializa analytics se já houver consentimento (visitas posteriores) */
export function initAnalyticsIfConsented(branch: Record<string, unknown> | null): void {
  if (!isGranted()) return
  initAnalytics({
    branchPixelId: (branch?.['settingsWeb'] as Record<string,unknown>|undefined)?.['metaPixelId'] as string|undefined,
    branchGaId: (branch?.['settingsWeb'] as Record<string,unknown>|undefined)?.['gaId'] as string|undefined,
    platformPixelId: import.meta.env.VITE_META_PIXEL_ID as string | undefined,
    platformGaId: import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined,
  })
}

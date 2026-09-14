import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { useCartStore } from '../store/cartStore'
import { getGoogleClientId, renderGoogleButton } from '../lib/googleSignIn'
import { toast } from '../store/toastStore'

/**
 * Botão "Continuar com o Google" — preenche nome e e-mail.
 *
 * Só aparece com `VITE_GOOGLE_CLIENT_ID` no build **e**
 * `settingsWeb.googleSignInEnabled` na branch. Se o script não carregar
 * (rede do restaurante bloqueando, cliente offline), o componente some sem
 * ruído: é conveniência, não caminho obrigatório.
 */
export default function GoogleSignInButton() {
  const { branch } = useAppStore()
  const { setClientName, setClientEmail } = useCartStore()
  const ref = useRef<HTMLDivElement | null>(null)
  const [failed, setFailed] = useState(false)

  const enabled =
    branch?.settingsWeb?.googleSignInEnabled === true && getGoogleClientId() !== null

  useEffect(() => {
    if (!enabled || !ref.current) return
    let alive = true
    renderGoogleButton(
      ref.current,
      (profile) => {
        if (!alive) return
        if (profile.name) setClientName(profile.name)
        if (profile.email) setClientEmail(profile.email)
        toast.success('Nome e e-mail preenchidos. Falta só o telefone.')
      },
      () => alive && setFailed(true),
    ).catch(() => alive && setFailed(true))
    return () => { alive = false }
  }, [enabled])

  if (!enabled || failed) return null

  return (
    <div className="flex flex-col gap-1.5">
      <div ref={ref} className="flex justify-center" />
      {/* O Google não entrega telefone. Dizer isso antes evita o cliente achar
          que o login resolveu tudo e travar no botão de enviar. */}
      <p className="text-xs text-center" style={{ color: 'var(--text-lo)' }}>
        Preenche nome e e-mail. O telefone você digita.
      </p>
    </div>
  )
}

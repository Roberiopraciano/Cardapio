/**
 * Google Sign-In — preenchimento de nome e e-mail.
 *
 * ⚠️ **O Google não devolve telefone.** Os escopos `profile` e `email` do
 * Google Identity Services entregam nome, e-mail e foto, e não existe escopo
 * de telefone. O campo `phoneNumbers` da People API exige o escopo `contacts`,
 * classificado como sensível — precisa de verificação anual do app e
 * justificativa de uso. Para um cardápio digital isso não passa na revisão.
 *
 * Resultado prático: o botão economiza dois campos, o telefone continua
 * digitado. A UI precisa deixar isso claro em vez de prometer login mágico.
 *
 * Configuração: `VITE_GOOGLE_CLIENT_ID` no `.env` **e**
 * `settingsWeb.googleSignInEnabled` na branch. Faltando qualquer um, o botão
 * não aparece.
 */

const SCRIPT_ID = 'google-identity-services'
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

export interface GoogleProfile {
  name: string
  email: string
  picture?: string
}

interface CredentialResponse {
  credential?: string
}

interface GoogleAccounts {
  id: {
    initialize: (config: {
      client_id: string
      callback: (res: CredentialResponse) => void
      auto_select?: boolean
      cancel_on_tap_outside?: boolean
    }) => void
    renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
    prompt: () => void
    disableAutoSelect: () => void
  }
}

function getGoogle(): GoogleAccounts | null {
  const g = (window as unknown as { google?: { accounts?: GoogleAccounts } }).google
  return g?.accounts ? (g.accounts as GoogleAccounts) : null
}

export function getGoogleClientId(): string | null {
  const id = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim()
  return id || null
}

/** Carrega o SDK uma vez. Rejeita se a rede bloquear — o botão some, sem quebrar. */
export function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (getGoogle()) return resolve()

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('gsi load error')))
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('gsi load error'))
    document.head.appendChild(script)
  })
}

/**
 * Lê o JWT do Google sem validar assinatura.
 *
 * Aqui isso é aceitável **porque o token não autentica nada**: só preenche dois
 * campos de formulário no próprio aparelho. Nenhuma decisão de servidor depende
 * dele. Se um dia o backend passar a confiar nessa identidade, o `credential`
 * cru precisa ir para o Laravel e ser validado lá — nunca no cliente.
 */
function decodeIdToken(jwt: string): GoogleProfile | null {
  try {
    const payload = jwt.split('.')[1]
    if (!payload) return null
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const data = JSON.parse(decodeURIComponent(escape(json))) as {
      name?: string
      email?: string
      picture?: string
    }
    if (!data.email) return null
    return {
      name: (data.name ?? '').trim(),
      email: data.email.trim(),
      picture: data.picture,
    }
  } catch {
    return null
  }
}

/**
 * Renderiza o botão oficial do Google no elemento dado.
 * @returns função de limpeza
 */
export async function renderGoogleButton(
  target: HTMLElement,
  onProfile: (p: GoogleProfile) => void,
  onError?: () => void,
): Promise<void> {
  const clientId = getGoogleClientId()
  if (!clientId) return

  await loadGoogleScript()
  const accounts = getGoogle()
  if (!accounts) {
    onError?.()
    return
  }

  accounts.id.initialize({
    client_id: clientId,
    callback: (res) => {
      const profile = res.credential ? decodeIdToken(res.credential) : null
      if (profile) onProfile(profile)
      else onError?.()
    },
    // Sem auto-select: cardápio é dispositivo compartilhado por natureza —
    // a mesa é usada por outra pessoa meia hora depois.
    auto_select: false,
    cancel_on_tap_outside: true,
  })

  accounts.id.renderButton(target, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'pill',
    logo_alignment: 'center',
    width: target.clientWidth || 320,
  })
}

/** Esquece a conta escolhida — chamado ao apagar os dados no perfil. */
export function forgetGoogleAccount(): void {
  getGoogle()?.id.disableAutoSelect()
}

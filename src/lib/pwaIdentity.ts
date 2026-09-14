/**
 * Identidade do cardápio por company — nome, ícone e cor do PWA.
 *
 * O mesmo servidor atende várias empresas. Quem escaneia o QR da Bebelu precisa
 * instalar "Bebelu", com o ícone da Bebelu; quem escaneia o da 4 Estylos,
 * "4 Estylos". Um PWA genérico chamado "Cardápio Digital" na tela inicial não
 * diz nada ao cliente e ele desinstala.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE FUNCIONA EM CADA PLATAFORMA
 *
 * **iOS / Safari** — ignora o manifest para instalação. Usa:
 *   · `<link rel="apple-touch-icon">`        → ícone
 *   · `<meta name="apple-mobile-web-app-title">` → nome
 *   Ambos trocáveis em runtime. **Funciona bem.**
 *
 * **Android / Chrome** — usa o manifest. Trocá-lo em runtime por `blob:` é
 *   técnica conhecida e funciona no Chrome, mas é frágil: depende de o browser
 *   reler o `<link rel="manifest">` antes de o usuário mandar instalar, e não é
 *   garantido por especificação.
 *
 *   ► **O caminho robusto é servir um manifest estático por company**, numa URL
 *     própria (subdomínio ou caminho). Ver CONFIGURACAO.md → "Um PWA por
 *     empresa". A injeção em runtime aqui é a rede de segurança para quando a
 *     URL ainda é compartilhada.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface MenuIdentity {
  /** Nome exibido: título da aba, PWA instalado, tela inicial */
  name: string
  /** Nome curto (12 caracteres é o que cabe embaixo do ícone) */
  shortName?: string
  description?: string
  icon192?: string
  icon512?: string
  appleTouchIcon?: string
  themeColor?: string
  backgroundColor?: string
}

const DEFAULTS = {
  name: 'Cardápio Digital',
  shortName: 'Cardápio',
  description: 'Cardápio digital — peça na mesa ou no balcão',
  icon192: '/icon-192.png',
  icon512: '/icon-512.png',
  appleTouchIcon: '/apple-touch-icon.png',
  themeColor: '#1D9E75',
  backgroundColor: '#ffffff',
}

function setMeta(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.name = name
    document.head.appendChild(el)
  }
  el.content = content
}

function setLink(rel: string, href: string, extra?: Record<string, string>) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
  for (const [k, v] of Object.entries(extra ?? {})) el.setAttribute(k, v)
}

/** URL do blob do manifest anterior, para revogar e não vazar memória. */
let currentManifestUrl: string | null = null

/**
 * Monta um manifest com a identidade da empresa e o injeta.
 *
 * `start_url` preserva os parâmetros atuais (`branch`, `table`, `mode`): assim,
 * quem instalar estando na mesa 3 abre de novo já na mesa 3, em vez de cair na
 * tela de QR inválido.
 */
function injectManifest(id: Required<MenuIdentity>) {
  try {
    const startUrl = window.location.pathname + window.location.search

    const manifest = {
      id: startUrl,
      name: id.name,
      short_name: id.shortName,
      description: id.description,
      lang: 'pt-BR',
      dir: 'ltr',
      display: 'standalone',
      orientation: 'portrait',
      scope: '/',
      start_url: startUrl,
      theme_color: id.themeColor,
      background_color: id.backgroundColor,
      categories: ['food', 'shopping'],
      icons: [
        { src: id.icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: id.icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: id.icon512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    }

    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' })
    const url = URL.createObjectURL(blob)

    if (currentManifestUrl) URL.revokeObjectURL(currentManifestUrl)
    currentManifestUrl = url

    setLink('manifest', url)
  } catch {
    // Blob indisponível ou CSP bloqueando: fica o manifest estático do build.
    // Perde-se o nome por empresa, o app continua funcionando.
  }
}

/**
 * Aplica a identidade da empresa na página.
 *
 * @param identity vindo de `company.settingsTotem` / `branch.settingsWeb`
 */
export function applyMenuIdentity(identity: MenuIdentity): void {
  const id: Required<MenuIdentity> = {
    name: identity.name?.trim() || DEFAULTS.name,
    shortName: identity.shortName?.trim() || identity.name?.trim()?.slice(0, 12) || DEFAULTS.shortName,
    description: identity.description?.trim() || DEFAULTS.description,
    icon192: identity.icon192?.trim() || DEFAULTS.icon192,
    icon512: identity.icon512?.trim() || DEFAULTS.icon512,
    appleTouchIcon: identity.appleTouchIcon?.trim() || identity.icon192?.trim() || DEFAULTS.appleTouchIcon,
    themeColor: identity.themeColor?.trim() || DEFAULTS.themeColor,
    backgroundColor: identity.backgroundColor?.trim() || DEFAULTS.backgroundColor,
  }

  document.title = id.name

  // iOS: estes dois são o que o Safari usa em "Adicionar à Tela de Início"
  setMeta('apple-mobile-web-app-title', id.shortName)
  setMeta('application-name', id.shortName)
  setLink('apple-touch-icon', id.appleTouchIcon)

  setMeta('theme-color', id.themeColor)
  setMeta('description', id.description)
  setLink('icon', id.icon192, { type: 'image/png' })

  // Android/Chrome
  injectManifest(id)
}

/** Lê a identidade de `company.settingsTotem` + `branch.settingsWeb`. */
export function readMenuIdentity(
  companySettings: Record<string, unknown> | undefined,
  branchSettings: Record<string, unknown> | undefined,
  fallbackName?: string,
): MenuIdentity {
  const pick = (key: string): string | undefined => {
    // Branch ganha da company: uma unidade pode ter nome próprio
    // ("Bebelu Shopping"), e a company é o padrão para as demais.
    const b = branchSettings?.[key]
    if (typeof b === 'string' && b.trim()) return b
    const c = companySettings?.[key]
    if (typeof c === 'string' && c.trim()) return c
    return undefined
  }

  return {
    name: pick('menuName') ?? pick('pwaName') ?? fallbackName ?? '',
    shortName: pick('menuShortName') ?? pick('pwaShortName'),
    description: pick('menuDescription'),
    icon192: pick('pwaIcon192') ?? pick('logo'),
    icon512: pick('pwaIcon512') ?? pick('logo'),
    appleTouchIcon: pick('pwaIconApple') ?? pick('logo'),
    themeColor: pick('primaryColor'),
    backgroundColor: pick('backgroundColor'),
  }
}

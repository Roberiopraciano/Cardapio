/**
 * Aplica as cores da empresa como CSS custom properties.
 * Fonte: company.settingsTotem
 *
 * - Cor de marca → --color-brand (botões, tabs ativas, badges, contadores)
 * - Cor de fundo → --bg-page / --bg-card, com texto recalculado para contraste
 */

const DEFAULT_BRAND = '#1D9E75'

/** O painel Laravel já gravou essa cor com nomes diferentes ao longo do tempo. */
const BRAND_KEYS = [
  'primaryColor', 'primarycolor', 'primary_color', 'primary',
  'brandColor', 'color', 'corPrimaria',
]

/**
 * Só nomes que *inequivocamente* significam fundo de página.
 *
 * `secondaryColor` esteve aqui e foi um erro: cor secundária é acento de marca,
 * não fundo. Onde a empresa tinha uma secundária escura, o cardápio inteiro
 * ficava escuro. Na dúvida sobre um campo, é melhor ignorá-lo e manter o tema
 * padrão do que pintar a tela toda com um palpite.
 */
const BACKGROUND_KEYS = [
  'backgroundColor', 'backgroundcolor', 'background_color',
  'bgColor', 'corFundo',
]

type Settings = Record<string, unknown> | undefined | null

function pickColor(settings: Settings, keys: string[]): string | null {
  if (!settings) return null
  for (const key of keys) {
    const raw = settings[key]
    if (typeof raw === 'string' && raw.trim()) {
      const normalized = normalizeColor(raw.trim())
      if (normalized) return normalized
    }
  }
  return null
}

/** Aceita "1D9E75", "#1d9e75", "#1a7" e devolve sempre "#rrggbb". */
export function normalizeColor(input: string): string | null {
  const v = input.trim()
  const hex = v.startsWith('#') ? v.slice(1) : v
  if (/^[a-f\d]{3}$/i.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
  }
  if (/^[a-f\d]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`
  // rgb()/hsl()/nome CSS: passa direto, o browser resolve
  if (/^(rgb|hsl)a?\(/i.test(v)) return v
  return null
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeColor(hex)
  if (!normalized || !normalized.startsWith('#')) return null
  const result = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized)
  if (!result) return null
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  }
}

/** Variante translúcida. Concatenar "22" no hex só funciona com 6 dígitos —
 *  quebrava silenciosamente com hex de 3 ou com rgb(). */
function withAlpha(color: string, alpha: number): string {
  const rgb = hexToRgb(color)
  return rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})` : color
}

function luminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 1
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
}

/** Retorna branco ou preto dependendo do contraste com a cor de fundo */
export function contrastColor(hex: string): string {
  return luminance(hex) > 0.5 ? '#1a1a1a' : '#ffffff'
}

/** Clareia ou escurece um hex em `amount` (0..1) — usado para derivar o card
 *  a partir do fundo, para que os dois não fiquem exatamente iguais. */
function shift(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const target = luminance(hex) > 0.5 ? 0 : 255
  const mix = (c: number) => Math.round(c + (target - c) * amount)
  return `rgb(${mix(rgb.r)},${mix(rgb.g)},${mix(rgb.b)})`
}

/**
 * @param settings  company.settingsTotem inteiro (não só a primaryColor) — assim
 *                  a função consegue procurar a cor sob os vários nomes que o
 *                  painel já usou e também achar a cor de fundo.
 */
export function applyCompanyTheme(settings: Settings): void {
  const root = document.documentElement

  const brand = pickColor(settings, BRAND_KEYS) ?? DEFAULT_BRAND
  root.style.setProperty('--color-brand', brand)
  root.style.setProperty('--color-brand-light', withAlpha(brand, 0.13))
  root.style.setProperty('--color-brand-medium', withAlpha(brand, 0.27))

  const background = pickColor(settings, BACKGROUND_KEYS)
  if (background) {
    // Fundo da empresa manda; texto e cartão são derivados para não sumir
    const onBg = contrastColor(background)
    root.style.setProperty('--bg-page', background)
    root.style.setProperty('--bg-card', shift(background, 0.06))
    root.style.setProperty('--bg-input', shift(background, 0.12))
    root.style.setProperty('--text-hi', onBg)
    root.style.setProperty('--text-lo', withAlpha(onBg, 0.6))
    root.style.setProperty('--border', withAlpha(onBg, 0.12))
    root.style.setProperty('--divider', withAlpha(onBg, 0.08))
    root.style.setProperty('color-scheme', luminance(background) > 0.5 ? 'light' : 'dark')
  }

  if (import.meta.env.DEV) {
    console.info('[tema] marca:', brand, '| fundo:', background ?? '(padrão do app)',
      '| settingsTotem:', settings)
  }
}

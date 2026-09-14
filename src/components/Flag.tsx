import type { Lang } from '../lib/i18n'

/**
 * Bandeiras em SVG inline.
 *
 * Emoji de bandeira (🇧🇷) **não renderiza no Windows** — o sistema não traz a
 * fonte com esses glifos e mostra as duas letras do código no lugar. Como o
 * painel e os testes rodam em Windows, e parte dos clientes usa navegador de
 * desktop, o SVG é o único jeito de a bandeira aparecer em todo lugar.
 */

interface Props {
  lang: Lang
  size?: number
  className?: string
}

export default function Flag({ lang, size = 18, className }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    className,
    'aria-hidden': true as const,
    style: { borderRadius: '50%', display: 'block', flexShrink: 0 },
  }

  if (lang === 'pt') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="12" fill="#009B3A" />
        <path d="M12 4.2 20.4 12 12 19.8 3.6 12z" fill="#FEDF00" />
        <circle cx="12" cy="12" r="3.6" fill="#002776" />
        <path d="M8.7 10.6a6 6 0 0 1 6.7 1.6" stroke="#fff" strokeWidth=".9" fill="none" />
      </svg>
    )
  }

  if (lang === 'es') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="12" fill="#C60B1E" />
        <path d="M0 8h24v8H0z" fill="#FFC400" />
      </svg>
    )
  }

  // en → bandeira dos EUA
  return (
    <svg {...common}>
      <defs>
        <clipPath id="flag-us-clip">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#flag-us-clip)">
        <rect width="24" height="24" fill="#fff" />
        {[0, 2, 4, 6, 8, 10].map((i) => (
          <rect key={i} y={i * 2 + 0.85} width="24" height="1.85" fill="#B22234" />
        ))}
        <rect width="11" height="13" fill="#3C3B6E" />
        {[2, 5, 8, 11].map((y) =>
          [1.6, 4.4, 7.2, 10].map((x) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r=".8" fill="#fff" />
          )),
        )}
      </g>
    </svg>
  )
}

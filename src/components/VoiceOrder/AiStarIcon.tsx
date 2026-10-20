interface Props {
  /** Tamanho em px (largura e altura). */
  size?: number
}

/**
 * Estrela de faíscas que simboliza a IA: uma estrela de quatro pontas grande e uma pequena ao lado.
 * Herda a cor do texto (`currentColor`), então acompanha a cor da marca do botão onde estiver.
 */
export default function AiStarIcon({ size = 24 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M10 3c.7 4.6 3.4 7.3 8 8-4.6.7-7.3 3.4-8 8-.7-4.6-3.4-7.3-8-8 4.6-.7 7.3-3.4 8-8Z" />
      <path d="M19 1.5c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3Z" />
    </svg>
  )
}

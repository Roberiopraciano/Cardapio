import Icon from './Icon'
import type { IconName } from './Icon'

interface Props {
  icon: IconName
  onClick: () => void
  label: string
  /** Destaca com a cor da marca — usado em voltar e atualizar, que somem
   *  quando ficam cinza-claro sobre fundo branco. */
  emphasis?: boolean
  disabled?: boolean
  spin?: boolean
  /** Sobre foto: mesmas cores, só ganha sombra para destacar do fundo. */
  overlay?: boolean
}

/**
 * Botão circular de cabeçalho.
 *
 * A versão anterior usava `var(--text-lo)` sobre `var(--bg-input)` — dois tons
 * de cinza quase iguais no tema claro. A seta de voltar sumia e o cliente ficava
 * sem saber como sair da tela.
 */
export default function HeaderButton({
  icon, onClick, label, emphasis, disabled, spin, overlay,
}: Props) {
  const palette = emphasis
    ? {
        background: 'var(--color-brand-light)',
        borderColor: 'var(--color-brand-medium)',
        color: 'var(--color-brand)',
      }
    : {
        background: 'var(--bg-input)',
        borderColor: 'var(--border)',
        color: 'var(--text-hi)',
      }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border active:scale-90 transition-transform disabled:opacity-40"
      style={{
        ...palette,
        // Sobre a foto do produto a pastilha some no fundo claro da imagem;
        // a sombra recorta sem mudar a cor, para o botão continuar idêntico
        // ao das outras telas.
        ...(overlay
          ? {
              background: 'var(--bg-card)',
              boxShadow: '0 2px 12px rgba(0,0,0,.28)',
            }
          : {}),
      }}
    >
      <Icon name={icon} size={17} spin={spin} />
    </button>
  )
}

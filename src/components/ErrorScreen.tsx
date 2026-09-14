import ScanScreen from './ScanScreen'
import Icon from './Icon'
import type { IconName } from './Icon'

/**
 * Cada motivo tem uma saída diferente, e é isso que define a tela:
 *
 * - `noBranch` / `badLink` / `notFound` → o link é o problema, só reescanear resolve
 * - `network`  → pode ser passageiro, então oferece "tentar novamente"
 * - `server`   → nada que o cliente faça resolve, então manda chamar atendente
 *
 * Misturar esses casos foi um bug real: link de QR cortado aparecia como "sem
 * conexão com o cardápio", mandando o cliente conferir a internet dele para
 * consertar um problema que estava no QR Code da mesa.
 */
export type BootErrorKind = 'noBranch' | 'badLink' | 'network' | 'notFound' | 'server'

interface Copy {
  icon: IconName
  title: string
  text: string
  retry: boolean
  /** Oferece reescanear — só faz sentido quando o problema é o QR/link */
  scan: boolean
}

const COPY: Record<BootErrorKind, Copy> = {
  noBranch: {
    icon: 'qrcode',
    title: 'QR Code inválido',
    text: 'Este link não identifica nenhum restaurante. Escaneie novamente o QR Code da mesa ou do balcão.',
    retry: false,
    scan: true,
  },
  badLink: {
    icon: 'qrcode',
    title: 'Link incompleto',
    text: 'Este endereço parece cortado e não abre nenhum cardápio. Escaneie o QR Code da mesa ou do balcão.',
    retry: false,
    scan: true,
  },
  notFound: {
    icon: 'search',
    title: 'Cardápio não encontrado',
    text: 'Não localizamos esta unidade. Confira o QR Code ou chame um atendente.',
    retry: false,
    scan: true,
  },
  network: {
    icon: 'offline',
    title: 'Sem conexão com o cardápio',
    text: 'Verifique sua internet e tente novamente. Se persistir, chame um atendente.',
    retry: true,
    scan: false,
  },
  server: {
    icon: 'warning',
    title: 'Cardápio indisponível',
    // Não pede para conferir a internet: o celular chegou ao servidor, quem
    // falhou foi o outro lado. Repetir pode funcionar, mas quem resolve é a casa.
    text: 'O sistema do restaurante não respondeu agora. Tente de novo em instantes ou chame um atendente.',
    retry: true,
    scan: false,
  },
}

export default function ErrorScreen({ kind }: { kind: BootErrorKind }) {
  const c = COPY[kind]

  // Sem branch válida não existe caminho adiante além de reescanear — então a
  // leitura vira a tela inteira, em vez de um botão dentro de uma mensagem.
  if (c.scan) return <ScanScreen title={c.title} text={c.text} />

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 text-center"
      style={{ background: 'var(--bg-page)' }}>
      <span className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: 'var(--bg-input)' }}>
        <Icon name={c.icon} size={32} color="var(--text-lo)" />
      </span>
      <h1 className="text-lg font-bold" style={{ color: 'var(--text-hi)' }}>{c.title}</h1>
      <p className="text-sm max-w-xs" style={{ color: 'var(--text-lo)' }}>{c.text}</p>
      {c.retry && (
        <button onClick={() => window.location.reload()}
          className="mt-2 px-6 py-3 rounded-xl text-white font-semibold text-sm"
          style={{ backgroundColor: 'var(--color-brand)' }}>
          Tentar novamente
        </button>
      )}
    </div>
  )
}

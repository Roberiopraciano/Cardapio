import { useEffect, useState } from 'react'
import QrScanner, { SCAN_MESSAGE } from './QrScanner'
import type { ScanState } from './QrScanner'
import Icon from './Icon'

interface Props {
  title: string
  text: string
}

/**
 * Tela de leitura de QR Code.
 *
 * É para onde o app manda quem chegou sem `?branch=` ou com uma branch que não
 * existe. Nesses casos o cliente não tem **nenhum** caminho adiante além de
 * reescanear, então a leitura é a tela inteira, não um botão perdido numa
 * mensagem de erro.
 *
 * A câmera abre sozinha na montagem. Se o navegador exigir toque — iOS costuma
 * exigir — o scanner fecha e sobra o botão, com texto neutro: dizer "libere a
 * permissão" quando o usuário só precisa tocar seria mandá-lo mexer nas
 * configurações à toa.
 */
export default function ScanScreen({ title, text }: Props) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<ScanState>('idle')
  const [autoTried, setAutoTried] = useState(false)

  // Tenta abrir a câmera imediatamente
  useEffect(() => {
    setOpen(true)
    setAutoTried(true)
  }, [])

  /** Depois da tentativa automática, `denied` pode significar só "falta toque". */
  const message =
    state === 'denied' && autoTried
      ? 'Toque no botão para abrir a câmera. Se já negou o acesso antes, libere a permissão nas configurações do navegador.'
      : SCAN_MESSAGE[state]

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-8 text-center"
      style={{ background: 'var(--bg-page)' }}>

      <span className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: 'var(--color-brand-light)' }}>
        <Icon name="qrcode" size={32} color="var(--color-brand)" />
      </span>

      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-hi)' }}>{title}</h1>
        <p className="text-sm mt-1.5 max-w-xs" style={{ color: 'var(--text-lo)' }}>{text}</p>
      </div>

      <button
        onClick={() => { setState('idle'); setOpen(true) }}
        className="px-6 py-3.5 rounded-xl text-white font-semibold text-sm active:scale-[0.98] transition-transform flex items-center gap-2"
        style={{ backgroundColor: 'var(--color-brand)' }}
      >
        <Icon name="camera" size={14} /> Abrir câmera e escanear
      </button>

      {message && (
        <p className="text-xs max-w-xs"
          style={{ color: state === 'foreign' ? '#dc2626' : 'var(--text-lo)' }}>
          {message}
        </p>
      )}

      <p className="text-xs max-w-xs" style={{ color: 'var(--text-lo)' }}>
        Também dá para usar o app de Câmera do celular e apontar para o QR Code
        colado na mesa.
      </p>

      <QrScanner open={open} onClose={() => setOpen(false)} onState={setState} />
    </div>
  )
}

import { useState } from 'react'
import QrScanner, { SCAN_MESSAGE } from './QrScanner'
import type { ScanState } from './QrScanner'
import Icon from './Icon'

/**
 * Botão "abrir câmera e escanear" — usado na tela de QR inválido.
 *
 * A leitura em si mora em `QrScanner`, que é controlado e pode ser acionado de
 * qualquer tela (perfil, conta). Aqui é só o gatilho + a mensagem de erro.
 */
export default function QrScanButton() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<ScanState>('idle')

  const message = SCAN_MESSAGE[state]

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={() => { setState('idle'); setOpen(true) }}
        className="px-6 py-3 rounded-xl text-white font-semibold text-sm active:scale-[0.98] transition-transform flex items-center gap-2"
        style={{ backgroundColor: 'var(--color-brand)' }}
      >
        <Icon name="camera" size={14} /> Abrir câmera e escanear
      </button>

      {message && (
        <p className="text-xs max-w-xs text-center"
          style={{ color: state === 'foreign' ? '#dc2626' : 'var(--text-lo)' }}>
          {message}
        </p>
      )}

      <QrScanner open={open} onClose={() => setOpen(false)} onState={setState} />
    </div>
  )
}

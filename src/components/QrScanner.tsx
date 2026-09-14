import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import jsQR from 'jsqr'
import { parseQrParams } from '../lib/qrParams'
import Icon from './Icon'

/**
 * Leitor de QR Code em tela cheia.
 *
 * Dois decodificadores, nessa ordem:
 *
 * 1. `BarcodeDetector` nativo — Chrome/Edge Android. Decodifica no processo do
 *    browser, mais rápido e sem custo de bundle.
 * 2. `jsQR` — fallback em JavaScript. Existe porque o Safari do iOS **não**
 *    implementa `BarcodeDetector`, e sem ele metade dos clientes ficaria sem
 *    conseguir reescanear.
 *
 * Controlado pelo pai (`open` / `onClose`) para poder ser acionado de qualquer
 * tela — tela de erro, perfil, conta.
 */

type NativeDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => NativeDetector

function getNativeCtor(): BarcodeDetectorCtor | null {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  return typeof ctor === 'function' ? ctor : null
}

export type ScanState =
  | 'idle' | 'starting' | 'scanning' | 'denied' | 'foreign' | 'unsupported'
  /** QR deste cardápio, mas com parâmetros que não formam um link válido. */
  | 'invalid'

interface Props {
  open: boolean
  onClose: () => void
  /** Reportado ao pai para ele exibir a mensagem no lugar certo. */
  onState?: (s: ScanState) => void
}

export default function QrScanner({ open, onClose, onState }: Props) {
  const [state, setState] = useState<ScanState>('idle')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | undefined>(undefined)
  const nativeRef = useRef<NativeDetector | null>(null)
  /**
   * O loop de leitura, para quem está fora do efeito poder retomá-lo.
   *
   * Necessário porque ler um QR que não serve (outro domínio, link torto) não é
   * motivo para desligar a câmera: o cliente ainda vai apontar para o QR certo.
   */
  const tickRef = useRef<(() => void) | null>(null)

  const report = (s: ScanState) => { setState(s); onState?.(s) }

  const stop = () => {
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    rafRef.current = undefined
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    nativeRef.current = null
  }

  // Libera a câmera ao desmontar ou ao fechar
  useEffect(() => {
    if (!open) { stop(); return }

    let alive = true
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) { report('unsupported'); onClose(); return }
      report('starting')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        })
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream

        const Native = getNativeCtor()
        nativeRef.current = Native ? new Native({ formats: ['qr_code'] }) : null
        report('scanning')

        requestAnimationFrame(async () => {
          const video = videoRef.current
          if (!video || !alive) return
          video.srcObject = stream
          // `playsInline` é obrigatório no iOS: sem ele o vídeo abre em tela
          // cheia nativa e o overlay do scanner some
          await video.play().catch(() => {})
          rafRef.current = requestAnimationFrame(tick)
        })
      } catch {
        // Fecha ao falhar para o pai poder mostrar a mensagem e o botão de
        // tentar de novo — ficar num overlay preto sem câmera não ajuda ninguém
        report('denied')
        stop()
        onClose()
      }
    }

    const tick = async () => {
      if (!videoRef.current || !streamRef.current || !alive) return
      const value = await readFrame(videoRef.current)
      if (value) { handleValue(value); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    tickRef.current = () => { rafRef.current = requestAnimationFrame(tick) }

    start()
    return () => { alive = false; tickRef.current = null; stop() }
  }, [open])

  /** Volta a ler depois de um QR que não serve, sem fechar a câmera. */
  const resume = () => { tickRef.current?.() }

  const readFrame = async (video: HTMLVideoElement): Promise<string | null> => {
    if (nativeRef.current) {
      try {
        const found = await nativeRef.current.detect(video)
        return found.find((f) => f.rawValue)?.rawValue ?? null
      } catch {
        return null
      }
    }

    const canvas = canvasRef.current
    if (!canvas || !video.videoWidth) return null
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null

    // Downscale: o QR não precisa de resolução cheia e o jsQR roda por frame.
    // Em celular antigo, decodificar 1080p a cada frame trava a interface.
    const scale = Math.min(1, 640 / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return jsQR(data.data, data.width, data.height, { inversionAttempts: 'dontInvert' })?.data ?? null
  }

  const handleValue = (raw: string) => {
    let url: URL
    try {
      url = new URL(raw, window.location.origin)
    } catch {
      // QR que não é endereço nenhum (Wi-Fi, vCard, texto). Continua lendo.
      resume()
      return
    }

    // Só navega para o próprio cardápio. Um QR pode codificar qualquer endereço,
    // e mandar o cliente para um domínio estranho a partir de um scan é
    // exatamente o vetor que golpe de QR usa.
    if (url.origin !== window.location.origin) {
      stop()
      report('foreign')
      onClose()
      return
    }

    // Valida os parâmetros antes de navegar. Sem isso, ler um QR torto recarregava
    // a página só para cair na tela de erro — e de lá o cliente voltava a escanear
    // o mesmo QR torto, em círculo. Rejeitar aqui mantém a câmera aberta.
    const parsed = parseQrParams(url.search)
    if (!parsed.ok) {
      console.error('QR Code inválido:', parsed.reason)
      report('invalid')
      resume()
      return
    }

    stop()
    // Recarrega a página inteira: mudar de mesa troca branch, cardápio, carrinho
    // e códigos. Navegação de rota deixaria estado da mesa anterior vivo.
    window.location.href = url.toString()
  }

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 px-6"
      style={{ background: 'rgba(0,0,0,.94)' }}
    >
      <p className="text-white text-sm">
        {state === 'starting' ? 'Abrindo a câmera…' : 'Aponte para o QR Code da mesa'}
      </p>

      <div className="relative w-full max-w-xs aspect-square rounded-2xl overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
        <div className="absolute inset-6 rounded-xl pointer-events-none"
          style={{ border: '3px solid var(--color-brand)' }} />
      </div>

      {/* Buffer do jsQR — nunca visível */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <button
        onClick={() => { stop(); onClose() }}
        className="px-6 py-3 rounded-xl text-sm font-semibold text-white flex items-center gap-2"
        style={{ background: 'rgba(255,255,255,.16)' }}
      >
        <Icon name="close" size={13} /> Cancelar
      </button>
    </div>,
    document.body,
  )
}

export const SCAN_MESSAGE: Partial<Record<ScanState, string>> = {
  denied: 'Não foi possível abrir a câmera. Libere a permissão nas configurações do navegador e toque novamente.',
  unsupported: 'Este navegador não dá acesso à câmera. Abra o cardápio pelo Chrome ou Safari.',
  foreign: 'Esse QR Code não é de uma mesa deste cardápio.',
  invalid: 'Esse QR Code está com o endereço incompleto. Tente outro, ou chame um atendente.',
}

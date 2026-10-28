import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_RECORDING_MS = 30_000
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

/**
 * Grava áudio do microfone, com limite de 30 s.
 *
 * `onAutoStop` recebe a gravação quando o limite é atingido, para o chamador enviar o que foi
 * dito em vez de descartar (o cliente não precisa regravar por ter falado até o fim).
 */
export function useAudioRecorder(onAutoStop?: (audio: Blob) => void) {
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioContext = useRef<AudioContext | null>(null)
  const [recording, setRecording] = useState(false)
  const [expired, setExpired] = useState(false)
  // Mede o volume da voz para a onda na tela; sem Web Audio a gravação funciona do mesmo jeito.
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  const releaseAnalyser = useCallback(() => {
    void audioContext.current?.close().catch(() => undefined)
    audioContext.current = null
    setAnalyser(null)
  }, [])
  const autoStop = useRef(onAutoStop)
  useEffect(() => { autoStop.current = onAutoStop }, [onAutoStop])

  const stop = useCallback((): Promise<Blob> => new Promise((resolve, reject) => {
    const current = recorder.current
    if (!current || current.state === 'inactive') { reject(new Error('Gravação não iniciada')); return }
    const chunks: BlobPart[] = []
    current.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
    current.onerror = () => reject(new Error('Falha na gravação'))
    current.onstop = () => {
      stream.current?.getTracks().forEach(track => track.stop())
      stream.current = null
      recorder.current = null
      if (timer.current) clearTimeout(timer.current)
      releaseAnalyser()
      setRecording(false)
      resolve(new Blob(chunks, { type: current.mimeType }))
    }
    current.stop()
  }), [releaseAnalyser])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Microfone indisponível neste navegador')
    const media = await navigator.mediaDevices.getUserMedia({ audio: true })
    try {
      setExpired(false)
      const mimeType = MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type))
      if (!mimeType) throw new Error('Formato de áudio não suportado')
      const current = new MediaRecorder(media, { mimeType })
      stream.current = media
      recorder.current = current
      current.start()
      try {
        const context = new AudioContext()
        const node = context.createAnalyser()
        node.fftSize = 512
        context.createMediaStreamSource(media).connect(node)
        audioContext.current = context
        setAnalyser(node)
      } catch { /* sem onda, só grava */ }
      setRecording(true)
      timer.current = setTimeout(() => { if (current.state !== 'inactive') stop().then(audio => { setExpired(true); autoStop.current?.(audio) }).catch(() => setExpired(true)) }, MAX_RECORDING_MS)
    } catch (error) {
      media.getTracks().forEach(track => track.stop())
      throw error
    }
  }, [stop])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    if (recorder.current?.state === 'recording') recorder.current.stop()
    stream.current?.getTracks().forEach(track => track.stop())
    void audioContext.current?.close().catch(() => undefined)
  }, [])

  return { recording, expired, analyser, start, stop }
}

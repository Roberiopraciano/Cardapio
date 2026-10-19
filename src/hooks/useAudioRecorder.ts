import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_RECORDING_MS = 30_000
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export function useAudioRecorder() {
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [recording, setRecording] = useState(false)
  const [expired, setExpired] = useState(false)

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
      setRecording(false)
      resolve(new Blob(chunks, { type: current.mimeType }))
    }
    current.stop()
  }), [])

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
      setRecording(true)
      timer.current = setTimeout(() => { if (current.state !== 'inactive') stop().then(() => setExpired(true)).catch(() => setExpired(true)) }, MAX_RECORDING_MS)
    } catch (error) {
      media.getTracks().forEach(track => track.stop())
      throw error
    }
  }, [stop])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    if (recorder.current?.state === 'recording') recorder.current.stop()
    stream.current?.getTracks().forEach(track => track.stop())
  }, [])

  return { recording, expired, start, stop }
}

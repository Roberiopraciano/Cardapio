import { useCallback, useEffect, useState } from 'react'
import { fetchVoiceFiller, fetchVoiceSpeech, VOICE_FILLER_COUNT } from '../services/voiceOrderApi'
import { AssistantSpeaker, readSpeechPref, writeSpeechPref, type SpeechPref } from '../lib/assistantVoice'

/**
 * Voz do assistente na tela: um único tocador por painel, a preferência do cliente (lembrada no aparelho)
 * e as ações de falar/parar.
 */
export function useAssistantVoice(token: string, conversationId: string | null) {
  const [pref, setPref] = useState<SpeechPref>(readSpeechPref)
  const [speaking, setSpeaking] = useState(false)
  /** Rodada ("conversa:fala") cuja fala já começou, ou que não vai ter fala: a tela mostra as opções dela. */
  const [started, setStarted] = useState<string | null>(null)
  const [speaker] = useState(() => new AssistantSpeaker(typeof Audio === 'undefined' ? null : new Audio(), setSpeaking, setStarted))
  // Frases de espera já baixadas: da segunda vez em diante tocam na hora, sem esperar a rede
  const [fillers] = useState(() => new Map<number, Promise<Blob>>())

  useEffect(() => () => speaker.dispose(), [speaker])

  const unlock = useCallback(() => speaker.unlock(), [speaker])
  const speak = useCallback((speechId: number) => {
    if (!token || !conversationId) return
    void speaker.speak(() => fetchVoiceSpeech(token, conversationId, speechId), `${conversationId}:${speechId}`)
  }, [speaker, token, conversationId])
  /** Frase de espera número `turn` (gira pela lista do servidor), tocada enquanto a resposta fica pronta. */
  const filler = useCallback((turn: number) => {
    if (!token) return
    const index = turn % VOICE_FILLER_COUNT
    let audio = fillers.get(index)
    if (!audio) {
      audio = fetchVoiceFiller(token, index)
      audio.catch(() => fillers.delete(index))
      fillers.set(index, audio)
    }
    const ready = audio
    void speaker.filler(() => ready)
  }, [speaker, fillers, token])
  const stop = useCallback(() => speaker.stop(), [speaker])
  const choose = useCallback((on: boolean) => {
    writeSpeechPref(on ? 'on' : 'off')
    setPref(on ? 'on' : 'off')
    if (on) speaker.unlock()
    else speaker.stop()
  }, [speaker])

  return { pref, speaking, started, unlock, speak, filler, stop, choose }
}

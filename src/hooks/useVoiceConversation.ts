import { useCallback, useEffect, useRef, useState } from 'react'
import {
  replyVoiceConversation, startVoiceConversation, startVoiceSession,
  type VoiceAnswer, type VoiceConversation, type VoiceNote, type VoiceReview,
} from '../services/voiceOrderApi'
import { errorCode, typedAnswerTarget } from '../lib/voiceConversation'

/**
 * Estado da conversa de pedido (texto ou voz) com o servidor.
 *
 * O token da sessão fica só em memória (nunca em storage) e é pedido na primeira mensagem.
 * Se a sessão ou a conversa vencer, o erro vira `SESSION_EXPIRED` e o próximo envio já abre uma sessão nova.
 */
export function useVoiceConversation(branchId: string) {
  const [token, setToken] = useState('')
  const [conversation, setConversation] = useState<VoiceConversation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const retry = useRef<(() => Promise<void>) | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const run = useCallback(async (action: () => Promise<void>) => {
    retry.current = action
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (failure) {
      if (!alive.current) return
      const code = errorCode(failure)
      if (code === 'SESSION_EXPIRED') { setToken(''); setConversation(null) }
      setError(code)
    } finally {
      if (alive.current) setBusy(false)
    }
  }, [])

  const ensureToken = useCallback(async () => {
    if (token) return token
    const fresh = await startVoiceSession(branchId)
    if (alive.current) setToken(fresh)
    return fresh
  }, [branchId, token])

  /** Primeira mensagem: o pedido digitado ou o áudio gravado. */
  const start = useCallback((input: { text: string } | { audio: Blob }) => run(async () => {
    const session = await ensureToken()
    const result = await startVoiceConversation(session, input)
    if (alive.current) setConversation(result)
  }), [run, ensureToken])

  /** Responde às perguntas da tela (toques) e/ou acrescenta uma mensagem livre. */
  const reply = useCallback((answers: VoiceAnswer[], text = '') => run(async () => {
    if (!conversation) return
    const result = await replyVoiceConversation(token, conversation.conversation_id, { answers, text })
    if (alive.current) setConversation(result)
  }), [run, conversation, token])

  /** Texto digitado depois da primeira mensagem: com uma só pergunta na tela, é a resposta dela. */
  const say = useCallback((text: string) => {
    const target = conversation ? typedAnswerTarget(conversation.questions) : null
    return target ? reply([{ question_id: target.id, text }]) : reply([], text)
  }, [conversation, reply])

  /** Observação de preparo nos itens do resumo: o servidor aplica direto, sem a IA e sem gastar rodada. */
  const note = useCallback((notes: VoiceNote[]) => run(async () => {
    if (!conversation) return
    const result = await replyVoiceConversation(token, conversation.conversation_id, { notes })
    if (alive.current) setConversation(result)
  }), [run, conversation, token])

  const resend = useCallback(() => { const again = retry.current; return again ? run(again) : Promise.resolve() }, [run])

  /** Troca a revisão exibida (o servidor devolveu preços novos na confirmação). */
  const replaceReview = useCallback((review: VoiceReview) => {
    setConversation(current => current ? { ...current, review } : current)
  }, [])

  const reset = useCallback(() => { setConversation(null); setError(null); retry.current = null }, [])
  const fail = useCallback((code: string) => setError(code), [])

  return { token, conversation, busy, error, start, reply, say, note, resend, replaceReview, reset, fail }
}

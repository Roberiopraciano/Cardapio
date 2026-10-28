import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Product } from '../../types'
import { confirmVoiceReview, type VoiceItem, type VoiceQuestion, type VoiceReview } from '../../services/voiceOrderApi'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'
import { useVoiceConversation } from '../../hooks/useVoiceConversation'
import { useAssistantVoice } from '../../hooks/useAssistantVoice'
import { speechEnabled } from '../../lib/assistantVoice'
import {
  addToCartErrorCode, canContinue, choiceVisuals, errorMessage, exampleOrders, isRetryable, statusMessage, summaryTotal, thinkingSteps,
  toAnswers, visibleChat, visualIndex, voiceCardsEnabled, type ChoiceVisual, type Selection,
} from '../../lib/voiceConversation'
import ConfirmModal from '../ConfirmModal'
import Icon from '../Icon'
import OrderSummary from './OrderSummary'
import ProductChoiceCards from './ProductChoiceCards'
import QuestionCard from './QuestionCard'
import VoiceWave from './VoiceWave'
import VoiceOrderReviewModal from './VoiceOrderReviewModal'

interface Props {
  branchId: string
  /** Produtos do cardápio (para os exemplos e para o ajuste manual). */
  products: Product[]
  /** Põe os itens confirmados no carrinho. Lança se o cardápio local não bate com o que o servidor confirmou. */
  onAdd: (items: VoiceItem[]) => void
  onClose: () => void
}

const MAX_RECORDING_SECONDS = 30

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: string }) {
  const mine = role === 'user'
  return (
    <div className={`flex voice-rise ${mine ? 'justify-end' : 'justify-start'}`}>
      <p
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-line ${mine ? 'text-white rounded-br-md' : 'rounded-bl-md'}`}
        style={mine ? { background: 'var(--color-brand)' } : { background: 'var(--bg-input)', color: 'var(--text-hi)' }}
      >
        {children}
      </p>
    </div>
  )
}

const THINKING_INTERVAL_MS = 1800

/** Indicador de "pensando" com a mensagem trocando a cada poucos segundos (para na última). */
function Thinking({ steps }: { steps: string[] }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (step >= steps.length - 1) return
    const timer = setTimeout(() => setStep(current => current + 1), THINKING_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [step, steps.length])
  const label = steps[Math.min(step, steps.length - 1)]
  return (
    <div className="flex justify-start" role="status">
      <p className="flex items-center gap-2 rounded-2xl rounded-bl-md px-3.5 py-2 text-sm" style={{ background: 'var(--bg-input)', color: 'var(--text-lo)' }}>
        <span aria-hidden="true" className="flex gap-1">
          {[0, 1, 2].map(dot => <span key={dot} className="voice-dot inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-lo)' }} />)}
        </span>
        {label}
      </p>
    </div>
  )
}

/**
 * As perguntas da rodada. Com uma só pergunta, tocar na resposta já envia; com várias, o cliente
 * escolhe em cada cartão e toca em "Continuar". Remonta (zera as escolhas) a cada rodada nova.
 */
function QuestionStep({ questions, busy, visuals, onSubmit }: {
  questions: VoiceQuestion[]
  busy: boolean
  /** fotos do cardápio por id; null = modo cards desligado */
  visuals: Map<string, ChoiceVisual> | null
  onSubmit: (answers: ReturnType<typeof toAnswers>, outgoing: string) => void
}) {
  const [selection, setSelection] = useState<Selection>({})
  const single = questions.length === 1
  const choose = (question: VoiceQuestion, value: number | 'skip') => {
    if (single) {
      onSubmit(toAnswers([question], { [question.id]: value }), value === 'skip' ? 'Não, obrigado' : question.options[value])
    } else {
      setSelection(old => ({ ...old, [question.id]: value }))
    }
  }
  return (
    <div className="space-y-2">
      {questions.map(question => {
        const cards = visuals ? choiceVisuals(question, visuals) : null
        const props = {
          question,
          selected: selection[question.id],
          disabled: busy,
          onPick: (index: number) => choose(question, index),
          onSkip: () => choose(question, 'skip'),
        }
        return cards
          ? <ProductChoiceCards key={question.id} visuals={cards} {...props} />
          : <QuestionCard key={question.id} {...props} />
      })}
      {!single && (
        <button
          type="button"
          disabled={busy || !canContinue(questions, selection)}
          onClick={() => onSubmit(toAnswers(questions, selection), 'Continuar')}
          className="voice-focus w-full min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--color-brand)' }}
        >
          Continuar
        </button>
      )}
    </div>
  )
}

/**
 * Assistente de pedido do cardápio: o cliente fala ou escreve, o assistente monta o pedido, pergunta o que faltar
 * (por toque) e sugere opcionais no fim. O resumo e o preço vêm sempre do servidor; nada vai ao carrinho sem o
 * cliente tocar em "Adicionar ao carrinho".
 */
export default function VoiceOrderAssistant({ branchId, products, onAdd, onClose }: Props) {
  const talk = useVoiceConversation(branchId)
  const { conversation, busy, error, start, say, reply, note, resend, replaceReview, reset, fail, token } = talk
  const [draft, setDraft] = useState('')
  const [outgoing, setOutgoing] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [manual, setManual] = useState<VoiceReview | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [micSupported] = useState(() =>
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined')
  const [examples] = useState(() => exampleOrders(products))
  const [visuals] = useState(() => voiceCardsEnabled() ? visualIndex(products) : null)
  const panelRef = useRef<HTMLElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const startedAt = useRef(0)
  const [startedByVoice, setStartedByVoice] = useState(false)
  const voice = useAssistantVoice(token, conversation?.conversation_id ?? null)
  const { speak, filler, stop: stopSpeaking, unlock: unlockVoice } = voice
  /** Cada mensagem do cliente (fala, texto, toque) é uma vez nova: a IA diz uma frase de espera enquanto responde. */
  const [turn, setTurn] = useState(0)
  // O servidor manda speech_id (mesmo null) só quando a voz está ligada lá; sem isso, nem o botão de som aparece.
  const voiceAvailable = conversation !== null && conversation.speech_id !== undefined
  const voiceOn = speechEnabled(voice.pref, startedByVoice)

  const sendAudio = useCallback((audio: Blob) => {
    if (audio.size < 1200) { fail('NOTHING_HEARD'); return }
    setStartedByVoice(true)
    setTurn(current => current + 1)
    setOutgoing('🎙 Áudio enviado')
    void start({ audio }).finally(() => setOutgoing(null))
  }, [start, fail])
  const recorder = useAudioRecorder(sendAudio)

  // Trava o scroll do fundo, leva o foco ao painel (leitores de tela) e fecha no Esc
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => { document.body.style.overflow = previous }
  }, [])

  const hasOrder = (conversation?.review.items.length ?? 0) > 0
  const requestClose = useCallback(() => { if (hasOrder) setLeaving(true); else onClose() }, [hasOrder, onClose])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !leaving && !manual) requestClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leaving, manual, requestClose])

  // Fala cada rodada nova (e a atual, se o cliente ligar o som agora). Nunca enquanto ele grava.
  // `spoken` evita repetir a mesma rodada quando só o token ou a conversa mudam de referência.
  const speechId = conversation?.speech_id ?? null
  const spoken = useRef<string | null>(null)
  useEffect(() => {
    if (!voiceOn || recorder.recording || speechId === null) { stopSpeaking(); spoken.current = null; return }
    const key = `${conversation?.conversation_id}:${speechId}`
    if (spoken.current === key) return
    spoken.current = key
    speak(speechId)
  }, [voiceOn, recorder.recording, speechId, conversation?.conversation_id, speak, stopSpeaking])

  // Frase de espera de cada vez nova. Na primeira mensagem o token chega um instante depois (abre a sessão): toca então.
  const fillerTurn = useRef(0)
  useEffect(() => {
    if (!voiceOn || turn === 0 || fillerTurn.current === turn || !token) return
    fillerTurn.current = turn
    filler(turn - 1)
  }, [voiceOn, turn, token, filler])

  // Cronômetro da gravação
  useEffect(() => {
    if (!recorder.recording) return
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 250)
    return () => clearInterval(timer)
  }, [recorder.recording])

  // Mantém a última mensagem à vista
  const messageCount = conversation?.chat.length ?? 0
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messageCount, busy, outgoing, error, notice, conversation?.status])

  const toggleRecording = async () => {
    if (busy) return
    unlockVoice()
    stopSpeaking()
    setNotice(null)
    if (recorder.recording) {
      try { sendAudio(await recorder.stop()) } catch { fail('VOICE_ORDER_UNAVAILABLE') }
      return
    }
    try {
      await recorder.start()
      startedAt.current = Date.now()
      setSeconds(0)
    } catch (failure) {
      fail(failure instanceof DOMException && failure.name === 'NotAllowedError' ? 'MIC_DENIED' : 'MIC_UNAVAILABLE')
    }
  }
  const cancelRecording = async () => { try { await recorder.stop() } catch { /* nada a descartar */ } }

  const sendText = () => {
    const text = draft.trim()
    if (!text || busy) return
    unlockVoice()
    stopSpeaking()
    setTurn(current => current + 1)
    setDraft('')
    setNotice(null)
    setOutgoing(text)
    void (conversation ? say(text) : start({ text })).finally(() => setOutgoing(null))
  }

  const answer = (answers: ReturnType<typeof toAnswers>, label: string) => {
    unlockVoice()
    stopSpeaking()
    setTurn(current => current + 1)
    setNotice(null)
    setOutgoing(label)
    void reply(answers).finally(() => setOutgoing(null))
  }

  /** Pede ao servidor para confirmar e põe no carrinho; se algo mudou, mostra a revisão nova em vez de adicionar. */
  const confirm = async (review: VoiceReview, manualPath: boolean) => {
    setConfirming(true)
    setNotice(null)
    try {
      const result = await confirmVoiceReview(token, review.review_id)
      if (result.status === 'changed' && result.review) {
        replaceReview(result.review)
        if (manualPath) setManual(result.review)
        setNotice('Preço ou disponibilidade mudaram no cardápio. Atualizei o resumo: confira e confirme de novo.')
        return
      }
      if (result.status !== 'confirmed' || !result.items) throw new Error('Produto alterado')
      onAdd(result.items)
      setManual(null)
      onClose()
    } catch (failure) {
      console.warn('[pedido por voz] não foi possível adicionar ao carrinho', failure)
      const code = addToCartErrorCode(failure)
      fail(code)
      throw new Error(code)
    } finally {
      setConfirming(false)
    }
  }

  const restart = () => { stopSpeaking(); reset(); setNotice(null); setDraft(''); setStartedByVoice(false) }

  const questions = conversation?.questions ?? []
  const chat = conversation ? visibleChat(conversation.chat, questions) : []
  const closing = statusMessage(conversation)
  const stepKey = questions.map(question => question.id).join('|')
  const welcome = !conversation && !busy && !error
  const showMic = micSupported && !conversation
  const placeholder = !conversation ? 'Escreva seu pedido…' : questions.length > 0 ? 'Ou escreva sua resposta…' : 'Quer acrescentar algo?'

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }}>
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Assistente de pedido"
        className="voice-sheet w-full sm:max-w-lg flex flex-col rounded-t-3xl sm:rounded-3xl outline-none overflow-hidden"
        style={{ background: 'var(--bg-card)', height: 'min(92dvh, 760px)' }}
      >
        <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-hi)' }}>Peça do seu jeito</h2>
            <p className="text-xs" style={{ color: 'var(--text-lo)' }}>Fale ou escreva. Eu monto o pedido e pergunto o que faltar.</p>
          </div>
          <div className="shrink-0 flex items-center -mr-2 -mt-1">
            {voiceAvailable && (
              <button
                type="button"
                onClick={() => voice.choose(!voiceOn)}
                aria-pressed={voiceOn}
                aria-label={voiceOn ? 'Silenciar a voz do assistente' : 'Ativar a voz do assistente'}
                title={voiceOn ? 'Silenciar' : 'Ativar voz'}
                className={`voice-focus w-11 h-11 rounded-full flex items-center justify-center ${voice.speaking ? 'voice-pulse' : ''}`}
                style={{ color: voiceOn ? 'var(--color-brand)' : 'var(--text-lo)' }}
              >
                <Icon name={voiceOn ? 'speaker' : 'muted'} size={17} />
              </button>
            )}
            <button type="button" onClick={requestClose} aria-label="Fechar assistente" className="voice-focus w-11 h-11 rounded-full flex items-center justify-center" style={{ color: 'var(--text-lo)' }}>
              <Icon name="close" size={18} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" aria-live="polite">
          {welcome && (
            <div className="flex flex-col items-center text-center gap-3 pt-6">
              {showMic && (
                <button
                  type="button"
                  onClick={toggleRecording}
                  aria-label="Começar a falar"
                  className="voice-focus w-24 h-24 rounded-full flex flex-col items-center justify-center gap-1 text-white voice-pulse"
                  style={{ background: 'var(--color-brand)' }}
                >
                  <Icon name="mic" size={30} />
                  <span className="text-xs font-semibold">Falar</span>
                </button>
              )}
              <p className="text-sm font-medium" style={{ color: 'var(--text-hi)' }}>
                {showMic ? 'Toque no microfone e diga o que quer, ou escreva abaixo.' : 'Escreva abaixo o que você quer pedir.'}
              </p>
              {examples.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2" aria-label="Exemplos">
                  {examples.map(example => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setDraft(example)}
                      className="voice-focus min-h-9 rounded-full px-3 py-1.5 text-xs font-medium"
                      style={{ background: 'var(--bg-input)', color: 'var(--text-hi)', border: '1px solid var(--border)' }}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs" style={{ color: 'var(--text-lo)' }}>Nada vai para o carrinho sem você confirmar.</p>
            </div>
          )}

          {chat.map((message, index) => <Bubble key={`${index}-${message.role}`} role={message.role}>{message.text}</Bubble>)}
          {outgoing && <Bubble role="user">{outgoing}</Bubble>}
          {busy && <Thinking key={conversation ? 'reply' : 'first'} steps={thinkingSteps(!conversation, startedByVoice)} />}

          {!busy && questions.length > 0 && (
            <QuestionStep key={stepKey} questions={questions} busy={busy} visuals={visuals} onSubmit={answer} />
          )}

          {!busy && closing && <Bubble role="assistant">{closing}</Bubble>}
          {notice && <Bubble role="assistant">{notice}</Bubble>}

          {error && (
            <div role="alert" className="rounded-2xl px-3.5 py-3 text-sm space-y-2" style={{ background: 'var(--bg-input)', color: 'var(--text-hi)', border: '1px solid var(--border)' }}>
              <p>{errorMessage(error)}</p>
              <div className="flex flex-wrap gap-2">
                {isRetryable(error) && !busy && (
                  <button type="button" onClick={() => void resend()} className="voice-focus min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: 'var(--color-brand)' }}>
                    Tentar de novo
                  </button>
                )}
                {error === 'SESSION_EXPIRED' && (
                  <button type="button" onClick={restart} className="voice-focus min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: '1px solid var(--border)', color: 'var(--text-hi)' }}>
                    Começar de novo
                  </button>
                )}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <footer className="px-4 pt-2 space-y-2 border-t" style={{ borderColor: 'var(--border)', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
          <OrderSummary
            review={conversation?.review ?? null}
            products={products}
            busy={busy || confirming}
            onNote={(itemRef, text) => { stopSpeaking(); setNotice(null); void note([{ item_ref: itemRef, note: text }]) }}
          />

          {conversation?.can_confirm && (
            <button
              type="button"
              disabled={busy || confirming}
              onClick={() => void confirm(conversation.review, false).catch(() => undefined)}
              className="voice-focus w-full min-h-12 rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: 'var(--color-brand)' }}
            >
              {confirming ? 'Adicionando…' : `Adicionar ao carrinho · ${summaryTotal(conversation.review)}`}
            </button>
          )}
          {conversation?.status === 'suggesting' && (
            <p className="text-xs text-center" style={{ color: 'var(--text-lo)' }}>As sugestões são opcionais: responda ou adicione agora.</p>
          )}

          {(hasOrder || conversation?.status === 'incomplete') && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => { stopSpeaking(); if (conversation) setManual(conversation.review) }}
                className="voice-focus min-h-10 rounded-xl px-3 flex items-center justify-center gap-2 text-xs font-semibold disabled:opacity-50"
                style={{ background: 'var(--bg-input)', color: 'var(--text-hi)', border: '1px solid var(--border)' }}
              >
                <Icon name="edit" size={12} /> Ajustar manualmente
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={restart}
                className="voice-focus min-h-10 rounded-xl px-3 flex items-center justify-center gap-2 text-xs font-semibold disabled:opacity-50"
                style={{ background: 'transparent', color: 'var(--text-lo)', border: '1px solid var(--border)' }}
              >
                <Icon name="refresh" size={12} /> Recomeçar
              </button>
            </div>
          )}

          {recorder.recording ? (
            <div className="flex items-center gap-3 rounded-2xl px-3 py-2" style={{ background: 'var(--bg-input)' }} role="status">
              <span aria-hidden="true" className="w-3 h-3 rounded-full voice-pulse" style={{ background: 'var(--color-brand)' }} />
              <span className="sr-only">Ouvindo…</span>
              <VoiceWave analyser={recorder.analyser} />
              <span className="text-xs font-medium tabular-nums whitespace-nowrap" style={{ color: 'var(--text-hi)' }}>
                {seconds}s / {MAX_RECORDING_SECONDS}s
              </span>
              <button type="button" onClick={() => void cancelRecording()} className="voice-focus min-h-11 px-3 text-sm font-semibold" style={{ color: 'var(--text-lo)' }}>Cancelar</button>
              <button type="button" onClick={() => void toggleRecording()} className="voice-focus min-h-11 rounded-xl px-4 text-sm font-bold text-white" style={{ background: 'var(--color-brand)' }}>Enviar</button>
            </div>
          ) : (
            <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); sendText() }}>
              <input
                value={draft}
                onChange={event => setDraft(event.target.value)}
                maxLength={conversation ? 300 : 500}
                placeholder={placeholder}
                enterKeyHint="send"
                autoComplete="off"
                aria-label={placeholder}
                disabled={busy}
                className="voice-focus flex-1 min-h-11 rounded-xl px-3 text-sm outline-none disabled:opacity-60"
                style={{ background: 'var(--bg-input)', color: 'var(--text-hi)', border: '1px solid var(--border)' }}
              />
              {showMic && (
                <button type="button" onClick={() => void toggleRecording()} disabled={busy} aria-label="Falar" className="voice-focus w-11 h-11 shrink-0 rounded-xl flex items-center justify-center disabled:opacity-50" style={{ background: 'var(--bg-input)', color: 'var(--color-brand)', border: '1px solid var(--border)' }}>
                  <Icon name="mic" size={16} />
                </button>
              )}
              <button type="submit" disabled={busy || draft.trim() === ''} aria-label="Enviar mensagem" className="voice-focus w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-white disabled:opacity-40" style={{ background: 'var(--color-brand)' }}>
                <Icon name="send" size={16} />
              </button>
            </form>
          )}
        </footer>
      </section>

      <ConfirmModal
        open={leaving}
        destructive
        title="Sair do assistente?"
        message="O pedido que montamos ainda não foi para o carrinho."
        confirmLabel="Sim, sair"
        cancelLabel="Continuar pedindo"
        onConfirm={onClose}
        onCancel={() => setLeaving(false)}
      />

      {manual && (
        <VoiceOrderReviewModal
          key={manual.review_id}
          token={token}
          initialReview={manual}
          products={products}
          onClose={() => setManual(null)}
          onConfirm={review => confirm(review, true)}
        />
      )}
    </div>,
    document.body,
  )
}

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? ''

export interface VoiceItem {
  client_item_ref: string
  product_id: string
  quantity: number
  preparation_note: string
  selected_options: Record<string, string[]>
  display: { name: string }
  /** Opções escolhidas (bebida, adicional...) já com o preço calculado pelo servidor. */
  options?: Array<{ group_id: string; product_id: string; display_name: string; price_minor: number }>
  validation_status: 'valid' | 'missing_options'
  missing_required_group_ids: string[]
  subtotal_minor: number
}

export interface VoiceReview {
  review_id: string
  items: VoiceItem[]
  invalid_items: Array<{
    client_item_ref: string
    code: string
    /** Frase pronta para o cliente ("Tem “X”, mas está em falta no momento."). */
    message?: string
    display_name?: string
    /** Produtos parecidos que podem ser pedidos agora, no lugar do recusado. */
    alternatives?: Array<{ product_id: string; display_name: string }>
    available_quantity?: number
  }>
  missing_required_selections: Array<{ client_item_ref: string; group_id: string }>
  items_not_found: string[]
  ambiguous_items: string[]
  /** Produtos parecidos de cada item ambíguo, na mesma ordem de ambiguous_items. */
  ambiguous_candidates?: Array<Array<{ product_id: string; display_name: string }>>
  totals: { currency: string; subtotal_minor: number; total_minor: number }
  expires_at: string
}

export interface ProposedVoiceItem {
  client_item_ref: string
  product_id: string
  quantity: number
  preparation_note: string
  selected_options: Record<string, string[]>
}

async function post<T>(path: string, body: BodyInit, token?: string): Promise<T> {
  const response = await fetch(`${BASE_URL}/api/v1/voice-order${path}`, {
    method: 'POST', body, cache: 'no-store', signal: AbortSignal.timeout(60_000),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  const json = await response.json().catch(() => null)
  if (!response.ok || !json) throw new Error(json?.code ?? `HTTP ${response.status}`)
  return json
}

export async function startVoiceSession(branchId: string): Promise<string> {
  const json = await post<{ token: string }>('/session', JSON.stringify({ branch_id: branchId }))
  return json.token
}

export async function uploadVoiceAudio(token: string, audio: Blob): Promise<VoiceReview> {
  const form = new FormData()
  form.append('audio', audio, 'order.webm')
  const json = await post<{ data: VoiceReview }>('/', form, token)
  return json.data
}

export async function updateVoiceReview(token: string, reviewId: string, items: ProposedVoiceItem[]): Promise<VoiceReview> {
  const json = await post<{ data: VoiceReview }>('/review', JSON.stringify({ review_id: reviewId, items }), token)
  return json.data
}

export async function confirmVoiceReview(token: string, reviewId: string): Promise<{ status: string; items?: VoiceItem[]; review?: VoiceReview }> {
  const json = await post<{ data: { status: string; items?: VoiceItem[]; review?: VoiceReview } }>('/confirm', JSON.stringify({ review_id: reviewId }), token)
  return json.data
}

// ─── Conversa de pedido (texto ou voz) ────────────────────────────────────────

export type ConversationStatus = 'needs_input' | 'suggesting' | 'ready' | 'incomplete' | 'empty'

export interface VoiceQuestion {
  id: string
  /** choice = o servidor precisa da resposta; suggestion = sugestão de opcional, pode ser recusada */
  kind: 'choice' | 'suggestion'
  question: string
  options: string[]
  /** Tags da composição de cada opção ("Pão", "Bacon"...), na mesma ordem de options; ausente quando não há. */
  details?: string[][]
  /** Preço de cada opção quando a pergunta é sobre produtos ("R$ 29,90"), na mesma ordem de options. */
  prices?: string[]
  /** Preço "de" (riscado) dos produtos em promoção; vazio nos demais. `prices` traz o "para". */
  original_prices?: string[]
  /** Produto (ou opcional) de cada opção, na mesma ordem de options; '' quando a opção não é produto (categoria). */
  product_ids?: string[]
  /** Pergunta de categoria ("Refrigerantes"): alguns itens de cada uma, cuja foto serve de capa do card. */
  covers?: string[][]
  optional: boolean
}

export interface VoiceChatMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface VoiceConversation {
  conversation_id: string
  status: ConversationStatus
  /** true quando o pedido já pode ir para o carrinho (sugestões pendentes são opcionais) */
  can_confirm: boolean
  review: VoiceReview
  questions: VoiceQuestion[]
  notes: string[]
  chat: VoiceChatMessage[]
  turns_left: number
  /** Número da fala desta rodada (o áudio vem de fetchVoiceSpeech). Ausente = servidor sem voz; null = nada a dizer. */
  speech_id?: number | null
}

export interface VoiceAnswer {
  question_id: string
  /** posição da opção tocada; o servidor resolve o texto, não confia no navegador */
  option_index?: number
  text?: string
  declined?: boolean
}

/** Observação de preparo de um item do resumo ("sem cebola"); '' apaga. Aplicada sem a IA. */
export interface VoiceNote {
  item_ref: string
  note: string
}

/** Começa a conversa com um texto digitado ou com um áudio gravado. */
export async function startVoiceConversation(token: string, input: { text: string } | { audio: Blob }): Promise<VoiceConversation> {
  let body: BodyInit
  if ('audio' in input) {
    const form = new FormData()
    form.append('audio', input.audio, 'order.webm')
    body = form
  } else {
    body = JSON.stringify({ text: input.text })
  }
  const json = await post<{ data: VoiceConversation }>('/conversation', body, token)
  return json.data
}

/** Responde às perguntas da rodada e/ou acrescenta algo ao pedido. */
export async function replyVoiceConversation(
  token: string, conversationId: string, reply: { answers?: VoiceAnswer[]; text?: string; notes?: VoiceNote[] },
): Promise<VoiceConversation> {
  const json = await post<{ data: VoiceConversation }>(`/conversation/${conversationId}/reply`, JSON.stringify(reply), token)
  return json.data
}

/** Quantas frases de espera o servidor tem (SpeechWriter::FILLERS). */
export const VOICE_FILLER_COUNT = 5

/** Áudio de uma frase de espera ("Certo, vou ver as opções que tenho."), da lista fixa do servidor. */
export async function fetchVoiceFiller(token: string, index: number): Promise<Blob> {
  const response = await fetch(`${BASE_URL}/api/v1/voice-order/conversation/filler/${index}`, {
    signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.blob()
}

/** Áudio (WAV) da fala da rodada. null = nada a dizer. O texto nunca sai do servidor: só o número da rodada vai. */
export async function fetchVoiceSpeech(token: string, conversationId: string, speechId: number): Promise<Blob | null> {
  const response = await fetch(`${BASE_URL}/api/v1/voice-order/conversation/${conversationId}/speech/${speechId}`, {
    cache: 'no-store', signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 204) return null
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.blob()
}

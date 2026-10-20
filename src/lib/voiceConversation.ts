import type { Product } from '../types'
import type {
  VoiceAnswer, VoiceChatMessage, VoiceConversation, VoiceQuestion, VoiceReview,
} from '../services/voiceOrderApi'
import { formatCurrency } from './pricing'

/** O que o cliente tocou em cada pergunta: o índice da opção, ou 'skip' ("Sem isso") numa sugestão. */
export type Selection = Record<string, number | 'skip'>

/** Mensagens para o cliente, por código de erro (da API ou do aparelho). Nunca mostra o código cru. */
const ERROR_MESSAGES: Record<string, string> = {
  QUOTA_EXCEEDED: 'O pedido por voz atingiu o limite deste mês. Você pode pedir pelo cardápio.',
  VOICE_ORDER_UNAVAILABLE: 'Não consegui processar agora. Tente de novo ou peça pelo cardápio.',
  INVALID_AUDIO: 'Não consegui entender o áudio. Tente de novo ou escreva seu pedido.',
  INVALID_AUDIO_DURATION: 'O áudio precisa ter até 30 segundos. Tente de novo ou escreva seu pedido.',
  AUDIO_INSPECTION_UNAVAILABLE: 'Não consegui processar o áudio agora. Escreva seu pedido.',
  CONVERSATION_BUSY: 'Ainda estou conferindo sua última mensagem. Aguarde um instante.',
  CONVERSATION_TOO_LONG: 'A conversa ficou longa demais. Vamos ajustar o pedido manualmente.',
  SESSION_EXPIRED: 'Sua sessão expirou. Comece de novo.',
  MIC_DENIED: 'O microfone está bloqueado. Libere nas configurações do navegador ou escreva seu pedido.',
  MIC_UNAVAILABLE: 'Não dá para gravar áudio neste aparelho. Escreva seu pedido.',
  NOTHING_HEARD: 'Não ouvi nada. Fale mais perto do aparelho ou escreva seu pedido.',
  NETWORK: 'Sem conexão. Confira a internet e tente de novo.',
  CHANGED: 'O cardápio mudou desde que montamos o pedido. Confira os itens de novo.',
}

export function errorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? 'Algo deu errado. Tente de novo ou peça pelo cardápio.'
}

/** Traduz a exceção de uma chamada (rede, tempo esgotado, código da API) em um código conhecido. */
export function errorCode(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'VOICE_ORDER_UNAVAILABLE'
  if (error instanceof TypeError) return 'NETWORK'
  const message = error instanceof Error ? error.message : ''
  // 401 = token da sessão venceu; 404 = a conversa venceu ou nunca existiu
  if (message === 'HTTP 401' || message === 'HTTP 404' || message === 'INVALID_CONVERSATION') return 'SESSION_EXPIRED'
  return message in ERROR_MESSAGES ? message : 'VOICE_ORDER_UNAVAILABLE'
}

/** Erros que não adiantam tentar de novo: o cliente precisa escrever, recomeçar ou pedir pelo cardápio. */
export function isRetryable(code: string): boolean {
  return !['QUOTA_EXCEEDED', 'SESSION_EXPIRED', 'MIC_DENIED', 'MIC_UNAVAILABLE', 'CONVERSATION_TOO_LONG', 'INVALID_AUDIO_DURATION'].includes(code)
}

/** Separa o acréscimo de preço do nome: "Aumentar batata (+R$ 3,00)" → nome e "+R$ 3,00". */
export function splitOptionPrice(label: string): { name: string; extra: string | null } {
  const match = label.match(/^(.*?)\s*\((\+R\$[^)]*)\)\s*$/)
  return match ? { name: match[1], extra: match[2] } : { name: label, extra: null }
}

/** Todas as perguntas obrigatórias respondidas? (sugestão pode ficar em branco) */
export function canContinue(questions: VoiceQuestion[], selection: Selection): boolean {
  return questions.length > 0 && questions.every(question => question.optional || typeof selection[question.id] === 'number')
}

/** Respostas a enviar: opção tocada vira índice; "Sem isso" vira recusa; pergunta sem toque não é enviada. */
export function toAnswers(questions: VoiceQuestion[], selection: Selection): VoiceAnswer[] {
  const answers: VoiceAnswer[] = []
  for (const question of questions) {
    const picked = selection[question.id]
    if (typeof picked === 'number') answers.push({ question_id: question.id, option_index: picked })
    else if (picked === 'skip' && question.optional) answers.push({ question_id: question.id, declined: true })
  }
  return answers
}

/** Com uma só pergunta na tela, o que o cliente digita é a resposta dela; com várias, é uma mensagem livre. */
export function typedAnswerTarget(questions: VoiceQuestion[]): VoiceQuestion | null {
  return questions.length === 1 ? questions[0] : null
}

export interface SummaryLine {
  key: string
  title: string
  price: string
  extras: string[]
  note: string
  /** falta escolher algo obrigatório neste item */
  incomplete: boolean
}

/** Linhas do resumo do pedido, com o preço que o servidor calculou (nunca recalculado aqui). */
export function summaryLines(review: VoiceReview | null): SummaryLine[] {
  if (!review) return []
  return review.items.map(item => ({
    key: item.client_item_ref,
    title: `${item.quantity}x ${item.display.name}`,
    price: formatCurrency(item.subtotal_minor / 100),
    extras: (item.options ?? []).map(option => option.display_name),
    note: item.preparation_note,
    incomplete: item.validation_status !== 'valid',
  }))
}

export function summaryTotal(review: VoiceReview | null): string {
  return formatCurrency((review?.totals.total_minor ?? 0) / 100)
}

export function itemCountLabel(review: VoiceReview | null): string {
  const count = review?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0
  return count === 1 ? '1 item' : `${count} itens`
}

/**
 * Mensagens do histórico, sem as perguntas que ainda estão na tela como cartões
 * (senão a mesma pergunta apareceria duas vezes, como balão e como cartão).
 */
export function visibleChat(chat: VoiceChatMessage[], questions: VoiceQuestion[]): VoiceChatMessage[] {
  const open = new Set(questions.map(question => question.question))
  let end = chat.length
  while (end > 0 && chat[end - 1].role === 'assistant' && open.has(chat[end - 1].text)) end--
  return chat.slice(0, end)
}

/** Frase de fechamento da rodada, mostrada depois do histórico. Sugestões falam por si nos cartões. */
export function statusMessage(conversation: VoiceConversation | null): string | null {
  switch (conversation?.status) {
    case 'ready': return 'Tudo certo! Confira o resumo e adicione ao carrinho.'
    case 'empty': return 'Não consegui montar o pedido com isso. Pode dizer de outro jeito?'
    case 'incomplete': return 'Vamos ajustar o resto manualmente para não errar nada.'
    default: return null
  }
}

/** Exemplos de pedido com produtos reais do cardápio (nunca nomes inventados). */
export function exampleOrders(products: Product[]): string[] {
  const names = products
    .filter(product => product.active && product.name.length <= 28 && !/combo|box|kids/i.test(product.name))
    .slice(0, 6)
    .map(product => product.name)
  if (names.length < 2) return []
  return [`Quero um ${names[0]}`, `Um ${names[0]} e um ${names[1]}`]
}

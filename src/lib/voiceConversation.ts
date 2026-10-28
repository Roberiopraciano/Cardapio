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
  RATE_LIMITED: 'Muitas tentativas seguidas. Aguarde alguns segundos e tente de novo.',
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
  if (message === 'HTTP 429') return 'RATE_LIMITED'
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
  productId: string
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
    productId: item.product_id,
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

/**
 * Mensagens de "pensando", trocadas de tempos em tempos enquanto o servidor responde (a primeira rodada passa pela
 * IA e demora mais). Param na última: voltar ao começo pareceria que recomeçou.
 */
export function thinkingSteps(first: boolean, byVoice: boolean): string[] {
  return first
    ? [byVoice ? 'Ouvindo seu pedido…' : 'Lendo seu pedido…', 'Procurando no cardápio…', 'Selecionando os produtos…', 'Conferindo preços e opções…', 'Montando seu pedido…']
    : ['Conferindo…', 'Procurando as opções…', 'Atualizando seu pedido…']
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

/**
 * ⚠️ EXPERIMENTO LIGADO — modo cards do assistente.
 * Quando as opções de uma pergunta são produtos, mostra cards com foto em vez da lista de botões de texto.
 * `?aicards=0` no link volta para a lista; `?aicards=1` força os cards. Sem o parâmetro, vale esta constante.
 */
export const VOICE_CARDS_MODE = true

export function voiceCardsEnabled(search = typeof location === 'undefined' ? '' : location.search): boolean {
  const flag = new URLSearchParams(search).get('aicards')
  return flag === null ? VOICE_CARDS_MODE : flag !== '0'
}

export interface ChoiceVisual {
  image: string
  description: string
}

/** Produtos e opcionais do cardápio local por id (um opcional só existe dentro do grupo do produto). */
export function visualIndex(products: Product[]): Map<string, ChoiceVisual> {
  const index = new Map<string, ChoiceVisual>()
  for (const product of products) {
    for (const group of product.complementsGroups ?? []) {
      for (const option of group.products ?? []) {
        if (!index.has(option._id)) index.set(option._id, { image: option.image ?? '', description: '' })
      }
    }
  }
  // Produto por último: vale a foto e a descrição dele mesmo quando também aparece como opcional
  for (const product of products) index.set(product._id, { image: product.image ?? '', description: product.description ?? '' })
  return index
}

/**
 * Foto e descrição de cada opção, na ordem de options, ou null quando a pergunta não vira cards:
 * opção sem produto nem capa, produto que o cardápio local não tem, ou nenhuma opção com foto
 * (cards só com a inicial não ajudam mais que a lista).
 *
 * Categoria ("Refrigerantes") não é produto: a capa é a foto do primeiro item dela que tem foto, sem descrição.
 */
export function choiceVisuals(question: VoiceQuestion, index: Map<string, ChoiceVisual>): ChoiceVisual[] | null {
  if (question.options.length === 0) return null
  const visuals: ChoiceVisual[] = []
  for (let at = 0; at < question.options.length; at++) {
    const id = question.product_ids?.[at]
    if (id) {
      const visual = index.get(id)
      if (!visual) return null
      visuals.push(visual)
      continue
    }
    const cover = question.covers?.[at]
    if (!cover) return null
    const image = cover.map(item => index.get(item)?.image ?? '').find(Boolean) ?? ''
    visuals.push({ image, description: '' })
  }
  return visuals.some(visual => visual.image) ? visuals : null
}

/** Falhas da conferência local do pedido (cardápio do app x servidor): só estas significam "o cardápio mudou". */
const MENU_MISMATCH = ['Produto alterado', 'Opcional alterado', 'Preço alterado']

/** Código do erro ao adicionar ao carrinho: "cardápio mudou" só quando foi isso; senão a causa real (rede, limite, sessão). */
export function addToCartErrorCode(error: unknown): string {
  return error instanceof Error && MENU_MISMATCH.includes(error.message) ? 'CHANGED' : errorCode(error)
}

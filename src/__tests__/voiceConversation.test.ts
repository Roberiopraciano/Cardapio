/**
 * Testes para src/lib/voiceConversation.ts
 * A lógica do assistente de pedido que não depende de tela: respostas, erros, resumo e histórico.
 */

import { describe, expect, it } from 'vitest'
import {
  canContinue, errorCode, errorMessage, exampleOrders, isRetryable, itemCountLabel, splitOptionPrice,
  statusMessage, summaryLines, summaryTotal, thinkingSteps, toAnswers, typedAnswerTarget, visibleChat,
} from '../lib/voiceConversation'
import type { Product } from '../types'
import type { VoiceChatMessage, VoiceConversation, VoiceItem, VoiceQuestion, VoiceReview } from '../services/voiceOrderApi'

function question(id: string, overrides: Partial<VoiceQuestion> = {}): VoiceQuestion {
  return { id, kind: 'choice', question: `Pergunta ${id}`, options: ['A', 'B', 'C'], optional: false, ...overrides }
}

function item(overrides: Partial<VoiceItem> = {}): VoiceItem {
  return {
    client_item_ref: 'a', product_id: 'p1', quantity: 1, preparation_note: '', selected_options: {},
    display: { name: 'Combo' }, validation_status: 'valid', missing_required_group_ids: [], subtotal_minor: 3800, ...overrides,
  }
}

function review(items: VoiceItem[], total = 3800): VoiceReview {
  return {
    review_id: 'r', items, invalid_items: [], missing_required_selections: [], items_not_found: [], ambiguous_items: [],
    totals: { currency: 'BRL', subtotal_minor: total, total_minor: total }, expires_at: '',
  }
}

describe('mensagens de erro', () => {
  it('traduz códigos conhecidos e nunca mostra o código cru', () => {
    expect(errorMessage('QUOTA_EXCEEDED')).toContain('limite')
    expect(errorMessage('MIC_DENIED')).toContain('microfone')
    expect(errorMessage('QUALQUER_COISA')).toBe('Algo deu errado. Tente de novo ou peça pelo cardápio.')
  })

  it('reconhece rede, tempo esgotado e sessão vencida', () => {
    expect(errorCode(new TypeError('Failed to fetch'))).toBe('NETWORK')
    expect(errorCode(new DOMException('x', 'TimeoutError'))).toBe('VOICE_ORDER_UNAVAILABLE')
    expect(errorCode(new Error('HTTP 401'))).toBe('SESSION_EXPIRED')
    expect(errorCode(new Error('HTTP 404'))).toBe('SESSION_EXPIRED')
    expect(errorCode(new Error('INVALID_CONVERSATION'))).toBe('SESSION_EXPIRED')
  })

  it('preserva os códigos da API que têm mensagem e generaliza os demais', () => {
    expect(errorCode(new Error('QUOTA_EXCEEDED'))).toBe('QUOTA_EXCEEDED')
    expect(errorCode(new Error('INVALID_AUDIO'))).toBe('INVALID_AUDIO')
    expect(errorCode(new Error('HTTP 500'))).toBe('VOICE_ORDER_UNAVAILABLE')
    expect(errorCode('texto solto')).toBe('VOICE_ORDER_UNAVAILABLE')
  })

  it('só oferece "tentar de novo" quando adianta', () => {
    expect(isRetryable('VOICE_ORDER_UNAVAILABLE')).toBe(true)
    expect(isRetryable('NETWORK')).toBe(true)
    for (const code of ['QUOTA_EXCEEDED', 'SESSION_EXPIRED', 'MIC_DENIED', 'MIC_UNAVAILABLE', 'CONVERSATION_TOO_LONG']) {
      expect(isRetryable(code)).toBe(false)
    }
  })
})

describe('splitOptionPrice', () => {
  it('separa o acréscimo do nome', () => {
    expect(splitOptionPrice('Aumentar batata para grande (+R$ 3,00)')).toEqual({ name: 'Aumentar batata para grande', extra: '+R$ 3,00' })
  })

  it('mantém nomes sem preço ou com parênteses próprios', () => {
    expect(splitOptionPrice('Coca Zero')).toEqual({ name: 'Coca Zero', extra: null })
    expect(splitOptionPrice('Suco de cajá (sem leite)')).toEqual({ name: 'Suco de cajá (sem leite)', extra: null })
    expect(splitOptionPrice('Milk shake (300ml) (+R$ 13,90)')).toEqual({ name: 'Milk shake (300ml)', extra: '+R$ 13,90' })
  })
})

describe('respostas das perguntas', () => {
  const required = question('q1')
  const suggestion = question('q2', { kind: 'suggestion', optional: true })

  it('canContinue exige as obrigatórias e dispensa as sugestões', () => {
    expect(canContinue([], {})).toBe(false)
    expect(canContinue([required], {})).toBe(false)
    expect(canContinue([required], { q1: 0 })).toBe(true) // índice 0 é resposta válida
    expect(canContinue([required, suggestion], { q1: 2 })).toBe(true)
    expect(canContinue([suggestion], {})).toBe(true)
    expect(canContinue([required], { q1: 'skip' })).toBe(false) // "sem isso" não vale numa pergunta obrigatória
  })

  it('toAnswers envia o índice tocado e a recusa, e omite o que ficou em branco', () => {
    expect(toAnswers([required, suggestion], { q1: 1, q2: 'skip' })).toEqual([
      { question_id: 'q1', option_index: 1 },
      { question_id: 'q2', declined: true },
    ])
    expect(toAnswers([required, suggestion], { q1: 0 })).toEqual([{ question_id: 'q1', option_index: 0 }])
    expect(toAnswers([required], { q1: 'skip' })).toEqual([])
    expect(toAnswers([required], {})).toEqual([])
  })

  it('o texto digitado responde a pergunta só quando ela é a única na tela', () => {
    expect(typedAnswerTarget([required])?.id).toBe('q1')
    expect(typedAnswerTarget([required, suggestion])).toBeNull()
    expect(typedAnswerTarget([])).toBeNull()
  })
})

describe('resumo do pedido', () => {
  it('mostra o que o servidor calculou, com as opções escolhidas', () => {
    const lines = summaryLines(review([
      item({ quantity: 2, display: { name: 'X-Bacon' }, subtotal_minor: 4000, preparation_note: 'sem cebola' }),
      item({ client_item_ref: 'b', display: { name: 'Combo' }, subtotal_minor: 4100, options: [
        { group_id: 'g', product_id: 'o', display_name: 'Coca Zero', price_minor: 600 },
      ] }),
    ], 8100))
    expect(lines[0]).toMatchObject({ title: '2x X-Bacon', price: 'R$40,00', note: 'sem cebola', extras: [], incomplete: false })
    expect(lines[1]).toMatchObject({ title: '1x Combo', price: 'R$41,00', extras: ['Coca Zero'] })
  })

  it('marca item com escolha obrigatória faltando', () => {
    expect(summaryLines(review([item({ validation_status: 'missing_options' })]))[0].incomplete).toBe(true)
  })

  it('total e contagem de itens', () => {
    const r = review([item({ quantity: 2 }), item({ client_item_ref: 'b' })], 11400)
    expect(summaryTotal(r)).toBe('R$114,00')
    expect(itemCountLabel(r)).toBe('3 itens')
    expect(itemCountLabel(review([item()]))).toBe('1 item')
    expect(summaryLines(null)).toEqual([])
    expect(summaryTotal(null)).toBe('R$0,00')
    expect(itemCountLabel(null)).toBe('0 itens')
  })
})

describe('histórico da conversa', () => {
  const chat: VoiceChatMessage[] = [
    { role: 'user', text: 'quero um combo' },
    { role: 'assistant', text: 'Qual bebida?' },
    { role: 'user', text: 'coca' },
    { role: 'assistant', text: 'Quer turbinar?' },
    { role: 'assistant', text: 'Quer uma sobremesa?' },
  ]

  it('esconde do histórico as perguntas que ainda estão na tela como cartões', () => {
    const open = [question('q1', { question: 'Quer turbinar?' }), question('q2', { question: 'Quer uma sobremesa?' })]
    expect(visibleChat(chat, open).map(m => m.text)).toEqual(['quero um combo', 'Qual bebida?', 'coca'])
  })

  it('mantém tudo quando não há pergunta aberta, e perguntas antigas iguais às de agora', () => {
    expect(visibleChat(chat, [])).toHaveLength(5)
    const repeated: VoiceChatMessage[] = [{ role: 'assistant', text: 'Qual bebida?' }, { role: 'user', text: 'coca' }, { role: 'assistant', text: 'Qual bebida?' }]
    expect(visibleChat(repeated, [question('q1', { question: 'Qual bebida?' })])).toHaveLength(2) // só o grupo final sai
  })
})

describe('mensagem de fechamento', () => {
  const base = { conversation_id: 'c', can_confirm: false, review: review([]), questions: [], notes: [], chat: [], turns_left: 3 }
  it.each([
    ['ready', 'Tudo certo'], ['empty', 'Não consegui montar'], ['incomplete', 'ajustar o resto manualmente'],
  ] as const)('%s', (status, text) => {
    expect(statusMessage({ ...base, status } as VoiceConversation)).toContain(text)
  })

  it('não fala nada quando as perguntas já falam por si', () => {
    expect(statusMessage({ ...base, status: 'needs_input' } as VoiceConversation)).toBeNull()
    expect(statusMessage({ ...base, status: 'suggesting' } as VoiceConversation)).toBeNull()
    expect(statusMessage(null)).toBeNull()
  })
})

describe('exemplos de pedido', () => {
  const product = (name: string, active = true) => ({ name, active }) as unknown as Product

  it('usa produtos reais do cardápio, ignorando combos e nomes longos', () => {
    const examples = exampleOrders([
      product('Combo delícia 2'), product('X-Bacon'), product('Nome de produto absurdamente longo demais'), product('Pão de queijo'), product('Suco', false),
    ])
    expect(examples).toEqual(['Quero um X-Bacon', 'Um X-Bacon e um Pão de queijo'])
  })

  it('não inventa exemplo quando o cardápio tem poucos produtos', () => {
    expect(exampleOrders([product('X-Bacon')])).toEqual([])
    expect(exampleOrders([])).toEqual([])
  })
})

describe('thinkingSteps', () => {
  it('a primeira rodada passa por várias etapas, começando pelo jeito que o cliente pediu', () => {
    expect(thinkingSteps(true, true)[0]).toBe('Ouvindo seu pedido…')
    expect(thinkingSteps(true, false)[0]).toBe('Lendo seu pedido…')
    expect(thinkingSteps(true, false)).toContain('Selecionando os produtos…')
  })

  it('as respostas seguintes têm etapas curtas', () => {
    expect(thinkingSteps(false, true)[0]).toBe('Conferindo…')
  })
})

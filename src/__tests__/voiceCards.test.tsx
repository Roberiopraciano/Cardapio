/**
 * Renderização dos cartões do assistente de pedido (QuestionCard e OrderSummary).
 * Sem navegador: confere o HTML gerado (papéis ARIA, estados, textos), não o visual.
 */

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import QuestionCard from '../components/VoiceOrder/QuestionCard'
import OrderSummary from '../components/VoiceOrder/OrderSummary'
import type { VoiceQuestion, VoiceReview } from '../services/voiceOrderApi'

const noop = () => undefined

function question(overrides: Partial<VoiceQuestion> = {}): VoiceQuestion {
  return { id: 'q1', kind: 'choice', question: 'Para o Combo: escolha a bebida', options: ['Coca Zero', 'Fanta'], optional: false, ...overrides }
}

function html(q: VoiceQuestion, selected?: number | 'skip', disabled = false) {
  return renderToStaticMarkup(<QuestionCard question={q} selected={selected} disabled={disabled} onPick={noop} onSkip={noop} />)
}

describe('QuestionCard', () => {
  it('mostra a pergunta e cada resposta como botão de rádio', () => {
    const markup = html(question())
    expect(markup).toContain('Para o Combo: escolha a bebida')
    expect(markup).toContain('role="radiogroup"')
    expect(markup.match(/role="radio"/g)).toHaveLength(2)
    expect(markup).toContain('Coca Zero')
    expect(markup).not.toContain('Não, obrigado') // pergunta obrigatória não pode ser recusada
    expect(markup).not.toContain('Sugestão')
  })

  it('mostra a composição de cada opção como tags, só nas que têm', () => {
    const markup = html(question({ options: ['Franbacon', 'Coca Zero'], details: [['Pão', 'Frango', 'Bacon'], []] }))
    for (const tag of ['Pão', 'Frango', 'Bacon']) expect(markup).toContain(`>${tag}</span>`)
    expect(markup.match(/rounded-full/g)).toHaveLength(3)
    expect(html(question()).match(/rounded-full/g)).toBeNull()
  })

  it('mostra o preço ao lado de cada produto, na ordem recebida', () => {
    const markup = html(question({ options: ['Combo Barato', 'Combo Caro'], prices: ['R$ 24,90', 'R$ 39,90'] }))
    expect(markup.indexOf('R$ 24,90')).toBeGreaterThan(-1)
    expect(markup.indexOf('R$ 24,90')).toBeLessThan(markup.indexOf('R$ 39,90'))
  })

  it('em promoção mostra o preço "de" riscado e o "para"; fora dela, só o preço', () => {
    const markup = html(question({ options: ['Combo Promo', 'Combo Normal'], prices: ['R$ 24,90', 'R$ 30,00'], original_prices: ['R$ 29,90', ''] }))
    expect(markup).toContain('<s ')
    expect(markup.match(/<s /g)).toHaveLength(1)
    expect(markup).toContain('>R$ 29,90</s>')
    expect(markup).toContain('R$ 24,90')
    expect(markup.indexOf('R$ 29,90')).toBeLessThan(markup.indexOf('R$ 24,90'))
  })

  it('marca a opção escolhida (índice 0 inclusive)', () => {
    const markup = html(question(), 0)
    expect(markup.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(markup.match(/aria-checked="false"/g)).toHaveLength(1)
    expect(html(question()).match(/aria-checked="true"/g)).toBeNull()
  })

  it('sugestão ganha selo, preço separado do nome e o botão "Não, obrigado"', () => {
    const markup = html(question({ kind: 'suggestion', optional: true, options: ['Aumentar batata (+R$ 3,00)'] }))
    expect(markup).toContain('Sugestão')
    expect(markup).toContain('Aumentar batata')
    expect(markup).toContain('+R$ 3,00')
    expect(markup).toContain('Não, obrigado')
    expect(markup.match(/role="radio"/g)).toHaveLength(2)
    expect(html(question({ kind: 'suggestion', optional: true }), 'skip').match(/aria-checked="true"/g)).toHaveLength(1)
  })

  it('desabilita as respostas enquanto o servidor responde', () => {
    expect(html(question(), undefined, true).match(/disabled=""/g)).toHaveLength(2)
    expect(html(question()).match(/disabled=""/g)).toBeNull()
  })

  it('lista longa rola dentro do cartão em vez de esticar a tela', () => {
    const many = Array.from({ length: 12 }, (_, i) => `Opção ${i + 1}`)
    expect(html(question({ options: many }))).toContain('overflow-y-auto')
    expect(html(question({ options: ['A', 'B'] }))).not.toContain('overflow-y-auto')
  })
})

function review(): VoiceReview {
  return {
    review_id: 'r', invalid_items: [], missing_required_selections: [], items_not_found: [], ambiguous_items: [],
    items: [
      {
        client_item_ref: 'a', product_id: 'p', quantity: 1, preparation_note: 'sem cebola', selected_options: {}, display: { name: 'Combo' },
        validation_status: 'valid', missing_required_group_ids: [], subtotal_minor: 3800,
        options: [{ group_id: 'g', product_id: 'o', display_name: 'Coca Zero', price_minor: 600 }],
      },
    ],
    totals: { currency: 'BRL', subtotal_minor: 3800, total_minor: 3800 }, expires_at: '',
  }
}

describe('OrderSummary', () => {
  it('mostra contagem e total do servidor, recolhido por padrão', () => {
    const markup = renderToStaticMarkup(<OrderSummary review={review()} />)
    expect(markup).toContain('Resumo do pedido')
    expect(markup).toContain('1 item')
    expect(markup).toContain('R$38,00')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('Coca Zero') // detalhes só ao expandir
  })

  it('não renderiza nada sem itens', () => {
    expect(renderToStaticMarkup(<OrderSummary review={null} />)).toBe('')
    expect(renderToStaticMarkup(<OrderSummary review={{ ...review(), items: [] }} />)).toBe('')
  })

  it('avisa quando falta escolher algo obrigatório', () => {
    const incomplete = review()
    incomplete.items[0].validation_status = 'missing_options'
    expect(renderToStaticMarkup(<OrderSummary review={incomplete} />)).toContain('faltam escolhas')
  })
})

/**
 * Rótulo de pagamento no histórico.
 *
 * ## A regra que governa este arquivo
 *
 * **O app só afirma "Pago" quando ele mesmo confirmou.** Em balcão, totem, caixa,
 * garçom e entrega, o dinheiro passa por fora: o app sabe que **enviou** o pedido,
 * não que foi pago. Deduzir pagamento a partir de "o pedido saiu" é o erro que
 * custa caro nos dois sentidos:
 *
 *  · cliente lê "Pago" e não pagou → passa pela porta e é parado na frente da fila
 *  · cliente lê "Pago" e o caixa diz que não → ele confia no celular e discute
 *
 * Então há **três** estados, não dois: pago, não pago, e **não sabemos**. O
 * terceiro é o mais comum hoje, e é o que a interface precisa dizer sem rodeio.
 */

import type { HistoryPayment, PaymentMethod, PaymentVia } from './orderHistory'

const METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix',
  credit: 'Crédito',
  debit: 'Débito',
  cash: 'Dinheiro',
  voucher: 'Voucher',
}

/** Para onde o pedido foi, quando o pagamento não passou pelo app. */
const VIA_LABEL: Record<PaymentVia, string> = {
  app: 'no app',
  pos: 'na maquininha',
  totem: 'no totem',
  counter: 'no balcão',
  waiter: 'com o garçom',
  on_delivery: 'na entrega',
}

/** `app` e `pos` são os únicos meios que o app acompanha de ponta a ponta. */
function appTracks(via: PaymentVia): boolean {
  return via === 'app' || via === 'pos'
}

export type PaymentTone = 'paid' | 'unknown' | 'failed' | 'pending'

export interface PaymentBadge {
  tone: PaymentTone
  label: string
  /** Linha de apoio: método, troco, senha. */
  detail?: string
}

/**
 * O que exibir sobre o pagamento deste pedido.
 *
 * `null` quando não há nada de útil a dizer — melhor silêncio que um rótulo
 * decorativo que o cliente tenta interpretar.
 */
export function paymentBadge(p: HistoryPayment | undefined): PaymentBadge | null {
  if (!p) return null

  const method = p.method ? METHOD_LABEL[p.method] : null

  if (p.status === 'failed') {
    return {
      tone: 'failed',
      label: 'Pagamento não aprovado',
      detail: method ?? undefined,
    }
  }

  if (p.status === 'paid') {
    return {
      tone: 'paid',
      // "Pago no app" e não só "Pago": diz **onde**, para o cliente saber se
      // precisa mostrar algo no caixa
      label: `Pago ${VIA_LABEL[p.via]}`,
      detail: method ?? undefined,
    }
  }

  // Daqui para baixo o app **não** tem confirmação.
  if (appTracks(p.via)) {
    // Meio que o app acompanha, sem confirmação ainda: é pendência de verdade
    return {
      tone: 'pending',
      label: 'Pagamento pendente',
      detail: method ?? undefined,
    }
  }

  // Pagamento por fora: dizer o que sabemos (para onde foi) e o que não sabemos
  const detail: string[] = []
  if (p.handoffCode) detail.push(`Senha ${p.handoffCode}`)
  if (method) detail.push(method)
  if (p.via === 'on_delivery' && typeof p.changeFor === 'number' && p.changeFor > 0) {
    detail.push(`troco para ${p.changeFor.toFixed(2).replace('.', ',')}`)
  }

  return {
    tone: 'unknown',
    label: `Pagamento ${VIA_LABEL[p.via]}`,
    // A frase é deliberadamente explícita: o cliente precisa saber que o
    // celular não é comprovante
    detail: [...detail, 'não confirmado no app'].join(' · '),
  }
}

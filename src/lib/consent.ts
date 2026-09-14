/**
 * Gerenciamento de consentimento LGPD.
 * Armazena a decisão do usuário no localStorage.
 * Valores: 'granted' | 'denied' | null (não respondeu)
 *
 * ## Por company, e **sem migração** — de propósito
 *
 * A chave é prefixada como as outras (ver `storageScope.ts`), mas ao contrário
 * de nome, telefone e histórico, o consentimento **não** herda o valor global
 * antigo nem o de outra empresa.
 *
 * Consentimento é ato dirigido a um controlador específico: aceitar o rastreio do
 * restaurante A não autoriza o do B, ainda que o app seja o mesmo e o cliente,
 * também. Herdar o "aceito" ligaria o Pixel de uma empresa que o cliente nunca
 * autorizou — e ele nem veria o banner para descobrir.
 *
 * O custo é o cliente responder o banner uma vez por empresa. É o custo certo.
 */

import { scopedKey } from './storageScope'

const BASE = 'cardapio_consent'

export type ConsentStatus = 'granted' | 'denied' | null

export function getConsent(): ConsentStatus {
  try {
    const v = localStorage.getItem(scopedKey(BASE))
    if (v === 'granted' || v === 'denied') return v
    return null
  } catch { return null }
}

export function setConsent(status: 'granted' | 'denied'): void {
  try { localStorage.setItem(scopedKey(BASE), status) } catch {}
}

export function hasAnswered(): boolean {
  return getConsent() !== null
}

export function isGranted(): boolean {
  return getConsent() === 'granted'
}

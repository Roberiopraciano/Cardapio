/**
 * Persistência dos dados do cliente em localStorage.
 * Reutilizado em todos os pedidos da sessão (mesa e balcão).
 *
 * Salva: nome, telefone, CPF
 * Chave: 'cardapio_client', **prefixada por company** — ver storageScope.ts.
 * Sem o prefixo, a página do restaurante B lia o CPF digitado no A.
 *
 * OBS: limpamos somente quando o usuário edita os campos,
 * nunca no clearCart — o cliente não muda entre pedidos.
 */

import type { ClientInfo } from '../types'
import { scopedKey, readScopedWithMigration } from './storageScope'

const BASE = 'cardapio_client'

export function saveClientInfo(info: ClientInfo): void {
  try {
    localStorage.setItem(scopedKey(BASE), JSON.stringify(info))
  } catch {
    // storage indisponível (modo privado extremo) → ignora
  }
}

export function loadClientInfo(): ClientInfo | null {
  try {
    // Adota o dado global de quem já usava o app antes do prefixo, uma vez só
    const raw = readScopedWithMigration(BASE)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ClientInfo
    // Valida estrutura mínima
    if (typeof parsed === 'object' && 'name' in parsed) return parsed
    return null
  } catch {
    return null
  }
}

export function clearClientInfo(): void {
  try {
    localStorage.removeItem(scopedKey(BASE))
  } catch {}
}

/** Formata CPF para exibição: "000.000.000-00" */
export function formatCPF(cpf: string): string {
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return cpf
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

/**
 * Máscara progressiva, aplicada enquanto o cliente digita.
 *
 * Corta em 11 dígitos: sem isso o campo aceita 15 números, o cliente não vê
 * problema e o CPF chega truncado na nota fiscal.
 */
export function maskCPFInput(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** Estado do CPF para a interface: vazio é válido, porque o campo é opcional. */
export type CpfState = 'empty' | 'incomplete' | 'invalid' | 'valid'

export function cpfState(cpf: string): CpfState {
  const d = cpf.replace(/\D/g, '')
  if (d.length === 0) return 'empty'
  if (d.length < 11) return 'incomplete'
  return isValidCPF(d) ? 'valid' : 'invalid'
}

export const CPF_MESSAGE: Partial<Record<CpfState, string>> = {
  incomplete: 'O CPF tem 11 dígitos.',
  invalid: 'CPF inválido — confira os números.',
}

/** Valida CPF (dígitos verificadores) */
export function isValidCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i)
  let r = (sum * 10) % 11
  if (r === 10 || r === 11) r = 0
  if (r !== parseInt(d[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i)
  r = (sum * 10) % 11
  if (r === 10 || r === 11) r = 0
  return r === parseInt(d[10])
}

/** Formata telefone para exibição: "(85) 99999-9999" */
export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return phone
}

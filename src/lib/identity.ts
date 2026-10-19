/**
 * Identificação mínima do cliente.
 *
 * Navegar o cardápio é livre — visitante entra, olha e sai. A identificação só
 * é exigida onde ela tem finalidade concreta:
 *
 * - **enviar pedido**: a cozinha e o garçom precisam saber de quem é
 * - **ver a conta**: a conta da mesa é dado de consumo de outras pessoas também;
 *   quem abre precisa estar identificado
 *
 * Pedir cadastro só para ver preço afastaria o cliente sem contrapartida, e
 * coletar dado sem finalidade é o que a LGPD veda.
 */

const onlyDigits = (v: string) => v.replace(/\D/g, '')

/** Telefone brasileiro válido (DDD + fixo ou celular) — ver `phoneState`. */
export function isValidPhone(phone: string): boolean {
  return phoneState(phone) === 'valid'
}

/** Só dígitos, no máximo 11 (DDD + celular) — é o que fica guardado. */
export function phoneDigits(v: string): string {
  return onlyDigits(v).slice(0, 11)
}

/** Máscara só visual, "(99) 999999999": o valor guardado continua sendo só dígitos. */
export function maskPhoneInput(v: string): string {
  const d = phoneDigits(v)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  return `(${d.slice(0, 2)}) ${d.slice(2)}`
}

export type PhoneState = 'empty' | 'incomplete' | 'invalid' | 'valid'

export const PHONE_MESSAGE: Record<PhoneState, string | undefined> = {
  empty: undefined,
  incomplete: 'Telefone incompleto. Use DDD + número.',
  invalid: 'Telefone inválido. Confira o DDD e o número.',
  valid: undefined,
}

/**
 * Validação do perfil: DDD brasileiro (2 dígitos, sem zero), fixo com 10 dígitos
 * ou celular com 11 começando em 9. Vazio não é erro — o telefone só é exigido
 * na hora de pedir (`isValidPhone`).
 */
export function phoneState(phone: string): PhoneState {
  const d = onlyDigits(phone)
  if (!d) return 'empty'
  if (d.length < 10) return 'incomplete'
  if (d.length > 11) return 'invalid'
  if (!/^[1-9][1-9]/.test(d)) return 'invalid'
  if (d.length === 11) return d[2] === '9' ? 'valid' : 'invalid'
  return /^[2-5]/.test(d[2]) ? 'valid' : 'invalid'
}

export function isValidName(name: string): boolean {
  return name.trim().length >= 2
}

export interface IdentityState {
  ok: boolean
  missing: Array<'name' | 'phone'>
}

export function checkIdentity(name: string, phone: string): IdentityState {
  const missing: Array<'name' | 'phone'> = []
  if (!isValidName(name)) missing.push('name')
  if (!isValidPhone(phone)) missing.push('phone')
  return { ok: missing.length === 0, missing }
}

export function identityMessage(missing: Array<'name' | 'phone'>): string {
  if (missing.length === 2) return 'Informe seu nome e telefone para continuar.'
  if (missing[0] === 'name') return 'Informe seu nome para continuar.'
  return 'Informe um telefone válido para continuar.'
}

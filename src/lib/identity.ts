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

/** Aceita fixo (10) e celular (11). Não valida DDD — cliente estrangeiro existe. */
export function isValidPhone(phone: string): boolean {
  const d = onlyDigits(phone)
  return d.length >= 10 && d.length <= 13
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

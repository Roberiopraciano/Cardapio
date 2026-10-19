/**
 * PIN de confirmação de pagamento na mesa (`settingsWeb.usePinOnPayment`).
 *
 * São 4 dígitos: os 2 primeiros são o número da mesa (cadastro da API) e os 2
 * últimos a hora atual, sem minutos — mesa 3 às 18:40 → `0318`.
 *
 * É uma confirmação de presença, não um segredo: o número está na mesa e a hora
 * no relógio. Serve para barrar pedido de quem não está lá, não para autenticar.
 */

export const PIN_LENGTH = 4

/** 2 dígitos: mesa 3 → "03". Acima de 99 vale só o final ("105" → "05"). */
export function pad2(n: number): string {
  return String(Math.abs(Math.trunc(n)) % 100).padStart(2, '0')
}

export function buildPin(tableNumber: number, hour: number): string {
  return pad2(tableNumber) + pad2(hour)
}

/**
 * Horas aceitas. A atual, mais a do instante em que o cliente abriu a tela de
 * revisão: quem começa a digitar às 17:59 e confirma às 18:00 não pode errar o
 * PIN por causa do relógio.
 */
export function acceptedHours(now: Date, openedAt: Date): number[] {
  return [...new Set([now.getHours(), openedAt.getHours()])]
}

/** Depois de acertar o PIN, a mesa fica liberada por 1 hora. */
export const PIN_GRACE_MS = 60 * 60 * 1000

const graceKey = (tableNumber: number) => `pin_ok_mesa_${tableNumber}`

export function markPinVerified(tableNumber: number, now = Date.now()): void {
  try { localStorage.setItem(graceKey(tableNumber), String(now)) } catch { /* storage bloqueado */ }
}

/** true se o PIN dessa mesa foi acertado há menos de 1 hora. */
export function isPinStillValid(tableNumber: number, now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(graceKey(tableNumber)))
    return Number.isFinite(at) && at > 0 && now >= at && now - at < PIN_GRACE_MS
  } catch {
    return false
  }
}

export function isPinValid(
  input: string,
  tableNumber: number,
  now: Date,
  openedAt: Date,
): boolean {
  const typed = input.replace(/\D/g, '')
  if (typed.length !== PIN_LENGTH) return false
  return acceptedHours(now, openedAt).some((h) => buildPin(tableNumber, h) === typed)
}

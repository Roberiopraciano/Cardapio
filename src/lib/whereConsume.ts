import type { WhereConsume } from '../types'
import type { Mode } from './qrParams'

export const ALL_WHERE_CONSUME: WhereConsume[] = ['OnLocal', 'OutsideLocal']

export function allowedWhereConsume(settings: Record<string, unknown> | undefined): WhereConsume[] {
  const raw = settings?.['allowedWhereConsume']
  if (!Array.isArray(raw)) return ALL_WHERE_CONSUME

  const options = raw.filter(
    (option): option is WhereConsume => option === 'OnLocal' || option === 'OutsideLocal',
  )

  return options.length > 0 ? [...new Set(options)] : ALL_WHERE_CONSUME
}

/**
 * Opções de "comer aqui / levar" por modalidade.
 *
 * Mesa só serve no local — não existe mesa para levar. Balcão e delivery seguem
 * o cadastro da unidade (no delivery, "levar" é a retirada).
 */
export function whereConsumeForMode(
  mode: Mode,
  settings: Record<string, unknown> | undefined,
): WhereConsume[] {
  if (mode === 'mesa') return ['OnLocal']
  return allowedWhereConsume(settings)
}

import type { WhereConsume } from '../types'

export const ALL_WHERE_CONSUME: WhereConsume[] = ['OnLocal', 'OutsideLocal']

export function allowedWhereConsume(settings: Record<string, unknown> | undefined): WhereConsume[] {
  const raw = settings?.['allowedWhereConsume']
  if (!Array.isArray(raw)) return ALL_WHERE_CONSUME

  const options = raw.filter(
    (option): option is WhereConsume => option === 'OnLocal' || option === 'OutsideLocal',
  )

  return options.length > 0 ? [...new Set(options)] : ALL_WHERE_CONSUME
}

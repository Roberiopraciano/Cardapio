import type { Branch } from '../types'
import { isKnownMode, type Mode } from './qrParams'

const ALL: Mode[] = ['mesa', 'balcao', 'delivery']

/**
 * Modalidades que a unidade atende.
 *
 * Vale o `allowedModes` do cadastro, quando existe. Senão, os toggles de
 * "Modalidades" do painel (`paymentMethods.<modo>.enabled`). Cadastro sem
 * nenhum dos dois devolve lista vazia = sem restrição, como sempre foi.
 */
export function allowedModesOf(settingsWeb: Branch['settingsWeb'] | undefined): Mode[] {
  const explicit = (settingsWeb?.allowedModes ?? []).filter(isKnownMode)
  if (explicit.length > 0) return explicit

  const methods = settingsWeb?.paymentMethods
  return ALL.filter((m) => methods?.[m]?.enabled === true)
}

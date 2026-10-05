export interface OrderTrackingConfig {
  enabled: boolean
  urlTemplate?: string
  branchIdDesk?: string
  companyIdDesk?: string
}

export function readOrderTrackingConfig(settings?: Record<string, unknown>): OrderTrackingConfig {
  const text = (key: string): string | undefined => {
    const value = settings?.[key]
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
  }

  return {
    enabled: settings?.['orderTrackingEnabled'] === true,
    urlTemplate: text('orderTrackingUrlTemplate'),
    branchIdDesk: text('branchIdDesk'),
    companyIdDesk: text('companyIdDesk'),
  }
}

/**
 * Resolve o template fornecido pela unidade usando somente os IDs Desk que o
 * PDV reconhece. IDs Mongo/guidBranch nunca entram como fallback.
 */
export function buildOrderTrackingUrl(
  template?: string,
  values: { branchIdDesk?: string; companyIdDesk?: string; consumptioncode?: string } = {},
): string | null {
  const source = template?.trim()
  const branchIdDesk = values.branchIdDesk?.trim()
  const companyIdDesk = values.companyIdDesk?.trim()
  const consumptioncode = values.consumptioncode?.trim()

  // Senha e filial são obrigatórias para não abrir o pedido de outra unidade.
  if (!source || !branchIdDesk || !consumptioncode) return null
  if (!source.includes('{{branchIdDesk}}') || !source.includes('{{consumptioncode}}')) return null
  if (source.includes('{{companyIdDesk}}') && !companyIdDesk) return null

  const resolved = source
    .replaceAll('{{branchIdDesk}}', encodeURIComponent(branchIdDesk))
    .replaceAll('{{companyIdDesk}}', encodeURIComponent(companyIdDesk ?? ''))
    .replaceAll('{{consumptioncode}}', encodeURIComponent(consumptioncode))

  if (/{{[^{}]+}}/.test(resolved)) return null

  try {
    const url = new URL(resolved)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

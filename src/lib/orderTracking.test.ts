import { describe, expect, it } from 'vitest'
import { buildOrderTrackingUrl, readOrderTrackingConfig } from './orderTracking'

describe('buildOrderTrackingUrl', () => {
  const template = 'https://acompanharmeupedido.sistemapararestaurante.com.br/?loja={{branchIdDesk}}&pedido={{consumptioncode}}'

  it('usa o id Desk da unidade e a senha real do pedido', () => {
    expect(buildOrderTrackingUrl(template, {
      branchIdDesk: 'branch-desk',
      consumptioncode: 'A 42',
    })).toBe(
      'https://acompanharmeupedido.sistemapararestaurante.com.br/?loja=branch-desk&pedido=A%2042',
    )
  })

  it('substitui company quando o template pedir', () => {
    expect(buildOrderTrackingUrl('https://pedido.test/{{companyIdDesk}}/{{branchIdDesk}}/{{consumptioncode}}', {
      companyIdDesk: 'company-desk', branchIdDesk: 'branch-desk', consumptioncode: 'A42',
    })).toBe('https://pedido.test/company-desk/branch-desk/A42')
  })

  it('não gera link sem template, branch Desk ou senha', () => {
    expect(buildOrderTrackingUrl('', { branchIdDesk: 'branch', consumptioncode: 'A42' })).toBeNull()
    expect(buildOrderTrackingUrl(template, { consumptioncode: 'A42' })).toBeNull()
    expect(buildOrderTrackingUrl(template, { branchIdDesk: 'branch' })).toBeNull()
  })

  it('rejeita template inseguro ou incompleto', () => {
    expect(buildOrderTrackingUrl('javascript:alert({{consumptioncode}})//{{branchIdDesk}}', {
      branchIdDesk: 'branch', consumptioncode: 'A42',
    })).toBeNull()
    expect(buildOrderTrackingUrl('https://pedido.test/{{branchIdDesk}}/{{unknown}}/{{consumptioncode}}', {
      branchIdDesk: 'branch', consumptioncode: 'A42',
    })).toBeNull()
  })

  it('lê a configuração publicada pela branch', () => {
    expect(readOrderTrackingConfig({
      orderTrackingEnabled: true,
      orderTrackingUrlTemplate: `  ${template}  `,
      branchIdDesk: ' branch-desk ',
      companyIdDesk: '',
    })).toEqual({
      enabled: true,
      urlTemplate: template,
      branchIdDesk: 'branch-desk',
      companyIdDesk: undefined,
    })
  })
})

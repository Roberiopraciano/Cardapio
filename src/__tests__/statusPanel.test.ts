import { describe, it, expect } from 'vitest'
import {
  statusTrackingEnabled, passwordPanelEnabled, buildStatusPortalUrl,
} from '../lib/statusPanel'

const BRANCH = '6531aaaa0ce8b35a1c2d4e6f'
const CODE = 'A047'

const on = {
  passwordPanelEnabled: true,
  orderStatusPortalUrl: 'https://painel.exemplo.com/senha',
}

describe('statusTrackingEnabled', () => {
  /**
   * Padrão desligado não é cautela: status que ninguém move é pior que status
   * nenhum. Sem KDS, o cliente olha "Aguardando cozinha" para sempre.
   */
  it('ausente = desligado', () => {
    expect(statusTrackingEnabled(undefined)).toBe(false)
    expect(statusTrackingEnabled({})).toBe(false)
  })

  it('só `true` liga', () => {
    expect(statusTrackingEnabled({ orderStatusEnabled: true })).toBe(true)
    expect(statusTrackingEnabled({ orderStatusEnabled: false })).toBe(false)
  })
})

describe('passwordPanelEnabled', () => {
  it('é chave separada do KDS — casa pode ter um sem o outro', () => {
    expect(passwordPanelEnabled({ passwordPanelEnabled: true })).toBe(true)
    expect(passwordPanelEnabled({})).toBe(false)
  })
})

describe('buildStatusPortalUrl', () => {
  it('monta com os placeholders padrão', () => {
    expect(buildStatusPortalUrl(on, BRANCH, CODE))
      .toBe(`https://painel.exemplo.com/senha?branch=${BRANCH}&code=${CODE}`)
  })

  it('respeita query customizada', () => {
    const s = { ...on, orderStatusPortalQuery: '?loja={branch}&senha={code}' }
    expect(buildStatusPortalUrl(s, BRANCH, CODE))
      .toBe(`https://painel.exemplo.com/senha?loja=${BRANCH}&senha=${CODE}`)
  })

  it('usa & quando a URL base já tem query', () => {
    const s = { ...on, orderStatusPortalUrl: 'https://x.com/p?v=2' }
    expect(buildStatusPortalUrl(s, BRANCH, CODE))
      .toBe(`https://x.com/p?v=2&branch=${BRANCH}&code=${CODE}`)
  })

  it('escapa os valores', () => {
    expect(buildStatusPortalUrl(on, BRANCH, 'A 4/7')).toContain('A%204%2F7')
  })

  // ── Casos em que o link NÃO deve aparecer ──
  // Link que leva a lugar nenhum no meio de um pedido é pior que link ausente.

  it('painel desligado → null', () => {
    expect(buildStatusPortalUrl({ ...on, passwordPanelEnabled: false }, BRANCH, CODE)).toBeNull()
    expect(buildStatusPortalUrl({ orderStatusPortalUrl: on.orderStatusPortalUrl }, BRANCH, CODE)).toBeNull()
  })

  it('sem URL cadastrada → null', () => {
    expect(buildStatusPortalUrl({ passwordPanelEnabled: true }, BRANCH, CODE)).toBeNull()
    expect(buildStatusPortalUrl({ passwordPanelEnabled: true, orderStatusPortalUrl: '  ' }, BRANCH, CODE)).toBeNull()
  })

  it('sem senha ou sem branch → null', () => {
    expect(buildStatusPortalUrl(on, BRANCH, '')).toBeNull()
    expect(buildStatusPortalUrl(on, '', CODE)).toBeNull()
  })

  /**
   * A URL vem do cadastro. `javascript:` num campo de texto que o app injeta em
   * `href` é injeção de script pela porta da frente.
   */
  it('recusa esquema que não seja http(s)', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', '//x.com']) {
      expect(buildStatusPortalUrl({ ...on, orderStatusPortalUrl: url }, BRANCH, CODE)).toBeNull()
    }
  })
})

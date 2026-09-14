/**
 * Acompanhamento de status: KDS e painel de senha.
 *
 * Ambos habilitados pelo backend, e **desligados por padrão**. O motivo não é
 * cautela genérica: status que ninguém move é pior que status nenhum. Sem KDS
 * publicando, o cliente fica olhando "Aguardando cozinha" indefinidamente,
 * conclui que o pedido não chegou, e chama o garçom para conferir — exatamente o
 * trabalho que o cardápio deveria poupar.
 *
 * São duas chaves porque são duas operações:
 *  · casa com KDS e sem painel  → garçom leva à mesa
 *  · casa com painel e sem KDS  → senha chamada à mão, no balcão
 */

const DEFAULT_QUERY = '?branch={branch}&code={code}'

export interface StatusChip {
  label: string
  fg: string
  bg: string
}

/**
 * Rótulo curto de status, para chip de lista.
 *
 * Compartilhado entre conta, histórico e confirmação: eram três tabelas soltas, e
 * três tabelas divergem — o mesmo `ready` já apareceu como "Pronto", "Pronto!
 * Saindo…" e "Saindo para a mesa" em telas diferentes do mesmo app.
 *
 * `ready` muda com o modo: no balcão quem busca é o cliente, e "saindo para a
 * mesa" faria ele esperar sentado.
 */
export function statusChip(
  status: string | undefined,
  mode: 'mesa' | 'balcao' | 'delivery' | 'cartao' = 'mesa',
): StatusChip | null {
  switch (status) {
    case 'pending':
      return { label: 'Na cozinha', fg: '#92400E', bg: 'rgba(245,158,11,.12)' }
    case 'in_progress':
      return { label: 'Em produção', fg: '#1e40af', bg: 'rgba(59,130,246,.10)' }
    case 'ready':
      return {
        label: mode === 'balcao' ? 'Pronto · retire' : 'Pronto',
        fg: '#065f46', bg: 'rgba(16,185,129,.12)',
      }
    case 'on_the_way':
      return { label: 'A caminho', fg: '#1e40af', bg: 'rgba(59,130,246,.10)' }
    case 'delivered':
      return {
        label: mode === 'balcao' ? 'Retirado' : 'Entregue',
        fg: '#064e3b', bg: 'rgba(16,185,129,.07)',
      }
    case 'cancelled':
      return { label: 'Cancelado', fg: '#B91C1C', bg: '#FEE2E2' }
    default:
      // Status desconhecido não inventa rótulo: melhor nada que um chip que o
      // cliente tenta decifrar
      return null
  }
}

/** A casa publica status de pedido? Ausente = não. */
export function statusTrackingEnabled(
  settings: { orderStatusEnabled?: boolean } | undefined | null,
): boolean {
  return settings?.orderStatusEnabled === true
}

/** A casa tem painel de senhas? Ausente = não. */
export function passwordPanelEnabled(
  settings: { passwordPanelEnabled?: boolean } | undefined | null,
): boolean {
  return settings?.passwordPanelEnabled === true
}

interface PortalSettings {
  passwordPanelEnabled?: boolean
  orderStatusPortalUrl?: string
  orderStatusPortalQuery?: string
}

/**
 * URL do portal de consulta, ou `null` quando não deve aparecer.
 *
 * Devolve `null` — em vez de uma URL quebrada — quando o painel está desligado,
 * a URL não foi cadastrada, ou não existe senha ainda. Link que leva a lugar
 * nenhum no meio de um pedido é pior que ausência de link.
 *
 * Só aceita `http(s)`: a URL vem do cadastro, e `javascript:` num campo de texto
 * que o app injeta em `href` é injeção de script pela porta da frente.
 */
export function buildStatusPortalUrl(
  settings: PortalSettings | undefined | null,
  branchId: string,
  code: string,
): string | null {
  if (!passwordPanelEnabled(settings)) return null

  const base = (settings?.orderStatusPortalUrl ?? '').trim()
  if (!base) return null
  if (!/^https?:\/\//i.test(base)) return null

  const c = (code ?? '').trim()
  const b = (branchId ?? '').trim()
  if (!c || !b) return null

  const query = (settings?.orderStatusPortalQuery ?? '').trim() || DEFAULT_QUERY

  // `base` pode já vir com query. Nesse caso o separador é `&`, não `?`
  const rendered = query
    .replace(/\{branch\}/g, encodeURIComponent(b))
    .replace(/\{code\}/g, encodeURIComponent(c))

  if (base.includes('?') && rendered.startsWith('?')) {
    return base + '&' + rendered.slice(1)
  }
  return base + rendered
}

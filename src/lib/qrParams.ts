/**
 * Validação dos parâmetros do QR Code, antes de qualquer requisição.
 *
 * O link do cardápio é digitado por ninguém: ele nasce do QR Code gerado pelo
 * painel. Então um link malformado nunca é erro do cliente — é QR errado, link
 * cortado por app de mensagem, ou alguém que colou a URL pela metade.
 *
 * Validar aqui, e não no backend, tem dois motivos:
 *
 * 1. **A resposta honesta.** Mandar um `_id` de 15 caracteres para a API produz
 *    um 500 (o Mongo não converte), e um 500 genérico virava "sem conexão com o
 *    cardápio" — mentira que faz o cliente reiniciar o Wi-Fi do restaurante
 *    tentando consertar um QR Code torto.
 * 2. **O caminho adiante.** Link inválido só tem uma saída: reescanear. Isso o
 *    app decide sozinho, sem rede.
 */

/** ObjectId do Mongo: 24 caracteres hexadecimais. Ver BACKEND.md. */
const OBJECT_ID = /^[a-f\d]{24}$/i

/**
 * Mesa aceita letra, número, espaço, `-` e `_` (`MESA_03`, `Mesa 12`, `A-4`).
 * O limite existe porque o valor vai no payload do pedido e aparece na comanda
 * impressa — 32 caracteres já é mais que qualquer mesa real.
 */
const TABLE = /^[\p{L}\p{N} _-]{1,32}$/u

const MODES = ['mesa', 'balcao'] as const
export type Mode = (typeof MODES)[number]

/**
 * Modo que este app realmente implementa.
 *
 * Usado também para filtrar `settingsWeb.allowedModes`, que vem do cadastro e
 * pode trazer modo previsto mas não implementado (`cartao` — Fase 2.6 do
 * ROADMAP). Rodar num modo desconhecido não dá erro visível: só troca a regra de
 * pagamento e de senha, e ninguém descobre até a conta sair errada.
 */
export function isKnownMode(v: unknown): v is Mode {
  return typeof v === 'string' && MODES.some((m) => m === v)
}

/** Mesa usada quando o modo é balcão — lá não existe mesa. */
export const COUNTER_TABLE = 'BALCAO'

export interface ValidParams {
  ok: true
  branchId: string
  table: string
  mode: Mode
}

/**
 * `badLink` cobre o que dá para diagnosticar sem rede. `reason` não vai para a
 * tela — o cliente não tem o que fazer com "objectId inválido" — mas vai para o
 * console, que é onde a casa descobre que gerou QR Code errado.
 */
export interface InvalidParams {
  ok: false
  kind: 'noBranch' | 'badLink'
  reason: string
}

export function parseQrParams(search: string): ValidParams | InvalidParams {
  const sp = new URLSearchParams(search)

  const branchId = (sp.get('branch') ?? '').trim()
  if (!branchId) {
    return { ok: false, kind: 'noBranch', reason: 'parâmetro branch ausente' }
  }
  if (!OBJECT_ID.test(branchId)) {
    return {
      ok: false,
      kind: 'badLink',
      // O tamanho entra na mensagem porque link cortado é o caso comum, e
      // "15 de 24" já diz à casa exatamente o que aconteceu
      reason: `branch inválida: "${branchId}" tem ${branchId.length} de 24 caracteres hexadecimais`,
    }
  }

  // Modo tolera caixa e espaço — QR gerado à mão com `mode=Mesa` funciona.
  // O que não passa é um modo desconhecido: seguir no modo errado troca a
  // regra de pagamento e a senha do pedido, e o cliente não descobre até o fim.
  const rawMode = (sp.get('mode') ?? 'mesa').trim().toLowerCase()
  const mode = MODES.find((m) => m === rawMode)
  if (!mode) {
    return { ok: false, kind: 'badLink', reason: `mode inválido: "${rawMode}"` }
  }

  if (mode === 'balcao') {
    // Balcão não tem mesa: um `table` no link é ruído, não erro.
    return { ok: true, branchId, table: COUNTER_TABLE, mode }
  }

  const table = (sp.get('table') ?? '').trim()
  if (!table) {
    // Pedido de mesa sem mesa não tem para onde ser entregue. Antes isso caía
    // no padrão "BALCAO" e a cozinha recebia mesa BALCAO num pedido de salão.
    return { ok: false, kind: 'badLink', reason: 'mode=mesa sem parâmetro table' }
  }
  if (!TABLE.test(table)) {
    return { ok: false, kind: 'badLink', reason: `table inválida: "${table}"` }
  }

  return { ok: true, branchId, table, mode }
}

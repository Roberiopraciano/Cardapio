/**
 * Polling de status do pedido a cada 30s.
 * Dispara toast + vibração quando status muda para "ready".
 *
 * Endpoint: GET api/orders?consumptioncode=X&branch=ID&simpleAuth=TOKEN
 */

import { useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client'
import { toast } from '../store/toastStore'
import { MOCK_BILL, getMockOrderStatus } from '../lib/mockBill'

/**
 * Vocabulário de status, definido pelo backend (ver BACKEND.md).
 *
 * `on_the_way` só ocorre em delivery; os demais valem em todos os modos.
 */
export type OrderStatus =
  | 'pending' | 'in_progress' | 'ready' | 'on_the_way' | 'delivered' | 'cancelled'

/** Modo de operação, para a mensagem não prometer o que aquele modo não faz. */
export type OrderMode = 'mesa' | 'balcao' | 'delivery'

/**
 * Mensagem por status **e por modo**.
 *
 * Antes era uma tabela só, e o `ready` dizia "Saindo para a mesa" — inclusive no
 * balcão, onde não existe mesa para levar. No balcão o cliente precisa saber que
 * é ele quem vai buscar; no delivery, que o pedido saiu para entrega. A mesma
 * palavra ("pronto") pede ação diferente em cada modo.
 */
const STATUS_MESSAGES: Record<OrderMode, Partial<Record<OrderStatus, string>>> = {
  mesa: {
    in_progress: '🔵 Seu pedido está sendo preparado!',
    ready: '🍽 Pedido pronto! Saindo para a mesa.',
    delivered: '✅ Pedido entregue. Bom apetite!',
  },
  balcao: {
    in_progress: '🔵 Seu pedido está sendo preparado!',
    ready: '🔔 Pedido pronto! Retire no balcão com a sua senha.',
    delivered: '✅ Pedido retirado. Bom apetite!',
  },
  delivery: {
    in_progress: '🔵 Seu pedido está sendo preparado!',
    ready: '📦 Pedido pronto, aguardando o entregador.',
    on_the_way: '🛵 Pedido a caminho!',
    delivered: '✅ Pedido entregue. Bom apetite!',
  },
}

interface Props {
  consumptioncode: string
  branchId: string
  simpleAuth: string
  enabled: boolean
  /** Padrão `mesa` — define o texto do aviso de "pronto". */
  mode?: OrderMode
  onStatusChange?: (status: OrderStatus) => void
}

export function useOrderPolling({
  consumptioncode, branchId, simpleAuth, enabled, mode = 'mesa', onStatusChange,
}: Props) {
  const prevStatus = useRef<OrderStatus | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  /** Início do acompanhamento — só usado pelo mock. */
  const startedAt = useRef<number>(0)

  const poll = useCallback(async () => {
    if (!consumptioncode || !branchId) return

    // Progressão falsa para conferir a tela sem depender do KDS.
    // Ver src/lib/mockBill.ts → getMockOrderStatus
    if (MOCK_BILL) {
      if (!startedAt.current) startedAt.current = Date.now()
      const fake = getMockOrderStatus(Date.now() - startedAt.current, mode) as OrderStatus
      if (fake === prevStatus.current) return
      const prevFake = prevStatus.current
      prevStatus.current = fake
      onStatusChange?.(fake)
      if (prevFake === null) return
      const fakeMsg = STATUS_MESSAGES[mode][fake]
      if (fakeMsg) {
        if (fake === 'ready') toast.ready(fakeMsg)
        else toast.info(fakeMsg)
      }
      return
    }

    try {
      const res = await api.getOrdersByCode(consumptioncode, branchId, simpleAuth)
      const orders = res.data ?? []
      if (!orders.length) return

      // Status mais recente (já ordenado por createdAt desc)
      const latest = orders[0].status as OrderStatus
      if (latest === prevStatus.current) return

      const prev = prevStatus.current
      prevStatus.current = latest
      if (prev === null) return   // primeiro poll — não notifica

      const msg = STATUS_MESSAGES[mode][latest]
      if (msg) {
        if (latest === 'ready') {
          toast.ready(msg)
          // Vibração padrão "ready" — dois pulsos
          if ('vibrate' in navigator) {
            navigator.vibrate([300, 100, 300])
          }
        } else {
          toast.info(msg)
        }
      }

      onStatusChange?.(latest)
    } catch {
      // Falha silenciosa — não interrompe a UX
    }
  }, [consumptioncode, branchId, simpleAuth, mode, onStatusChange])

  useEffect(() => {
    if (!enabled || !consumptioncode) return
    // Primeiro poll imediato (pega o status inicial)
    poll()
    // 30s em produção. No mock, 5s: a progressão falsa muda a cada 15s, e com
    // intervalo de 30s a tela saltaria estados — nunca daria para ver "em preparo"
    timerRef.current = setInterval(poll, MOCK_BILL ? 5_000 : 30_000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [enabled, consumptioncode, poll])
}

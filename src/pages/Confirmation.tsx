import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useCartStore } from '../store/cartStore'
import { useOrderPolling } from '../hooks/useOrderPolling'
import { statusTrackingEnabled, buildStatusPortalUrl } from '../lib/statusPanel'
import Icon from '../components/Icon'
import NpsRating from '../components/NpsRating'

export default function Confirmation() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const { branch, params } = useAppStore()
  const { clearCartKeepCodes } = useCartStore()
  const consumptioncode = state?.consumptioncode ?? state?.order?.consumptioncode ?? '—'
  const consumptionint  = state?.consumptionint  ?? state?.order?.consumptionint  ?? null
  const mode = params?.mode ?? 'mesa'

  const [orderStatus, setOrderStatus] = useState<string>('pending')
  const [showNps, setShowNps] = useState(true)

  /**
   * Acompanhamento só existe se a casa publica status (KDS/PDV movendo o pedido).
   * Ver `settingsWeb.orderStatusEnabled` — padrão desligado.
   */
  const tracking = statusTrackingEnabled(branch?.settingsWeb)
  const portalUrl = buildStatusPortalUrl(
    branch?.settingsWeb, params?.branchId ?? '', consumptioncode,
  )

  // Polling de status a cada 30s — desligado quando a casa não publica status.
  // Sem KDS, o poll gastaria bateria e rede para reler `pending` a vida toda.
  useOrderPolling({
    consumptioncode,
    branchId: params?.branchId ?? '',
    simpleAuth: branch?.settingsWeb?.simpleAuth ?? '',
    enabled: tracking && consumptioncode !== '—' && orderStatus !== 'delivered',
    // Sem isso o balcão recebia "Saindo para a mesa" num pedido de retirada
    mode,
    onStatusChange: setOrderStatus,
  })

  const handleMoreItems = () => {
    clearCartKeepCodes()  // mantém consumptioncode
    navigate('/')
  }

  const STATUS_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
    pending:     { label: '🟡 Aguardando cozinha', color: '#92400E', bg: 'rgba(245,158,11,.08)' },
    in_progress: { label: '🔵 Em preparo',         color: '#1e40af', bg: 'rgba(59,130,246,.08)' },
    ready:       { label: '🟢 Pronto! Saindo…',    color: '#065f46', bg: 'rgba(16,185,129,.08)' },
    delivered:   { label: '✅ Entregue',            color: '#064e3b', bg: 'rgba(16,185,129,.06)' },
  }
  const statusInfo = STATUS_DISPLAY[orderStatus] ?? STATUS_DISPLAY.pending

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-5"
      style={{ background: 'var(--bg-page)', paddingBottom: showNps ? 200 : 32 }}>

      {/* Ícone de sucesso */}
      <div className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: 'var(--color-brand-light)' }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
          stroke="var(--color-brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-hi)' }}>Pedido enviado!</h1>
        <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'var(--text-lo)' }}>
          {mode === 'balcao'
            ? `Retire no balcão quando ${state?.clientName || 'seu nome'} for chamado.`
            : `Seu pedido foi para a cozinha. Aguarde na mesa ${params?.table ?? ''}.`}
        </p>
      </div>

      {/* Número / Senha */}
      <div className="w-full max-w-xs rounded-2xl p-5"
        style={{ background: 'var(--color-brand-light)', border: '1px solid var(--color-brand-medium)' }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1"
          style={{ color: 'var(--color-brand)' }}>
          {mode === 'mesa' ? 'Mesa' : 'Sua senha'}
        </p>
        <p className="text-5xl font-bold tracking-widest" style={{ color: 'var(--color-brand)' }}>
          {consumptioncode}
        </p>
        {consumptionint > 0 && (
          <p className="text-sm mt-1" style={{ color: 'var(--color-brand)' }}>
            Pedido #{consumptionint}
          </p>
        )}
      </div>

      {/*
        Status só aparece quando a casa publica status (KDS/PDV movendo o pedido).
        Sem isso o cartão ficaria em "Aguardando cozinha" para sempre, e o cliente
        concluiria que o pedido não chegou — pior que não mostrar nada.
      */}
      {tracking && (
        <div className="w-full max-w-xs rounded-xl px-4 py-3"
          style={{ background: statusInfo.bg, border: `1px solid ${statusInfo.color}25` }}>
          <p className="text-sm font-medium" style={{ color: statusInfo.color }}>
            {statusInfo.label}
          </p>
          <p className="text-xs mt-0.5" style={{ color: statusInfo.color, opacity: 0.7 }}>
            Atualiza automaticamente
          </p>
        </div>
      )}

      {/* Painel de senha: chave separada — existe casa com painel e sem KDS */}
      {portalUrl && (
        <a href={portalUrl} target="_blank" rel="noopener noreferrer"
          className="w-full max-w-xs rounded-xl px-4 py-3 flex items-center justify-center gap-2 border"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <Icon name="phone" size={14} color="var(--color-brand)" />
          <span className="text-sm font-semibold" style={{ color: 'var(--color-brand)' }}>
            Acompanhar no painel de senhas
          </span>
        </a>
      )}

      {/* Botões */}
      <div className="w-full max-w-xs flex flex-col gap-3">
        {/* Pedir mais itens */}
        <button
          onClick={handleMoreItems}
          className="w-full py-3.5 rounded-xl text-white font-semibold text-sm active:scale-[0.98] transition-transform"
          style={{ backgroundColor: 'var(--color-brand)' }}>
          + Pedir mais itens
        </button>

        {/* Conta da mesa */}
        <button
          onClick={() => navigate('/conta')}
          className="w-full py-3 rounded-xl font-medium text-sm border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-hi)', background: 'var(--bg-card)' }}>
          🧾 Ver a conta
        </button>

        {/* Ver pedido / voltar */}
        <button
          onClick={() => navigate('/')}
          className="w-full py-3 rounded-xl font-medium text-sm border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-lo)', background: 'var(--bg-card)' }}>
          Voltar ao cardápio
        </button>
      </div>

      {branch?.name && (
        <p className="text-xs" style={{ color: 'var(--text-lo)' }}>{branch.name}</p>
      )}

      {/* NPS — aparece após 4s */}
      {showNps && (
        /* 4s era tempo suficiente para o cliente já ter tocado em "pedir mais
           itens" e nunca ver a pesquisa */
        <NpsRating
          consumptioncode={consumptioncode}
          delayMs={1200}
          onDismiss={() => setShowNps(false)}
        />
      )}
    </div>
  )
}

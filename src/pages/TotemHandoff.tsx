import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { api, ApiError, type TotemHandoffStatus } from '../api/client'
import { useCartStore } from '../store/cartStore'
import { formatCurrency } from '../lib/pricing'
import {
  loadTotemHandoff, clearTotemHandoff, secondsLeft, formatCountdown,
} from '../lib/totemHandoff'
import HeaderButton from '../components/HeaderButton'
import Icon from '../components/Icon'
import ConfirmModal from '../components/ConfirmModal'
import { toast } from '../store/toastStore'
import {
  buildOrderTrackingUrl, readOrderTrackingConfig, type OrderTrackingConfig,
} from '../lib/orderTracking'

/** Poll do status enquanto o QR está na tela. Curto: o cliente está na frente do totem. */
const POLL_MS = 4_000

/**
 * "Pagar no totem": mostra o QR que o totem lê para carregar o pedido e cobrar.
 *
 * O pedido **ainda não está na cozinha** aqui — é um pré-pedido. Só vira pedido
 * quando o totem cobra no TEF. Por isso a tela nunca diz "pedido enviado":
 * diz "mostre no totem", e só afirma "pago" quando o backend devolve
 * `consumed`, que quem grava é o próprio totem.
 */
export default function TotemHandoffPage() {
  const navigate = useNavigate()
  const [session] = useState(loadTotemHandoff)
  const [serverStatus, setStatus] = useState<TotemHandoffStatus>(session?.handoff.status ?? 'pending')
  const [claimed, setClaimed] = useState(false)
  const [left, setLeft] = useState(() => session ? secondsLeft(session.handoff.expiresAt) : 0)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [tracking, setTracking] = useState<OrderTrackingConfig>(() => ({
    enabled: session?.orderTrackingEnabled === true,
    urlTemplate: session?.orderTrackingUrlTemplate,
    branchIdDesk: session?.trackingBranchIdDesk,
    companyIdDesk: session?.trackingCompanyIdDesk,
  }))

  // Zerou o relógio sem o servidor ter respondido: já vale como expirado
  const status: TotemHandoffStatus = serverStatus === 'pending' && left === 0 ? 'expired' : serverStatus
  const active = status === 'pending'

  // Sem pré-pedido na aba (link aberto direto, aba nova): nada para mostrar
  useEffect(() => {
    if (!session) navigate('/', { replace: true })
  }, [session, navigate])

  // Contagem regressiva — o relógio é lido no intervalo, nunca no render
  useEffect(() => {
    if (!session || status !== 'pending') return
    const id = setInterval(() => setLeft(secondsLeft(session.handoff.expiresAt)), 1000)
    return () => clearInterval(id)
  }, [session, status])

  // Poll: descobre quando o totem abriu o pedido e quando cobrou. Consulta uma
  // última vez mesmo se o relógio local zerou: após um refresh, a sessão ainda
  // guarda `pending`, mas o servidor pode já ter confirmado o pagamento.
  useEffect(() => {
    if (!session || serverStatus !== 'pending') return
    let stop = false
    const tick = async () => {
      try {
        const r = await api.getTotemHandoffStatus(session.handoff.token)
        if (stop) return
        setClaimed(r.claimed)
        setStatus(r.status)
      } catch (e) {
        // 404: o pré-pedido sumiu do servidor — equivale a expirado.
        // Rede: segue tentando; o QR continua válido mesmo sem o poll
        if (!stop && e instanceof ApiError && e.status === 404) setStatus('expired')
      }
    }
    tick()
    const id = setInterval(tick, POLL_MS)
    return () => { stop = true; clearInterval(id) }
  }, [session, serverStatus])

  // A configuração pode ter sido ativada enquanto o cliente estava com o QR
  // aberto. Releia a branch ao confirmar o pagamento, em vez de depender só
  // da cópia feita no sessionStorage quando o handoff nasceu.
  useEffect(() => {
    if (!session || status !== 'consumed') return
    let stopped = false

    api.getBranch(session.branchId)
      .then((response) => {
        if (stopped) return
        const branch = response.data?.[0] as { settingsTotem?: Record<string, unknown> } | undefined
        setTracking(readOrderTrackingConfig(branch?.settingsTotem))
      })
      .catch(() => { /* mantém a cópia da sessão se a rede falhar */ })

    return () => { stopped = true }
  }, [session, status])

  if (!session) return null
  const { handoff, total } = session
  // O botão de acompanhamento é fixo na tela de pagamento confirmado.
  // O `enabled` controla a configuração administrativa, mas não deve fazer a
  // ação desaparecer depois que o cliente já concluiu o pagamento.
  const trackingUrl = buildOrderTrackingUrl(tracking.urlTemplate, {
    branchIdDesk: tracking.branchIdDesk,
    companyIdDesk: tracking.companyIdDesk,
    consumptioncode: session.consumptioncode,
  })

  const openOrderTracking = () => {
    if (!trackingUrl) {
      toast.error('O acompanhamento ainda não está disponível para esta unidade.')
      return
    }

    window.open(trackingUrl, '_blank', 'noopener,noreferrer')
  }

  const backToMenu = () => {
    clearTotemHandoff()
    navigate('/', { replace: true })
  }

  /** Devolve os itens ao carrinho — o cliente não monta tudo de novo. */
  const redo = () => {
    useCartStore.setState({ items: session.items, touchedAt: Date.now() })
    clearTotemHandoff()
    navigate('/checkout', { replace: true })
  }

  const doCancel = async () => {
    setConfirmCancel(false)
    setCancelling(true)
    const r = await api.cancelTotemHandoff(handoff.token)
    setCancelling(false)
    if (r.ok) { setStatus('cancelled'); return }
    if (r.status) { setStatus(r.status); return }
    toast.error('Não foi possível cancelar agora. Tente de novo.')
  }

  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: 'var(--bg-page)', paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}>
      <div className="px-4 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm" style={{ background: 'var(--bg-card)' }}>
        {!active && <HeaderButton icon="back" onClick={backToMenu} label="Voltar ao cardápio" emphasis />}
        <div className="flex-1">
          <h1 className="text-base font-bold" style={{ color: 'var(--text-hi)' }}>Pagar no totem</h1>
          <p className="text-xs" style={{ color: 'var(--text-lo)' }}>Total {formatCurrency(total)}</p>
        </div>
      </div>

      <div className="px-4 pt-6 flex flex-col items-center gap-4 flex-1">
        {active && (
          <>
            {claimed ? (
              <div className="w-full max-w-sm rounded-2xl p-4 flex items-start gap-3"
                style={{ background: 'var(--color-brand-light)' }}>
                <Icon name="success" size={18} color="var(--color-brand)" />
                <p className="text-sm font-medium" style={{ color: 'var(--text-hi)' }}>
                  O totem abriu seu pedido. Finalize o pagamento na tela do totem.
                </p>
              </div>
            ) : (
              <p className="text-sm text-center max-w-sm" style={{ color: 'var(--text-lo)' }}>
                Aproxime este QR Code do leitor do totem. Seu pedido vai aparecer lá
                para você pagar.
              </p>
            )}

            {/* Zona de silêncio de 4 módulos: mínimo recomendado para o leitor
                separar o QR do restante da tela, mesmo com brilho baixo. */}
            <div className="rounded-3xl p-5 shadow-sm" style={{ background: '#ffffff' }}>
              <QRCodeSVG value={handoff.qr} size={248} level="M" marginSize={4}
                bgColor="#ffffff" fgColor="#000000" title="QR Code do pedido para o totem" />
            </div>

            <div className="text-center">
              <p className="text-xs" style={{ color: 'var(--text-lo)' }}>Se o totem não ler, digite o código</p>
              <p className="text-4xl font-bold tracking-widest mt-1" style={{ color: 'var(--text-hi)' }}>
                {handoff.code}
              </p>
            </div>

            <p className="text-xs flex items-center gap-1.5" style={{ color: left <= 60 ? '#dc2626' : 'var(--text-lo)' }}>
              <Icon name="clock" size={11} />
              Válido por {formatCountdown(left)}
            </p>

            <p className="text-xs text-center max-w-sm" style={{ color: 'var(--text-lo)' }}>
              O pedido só vai para a cozinha depois do pagamento no totem.
            </p>

            <button onClick={() => setConfirmCancel(true)} disabled={cancelling}
              className="text-sm font-semibold px-4 py-2.5 rounded-xl border disabled:opacity-60"
              style={{ borderColor: 'var(--border)', color: 'var(--text-lo)' }}>
              {cancelling ? 'Cancelando...' : 'Cancelar e voltar ao pedido'}
            </button>
          </>
        )}

        {status === 'consumed' && (
          <Outcome icon="success" color="var(--color-brand)"
            title="Pagamento confirmado no totem"
            message={`O pedido ${handoff.code} foi pago no totem. Siga as instruções da tela do totem para acompanhar.`}>
            <button type="button" onClick={openOrderTracking}
              className="w-full py-4 rounded-xl text-white font-semibold text-base active:scale-[0.98] transition-transform"
              style={{ backgroundColor: 'var(--color-brand)' }}>
              Acompanhar seu pedido
            </button>
            <PrimaryButton onClick={backToMenu}>Voltar ao cardápio</PrimaryButton>
          </Outcome>
        )}

        {(status === 'expired' || status === 'cancelled') && (
          <Outcome icon={status === 'expired' ? 'waiting' : 'info'} color="var(--text-lo)"
            title={status === 'expired' ? 'Este QR Code expirou' : 'Pedido cancelado'}
            message={status === 'expired'
              ? 'Nada foi cobrado. Gere um novo QR Code com os mesmos itens.'
              : 'Nada foi cobrado. Seus itens continuam guardados, se quiser tentar de novo.'}>
            <PrimaryButton onClick={redo}>Refazer o pedido</PrimaryButton>
            <button onClick={backToMenu} className="text-sm font-semibold py-2"
              style={{ color: 'var(--text-lo)' }}>
              Voltar ao cardápio
            </button>
          </Outcome>
        )}
      </div>

      <ConfirmModal
        open={confirmCancel}
        destructive
        title="Cancelar o pagamento no totem?"
        message="O QR Code deixa de valer. Seus itens voltam para o carrinho se você quiser refazer o pedido."
        confirmLabel="Sim, cancelar"
        cancelLabel="Continuar"
        onConfirm={doCancel}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  )
}

function Outcome({ icon, color, title, message, children }: {
  icon: import('../components/Icon').IconName
  color: string
  title: string
  message: string
  children: React.ReactNode
}) {
  return (
    <div className="w-full max-w-sm flex flex-col items-center text-center gap-3 pt-6">
      <span className="w-16 h-16 rounded-full flex items-center justify-center"
        style={{ background: 'var(--bg-card)' }}>
        <Icon name={icon} size={28} color={color} />
      </span>
      <h2 className="text-lg font-bold" style={{ color: 'var(--text-hi)' }}>{title}</h2>
      <p className="text-sm" style={{ color: 'var(--text-lo)' }}>{message}</p>
      <div className="w-full flex flex-col gap-2 mt-2">{children}</div>
    </div>
  )
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="w-full py-4 rounded-xl text-white font-semibold text-base active:scale-[0.98] transition-transform"
      style={{ backgroundColor: 'var(--color-brand)' }}>
      {children}
    </button>
  )
}

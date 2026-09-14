import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '../store/cartStore'
import { checkIdentity } from '../lib/identity'
import { formatPhone } from '../lib/client_storage'
import Icon from './Icon'
import HeaderButton from './HeaderButton'
import GoogleSignInButton from './GoogleSignInButton'

interface Props {
  /** O que o cliente estava tentando fazer — aparece no texto */
  reason: string
  onDone?: () => void
}

/**
 * Pede nome e telefone antes de liberar uma ação que exige identificação.
 *
 * Não é login: nada é enviado ao servidor aqui, os dados ficam no aparelho e
 * só viajam junto do pedido. Por isso o texto explica o porquê — pedir dado
 * sem justificar é o que faz o cliente abandonar.
 */
export default function IdentifyGate({ reason, onDone }: Props) {
  const navigate = useNavigate()
  const {
    clientName, clientPhone, setClientName, setClientPhone, loadSavedClient,
  } = useCartStore()

  useEffect(() => { loadSavedClient() }, [])

  const identity = checkIdentity(clientName, clientPhone)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      <div className="px-4 py-4 flex items-center gap-3 shadow-sm"
        style={{ background: 'var(--bg-card)' }}>
        <HeaderButton icon="back" onClick={() => navigate('/')} label="Voltar" emphasis />
        <h1 className="text-base font-bold" style={{ color: 'var(--text-hi)' }}>
          Identificação
        </h1>
      </div>

      <div className="px-4 pt-6 flex flex-col items-center gap-5">
        <span className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: 'var(--color-brand-light)' }}>
          <Icon name="profile" size={26} color="var(--color-brand)" />
        </span>

        <div className="text-center">
          <p className="text-lg font-bold" style={{ color: 'var(--text-hi)' }}>
            Quem é você?
          </p>
          <p className="text-sm mt-1.5 max-w-xs" style={{ color: 'var(--text-lo)' }}>
            {reason}
          </p>
        </div>

        <div className="w-full max-w-sm flex flex-col gap-3">
          <GoogleSignInButton />

          <label className="block">
            <span className="block text-xs mb-1" style={{ color: 'var(--text-lo)' }}>
              Nome <span style={{ color: '#dc2626' }}>*</span>
            </span>
            <input
              type="text"
              autoComplete="name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Como podemos te chamar"
              className="w-full text-sm rounded-xl px-3 py-3.5 outline-none"
              style={{ background: 'var(--bg-input)', color: 'var(--text-hi)', border: '1px solid var(--border)' }}
            />
          </label>

          <label className="block">
            <span className="block text-xs mb-1" style={{ color: 'var(--text-lo)' }}>
              Telefone <span style={{ color: '#dc2626' }}>*</span>
            </span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="(00) 00000-0000"
              className="w-full text-sm rounded-xl px-3 py-3.5 outline-none"
              style={{ background: 'var(--bg-input)', color: 'var(--text-hi)', border: '1px solid var(--border)' }}
            />
            {clientPhone.trim() && (
              <span className="block text-xs mt-1" style={{ color: 'var(--text-lo)' }}>
                {formatPhone(clientPhone)}
              </span>
            )}
          </label>

          <button
            onClick={() => onDone?.()}
            disabled={!identity.ok}
            className="w-full py-3.5 rounded-xl text-white font-semibold text-sm disabled:opacity-40 active:scale-[0.98] transition-transform"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            Continuar
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full py-3 rounded-xl font-medium text-sm border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-lo)', background: 'var(--bg-card)' }}
          >
            Continuar só olhando o cardápio
          </button>

          <p className="text-xs text-center mt-1" style={{ color: 'var(--text-lo)' }}>
            Fica guardado neste aparelho. Só é enviado junto do seu pedido.
          </p>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import HeaderButton from './HeaderButton'
import {
  type DeliveryAddress, type Neighborhood, EMPTY_ADDRESS, UFS, CepNotFoundError,
  cepDigits, maskCep, lookupCep, missingAddressFields, matchNeighborhood,
} from '../lib/deliveryAddress'

/** Montado só enquanto aberto: o estado nasce do `initial` a cada abertura. */
interface Props {
  initial: DeliveryAddress | null
  /** Bairros atendidos pela unidade; vazio = bairro digitado, sem taxa por bairro. */
  neighborhoods: Neighborhood[]
  onClose: () => void
  onConfirm: (address: DeliveryAddress) => void
}

/**
 * Endereço de entrega em dois passos: CEP (preenche rua, bairro e cidade pelo
 * ViaCEP) e depois o formulário. "Não sei meu CEP" pula direto para o formulário.
 */
export default function DeliveryAddressModal({ initial, neighborhoods, onClose, onConfirm }: Props) {
  // Reabrir com endereço já informado vai direto para a edição
  const [step, setStep] = useState<'cep' | 'form'>(initial ? 'form' : 'cep')
  const [cep, setCep] = useState(initial?.cep ? maskCep(initial.cep) : '')
  const [address, setAddress] = useState<DeliveryAddress>(initial ?? EMPTY_ADDRESS)
  const [loading, setLoading] = useState(false)
  const [cepError, setCepError] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const searchCep = async () => {
    if (cepDigits(cep).length !== 8) { setCepError('Digite os 8 números do CEP.'); return }
    setLoading(true); setCepError(null)
    try {
      const found = await lookupCep(cep)
      // Rua do cadastro anterior não vale para outro CEP; número e complemento também não
      // Bairro do ViaCEP só vale se a unidade atende: aí já vem escolhido (e com taxa)
      const hood = neighborhoods.length > 0 ? matchNeighborhood(found.district ?? '', neighborhoods) : null
      setAddress({
        ...EMPTY_ADDRESS, ...found,
        district: hood?.name ?? (neighborhoods.length > 0 ? '' : found.district ?? ''),
        neighborhoodId: hood?._id ?? '',
      })
      setStep('form')
    } catch (e) {
      setCepError(e instanceof CepNotFoundError
        ? 'CEP não encontrado. Confira os números ou preencha o endereço manualmente.'
        : 'Não foi possível buscar o CEP agora. Preencha o endereço manualmente.')
    } finally { setLoading(false) }
  }

  const set = (key: keyof DeliveryAddress) => (v: string) => setAddress((a) => ({ ...a, [key]: v }))
  const missing = missingAddressFields(address, neighborhoods)

  const confirm = () => {
    if (missing.length > 0) { setShowErrors(true); return }
    onConfirm({
      ...address,
      ...Object.fromEntries(Object.entries(address).map(([k, v]) => [k, v.trim()])),
    } as DeliveryAddress)
  }

  const field = (key: keyof DeliveryAddress, label: string, opts: {
    required?: boolean; hint?: string; inputMode?: 'text' | 'numeric'; autoComplete?: string
  } = {}) => {
    const invalid = showErrors && missing.includes(key)
    return (
      <div className="min-w-0">
        <label className="block text-xs font-medium mb-1" style={{ color: invalid ? '#dc2626' : 'var(--text-lo)' }}>
          {label}{opts.required && ' *'}
        </label>
        <input
          value={address[key]}
          onChange={(e) => set(key)(e.target.value)}
          inputMode={opts.inputMode ?? 'text'}
          autoComplete={opts.autoComplete ?? 'off'}
          className="w-full text-sm rounded-xl px-3 py-3 outline-none"
          style={{
            background: 'var(--bg-input)', color: 'var(--text-hi)',
            border: `1px solid ${invalid ? '#dc2626' : 'var(--border)'}`,
          }}
        />
        {opts.hint && <p className="text-[11px] mt-1" style={{ color: 'var(--text-lo)' }}>{opts.hint}</p>}
      </div>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose} role="dialog" aria-modal="true" aria-label="Endereço de entrega">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[92vh]"
        style={{ background: 'var(--bg-card)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--text-hi)' }}>Endereço de entrega</h2>
          <HeaderButton icon="close" onClick={onClose} label="Fechar" />
        </div>

        {step === 'cep' ? (
          <div className="px-6 py-8 flex flex-col items-center text-center gap-5">
            <p className="text-sm" style={{ color: 'var(--text-lo)' }}>
              Informe seu CEP para verificarmos se entregamos em sua região
            </p>
            <input
              autoFocus inputMode="numeric" autoComplete="postal-code"
              placeholder="00000-000"
              value={cep}
              onChange={(e) => { setCep(maskCep(e.target.value)); setCepError(null) }}
              onKeyDown={(e) => e.key === 'Enter' && searchCep()}
              className="w-full max-w-[260px] text-center text-4xl font-light tracking-wider outline-none bg-transparent"
              style={{ color: 'var(--text-hi)' }}
            />
            {cepError && <p className="text-xs" style={{ color: '#dc2626' }}>{cepError}</p>}
            <button onClick={searchCep} disabled={loading || cepDigits(cep).length !== 8}
              className="w-full max-w-[260px] py-3 rounded-xl text-white text-sm font-semibold uppercase disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-brand)' }}>
              {loading ? 'Buscando…' : 'Buscar CEP'}
            </button>
            <button onClick={() => { setAddress((a) => ({ ...a, cep: cepDigits(cep) })); setStep('form') }}
              className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
              Não sei meu CEP
            </button>
          </div>
        ) : (
          <>
            <div className="px-5 py-5 flex flex-col gap-3 overflow-y-auto">
              <div className="grid grid-cols-[1fr_88px] gap-3">
                {field('street', 'Rua', { required: true, autoComplete: 'address-line1' })}
                {field('number', 'Nº', { required: true, inputMode: 'numeric' })}
              </div>
              {neighborhoods.length > 0 ? (
                <div>
                  <label className="block text-xs font-medium mb-1"
                    style={{ color: showErrors && missing.includes('district') ? '#dc2626' : 'var(--text-lo)' }}>
                    Bairro *
                  </label>
                  <select value={address.neighborhoodId}
                    onChange={(e) => {
                      const hood = neighborhoods.find((n) => n._id === e.target.value)
                      setAddress((a) => ({ ...a, neighborhoodId: hood?._id ?? '', district: hood?.name ?? '' }))
                    }}
                    className="w-full text-sm rounded-xl px-3 py-3 outline-none"
                    style={{
                      background: 'var(--bg-input)', color: 'var(--text-hi)',
                      border: `1px solid ${showErrors && missing.includes('district') ? '#dc2626' : 'var(--border)'}`,
                    }}>
                    <option value="">Selecione o bairro</option>
                    {neighborhoods.map((n) => (
                      <option key={n._id} value={n._id}>{n.name}</option>
                    ))}
                  </select>
                </div>
              ) : field('district', 'Bairro', { required: true })}
              {field('complement', 'Complemento', { hint: 'Apto/Bloco/Casa' })}
              {field('reference', 'Ponto de referência', { required: true })}
              <div className="grid grid-cols-[1fr_96px] gap-3">
                {field('city', 'Cidade', { required: true, autoComplete: 'address-level2' })}
                <div>
                  <label className="block text-xs font-medium mb-1"
                    style={{ color: showErrors && missing.includes('state') ? '#dc2626' : 'var(--text-lo)' }}>
                    Estado *
                  </label>
                  <select value={address.state} onChange={(e) => set('state')(e.target.value)}
                    className="w-full text-sm rounded-xl px-3 py-3 outline-none"
                    style={{ background: 'var(--bg-input)', color: 'var(--text-hi)', border: '1px solid var(--border)' }}>
                    <option value="">UF</option>
                    {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>
              {showErrors && missing.length > 0 && (
                <p className="text-xs" style={{ color: '#dc2626' }}>Preencha os campos marcados com *.</p>
              )}
            </div>
            <div className="px-5 pb-5 pt-1 grid grid-cols-2 gap-3 flex-shrink-0">
              <button onClick={() => setStep('cep')}
                className="py-3 rounded-xl text-sm font-semibold uppercase border"
                style={{ borderColor: 'var(--color-brand)', color: 'var(--color-brand)', background: 'var(--bg-card)' }}>
                Voltar
              </button>
              <button onClick={confirm}
                className="py-3 rounded-xl text-white text-sm font-semibold uppercase"
                style={{ backgroundColor: 'var(--color-brand)' }}>
                Confirmar
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useCartStore } from '../store/cartStore'
import { useLangStore } from '../store/langStore'
import { LANG_META } from '../lib/i18n'
import type { Lang } from '../lib/i18n'
import {
  clearClientInfo, formatPhone, formatCPF, cpfState, CPF_MESSAGE, maskCPFInput,
} from '../lib/client_storage'
import { getConsent, setConsent } from '../lib/consent'
import { toast } from '../store/toastStore'
import HeaderButton from '../components/HeaderButton'
import Flag from '../components/Flag'
import AvatarPicker from '../components/AvatarPicker'
import { loadAvatar, clearAvatar } from '../lib/avatar'
import QrScanner, { SCAN_MESSAGE } from '../components/QrScanner'
import type { ScanState } from '../components/QrScanner'
import Icon from '../components/Icon'

/**
 * Perfil do cliente.
 *
 * Os dados ficam no aparelho (localStorage), nunca numa conta — o cardápio não
 * tem login. Editar aqui evita o cliente redigitar nome e telefone a cada
 * pedido, e dá a ele um lugar para apagar o que ficou guardado.
 */
/** Monta o e-mail de solicitação já preenchido, para o cliente só apertar enviar. */
function buildErasureMailto(to: string, branchName?: string, name?: string, phone?: string): string {
  const subject = 'Solicitação de exclusão de dados (LGPD)'
  const body = [
    `Solicito a exclusão dos meus dados pessoais${branchName ? ` no ${branchName}` : ''},`,
    'nos termos do art. 18 da Lei 13.709/2018 (LGPD).',
    '',
    `Nome: ${name?.trim() || '(preencher)'}`,
    `Telefone: ${phone?.trim() || '(preencher)'}`,
  ].join('\n')
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export default function Profile() {
  const navigate = useNavigate()
  const { branch, params } = useAppStore()
  const {
    clientName, clientPhone, clientCpf,
    clientEmail, setClientEmail,
    setClientName, setClientPhone, setClientCpf, loadSavedClient,
  } = useCartStore()
  const { lang, available, setLang } = useLangStore()

  const [consent, setConsentState] = useState<'granted' | 'denied' | null>(null)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanState, setScanState] = useState<ScanState>('idle')

  useEffect(() => {
    loadSavedClient()
    setConsentState(getConsent())
    setAvatar(loadAvatar())
  }, [])

  const cpf = cpfState(clientCpf)
  const privacyUrl = branch?.settingsWeb?.privacyPolicyUrl?.trim()
  const privacyEmail = branch?.settingsWeb?.privacyContactEmail?.trim()
  const askEmail = branch?.settingsWeb?.askEmail === true

  const handleForget = () => {
    clearClientInfo()
    // A foto mora em chave separada — sem isso ela sobreviveria ao "apagar
    // meus dados", que é exatamente o que o cliente não espera
    clearAvatar()
    setAvatar(null)
    setClientName('')
    setClientPhone('')
    setClientCpf('')
    setClientEmail('')
    toast.success('Seus dados foram apagados deste aparelho.')
  }

  const toggleConsent = () => {
    const next = consent === 'granted' ? 'denied' : 'granted'
    setConsent(next)
    setConsentState(next)
    toast.info(next === 'granted'
      ? 'Analytics ativado. Vale a partir do próximo carregamento.'
      : 'Analytics desativado. Vale a partir do próximo carregamento.')
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--bg-page)' }}>
      <div className="px-4 py-4 sticky top-0 z-10 shadow-sm flex items-center gap-3"
        style={{ background: 'var(--bg-card)' }}>
        <HeaderButton icon="back" onClick={() => navigate(-1)} label="Voltar" emphasis />
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold" style={{ color: 'var(--text-hi)' }}>Perfil</h1>
          <p className="text-xs" style={{ color: 'var(--text-lo)' }}>
            Guardado só neste aparelho
          </p>
        </div>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-4">
        {/* Atalhos — em mesa a aba mostra "Conta", então o histórico local só
            chega aqui; em balcão vale o contrário */}
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <ShortcutRow icon="bill" label="Meus pedidos"
            hint="Enviados por este aparelho"
            onClick={() => navigate('/pedidos')} />
          {params?.mode === 'mesa' && (
            <ShortcutRow icon="table" label="Conta da mesa"
              hint={params?.table ? `Mesa ${params.table}` : undefined}
              onClick={() => navigate('/conta')} />
          )}
          {/* Trocar de mesa sem precisar sair do app e abrir a câmera do
              sistema — é o caminho de quem mudou de lugar no salão */}
          <ShortcutRow icon="qrcode" label="Escanear outro QR Code"
            hint="Trocar de mesa ou de unidade"
            onClick={() => { setScanState('idle'); setScannerOpen(true) }} />
        </div>

        {SCAN_MESSAGE[scanState] && (
          <p className="text-xs -mt-2 px-1"
            style={{ color: scanState === 'foreign' ? '#dc2626' : 'var(--text-lo)' }}>
            {SCAN_MESSAGE[scanState]}
          </p>
        )}

        <QrScanner
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onState={setScanState}
        />

        {/* Dados do cliente */}
        <Card title="Seus dados">
          <AvatarPicker value={avatar} onChange={setAvatar} name={clientName} />
          <Field
            label="Nome"
            value={clientName}
            onChange={setClientName}
            placeholder="Seu nome"
          />
          <Field
            label="Telefone"
            value={clientPhone}
            onChange={setClientPhone}
            placeholder="(00) 00000-0000"
            type="tel"
            hint={clientPhone.trim() ? formatPhone(clientPhone) : undefined}
          />
          {askEmail && (
            <Field
              label="E-mail (opcional)"
              value={clientEmail}
              onChange={setClientEmail}
              placeholder="voce@email.com"
              type="email"
            />
          )}
          <Field
            label="CPF na nota (opcional)"
            value={clientCpf}
            onChange={(v) => setClientCpf(maskCPFInput(v))}
            placeholder="000.000.000-00"
            hint={cpf === 'valid' ? formatCPF(clientCpf) : undefined}
            error={CPF_MESSAGE[cpf]}
          />
          <p className="text-xs" style={{ color: 'var(--text-lo)' }}>
            Preenchemos automaticamente na hora do pedido. Nada é enviado antes disso.
          </p>
        </Card>

        {/* Idioma */}
        {available.length > 1 && (
          <Card title="Idioma">
            <div className="flex flex-col gap-2">
              {available.map((l: Lang) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left"
                  style={l === lang
                    ? { background: 'var(--color-brand-light)', color: 'var(--color-brand)' }
                    : { background: 'var(--bg-input)', color: 'var(--text-hi)' }
                  }
                >
                  <Flag lang={l} size={22} />
                  <span className="text-sm font-medium flex-1">{LANG_META[l].label}</span>
                  {l === lang && <Icon name="check" size={13} />}
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Privacidade */}
        <Card title="Privacidade">
          <button
            onClick={toggleConsent}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left"
            style={{ background: 'var(--bg-input)' }}
          >
            <span className="flex-1">
              <span className="block text-sm font-medium" style={{ color: 'var(--text-hi)' }}>
                Analytics
              </span>
              <span className="block text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
                {consent === 'granted' ? 'Ativado' : 'Desativado'}
              </span>
            </span>
            <span
              className="w-11 h-6 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors"
              style={{ background: consent === 'granted' ? 'var(--color-brand)' : 'var(--border)' }}
            >
              <span
                className="w-5 h-5 rounded-full bg-white transition-transform"
                style={{ transform: consent === 'granted' ? 'translateX(20px)' : 'none' }}
              />
            </span>
          </button>

          {privacyUrl && (
            <a
              href={privacyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 rounded-xl text-sm font-medium border flex items-center justify-center gap-2"
              style={{ borderColor: 'var(--border)', color: 'var(--text-hi)', background: 'var(--bg-card)' }}
            >
              <Icon name="info" size={13} /> Política de privacidade
            </a>
          )}

          <button
            onClick={handleForget}
            className="w-full py-3 rounded-xl text-sm font-semibold border"
            style={{ borderColor: 'var(--border)', color: '#dc2626', background: 'var(--bg-card)' }}
          >
            Apagar meus dados deste aparelho
          </button>

          {/*
            Apagar local resolve só o que está no celular. O restaurante tem os
            pedidos no servidor dele, e a LGPD (art. 18, VI) dá ao titular o
            direito de pedir a exclusão desses também — sem um canal, o botão
            acima daria a falsa impressão de que tudo sumiu.
          */}
          {privacyEmail && (
            <a
              href={buildErasureMailto(privacyEmail, branch?.name, clientName, clientPhone)}
              className="w-full py-3 rounded-xl text-sm font-medium border flex items-center justify-center gap-2"
              style={{ borderColor: 'var(--border)', color: 'var(--text-lo)', background: 'var(--bg-card)' }}
            >
              <Icon name="trash" size={13} /> Solicitar exclusão dos meus dados
            </a>
          )}
          <p className="text-xs" style={{ color: 'var(--text-lo)' }}>
            Apagar aqui remove só o que está guardado neste celular. Os pedidos já
            enviados ficam no sistema do restaurante.
          </p>
        </Card>

        {/* Sobre a unidade */}
        <Card title="Restaurante">
          <Info label="Unidade" value={branch?.name ?? '—'} />
          {params?.mode === 'mesa' && params?.table && (
            <Info label="Mesa" value={params.table} />
          )}
          <Info label="Modo" value={params?.mode === 'balcao' ? 'Balcão' : 'Mesa'} />
        </Card>

        <button
          onClick={() => navigate('/')}
          className="w-full py-3.5 rounded-xl text-white font-semibold text-sm"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          Voltar ao cardápio
        </button>
      </div>
    </div>
  )
}

function ShortcutRow({ icon, label, hint, onClick }: {
  icon: 'bill' | 'table' | 'qrcode'
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left border-b last:border-0"
      style={{ borderColor: 'var(--divider)' }}>
      <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--color-brand-light)' }}>
        <Icon name={icon} size={15} color="var(--color-brand)" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium" style={{ color: 'var(--text-hi)' }}>{label}</span>
        {hint && <span className="block text-xs" style={{ color: 'var(--text-lo)' }}>{hint}</span>}
      </span>
      <span style={{ color: 'var(--text-lo)', transform: 'rotate(-90deg)' }}>
        <Icon name="chevron" size={12} />
      </span>
    </button>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-3"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>{title}</p>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', hint, error }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: string
  hint?: string
  error?: string
}) {
  return (
    <label className="block">
      <span className="block text-xs mb-1" style={{ color: 'var(--text-lo)' }}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm rounded-xl px-3 py-3 outline-none"
        style={{
          background: 'var(--bg-input)',
          color: 'var(--text-hi)',
          border: `1px solid ${error ? '#dc2626' : 'var(--border)'}`,
        }}
      />
      {error
        ? <span className="block text-xs mt-1" style={{ color: '#dc2626' }}>{error}</span>
        : hint && <span className="block text-xs mt-1" style={{ color: 'var(--text-lo)' }}>{hint}</span>}
    </label>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span style={{ color: 'var(--text-lo)' }}>{label}</span>
      <span style={{ color: 'var(--text-hi)' }}>{value}</span>
    </div>
  )
}

import { useRef, useState } from 'react'
import { saveAvatarFromFile, clearAvatar, AVATAR_ERROR } from '../lib/avatar'
import type { AvatarError } from '../lib/avatar'
import Icon from './Icon'

interface Props {
  /** Data URL atual, ou null */
  value: string | null
  onChange: (dataUrl: string | null) => void
  /** Inicial exibida quando não há foto */
  name?: string
  size?: number
}

/**
 * Avatar do cliente, com escolha de foto.
 *
 * `capture` fica **de fora** do input de propósito: no celular, sem ele o
 * sistema oferece câmera *e* galeria; com `capture` força a câmera e tira a
 * opção de usar uma foto que a pessoa já tem.
 */
export default function AvatarPicker({ value, onChange, name, size = 72 }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AvatarError | null>(null)

  const initial = (name ?? '').trim().charAt(0).toLocaleUpperCase('pt-BR')

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    const result = await saveAvatarFromFile(file)
    setBusy(false)
    if (result === 'tipo' || result === 'leitura' || result === 'espaco') {
      setError(result)
      return
    }
    onChange(result)
  }

  const remove = () => {
    clearAvatar()
    onChange(null)
    setError(null)
  }

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={value ? 'Trocar foto' : 'Adicionar foto'}
        className="relative rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden active:scale-95 transition-transform"
        style={{
          width: size,
          height: size,
          background: 'var(--color-brand-light)',
          border: '2px solid var(--color-brand-medium)',
        }}
      >
        {value ? (
          <img src={value} alt="" className="w-full h-full object-cover" />
        ) : initial ? (
          <span className="font-bold" style={{ fontSize: size * 0.4, color: 'var(--color-brand)' }}>
            {initial}
          </span>
        ) : (
          <Icon name="profile" size={size * 0.38} color="var(--color-brand)" />
        )}

        {/* Selo de câmera, para ficar claro que é clicável */}
        <span
          className="absolute bottom-0 right-0 rounded-full flex items-center justify-center"
          style={{
            width: size * 0.32,
            height: size * 0.32,
            background: 'var(--color-brand)',
            border: '2px solid var(--bg-card)',
            color: '#fff',
          }}
        >
          <Icon name="camera" size={size * 0.15} />
        </span>
      </button>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-hi)' }}>
          {value ? 'Sua foto' : 'Adicionar foto'}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
          {busy
            ? 'Processando…'
            : error
            ? AVATAR_ERROR[error]
            : 'Fica só neste aparelho, nunca vai no pedido'}
        </p>
        {value && !busy && (
          <button
            onClick={remove}
            className="text-xs font-semibold mt-1.5"
            style={{ color: '#dc2626' }}
          >
            Remover foto
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          // Zera para permitir escolher o MESMO arquivo de novo
          e.target.value = ''
        }}
      />
    </div>
  )
}

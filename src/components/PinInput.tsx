import { useRef } from 'react'
import { PIN_LENGTH } from '../lib/pin'

/**
 * Campo de PIN no estilo OTP: uma caixa por dígito, foco avança sozinho,
 * backspace volta e colar "0318" preenche tudo.
 */
export default function PinInput({
  value,
  onChange,
  invalid = false,
}: {
  value: string
  onChange: (v: string) => void
  invalid?: boolean
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const digits = Array.from({ length: PIN_LENGTH }, (_, i) => value[i] ?? '')

  const set = (next: string) => onChange(next.replace(/\D/g, '').slice(0, PIN_LENGTH))

  const handleChange = (i: number, raw: string) => {
    const typed = raw.replace(/\D/g, '')
    if (!typed) {
      set(digits.map((d, idx) => (idx === i ? '' : d)).join(''))
      return
    }
    // Vários dígitos de uma vez (autopreenchimento ou colar): espalha a partir de `i`
    const next = digits.slice()
    typed.split('').forEach((d, k) => { if (i + k < PIN_LENGTH) next[i + k] = d })
    set(next.join(''))
    refs.current[Math.min(i + typed.length, PIN_LENGTH - 1)]?.focus()
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
  }

  return (
    <div className="flex justify-center gap-3" role="group" aria-label="PIN de pagamento">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={PIN_LENGTH}
          aria-label={`Dígito ${i + 1} do PIN`}
          className="w-12 h-14 text-center text-2xl font-bold rounded-xl border outline-none"
          style={{
            background: 'var(--bg-card)',
            color: 'var(--text-hi)',
            borderColor: invalid ? '#dc2626' : d ? 'var(--color-brand)' : 'var(--border)',
          }}
        />
      ))}
    </div>
  )
}

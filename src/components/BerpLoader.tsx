import { lazy, Suspense } from 'react'

// Sob demanda, como o LottieBox do ConfirmModal: a animação é pesada e só aparece
// enquanto uma tela espera dados; não entra no primeiro carregamento do cardápio.
const Animation = lazy(() => import('./BerpLoaderAnimation'))

/**
 * Indicador de carregamento da Berp (a mesma animação da tela inicial).
 * Enquanto a animação baixa, mostra a bolinha pulsante da splash, para nunca
 * ficar um buraco em branco.
 */
export default function BerpLoader({ size = 120, label }: { size?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-2 py-10">
      <div style={{ width: size, height: size }} className="flex items-center justify-center">
        <Suspense
          fallback={
            <span aria-hidden="true" className="block rounded-full"
              style={{
                width: size * 0.35, height: size * 0.35, background: '#3e9ed5',
                animation: 'berp-breathe 1.2s ease-in-out infinite',
              }} />
          }
        >
          <Animation size={size} />
        </Suspense>
      </div>
      <style>{'@keyframes berp-breathe{0%,100%{transform:scale(.7);opacity:.5}50%{transform:scale(1);opacity:1}}'}</style>
      {label ? <p className="text-sm" style={{ color: 'var(--text-lo)' }}>{label}</p> : <span className="sr-only">Carregando</span>}
    </div>
  )
}

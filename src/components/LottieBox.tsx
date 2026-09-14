import { useLottie } from 'lottie-react'

/**
 * Wrapper do Lottie, isolado num arquivo próprio **para poder ser carregado sob
 * demanda** (`React.lazy` no ConfirmModal).
 *
 * Motivo: `lottie-web` pesa ~100 KB gzip e traz um `eval()` para expressões de
 * animação — o que gera aviso no build e infla o chunk inicial além de 500 KB.
 * Como a animação só aparece num modal de confirmação raro, não faz sentido ela
 * estar no primeiro carregamento, que é a tela que o cliente vê com fome.
 *
 * Usa o hook `useLottie` (export nomeado) em vez do componente default: o
 * pacote é CJS e o interop do Vite embrulha o `default` duas vezes, fazendo o
 * React receber um objeto onde esperava função.
 */
export default function LottieBox({ data, size }: { data: unknown; size: number }) {
  const { View } = useLottie(
    { animationData: data, loop: true },
    { width: size, height: size },
  )
  return <>{View}</>
}

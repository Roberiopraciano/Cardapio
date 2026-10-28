import LottieBox from './LottieBox'
import animation from '../assets/berp_loader.json'

/** A animação da Berp da tela inicial (`bootSplash.ts`). Carregada sob demanda por `BerpLoader`. */
export default function BerpLoaderAnimation({ size }: { size: number }) {
  return <LottieBox data={animation} size={size} />
}

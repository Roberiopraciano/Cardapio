/**
 * Splash de carregamento inicial, com entrada própria no index.html.
 *
 * Roda em paralelo com o bundle principal (que é bem maior) e pinta o Lottie
 * numa camada fixa por cima do #root. Assim a animação já está na tela enquanto
 * o React e a API ainda carregam, e continua sem reiniciar até o boot terminar
 * (App chama `window.__hideBootSplash`).
 *
 * Usa `lottie_light`: sem suporte a expressões (esta animação não usa), bem
 * menor que o `lottie-web` completo.
 */
import lottie from 'lottie-web/build/player/lottie_light'
import animation from './assets/berp_loader.json'

declare global {
  interface Window { __hideBootSplash?: () => void }
}

const el = document.getElementById('boot-splash')
if (el) {
  const box = el.querySelector<HTMLElement>('[data-lottie]')!
  box.innerHTML = ''
  lottie.loadAnimation({
    container: box,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    animationData: animation,
  })
  window.__hideBootSplash = () => {
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 250)
  }
}

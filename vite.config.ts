import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Domínios de túnel liberados no dev server e no preview.
 *
 * `allowedHosts` existe contra DNS rebinding: sem ele, um site malicioso pode
 * apontar um domínio para 127.0.0.1 e ler o que o seu servidor local serve.
 * Por isso a lista é explícita, com `.` na frente para casar subdomínios — e
 * não `true`, que desligaria a checagem inteira.
 *
 * Testar por túnel HTTPS é necessário aqui: câmera (scanner de QR), Service
 * Worker e `navigator.vibrate` não funcionam em HTTP fora de localhost.
 */
const TUNNEL_HOSTS = [
  '.ngrok-free.dev',
  '.ngrok-free.app',
  '.ngrok.io',
  '.ngrok.app',
  '.trycloudflare.com',
  '.loca.lt',
]

/**
 * Service worker no `npm run dev`.
 *
 * Desligado por padrão: em desenvolvimento o SW cacheia módulos e faz a tela
 * mostrar código velho depois de salvar, o que custa horas de depuração falsa.
 *
 * Para testar instalação do PWA, prefira `npm run preview:tunnel` — ele serve
 * o build real, que é o que o cliente vai receber. Este flag existe só para
 * quando você precisar iterar no comportamento do SW:
 *
 *     VITE_PWA_DEV=true npm run dev
 */
const PWA_IN_DEV = process.env.VITE_PWA_DEV === 'true'

/**
 * Modo de teste local (só `npm run dev`): o app fala com o próprio Vite, que
 * repassa as chamadas. Liga quando `DEV_PROXY_API` está no `.env.development.local`
 * — ver o bloco "Testar localmente" no `.env.example`.
 *
 * - `/api/totem-handoffs` → `DEV_PROXY_LOCAL_API` (Laravel local, enquanto as
 *   rotas novas não estão em produção)
 * - todo o resto de `/api` → `DEV_PROXY_API` (a API de verdade)
 */
function devProxy(env: Record<string, string>): Record<string, ProxyOptions> | undefined {
  const remote = env.DEV_PROXY_API
  if (!remote) return undefined
  const local = env.DEV_PROXY_LOCAL_API

  return {
    ...(local ? { '/api/totem-handoffs': { target: local, changeOrigin: true } } : {}),
    '/api': { target: remote, changeOrigin: true },
  }
}

export default defineConfig(({ mode }) => ({
  server: {
    host: true,
    allowedHosts: TUNNEL_HOSTS,
    proxy: devProxy(loadEnv(mode, process.cwd(), '')),
  },

  /**
   * `preview` tem lista própria — não herda a do `server`. Sem isso,
   * `npm run preview` pelo túnel dá o mesmo "Blocked request", e é justamente
   * o preview que serve o build real com service worker (ver `devOptions`).
   */
  preview: { host: true, allowedHosts: TUNNEL_HOSTS },

  // Sourcemaps ligados: sem eles, um erro em produção vira stack de bundle minificado.
  build: { sourcemap: true },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      devOptions: { enabled: PWA_IN_DEV, type: 'module' },
      manifest: {
        id: '/',
        name: 'Cardápio Digital',
        short_name: 'Cardápio',
        description: 'Cardápio digital — peça na mesa ou no balcão',
        lang: 'pt-BR',
        dir: 'ltr',
        theme_color: '#1D9E75',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        // O app precisa de ?branch= para funcionar, e o manifest não tem como
        // saber qual. Abrindo pelo ícone o cliente cai na tela de QR inválido,
        // que agora traz o botão de reescanear — é a recuperação certa.
        start_url: '/',
        categories: ['food', 'shopping'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        // Rotas do React Router servidas pelo shell quando offline
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Sem isso, cache de builds antigos acumula no aparelho do cliente
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // NetworkOnly de propósito: preço e estoque mudam durante o serviço.
            // Com NetworkFirst, uma rede lenta servia cardápio de até 30min atrás
            // e o cliente pedia por um preço que não existe mais.
            urlPattern: /^https:\/\/.*\/api\/(branches|company|product-categories|products|complements-groups|complements-groups-categories|periods|offers|orders)/,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\.(png|jpg|jpeg|webp|svg|gif)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'images-cache', expiration: { maxEntries: 200, maxAgeSeconds: 604800 } },
          },
        ],
      },
    }),
  ],
}))

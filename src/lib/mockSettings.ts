/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  CONFIGURAÇÕES FALSAS DE BRANCH                                          ║
 * ║                                                                          ║
 * ║  Liga recursos que o backend ainda não devolve em `settingsWeb`, para    ║
 * ║  dar para ver as telas antes do Laravel existir.                        ║
 * ║                                                                          ║
 * ║  ►► COMO DESABILITAR: troque MOCK_SETTINGS para `false`. ◄◄             ║
 * ║                                                                          ║
 * ║  Com `false`, vale exatamente o que a API mandar — nada é injetado.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import type { Branch } from '../types'

/** ►► TROQUE PARA `false` PARA USAR SÓ O QUE A API DEVOLVE ◄◄ */
export const MOCK_SETTINGS = true

if (MOCK_SETTINGS) {
  console.warn(
    '[settings] MOCK_SETTINGS está LIGADO: idiomas, banner e comanda estão ' +
    'sendo forçados no cliente. Desligue em src/lib/mockSettings.ts antes de publicar.',
  )
}

type SettingsWeb = NonNullable<Branch['settingsWeb']>

/**
 * Aplicado **por baixo** do que a API mandou: qualquer chave que o backend já
 * devolva ganha da falsa. Assim, conforme o Laravel for implementando os
 * campos, o mock vai saindo de cena sozinho, sem precisar editar este arquivo.
 */
const FAKE: SettingsWeb = {
  // Seletor de idioma no cabeçalho (com um idioma só ele nem aparece)
  languages: ['pt', 'es', 'en'],

  // Campo de e-mail no checkout e no perfil
  askEmail: true,

  // Botão do Google. Só aparece se VITE_GOOGLE_CLIENT_ID também estiver no .env
  googleSignInEnabled: true,

  // Botão de chamar garçom (só aparece em mode=mesa)
  waiterCallEnabled: true,

  // Identidade do PWA — nome/ícone por empresa
  menuName: 'Bebelu Lanches',
  menuShortName: 'Bebelu',
  menuDescription: 'Peça pelo celular, na mesa ou no balcão',

  // Opção "Pagar no totem" no checkout
  totemPaymentEnabled: true,

  // Comanda por cliente dentro da mesa
  comandaEnabled: true,
  comandaLabel: 'Comanda',
  comandaRequired: false,

  // Banners do início da sessão — três, para exercitar o carrossel:
  // um com link interno, um sem link, e um com link externo
  banners: [
    {
      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=70',
      title: 'Combo do dia',
      subtitle: 'Hambúrguer + batata + bebida por R$ 39,90',
      link: '/',
      linkLabel: 'Ver o combo',
      seq: 1,
    },
    {
      image: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800&q=70',
      title: 'Sobremesa em dobro',
      subtitle: 'Toda terça, na compra de um açaí',
      seq: 2,
    },
    {
      image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=70',
      title: 'Rodízio de pizza',
      subtitle: 'Sexta e sábado, a partir das 19h',
      link: 'https://example.com/rodizio',
      linkLabel: 'Saiba mais',
      seq: 3,
    },
  ],

  // Acompanhamento de status: finge que a casa tem KDS publicando o pedido.
  // Em produção isso fica DESLIGADO por padrão — status que ninguém move é pior
  // que status nenhum (ver src/lib/statusPanel.ts)
  orderStatusEnabled: true,

  // Painel de senhas na nuvem. Chave separada do KDS de propósito: existe casa
  // com KDS e sem painel (garçom leva à mesa), e painel alimentado à mão sem KDS
  passwordPanelEnabled: true,
  orderStatusPortalUrl: 'https://example.com/painel-senha',
  orderStatusPortalQuery: '?branch={branch}&code={code}',

  // Validade do carrinho. 4h é o padrão do app; aqui fica explícito para dar
  // para baixar a 1 minuto e ver o descarte acontecer
  cartTtlMinutes: 240,

  // Link da política de privacidade no banner LGPD
  privacyPolicyUrl: 'https://example.com/politica-de-privacidade',
  /** Canal para o titular pedir exclusão dos dados (LGPD, art. 18) */
  privacyContactEmail: 'privacidade@example.com',
}

/** Mescla o mock por baixo do `settingsWeb` real. */
export function applyMockSettings(settingsWeb: SettingsWeb | undefined): SettingsWeb | undefined {
  if (!MOCK_SETTINGS) return settingsWeb
  return { ...FAKE, ...(settingsWeb ?? {}) }
}

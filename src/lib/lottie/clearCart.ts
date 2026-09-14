/**
 * Animação Lottie do aviso de limpar o carrinho.
 *
 * Autorada à mão em vez de baixada do LottieFiles: os arquivos de lá costumam
 * ter 40–200 KB, e esta cena — uma lixeira com a tampa abrindo e itens caindo —
 * cabe em pouco mais de 2 KB. O bundle do cardápio já cresceu bastante e este
 * é um aviso que aparece uma vez ou outra.
 *
 * 60 fps · 90 frames (1,5 s) · loop.
 * Cores são resolvidas em runtime (ver `tintLottie`), para a animação seguir a
 * cor da empresa em vez de um vermelho fixo.
 */

export interface LottieJson {
  v: string
  fr: number
  ip: number
  op: number
  w: number
  h: number
  nm: string
  ddd: number
  assets: unknown[]
  layers: unknown[]
}

/** Marcador trocado por `tintLottie` — mantém o JSON legível na origem. */
const ACCENT: [number, number, number, number] = [0.86, 0.15, 0.15, 1]

function shapeLayer(
  name: string,
  ind: number,
  shapes: unknown[],
  transform: Record<string, unknown>,
): unknown {
  return {
    ddd: 0, ind, ty: 4, nm: name, sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [100, 100, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 0, k: [100, 100, 100] },
      ...transform,
    },
    ao: 0, shapes, ip: 0, op: 90, st: 0, bm: 0,
  }
}

function rect(size: [number, number], pos: [number, number], radius: number, color: number[]) {
  return {
    ty: 'gr',
    it: [
      { ty: 'rc', d: 1, s: { a: 0, k: size }, p: { a: 0, k: pos }, r: { a: 0, k: radius } },
      { ty: 'fl', c: { a: 0, k: color }, o: { a: 0, k: 100 }, r: 1, bm: 0 },
      {
        ty: 'tr',
        p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] },
        s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 },
        o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 },
      },
    ],
  }
}

function ellipse(size: [number, number], pos: [number, number], color: number[]) {
  return {
    ty: 'gr',
    it: [
      { ty: 'el', d: 1, s: { a: 0, k: size }, p: { a: 0, k: pos } },
      { ty: 'fl', c: { a: 0, k: color }, o: { a: 0, k: 100 }, r: 1, bm: 0 },
      {
        ty: 'tr',
        p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] },
        s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 },
        o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 },
      },
    ],
  }
}

const EASE_OUT = { x: [0.2], y: [1] }
const EASE_IN = { x: [0.6], y: [0] }

/** Item caindo dentro da lixeira, com atraso próprio. */
function fallingItem(ind: number, x: number, delay: number, color: number[]) {
  return shapeLayer(`item-${ind}`, ind, [ellipse([14, 14], [0, 0], color)], {
    p: {
      a: 1,
      k: [
        { t: delay, s: [x, 52, 0], e: [x, 104, 0], i: EASE_IN, o: EASE_OUT, to: [0, 0, 0], ti: [0, 0, 0] },
        { t: delay + 26 },
      ],
    },
    o: {
      a: 1,
      k: [
        { t: delay, s: [0], e: [100], i: EASE_OUT, o: EASE_IN },
        { t: delay + 8, s: [100], e: [100], i: EASE_OUT, o: EASE_IN },
        { t: delay + 22, s: [100], e: [0], i: EASE_OUT, o: EASE_IN },
        { t: delay + 30 },
      ],
    },
    s: {
      a: 1,
      k: [
        { t: delay, s: [60, 60, 100], e: [100, 100, 100], i: EASE_OUT, o: EASE_IN },
        { t: delay + 14 },
      ],
    },
  })
}

export const CLEAR_CART_LOTTIE: LottieJson = {
  v: '5.7.4',
  fr: 60,
  ip: 0,
  op: 90,
  w: 200,
  h: 200,
  nm: 'limpar-carrinho',
  ddd: 0,
  assets: [],
  layers: [
    // Tampa — abre e fecha
    shapeLayer('tampa', 1, [
      rect([76, 12], [0, 0], 6, ACCENT),
      rect([26, 8], [0, -9], 4, ACCENT),
    ], {
      p: { a: 0, k: [100, 74, 0] },
      a: { a: 0, k: [34, 0, 0] },
      r: {
        a: 1,
        k: [
          { t: 0, s: [0], e: [-24], i: EASE_OUT, o: EASE_IN },
          { t: 16, s: [-24], e: [-24], i: EASE_OUT, o: EASE_IN },
          { t: 62, s: [-24], e: [0], i: EASE_OUT, o: EASE_IN },
          { t: 80 },
        ],
      },
    }),

    fallingItem(2, 84, 14, ACCENT),
    fallingItem(3, 100, 24, ACCENT),
    fallingItem(4, 116, 34, ACCENT),

    // Corpo da lixeira — leve tremida ao receber os itens
    shapeLayer('corpo', 5, [
      rect([64, 68], [0, 0], 10, ACCENT),
      rect([8, 40], [-16, 2], 4, [1, 1, 1, 1]),
      rect([8, 40], [0, 2], 4, [1, 1, 1, 1]),
      rect([8, 40], [16, 2], 4, [1, 1, 1, 1]),
    ], {
      p: { a: 0, k: [100, 118, 0] },
      r: {
        a: 1,
        k: [
          { t: 30, s: [0], e: [3], i: EASE_OUT, o: EASE_IN },
          { t: 38, s: [3], e: [-3], i: EASE_OUT, o: EASE_IN },
          { t: 46, s: [-3], e: [0], i: EASE_OUT, o: EASE_IN },
          { t: 54 },
        ],
      },
    }),
  ],
}

/**
 * Troca a cor de destaque da animação pela cor recebida.
 *
 * Lottie guarda cor como `[r, g, b, a]` de 0 a 1. Percorre o JSON clonado e
 * substitui só o `ACCENT` — o branco das faixas da lixeira fica intacto.
 */
export function tintLottie(json: LottieJson, hex: string): LottieJson {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return json
  const rgb = [
    parseInt(m[1], 16) / 255,
    parseInt(m[2], 16) / 255,
    parseInt(m[3], 16) / 255,
    1,
  ]

  const isAccent = (v: unknown): boolean =>
    Array.isArray(v) &&
    v.length === 4 &&
    v.every((n, i) => typeof n === 'number' && Math.abs(n - ACCENT[i]) < 1e-6)

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return isAccent(node) ? [...rgb] : node.map(walk)
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(node)) out[k] = walk(v)
      return out
    }
    return node
  }

  return walk(json) as LottieJson
}

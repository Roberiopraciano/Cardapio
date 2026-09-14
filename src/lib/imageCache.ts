/**
 * Espelho do ImageCacher.dart para o browser.
 *
 * Flutter usa filesystem local (dio.download → pasta cache/).
 * Browser usa Cache API (caches.open) para o mesmo efeito:
 * - Verifica se URL já está em cache
 * - Se não estiver, faz fetch e armazena
 * - Retorna object URL para uso em <img src>
 *
 * Adicionalmente mantém um Map em memória para evitar
 * chamadas repetidas à Cache API no mesmo ciclo de vida.
 */

const CACHE_NAME = 'menu-images-v1'
const memoryCache = new Map<string, string>()

/** Extrai URL de imagem do JSON do produto/categoria/complemento.
 *  Mesma lógica de socket.dart (handleProducts / handleCategories):
 *  1. staticImage[0].photo
 *  2. sliderHeader.image[0].photo (se active !== false)
 */
export function extractImageUrl(item: Record<string, unknown>): string {
  const staticImage = item['staticImage'] as Array<{ photo: string }> | undefined
  if (staticImage && staticImage.length > 0 && staticImage[0]?.photo) {
    return staticImage[0].photo
  }

  const sliderHeader = item['sliderHeader'] as
    | { image?: Array<{ photo: string; active?: boolean }> }
    | undefined
  if (
    sliderHeader?.image &&
    sliderHeader.image.length > 0 &&
    sliderHeader.image[0]?.photo &&
    sliderHeader.image[0]?.active !== false
  ) {
    return sliderHeader.image[0].photo
  }

  return ''
}

/** Espelho de ImageCacher.cacheImage() */
async function cacheImage(url: string): Promise<void> {
  if (!url || memoryCache.has(url)) return
  try {
    const cache = await caches.open(CACHE_NAME)
    const existing = await cache.match(url)
    if (existing) {
      const blob = await existing.blob()
      memoryCache.set(url, URL.createObjectURL(blob))
      return
    }
    const response = await fetch(url, { mode: 'cors' })
    if (response.ok) {
      await cache.put(url, response.clone())
      const blob = await response.blob()
      memoryCache.set(url, URL.createObjectURL(blob))
    }
  } catch {
    // Falha silenciosa — a tag <img> usará a URL direta como fallback
  }
}

/** Espelho de ImageCacher.cacheImages(List<Product>) */
export async function cacheImages(urls: string[]): Promise<void> {
  await Promise.allSettled(urls.map(cacheImage))
}

/** Espelho de ImageCacher.getCachedImage() — retorna URL local ou URL original */
export function getCachedUrl(url: string): string {
  return memoryCache.get(url) ?? url
}

/** Pré-carrega todos os assets do cardápio de uma vez (chamado no boot) */
export async function preloadMenuImages(items: Array<Record<string, unknown>>): Promise<void> {
  const urls = items
    .map((item) => extractImageUrl(item))
    .filter(Boolean)

  // Carrega em batches de 6 para não travar a rede
  const BATCH = 6
  for (let i = 0; i < urls.length; i += BATCH) {
    await Promise.allSettled(urls.slice(i, i + BATCH).map(cacheImage))
  }
}

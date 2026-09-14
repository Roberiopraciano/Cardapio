/**
 * Foto de perfil do cliente.
 *
 * **Fica só no aparelho.** Nunca vai no pedido nem para o servidor: é enfeite
 * para o cliente reconhecer o próprio perfil, não dado que o restaurante
 * precise. Foto de rosto é dado pessoal — coletar sem finalidade é o que a LGPD
 * veda, e aqui não existe finalidade do lado da loja.
 */

import { scopedKey, readScopedWithMigration } from './storageScope'

/** Prefixada por company — foto de rosto não atravessa empresas. */
const BASE = 'cardapio_avatar'

/** 256px cobre qualquer avatar que a interface usa (o maior é 72px em 3x). */
const MAX_SIZE = 256
const QUALITY = 0.82

export function loadAvatar(): string | null {
  try {
    const v = readScopedWithMigration(BASE)
    return v && v.startsWith('data:image/') ? v : null
  } catch {
    return null
  }
}

export function clearAvatar(): void {
  try {
    localStorage.removeItem(scopedKey(BASE))
  } catch {}
}

export type AvatarError = 'tipo' | 'leitura' | 'espaco'

/**
 * Redimensiona, recorta quadrado e grava.
 *
 * O recorte e a compressão não são estética: a foto de um celular moderno tem
 * 4–8 MB, e o localStorage inteiro costuma ter 5 MB. Guardar o original
 * estouraria a cota e derrubaria **também** o nome, o telefone e o histórico,
 * que moram no mesmo storage.
 */
export async function saveAvatarFromFile(file: File): Promise<string | AvatarError> {
  if (!file.type.startsWith('image/')) return 'tipo'

  let bitmap: ImageBitmap | HTMLImageElement
  try {
    bitmap = await loadBitmap(file)
  } catch {
    return 'leitura'
  }

  const w = 'width' in bitmap ? bitmap.width : 0
  const h = 'height' in bitmap ? bitmap.height : 0
  if (!w || !h) return 'leitura'

  // Recorte central quadrado — avatar redondo com foto esticada fica estranho
  const side = Math.min(w, h)
  const sx = (w - side) / 2
  const sy = (h - side) / 2

  const canvas = document.createElement('canvas')
  canvas.width = MAX_SIZE
  canvas.height = MAX_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return 'leitura'

  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap as CanvasImageSource, sx, sy, side, side, 0, 0, MAX_SIZE, MAX_SIZE)
  if ('close' in bitmap) bitmap.close()

  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY)

  try {
    localStorage.setItem(scopedKey(BASE), dataUrl)
  } catch {
    // Cota estourada: não deixar o storage num estado meio-gravado
    clearAvatar()
    return 'espaco'
  }

  return dataUrl
}

/** `createImageBitmap` é mais rápido, mas Safari antigo não tem. */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // cai para o <img>
    }
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('decode'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const AVATAR_ERROR: Record<AvatarError, string> = {
  tipo: 'Escolha um arquivo de imagem.',
  leitura: 'Não foi possível ler essa imagem. Tente outra.',
  espaco: 'Sem espaço para guardar a foto neste aparelho.',
}

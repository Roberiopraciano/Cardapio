/**
 * Nome de mesa legível: o cadastro guarda código (`MESA_01`), o cliente lê
 * "Mesa 01". Texto sem o padrão `MESA_`/`MESA-` só troca `_` por espaço e
 * capitaliza ("A-4" fica "A-4").
 */
export function tableLabel(code: string | null | undefined): string {
  const raw = (code ?? '').trim()
  if (!raw) return ''
  const m = raw.match(/^mesa[\s_-]*(.+)$/i)
  if (m) return `Mesa ${m[1].replace(/_/g, ' ')}`
  return raw.replace(/_/g, ' ')
}

/**
 * Endereço de entrega do delivery.
 *
 * O backend ainda não grava endereço do cliente no pedido: ele vai no payload
 * (`deliveryAddress`, ignorado até o Laravel aceitar) e também na observação,
 * que é o que o PDV mostra hoje — sem isso a loja não sabe para onde mandar.
 */

export interface DeliveryAddress {
  cep: string
  street: string
  number: string
  district: string
  complement: string
  reference: string
  city: string
  state: string
}

export const EMPTY_ADDRESS: DeliveryAddress = {
  cep: '', street: '', number: '', district: '', complement: '', reference: '', city: '', state: '',
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

const STORAGE_KEY = 'cardapio.deliveryAddress'

export function cepDigits(v: string): string {
  return v.replace(/\D/g, '').slice(0, 8)
}

export function maskCep(v: string): string {
  const d = cepDigits(v)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export class CepNotFoundError extends Error {}

/** Consulta o ViaCEP. Lança `CepNotFoundError` para CEP inexistente. */
export async function lookupCep(cep: string): Promise<Partial<DeliveryAddress>> {
  const d = cepDigits(cep)
  const res = await fetch(`https://viacep.com.br/ws/${d}/json/`)
  if (!res.ok) throw new Error(`ViaCEP ${res.status}`)
  const data = await res.json() as Record<string, string | boolean>
  if (data['erro']) throw new CepNotFoundError('CEP não encontrado')
  return {
    cep: d,
    street: String(data['logradouro'] ?? ''),
    district: String(data['bairro'] ?? ''),
    city: String(data['localidade'] ?? ''),
    state: String(data['uf'] ?? ''),
  }
}

/** Campos obrigatórios que faltam — vazio = endereço completo. */
export function missingAddressFields(a: DeliveryAddress): (keyof DeliveryAddress)[] {
  const required: (keyof DeliveryAddress)[] = ['street', 'number', 'district', 'reference', 'city', 'state']
  return required.filter((k) => !a[k].trim())
}

export function isAddressComplete(a: DeliveryAddress | null): a is DeliveryAddress {
  return a !== null && missingAddressFields(a).length === 0
}

/** "Rua X, 490" */
export function addressLine1(a: DeliveryAddress): string {
  return [a.street, a.number].filter((s) => s.trim()).join(', ')
}

/** "Bairro, Cidade" */
export function addressLine2(a: DeliveryAddress): string {
  return [a.district, a.city].filter((s) => s.trim()).join(', ')
}

/** Uma linha só, para a observação do pedido. */
export function formatAddress(a: DeliveryAddress): string {
  return [
    addressLine1(a),
    a.complement.trim(),
    a.district.trim(),
    [a.city.trim(), a.state.trim()].filter(Boolean).join('/'),
    a.cep ? `CEP ${maskCep(a.cep)}` : '',
    a.reference.trim() ? `Ref: ${a.reference.trim()}` : '',
  ].filter(Boolean).join(' - ')
}

// Conveniência do aparelho: o cliente não redigita o endereço a cada pedido.
// Sem storage (aba anônima, bloqueio), só não lembra.
export function loadSavedAddress(): DeliveryAddress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return { ...EMPTY_ADDRESS, ...(JSON.parse(raw) as Partial<DeliveryAddress>) }
  } catch { return null }
}

export function saveAddress(a: DeliveryAddress): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)) } catch { /* sem storage */ }
}

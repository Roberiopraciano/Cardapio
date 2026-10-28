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
  /** Bairro cadastrado em Cadastros > Delivery; vazio quando a unidade não cadastrou bairros. */
  neighborhoodId: string
  complement: string
  reference: string
  city: string
  state: string
}

export const EMPTY_ADDRESS: DeliveryAddress = {
  cep: '', street: '', number: '', district: '', neighborhoodId: '', complement: '', reference: '', city: '', state: '',
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

// ─── Bairros e taxa de entrega ────────────────────────────────────────────────

/** Bairro atendido pela unidade, com a taxa já resolvida pela API. */
export interface Neighborhood {
  _id: string
  name: string
  fee: number
  feeTitle?: string
}

function normName(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Bairro com o mesmo nome (ignora acento e caixa) — para aproveitar o que o ViaCEP devolveu. */
export function matchNeighborhood(name: string, list: Neighborhood[]): Neighborhood | null {
  const wanted = normName(name)
  return wanted ? (list.find((n) => normName(n.name) === wanted) ?? null) : null
}

/** Bairro escolhido no endereço; `null` se não escolheu ou se saiu da lista da unidade. */
export function addressNeighborhood(a: DeliveryAddress | null, list: Neighborhood[]): Neighborhood | null {
  return a?.neighborhoodId ? (list.find((n) => n._id === a.neighborhoodId) ?? null) : null
}

/** Taxa de entrega do endereço; 0 quando a unidade não cadastrou bairros. */
export function deliveryFeeFor(a: DeliveryAddress | null, list: Neighborhood[]): number {
  return addressNeighborhood(a, list)?.fee ?? 0
}

/**
 * Campos obrigatórios que faltam — vazio = endereço completo. Com bairros
 * cadastrados na unidade o bairro tem de ser um deles (é dele que vem a taxa).
 */
export function missingAddressFields(a: DeliveryAddress, neighborhoods: Neighborhood[] = []): (keyof DeliveryAddress)[] {
  const required: (keyof DeliveryAddress)[] = ['street', 'number', 'district', 'reference', 'city', 'state']
  const missing = required.filter((k) => !a[k].trim())
  if (neighborhoods.length > 0 && !addressNeighborhood(a, neighborhoods) && !missing.includes('district')) {
    missing.push('district')
  }
  return missing
}

export function isAddressComplete(a: DeliveryAddress | null, neighborhoods: Neighborhood[] = []): a is DeliveryAddress {
  return a !== null && missingAddressFields(a, neighborhoods).length === 0
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

// ─── Endereços salvos no aparelho ────────────────────────────────────────────
//
// Conveniência do aparelho: o cliente não redigita o endereço a cada pedido, e
// pode ter mais de um (casa, trabalho). Sem storage (aba anônima, bloqueio),
// só não lembra.

export interface SavedAddress extends DeliveryAddress {
  id: string
}

export interface AddressBook {
  list: SavedAddress[]
  /** Endereço usado no pedido. */
  selectedId: string | null
}

/** Passou disso, o mais antigo (que não seja o escolhido) sai. */
export const MAX_ADDRESSES = 5

const BOOK_KEY = 'cardapio.deliveryAddresses'
/** Formato antigo: um endereço só. Importado uma vez para a lista nova. */
const LEGACY_KEY = 'cardapio.deliveryAddress'

export const EMPTY_BOOK: AddressBook = { list: [], selectedId: null }

export function selectedAddress(book: AddressBook): SavedAddress | null {
  return book.list.find((a) => a.id === book.selectedId) ?? null
}

/** Mesmo endereço digitado de novo (ignora caixa e espaços) não vira duplicata. */
function sameAddress(a: DeliveryAddress, b: DeliveryAddress): boolean {
  const norm = (x: DeliveryAddress) => (Object.keys(EMPTY_ADDRESS) as (keyof DeliveryAddress)[])
    .map((k) => (k === 'cep' ? cepDigits(x[k]) : x[k]).toLowerCase().replace(/\s+/g, ' ').trim())
    .join('|')
  return norm(a) === norm(b)
}

/**
 * Salva um endereço novo (`id` null) ou edita um existente, e o deixa escolhido.
 * Endereço igual a um que já existe reaproveita o existente em vez de duplicar.
 */
export function upsertAddress(
  book: AddressBook,
  address: DeliveryAddress,
  id: string | null,
  newId: () => string = () => crypto.randomUUID(),
): AddressBook {
  const { ...fields } = address
  const duplicate = book.list.find((x) => x.id !== id && sameAddress(x, fields))
  const targetId = id && book.list.some((x) => x.id === id) ? id : (duplicate?.id ?? null)

  let list: SavedAddress[]
  let selectedId: string
  if (targetId) {
    list = book.list.map((x) => (x.id === targetId ? { ...fields, id: targetId } : x))
      // Editou um endereço para ficar igual a outro: sobra um só
      .filter((x, idx, all) => x.id === targetId || !sameAddress(x, fields) || all.findIndex((y) => y.id === targetId) === -1)
    selectedId = targetId
  } else {
    selectedId = newId()
    list = [...book.list, { ...fields, id: selectedId }]
  }

  while (list.length > MAX_ADDRESSES) {
    const drop = list.findIndex((x) => x.id !== selectedId)
    list = list.filter((_, idx) => idx !== drop)
  }
  return { list, selectedId }
}

export function selectAddress(book: AddressBook, id: string): AddressBook {
  return book.list.some((a) => a.id === id) ? { ...book, selectedId: id } : book
}

/** Remove; se era o escolhido, passa a valer o primeiro que sobrar. */
export function removeAddress(book: AddressBook, id: string): AddressBook {
  const list = book.list.filter((a) => a.id !== id)
  const selectedId = book.selectedId === id ? (list[0]?.id ?? null) : book.selectedId
  return { list, selectedId }
}

export function loadAddressBook(): AddressBook {
  try {
    const raw = localStorage.getItem(BOOK_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AddressBook>
      const list = (Array.isArray(parsed.list) ? parsed.list : [])
        .filter((a): a is SavedAddress => !!a && typeof a.id === 'string')
        .map((a) => ({ ...EMPTY_ADDRESS, ...a }))
      const selectedId = list.some((a) => a.id === parsed.selectedId) ? (parsed.selectedId as string) : (list[0]?.id ?? null)
      return { list, selectedId }
    }
    // Primeira vez no formato novo: leva o endereço único que o aparelho já tinha
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const book = upsertAddress(EMPTY_BOOK, { ...EMPTY_ADDRESS, ...(JSON.parse(legacy) as Partial<DeliveryAddress>) }, null)
      saveAddressBook(book)
      return book
    }
  } catch { /* storage bloqueado ou lixo: começa vazio */ }
  return EMPTY_BOOK
}

export function saveAddressBook(book: AddressBook): void {
  try { localStorage.setItem(BOOK_KEY, JSON.stringify(book)) } catch { /* sem storage */ }
}

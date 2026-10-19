const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? ''

export interface VoiceItem {
  client_item_ref: string
  product_id: string
  quantity: number
  preparation_note: string
  selected_options: Record<string, string[]>
  display: { name: string }
  validation_status: 'valid' | 'missing_options'
  missing_required_group_ids: string[]
  subtotal_minor: number
}

export interface VoiceReview {
  review_id: string
  items: VoiceItem[]
  invalid_items: Array<{ client_item_ref: string; code: string }>
  missing_required_selections: Array<{ client_item_ref: string; group_id: string }>
  items_not_found: string[]
  ambiguous_items: string[]
  totals: { currency: string; subtotal_minor: number; total_minor: number }
  expires_at: string
}

export interface ProposedVoiceItem {
  client_item_ref: string
  product_id: string
  quantity: number
  preparation_note: string
  selected_options: Record<string, string[]>
}

async function post<T>(path: string, body: BodyInit, token?: string): Promise<T> {
  const response = await fetch(`${BASE_URL}/api/v1/voice-order${path}`, {
    method: 'POST', body, cache: 'no-store', signal: AbortSignal.timeout(60_000),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  const json = await response.json().catch(() => null)
  if (!response.ok || !json) throw new Error(json?.code ?? `HTTP ${response.status}`)
  return json
}

export async function startVoiceSession(branchId: string): Promise<string> {
  const json = await post<{ token: string }>('/session', JSON.stringify({ branch_id: branchId }))
  return json.token
}

export async function uploadVoiceAudio(token: string, audio: Blob): Promise<VoiceReview> {
  const form = new FormData()
  form.append('audio', audio, 'order.webm')
  const json = await post<{ data: VoiceReview }>('/', form, token)
  return json.data
}

export async function updateVoiceReview(token: string, reviewId: string, items: ProposedVoiceItem[]): Promise<VoiceReview> {
  const json = await post<{ data: VoiceReview }>('/review', JSON.stringify({ review_id: reviewId, items }), token)
  return json.data
}

export async function confirmVoiceReview(token: string, reviewId: string): Promise<{ status: string; items?: VoiceItem[]; review?: VoiceReview }> {
  const json = await post<{ data: { status: string; items?: VoiceItem[]; review?: VoiceReview } }>('/confirm', JSON.stringify({ review_id: reviewId }), token)
  return json.data
}

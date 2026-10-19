/**
 * Testes para src/services/voiceOrderApi.ts
 * Contrato HTTP com o backend: token só no header, corpo certo, erros viram exceção.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmVoiceReview, startVoiceSession, updateVoiceReview, uploadVoiceAudio } from '../services/voiceOrderApi'

const fetchMock = vi.fn()

function reply(body: unknown, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })
}

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => vi.unstubAllGlobals())

describe('startVoiceSession', () => {
  it('abre a sessão da loja e devolve o token, sem enviar Authorization', async () => {
    fetchMock.mockReturnValue(reply({ token: 'tok', expires_in: 600 }))
    expect(await startVoiceSession('branch1')).toBe('tok')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/v1\/voice-order\/session$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ branch_id: 'branch1' })
    expect(init.headers.Authorization).toBeUndefined()
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.cache).toBe('no-store')
  })

  it('lança quando a loja não habilitou o recurso (404)', async () => {
    fetchMock.mockReturnValue(reply({ message: 'Not Found' }, 404))
    await expect(startVoiceSession('branch1')).rejects.toThrow('HTTP 404')
  })
})

describe('uploadVoiceAudio', () => {
  it('envia o áudio como multipart com Bearer e devolve a revisão', async () => {
    fetchMock.mockReturnValue(reply({ success: true, data: { review_id: 'r1', items: [] } }))
    const review = await uploadVoiceAudio('tok', new Blob(['abc'], { type: 'audio/webm' }))
    expect(review.review_id).toBe('r1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/v1\/voice-order\/$/)
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(init.headers['Content-Type']).toBeUndefined() // o browser define o boundary
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('audio')).toBeInstanceOf(Blob)
  })

  it.each([
    [422, 'INVALID_AUDIO'], [422, 'INVALID_AUDIO_DURATION'], [429, 'QUOTA_EXCEEDED'],
    [503, 'VOICE_ORDER_UNAVAILABLE'], [503, 'AUDIO_INSPECTION_UNAVAILABLE'],
  ])('propaga o código de erro do servidor (%i %s)', async (status, code) => {
    fetchMock.mockReturnValue(reply({ success: false, code }, status))
    await expect(uploadVoiceAudio('tok', new Blob(['x']))).rejects.toThrow(code)
  })

  it('lança com resposta que não é JSON', async () => {
    fetchMock.mockReturnValue(Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new Error('html')) }))
    await expect(uploadVoiceAudio('tok', new Blob(['x']))).rejects.toThrow('HTTP 502')
  })

  it('propaga falha de rede', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(uploadVoiceAudio('tok', new Blob(['x']))).rejects.toThrow('Failed to fetch')
  })

  it('aplica um timeout à requisição', async () => {
    fetchMock.mockReturnValue(reply({ data: {} }))
    await uploadVoiceAudio('tok', new Blob(['x']))
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
})

describe('updateVoiceReview', () => {
  it('reenvia os itens corrigidos ao servidor, sem preços', async () => {
    fetchMock.mockReturnValue(reply({ success: true, data: { review_id: 'r2', items: [] } }))
    const items = [{ client_item_ref: 'a', product_id: 'p1', quantity: 2, preparation_note: '', selected_options: { g1: ['o1'] } }]
    expect((await updateVoiceReview('tok', 'r1', items)).review_id).toBe('r2')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/review$/)
    expect(JSON.parse(init.body)).toEqual({ review_id: 'r1', items })
    expect(init.body).not.toMatch(/price|total|subtotal/)
  })

  it('lança INVALID_REVIEW quando a revisão expirou', async () => {
    fetchMock.mockReturnValue(reply({ success: false, code: 'INVALID_REVIEW' }, 422))
    await expect(updateVoiceReview('tok', 'r1', [])).rejects.toThrow('INVALID_REVIEW')
  })
})

describe('confirmVoiceReview', () => {
  it('devolve os itens confirmados', async () => {
    fetchMock.mockReturnValue(reply({ success: true, data: { status: 'confirmed', items: [] } }))
    expect(await confirmVoiceReview('tok', 'r1')).toEqual({ status: 'confirmed', items: [] })
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/confirm$/)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ review_id: 'r1' })
  })

  it('devolve "changed" com a nova revisão quando o catálogo mudou', async () => {
    fetchMock.mockReturnValue(reply({ success: true, data: { status: 'changed', review: { review_id: 'r2' } } }))
    const result = await confirmVoiceReview('tok', 'r1')
    expect(result.status).toBe('changed')
    expect(result.review?.review_id).toBe('r2')
  })

  it.each(['REVIEW_HAS_PENDING_ITEMS', 'INVALID_REVIEW'])('lança %s (409)', async (code) => {
    fetchMock.mockReturnValue(reply({ success: false, code }, 409))
    await expect(confirmVoiceReview('tok', 'r1')).rejects.toThrow(code)
  })
})

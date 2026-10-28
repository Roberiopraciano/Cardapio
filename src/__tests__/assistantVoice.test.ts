/**
 * Voz do assistente: quando falar por padrão, a preferência lembrada e o tocador que descarta falas atrasadas.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssistantSpeaker, readSpeechPref, speechEnabled, writeSpeechPref } from '../lib/assistantVoice'

function fakePlayer() {
  return { src: '', onended: null as (() => void) | null, play: vi.fn(async () => undefined), pause: vi.fn() }
}

const wav = () => new Blob(['RIFF'], { type: 'audio/wav' })

describe('quando o assistente fala', () => {
  it('por padrão, só se a conversa começou pelo microfone', () => {
    expect(speechEnabled(null, true)).toBe(true)
    expect(speechEnabled(null, false)).toBe(false)
  })

  it('a escolha do cliente no botão de som vence o padrão', () => {
    expect(speechEnabled('off', true)).toBe(false)
    expect(speechEnabled('on', false)).toBe(true)
  })
})

describe('preferência lembrada no aparelho', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('grava e lê on/off; valor estranho vale como "seguir o padrão"', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) })
    expect(readSpeechPref()).toBeNull()
    writeSpeechPref('off')
    expect(readSpeechPref()).toBe('off')
    store.set('voice-assistant-speech', 'talvez')
    expect(readSpeechPref()).toBeNull()
  })

  it('sem storage (aba anônima, bloqueado) não quebra', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
    expect(readSpeechPref()).toBeNull()
    expect(() => writeSpeechPref('on')).not.toThrow()
  })
})

describe('AssistantSpeaker', () => {
  it('toca a fala que chegou e avisa que está falando', async () => {
    const player = fakePlayer()
    const speaking = vi.fn()
    await new AssistantSpeaker(player, speaking).speak(async () => wav())
    expect(player.play).toHaveBeenCalledOnce()
    expect(player.src).toMatch(/^blob:/)
    expect(speaking).toHaveBeenLastCalledWith(true)
  })

  it('descarta a fala atrasada quando a rodada nova já pediu a dela', async () => {
    const player = fakePlayer()
    const speaker = new AssistantSpeaker(player, vi.fn())
    let release!: (blob: Blob) => void
    const slow = speaker.speak(() => new Promise<Blob>(resolve => { release = resolve }))
    await speaker.speak(async () => wav())
    release(wav())
    await slow
    expect(player.play).toHaveBeenCalledOnce()
  })

  it('stop antes de o áudio chegar cancela a fala', async () => {
    const player = fakePlayer()
    const speaker = new AssistantSpeaker(player, vi.fn())
    let release!: (blob: Blob) => void
    const pending = speaker.speak(() => new Promise<Blob>(resolve => { release = resolve }))
    speaker.stop()
    release(wav())
    await pending
    expect(player.play).not.toHaveBeenCalled()
  })

  it('falha ao buscar ou tocar fica em silêncio, sem lançar', async () => {
    const player = fakePlayer()
    player.play.mockRejectedValueOnce(new Error('NotAllowedError'))
    const speaking = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const speaker = new AssistantSpeaker(player, speaking)
    await expect(speaker.speak(async () => wav())).resolves.toBeUndefined()
    await expect(speaker.speak(async () => { throw new Error('HTTP 503') })).resolves.toBeUndefined()
    expect(speaking).toHaveBeenLastCalledWith(false)
    warn.mockRestore()
  })

  it('o destravamento do áudio só toca o silêncio uma vez', () => {
    const player = fakePlayer()
    const speaker = new AssistantSpeaker(player, vi.fn())
    speaker.unlock()
    speaker.unlock()
    expect(player.play).toHaveBeenCalledOnce()
    expect(player.src).toMatch(/^data:audio\/wav/)
  })
})

describe('frase de espera', () => {
  it('a fala da rodada espera a frase de espera terminar, sem cortar', async () => {
    const player = fakePlayer()
    const speaking = vi.fn()
    const speaker = new AssistantSpeaker(player, speaking)
    await speaker.filler(async () => wav())
    const fillerUrl = player.src
    await speaker.speak(async () => wav())
    expect(player.play).toHaveBeenCalledOnce()
    expect(player.src).toBe(fillerUrl)
    player.onended?.()
    await Promise.resolve()
    expect(player.play).toHaveBeenCalledTimes(2)
    expect(player.src).not.toBe(fillerUrl)
    player.onended?.()
    expect(speaking).toHaveBeenLastCalledWith(false)
  })

  it('não toca se a fala da rodada já começou, nem depois de um stop', async () => {
    const player = fakePlayer()
    const speaker = new AssistantSpeaker(player, vi.fn())
    let release!: (blob: Blob) => void
    const late = speaker.filler(() => new Promise<Blob>(resolve => { release = resolve }))
    await speaker.speak(async () => wav())
    release(wav())
    await late
    expect(player.play).toHaveBeenCalledOnce()

    const other = fakePlayer()
    const stopped = new AssistantSpeaker(other, vi.fn())
    const pending = stopped.filler(() => new Promise<Blob>(resolve => { release = resolve }))
    stopped.stop()
    release(wav())
    await pending
    expect(other.play).not.toHaveBeenCalled()
  })
})

describe('aviso de "a fala começou" (a tela mostra as opções nessa hora)', () => {
  it('avisa quando a fala da rodada começa a tocar', async () => {
    const started = vi.fn()
    await new AssistantSpeaker(fakePlayer(), vi.fn(), started).speak(async () => wav(), 'c1:1')
    expect(started).toHaveBeenCalledWith('c1:1')
  })

  it('atrás da frase de espera, só avisa quando a fala de verdade começa', async () => {
    const player = fakePlayer()
    const started = vi.fn()
    const speaker = new AssistantSpeaker(player, vi.fn(), started)
    await speaker.filler(async () => wav())
    await speaker.speak(async () => wav(), 'c1:2')
    expect(started).not.toHaveBeenCalled()
    player.onended?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(started).toHaveBeenCalledWith('c1:2')
  })

  it('sem nada a dizer ou com falha, avisa assim mesmo (as opções não ficam presas)', async () => {
    const started = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const speaker = new AssistantSpeaker(fakePlayer(), vi.fn(), started)
    await speaker.speak(async () => null, 'c1:3')
    await speaker.speak(async () => { throw new Error('HTTP 503') }, 'c1:4')
    expect(started.mock.calls).toEqual([['c1:3'], ['c1:4']])
    warn.mockRestore()
  })

  it('fala atrasada de uma rodada velha não avisa nada', async () => {
    const started = vi.fn()
    const speaker = new AssistantSpeaker(fakePlayer(), vi.fn(), started)
    let release!: (blob: Blob) => void
    const old = speaker.speak(() => new Promise<Blob>(resolve => { release = resolve }), 'c1:5')
    await speaker.speak(async () => wav(), 'c1:6')
    release(wav())
    await old
    expect(started.mock.calls).toEqual([['c1:6']])
  })
})

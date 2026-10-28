/**
 * Voz do assistente: preferência do cliente e o tocador das falas.
 *
 * O áudio vem do servidor (TTS) por número de rodada. Aqui só se decide se toca, e garante-se que uma
 * fala atrasada não toca por cima da rodada nova. Qualquer falha é silenciosa: o texto já está na tela.
 */

/** on/off = o cliente escolheu no botão de som; null = segue o padrão (fala se a conversa começou pelo microfone). */
export type SpeechPref = 'on' | 'off' | null

const PREF_KEY = 'voice-assistant-speech'

export function readSpeechPref(): SpeechPref {
  try {
    const value = localStorage.getItem(PREF_KEY)
    return value === 'on' || value === 'off' ? value : null
  } catch {
    return null
  }
}

export function writeSpeechPref(value: 'on' | 'off'): void {
  try { localStorage.setItem(PREF_KEY, value) } catch { /* sem storage: vale só nesta tela */ }
}

/** Quem tocou no microfone espera ouvir; quem digitou, provavelmente não (restaurante, celular no viva-voz). */
export function speechEnabled(pref: SpeechPref, startedByVoice: boolean): boolean {
  return pref === null ? startedByVoice : pref === 'on'
}

/** WAV vazio: tocado num toque do cliente, libera o áudio no iPhone para as falas que chegam depois de uma requisição. */
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

type Player = Pick<HTMLAudioElement, 'play' | 'pause' | 'src' | 'onended'>

/**
 * Tocador das falas. Duas filas de prioridade:
 *  - frase de espera ("Certo, vou ver as opções…"): toca logo que o cliente manda algo, se nada estiver tocando;
 *  - fala da rodada: se a de espera ainda está tocando, aguarda ela terminar (não corta a frase no meio).
 * Uma fala que chega atrasada (já há rodada nova, ou o cliente tocou em algo) é descartada.
 */
export class AssistantSpeaker {
  private ticket = 0
  private unlocked = false
  private url: string | null = null
  private playing: 'filler' | 'speech' | null = null
  private queued: Blob | null = null
  private player: Player | null
  private onSpeaking: (speaking: boolean) => void

  constructor(player: Player | null, onSpeaking: (speaking: boolean) => void) {
    this.player = player
    this.onSpeaking = onSpeaking
    if (player) player.onended = () => this.ended()
  }

  /** Chamar dentro de um toque (microfone, enviar, opção, botão de som). Só a primeira vez faz algo. */
  unlock(): void {
    if (this.unlocked || !this.player) return
    this.unlocked = true
    this.player.src = SILENCE
    this.player.play().catch(() => undefined)
  }

  /** Frase de espera: só toca se, quando o áudio chegar, nada mais tiver começado (nem a fala da rodada). */
  async filler(load: () => Promise<Blob>): Promise<void> {
    const mine = this.ticket
    try {
      const blob = await load()
      if (mine !== this.ticket || this.playing !== null || this.queued) return
      await this.play(blob, 'filler', mine)
    } catch (failure) {
      console.warn('[assistente] frase de espera não tocou', failure)
    }
  }

  /** Busca e toca a fala da rodada; espera a frase de espera acabar, se ela estiver tocando. */
  async speak(load: () => Promise<Blob | null>): Promise<void> {
    const mine = ++this.ticket
    try {
      const blob = await load()
      if (mine !== this.ticket || !blob) return
      if (this.playing === 'filler') { this.queued = blob; return }
      await this.play(blob, 'speech', mine)
    } catch (failure) {
      if (mine === this.ticket) this.idle()
      console.warn('[assistente] não foi possível falar', failure)
    }
  }

  stop(): void {
    this.ticket++
    this.queued = null
    this.player?.pause()
    this.idle()
  }

  dispose(): void {
    this.stop()
    this.release()
  }

  private async play(blob: Blob, kind: 'filler' | 'speech', mine: number): Promise<void> {
    if (!this.player) return
    this.release()
    this.url = URL.createObjectURL(blob)
    this.player.src = this.url
    this.playing = kind
    this.onSpeaking(true)
    try {
      await this.player.play()
    } catch (failure) {
      if (mine === this.ticket) this.idle()
      throw failure
    }
  }

  private ended(): void {
    const next = this.queued
    this.queued = null
    this.playing = null
    if (next) void this.play(next, 'speech', this.ticket).catch(failure => console.warn('[assistente] não foi possível falar', failure))
    else this.onSpeaking(false)
  }

  private idle(): void {
    this.playing = null
    this.onSpeaking(false)
  }

  private release(): void {
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = null
  }
}

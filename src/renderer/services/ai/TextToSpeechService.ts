/**
 * Text-to-Speech Service
 *
 * Thin wrapper over the browser Web Speech API (`window.speechSynthesis`).
 * Runs on the main thread, needs no model download, and works offline. The
 * voice list is provided by the OS/browser and may populate asynchronously.
 */

export interface SpeakOptions {
  rate?: number
  pitch?: number
  volume?: number
  /** Case-insensitive substring matched against available voice names. */
  voiceName?: string
  onend?: () => void
  onerror?: () => void
}

class TextToSpeechService {
  private get synth(): SpeechSynthesis | null {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : null
  }

  isSupported(): boolean {
    return this.synth !== null
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.synth?.getVoices() ?? []
  }

  /** Speak `text`, returning the utterance (or null if unsupported/empty). */
  speak(text: string, opts: SpeakOptions = {}): SpeechSynthesisUtterance | null {
    const synth = this.synth
    if (!synth || !text) return null

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = opts.rate ?? 1
    utterance.pitch = opts.pitch ?? 1
    utterance.volume = opts.volume ?? 1

    if (opts.voiceName) {
      const want = opts.voiceName.toLowerCase()
      const voice = this.getVoices().find((v) => v.name.toLowerCase().includes(want))
      if (voice) utterance.voice = voice
    }

    if (opts.onend) utterance.onend = opts.onend
    if (opts.onerror) utterance.onerror = opts.onerror

    synth.speak(utterance)
    return utterance
  }

  /** Stop all in-progress and queued speech (global to the page). */
  cancel(): void {
    this.synth?.cancel()
  }
}

export const textToSpeechService = new TextToSpeechService()

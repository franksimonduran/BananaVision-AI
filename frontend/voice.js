// Voice is unlocked by a user gesture; results never attempt to bypass autoplay.
export default class ExportAlert {
  constructor({ enabled = true, speech = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance, now = () => performance.now(), lang = 'es-ES', intervalMs = 5000 } = {}) {
    this.enabled = enabled;
    this.speech = speech;
    this.Utterance = Utterance;
    this.now = now;
    this.lang = lang;
    this.intervalMs = intervalMs;
    this.lastSpoken = -Infinity;
  }

  get available() { return !!this.speech && !!this.Utterance; }

  voice() {
    const voices = this.speech?.getVoices?.() || [];
    const language = this.lang.toLowerCase();
    const score = voice =>
      (/natural|neural|online|premium|enhanced/i.test(voice.name || '') ? 100 : 0)
      + (voice.lang?.toLowerCase() === language ? 10 : 0)
      + (voice.default ? 1 : 0);
    return voices
      .filter(voice => voice.lang?.toLowerCase().startsWith(language.split('-')[0]))
      .sort((a, b) => score(b) - score(a))[0] || null;
  }

  unlock() {
    if (!this.available) return false;
    try { this.speech.resume(); return true; } catch { return false; }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  speak(message, { continuous = false } = {}) {
    if (!this.enabled || !this.available) return false;
    const now = this.now();
    if (continuous && now - this.lastSpoken < this.intervalMs) return false;
    if (this.speech.speaking || this.speech.pending) return false;
    try {
      const utterance = new this.Utterance(message);
      const voice = this.voice();
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || this.lang;
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;
      this.speech.resume();
      this.speech.speak(utterance);
      this.lastSpoken = now;
      return true;
    } catch { this.stop(); return false; }
  }

  stop() {
    try { this.speech?.cancel(); } catch { /* Nothing was queued. */ }
  }
}

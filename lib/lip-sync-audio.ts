import {AvatarGender} from '@/lib/vrm-cache';

export interface LipSyncWeights {
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
  volume: number;
  isSpeaking: boolean;
}

export class AvatarAudioController {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private synthTimer: number | null = null;
  private spokenText = '';

  private ensureContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.6;
      this.analyser.connect(this.audioCtx.destination);
      const bufferLen = this.analyser.frequencyBinCount;
      this.freqData = new Uint8Array(new ArrayBuffer(bufferLen));
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public stopAll(weights: LipSyncWeights): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {
        // Ignore already stopped source
      }
      this.currentSource = null;
    }
    if (this.synthTimer !== null) {
      window.clearInterval(this.synthTimer);
      this.synthTimer = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    weights.aa = 0;
    weights.ih = 0;
    weights.ou = 0;
    weights.ee = 0;
    weights.oh = 0;
    weights.volume = 0;
    weights.isSpeaking = false;
  }

  public async playWavBase64(
    base64Audio: string,
    text: string,
    weights: LipSyncWeights,
    onEnded?: () => void
  ): Promise<void> {
    this.stopAll(weights);
    const ctx = this.ensureContext();

    const binary = window.atob(base64Audio);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    if (this.analyser) {
      source.connect(this.analyser);
    } else {
      source.connect(ctx.destination);
    }

    this.spokenText = text;
    this.currentSource = source;
    weights.isSpeaking = true;

    source.onended = () => {
      if (this.currentSource === source) {
        this.currentSource = null;
        weights.aa = 0;
        weights.ih = 0;
        weights.ou = 0;
        weights.ee = 0;
        weights.oh = 0;
        weights.volume = 0;
        weights.isSpeaking = false;
        onEnded?.();
      }
    };

    source.start(0);
  }

  public playBrowserSpeech(
    text: string,
    gender: AvatarGender,
    weights: LipSyncWeights,
    onEnded?: () => void
  ): void {
    this.stopAll(weights);
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onEnded?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();

    const preferredVoice =
      gender === 'boy'
        ? voices.find(
            (v) =>
              /guy|ryan|davis|david|daniel|alex|christopher|aaron|male|google uk english male|google us english/i.test(
                v.name
              ) &&
              v.lang.startsWith('en') &&
              !/female|zira|samantha|victoria|aria|jenny/i.test(v.name)
          )
        : voices.find(
            (v) =>
              /aria|jenny|sonia|samantha|victoria|zira|female|google uk english female|google us english/i.test(
                v.name
              ) &&
              v.lang.startsWith('en') &&
              !/guy|david|daniel|alex|male|ryan/i.test(v.name)
          );

    const fallbackVoice = voices.find((v) => v.lang.startsWith('en')) || voices[0];
    if (preferredVoice || fallbackVoice) {
      utterance.voice = preferredVoice || fallbackVoice;
    }

    // Calibrated natural vocal resonance: Silas is deep, warm & confident; Airi is melodic, clear & sweet
    utterance.pitch = gender === 'boy' ? 0.88 : 1.14;
    utterance.rate = gender === 'boy' ? 1.02 : 1.03;

    this.spokenText = text.toLowerCase();
    weights.isSpeaking = true;

    const startTime = performance.now();
    const estimatedDurationMs = Math.max(1200, text.length * 62);

    this.synthTimer = window.setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / estimatedDurationMs);
      const idx = Math.min(
        this.spokenText.length - 1,
        Math.floor(progress * this.spokenText.length)
      );
      const ch = this.spokenText[idx] || 'a';
      const pulse = 0.45 + 0.45 * Math.abs(Math.sin(elapsed * 0.022));

      weights.aa = ch === 'a' ? 0.85 * pulse : 0.15 * pulse;
      weights.ih = ch === 'i' || ch === 'y' ? 0.75 * pulse : 0.05;
      weights.ou = ch === 'u' || ch === 'w' ? 0.75 * pulse : 0.05;
      weights.ee = ch === 'e' ? 0.75 * pulse : 0.1 * pulse;
      weights.oh = ch === 'o' ? 0.8 * pulse : 0.1 * pulse;
      weights.volume = pulse * 0.75;
    }, 32);

    utterance.onend = () => {
      this.stopAll(weights);
      onEnded?.();
    };
    utterance.onerror = () => {
      this.stopAll(weights);
      onEnded?.();
    };

    window.speechSynthesis.speak(utterance);
  }

  public sampleAnalyser(weights: LipSyncWeights): void {
    if (!weights.isSpeaking) {
      weights.aa *= 0.75;
      weights.ih *= 0.75;
      weights.ou *= 0.75;
      weights.ee *= 0.75;
      weights.oh *= 0.75;
      weights.volume *= 0.75;
      return;
    }

    if (this.currentSource && this.analyser && this.freqData) {
      this.analyser.getByteFrequencyData(this.freqData);
      let lowSum = 0;
      let midSum = 0;
      let highSum = 0;

      for (let i = 1; i <= 4; i++) lowSum += this.freqData[i];
      for (let i = 5; i <= 14; i++) midSum += this.freqData[i];
      for (let i = 15; i <= 32; i++) highSum += this.freqData[i];

      const low = Math.min(1, lowSum / (4 * 205));
      const mid = Math.min(1, midSum / (10 * 185));
      const high = Math.min(1, highSum / (18 * 150));
      const vol = Math.min(1, low * 0.5 + mid * 0.38 + high * 0.12);

      if (vol < 0.05) {
        weights.aa *= 0.65;
        weights.ih *= 0.65;
        weights.ou *= 0.65;
        weights.ee *= 0.65;
        weights.oh *= 0.65;
        weights.volume = vol;
        return;
      }

      weights.volume = vol;
      weights.aa = Math.min(1, Math.pow(low, 0.85) * 0.95);
      weights.oh = Math.min(0.85, low * 0.65 + mid * 0.25);
      weights.ee = Math.min(0.8, mid * 0.85);
      weights.ou = Math.min(0.75, low * 0.45 + high * 0.35);
      weights.ih = Math.min(0.75, high * 0.9);
    }
  }

  public playUiCue(type: 'mic-on' | 'mic-off' | 'pop' | 'pat'): void {
    try {
      const ctx = this.ensureContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'mic-on') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(820, now + 0.12);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        osc.start(now);
        osc.stop(now + 0.13);
      } else if (type === 'mic-off') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(720, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        osc.start(now);
        osc.stop(now + 0.11);
      } else if (type === 'pat') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
        osc.start(now);
        osc.stop(now + 0.19);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(640, now);
        osc.frequency.exponentialRampToValueAtTime(720, now + 0.06);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        osc.start(now);
        osc.stop(now + 0.07);
      }
    } catch {
      // Ignore audio cue errors before user gesture
    }
  }
}

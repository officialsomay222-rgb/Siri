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

export interface SpeechPlaybackOptions {
  gender?: AvatarGender;
  emotion?: string;
  pitch?: number;
  rate?: number;
}

/**
 * Strips Gemini TTS vocal burst tags (<laugh>, <gasp>, <breath>, |yeah|)
 * when falling back to browser speechSynthesis so tags are never read literally.
 */
function stripVocalBurstTags(text: string): string {
  return text
    .replace(/<(laugh|gasp|breath|sigh|chuckle)>/gi, '')
    .replace(/\|(yeah|mhm|uh-huh|right)\|/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export class AvatarAudioController {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private warmthFilter: BiquadFilterNode | null = null;
  private presenceFilter: BiquadFilterNode | null = null;
  private airShelfFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private makeupGain: GainNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private synthTimer: number | null = null;
  private spokenText = '';
  private lowEndMode = false;

  public setLowEndMode(enabled: boolean): void {
    this.lowEndMode = enabled;
  }

  private ensureContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      // Studio Gen Z Reels / YT Shorts Vocal Mastering Chain:
      // Source -> Highpass (85Hz) -> Warmth Body (210Hz) -> Crisp Presence (3.8kHz)
      //        -> Air Sparkle Shelf (9.5kHz) -> Punchy Compressor -> Makeup Gain -> Analyser -> Destination
      this.highpassFilter = this.audioCtx.createBiquadFilter();
      this.highpassFilter.type = 'highpass';
      this.highpassFilter.frequency.value = 85;
      this.highpassFilter.Q.value = 0.707;

      this.warmthFilter = this.audioCtx.createBiquadFilter();
      this.warmthFilter.type = 'peaking';
      this.warmthFilter.frequency.value = 210;
      this.warmthFilter.Q.value = 0.95;
      this.warmthFilter.gain.value = 2.0;

      this.presenceFilter = this.audioCtx.createBiquadFilter();
      this.presenceFilter.type = 'peaking';
      this.presenceFilter.frequency.value = 3850;
      this.presenceFilter.Q.value = 1.05;
      this.presenceFilter.gain.value = 4.8;

      this.airShelfFilter = this.audioCtx.createBiquadFilter();
      this.airShelfFilter.type = 'highshelf';
      this.airShelfFilter.frequency.value = 9200;
      this.airShelfFilter.gain.value = 4.4;

      this.compressor = this.audioCtx.createDynamicsCompressor();
      this.compressor.threshold.value = -21;
      this.compressor.knee.value = 10;
      this.compressor.ratio.value = 4.5;
      this.compressor.attack.value = 0.002;
      this.compressor.release.value = 0.12;

      this.makeupGain = this.audioCtx.createGain();
      this.makeupGain.gain.value = 1.32;

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.56;

      this.highpassFilter.connect(this.warmthFilter);
      this.warmthFilter.connect(this.presenceFilter);
      this.presenceFilter.connect(this.airShelfFilter);
      this.airShelfFilter.connect(this.compressor);
      this.compressor.connect(this.makeupGain);
      this.makeupGain.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);

      this.freqData = new Uint8Array(64);
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Dynamically tunes the Reels Vocal Mastering Chain per gender and emotional response
   * so voices sound crisp, punchy, and emotionally expressive like viral IG/YT Reels.
   */
  private configureReelsMastering(gender: AvatarGender = 'boy', emotion = 'happy'): void {
    if (!this.warmthFilter || !this.presenceFilter || !this.airShelfFilter || !this.makeupGain) {
      return;
    }

    const isBoy = gender === 'boy';
    // Base vocal body & crispness
    let warmthDb = isBoy ? 2.4 : 1.4;
    let presenceDb = isBoy ? 4.8 : 5.2;
    let airDb = isBoy ? 4.2 : 4.8;
    let gainVal = 1.32;

    if (emotion === 'angry' || emotion === 'surprised') {
      // High-attitude, sharp, in-your-face Reels punch
      presenceDb += 1.2;
      airDb += 0.8;
      gainVal = 1.38;
    } else if (emotion === 'happy') {
      // Bright, hyped, viral creator energy
      presenceDb += 0.8;
      airDb += 1.0;
      gainVal = 1.35;
    } else if (emotion === 'relaxed' || emotion === 'sad') {
      // Late-night aesthetic POV Reels close-mic warmth
      warmthDb += 1.2;
      presenceDb -= 0.4;
      airDb += 0.5;
      gainVal = 1.28;
    }

    this.warmthFilter.gain.value = warmthDb;
    this.presenceFilter.gain.value = presenceDb;
    this.airShelfFilter.gain.value = airDb;
    this.makeupGain.gain.value = gainVal;
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
    onEnded?: () => void,
    options?: SpeechPlaybackOptions
  ): Promise<void> {
    this.stopAll(weights);
    const ctx = this.ensureContext();

    const gender = options?.gender ?? 'boy';
    const emotion = options?.emotion ?? 'happy';
    if (!this.lowEndMode) {
      this.configureReelsMastering(gender, emotion);
    }

    const binary = window.atob(base64Audio);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    // Snappy Gen Z Reels cadence & user pitch/rate customization
    const userRate = options?.rate ?? 1.0;
    const userPitch = options?.pitch ?? 1.0;

    // Emotion-driven micro-cadence multiplier for viral Reels pacing
    const emotionRateBoost =
      emotion === 'surprised'
        ? 1.05
        : emotion === 'happy' || emotion === 'angry'
        ? 1.03
        : emotion === 'sad'
        ? 0.96
        : 1.02;

    source.playbackRate.value = Math.max(0.7, Math.min(1.45, userRate * emotionRateBoost));

    // Apply user pitch shift in cents without muddying articulation
    const pitchCents = (userPitch - 1.0) * 600;
    if (typeof source.detune !== 'undefined') {
      source.detune.value = Math.max(-450, Math.min(450, pitchCents));
    }

    if (this.lowEndMode && this.analyser) {
      // Direct zero-DSP path for low-end mobile CPUs
      source.connect(this.analyser);
    } else if (this.highpassFilter) {
      source.connect(this.highpassFilter);
    } else if (this.analyser) {
      source.connect(this.analyser);
    } else {
      source.connect(ctx.destination);
    }

    this.spokenText = stripVocalBurstTags(text);
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
    onEnded?: () => void,
    options?: SpeechPlaybackOptions
  ): void {
    this.stopAll(weights);
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onEnded?.();
      return;
    }

    const cleanText = stripVocalBurstTags(text);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();

    // Prioritize high-definition Natural / Online / Neural voices that sound like modern Reels creators
    const preferredVoice =
      gender === 'boy'
        ? voices.find(
            (v) =>
              /natural|online|neural/i.test(v.name) &&
              /guy|ryan|andrew|brian|christopher|eric|steffan|roger|male/i.test(v.name) &&
              v.lang.startsWith('en')
          ) ||
          voices.find(
            (v) =>
              /guy|ryan|davis|david|daniel|alex|christopher|aaron|male|google uk english male|google us english/i.test(
                v.name
              ) &&
              v.lang.startsWith('en') &&
              !/female|zira|samantha|victoria|aria|jenny|sonia/i.test(v.name)
          )
        : voices.find(
            (v) =>
              /natural|online|neural/i.test(v.name) &&
              /aria|ava|emma|jenny|sonia|michelle|ana|female/i.test(v.name) &&
              v.lang.startsWith('en')
          ) ||
          voices.find(
            (v) =>
              /aria|ava|emma|jenny|sonia|samantha|victoria|zira|female|google uk english female|google us english/i.test(
                v.name
              ) &&
              v.lang.startsWith('en') &&
              !/guy|david|daniel|alex|male|ryan/i.test(v.name)
          );

    const fallbackVoice = voices.find((v) => v.lang.startsWith('en')) || voices[0];
    if (preferredVoice || fallbackVoice) {
      utterance.voice = preferredVoice || fallbackVoice;
    }

    // Emotion-responsive attitude tuning for crisp Gen Z Reels delivery
    const emotion = options?.emotion ?? 'happy';
    let emotionPitchMod = 1.0;
    let emotionRateMod = 1.0;

    if (emotion === 'happy') {
      emotionPitchMod = 1.04;
      emotionRateMod = 1.06;
    } else if (emotion === 'surprised') {
      emotionPitchMod = 1.08;
      emotionRateMod = 1.08;
    } else if (emotion === 'angry') {
      emotionPitchMod = 0.96;
      emotionRateMod = 1.07;
    } else if (emotion === 'sad') {
      emotionPitchMod = 0.94;
      emotionRateMod = 0.95;
    } else if (emotion === 'relaxed') {
      emotionPitchMod = 0.97;
      emotionRateMod = 0.98;
    }

    const basePitch = gender === 'boy' ? 0.92 : 1.15;
    const baseRate = gender === 'boy' ? 1.06 : 1.07;
    const userPitch = options?.pitch ?? 1.0;
    const userRate = options?.rate ?? 1.0;

    utterance.pitch = Math.max(0.5, Math.min(2.0, basePitch * userPitch * emotionPitchMod));
    utterance.rate = Math.max(0.5, Math.min(2.0, baseRate * userRate * emotionRateMod));

    this.spokenText = cleanText.toLowerCase();
    weights.isSpeaking = true;

    const startTime = performance.now();
    const estimatedDurationMs = Math.max(1000, (cleanText.length * 56) / utterance.rate);

    this.synthTimer = window.setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / estimatedDurationMs);
      const idx = Math.min(
        this.spokenText.length - 1,
        Math.floor(progress * this.spokenText.length)
      );
      const ch = this.spokenText[idx] || 'a';
      const pulse = 0.48 + 0.48 * Math.abs(Math.sin(elapsed * 0.025));

      weights.aa = ch === 'a' ? 0.88 * pulse : 0.15 * pulse;
      weights.ih = ch === 'i' || ch === 'y' ? 0.78 * pulse : 0.05;
      weights.ou = ch === 'u' || ch === 'w' ? 0.78 * pulse : 0.05;
      weights.ee = ch === 'e' ? 0.78 * pulse : 0.1 * pulse;
      weights.oh = ch === 'o' ? 0.82 * pulse : 0.1 * pulse;
      weights.volume = pulse * 0.8;
    }, 30);

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

      // Process bins 1 through 16 (primary human voice formant spectrum)
      for (let i = 1; i <= 4; i++) lowSum += this.freqData[i];
      for (let i = 5; i <= 10; i++) midSum += this.freqData[i];
      for (let i = 11; i <= 16; i++) highSum += this.freqData[i];

      const low = Math.min(1, lowSum / (4 * 200));
      const mid = Math.min(1, midSum / (6 * 180));
      const high = Math.min(1, highSum / (6 * 145));
      const vol = Math.min(1, low * 0.48 + mid * 0.4 + high * 0.12);

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
      weights.aa = Math.min(1, Math.pow(low, 0.82) * 0.98);
      weights.oh = Math.min(0.88, low * 0.65 + mid * 0.28);
      weights.ee = Math.min(0.84, mid * 0.88);
      weights.ou = Math.min(0.78, low * 0.45 + high * 0.38);
      weights.ih = Math.min(0.78, high * 0.92);
    }
  }

  public dispose(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (_) {}
      this.currentSource.disconnect();
      this.currentSource = null;
    }
    if (this.synthTimer !== null) {
      window.clearInterval(this.synthTimer);
      this.synthTimer = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch (_) {}
      this.analyser = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
    this.freqData = null;
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

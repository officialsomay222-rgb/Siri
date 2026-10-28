import {GoogleGenAI, Modality, ThinkingLevel} from '@google/genai';

export type ReelsEmotion = 'happy' | 'relaxed' | 'surprised' | 'sad' | 'angry' | 'neutral';
export type ReelsToneStyle = 'chill' | 'sweet' | 'anime' | 'studio';

// Strictly the ONLY two models used across the entire application
export const LIVE_VOICE_MODEL = 'gemini-3.8-live-extended-thinking' as const;
export const TEXT_OUTPUT_MODEL = 'gemini-3.1-flash-lite' as const;

export function resolveUserGeminiApiKey(): string {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.Google_Key ||
    process.env.GOOGLE_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.google_key ||
    ''
  ).trim();
}

const BOY_EMOTION_STYLES: Record<ReelsEmotion, string> = {
  happy:
    'Crisp, high-attitude Gen Z YouTube Shorts & Instagram Reels male creator voice. Confident swagger, punchy viral cadence, ultra-clear studio condenser mic presence, infectious hype, and charismatic Hinglish flow.',
  surprised:
    'Explosive, hyper-expressive Gen Z YouTube Shorts male reaction voice! High-voltage shock, crisp dynamic pitch swings, dramatic viral storyteller attitude, and razor-sharp articulation.',
  angry:
    'Bold, savage, unapologetic Gen Z Instagram Reels attitude voice. Sharp, crisp, punchy delivery, fierce confidence, main-character dominance, and dynamic emotional intensity.',
  sad:
    'Deeply emotional, cinematic late-night POV Instagram Reels male voice. Crisp close-mic breathy intimacy, raw heartfelt warmth, gentle protective brotherly care, and soulful cadence.',
  relaxed:
    'Smooth, effortlessly cool Gen Z aesthetic Reels male voice. Crisp close-mic presence, laid-back rizz, warm charismatic undertone, and clean modern flow.',
  neutral:
    'Crisp, snappy Gen Z YouTube Shorts & Insta Reels male creator voice with confident attitude, sharp articulation, and engaging emotional presence.',
};

const GIRL_EMOTION_STYLES: Record<ReelsEmotion, string> = {
  happy:
    'Crisp, sassy, high-energy Gen Z Instagram Reels & YouTube Shorts it-girl voice! Main-character attitude, bubbly yet confident charisma, razor-sharp studio clarity, and expressive Hinglish charm.',
  surprised:
    'Dramatic, hyper-expressive Gen Z viral Reels girl voice! Gasping excitement, crisp high-contrast emotional inflection, infectious main-character energy, and snappy delivery.',
  angry:
    'Fierce, sassy, high-attitude Gen Z baddie Instagram Reels voice! Sharp, crisp articulation, playful fiery dominance, bold vocal punch, and unapologetic confidence.',
  sad:
    'Deeply emotional, aesthetic late-night POV Reels girl voice. Crisp close-mic breathiness, tender heartfelt vulnerability, sweet comforting warmth, and soulful cadence.',
  relaxed:
    'Silky-crisp, aesthetic Gen Z POV Reels girl voice with effortless cool-girl attitude, intimate close-mic warmth, and soothing melodic flow.',
  neutral:
    'Crisp, trendy Gen Z Instagram Reels & YT Shorts female creator voice with confident main-character attitude, snappy articulation, and dynamic emotional expression.',
};

const TONE_MODIFIERS: Record<ReelsToneStyle, string> = {
  chill: 'Deliver with viral Gen Z Insta Reels attitude, crisp articulation, and effortless swagger.',
  sweet: 'Deliver with aesthetic POV Reels closeness, warm emotional resonance, and crisp clarity.',
  anime: 'Deliver with ultra-expressive YT Shorts hype, dynamic emotional peaks, and punchy energy.',
  studio: 'Deliver with flagship broadcast condenser mic authority, deep crisp presence, and tight pacing.',
};

export function getReelsVoiceDesign(
  gender: 'boy' | 'girl',
  emotion: string = 'happy',
  toneStyle: string = 'chill'
): {
  voiceName: string;
  stylePrompt: string;
} {
  const validEmotion: ReelsEmotion =
    emotion in BOY_EMOTION_STYLES ? (emotion as ReelsEmotion) : 'happy';
  const validTone: ReelsToneStyle =
    toneStyle in TONE_MODIFIERS ? (toneStyle as ReelsToneStyle) : 'chill';

  const isBoy = gender === 'boy';
  const baseStyle = isBoy ? BOY_EMOTION_STYLES[validEmotion] : GIRL_EMOTION_STYLES[validEmotion];
  const modifier = TONE_MODIFIERS[validTone];

  // Choose the most expressive prebuilt voice per persona & emotional attitude
  let voiceName: string;
  if (isBoy) {
    voiceName = validTone === 'studio' || validEmotion === 'angry' ? 'Fenrir' : 'Puck';
  } else {
    voiceName =
      validTone === 'sweet' || validEmotion === 'sad' || validEmotion === 'relaxed'
        ? 'Kore'
        : 'Zephyr';
  }

  return {
    voiceName,
    stylePrompt: `${baseStyle} ${modifier}`,
  };
}

/**
 * Formats script for natural spoken delivery without literal stage tags.
 */
export function formatScriptForReelsTts(rawText: string, _emotion: string = 'happy'): string {
  return cleanVisibleSubtitle(rawText).slice(0, 550);
}

/**
 * Ensures any TTS stage directions (<laugh>, <gasp>, <breath>, |yeah|) are stripped
 * from the visible subtitle text displayed in the UI.
 */
export function cleanVisibleSubtitle(rawText: string): string {
  return rawText
    .replace(/<(laugh|gasp|breath|sigh|chuckle)>/gi, '')
    .replace(/\|(yeah|mhm|uh-huh|right)\|/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Studio DSP Voice Enhancer for 24kHz 16-bit Signed Mono PCM Audio:
 * 1. Removes DC offset
 * 2. Adds crisp high-frequency vocal presence & consonant clarity (Reels condenser mic sheen)
 * 3. Adds subtle warm low-mid body + soft-knee analog saturation (`Math.tanh`)
 * 4. Peak-normalizes to -0.8 dBFS so voice output is loud, punchy, and crystal clear
 */
export function enhancePcm16ReelsAudio(
  pcmBuffer: Buffer,
  gender: 'boy' | 'girl' = 'boy',
  emotion: string = 'happy'
): Buffer {
  const sampleCount = Math.floor(pcmBuffer.length / 2);
  if (sampleCount < 64) return pcmBuffer;

  const floatSamples = new Float32Array(sampleCount);

  // 1. Convert Int16LE to Float32 [-1, 1] and compute DC offset
  let sum = 0;
  for (let i = 0; i < sampleCount; i++) {
    const s = pcmBuffer.readInt16LE(i * 2) / 32768.0;
    floatSamples[i] = s;
    sum += s;
  }
  const dcOffset = sum / sampleCount;

  // 2. Crisp presence pre-emphasis + warm body filter
  // Tuned per gender & emotional attitude for viral Gen Z Reels clarity
  const isHighEnergy = emotion === 'happy' || emotion === 'angry' || emotion === 'surprised';
  const presenceCoeff = isHighEnergy ? 0.34 : 0.24;
  const warmthWeight = gender === 'boy' ? 0.14 : 0.09;

  const processed = new Float32Array(sampleCount);
  let prevSample = 0;
  let lowPassState = 0;
  let maxAbs = 0.001;

  for (let i = 0; i < sampleCount; i++) {
    const centered = floatSamples[i] - dcOffset;

    // High-frequency vocal air & crisp consonant exciter
    const highDiff = centered - prevSample;
    prevSample = centered;

    // Warm vocal chest body (1-pole low-pass ~260Hz at 24kHz)
    lowPassState = lowPassState + 0.065 * (centered - lowPassState);

    const enhanced = centered + presenceCoeff * highDiff + warmthWeight * lowPassState;
    processed[i] = enhanced;

    const absVal = Math.abs(enhanced);
    if (absVal > maxAbs) {
      maxAbs = absVal;
    }
  }

  // 3. Peak normalize + studio soft-knee dynamic drive so quieter syllables pop
  const targetPeak = 0.91; // ~ -0.8 dBFS
  const normGain = Math.min(2.6, targetPeak / maxAbs);
  const drive = isHighEnergy ? 1.22 : 1.14;
  const driveNorm = Math.tanh(drive);

  const outBuffer = Buffer.allocUnsafe(sampleCount * 2);
  for (let i = 0; i < sampleCount; i++) {
    const normalized = processed[i] * normGain;
    // Soft-knee saturation prevents harsh digital clipping while boosting perceived loudness
    const saturated = (Math.tanh(normalized * drive) / driveNorm) * targetPeak;
    const clamped = Math.max(-1.0, Math.min(1.0, saturated));
    outBuffer.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }

  return outBuffer;
}

/**
 * Wraps raw 16-bit signed mono PCM bytes into a standard 44-byte RIFF WAVE container.
 */
export function pcm16ToWavBase64(pcmBuffer: Buffer, sampleRate = 24000): string {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]).toString('base64');
}

/**
 * Synthesizes verbatim speech using ONLY `gemini-3.8-live-extended-thinking`
 * with ThinkingLevel.LOW and Studio DSP Voice Enhancement.
 */
export async function synthesizeSpeechWithLive38(params: {
  apiKey: string;
  text: string;
  gender: 'boy' | 'girl';
  emotion?: string;
  toneStyle?: string;
  timeoutMs?: number;
}): Promise<{
  audioBase64: string;
  voiceName: string;
  transcript: string;
}> {
  const {
    apiKey,
    text,
    gender,
    emotion = 'happy',
    toneStyle = 'chill',
    timeoutMs = 15000,
  } = params;

  const {voiceName, stylePrompt} = getReelsVoiceDesign(gender, emotion, toneStyle);
  const cleanLine = formatScriptForReelsTts(text, emotion);

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  return new Promise((resolve, reject) => {
    const pcmChunks: Buffer[] = [];
    let transcript = '';
    let settled = false;
    let liveSession: {close: () => void} | null = null;

    const finalize = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        liveSession?.close();
      } catch {
        // Ignore close errors
      }
      if (pcmChunks.length > 0) {
        const rawPcm = Buffer.concat(pcmChunks);
        const enhancedPcm = enhancePcm16ReelsAudio(rawPcm, gender, emotion);
        resolve({
          audioBase64: pcm16ToWavBase64(enhancedPcm, 24000),
          voiceName,
          transcript: cleanVisibleSubtitle(transcript || cleanLine),
        });
      } else {
        reject(err || new Error('No voice audio received from gemini-3.8-live-extended-thinking'));
      }
    };

    const timer = setTimeout(() => {
      finalize(new Error('gemini-3.8-live-extended-thinking voice synthesis timed out'));
    }, timeoutMs);

    ai.live
      .connect({
        model: LIVE_VOICE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
          systemInstruction: {
            parts: [
              {
                text: `You are ${gender === 'boy' ? 'Silas' : 'Airi'}, a viral Gen Z YouTube Shorts & Instagram Reels voice actor.
Voice Direction: ${stylePrompt}
CRITICAL RULE: Speak the EXACT line provided by the user verbatim with high-attitude, crisp articulation, punchy swagger, and natural emotional inflection matching "${emotion}". Do NOT add any extra words before or after the line.`,
              },
            ],
          },
        },
        callbacks: {
          onmessage: (msg) => {
            const sc = msg?.serverContent;
            if (sc?.outputTranscription?.text) {
              transcript += sc.outputTranscription.text;
            }
            const parts = sc?.modelTurn?.parts || [];
            for (const p of parts) {
              if (p?.inlineData?.data) {
                pcmChunks.push(Buffer.from(p.inlineData.data, 'base64'));
              }
            }
            if (sc?.turnComplete) {
              finalize();
            }
          },
          onerror: (err) => {
            finalize(err instanceof Error ? err : new Error('Live API WebSocket error'));
          },
          onclose: (ev) => {
            if (!settled) {
              finalize(new Error(ev?.reason || 'Live API WebSocket closed'));
            }
          },
        },
      })
      .then((session) => {
        liveSession = session;
        if (settled) {
          try {
            session.close();
          } catch {
            // Ignore
          }
          return;
        }
        session.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [{text: `Speak this exact line now: "${cleanLine}"`}],
            },
          ],
          turnComplete: true,
        });
      })
      .catch((err) => {
        finalize(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

/**
 * Generates a direct conversational reply + enhanced voice audio in a single pass
 * using `gemini-3.8-live-extended-thinking` (with outputAudioTranscription).
 */
export async function converseAndSpeakWithLive38(params: {
  apiKey: string;
  dialogPrompt: string;
  characterInstruction: string;
  gender: 'boy' | 'girl';
  emotion?: string;
  toneStyle?: string;
  timeoutMs?: number;
}): Promise<{
  reply: string;
  audioBase64: string;
  voiceName: string;
}> {
  const {
    apiKey,
    dialogPrompt,
    characterInstruction,
    gender,
    emotion = 'happy',
    toneStyle = 'chill',
    timeoutMs = 15000,
  } = params;

  const {voiceName, stylePrompt} = getReelsVoiceDesign(gender, emotion, toneStyle);

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  return new Promise((resolve, reject) => {
    const pcmChunks: Buffer[] = [];
    let transcript = '';
    let modelText = '';
    let settled = false;
    let liveSession: {close: () => void} | null = null;

    const finalize = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        liveSession?.close();
      } catch {
        // Ignore
      }
      const finalReply = cleanVisibleSubtitle(transcript || modelText);
      if (pcmChunks.length > 0 && finalReply) {
        const rawPcm = Buffer.concat(pcmChunks);
        const enhancedPcm = enhancePcm16ReelsAudio(rawPcm, gender, emotion);
        resolve({
          reply: finalReply,
          audioBase64: pcm16ToWavBase64(enhancedPcm, 24000),
          voiceName,
        });
      } else {
        reject(err || new Error('Live conversation did not return audio and transcript'));
      }
    };

    const timer = setTimeout(() => {
      finalize(new Error('gemini-3.8-live-extended-thinking conversation timed out'));
    }, timeoutMs);

    ai.live
      .connect({
        model: LIVE_VOICE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
          systemInstruction: {
            parts: [
              {
                text: `${characterInstruction}
Voice Delivery Style: ${stylePrompt}
IMPORTANT: Speak directly in character in 1 to 2 short, punchy Hinglish sentences (max 25 words). Do NOT output JSON—speak the natural conversational response directly!`,
              },
            ],
          },
        },
        callbacks: {
          onmessage: (msg) => {
            const sc = msg?.serverContent;
            if (sc?.outputTranscription?.text) {
              transcript += sc.outputTranscription.text;
            }
            const parts = sc?.modelTurn?.parts || [];
            for (const p of parts) {
              if (p?.inlineData?.data) {
                pcmChunks.push(Buffer.from(p.inlineData.data, 'base64'));
              }
              if (p?.text && !(p as {thought?: boolean}).thought) {
                modelText += p.text;
              }
            }
            if (sc?.turnComplete) {
              finalize();
            }
          },
          onerror: (err) => {
            finalize(err instanceof Error ? err : new Error('Live API WebSocket error'));
          },
          onclose: (ev) => {
            if (!settled) {
              finalize(new Error(ev?.reason || 'Live API WebSocket closed'));
            }
          },
        },
      })
      .then((session) => {
        liveSession = session;
        if (settled) {
          try {
            session.close();
          } catch {
            // Ignore
          }
          return;
        }
        session.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [{text: dialogPrompt}],
            },
          ],
          turnComplete: true,
        });
      })
      .catch((err) => {
        finalize(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

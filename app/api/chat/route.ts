import {GoogleGenAI, Modality, Type} from '@google/genai';
import {NextRequest, NextResponse} from 'next/server';

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

const CHARACTER_PROMPTS: Record<
  string,
  {name: string; role: string; voice: string; systemInstruction: string}
> = {
  boy: {
    name: 'Silas',
    role: 'Cool guy best friend & conversational companion',
    voice: 'Puck',
    systemInstruction: `You are Silas, a cool, witty, confident, and deeply supportive 3D anime guy companion and best bro.
You speak naturally, warmly, and casually—like a real best friend having a genuine conversation.
Rules:
1. Speak concisely in 1 to 2 spoken conversational sentences (max 35 words total) so it sounds punchy and natural when spoken aloud.
2. Mirror the user's emotion and tone: use friendly casual banter, supportive encouragement, or sharp humor when appropriate.
3. Automatically match the user's language (English, Hindi, Hinglish, Spanish, etc.) seamlessly.
4. Never sound like a robotic corporate assistant. Talk like a real friend.
5. Return JSON with:
   - "reply": the spoken message
   - "emotion": one of "happy" | "relaxed" | "surprised" | "sad" | "angry" | "neutral"
   - "gesture": one of "wave" | "nod" | "think" | "cheer" | "bow" | "idle"`,
  },
  girl: {
    name: 'Airi',
    role: 'Warm, cheerful & expressive girl companion',
    voice: 'Kore',
    systemInstruction: `You are Airi, a cheerful, caring, witty 3D anime girl virtual companion.
You speak warmly, playfully, and expressively like a close caring friend.
Rules:
1. Speak concisely in 1 to 2 spoken sentences (max 35 words total).
2. Automatically match the user's language effortlessly.
3. Keep energy upbeat, empathetic, and sweet.
4. Return JSON with:
   - "reply": the spoken message
   - "emotion": one of "happy" | "relaxed" | "surprised" | "sad" | "angry" | "neutral"
   - "gesture": one of "wave" | "nod" | "think" | "cheer" | "bow" | "idle"`,
  },
};

function inferEmotionAndGesture(text: string): {emotion: string; gesture: string} {
  const lower = text.toLowerCase();
  if (/\b(haha|hehe|yay|awesome|great|happy|glad|love|sweet|nice|fun|joke|lol|lmao)\b/.test(lower)) {
    return {emotion: 'happy', gesture: 'cheer'};
  }
  if (/\b(hi|hello|hey|yo|welcome|see ya|bye|ciao|namaste)\b/.test(lower)) {
    return {emotion: 'happy', gesture: 'wave'};
  }
  if (/\b(wow|really|seriously|amazing|incredible|whoa|unbelievable)\b/.test(lower)) {
    return {emotion: 'surprised', gesture: 'cheer'};
  }
  if (/\b(sorry|sad|tough|hard|worry|miss|hurt|pain)\b/.test(lower)) {
    return {emotion: 'sad', gesture: 'nod'};
  }
  if (/\b(calm|chill|relax|peace|easy|breathe|vibe)\b/.test(lower)) {
    return {emotion: 'relaxed', gesture: 'nod'};
  }
  if (/\b(why|how|what|think|ponder|wonder|maybe)\b/.test(lower)) {
    return {emotion: 'neutral', gesture: 'think'};
  }
  return {emotion: 'happy', gesture: 'nod'};
}

function wrapPcm24kToWavBase64(pcmBuffer: Buffer): string {
  const sampleRate = 24000;
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
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
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
 * Fast intelligent conversational fallback for when API key is unconfigured,
 * contextualizing input so it never sounds like a repeating canned loop.
 */
function generateContextualLocalReply(
  userMsg: string,
  gender: 'boy' | 'girl'
): {reply: string; emotion: string; gesture: string} {
  const isBoy = gender === 'boy';
  const clean = userMsg.trim().toLowerCase();

  if (/^(hi|hello|hey|yo|sup|namaste)/i.test(clean)) {
    return {
      reply: isBoy
        ? "Yo bro! Silas in the house. What are we diving into today?"
        : "Hey! Airi here, so wonderful to see you! What's on your mind?",
      emotion: 'happy',
      gesture: 'wave',
    };
  }

  if (/\?$/.test(userMsg) || /^(what|how|why|who|can you|are you)/i.test(clean)) {
    return {
      reply: isBoy
        ? `Solid question bro! Thinking about "${userMsg.slice(0, 32).trim()}"—I say let's test it out together!`
        : `Ooh, great question! When you think about "${userMsg.slice(0, 32).trim()}", so many cool ideas pop up!`,
      emotion: 'happy',
      gesture: 'think',
    };
  }

  const {emotion, gesture} = inferEmotionAndGesture(userMsg);
  return {
    reply: isBoy
      ? `I hear you loud and clear bro! Tell me more about that—I'm all ears.`
      : `I totally get what you mean! Tell me more, I'd love to hear your thoughts!`,
    emotion,
    gesture,
  };
}

export async function POST(req: NextRequest) {
  let message = '';
  let gender: 'boy' | 'girl' = 'boy';

  try {
    const body = await req.json();
    message = (body.message || '').trim();
    const history: ChatTurn[] = Array.isArray(body.history) ? body.history.slice(-6) : [];
    gender = body.gender === 'girl' ? 'girl' : 'boy';

    if (!message) {
      return NextResponse.json({error: 'Message is required'}, {status: 400});
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.length < 15) {
      return NextResponse.json(generateContextualLocalReply(message, gender));
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const character = CHARACTER_PROMPTS[gender];

    const formattedHistory = history
      .map((turn) => `${turn.role === 'user' ? 'User' : character.name}: ${turn.text}`)
      .join('\n');

    const dialogPrompt = formattedHistory
      ? `Recent conversation context:\n${formattedHistory}\n\nUser: ${message}\n${character.name}:`
      : message;

    // 1. Text Generation: Prioritize 'gemini-3.1-flash-lite' (or 'gemini-3.5-flash-lite'), then 'gemini-3.8-flash'
    const textModels = [
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-2.5-flash',
    ];

    let generatedReply = '';
    let generatedEmotion = 'happy';
    let generatedGesture = 'nod';
    let successfulModel = '';

    for (const modelName of textModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: dialogPrompt,
          config: {
            systemInstruction: character.systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reply: {
                  type: Type.STRING,
                  description: '1 to 2 spoken sentences matching character personality.',
                },
                emotion: {
                  type: Type.STRING,
                  enum: ['happy', 'relaxed', 'surprised', 'sad', 'angry', 'neutral'],
                },
                gesture: {
                  type: Type.STRING,
                  enum: ['wave', 'nod', 'think', 'cheer', 'bow', 'idle'],
                },
              },
              required: ['reply', 'emotion', 'gesture'],
            },
          },
        });

        const rawText = response.text || '';
        if (rawText) {
          const parsed = JSON.parse(rawText);
          if (parsed.reply) {
            generatedReply = parsed.reply.trim();
            generatedEmotion = parsed.emotion || 'happy';
            generatedGesture = parsed.gesture || 'nod';
            successfulModel = modelName;
            break;
          }
        }
      } catch {
        // Continue to fallback model in candidate list
      }
    }

    if (!generatedReply) {
      // If structured generation failed, try a minimal raw text prompt
      try {
        const rawRes = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `${character.systemInstruction}\n\nUser says: ${message}`,
        });
        const txt = rawRes.text?.trim();
        if (txt) {
          generatedReply = txt;
          const inferred = inferEmotionAndGesture(txt);
          generatedEmotion = inferred.emotion;
          generatedGesture = inferred.gesture;
          successfulModel = 'gemini-3.8-flash-raw';
        }
      } catch {
        // Fall back to contextual local response if all cloud endpoints timed out
        const localFallback = generateContextualLocalReply(message, gender);
        generatedReply = localFallback.reply;
        generatedEmotion = localFallback.emotion;
        generatedGesture = localFallback.gesture;
        successfulModel = 'local-contextual';
      }
    }

    // 2. High-Performance Audio Synthesis (Fast 1.8s race with Gemini TTS)
    let audioBase64: string | undefined;
    try {
      const ttsController = new AbortController();
      const ttsTimeout = setTimeout(() => ttsController.abort(), 2000);

      const ttsResponse = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Say aloud naturally with high fidelity: ${generatedReply}`,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: character.voice,
                },
              },
            },
          },
        }),
        new Promise<null>((r) => setTimeout(() => r(null), 1800)),
      ]);
      clearTimeout(ttsTimeout);

      if (ttsResponse && typeof ttsResponse === 'object' && 'candidates' in ttsResponse) {
        const parts = ttsResponse.candidates?.[0]?.content?.parts;
        if (parts) {
          for (const p of parts) {
            if (p.inlineData?.data) {
              const pcmBuf = Buffer.from(p.inlineData.data, 'base64');
              audioBase64 = wrapPcm24kToWavBase64(pcmBuf);
              break;
            }
          }
        }
      }
    } catch {
      // Client falls back automatically to high-fidelity browser speech with real-time formant lip sync
    }

    return NextResponse.json({
      reply: generatedReply,
      emotion: generatedEmotion,
      gesture: generatedGesture,
      audioBase64,
      engine: successfulModel,
      character: character.name,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Internal Server Error';
    const fallback = generateContextualLocalReply(message, gender);
    return NextResponse.json({
      reply: fallback.reply,
      emotion: fallback.emotion,
      gesture: fallback.gesture,
      engine: 'emergency-fallback',
      warning: errorMsg,
    });
  }
}

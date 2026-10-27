import {GoogleGenAI, LiveServerMessage, Modality, Type} from '@google/genai';
import {NextRequest, NextResponse} from 'next/server';

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

const CHARACTER_PROMPTS: Record<
  string,
  {name: string; voice: string; instruction: string}
> = {
  girl: {
    name: 'Airi',
    voice: 'Kore',
    instruction:
      'You are Airi, a warm, witty, expressive 3D avatar girl companion. You speak naturally like a close friend—cheerful, caring, playful, and concise (1 to 2 short sentences so it sounds natural when spoken aloud). Automatically match the user’s language (English, Hinglish, Hindi, etc.) effortlessly.',
  },
  boy: {
    name: 'Silas',
    voice: 'Puck',
    instruction:
      'You are Silas, a cool, friendly, charismatic 3D avatar guy best friend. You speak naturally like a supportive bro—confident, warm, witty, and concise (1 to 2 short sentences so it sounds natural when spoken aloud). Automatically match the user’s language (English, Hinglish, Hindi, etc.) effortlessly.',
  },
};

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
  header.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
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

function inferEmotionAndGesture(text: string): {emotion: string; gesture: string} {
  const lower = text.toLowerCase();
  if (/\b(haha|hehe|yay|awesome|great|happy|glad|love|sweet|nice|fun|joke)\b/.test(lower)) {
    return {emotion: 'happy', gesture: 'cheer'};
  }
  if (/\b(hi|hello|hey|yo|welcome|see ya|bye)\b/.test(lower)) {
    return {emotion: 'happy', gesture: 'wave'};
  }
  if (/\b(wow|really|seriously|amazing|incredible|whoa)\b/.test(lower)) {
    return {emotion: 'surprised', gesture: 'cheer'};
  }
  if (/\b(sorry|sad|tough|hard|worry|understand)\b/.test(lower)) {
    return {emotion: 'sad', gesture: 'nod'};
  }
  if (/\b(calm|chill|relax|peace|easy|breathe)\b/.test(lower)) {
    return {emotion: 'relaxed', gesture: 'nod'};
  }
  return {emotion: 'happy', gesture: 'nod'};
}

async function generateNativeAudioDialogTurn(
  ai: GoogleGenAI,
  modelName: string,
  systemInstruction: string,
  voiceName: string,
  promptText: string
): Promise<{reply: string; audioBase64: string} | null> {
  return new Promise((resolve) => {
    const pcmChunks: Buffer[] = [];
    let transcriptText = '';
    let modelText = '';
    let settled = false;
    let activeSession: {close?: () => void} | null = null;

    const finish = (result: {reply: string; audioBase64: string} | null) => {
      if (settled) return;
      settled = true;
      try {
        activeSession?.close?.();
      } catch {
        // Ignore close errors
      }
      resolve(result);
    };

    const timeout = setTimeout(() => {
      if (pcmChunks.length > 0) {
        const finalReply = (transcriptText || modelText || 'Here for you!').trim();
        finish({
          reply: finalReply,
          audioBase64: wrapPcm24kToWavBase64(Buffer.concat(pcmChunks)),
        });
      } else {
        finish(null);
      }
    }, 6500);

    ai.live
      .connect({
        model: modelName,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {voiceName},
            },
          },
          outputAudioTranscription: {},
          systemInstruction,
        },
        callbacks: {
          onmessage: (msg: LiveServerMessage) => {
            const parts = msg.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  pcmChunks.push(Buffer.from(part.inlineData.data, 'base64'));
                }
                if (part.text) {
                  modelText += part.text;
                }
              }
            }
            const outTranscript = (
              msg.serverContent as unknown as {outputTranscription?: {text?: string}}
            )?.outputTranscription?.text;
            if (outTranscript) {
              transcriptText += outTranscript;
            }

            if (msg.serverContent?.turnComplete) {
              clearTimeout(timeout);
              if (pcmChunks.length > 0) {
                const cleanReply = (transcriptText || modelText || 'Got it!').trim();
                finish({
                  reply: cleanReply,
                  audioBase64: wrapPcm24kToWavBase64(Buffer.concat(pcmChunks)),
                });
              } else {
                finish(null);
              }
            }
          },
          onerror: () => {
            clearTimeout(timeout);
            finish(null);
          },
          onclose: () => {
            clearTimeout(timeout);
            if (!settled) {
              if (pcmChunks.length > 0) {
                finish({
                  reply: (transcriptText || modelText || 'Got it!').trim(),
                  audioBase64: wrapPcm24kToWavBase64(Buffer.concat(pcmChunks)),
                });
              } else {
                finish(null);
              }
            }
          },
        },
      })
      .then((session) => {
        if (settled) {
          try {
            session.close();
          } catch {
            // Ignore
          }
          return;
        }
        activeSession = session;
        session.sendClientContent({
          turns: [{role: 'user', parts: [{text: promptText}]}],
          turnComplete: true,
        });
      })
      .catch(() => {
        clearTimeout(timeout);
        finish(null);
      });
  });
}

function generateSmartLocalReply(
  userMessage: string,
  gender: 'girl' | 'boy'
): {reply: string; emotion: string; gesture: string} {
  const lower = userMessage.toLowerCase();
  const isBoy = gender === 'boy';
  const name = isBoy ? 'Silas' : 'Airi';

  if (/\b(hi|hello|hey|yo|namaste|hola|sup)\b/.test(lower)) {
    return {
      reply: isBoy
        ? "Yo bro! I'm Silas. Great to see you—what's on your mind today?"
        : "Hey there! I'm Airi, so happy to chat with you! How is your day going?",
      emotion: 'happy',
      gesture: 'wave',
    };
  }
  if (/\b(who are you|your name|introduce)\b/.test(lower)) {
    return {
      reply: isBoy
        ? "I'm Silas, your 3D AI companion powered by Gemini Native Audio Dialog!"
        : "I'm Airi, your 3D virtual companion! I love chatting and hanging out with you.",
      emotion: 'happy',
      gesture: 'cheer',
    };
  }
  if (/\b(how are you|kaise ho|kaisi ho|what's up|wassup)\b/.test(lower)) {
    return {
      reply: isBoy
        ? "I'm doing awesome bro, running super smooth! How about you?"
        : "I'm feeling wonderful and full of energy today! How are you doing?",
      emotion: 'relaxed',
      gesture: 'nod',
    };
  }
  if (/\b(joke|funny|laugh)\b/.test(lower)) {
    return {
      reply: isBoy
        ? 'Why do programmers prefer dark mode? Because light attracts bugs, bro!'
        : 'Why did the smartphone go to school? Because it wanted to be a little smarter, hehe!',
      emotion: 'happy',
      gesture: 'cheer',
    };
  }
  if (/\b(love|cute|beautiful|handsome|nice|awesome|cool)\b/.test(lower)) {
    return {
      reply: isBoy
        ? 'Thanks bro, you are pretty awesome yourself! Always got your back.'
        : 'Aww, thank you so much! That really made me smile!',
      emotion: 'happy',
      gesture: 'cheer',
    };
  }

  return {
    reply: isBoy
      ? `That sounds awesome bro! Tell me more about "${userMessage.slice(0, 40)}".`
      : `Ooh, I love hearing about that! Tell me a little more, ${name} is listening!`,
    emotion: 'happy',
    gesture: 'nod',
  };
}

export async function POST(req: NextRequest) {
  let message = '';
  let gender: 'girl' | 'boy' = 'girl';

  try {
    const body = await req.json();
    message = (body.message || '').trim();
    const history: ChatTurn[] = Array.isArray(body.history) ? body.history.slice(-6) : [];
    gender = body.gender === 'boy' ? 'boy' : 'girl';

    if (!message) {
      return NextResponse.json({error: 'Message is required'}, {status: 400});
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.length < 15) {
      return NextResponse.json(generateSmartLocalReply(message, gender));
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const character = CHARACTER_PROMPTS[gender] || CHARACTER_PROMPTS.girl;

    const formattedHistory = history
      .map((turn) => `${turn.role === 'user' ? 'User' : character.name}: ${turn.text}`)
      .join('\n');

    const dialogPrompt = formattedHistory
      ? `Recent conversation:\n${formattedHistory}\n\nUser says: ${message}\nReply naturally in 1-2 short spoken sentences as ${character.name}.`
      : message;

    // 1. Primary: Gemini 2.5 Flash Native Audio Dialog / Gemini Live Native Audio
    const nativeAudioModels = [
      'gemini-2.5-flash-preview-native-audio-dialog',
      'gemini-2.5-flash-native-audio-preview-12-2025',
      'gemini-3.8-live',
    ];

    for (const liveModel of nativeAudioModels) {
      const liveResult = await generateNativeAudioDialogTurn(
        ai,
        liveModel,
        character.instruction,
        character.voice,
        dialogPrompt
      );
      if (liveResult && liveResult.audioBase64) {
        const {emotion, gesture} = inferEmotionAndGesture(liveResult.reply);
        return NextResponse.json({
          reply: liveResult.reply,
          audioBase64: liveResult.audioBase64,
          emotion,
          gesture,
          engine: liveModel,
        });
      }
    }

    // 2. Fallback: Standard Gemini Flash text generation if Live WebSocket was unavailable
    const textModels = ['gemini-3.8-flash', 'gemini-flash-latest'];
    for (const modelName of textModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: dialogPrompt,
          config: {
            systemInstruction: `${character.instruction}
Return JSON with "reply" (1-2 spoken sentences), "emotion" ("happy"|"relaxed"|"surprised"|"sad"|"angry"|"neutral"), and "gesture" ("wave"|"nod"|"think"|"cheer"|"bow"|"idle").`,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reply: {type: Type.STRING},
                emotion: {type: Type.STRING},
                gesture: {type: Type.STRING},
              },
              required: ['reply', 'emotion', 'gesture'],
            },
          },
        });
        const rawText = response.text || '';
        if (rawText) {
          const parsed = JSON.parse(rawText);
          return NextResponse.json({
            reply: parsed.reply || rawText,
            emotion: parsed.emotion || 'happy',
            gesture: parsed.gesture || 'nod',
            engine: modelName,
          });
        }
      } catch {
        // Continue fallback
      }
    }

    return NextResponse.json(generateSmartLocalReply(message, gender));
  } catch {
    return NextResponse.json(generateSmartLocalReply(message || 'hello', gender));
  }
}

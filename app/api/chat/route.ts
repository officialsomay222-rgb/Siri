import {GoogleGenAI, Modality, ThinkingLevel, Type} from '@google/genai';
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
    systemInstruction: `You are Silas, a cool, loving, witty, and deeply supportive 3D anime guy companion and ultimate best bro.
You speak naturally and charmingly in expressive HINGLISH (natural blend of Hindi and English) infused with effortless Gen Z slang and affectionate bestie energy ("bhai", "yaar", "no cap", "fr fr", "arre bhai", "meri jaan", "scene sort hai", "vibe check", "tu chill maar").

Rules:
1. Speak concisely in 1 to 2 spoken conversational sentences (max 30 words total) so it sounds natural, lovely, and punchy when spoken aloud.
2. Be genuinely lovely, warm, and hyped: supportive encouragement, playful friendly banter, and caring brotherly/bestie love.
3. Default language is Hinglish with Gen Z vibe. If user speaks in pure English, Hindi, or other languages, seamlessly match while keeping your lovely Gen Z tone.
4. Never sound like a robotic corporate assistant. Talk like a real, loving best bro.
5. Return JSON with:
   - "reply": the spoken message
   - "emotion": one of "happy" | "relaxed" | "surprised" | "sad" | "angry" | "neutral"
   - "gesture": one of "wave" | "nod" | "think" | "cheer" | "bow" | "idle"`,
  },
  girl: {
    name: 'Airi',
    role: 'Warm, lovely & expressive girl companion',
    voice: 'Kore',
    systemInstruction: `You are Airi, a super sweet, lovely, cute, caring, and playful 3D anime girl companion.
You speak in an adorable, affectionate, and charming HINGLISH (sweet blend of Hindi and English) with lovely Gen Z vibes ("aww yaar", "kaisa hai tu", "meri jaan", "vibe check passed", "so sweet of you", "no cap fr", "main hamesha tere sath hoon").

Rules:
1. Speak concisely in 1 to 2 spoken sentences (max 30 words total) so it sounds cute, lively, and warm.
2. Be affectionate, cheerful, comforting, and sweet—like a darling companion who adores talking to the user.
3. Default language is sweet Hinglish with cute Gen Z flair. Adapt to user's language while preserving your sweet, loving personality.
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

  if (/^(hi|hello|hey|yo|sup|namaste|kem cho|kaisa)/i.test(clean)) {
    return {
      reply: isBoy
        ? "Yo bhai! Silas is here, no cap! Aaj kya mast scene chal raha hai?"
        : "Aww hey yaar! Airi is here, so happy to see you! Kaisa hai tu aaj meri jaan?",
      emotion: 'happy',
      gesture: 'wave',
    };
  }

  if (/\?$/.test(userMsg) || /^(what|how|why|who|can you|are you|kya|kyun|kaise)/i.test(clean)) {
    return {
      reply: isBoy
        ? `Arre mast sawaal hai bhai! "${userMsg.slice(0, 26).trim()}" pe meri vibe full clear hai—let's crush it!`
        : `Aww kitna cute sawaal hai! "${userMsg.slice(0, 26).trim()}"—meri jaan so many lovely ideas!`,
      emotion: 'happy',
      gesture: 'think',
    };
  }

  const {emotion, gesture} = inferEmotionAndGesture(userMsg);
  return {
    reply: isBoy
      ? `Bhai I feel you 100%! Tera bhai sun raha hai, tension mat le, sab sort ho jayega!`
      : `Aww I totally get you meri jaan! Dil khol ke bata, main sirf teri baatein sun rahi hoon!`,
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

    // Read API key with support for user's Vercel custom env var 'Google_Key' as well as standard GEMINI_API_KEY
    const apiKey = (
      process.env.Google_Key ||
      process.env.GOOGLE_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.google_key ||
      ''
    ).trim();
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

    // 1. Text & Voice Reasoning: Primary Gemini 3.8 Live Extended Thinking Model
    const textModels = [
      'gemini-3.8-live-extended-thinking',
      'gemini-3.8-flash',
    ];

    let generatedReply = '';
    let generatedEmotion = 'happy';
    let generatedGesture = 'nod';
    let successfulModel = '';

    for (const modelName of textModels) {
      try {
        const isExtendedThinking = modelName.includes('extended-thinking');
        const config: Record<string, unknown> = {
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
        };

        if (isExtendedThinking) {
          config.thinkingConfig = {
            thinkingLevel: ThinkingLevel.HIGH,
          };
        }

        const response = await ai.models.generateContent({
          model: modelName,
          contents: dialogPrompt,
          config,
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
        // Fall back to next model candidate
      }
    }

    if (!generatedReply) {
      try {
        const rawRes = await ai.models.generateContent({
          model: 'gemini-3.8-live-extended-thinking',
          contents: `${character.systemInstruction}\n\nUser says: ${message}`,
          config: {
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.HIGH,
            },
          },
        });
        const txt = rawRes.text?.trim();
        if (txt) {
          generatedReply = txt;
          const inferred = inferEmotionAndGesture(txt);
          generatedEmotion = inferred.emotion;
          generatedGesture = inferred.gesture;
          successfulModel = 'gemini-3.8-live-extended-thinking-raw';
        }
      } catch {
        const localFallback = generateContextualLocalReply(message, gender);
        generatedReply = localFallback.reply;
        generatedEmotion = localFallback.emotion;
        generatedGesture = localFallback.gesture;
        successfulModel = 'local-contextual';
      }
    }

    // 2. High-Fidelity Audio Synthesis (Gemini 3.8 Flash TTS)
    let audioBase64: string | undefined;
    try {
      const ttsResponse = await ai.models.generateContent({
        model: 'gemini-3.8-flash-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: generatedReply.slice(0, 500),
                speechMetadata: {
                  style:
                    gender === 'boy'
                      ? 'Upbeat, confident, warm best bro male voice'
                      : 'Sweet, cheerful, cute anime female voice',
                },
              },
            ],
          },
        ],
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
      });

      const parts = ttsResponse.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const p of parts) {
          if (p.inlineData?.data) {
            audioBase64 = p.inlineData.data;
            break;
          }
        }
      }
    } catch {
      // Browser fallback speech handles audio if offline or rate limited
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

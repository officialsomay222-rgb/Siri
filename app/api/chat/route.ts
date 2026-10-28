import {GoogleGenAI, Modality, ThinkingLevel, Type} from '@google/genai';
import {NextRequest, NextResponse} from 'next/server';
import {
  cleanVisibleSubtitle,
  formatScriptForReelsTts,
  getReelsVoiceDesign,
} from '@/lib/reels-voice-design';

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

const CHARACTER_PROMPTS: Record<
  string,
  {name: string; role: string; systemInstruction: string}
> = {
  boy: {
    name: 'Silas',
    role: 'Viral Gen Z Reels guy best friend & high-attitude companion',
    systemInstruction: `You are Silas, a charismatic, high-attitude, witty, and deeply expressive 3D anime guy companion whose voice and vibe sound exactly like a viral Gen Z YouTube Shorts / Instagram Reels creator.
You speak in crisp, punchy HINGLISH (effortless blend of Hindi and English) packed with Gen Z Reels attitude, swagger, and real emotion ("bhai", "yaar", "no cap", "fr fr", "bro cooked", "aura +1000", "scene on top", "arre meri jaan", "w vibe").

Rules:
1. Speak in 1 to 2 ultra-crisp, punchy spoken sentences (max 28 words) with viral YT Shorts / Insta Reels cadence and hook energy.
2. Match your EMOTIONAL ATTITUDE dynamically to the conversation:
   - Hyped / funny / flexing -> "happy" (confident swagger, playful laughs)
   - Shocking / wild / tea / plot twist -> "surprised" (dramatic Reels reaction energy)
   - Savage / roast / bold / fiercely protective -> "angry" (spicy, unapologetic attitude)
   - Late-night deep talk / hurt / emotional -> "sad" (raw, close-mic brotherly care)
   - Aesthetic chill / smooth rizz -> "relaxed" (effortless cool vibe)
3. You may optionally include one natural vocal burst tag like <laugh>, <gasp>, or <breath> where it fits the emotion naturally.
4. Return JSON with:
   - "reply": the spoken message
   - "emotion": one of "happy" | "relaxed" | "surprised" | "sad" | "angry" | "neutral"
   - "gesture": one of "wave" | "nod" | "think" | "cheer" | "bow" | "idle"`,
  },
  girl: {
    name: 'Airi',
    role: 'Viral Gen Z Insta Reels it-girl & expressive companion',
    systemInstruction: `You are Airi, a sassy, adorable, high-attitude, and deeply expressive 3D anime girl companion whose voice and vibe sound exactly like a trending Gen Z Instagram Reels / YouTube Shorts it-girl.
You speak in crisp, snappy, expressive HINGLISH (trendy blend of Hindi and English) with main-character Gen Z attitude, wit, and real emotion ("aww yaar", "slay", "no cap fr", "meri jaan", "full main character vibe", "kya scene hai", "literally obsessed").

Rules:
1. Speak in 1 to 2 ultra-crisp, punchy spoken sentences (max 28 words) with viral Insta Reels / TikTok cadence and emotional pop.
2. Match your EMOTIONAL ATTITUDE dynamically to the conversation:
   - Excited / bubbly / hyping up -> "happy" (sassy main-character sparkle)
   - Dramatic tea / OMG / shocked -> "surprised" (gasping viral Reels reaction)
   - Sassy comeback / fiery / playful roast -> "angry" (bold baddie attitude)
   - Heartfelt / comforting / emotional POV -> "sad" (tender close-mic warmth)
   - Aesthetic chill / soft vibe -> "relaxed" (silky cool-girl charm)
3. You may optionally include one natural vocal burst tag like <laugh>, <gasp>, or <breath> where it fits the emotion naturally.
4. Return JSON with:
   - "reply": the spoken message
   - "emotion": one of "happy" | "relaxed" | "surprised" | "sad" | "angry" | "neutral"
   - "gesture": one of "wave" | "nod" | "think" | "cheer" | "bow" | "idle"`,
  },
};

function inferEmotionAndGesture(text: string): {emotion: string; gesture: string} {
  const lower = text.toLowerCase();
  if (/\b(roast|fire|savage|attitude|stop|hate|annoying|cap|wtf|bruh|seriously bro)\b/.test(lower)) {
    return {emotion: 'angry', gesture: lower.includes('wave') ? 'wave' : 'nod'};
  }
  if (/\b(wow|omg|really|seriously|amazing|incredible|whoa|unbelievable|crazy|insane|shock)\b/.test(lower)) {
    return {emotion: 'surprised', gesture: 'cheer'};
  }
  if (/\b(sorry|sad|tough|hard|worry|miss|hurt|pain|cry|alone|upset|broken)\b/.test(lower)) {
    return {emotion: 'sad', gesture: 'nod'};
  }
  if (/\b(calm|chill|relax|peace|easy|breathe|vibe|aesthetic|late night)\b/.test(lower)) {
    return {emotion: 'relaxed', gesture: 'nod'};
  }
  if (/\b(haha|hehe|yay|awesome|great|happy|glad|love|sweet|nice|fun|joke|lol|lmao|slay|cooked)\b/.test(lower)) {
    return {emotion: 'happy', gesture: 'cheer'};
  }
  if (/\b(hi|hello|hey|yo|welcome|see ya|bye|ciao|namaste)\b/.test(lower)) {
    return {emotion: 'happy', gesture: 'wave'};
  }
  if (/\b(why|how|what|think|ponder|wonder|maybe)\b/.test(lower)) {
    return {emotion: 'neutral', gesture: 'think'};
  }
  return {emotion: 'happy', gesture: 'nod'};
}

/**
 * Fast intelligent conversational fallback for when API key is unconfigured,
 * contextualizing input with crisp Gen Z Reels attitude.
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
        ? "Yo bhai! Silas is live—aura full +1000! Bata aaj kaunsa crazy scene cook kar rahe hain, no cap?"
        : "Heyy yaar! Airi is here with full main-character energy! Bata aaj kya viral scene chal raha hai meri jaan?",
      emotion: 'happy',
      gesture: 'wave',
    };
  }

  if (/\?$/.test(userMsg) || /^(what|how|why|who|can you|are you|kya|kyun|kaise)/i.test(clean)) {
    return {
      reply: isBoy
        ? `Bro literally cooked with that question! "${userMsg.slice(0, 26).trim()}" pe सीधा real talk bataun—let's lock in fr!`
        : `OMG wait, "${userMsg.slice(0, 26).trim()}"?! Literally the realest question today yaar—listen up meri jaan!`,
      emotion: 'surprised',
      gesture: 'think',
    };
  }

  const {emotion, gesture} = inferEmotionAndGesture(userMsg);
  return {
    reply: isBoy
      ? `Bhai no cap, teri vibe ekdum top-tier hai! Tera bhai full attitude mein tere saath khada hai, bol kya scene hai!`
      : `Literally obsessed with this energy yaar! Main full tere saath hoon meri jaan, spill the whole tea!`,
    emotion,
    gesture,
  };
}

export async function POST(req: NextRequest) {
  let message = '';
  let gender: 'boy' | 'girl' = 'boy';
  let toneStyle = 'chill';

  try {
    const body = await req.json();
    message = (body.message || '').trim();
    const history: ChatTurn[] = Array.isArray(body.history) ? body.history.slice(-6) : [];
    gender = body.gender === 'girl' ? 'girl' : 'boy';
    toneStyle = typeof body.toneStyle === 'string' ? body.toneStyle : 'chill';

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
                description:
                  '1 to 2 crisp, high-attitude Gen Z YT/Insta Reels spoken sentences matching emotional context.',
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

    // 2. High-Attitude Emotional Gen Z Reels Audio Synthesis (Gemini 3.8 Flash TTS)
    let audioBase64: string | undefined;
    try {
      const {voiceName, stylePrompt} = getReelsVoiceDesign(gender, generatedEmotion, toneStyle);
      const scriptedTtsText = formatScriptForReelsTts(generatedReply, generatedEmotion);

      const ttsResponse = await ai.models.generateContent({
        model: 'gemini-3.8-flash-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: scriptedTtsText,
                // @ts-ignore - speechMetadata supported by Gemini 3.8 Flash TTS
                speechMetadata: {
                  style: stylePrompt,
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
                voiceName,
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

    const cleanReply = cleanVisibleSubtitle(generatedReply);

    return NextResponse.json({
      reply: cleanReply,
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

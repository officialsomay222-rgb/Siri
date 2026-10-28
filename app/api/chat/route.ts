import {GoogleGenAI, Type} from '@google/genai';
import {NextRequest, NextResponse} from 'next/server';
import {
  cleanVisibleSubtitle,
  converseAndSpeakWithLive38,
  LIVE_VOICE_MODEL,
  resolveUserGeminiApiKey,
  synthesizeSpeechWithLive38,
  TEXT_OUTPUT_MODEL,
} from '@/lib/reels-voice-design';

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

const CHARACTER_PROMPTS: Record<
  string,
  {
    name: string;
    role: string;
    systemInstruction: string;
  }
> = {
  boy: {
    name: 'Silas',
    role: 'Viral Gen Z Reels guy best friend & high-attitude companion',
    systemInstruction: `You are Silas, a charismatic, witty, high-attitude 3D anime guy companion whose voice and vibe sound like a viral Gen Z YouTube Shorts / Instagram Reels creator.
You speak in crisp, punchy HINGLISH (effortless blend of Hindi and English) packed with Gen Z Reels attitude, swagger, and real emotion ("bhai", "yaar", "no cap", "fr fr", "scene on top", "arre meri jaan").

Rules:
1. Directly answer or react to what the user specifically said in 1 to 2 ultra-crisp, punchy spoken sentences (max 25 words). Never use generic filler—always address the user's exact topic!
2. Match your EMOTIONAL ATTITUDE dynamically to the conversation:
   - Hyped / funny / flexing -> "happy"
   - Shocking / wild / plot twist -> "surprised"
   - Savage / roast / bold / fiercely protective -> "angry"
   - Late-night deep talk / hurt / emotional -> "sad"
   - Aesthetic chill / smooth rizz -> "relaxed"
3. Return JSON with:
   - "reply": the spoken message
   - "emotion": one of "happy" | "relaxed" | "surprised" | "sad" | "angry" | "neutral"
   - "gesture": one of "wave" | "nod" | "think" | "cheer" | "bow" | "idle"`,
  },
  girl: {
    name: 'Airi',
    role: 'Viral Gen Z Insta Reels it-girl & expressive companion',
    systemInstruction: `You are Airi, a sassy, adorable, high-attitude, and deeply expressive 3D anime girl companion whose voice and vibe sound like a trending Gen Z Instagram Reels / YouTube Shorts it-girl.
You speak in crisp, snappy, expressive HINGLISH (trendy blend of Hindi and English) with main-character Gen Z attitude, wit, and real emotion ("aww yaar", "slay", "no cap fr", "meri jaan", "kya scene hai").

Rules:
1. Directly answer or react to what the user specifically said in 1 to 2 ultra-crisp, punchy spoken sentences (max 25 words). Never use generic filler—always address the user's exact topic!
2. Match your EMOTIONAL ATTITUDE dynamically to the conversation:
   - Excited / bubbly / hyping up -> "happy"
   - Dramatic tea / OMG / shocked -> "surprised"
   - Sassy comeback / fiery / playful roast -> "angry"
   - Heartfelt / comforting / emotional POV -> "sad"
   - Aesthetic chill / soft vibe -> "relaxed"
3. Return JSON with:
   - "reply": the spoken message
   - "emotion": one of "happy" | "relaxed" | "surprised" | "sad" | "angry" | "neutral"
   - "gesture": one of "wave" | "nod" | "think" | "cheer" | "bow" | "idle"`,
  },
};

function inferEmotionAndGesture(text: string): {emotion: string; gesture: string} {
  const lower = text.toLowerCase();
  if (/\b(roast|fire|savage|attitude|stop|hate|annoying|cap|wtf|bruh|seriously bro|baddie)\b/.test(lower)) {
    return {emotion: 'angry', gesture: lower.includes('wave') ? 'wave' : 'nod'};
  }
  if (/\b(wow|omg|really|seriously|amazing|incredible|whoa|unbelievable|crazy|insane|shock|wait what)\b/.test(lower)) {
    return {emotion: 'surprised', gesture: 'cheer'};
  }
  if (/\b(sorry|sad|tough|hard|worry|miss|hurt|pain|cry|alone|upset|broken|tension)\b/.test(lower)) {
    return {emotion: 'sad', gesture: 'nod'};
  }
  if (/\b(calm|chill|relax|peace|easy|breathe|vibe|aesthetic|late night|cozy)\b/.test(lower)) {
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = (body.message || '').trim();
    const history: ChatTurn[] = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const gender: 'boy' | 'girl' = body.gender === 'girl' ? 'girl' : 'boy';
    const toneStyle = typeof body.toneStyle === 'string' ? body.toneStyle : 'chill';

    if (!message) {
      return NextResponse.json({error: 'Message is required'}, {status: 400});
    }

    const apiKey = resolveUserGeminiApiKey();

    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.length < 15) {
      return NextResponse.json(
        {error: 'Gemini API key is not configured on the server.'},
        {status: 503}
      );
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
    const inferredUserContext = inferEmotionAndGesture(message);

    const formattedHistory = history
      .map((turn) => `${turn.role === 'user' ? 'User' : character.name}: ${turn.text}`)
      .join('\n');

    const dialogPrompt = formattedHistory
      ? `Recent conversation context:\n${formattedHistory}\n\nUser: ${message}\nRespond directly to the user as ${character.name}:`
      : message;

    let generatedReply = '';
    let generatedEmotion = inferredUserContext.emotion;
    let generatedGesture = inferredUserContext.gesture;
    let audioBase64: string | undefined;

    // Step 1: Text Output Generation via strictly `gemini-3.1-flash-lite`
    // Bounded to 2.5s so temporary 503 demand spikes never block Live 3.8 voice generation
    try {
      const textPromise = ai.models.generateContent({
        model: TEXT_OUTPUT_MODEL,
        contents: dialogPrompt,
        config: {
          systemInstruction: character.systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description:
                  '1 to 2 crisp, high-attitude Gen Z YT/Insta Reels spoken sentences directly answering the user.',
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

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('text-timeout')), 2500)
      );

      const response = await Promise.race([textPromise, timeoutPromise]);
      const rawText = (response.text || '').trim();
      if (rawText) {
        try {
          const cleanedJson = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
          const parsed = JSON.parse(cleanedJson);
          if (parsed.reply) {
            generatedReply = String(parsed.reply).trim();
            generatedEmotion = parsed.emotion || inferredUserContext.emotion;
            generatedGesture = parsed.gesture || inferredUserContext.gesture;
          }
        } catch {
          generatedReply = rawText;
          const inferred = inferEmotionAndGesture(rawText);
          generatedEmotion = inferred.emotion;
          generatedGesture = inferred.gesture;
        }
      }
    } catch {
      // If gemini-3.1-flash-lite has a temporary 503 spike, Step 2 below handles live response + voice
    }

    // Step 2: Voice Generation via strictly `gemini-3.8-live-extended-thinking`
    if (generatedReply) {
      try {
        const voiceResult = await synthesizeSpeechWithLive38({
          apiKey,
          text: generatedReply,
          gender,
          emotion: generatedEmotion,
          toneStyle,
          timeoutMs: 15000,
        });
        audioBase64 = voiceResult.audioBase64;
      } catch {
        // Client will call /api/tts (which also uses gemini-3.8-live-extended-thinking) if needed
      }
    } else {
      // Direct Live Voice + Output Transcription via `gemini-3.8-live-extended-thinking`
      const liveResult = await converseAndSpeakWithLive38({
        apiKey,
        dialogPrompt,
        characterInstruction: `You are ${character.name}, a ${character.role}. Speak in crisp, high-attitude Gen Z Hinglish directly answering the user's message.`,
        gender,
        emotion: generatedEmotion,
        toneStyle,
        timeoutMs: 16000,
      });
      generatedReply = liveResult.reply;
      audioBase64 = liveResult.audioBase64;
      const inferred = inferEmotionAndGesture(generatedReply);
      generatedEmotion = inferred.emotion;
      generatedGesture = inferred.gesture;
    }

    if (!generatedReply) {
      return NextResponse.json(
        {error: 'AI model temporarily busy, please try again.'},
        {status: 503}
      );
    }

    const cleanReply = cleanVisibleSubtitle(generatedReply);

    return NextResponse.json({
      reply: cleanReply,
      emotion: generatedEmotion,
      gesture: generatedGesture,
      audioBase64,
      textModel: TEXT_OUTPUT_MODEL,
      voiceModel: LIVE_VOICE_MODEL,
      engine: `${TEXT_OUTPUT_MODEL} + ${LIVE_VOICE_MODEL}`,
      character: character.name,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({error: errorMsg}, {status: 500});
  }
}

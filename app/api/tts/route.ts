import {GoogleGenAI} from '@google/genai';
import {NextRequest, NextResponse} from 'next/server';

const GIRL_STYLES: Record<string, string> = {
  happy: 'Cheerful, warm, bright, and friendly young female voice',
  relaxed: 'Soft, soothing, calm, and gentle young female voice',
  surprised: 'Excited, expressive, lively young female voice',
  sad: 'Gentle, empathetic, soft-spoken young female voice',
  angry: 'Playfully spirited, expressive young female voice',
  neutral: 'Natural, conversational, friendly young female voice',
};

const BOY_STYLES: Record<string, string> = {
  happy: 'Upbeat, warm, confident, and friendly young male voice',
  relaxed: 'Calm, chill, smooth, and relaxed young male voice',
  surprised: 'Energetic, expressive, lively young male voice',
  sad: 'Empathetic, gentle, warm young male voice',
  angry: 'Spirited, expressive young male voice',
  neutral: 'Natural, conversational, friendly young male voice',
};

export async function POST(req: NextRequest) {
  try {
    const {text, emotion = 'happy', gender = 'girl'} = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({error: 'Text is required for TTS'}, {status: 400});
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.length < 15) {
      return NextResponse.json({error: 'Use browser speech fallback'}, {status: 503});
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const isBoy = gender === 'boy';
    const styleMap = isBoy ? BOY_STYLES : GIRL_STYLES;
    const stylePrompt = styleMap[emotion] || styleMap.happy;
    const selectedVoice = isBoy ? 'Puck' : 'Kore';

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text.slice(0, 600),
              // @ts-ignore - speechMetadata supported by Gemini TTS
              speechMetadata: {
                style: stylePrompt,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {voiceName: selectedVoice},
          },
        },
      },
    });

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      return NextResponse.json({error: 'No audio data returned from Gemini TTS'}, {status: 500});
    }

    return NextResponse.json({
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'TTS generation failed';
    return NextResponse.json({error: errMsg}, {status: 500});
  }
}

import {GoogleGenAI} from '@google/genai';
import {NextRequest, NextResponse} from 'next/server';
import {formatScriptForReelsTts, getReelsVoiceDesign} from '@/lib/reels-voice-design';

export async function POST(req: NextRequest) {
  try {
    const {
      text,
      emotion = 'happy',
      gender = 'boy',
      toneStyle = 'chill',
    } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({error: 'Text is required for TTS'}, {status: 400});
    }

    const apiKey = (
      process.env.Google_Key ||
      process.env.GOOGLE_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.google_key ||
      ''
    ).trim();

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

    const activeGender: 'boy' | 'girl' = gender === 'girl' ? 'girl' : 'boy';
    const {voiceName, stylePrompt} = getReelsVoiceDesign(activeGender, emotion, toneStyle);
    const scriptedText = formatScriptForReelsTts(text, emotion);

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: scriptedText,
              // @ts-ignore - speechMetadata supported by Gemini 3.8 Flash TTS
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
            prebuiltVoiceConfig: {voiceName},
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
      voiceName,
      emotion,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'TTS generation failed';
    return NextResponse.json({error: errMsg}, {status: 500});
  }
}

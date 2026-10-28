import {GoogleGenAI} from '@google/genai';
import {NextRequest, NextResponse} from 'next/server';
import {resolveUserGeminiApiKey, TEXT_OUTPUT_MODEL} from '@/lib/reels-voice-design';

export async function POST(req: NextRequest) {
  try {
    const {audioBase64, mimeType = 'audio/webm'} = await req.json();

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return NextResponse.json({error: 'Audio data is required'}, {status: 400});
    }

    const apiKey = resolveUserGeminiApiKey();

    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.length < 15) {
      return NextResponse.json({transcript: ''});
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const response = await ai.models.generateContent({
      model: TEXT_OUTPUT_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: audioBase64,
            },
          },
          {
            text: 'Transcribe the spoken words accurately. Return only the spoken transcript text with no extra commentary.',
          },
        ],
      },
    });

    const transcript = (response.text || '').trim();
    return NextResponse.json({transcript, model: TEXT_OUTPUT_MODEL});
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Audio transcription failed';
    return NextResponse.json({error: errMsg}, {status: 500});
  }
}

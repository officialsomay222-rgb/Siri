import {NextRequest, NextResponse} from 'next/server';
import {
  LIVE_VOICE_MODEL,
  resolveUserGeminiApiKey,
  synthesizeSpeechWithLive38,
} from '@/lib/reels-voice-design';

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

    const apiKey = resolveUserGeminiApiKey();

    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.length < 15) {
      return NextResponse.json({error: 'Gemini API key is not configured'}, {status: 503});
    }

    const activeGender: 'boy' | 'girl' = gender === 'girl' ? 'girl' : 'boy';

    const result = await synthesizeSpeechWithLive38({
      apiKey,
      text,
      gender: activeGender,
      emotion,
      toneStyle,
      timeoutMs: 16000,
    });

    return NextResponse.json({
      audioBase64: result.audioBase64,
      mimeType: 'audio/wav',
      voiceName: result.voiceName,
      model: LIVE_VOICE_MODEL,
      emotion,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'TTS generation failed';
    return NextResponse.json({error: errMsg}, {status: 500});
  }
}

export type ReelsEmotion = 'happy' | 'relaxed' | 'surprised' | 'sad' | 'angry' | 'neutral';
export type ReelsToneStyle = 'chill' | 'sweet' | 'anime' | 'studio';

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
 * Injects natural Gemini 3.8 Flash TTS vocal bursts (<laugh>, <gasp>, <breath>)
 * and backchanneling so the spoken audio feels genuinely alive and emotional.
 */
export function formatScriptForReelsTts(rawText: string, emotion: string = 'happy'): string {
  const trimmed = rawText.trim().slice(0, 550);
  if (!trimmed) return '';

  // If the model already included vocal tags, keep them as-is
  if (/<(laugh|gasp|breath)>|\|(yeah|mhm)\|/i.test(trimmed)) {
    return trimmed;
  }

  // Convert text laughs into expressive <laugh> bursts while keeping natural flow
  let enhanced = trimmed.replace(/\b(haha+|hehe+|lol|lmao)\b/gi, '<laugh> $1');

  if (emotion === 'surprised' && !enhanced.startsWith('<gasp>')) {
    enhanced = `<gasp> ${enhanced}`;
  } else if ((emotion === 'sad' || emotion === 'relaxed') && !enhanced.startsWith('<breath>')) {
    enhanced = `<breath> ${enhanced}`;
  } else if (emotion === 'happy' && !enhanced.includes('<laugh>') && /^[a-zA-Z]+!/.test(enhanced)) {
    enhanced = enhanced.replace(/^([a-zA-Z]+!)/, '$1 <laugh>');
  }

  return enhanced;
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

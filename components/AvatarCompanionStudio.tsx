'use client';

import React, {useState, useRef, useEffect, useCallback} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {
  Mic,
  Send,
  Volume2,
  VolumeX,
  Square,
  Settings,
  X,
  Download,
  CheckCircle2,
  Sparkles,
  Smartphone,
  Loader2,
  ZoomIn,
  ZoomOut,
  Sliders,
  Play,
  RotateCcw,
  Eye,
  Palette,
  Sun,
  Flame,
  Check,
  SlidersHorizontal,
  ChevronRight,
  Maximize2,
} from 'lucide-react';
import VrmAvatarCanvas, {
  AvatarEmotion,
  AvatarGesture,
  CameraViewMode,
} from '@/components/VrmAvatarCanvas';
import {
  AvatarGender,
  checkModelsDownloadedStatus,
  detectDevicePerformance,
  downloadAllModelsToPhone,
  fetchVrmWithCache,
  QualityTier,
} from '@/lib/vrm-cache';
import {AvatarAudioController, LipSyncWeights} from '@/lib/lip-sync-audio';
import {useMicrophoneLipSync} from '@/hooks/use-microphone-lip-sync';

interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

// Silas (Boy) is Main Character #1; Airi (Girl) is Secondary Character #2
const MODELS: Record<
  AvatarGender,
  {
    name: string;
    label: string;
    url: string;
    greeting: string;
    accentClass: string;
    buttonClass: string;
  }
> = {
  boy: {
    name: 'Silas',
    label: 'Boy · Silas',
    url: '/models/boy.vrm',
    greeting: "Yo bhai! Silas yahan hai. Bata kya mast scene chal raha hai? Let's vibe, no cap!",
    accentClass: 'text-sky-300',
    buttonClass: 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-lg shadow-sky-500/25',
  },
  girl: {
    name: 'Airi',
    label: 'Girl · Airi',
    url: '/models/avatar.vrm',
    greeting: "Aww hey yaar! Airi here! Kaisi chal rahi hai life meri jaan? Let's talk!",
    accentClass: 'text-rose-300',
    buttonClass: 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/25',
  },
};

interface ChatInputBarProps {
  activeModel: {
    name: string;
    buttonClass: string;
    accentClass: string;
  };
  isListening: boolean;
  isSpeaking: boolean;
  isThinking: boolean;
  liveTranscript: string;
  onSendMessage: (text: string) => void;
  onStartVoice: () => void;
  onStopVoice: () => void;
  onStopSpeaking: () => void;
}

const ChatInputBar = React.memo(function ChatInputBar({
  activeModel,
  isListening,
  isSpeaking,
  isThinking,
  liveTranscript,
  onSendMessage,
  onStartVoice,
  onStopVoice,
  onStopSpeaking,
}: ChatInputBarProps) {
  const [inputText, setInputText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputText.trim();
    if (!clean || isThinking) return;
    onSendMessage(clean);
    setInputText('');
  };

  return (
    <div className="relative w-full min-h-[56px] flex items-center justify-center">
      <AnimatePresence mode="wait">
        {!isListening ? (
          <motion.form
            key="chat-input-bar"
            initial={{opacity: 0, scale: 0.86, y: 14}}
            animate={{opacity: 1, scale: 1, y: 0}}
            exit={{opacity: 0, scale: 0.82, y: 14}}
            transition={{type: 'spring', stiffness: 380, damping: 28}}
            onSubmit={handleSubmit}
            className="w-full flex items-center gap-2 p-1.5 rounded-full bg-[#0E1628]/95 border border-white/15 shadow-2xl"
          >
            {/* Mic Button inside Chat Input */}
            <button
              type="button"
              onClick={onStartVoice}
              aria-label="Tap to Speak"
              className={`h-11 w-11 rounded-full flex items-center justify-center transition-transform active:scale-90 shrink-0 cursor-pointer ${activeModel.buttonClass}`}
            >
              <Mic className="w-5 h-5" />
            </button>

            {/* Clean Single-Line Text Input */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Message ${activeModel.name} or tap mic...`}
              disabled={isThinking}
              autoComplete="off"
              className="flex-1 bg-transparent px-2 text-sm sm:text-base text-white placeholder:text-slate-400 focus:outline-none min-w-0"
            />

            {/* Stop Speaking Button OR Send Button */}
            {isSpeaking ? (
              <button
                type="button"
                onClick={onStopSpeaking}
                aria-label="Stop Speaking"
                className="h-11 px-4 rounded-full bg-slate-800 hover:bg-slate-700 text-rose-300 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputText.trim() || isThinking}
                aria-label="Send Message"
                className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </motion.form>
        ) : (
          /* Active Voice Mic Capsule (Appears when Chat Input disappears) */
          <motion.div
            key="voice-mic-orb"
            initial={{opacity: 0, scale: 0.75, y: 18}}
            animate={{opacity: 1, scale: 1, y: 0}}
            exit={{opacity: 0, scale: 0.75, y: 18}}
            transition={{type: 'spring', stiffness: 380, damping: 26}}
            className="flex items-center gap-3.5 pl-4 pr-2 py-2 rounded-full bg-[#0B1528]/95 border border-emerald-500/50 shadow-2xl shadow-emerald-500/20"
          >
            {/* Animated Voice Waveform Bars */}
            <div className="flex items-center gap-1 h-5">
              {[0.45, 0.95, 0.65, 1.0, 0.55].map((h, idx) => (
                <motion.span
                  key={idx}
                  animate={{scaleY: [0.35, h, 0.4]}}
                  transition={{
                    repeat: Infinity,
                    duration: 0.55 + idx * 0.08,
                    ease: 'easeInOut',
                  }}
                  className="w-1 h-4 rounded-full bg-emerald-400 origin-center"
                />
              ))}
            </div>

            <span className="text-xs sm:text-sm font-medium text-emerald-200 max-w-[56vw] truncate">
              {liveTranscript || 'Listening...'}
            </span>

            <button
              type="button"
              onClick={onStopVoice}
              className="h-10 px-4 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-transform active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Done</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

function getSavedStudioSettings() {
  if (typeof window === 'undefined') return {};
  try {
    const saved = localStorage.getItem('vrm_companion_settings_v1');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export default function AvatarCompanionStudio() {
  // Main character is Boy by default
  const [gender, setGender] = useState<AvatarGender>('boy');
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [loadedFromCache, setLoadedFromCache] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Quality, Camera & Performance Settings
  const [qualityTier, setQualityTier] = useState<QualityTier>(
    () => detectDevicePerformance().tier
  );
  const [springPhysicsEnabled, setSpringPhysicsEnabled] = useState<boolean>(true);
  const [cameraView, setCameraView] = useState<CameraViewMode>('upper');
  const [fps, setFps] = useState<number>(60);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Full-Screen Studio Settings State (persisted to localStorage)
  const [settingsTab, setSettingsTab] = useState<
    'talking' | 'voice' | 'textures' | 'graphics' | 'lighting'
  >('talking');

  const [voicePitch, setVoicePitch] = useState<number>(
    () => getSavedStudioSettings().voicePitch ?? 1.0
  );
  const [voiceRate, setVoiceRate] = useState<number>(
    () => getSavedStudioSettings().voiceRate ?? 1.0
  );
  const [voiceTone, setVoiceTone] = useState<'chill' | 'sweet' | 'anime' | 'studio'>(
    () => getSavedStudioSettings().voiceTone ?? 'chill'
  );
  const [customZoomFactor, setCustomZoomFactor] = useState<number>(
    () => getSavedStudioSettings().customZoomFactor ?? 1.0
  );
  const [customYOffset, setCustomYOffset] = useState<number>(
    () => getSavedStudioSettings().customYOffset ?? 0.0
  );
  const [zoomPreset, setZoomPreset] = useState<'perfect' | 'close' | 'portrait' | 'showcase'>(
    () => getSavedStudioSettings().zoomPreset ?? 'perfect'
  );
  const [outlineThickness, setOutlineThickness] = useState<number>(
    () => getSavedStudioSettings().outlineThickness ?? 0.0014
  );
  const [lightingTheme, setLightingTheme] = useState<'cyber' | 'sunset' | 'violet' | 'daylight'>(
    () => getSavedStudioSettings().lightingTheme ?? 'cyber'
  );
  const [shadingStyle, setShadingStyle] = useState<'cel' | 'soft' | 'glossy'>(
    () => getSavedStudioSettings().shadingStyle ?? 'cel'
  );

  const persistSettings = useCallback((updates: Record<string, unknown>) => {
    try {
      const existing = JSON.parse(localStorage.getItem('vrm_companion_settings_v1') || '{}');
      const merged = {...existing, ...updates};
      localStorage.setItem('vrm_companion_settings_v1', JSON.stringify(merged));
    } catch {
      // Ignore
    }
  }, []);

  const applyZoomPreset = (preset: 'perfect' | 'close' | 'portrait' | 'showcase') => {
    setZoomPreset(preset);
    let z = 1.0;
    let y = 0.0;
    if (preset === 'perfect') {
      z = 1.0;
      y = 0.0;
    } else if (preset === 'close') {
      z = 1.25;
      y = -0.04;
    } else if (preset === 'portrait') {
      z = 1.08;
      y = 0.0;
    } else if (preset === 'showcase') {
      z = 0.85;
      y = 0.04;
    }
    setCustomZoomFactor(z);
    setCustomYOffset(y);
    persistSettings({zoomPreset: preset, customZoomFactor: z, customYOffset: y});
  };

  const handleTestVoice = () => {
    const sampleText =
      gender === 'boy'
        ? "Yo bhai! Silas voice test bilkul solid chal raha hai. Vibe check passed!"
        : "Aww hi! Airi voice test ho gaya. Meri aawaz kafi pyari lag rahi hai na?";
    audioControllerRef.current?.stopAll(lipSyncRef.current);
    audioControllerRef.current?.playBrowserSpeech(
      sampleText,
      gender,
      lipSyncRef.current,
      () => setIsSpeaking(false),
      { pitch: voicePitch, rate: voiceRate }
    );
  };

  const handleResetSettings = () => {
    setVoicePitch(1.0);
    setVoiceRate(1.0);
    setVoiceTone('chill');
    setCustomZoomFactor(1.0);
    setCustomYOffset(0.0);
    setZoomPreset('perfect');
    setOutlineThickness(0.0014);
    setLightingTheme('cyber');
    setShadingStyle('cel');
    persistSettings({
      voicePitch: 1.0,
      voiceRate: 1.0,
      voiceTone: 'chill',
      customZoomFactor: 1.0,
      customYOffset: 0.0,
      zoomPreset: 'perfect',
      outlineThickness: 0.0014,
      lightingTheme: 'cyber',
      shadingStyle: 'cel',
    });
  };

  const [emotion, setEmotion] = useState<AvatarEmotion>('happy');
  const [gesture, setGesture] = useState<AvatarGesture>('idle');

  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [subtitleText, setSubtitleText] = useState<string>(MODELS.boy.greeting);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [voiceMuted, setVoiceMuted] = useState<boolean>(false);

  // 1-Time Permanent Model Download to Phone Storage State
  const [assetsDownloaded, setAssetsDownloaded] = useState<boolean>(true);
  const [checkingAssets, setCheckingAssets] = useState<boolean>(true);
  const [isDownloadingAssets, setIsDownloadingAssets] = useState<boolean>(false);
  const [downloadOverallPct, setDownloadOverallPct] = useState<number>(0);
  const [currentDownloadingModel, setCurrentDownloadingModel] = useState<'boy' | 'girl' | null>(null);
  const [boyStored, setBoyStored] = useState<boolean>(false);
  const [girlStored, setGirlStored] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    async function checkStorage() {
      try {
        const status = await checkModelsDownloadedStatus();
        if (mounted) {
          setBoyStored(status.boyReady);
          setGirlStored(status.girlReady);
          setAssetsDownloaded(status.isDownloaded);
          setCheckingAssets(false);
        }
      } catch {
        if (mounted) {
          setAssetsDownloaded(true);
          setCheckingAssets(false);
        }
      }
    }
    void checkStorage();
    return () => {
      mounted = false;
    };
  }, []);

  const handleStart1TimeDownload = async () => {
    if (isDownloadingAssets) return;
    setIsDownloadingAssets(true);
    setDownloadOverallPct(0);
    try {
      await downloadAllModelsToPhone((overall, model, modelPct) => {
        setDownloadOverallPct(overall);
        setCurrentDownloadingModel(model);
        if (model === 'boy' && modelPct >= 100) setBoyStored(true);
        if (model === 'girl' && modelPct >= 100) setGirlStored(true);
      });
      setBoyStored(true);
      setGirlStored(true);
      setDownloadOverallPct(100);
      window.setTimeout(() => {
        setAssetsDownloaded(true);
        setIsDownloadingAssets(false);
      }, 700);
    } catch {
      setIsDownloadingAssets(false);
    }
  };

  const lipSyncRef = useRef<LipSyncWeights>({
    aa: 0,
    ih: 0,
    ou: 0,
    ee: 0,
    oh: 0,
    volume: 0,
    isSpeaking: false,
  });
  const audioControllerRef = useRef<AvatarAudioController | null>(null);
  const recognitionRef = useRef<unknown>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const micLipSync = useMicrophoneLipSync({
    smoothing: 0.65,
    sensitivity: 1.35,
  });

  const isListeningRef = useRef(isListening);
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Completely remove Next.js Dev Indicator Ball (including Shadow DOM portals)
  useEffect(() => {
    const nukeNextDevIndicator = () => {
      const selectors = [
        'nextjs-portal',
        '[data-nextjs-toast]',
        '[data-nextjs-dev-tools-button]',
        '[data-next-badge-root]',
        '[data-next-badge]',
        '#__next-build-watcher',
      ];
      for (const sel of selectors) {
        const nodes = document.querySelectorAll(sel);
        nodes.forEach((node) => {
          const el = node as HTMLElement;
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('visibility', 'hidden', 'important');
          el.style.setProperty('opacity', '0', 'important');
          el.style.setProperty('pointer-events', 'none', 'important');
          if (el.shadowRoot) {
            const style = document.createElement('style');
            style.textContent =
              ':host, * { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }';
            el.shadowRoot.appendChild(style);
          }
          el.remove();
        });
      }
    };

    nukeNextDevIndicator();
    const observer = new MutationObserver(() => nukeNextDevIndicator());
    observer.observe(document.documentElement, {childList: true, subtree: true});
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    audioControllerRef.current = new AvatarAudioController();

    // Prefetch secondary character (Airi) into phone cache after Silas initializes
    const timer = window.setTimeout(() => {
      void fetchVrmWithCache('/models/avatar.vrm');
    }, 3000);

    const lipSync = lipSyncRef.current;
    return () => {
      window.clearTimeout(timer);
      audioControllerRef.current?.stopAll(lipSync);
    };
  }, []);

  // Real-time audio frequency sampling for VRM lip-sync (microphone input or AI speech playback)
  const handleSampleAudio = useCallback(() => {
    if (isListeningRef.current) {
      const w = micLipSync.sampleFrame();
      Object.assign(lipSyncRef.current, w);
    } else {
      audioControllerRef.current?.sampleAnalyser(lipSyncRef.current);
    }
    const currentlySpeaking = lipSyncRef.current.isSpeaking;
    setIsSpeaking((prev) => (prev !== currentlySpeaking ? currentlySpeaking : prev));
  }, [micLipSync]);

  const speakReply = useCallback(
    async (
      text: string,
      replyEmotion: AvatarEmotion,
      activeGender: AvatarGender,
      directAudioBase64?: string
    ) => {
      if (voiceMuted || !audioControllerRef.current) return;

      const onSpeechDone = () => {
        setIsSpeaking(false);
      };

      // If Gemini 2.5 Flash Native Audio Dialog returned direct 24kHz WAV audio in /api/chat, play it immediately!
      if (directAudioBase64) {
        try {
          setIsSpeaking(true);
          await audioControllerRef.current.playWavBase64(
            directAudioBase64,
            text,
            lipSyncRef.current,
            onSpeechDone
          );
          return;
        } catch {
          // Fall through to /api/tts or browser speech if decode fails
        }
      }

      try {
        setIsSpeaking(true);
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 5500);

        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            text,
            emotion: replyEmotion,
            gender: activeGender,
            pitch: voicePitch,
            rate: voiceRate,
            toneStyle: voiceTone,
          }),
          signal: controller.signal,
        });
        window.clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error('TTS fallback');
        }
        const data = await res.json();
        if (data.audioBase64) {
          await audioControllerRef.current.playWavBase64(
            data.audioBase64,
            text,
            lipSyncRef.current,
            onSpeechDone
          );
        } else {
          audioControllerRef.current.playBrowserSpeech(
            text,
            activeGender,
            lipSyncRef.current,
            onSpeechDone,
            {pitch: voicePitch, rate: voiceRate}
          );
        }
      } catch {
        audioControllerRef.current.playBrowserSpeech(
          text,
          activeGender,
          lipSyncRef.current,
          onSpeechDone,
          {pitch: voicePitch, rate: voiceRate}
        );
      }
    },
    [voiceMuted, voicePitch, voiceRate, voiceTone]
  );

  const sendUserMessage = useCallback(
    async (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed || isThinking) return;

      audioControllerRef.current?.stopAll(lipSyncRef.current);
      audioControllerRef.current?.playUiCue('pop');
      setIsSpeaking(false);
      setLiveTranscript('');

      const nextHistory: ChatTurn[] = [...history.slice(-6), {role: 'user', text: trimmed}];
      setHistory(nextHistory);
      setIsThinking(true);
      setGesture('think');
      setSubtitleText(`${MODELS[gender].name} is replying...`);

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 15000);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            message: trimmed,
            history: nextHistory.slice(0, -1),
            gender,
          }),
          signal: controller.signal,
        });
        window.clearTimeout(timeoutId);

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to reach AI companion');
        }

        const validEmotions: AvatarEmotion[] = [
          'happy',
          'relaxed',
          'surprised',
          'sad',
          'angry',
          'neutral',
        ];
        const validGestures: AvatarGesture[] = ['idle', 'wave', 'nod', 'think', 'cheer', 'bow'];

        const nextEmotion: AvatarEmotion = validEmotions.includes(data.emotion)
          ? data.emotion
          : 'happy';
        const nextGesture: AvatarGesture = validGestures.includes(data.gesture)
          ? data.gesture
          : 'nod';

        setEmotion(nextEmotion);
        setGesture(nextGesture);
        setSubtitleText(data.reply);
        setHistory((prev) => [...prev, {role: 'model', text: data.reply}]);
        setIsThinking(false);
        void speakReply(data.reply, nextEmotion, gender, data.audioBase64);
      } catch {
        window.clearTimeout(timeoutId);
        setIsThinking(false);
        setEmotion('happy');
        setGesture('nod');
        const instantFallback =
          gender === 'boy'
            ? "I'm right here bro! Tell me more about what's on your mind."
            : "I'm right here with you! Tell me more, I'd love to hear it!";
        setSubtitleText(instantFallback);
        void speakReply(instantFallback, 'happy', gender);
      }
    },
    [gender, history, isThinking, speakReply]
  );

  const stopVoiceCapture = useCallback(() => {
    setIsListening(false);
    micLipSync.stopListening();
    audioControllerRef.current?.playUiCue('mic-off');

    if (recognitionRef.current) {
      try {
        (recognitionRef.current as {stop: () => void}).stop();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, [micLipSync, setIsListening]);

  const startVoiceCapture = useCallback(async () => {
    if (isListening) {
      stopVoiceCapture();
      return;
    }

    audioControllerRef.current?.stopAll(lipSyncRef.current);
    setIsSpeaking(false);
    audioControllerRef.current?.playUiCue('mic-on');
    setLiveTranscript('Listening... Speak now');
    setIsListening(true);
    void micLipSync.startListening();

    const SpeechRecognitionAPI =
      (window as unknown as {SpeechRecognition?: new () => unknown}).SpeechRecognition ||
      (window as unknown as {webkitSpeechRecognition?: new () => unknown}).webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
      try {
        const recognition = new SpeechRecognitionAPI() as {
          lang: string;
          interimResults: boolean;
          maxAlternatives: number;
          continuous: boolean;
          onresult: ((e: unknown) => void) | null;
          onerror: ((e: unknown) => void) | null;
          onend: (() => void) | null;
          start: () => void;
          stop: () => void;
        };

        recognition.lang = navigator.language || 'en-US';
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.continuous = false;

        let finalTranscript = '';

        recognition.onresult = (event: unknown) => {
          const ev = event as {
            results: ArrayLike<{isFinal: boolean; 0: {transcript: string}}>;
          };
          let interim = '';
          for (let i = 0; i < ev.results.length; i++) {
            const res = ev.results[i];
            if (res.isFinal) {
              finalTranscript += res[0].transcript;
            } else {
              interim += res[0].transcript;
            }
          }
          setLiveTranscript(finalTranscript || interim || 'Listening...');
        };

        recognition.onerror = () => {
          setIsListening(false);
          setLiveTranscript('');
        };

        recognition.onend = () => {
          setIsListening(false);
          recognitionRef.current = null;
          if (finalTranscript.trim()) {
            void sendUserMessage(finalTranscript.trim());
          } else {
            setLiveTranscript('');
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
        return;
      } catch {
        // Fall through to MediaRecorder + Gemini Transcribe
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';
      const recorder = new MediaRecorder(stream, {mimeType});
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, {type: mimeType});
        if (blob.size < 1000) {
          setLiveTranscript('');
          return;
        }
        setLiveTranscript('Processing voice...');
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64data = String(reader.result || '').split(',')[1];
          if (!base64data) {
            setLiveTranscript('');
            return;
          }
          try {
            const res = await fetch('/api/transcribe', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({audioBase64: base64data, mimeType}),
            });
            const data = await res.json();
            setLiveTranscript('');
            if (data.transcript) {
              void sendUserMessage(data.transcript);
            }
          } catch {
            setLiveTranscript('');
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch {
      setIsListening(false);
      setLiveTranscript('Microphone permission needed');
      window.setTimeout(() => setLiveTranscript(''), 2500);
    }
  }, [isListening, micLipSync, sendUserMessage, stopVoiceCapture]);

  const handleSwitchGender = (nextGender: AvatarGender) => {
    if (nextGender === gender) return;
    audioControllerRef.current?.stopAll(lipSyncRef.current);
    setIsSpeaking(false);
    setIsLoaded(false);
    setLoadError(null);
    setGender(nextGender);
    setEmotion('happy');
    setGesture('idle');
    setSubtitleText(MODELS[nextGender].greeting);
  };

  const handleStopSpeaking = useCallback(() => {
    audioControllerRef.current?.stopAll(lipSyncRef.current);
    setIsSpeaking(false);
  }, []);

  const handleAvatarTapped = useCallback(
    (zone: 'head' | 'body') => {
      audioControllerRef.current?.playUiCue('pat');
      if (zone === 'head') {
        setEmotion('happy');
        setGesture('cheer');
        const msg =
          gender === 'girl'
            ? 'Aww hehe, thanks for the head pat meri jaan! Bata kya chal raha hai?'
            : 'Haha, appreciate that bhai! Bata kya scene hai aaj ka?';
        setSubtitleText(msg);
        if (!isSpeaking && !isThinking) {
          void speakReply(msg, 'happy', gender);
        }
      } else {
        setEmotion('surprised');
        setGesture('wave');
      }
    },
    [gender, isSpeaking, isThinking, speakReply, setEmotion, setGesture, setSubtitleText]
  );

  const activeModel = MODELS[gender];

  return (
    <main className="relative w-screen h-dvh overflow-hidden bg-[#080C16] font-sans text-slate-100 select-none">
      {/* Full-Viewport Crisp 3D VRM Avatar Canvas */}
      <div className="absolute inset-0 z-0">
        <VrmAvatarCanvas
          gender={gender}
          modelUrl={activeModel.url}
          qualityTier={qualityTier}
          springPhysicsEnabled={springPhysicsEnabled}
          cameraView={cameraView}
          customZoomFactor={customZoomFactor}
          customYOffset={customYOffset}
          outlineThickness={outlineThickness}
          lightingTheme={lightingTheme}
          shadingStyle={shadingStyle}
          emotion={emotion}
          gesture={gesture}
          isListening={isListening}
          isThinking={isThinking}
          lipSyncRef={lipSyncRef}
          onSampleAudio={handleSampleAudio}
          onLoadProgress={(pct, cached) => {
            setLoadProgress(pct);
            setLoadedFromCache(cached);
          }}
          onLoadComplete={() => {
            setIsLoaded(true);
            setLoadError(null);
          }}
          onLoadError={(err) => {
            setLoadError(err);
            setIsLoaded(true);
          }}
          onFpsUpdate={setFps}
          onAvatarTapped={handleAvatarTapped}
        />
      </div>

      {/* Minimalist Top Bar: Boy / Girl Switcher + Clearly Labeled Settings Button + Mute */}
      <header className="fixed top-3.5 inset-x-0 z-20 mx-auto max-w-xl w-[94vw] flex items-center justify-between gap-2 px-1">
        <div className="flex items-center p-1 rounded-full bg-[#0E1525]/95 border border-white/10 shadow-xl">
          {(['boy', 'girl'] as const).map((g) => {
            const active = gender === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => handleSwitchGender(g)}
                className={`relative px-3.5 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="genderActivePill"
                    transition={{type: 'spring', stiffness: 420, damping: 32}}
                    className={`absolute inset-0 rounded-full ${
                      g === 'boy' ? 'bg-sky-600' : 'bg-rose-600'
                    }`}
                  />
                )}
                <span className="relative z-10">{MODELS[g].label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Clearly Labeled Settings Menu Button */}
          <button
            type="button"
            onClick={() => setShowSettings((prev) => !prev)}
            aria-label="Open Settings Menu"
            className={`h-10 px-3.5 flex items-center gap-1.5 rounded-full bg-[#0E1525]/95 border shadow-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showSettings
                ? 'border-sky-500 text-white bg-sky-600/20'
                : 'border-white/15 text-slate-100 hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-sky-400" />
            <span>Settings</span>
            <span className="font-mono tabular-nums text-emerald-400 ml-0.5">{fps} FPS</span>
          </button>

          {/* Voice Mute Toggle */}
          <button
            type="button"
            onClick={() => {
              const nextMute = !voiceMuted;
              setVoiceMuted(nextMute);
              if (nextMute) {
                audioControllerRef.current?.stopAll(lipSyncRef.current);
                setIsSpeaking(false);
              }
            }}
            aria-label={voiceMuted ? 'Unmute Voice' : 'Mute Voice'}
            className="h-10 w-10 flex items-center justify-center rounded-full bg-[#0E1525]/95 border border-white/15 text-slate-200 hover:text-white shadow-xl transition-colors shrink-0 cursor-pointer"
          >
            {voiceMuted ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* Full-Screen Studio Settings Page */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: 20}}
            transition={{type: 'spring', stiffness: 350, damping: 28}}
            className="fixed inset-0 z-50 bg-[#070A14]/98 backdrop-blur-2xl flex flex-col text-white overflow-hidden select-none"
          >
            {/* Top Bar Header */}
            <header className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10 bg-[#0B1020]/90">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 font-bold">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    Studio Settings & Customization
                  </h2>
                  <p className="text-xs text-slate-400">
                    Preset Talking Zoom · Voice Pitch & Tone · Textures · Lighting · Performance
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetSettings}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reset Defaults</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </header>

            {/* Horizontal Category Navigation Tabs */}
            <nav className="shrink-0 flex items-center gap-1 sm:gap-2 px-4 py-2.5 border-b border-white/10 bg-[#080D1A] overflow-x-auto no-scrollbar">
              {(
                [
                  {id: 'talking', label: 'Talking Zoom & Position', icon: ZoomIn},
                  {id: 'voice', label: 'Voice & Pitch Tone', icon: Volume2},
                  {id: 'textures', label: 'Textures & Shading', icon: Palette},
                  {id: 'graphics', label: 'Graphics & Hardware', icon: SlidersHorizontal},
                  {id: 'lighting', label: 'Studio Lighting', icon: Sun},
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = settingsTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSettingsTab(tab.id)}
                    className={`relative px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                      active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="activeSettingsTab"
                        transition={{type: 'spring', stiffness: 400, damping: 30}}
                        className="absolute inset-0 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 shadow-md"
                      />
                    )}
                    <Icon className="relative z-10 w-4 h-4" />
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Main Tab Content Viewport */}
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 max-w-3xl mx-auto w-full">
              {/* TAB 1: TALKING ZOOM & POSITION PRESETS */}
              {settingsTab === 'talking' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Preset Zooming Section */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-4">
                    <div>
                      <div className="flex items-center gap-2 text-sky-400 font-semibold text-sm">
                        <Sparkles className="w-4 h-4" />
                        <span>Preset Talking Zoom Positions</span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        Tap a preset to immediately lock the character into your ideal conversational distance:
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Preset 1: Perfect Talking (Reference Default) */}
                      <button
                        type="button"
                        onClick={() => applyZoomPreset('perfect')}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                          zoomPreset === 'perfect'
                            ? 'bg-sky-950/60 border-sky-400 shadow-lg shadow-sky-500/10'
                            : 'bg-[#080D1A] border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-sky-300 uppercase tracking-wider">
                            Recommended
                          </span>
                          {zoomPreset === 'perfect' && <Check className="w-4 h-4 text-sky-400" />}
                        </div>
                        <h4 className="text-sm font-bold text-white mt-1">
                          🎯 Perfect Talking (Reference Default)
                        </h4>
                        <p className="text-xs text-slate-300 mt-1 leading-snug">
                          Exact screenshot golden ratio framing with ~25px top gap & chest-up bust.
                        </p>
                      </button>

                      {/* Preset 2: Close Talking (Eye Contact) */}
                      <button
                        type="button"
                        onClick={() => applyZoomPreset('close')}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                          zoomPreset === 'close'
                            ? 'bg-rose-950/60 border-rose-400 shadow-lg shadow-rose-500/10'
                            : 'bg-[#080D1A] border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                            Intimate
                          </span>
                          {zoomPreset === 'close' && <Check className="w-4 h-4 text-rose-400" />}
                        </div>
                        <h4 className="text-sm font-bold text-white mt-1">
                          👁️ Close Talking (Eye Contact)
                        </h4>
                        <p className="text-xs text-slate-300 mt-1 leading-snug">
                          Closer face-to-face zoom focused on expressions, eyes & lip-sync.
                        </p>
                      </button>

                      {/* Preset 3: Comfortable Portrait */}
                      <button
                        type="button"
                        onClick={() => applyZoomPreset('portrait')}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                          zoomPreset === 'portrait'
                            ? 'bg-indigo-950/60 border-indigo-400 shadow-lg shadow-indigo-500/10'
                            : 'bg-[#080D1A] border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                            Balanced
                          </span>
                          {zoomPreset === 'portrait' && <Check className="w-4 h-4 text-indigo-400" />}
                        </div>
                        <h4 className="text-sm font-bold text-white mt-1">
                          👔 Comfortable Portrait
                        </h4>
                        <p className="text-xs text-slate-300 mt-1 leading-snug">
                          Relaxed bust portrait with generous shoulder room for casual chats.
                        </p>
                      </button>

                      {/* Preset 4: Wide Showcase */}
                      <button
                        type="button"
                        onClick={() => applyZoomPreset('showcase')}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                          zoomPreset === 'showcase'
                            ? 'bg-amber-950/60 border-amber-400 shadow-lg shadow-amber-500/10'
                            : 'bg-[#080D1A] border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                            Wide Angle
                          </span>
                          {zoomPreset === 'showcase' && <Check className="w-4 h-4 text-amber-400" />}
                        </div>
                        <h4 className="text-sm font-bold text-white mt-1">
                          🌟 Wide Stage Showcase
                        </h4>
                        <p className="text-xs text-slate-300 mt-1 leading-snug">
                          Shows full hoodie print, cap graphics, and expressive arm gestures.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Interactive Fine-Tuning Sliders */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-5">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-sky-400" />
                      <span>Custom Talking Zoom & Height Sliders</span>
                    </h3>

                    {/* Zoom Level Multiplier Slider */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">Zoom Multiplier</span>
                        <span className="font-mono tabular-nums text-sky-400 font-bold bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                          {customZoomFactor.toFixed(2)}x
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <ZoomOut className="w-4 h-4 text-slate-400 shrink-0" />
                        <input
                          type="range"
                          min="0.75"
                          max="1.45"
                          step="0.02"
                          value={customZoomFactor}
                          onChange={(e) => {
                            const z = parseFloat(e.target.value);
                            setCustomZoomFactor(z);
                            persistSettings({customZoomFactor: z});
                          }}
                          className="w-full accent-sky-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                        />
                        <ZoomIn className="w-4 h-4 text-slate-400 shrink-0" />
                      </div>
                    </div>

                    {/* Vertical Height Offset Slider */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">Head Height / Gap Offset</span>
                        <span className="font-mono tabular-nums text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                          {customYOffset >= 0 ? `+${(customYOffset * 100).toFixed(0)}px` : `${(customYOffset * 100).toFixed(0)}px`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-0.15"
                        max="0.15"
                        step="0.01"
                        value={customYOffset}
                        onChange={(e) => {
                          const y = parseFloat(e.target.value);
                          setCustomYOffset(y);
                          persistSettings({customYOffset: y});
                        }}
                        className="w-full accent-indigo-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: VOICE PITCH & TONE */}
              {settingsTab === 'voice' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <Volume2 className="w-4 h-4 text-rose-400" />
                          <span>Vocal Resonance & Speech Pitch</span>
                        </h3>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Adjust pitch, rate and vocal tone for {MODELS[gender].name}:
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleTestVoice}
                        className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-rose-600 hover:opacity-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Test Voice</span>
                      </button>
                    </div>

                    {/* Voice Pitch Slider */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">Vocal Pitch</span>
                        <span className="font-mono tabular-nums text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                          {(voicePitch * 100).toFixed(0)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.70"
                        max="1.35"
                        step="0.03"
                        value={voicePitch}
                        onChange={(e) => {
                          const p = parseFloat(e.target.value);
                          setVoicePitch(p);
                          persistSettings({voicePitch: p});
                        }}
                        className="w-full accent-rose-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Voice Speed Rate Slider */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">Speech Rate / Speed</span>
                        <span className="font-mono tabular-nums text-sky-400 font-bold bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                          {(voiceRate * 100).toFixed(0)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.80"
                        max="1.30"
                        step="0.03"
                        value={voiceRate}
                        onChange={(e) => {
                          const r = parseFloat(e.target.value);
                          setVoiceRate(r);
                          persistSettings({voiceRate: r});
                        }}
                        className="w-full accent-sky-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Voice Tone Presets */}
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <span className="text-xs text-slate-300 font-medium block">Vocal Personality Tone</span>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            {id: 'chill', label: '⚡ Chill Gen Z', pitch: 1.0, rate: 1.0},
                            {id: 'sweet', label: '🌸 Sweet & Melodic', pitch: 1.15, rate: 0.98},
                            {id: 'anime', label: '🔥 Anime High Energy', pitch: 1.25, rate: 1.12},
                            {id: 'studio', label: '🎙️ Studio Host', pitch: 0.85, rate: 0.96},
                          ] as const
                        ).map((vt) => (
                          <button
                            key={vt.id}
                            type="button"
                            onClick={() => {
                              setVoiceTone(vt.id);
                              setVoicePitch(vt.pitch);
                              setVoiceRate(vt.rate);
                              persistSettings({voiceTone: vt.id, voicePitch: vt.pitch, voiceRate: vt.rate});
                            }}
                            className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition-colors cursor-pointer ${
                              voiceTone === vt.id
                                ? 'bg-sky-600/30 border-sky-400 text-white'
                                : 'bg-[#080D1A] border-white/10 text-slate-300 hover:text-white'
                            }`}
                          >
                            {vt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: TEXTURES & SHADING */}
              {settingsTab === 'textures' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-5">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Palette className="w-4 h-4 text-indigo-400" />
                      <span>3D Model Texture & Shader Style</span>
                    </h3>

                    {/* Shading Style */}
                    <div className="space-y-2">
                      <span className="text-xs text-slate-300 font-medium block">Anime Toon Shading Falloff</span>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            {id: 'cel', label: '🖌️ Hairline Cel-Anime'},
                            {id: 'soft', label: '☁️ Soft Velvet Satin'},
                            {id: 'glossy', label: '✨ High Gloss Studio'},
                          ] as const
                        ).map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setShadingStyle(s.id);
                              persistSettings({shadingStyle: s.id});
                            }}
                            className={`p-3 rounded-xl border text-xs font-semibold text-center transition-colors cursor-pointer ${
                              shadingStyle === s.id
                                ? 'bg-indigo-600/30 border-indigo-400 text-white'
                                : 'bg-[#080D1A] border-white/10 text-slate-300 hover:text-white'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Outline Thickness */}
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <span className="text-xs text-slate-300 font-medium block">MToon Cel Outline Edge Width</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {(
                          [
                            {label: 'Fine Hairline', val: 0.0014},
                            {label: 'Classic Anime', val: 0.0018},
                            {label: 'Bold Manga', val: 0.0024},
                            {label: 'No Outline', val: 0.0},
                          ] as const
                        ).map((o) => (
                          <button
                            key={o.label}
                            type="button"
                            onClick={() => {
                              setOutlineThickness(o.val);
                              persistSettings({outlineThickness: o.val});
                            }}
                            className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-colors cursor-pointer ${
                              outlineThickness === o.val
                                ? 'bg-sky-600/30 border-sky-400 text-white'
                                : 'bg-[#080D1A] border-white/10 text-slate-300 hover:text-white'
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: GRAPHICS & PERFORMANCE */}
              {settingsTab === 'graphics' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                        <span>Graphics Resolution & Frame Rate</span>
                      </h3>
                      <span className="font-mono text-emerald-400 text-xs font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                        {fps} FPS
                      </span>
                    </div>

                    {/* Quality Tiers */}
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          {id: 'low', label: '🔋 Battery Saver', desc: '1.25x DPR'},
                          {id: 'medium', label: '🚀 Balanced HD', desc: '1.50x DPR'},
                          {id: 'high', label: '🌟 Ultra Studio', desc: '2.00x DPR'},
                        ] as const
                      ).map((tier) => (
                        <button
                          key={tier.id}
                          type="button"
                          onClick={() => {
                            setQualityTier(tier.id);
                            persistSettings({qualityTier: tier.id});
                          }}
                          className={`p-3 rounded-2xl border text-left transition-colors cursor-pointer ${
                            qualityTier === tier.id
                              ? 'bg-emerald-950/60 border-emerald-400 text-white'
                              : 'bg-[#080D1A] border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          <div className="text-xs font-bold">{tier.label}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{tier.desc}</div>
                        </button>
                      ))}
                    </div>

                    {/* SpringBone Physics Toggle */}
                    <div className="flex items-center justify-between pt-3 border-t border-white/10">
                      <div>
                        <span className="text-xs font-semibold text-white block">Hair & Outfit Cloth Dynamics</span>
                        <span className="text-[11px] text-slate-400">SpringBone physics for realistic sway</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !springPhysicsEnabled;
                          setSpringPhysicsEnabled(next);
                          persistSettings({springPhysicsEnabled: next});
                        }}
                        className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                          springPhysicsEnabled
                            ? 'bg-emerald-600 text-white shadow-lg'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {springPhysicsEnabled ? 'ON (Realistic)' : 'OFF (Fast)'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: STUDIO LIGHTING THEMES */}
              {settingsTab === 'lighting' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sun className="w-4 h-4 text-amber-400" />
                      <span>Studio Environment & Ambiance</span>
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(
                        [
                          {id: 'cyber', label: '🌌 Cyber Midnight', desc: 'Electric Cyan & Rose Rim Light'},
                          {id: 'sunset', label: '🌅 Sunset Amber', desc: 'Warm Golden Hour Spotlight'},
                          {id: 'violet', label: '🔮 Tokyo Neon Violet', desc: 'Cyber Lounge Purple Ambiance'},
                          {id: 'daylight', label: '☀️ Clean Daylight', desc: 'Crisp Neutral Studio Lighting'},
                        ] as const
                      ).map((lt) => (
                        <button
                          key={lt.id}
                          type="button"
                          onClick={() => {
                            setLightingTheme(lt.id);
                            persistSettings({lightingTheme: lt.id});
                          }}
                          className={`p-4 rounded-2xl border text-left transition-colors cursor-pointer ${
                            lightingTheme === lt.id
                              ? 'bg-amber-950/60 border-amber-400 text-white'
                              : 'bg-[#080D1A] border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          <div className="text-xs font-bold">{lt.label}</div>
                          <div className="text-[11px] text-slate-400 mt-1">{lt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </main>

            {/* Bottom Done Bar */}
            <footer className="shrink-0 p-4 border-t border-white/10 bg-[#0B1020] flex items-center justify-between max-w-3xl mx-auto w-full">
              <span className="text-xs text-slate-400">
                🔒 Custom settings auto-saved to phone storage
              </span>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:opacity-95 text-white font-bold text-xs shadow-lg cursor-pointer"
              >
                Apply & Close
              </button>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1-Time Character Assets Download Menu (Only shown on 1st visit until models are stored in local storage) */}
      <AnimatePresence>
        {!checkingAssets && !assetsDownloaded && (
          <motion.div
            initial={{opacity: 0, scale: 0.96}}
            animate={{opacity: 1, scale: 1}}
            exit={{opacity: 0, scale: 0.94}}
            transition={{duration: 0.25}}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#070A12]/96 backdrop-blur-xl px-4 py-6"
          >
            <div className="max-w-md w-full p-6 sm:p-7 rounded-3xl bg-[#0D1424] border border-white/10 shadow-2xl space-y-5 text-center">
              {/* Header Icon */}
              <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500/20 to-rose-500/20 border border-white/10 flex items-center justify-center text-sky-400">
                <Smartphone className="w-7 h-7" />
              </div>

              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  1-Time Character Assets Download
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
                  Download Silas & Airi once to your phone storage. They will load instantly offline on all future visits!
                </p>
              </div>

              {/* Models Status Cards */}
              <div className="space-y-2.5 text-left">
                {/* Silas Card */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#080D1A] border border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 font-bold text-xs">
                      SI
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-white">Silas (Boy · Main)</h4>
                      <p className="text-[11px] text-slate-400">3D VRM Rig · ~7.8 MB</p>
                    </div>
                  </div>
                  <div>
                    {boyStored ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Stored
                      </span>
                    ) : currentDownloadingModel === 'boy' ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-full border border-sky-500/20 animate-pulse">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Downloading...
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-slate-400 bg-white/5 px-2.5 py-1 rounded-full">
                        Pending
                      </span>
                    )}
                  </div>
                </div>

                {/* Airi Card */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#080D1A] border border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold text-xs">
                      AI
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-white">Airi (Girl · Companion)</h4>
                      <p className="text-[11px] text-slate-400">3D VRM Rig · ~7.6 MB</p>
                    </div>
                  </div>
                  <div>
                    {girlStored ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Stored
                      </span>
                    ) : currentDownloadingModel === 'girl' ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20 animate-pulse">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Downloading...
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-slate-400 bg-white/5 px-2.5 py-1 rounded-full">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Overall Progress Bar */}
              {(isDownloadingAssets || downloadOverallPct > 0) && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs text-slate-300 font-medium">
                    <span>
                      {downloadOverallPct >= 100
                        ? '✓ All 3D Assets Stored in Phone!'
                        : currentDownloadingModel === 'boy'
                        ? 'Storing Silas (Boy) 3D Model...'
                        : 'Storing Airi (Girl) 3D Model...'}
                    </span>
                    <span className="font-mono text-sky-400 font-semibold">{downloadOverallPct}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-400 to-rose-500 transition-all duration-200"
                      style={{width: `${Math.max(4, downloadOverallPct)}%`}}
                    />
                  </div>
                </div>
              )}

              {/* Action Button */}
              <button
                type="button"
                disabled={isDownloadingAssets}
                onClick={handleStart1TimeDownload}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-sky-500 via-indigo-500 to-rose-500 hover:opacity-95 text-white font-bold text-sm sm:text-base shadow-xl flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-60 cursor-pointer"
              >
                {isDownloadingAssets ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving to Phone Storage ({downloadOverallPct}%)...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Start 1-Time Download</span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-slate-400">
                🔒 Permanently stored in your device · Never requested again
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Smooth Loading Overlay when switching models */}
      <AnimatePresence>
        {!isLoaded && (
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.2}}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#080C16]/90 px-6 text-center"
          >
            <div className="max-w-xs w-full space-y-3.5 p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl">
              <p className="text-sm font-semibold text-white">
                Loading {activeModel.name} ({loadProgress}%)
              </p>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-transform duration-150 origin-left ${
                    gender === 'girl' ? 'bg-rose-500' : 'bg-sky-400'
                  }`}
                  style={{transform: `scaleX(${Math.max(0.06, loadProgress / 100)})`}}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                {loadedFromCache
                  ? 'Instant restore from phone cache...'
                  : 'Preparing HD 3D model & facial rig...'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loadError && (
        <div className="fixed top-20 inset-x-0 mx-auto z-30 max-w-sm w-[90vw] px-4 py-2.5 rounded-2xl bg-red-950/95 border border-red-700 text-xs text-red-100 text-center">
          {loadError}
        </div>
      )}

      {/* Bottom Floating Subtitle + Chat Input with Disappearing Mic Effect */}
      <section
        aria-label="Chat and Voice Input"
        className="fixed bottom-5 inset-x-0 z-20 mx-auto max-w-xl w-[92vw] flex flex-col items-center gap-3"
      >
        {/* Subtle Spoken Subtitle Pill */}
        <AnimatePresence mode="wait">
          {subtitleText && !isListening && (
            <motion.div
              key={subtitleText}
              initial={{opacity: 0, y: 8}}
              animate={{opacity: 1, y: 0}}
              exit={{opacity: 0, y: 6}}
              transition={{duration: 0.16}}
              className="px-4 py-2 rounded-2xl bg-[#0B1120]/90 border border-white/10 shadow-xl text-center max-w-md"
            >
              <p className="text-xs sm:text-sm text-slate-100 leading-relaxed line-clamp-3">
                <span className={`font-semibold mr-1.5 ${activeModel.accentClass}`}>
                  {activeModel.name}:
                </span>
                {subtitleText}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Morphing Input Container: Chat Input disappears with effect when Mic is tapped */}
        <ChatInputBar
          activeModel={activeModel}
          isListening={isListening}
          isSpeaking={isSpeaking}
          isThinking={isThinking}
          liveTranscript={liveTranscript}
          onSendMessage={sendUserMessage}
          onStartVoice={startVoiceCapture}
          onStopVoice={stopVoiceCapture}
          onStopSpeaking={handleStopSpeaking}
        />
      </section>
    </main>
  );
}

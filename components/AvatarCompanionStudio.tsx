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
  MoveHorizontal,
  MoveVertical,
  Compass,
  Monitor,
  Lightbulb,
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
    greeting:
      'Yo bhai! Silas is live—aura full +1000! Bata aaj kaunsa crazy scene cook kar rahe hain, no cap?',
    accentClass: 'text-sky-300',
    buttonClass: 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-lg shadow-sky-500/25',
  },
  girl: {
    name: 'Airi',
    label: 'Girl · Airi',
    url: '/models/avatar.vrm',
    greeting:
      'Heyy yaar! Airi is here with full main-character energy! Bata aaj kya viral scene chal raha hai meri jaan?',
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
      {!isListening ? (
        <form
          onSubmit={handleSubmit}
          className="w-full flex items-center gap-2 p-1.5 rounded-full bg-[#0E1628] border border-white/15 shadow-lg"
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
        </form>
      ) : (
        /* Active Voice Mic Capsule */
        <div className="flex items-center gap-3.5 pl-4 pr-2 py-2 rounded-full bg-[#0B1528] border border-emerald-500/50 shadow-lg">
          {/* Lightweight CSS Pulse Indicator */}
          <div className="flex items-center gap-1 h-5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 -ml-3.5" />
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
        </div>
      )}
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

  // Quality, Camera & Performance Settings (Optimized to lowest non-model overhead by default)
  const [qualityTier, setQualityTier] = useState<QualityTier>(
    () => getSavedStudioSettings().qualityTier ?? detectDevicePerformance().tier
  );
  const [springPhysicsEnabled, setSpringPhysicsEnabled] = useState<boolean>(
    () => getSavedStudioSettings().springPhysicsEnabled ?? false
  );
  // Dedicated Separate Low-End Mobile Mode for budget mobile users (0% change to 3D models)
  const [lowEndMobileMode, setLowEndMobileMode] = useState<boolean>(
    () => getSavedStudioSettings().lowEndMobileMode ?? false
  );
  const [fpsCap, setFpsCap] = useState<30 | 60>(
    () => getSavedStudioSettings().fpsCap ?? 60
  );
  const [cameraView, setCameraView] = useState<CameraViewMode>('upper');
  const [fps, setFps] = useState<number>(60);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Full-Screen Studio Settings State (persisted to localStorage)
  const [settingsTab, setSettingsTab] = useState<
    'lowend' | 'talking' | 'voice' | 'textures' | 'graphics' | 'lighting'
  >('lowend');

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
    () => getSavedStudioSettings().customZoomFactor ?? 0.85
  );
  const [customYOffset, setCustomYOffset] = useState<number>(
    () => getSavedStudioSettings().customYOffset ?? 0.04
  );
  const [customXOffset, setCustomXOffset] = useState<number>(
    () => getSavedStudioSettings().customXOffset ?? 0.0
  );
  const [customCamPitch, setCustomCamPitch] = useState<number>(
    () => getSavedStudioSettings().customCamPitch ?? -0.02
  );
  const [customFov, setCustomFov] = useState<number>(
    () => getSavedStudioSettings().customFov ?? 30
  );
  const [zoomPreset, setZoomPreset] = useState<'perfect' | 'close' | 'portrait' | 'showcase'>(
    () => getSavedStudioSettings().zoomPreset ?? 'showcase'
  );

  // Material, Shader & Resolution State (Default 1.0x native DPR for lowest non-model overhead)
  const [resolutionScale, setResolutionScale] = useState<number>(
    () => getSavedStudioSettings().resolutionScale ?? 1.0
  );
  const [outlineThickness, setOutlineThickness] = useState<number>(
    () => getSavedStudioSettings().outlineThickness ?? 0.0014
  );
  const [shadeToony, setShadeToony] = useState<number>(
    () => getSavedStudioSettings().shadeToony ?? 0.78
  );
  const [shadeShift, setShadeShift] = useState<number>(
    () => getSavedStudioSettings().shadeShift ?? -0.05
  );
  const [lightingTheme, setLightingTheme] = useState<'cyber' | 'sunset' | 'violet' | 'daylight'>(
    () => getSavedStudioSettings().lightingTheme ?? 'cyber'
  );
  const [keyLightIntensity, setKeyLightIntensity] = useState<number>(
    () => getSavedStudioSettings().keyLightIntensity ?? 1.30
  );
  const [rimLightIntensity, setRimLightIntensity] = useState<number>(
    () => getSavedStudioSettings().rimLightIntensity ?? 1.80
  );
  const [hemiLightIntensity, setHemiLightIntensity] = useState<number>(
    () => getSavedStudioSettings().hemiLightIntensity ?? 1.15
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
    let x = 0.0;
    let pitch = 0.0;
    let fov = 26;

    if (preset === 'perfect') {
      z = 1.0;
      y = 0.0;
      x = 0.0;
      pitch = 0.0;
      fov = 26;
    } else if (preset === 'close') {
      z = 1.25;
      y = -0.04;
      x = 0.0;
      pitch = 0.02;
      fov = 24;
    } else if (preset === 'portrait') {
      z = 1.08;
      y = 0.0;
      x = 0.0;
      pitch = 0.0;
      fov = 26;
    } else if (preset === 'showcase') {
      z = 0.85;
      y = 0.04;
      x = 0.0;
      pitch = -0.02;
      fov = 30;
    }

    setCustomZoomFactor(z);
    setCustomYOffset(y);
    setCustomXOffset(x);
    setCustomCamPitch(pitch);
    setCustomFov(fov);
    persistSettings({
      zoomPreset: preset,
      customZoomFactor: z,
      customYOffset: y,
      customXOffset: x,
      customCamPitch: pitch,
      customFov: fov,
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
    const cleanupTimer = window.setTimeout(nukeNextDevIndicator, 1500);
    return () => window.clearTimeout(cleanupTimer);
  }, []);

  useEffect(() => {
    const ctrl = new AvatarAudioController();
    ctrl.setLowEndMode(lowEndMobileMode);
    audioControllerRef.current = ctrl;

    // Prefetch secondary character (Airi) into phone cache after Silas initializes
    const timer = window.setTimeout(() => {
      void fetchVrmWithCache('/models/avatar.vrm');
    }, 3000);

    const lipSync = lipSyncRef.current;
    return () => {
      window.clearTimeout(timer);
      audioControllerRef.current?.stopAll(lipSync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleLowEndMobile = useCallback(
    (forceState?: boolean) => {
      const next = typeof forceState === 'boolean' ? forceState : !lowEndMobileMode;
      setLowEndMobileMode(next);
      audioControllerRef.current?.setLowEndMode(next);
      if (next) {
        setSpringPhysicsEnabled(false);
        setQualityTier('low');
        setResolutionScale(0.85);
        persistSettings({
          lowEndMobileMode: true,
          springPhysicsEnabled: false,
          qualityTier: 'low',
          resolutionScale: 0.85,
        });
      } else {
        setQualityTier('medium');
        setResolutionScale(1.0);
        persistSettings({
          lowEndMobileMode: false,
          qualityTier: 'medium',
          resolutionScale: 1.0,
        });
      }
    },
    [lowEndMobileMode, persistSettings]
  );

  const handleResetSettings = () => {
    setVoicePitch(1.0);
    setVoiceRate(1.0);
    setVoiceTone('chill');
    setCustomZoomFactor(0.85);
    setCustomYOffset(0.04);
    setCustomXOffset(0.0);
    setCustomCamPitch(-0.02);
    setCustomFov(30);
    setZoomPreset('showcase');
    setResolutionScale(1.0);
    setSpringPhysicsEnabled(false);
    setLowEndMobileMode(false);
    setFpsCap(60);
    audioControllerRef.current?.setLowEndMode(false);
    setOutlineThickness(0.0014);
    setShadeToony(0.78);
    setShadeShift(-0.05);
    setLightingTheme('cyber');
    setKeyLightIntensity(1.30);
    setRimLightIntensity(1.80);
    setHemiLightIntensity(1.15);
    setShadingStyle('cel');
    persistSettings({
      voicePitch: 1.0,
      voiceRate: 1.0,
      voiceTone: 'chill',
      customZoomFactor: 0.85,
      customYOffset: 0.04,
      customXOffset: 0.0,
      customCamPitch: -0.02,
      customFov: 30,
      zoomPreset: 'showcase',
      resolutionScale: 1.0,
      springPhysicsEnabled: false,
      lowEndMobileMode: false,
      fpsCap: 60,
      outlineThickness: 0.0014,
      shadeToony: 0.78,
      shadeShift: -0.05,
      lightingTheme: 'cyber',
      keyLightIntensity: 1.30,
      rimLightIntensity: 1.80,
      hemiLightIntensity: 1.15,
      shadingStyle: 'cel',
    });
  };

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

      if (directAudioBase64) {
        try {
          setIsSpeaking(true);
          await audioControllerRef.current.playWavBase64(
            directAudioBase64,
            text,
            lipSyncRef.current,
            onSpeechDone,
            {gender: activeGender, emotion: replyEmotion, pitch: voicePitch, rate: voiceRate}
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
            onSpeechDone,
            {gender: activeGender, emotion: replyEmotion, pitch: voicePitch, rate: voiceRate}
          );
        } else {
          audioControllerRef.current.playBrowserSpeech(
            text,
            activeGender,
            lipSyncRef.current,
            onSpeechDone,
            {gender: activeGender, emotion: replyEmotion, pitch: voicePitch, rate: voiceRate}
          );
        }
      } catch {
        audioControllerRef.current.playBrowserSpeech(
          text,
          activeGender,
          lipSyncRef.current,
          onSpeechDone,
          {gender: activeGender, emotion: replyEmotion, pitch: voicePitch, rate: voiceRate}
        );
      }
    },
    [voiceMuted, voicePitch, voiceRate, voiceTone]
  );

  const handleTestVoice = useCallback(
    (testEmotion: AvatarEmotion = emotion) => {
      const boyLines: Record<AvatarEmotion, string> = {
        happy:
          'Yo bhai! Silas voice check—crisp Gen Z Reels attitude full +1000 aura, no cap fr!',
        angry:
          'Bro listen up—jab tera bhai lock in karta hai na, toh pura scene একদম savage ho jata hai!',
        surprised:
          'Wait what?! Bro literally cooked the wildest plot twist right now, no way!',
        sad:
          'Bhai real talk... chahe duniya kuch bhi bole, tera bhai hamesha tere saath khada hai.',
        relaxed:
          'Chill maar meri jaan, late-night aesthetic vibe on hai—sab ekdum smooth sort ho jayega.',
        neutral:
          'Silas on the mic—crisp studio voice locked in. Bol bhai aaj kya plan hai?',
      };
      const girlLines: Record<AvatarEmotion, string> = {
        happy:
          'Heyy yaar! Airi voice check—full Insta Reels main-character attitude, literally slaying!',
        angry:
          'Excuse me?! Mere saamne over-smart banne ki koshish mat kar yaar, full baddie mode on hai!',
        surprised:
          'OMG wait what?! Spill the whole tea right now meri jaan, I am literally shocked!',
        sad:
          'Aww yaar... idhar aa meri jaan, tension mat le, main hamesha tere saath hoon na.',
        relaxed:
          'So aesthetic and chill yaar... bas tu aur main, late-night cozy vibes, no cap.',
        neutral:
          'Airi on the studio mic—crisp Gen Z Reels voice ready! Bata aaj kya scene hai?',
      };
      const sampleText = gender === 'boy' ? boyLines[testEmotion] : girlLines[testEmotion];
      setEmotion(testEmotion);
      setSubtitleText(sampleText);
      void speakReply(sampleText, testEmotion, gender);
    },
    [emotion, gender, speakReply]
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
            toneStyle: voiceTone,
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
    [gender, history, isThinking, speakReply, voiceTone]
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
          lowEndMobileMode={lowEndMobileMode}
          fpsCap={fpsCap}
          cameraView={cameraView}
          customZoomFactor={customZoomFactor}
          customYOffset={customYOffset}
          customXOffset={customXOffset}
          customCamPitch={customCamPitch}
          customFov={customFov}
          resolutionScale={resolutionScale}
          outlineThickness={outlineThickness}
          shadeToony={shadeToony}
          shadeShift={shadeShift}
          lightingTheme={lightingTheme}
          keyLightIntensity={keyLightIntensity}
          rimLightIntensity={rimLightIntensity}
          hemiLightIntensity={hemiLightIntensity}
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

      {/* Minimalist Top Bar: Boy / Girl Switcher + Separate Low-End Mobile Toggle + Settings + Mute */}
      <header className="fixed top-3.5 inset-x-0 z-20 mx-auto max-w-xl w-[95vw] flex items-center justify-between gap-1.5 px-1">
        <div className="flex items-center p-1 rounded-full bg-[#0E1525] border border-white/10 shadow-md">
          {(['boy', 'girl'] as const).map((g) => {
            const active = gender === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => handleSwitchGender(g)}
                className={`relative px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? g === 'boy'
                      ? 'bg-sky-600 text-white'
                      : 'bg-rose-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="relative z-10">{MODELS[g].label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Dedicated 1-Tap Low-End Mobile Mode Button */}
          <button
            type="button"
            onClick={() => handleToggleLowEndMobile()}
            aria-label="Toggle Low-End Mobile Mode"
            className={`h-10 px-2.5 sm:px-3 flex items-center gap-1 rounded-full border text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              lowEndMobileMode
                ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                : 'bg-[#0E1525] border-white/15 text-slate-300 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-amber-400" />
            <span>{lowEndMobileMode ? 'Lite ON' : 'Low-End'}</span>
          </button>

          {/* Clearly Labeled Settings Menu Button */}
          <button
            type="button"
            onClick={() => setShowSettings((prev) => !prev)}
            aria-label="Open Settings Menu"
            className={`h-10 px-3 flex items-center gap-1.5 rounded-full bg-[#0E1525] border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showSettings
                ? 'border-sky-500 text-white bg-sky-600/20'
                : 'border-white/15 text-slate-100 hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden xs:inline sm:inline">Settings</span>
            <span className="font-mono tabular-nums text-emerald-400">{fps} FPS</span>
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
            className="h-10 w-10 flex items-center justify-center rounded-full bg-[#0E1525] border border-white/15 text-slate-200 hover:text-white transition-colors shrink-0 cursor-pointer"
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
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.15}}
            className="fixed inset-0 z-50 bg-[#070A14] flex flex-col text-white overflow-hidden select-none"
          >
            {/* Top Bar Header */}
            <header className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10 bg-[#0B1020]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 font-bold">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    Studio Settings & Low-End Mobile Optimizer
                  </h2>
                  <p className="text-xs text-sky-300 font-medium flex items-center gap-1.5 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                    Gemini 3.8 Live Extended Thinking · Models 100% Preserved
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
                  {id: 'lowend', label: 'Low-End Mobile Mode', icon: Smartphone},
                  {id: 'talking', label: 'Talking Framing & Camera', icon: ZoomIn},
                  {id: 'voice', label: 'Voice & Pitch Tuning', icon: Volume2},
                  {id: 'textures', label: 'Textures & Toon Shading', icon: Palette},
                  {id: 'graphics', label: 'Graphics & Resolution', icon: SlidersHorizontal},
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
                      active
                        ? tab.id === 'lowend'
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Main Tab Content Viewport */}
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 max-w-3xl mx-auto w-full">
              {/* TAB 0: DEDICATED LOW-END MOBILE MODE */}
              {settingsTab === 'lowend' && (
                <div className="space-y-6">
                  {/* Sub-Section 1: Master Low-End Mobile Mode Switch */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-amber-500/30 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                          <Smartphone className="w-4 h-4" />
                          <span>Dedicated Low-End Mobile Optimizer</span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                          Strips all non-model app overhead (background meshes, stage pedestal, extra lights, SpringBone physics, UI blur, and audio filters) to the absolute lowest level while keeping both <strong>Boy (Silas)</strong> and <strong>Girl (Airi)</strong> 3D models 100% untouched!
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleLowEndMobile()}
                        className={`px-5 py-3 rounded-2xl font-bold text-xs sm:text-sm shrink-0 transition-colors cursor-pointer ${
                          lowEndMobileMode
                            ? 'bg-amber-400 text-slate-950 shadow-lg'
                            : 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
                        }`}
                      >
                        {lowEndMobileMode ? '⚡ Low-End Mobile: ACTIVE' : 'Enable Low-End Mobile Mode'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                      <div className="p-3 rounded-2xl bg-[#080D1A] border border-white/10">
                        <span className="text-[11px] text-slate-400 block">3D Character Models</span>
                        <span className="text-xs font-bold text-emerald-400 mt-0.5 block">
                          100% Untouched
                        </span>
                      </div>
                      <div className="p-3 rounded-2xl bg-[#080D1A] border border-white/10">
                        <span className="text-[11px] text-slate-400 block">Non-Model 3D Stage</span>
                        <span className="text-xs font-bold text-amber-300 mt-0.5 block">
                          {lowEndMobileMode ? '0 Triangles (Hidden)' : 'Ultra-Lite Basic'}
                        </span>
                      </div>
                      <div className="p-3 rounded-2xl bg-[#080D1A] border border-white/10">
                        <span className="text-[11px] text-slate-400 block">SpringBone Physics</span>
                        <span className="text-xs font-bold text-sky-300 mt-0.5 block">
                          {springPhysicsEnabled && !lowEndMobileMode ? 'Active' : '0% CPU (Bypassed)'}
                        </span>
                      </div>
                      <div className="p-3 rounded-2xl bg-[#080D1A] border border-white/10">
                        <span className="text-[11px] text-slate-400 block">UI Blur & Fog</span>
                        <span className="text-xs font-bold text-emerald-400 mt-0.5 block">
                          0% GPU Overdraw
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sub-Section 2: Low-End Mobile Pixel Density & FPS Cap */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 space-y-5">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-amber-400" />
                      <span>Sub-Section: Budget Phone Resolution & Thermal FPS Lock</span>
                    </h3>

                    {/* Quick DPR Presets for Low-End Phones */}
                    <div className="space-y-2">
                      <span className="text-xs text-slate-300 font-medium block">
                        Viewport Pixel Density (Does Not Alter Model Geometry or Textures)
                      </span>
                      <div className="grid grid-cols-3 gap-2.5">
                        {(
                          [
                            {val: 0.7, label: '0.70x Ultra-Lite', sub: 'Max FPS on 2GB/3GB RAM'},
                            {val: 0.85, label: '0.85x Low-End Sweet Spot', sub: 'Crisp & Cool Battery'},
                            {val: 1.0, label: '1.00x Native Screen', sub: 'Standard 1:1 Pixel Ratio'},
                          ] as const
                        ).map((item) => {
                          const active = Math.abs(resolutionScale - item.val) < 0.03;
                          return (
                            <button
                              key={item.val}
                              type="button"
                              onClick={() => {
                                setResolutionScale(item.val);
                                persistSettings({resolutionScale: item.val});
                              }}
                              className={`p-3 rounded-2xl border text-left transition-colors cursor-pointer ${
                                active
                                  ? 'bg-amber-500/20 border-amber-400 text-white'
                                  : 'bg-[#080D1A] border-white/10 text-slate-300 hover:text-white'
                              }`}
                            >
                              <div className="text-xs font-bold">{item.label}</div>
                              <div className="text-[11px] text-slate-400 mt-0.5">{item.sub}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Frame Rate Cap Selector */}
                    <div className="space-y-2 pt-2">
                      <span className="text-xs text-slate-300 font-medium block">
                        Frame Pacing Cap (Prevents Phone Heating & Battery Drain)
                      </span>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setFpsCap(30);
                            persistSettings({fpsCap: 30});
                          }}
                          className={`p-3.5 rounded-2xl border text-left transition-colors cursor-pointer ${
                            fpsCap === 30
                              ? 'bg-emerald-950/60 border-emerald-400 text-white'
                              : 'bg-[#080D1A] border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          <div className="text-xs font-bold">🔋 30 FPS Thermal & Battery Lock</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Cuts mobile GPU power & heat by 50% with steady frame pacing
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setFpsCap(60);
                            persistSettings({fpsCap: 60});
                          }}
                          className={`p-3.5 rounded-2xl border text-left transition-colors cursor-pointer ${
                            fpsCap === 60
                              ? 'bg-sky-950/60 border-sky-400 text-white'
                              : 'bg-[#080D1A] border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          <div className="text-xs font-bold">⚡ 60 FPS Uncapped Smooth</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Maximum refresh rate supported by your mobile screen
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* TAB 1: TALKING FRAMING & CAMERA */}
              {settingsTab === 'talking' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Sub-Section 1: Presets */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-4">
                    <div>
                      <div className="flex items-center gap-2 text-sky-400 font-semibold text-sm">
                        <Sparkles className="w-4 h-4" />
                        <span>Sub-Section: Preset Framing Positions</span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        Tap a preset to immediately lock the character into your ideal conversational distance:
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Preset 1: Perfect Talking */}
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
                            Reference Bust
                          </span>
                          {zoomPreset === 'perfect' && <Check className="w-4 h-4 text-sky-400" />}
                        </div>
                        <h4 className="text-sm font-bold text-white mt-1">
                          🎯 Golden Bust Framing
                        </h4>
                        <p className="text-xs text-slate-300 mt-1 leading-snug">
                          Classic close portrait view with ~25px top gap & chest-up framing.
                        </p>
                      </button>

                      {/* Preset 2: Close Talking */}
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

                      {/* Preset 4: Wide Stage Showcase (Default) */}
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
                            Recommended Default
                          </span>
                          {zoomPreset === 'showcase' && <Check className="w-4 h-4 text-amber-400" />}
                        </div>
                        <h4 className="text-sm font-bold text-white mt-1">
                          🌟 Full-Screen Stage Showcase
                        </h4>
                        <p className="text-xs text-slate-300 mt-1 leading-snug">
                          Full screen stage view showing complete outfit details & studio pedestal.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Sub-Section 2: Interactive Fine-Tuning Sliders */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-5">
                    <div className="flex items-center gap-2 text-sky-400 font-semibold text-sm">
                      <Sliders className="w-4 h-4" />
                      <span>Sub-Section: Camera Fine-Tuning Sliders</span>
                    </div>

                    {/* Slider 1: Camera Zoom Level */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium flex items-center gap-1.5">
                          <ZoomIn className="w-3.5 h-3.5 text-sky-400" />
                          Camera Zoom Level
                        </span>
                        <span className="font-mono tabular-nums text-sky-400 font-bold bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                          {customZoomFactor.toFixed(2)}x
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <ZoomOut className="w-4 h-4 text-slate-400 shrink-0" />
                        <input
                          type="range"
                          min="0.75"
                          max="1.50"
                          step="0.01"
                          value={customZoomFactor}
                          onChange={(e) => {
                            const z = parseFloat(e.target.value);
                            setCustomZoomFactor(z);
                            setZoomPreset('perfect');
                            persistSettings({customZoomFactor: z});
                          }}
                          className="w-full accent-sky-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                        />
                        <ZoomIn className="w-4 h-4 text-slate-400 shrink-0" />
                      </div>
                    </div>

                    {/* Slider 2: Vertical Head Height / Gap Offset */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium flex items-center gap-1.5">
                          <MoveVertical className="w-3.5 h-3.5 text-indigo-400" />
                          Head Height / Gap Offset
                        </span>
                        <span className="font-mono tabular-nums text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                          {customYOffset >= 0 ? `+${(customYOffset * 100).toFixed(0)}cm` : `${(customYOffset * 100).toFixed(0)}cm`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-0.15"
                        max="0.15"
                        step="0.005"
                        value={customYOffset}
                        onChange={(e) => {
                          const y = parseFloat(e.target.value);
                          setCustomYOffset(y);
                          persistSettings({customYOffset: y});
                        }}
                        className="w-full accent-indigo-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Slider 3: Horizontal Framing Offset */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium flex items-center gap-1.5">
                          <MoveHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                          Horizontal Position
                        </span>
                        <span className="font-mono tabular-nums text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                          {customXOffset >= 0 ? `+${(customXOffset * 100).toFixed(0)}cm` : `${(customXOffset * 100).toFixed(0)}cm`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-0.20"
                        max="0.20"
                        step="0.005"
                        value={customXOffset}
                        onChange={(e) => {
                          const x = parseFloat(e.target.value);
                          setCustomXOffset(x);
                          persistSettings({customXOffset: x});
                        }}
                        className="w-full accent-emerald-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Slider 4: Camera Pitch Angle Tilt */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium flex items-center gap-1.5">
                          <Compass className="w-3.5 h-3.5 text-amber-400" />
                          Camera Pitch Tilt Angle
                        </span>
                        <span className="font-mono tabular-nums text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                          {customCamPitch.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-0.15"
                        max="0.15"
                        step="0.005"
                        value={customCamPitch}
                        onChange={(e) => {
                          const p = parseFloat(e.target.value);
                          setCustomCamPitch(p);
                          persistSettings({customCamPitch: p});
                        }}
                        className="w-full accent-amber-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Slider 5: Camera Field of View Angle */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium flex items-center gap-1.5">
                          <Maximize2 className="w-3.5 h-3.5 text-rose-400" />
                          Camera Field of View (FOV)
                        </span>
                        <span className="font-mono tabular-nums text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                          {customFov}°
                        </span>
                      </div>
                      <input
                        type="range"
                        min="18"
                        max="45"
                        step="1"
                        value={customFov}
                        onChange={(e) => {
                          const f = parseInt(e.target.value, 10);
                          setCustomFov(f);
                          persistSettings({customFov: f});
                        }}
                        className="w-full accent-rose-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: VOICE & PITCH TUNING */}
              {settingsTab === 'voice' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Sub-Section 1: Sliders */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <Volume2 className="w-4 h-4 text-rose-400" />
                          <span>Sub-Section: Gen Z Reels Vocal Mastering & Sliders</span>
                        </h3>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Crisp 3.8kHz presence boost + punchy Reels attitude for {MODELS[gender].name}:
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleTestVoice(emotion)}
                        className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-rose-600 hover:opacity-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg cursor-pointer shrink-0"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Test Reels Voice</span>
                      </button>
                    </div>

                    {/* Voice Pitch Slider */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">Vocal Pitch Tone</span>
                        <span className="font-mono tabular-nums text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                          {(voicePitch * 100).toFixed(0)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.70"
                        max="1.35"
                        step="0.02"
                        value={voicePitch}
                        onChange={(e) => {
                          const p = parseFloat(e.target.value);
                          setVoicePitch(p);
                          persistSettings({voicePitch: p});
                        }}
                        className="w-full accent-rose-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Speech Speed Rate Slider */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">Reels Cadence / Speed Rate</span>
                        <span className="font-mono tabular-nums text-sky-400 font-bold bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                          {(voiceRate * 100).toFixed(0)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.80"
                        max="1.30"
                        step="0.02"
                        value={voiceRate}
                        onChange={(e) => {
                          const r = parseFloat(e.target.value);
                          setVoiceRate(r);
                          persistSettings({voiceRate: r});
                        }}
                        className="w-full accent-sky-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Sub-Section 2: Gen Z YT / Insta Reels Attitude Presets */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-4">
                    <span className="text-xs text-sky-400 font-semibold block">
                      Sub-Section: Gen Z YouTube Shorts & Insta Reels Persona
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(
                        [
                          {
                            id: 'chill',
                            label: '🔥 Viral Reels Attitude (Default)',
                            desc: 'Crisp, punchy swagger & main-character cadence',
                            pitch: 1.0,
                            rate: 1.03,
                          },
                          {
                            id: 'anime',
                            label: '⚡ YT Shorts Hype Creator',
                            desc: 'High-voltage reaction energy & fast pacing',
                            pitch: 1.06,
                            rate: 1.08,
                          },
                          {
                            id: 'sweet',
                            label: '✨ Aesthetic Late-Night POV',
                            desc: 'Close-mic breathy warmth & emotional intimacy',
                            pitch: 1.02,
                            rate: 0.98,
                          },
                          {
                            id: 'studio',
                            label: '🎙️ Crisp Alpha / Baddie Mic',
                            desc: 'Deep broadcast condenser authority & bold punch',
                            pitch: 0.94,
                            rate: 1.02,
                          },
                        ] as const
                      ).map((vt) => (
                        <button
                          key={vt.id}
                          type="button"
                          onClick={() => {
                            setVoiceTone(vt.id);
                            setVoicePitch(vt.pitch);
                            setVoiceRate(vt.rate);
                            persistSettings({
                              voiceTone: vt.id,
                              voicePitch: vt.pitch,
                              voiceRate: vt.rate,
                            });
                          }}
                          className={`p-3.5 rounded-2xl border text-left transition-colors cursor-pointer ${
                            voiceTone === vt.id
                              ? 'bg-sky-600/30 border-sky-400 text-white shadow-md'
                              : 'bg-[#080D1A] border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          <div className="text-xs font-bold">{vt.label}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{vt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sub-Section 3: Emotional Attitude Voice Preview */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-4">
                    <div>
                      <span className="text-xs text-rose-400 font-semibold block">
                        Sub-Section: Live Emotional Attitude Voice Preview
                      </span>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Tap any emotion to hear how {MODELS[gender].name} adapts vocal attitude & crispness per response:
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {(
                        [
                          {emo: 'happy', label: '😎 Hype & Swagger'},
                          {emo: 'angry', label: '🔥 Savage Attitude'},
                          {emo: 'surprised', label: '😱 Viral Shock'},
                          {emo: 'sad', label: '🥺 Heartfelt POV'},
                          {emo: 'relaxed', label: '🌙 Aesthetic Chill'},
                          {emo: 'neutral', label: '🎯 Crisp Studio'},
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.emo}
                          type="button"
                          onClick={() => handleTestVoice(item.emo)}
                          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                            emotion === item.emo
                              ? 'bg-rose-600/30 border-rose-400 text-white shadow-md'
                              : 'bg-[#080D1A] border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          <span>{item.label}</span>
                          <Play className="w-3 h-3 opacity-75 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: TEXTURES & TOON SHADING */}
              {settingsTab === 'textures' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Sub-Section 1: Shader Style */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Palette className="w-4 h-4 text-indigo-400" />
                      <span>Sub-Section: Anime Toon Shading Falloff</span>
                    </h3>

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
                              ? 'bg-indigo-600/30 border-indigo-400 text-white shadow-md'
                              : 'bg-[#080D1A] border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sub-Section 2: Interactive Material Sliders */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-5">
                    <span className="text-xs text-sky-400 font-semibold block flex items-center gap-1.5">
                      <Sliders className="w-4 h-4" />
                      Sub-Section: Material & Shadow Fine-Tuning Sliders
                    </span>

                    {/* Slider 1: MToon Outline Width */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">MToon Edge Outline Width</span>
                        <span className="font-mono tabular-nums text-sky-400 font-bold bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                          {(outlineThickness * 1000).toFixed(1)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="0.0035"
                        step="0.0001"
                        value={outlineThickness}
                        onChange={(e) => {
                          const o = parseFloat(e.target.value);
                          setOutlineThickness(o);
                          persistSettings({outlineThickness: o});
                        }}
                        className="w-full accent-sky-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Slider 2: Toon Shadow Softness (shadeToony) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">Toon Shadow Softness (Shade Toony)</span>
                        <span className="font-mono tabular-nums text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                          {shadeToony.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.02"
                        value={shadeToony}
                        onChange={(e) => {
                          const t = parseFloat(e.target.value);
                          setShadeToony(t);
                          persistSettings({shadeToony: t});
                        }}
                        className="w-full accent-indigo-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Slider 3: Shadow Shift Threshold (shadeShift) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">Light to Shadow Shift Threshold</span>
                        <span className="font-mono tabular-nums text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                          {shadeShift > 0 ? `+${shadeShift.toFixed(2)}` : shadeShift.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-0.50"
                        max="0.50"
                        step="0.02"
                        value={shadeShift}
                        onChange={(e) => {
                          const s = parseFloat(e.target.value);
                          setShadeShift(s);
                          persistSettings({shadeShift: s});
                        }}
                        className="w-full accent-rose-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: GRAPHICS & RESOLUTION */}
              {settingsTab === 'graphics' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Sub-Section 1: Resolution Slider */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Monitor className="w-4 h-4 text-emerald-400" />
                        <span>Sub-Section: Render Resolution Scale</span>
                      </h3>
                      <span className="font-mono text-emerald-400 text-xs font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                        {resolutionScale.toFixed(2)}x DPR
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">Viewport Pixel Density Ratio (DPR)</span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          {resolutionScale < 1.0 ? 'Performance' : resolutionScale <= 1.5 ? 'High Definition' : 'Ultra Retina'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.75"
                        max="2.0"
                        step="0.05"
                        value={resolutionScale}
                        onChange={(e) => {
                          const r = parseFloat(e.target.value);
                          setResolutionScale(r);
                          persistSettings({resolutionScale: r});
                        }}
                        className="w-full accent-emerald-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Sub-Section 2: Quality Tiers */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-4">
                    <span className="text-xs text-slate-300 font-medium block">
                      Sub-Section: Hardware Quality Preset Tiers
                    </span>
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
                            const r = tier.id === 'low' ? 1.25 : tier.id === 'medium' ? 1.50 : 2.0;
                            setResolutionScale(r);
                            persistSettings({qualityTier: tier.id, resolutionScale: r});
                          }}
                          className={`p-3 rounded-2xl border text-left transition-colors cursor-pointer ${
                            qualityTier === tier.id
                              ? 'bg-emerald-950/60 border-emerald-400 text-white shadow-md'
                              : 'bg-[#080D1A] border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          <div className="text-xs font-bold">{tier.label}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{tier.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sub-Section 3: Physics & Telemetry */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-4">
                    <span className="text-xs text-slate-300 font-medium block">
                      Sub-Section: SpringBone Physics & Telemetry
                    </span>
                    <div className="flex items-center justify-between pt-1">
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

              {/* TAB 5: STUDIO LIGHTING */}
              {settingsTab === 'lighting' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Sub-Section 1: Ambiance Color Themes */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sun className="w-4 h-4 text-amber-400" />
                      <span>Sub-Section: Studio Ambiance Themes</span>
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
                              ? 'bg-amber-950/60 border-amber-400 text-white shadow-md'
                              : 'bg-[#080D1A] border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          <div className="text-xs font-bold">{lt.label}</div>
                          <div className="text-[11px] text-slate-400 mt-1">{lt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sub-Section 2: Light Intensity Sliders */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl space-y-5">
                    <span className="text-xs text-amber-400 font-semibold block flex items-center gap-1.5">
                      <Lightbulb className="w-4 h-4" />
                      Sub-Section: Studio Light Intensity Sliders
                    </span>

                    {/* Key Light Intensity */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">Key Directional Spotlight Intensity</span>
                        <span className="font-mono tabular-nums text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                          {keyLightIntensity.toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.2"
                        max="3.0"
                        step="0.05"
                        value={keyLightIntensity}
                        onChange={(e) => {
                          const k = parseFloat(e.target.value);
                          setKeyLightIntensity(k);
                          persistSettings({keyLightIntensity: k});
                        }}
                        className="w-full accent-amber-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Rim Light Intensity */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">Rim Accent Edge Light Intensity</span>
                        <span className="font-mono tabular-nums text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                          {rimLightIntensity.toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.2"
                        max="3.5"
                        step="0.05"
                        value={rimLightIntensity}
                        onChange={(e) => {
                          const r = parseFloat(e.target.value);
                          setRimLightIntensity(r);
                          persistSettings({rimLightIntensity: r});
                        }}
                        className="w-full accent-rose-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Hemisphere Ambient Light Intensity */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">Ambient Bounce Fill Light Intensity</span>
                        <span className="font-mono tabular-nums text-sky-400 font-bold bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                          {hemiLightIntensity.toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.2"
                        max="2.5"
                        step="0.05"
                        value={hemiLightIntensity}
                        onChange={(e) => {
                          const h = parseFloat(e.target.value);
                          setHemiLightIntensity(h);
                          persistSettings({hemiLightIntensity: h});
                        }}
                        className="w-full accent-sky-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />
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

              {/* Download Progress Bar */}
              {isDownloadingAssets && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Downloading 3D Rig Assets...</span>
                    <span className="font-mono text-sky-400 font-bold">{downloadOverallPct}%</span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-rose-500 transition-all duration-300"
                      style={{width: `${downloadOverallPct}%`}}
                    />
                  </div>
                </div>
              )}

              {/* Action Button */}
              <button
                type="button"
                onClick={handleStart1TimeDownload}
                disabled={isDownloadingAssets}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-sky-500 via-indigo-600 to-rose-600 hover:opacity-95 disabled:opacity-50 text-white font-bold text-sm shadow-xl flex items-center justify-center gap-2 transition-transform active:scale-[0.98] cursor-pointer"
              >
                {isDownloadingAssets ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving Models to Phone Storage...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Both Models (1-Time Process)</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Subtitle Box for AI Companion Speech (Zero Backdrop-Blur GPU Readback) */}
      {subtitleText && (
        <div className="fixed bottom-24 inset-x-0 z-10 mx-auto max-w-xl w-[92vw] pointer-events-none">
          <div className="p-3.5 sm:p-4 rounded-2xl bg-[#0B1222]/95 border border-white/10 shadow-lg text-center">
            <span className={`text-xs font-bold uppercase tracking-wider block mb-0.5 ${activeModel.accentClass}`}>
              {activeModel.name}:
            </span>
            <p className="text-xs sm:text-sm font-medium text-white leading-relaxed text-balance">
              {subtitleText}
            </p>
          </div>
        </div>
      )}

      {/* Bottom Floating Bar: Interactive Single-Line Chat Input */}
      <footer className="fixed bottom-4 inset-x-0 z-20 mx-auto max-w-xl w-[94vw]">
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
      </footer>
    </main>
  );
}

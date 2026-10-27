'use client';

import React, {useState, useRef, useEffect, useCallback} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {Mic, Send, Volume2, VolumeX, Square, Settings, X} from 'lucide-react';
import VrmAvatarCanvas, {
  AvatarEmotion,
  AvatarGesture,
  CameraViewMode,
} from '@/components/VrmAvatarCanvas';
import {
  AvatarGender,
  detectDevicePerformance,
  fetchVrmWithCache,
  QualityTier,
} from '@/lib/vrm-cache';
import {AvatarAudioController, LipSyncWeights} from '@/lib/lip-sync-audio';

interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

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
  girl: {
    name: 'Airi',
    label: 'Girl · Airi',
    url: '/models/avatar.vrm',
    greeting: "Hey! I'm Airi. Tap the mic or type below to talk with me!",
    accentClass: 'text-rose-300',
    buttonClass: 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/25',
  },
  boy: {
    name: 'Silas',
    label: 'Boy · Silas',
    url: '/models/boy.vrm',
    greeting: "Yo bro! I'm Silas. Tap the mic or type a message—let's chat!",
    accentClass: 'text-sky-300',
    buttonClass: 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-lg shadow-sky-500/25',
  },
};

export default function AvatarCompanionStudio() {
  const [gender, setGender] = useState<AvatarGender>('girl');
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

  const [emotion, setEmotion] = useState<AvatarEmotion>('happy');
  const [gesture, setGesture] = useState<AvatarGesture>('idle');

  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [subtitleText, setSubtitleText] = useState<string>(MODELS.girl.greeting);
  const [inputText, setInputText] = useState<string>('');
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [voiceMuted, setVoiceMuted] = useState<boolean>(false);

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

    const timer = window.setTimeout(() => {
      void fetchVrmWithCache('/models/boy.vrm');
    }, 3000);

    const lipSync = lipSyncRef.current;
    return () => {
      window.clearTimeout(timer);
      audioControllerRef.current?.stopAll(lipSync);
    };
  }, []);

  const handleSampleAudio = useCallback(() => {
    audioControllerRef.current?.sampleAnalyser(lipSyncRef.current);
    const currentlySpeaking = lipSyncRef.current.isSpeaking;
    setIsSpeaking((prev) => (prev !== currentlySpeaking ? currentlySpeaking : prev));
  }, []);

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
            onSpeechDone
          );
        }
      } catch {
        audioControllerRef.current.playBrowserSpeech(
          text,
          activeGender,
          lipSyncRef.current,
          onSpeechDone
        );
      }
    },
    [voiceMuted]
  );

  const sendUserMessage = useCallback(
    async (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed || isThinking) return;

      audioControllerRef.current?.stopAll(lipSyncRef.current);
      audioControllerRef.current?.playUiCue('pop');
      setIsSpeaking(false);
      setInputText('');
      setLiveTranscript('');

      const nextHistory: ChatTurn[] = [...history.slice(-6), {role: 'user', text: trimmed}];
      setHistory(nextHistory);
      setIsThinking(true);
      setGesture('think');
      setSubtitleText(`${MODELS[gender].name} is replying...`);

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 9500);

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
  }, []);

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
  }, [isListening, sendUserMessage, stopVoiceCapture]);

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

  const handleAvatarTapped = useCallback(
    (zone: 'head' | 'body') => {
      audioControllerRef.current?.playUiCue('pat');
      if (zone === 'head') {
        setEmotion('happy');
        setGesture('cheer');
        const msg =
          gender === 'girl'
            ? 'Hehe, thanks for the head pat! What should we talk about?'
            : 'Haha, appreciate that bro! What is on your mind?';
        setSubtitleText(msg);
        if (!isSpeaking && !isThinking) {
          void speakReply(msg, 'happy', gender);
        }
      } else {
        setEmotion('surprised');
        setGesture('wave');
      }
    },
    [gender, isSpeaking, isThinking, speakReply]
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

      {/* Minimalist Top Bar: Girl / Boy Switcher + Clearly Labeled Settings Button + Mute */}
      <header className="fixed top-4 inset-x-0 z-20 mx-auto max-w-xl w-[94vw] flex items-center justify-between gap-2 px-1">
        <div className="flex items-center p-1 rounded-full bg-[#0E1525]/95 border border-white/10 shadow-xl">
          {(['girl', 'boy'] as const).map((g) => {
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
                      g === 'girl' ? 'bg-rose-600' : 'bg-sky-600'
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
                ? 'border-rose-500 text-white bg-rose-600/20'
                : 'border-white/15 text-slate-100 hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-rose-400" />
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

      {/* Settings Menu Modal / Popover */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{opacity: 0, y: -10, scale: 0.95}}
            animate={{opacity: 1, y: 0, scale: 1}}
            exit={{opacity: 0, y: -10, scale: 0.95}}
            transition={{duration: 0.16}}
            className="fixed top-16 right-3 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 z-30 w-[min(340px,92vw)] p-4 rounded-2xl bg-[#0E1526]/98 border border-white/15 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div>
                <h2 className="text-sm font-bold text-white">Performance & Quality Settings</h2>
                <p className="text-[11px] text-slate-400">
                  Gemini 2.5 Flash Native Audio Dialog
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. Model Graphics Quality Switcher */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">3D Graphics Quality</span>
                <span className="font-mono tabular-nums text-emerald-400">{fps} FPS</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 bg-[#080C16] p-1 rounded-xl border border-white/10">
                {(
                  [
                    {id: 'low', label: 'Low · Max FPS'},
                    {id: 'medium', label: 'Medium · HD'},
                    {id: 'high', label: 'High · Ultra'},
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setQualityTier(t.id)}
                    className={`py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      qualityTier === t.id
                        ? 'bg-rose-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Camera Zoom Framing */}
            <div className="space-y-1.5">
              <span className="text-xs text-slate-300 font-medium block">Camera Framing</span>
              <div className="grid grid-cols-3 gap-1.5 bg-[#080C16] p-1 rounded-xl border border-white/10">
                {(
                  [
                    {id: 'close', label: 'Close-Up'},
                    {id: 'upper', label: 'Upper Body'},
                    {id: 'full', label: 'Full Body'},
                  ] as const
                ).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setCameraView(v.id)}
                    className={`py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      cameraView === v.id
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Hair & Outfit SpringBone Physics Toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <span className="text-xs text-slate-300 font-medium">Hair & Outfit Physics</span>
              <button
                type="button"
                onClick={() => setSpringPhysicsEnabled((prev) => !prev)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  springPhysicsEnabled
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {springPhysicsEnabled ? 'ON (Realistic)' : 'OFF (Boost FPS)'}
              </button>
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
        <div className="relative w-full min-h-[56px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            {!isListening ? (
              <motion.form
                key="chat-input-bar"
                initial={{opacity: 0, scale: 0.86, y: 14}}
                animate={{opacity: 1, scale: 1, y: 0}}
                exit={{opacity: 0, scale: 0.82, y: 14}}
                transition={{type: 'spring', stiffness: 380, damping: 28}}
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendUserMessage(inputText);
                }}
                className="w-full flex items-center gap-2 p-1.5 rounded-full bg-[#0E1628]/95 border border-white/15 shadow-2xl"
              >
                {/* Mic Button inside Chat Input */}
                <button
                  type="button"
                  onClick={() => void startVoiceCapture()}
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
                  className="flex-1 bg-transparent px-2 text-sm sm:text-base text-white placeholder:text-slate-400 focus:outline-none min-w-0"
                />

                {/* Stop Speaking Button OR Send Button */}
                {isSpeaking ? (
                  <button
                    type="button"
                    onClick={() => {
                      audioControllerRef.current?.stopAll(lipSyncRef.current);
                      setIsSpeaking(false);
                    }}
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
                  onClick={stopVoiceCapture}
                  className="h-10 px-4 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-transform active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Done</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
}

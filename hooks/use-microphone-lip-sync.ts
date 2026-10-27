'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import type {VRM} from '@pixiv/three-vrm';

export interface VrmLipSyncWeights {
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
  volume: number;
  isSpeaking: boolean;
}

export interface UseMicrophoneLipSyncOptions {
  /** Optional VRM instance to animate expressions on automatically */
  vrm?: VRM | null;
  /** Smoothing factor for frequency bin decay (0.0 to 0.95, default 0.6) */
  smoothing?: number;
  /** Audio input gain sensitivity multiplier (default 1.25) */
  sensitivity?: number;
  /** Minimum RMS energy to register speaking (default 0.035) */
  silenceThreshold?: number;
  /** Callback fired on each sampled audio frame with latest weights */
  onWeightsChange?: (weights: VrmLipSyncWeights) => void;
}

const DEFAULT_WEIGHTS: VrmLipSyncWeights = {
  aa: 0,
  ih: 0,
  ou: 0,
  ee: 0,
  oh: 0,
  volume: 0,
  isSpeaking: false,
};

/**
 * Custom React hook that captures microphone audio, performs real-time FFT frequency
 * formant analysis, and maps acoustic energy to VRM standard vowel blend shapes (aa, ih, ou, ee, oh).
 */
export function useMicrophoneLipSync(options: UseMicrophoneLipSyncOptions = {}) {
  const {
    vrm,
    smoothing = 0.6,
    sensitivity = 1.25,
    silenceThreshold = 0.035,
    onWeightsChange,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weights, setWeights] = useState<VrmLipSyncWeights>(DEFAULT_WEIGHTS);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const currentWeightsRef = useRef<VrmLipSyncWeights>({...DEFAULT_WEIGHTS});
  const vrmRef = useRef<VRM | null>(vrm ?? null);
  const onWeightsChangeRef = useRef(onWeightsChange);
  const lastStateUpdateTimeRef = useRef<number>(0);

  useEffect(() => {
    vrmRef.current = vrm ?? null;
  }, [vrm]);

  useEffect(() => {
    onWeightsChangeRef.current = onWeightsChange;
  }, [onWeightsChange]);

  /**
   * Sample the current frequency bins from the AnalyserNode and map them to VRM blendshapes
   */
  const sampleFrame = useCallback(
    (targetVrm?: VRM | null): VrmLipSyncWeights => {
      const analyser = analyserRef.current;
      const freqData = freqDataRef.current;
      const w = currentWeightsRef.current;

      if (!analyser || !freqData) {
        // Decay to zero if inactive
        w.aa *= 0.78;
        w.ih *= 0.78;
        w.ou *= 0.78;
        w.ee *= 0.78;
        w.oh *= 0.78;
        w.volume *= 0.75;
        w.isSpeaking = w.volume > 0.02;
        return w;
      }

      analyser.getByteFrequencyData(freqData);

      // Acoustic frequency band segmentation for 128 FFT (64 bins, ~375 Hz bin width)
      // Process only human vocal formant bins 1 through 15
      let lowEnergy = 0; // bins 1-2: 375 - 750 Hz (ou, fundamental)
      let midLowEnergy = 0; // bins 3-5: 750 - 1875 Hz (aa, open jaw)
      let midHighEnergy = 0; // bins 6-9: 1875 - 3375 Hz (ee, spread lips)
      let highEnergy = 0; // bins 10-15: 3375 - 5625 Hz (ih, sibilants)

      for (let i = 1; i <= 2; i++) lowEnergy += freqData[i];
      for (let i = 3; i <= 5; i++) midLowEnergy += freqData[i];
      for (let i = 6; i <= 9; i++) midHighEnergy += freqData[i];
      for (let i = 10; i <= 15; i++) highEnergy += freqData[i];

      const normLow = lowEnergy / (2 * 255);
      const normMidLow = midLowEnergy / (3 * 255);
      const normMidHigh = midHighEnergy / (4 * 255);
      const normHigh = highEnergy / (6 * 255);

      const rawVolume = Math.min(
        1,
        (normLow * 0.35 + normMidLow * 0.45 + normMidHigh * 0.15 + normHigh * 0.05) * sensitivity
      );

      // Smooth decay on volume
      w.volume = w.volume * 0.3 + rawVolume * 0.7;

      if (w.volume < silenceThreshold) {
        w.aa *= 0.65;
        w.ih *= 0.65;
        w.ou *= 0.65;
        w.ee *= 0.65;
        w.oh *= 0.65;
        w.isSpeaking = false;
      } else {
        w.isSpeaking = true;
        // Non-linear mapping to vowel blend shapes
        const targetAa = Math.min(1, Math.pow(normMidLow, 0.8) * 1.35 * sensitivity);
        const targetOh = Math.min(0.9, (normLow * 0.6 + normMidLow * 0.4) * 1.1 * sensitivity);
        const targetEe = Math.min(0.85, (normMidHigh * 0.85 + normLow * 0.15) * 1.2 * sensitivity);
        const targetOu = Math.min(0.8, (normLow * 0.85 + normHigh * 0.15) * 1.1 * sensitivity);
        const targetIh = Math.min(0.75, normHigh * 1.4 * sensitivity);

        // Low-pass filter damping for smooth organic mouth motion
        w.aa = w.aa * 0.4 + targetAa * 0.6;
        w.oh = w.oh * 0.4 + targetOh * 0.6;
        w.ee = w.ee * 0.4 + targetEe * 0.6;
        w.ou = w.ou * 0.4 + targetOu * 0.6;
        w.ih = w.ih * 0.4 + targetIh * 0.6;
      }

      // Apply directly to VRM Expression Manager if instance is provided
      const activeVrm = targetVrm || vrmRef.current;
      if (activeVrm && activeVrm.expressionManager) {
        const mgr = activeVrm.expressionManager;
        mgr.setValue('aa', w.aa);
        mgr.setValue('ih', w.ih);
        mgr.setValue('ou', w.ou);
        mgr.setValue('ee', w.ee);
        mgr.setValue('oh', w.oh);
      }

      onWeightsChangeRef.current?.(w);
      return w;
    },
    [sensitivity, silenceThreshold]
  );

  /**
   * Start listening to user microphone and analyzing frequency data
   */
  const startListening = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);
      if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported on this device/browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      const ctx = new AudioCtxClass();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = smoothing;

      const sourceNode = ctx.createMediaStreamSource(stream);
      sourceNode.connect(analyser);

      const freqData = new Uint8Array(64);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      streamRef.current = stream;
      sourceNodeRef.current = sourceNode;
      freqDataRef.current = freqData;

      setIsListening(true);

      // Continuous animation loop for real-time lip sync - updates ref every frame,
      // and throttles React state updates to 10 Hz (every 100ms) to eliminate 60 FPS re-render freezes
      const loop = (timestamp: number) => {
        const nextWeights = sampleFrame(vrmRef.current);
        if (timestamp - lastStateUpdateTimeRef.current >= 100) {
          lastStateUpdateTimeRef.current = timestamp;
          setWeights({...nextWeights});
        }
        animFrameIdRef.current = requestAnimationFrame(loop);
      };
      animFrameIdRef.current = requestAnimationFrame(loop);

      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to access microphone';
      setError(msg);
      setIsListening(false);
      return false;
    }
  }, [sampleFrame, smoothing]);

  /**
   * Stop listening and release media stream
   */
  const stopListening = useCallback(() => {
    if (animFrameIdRef.current !== null) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // Ignore disconnect error
      }
      sourceNodeRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    analyserRef.current = null;
    freqDataRef.current = null;

    currentWeightsRef.current = {...DEFAULT_WEIGHTS};
    setWeights({...DEFAULT_WEIGHTS});
    setIsListening(false);

    // Reset VRM mouth to closed position
    if (vrmRef.current && vrmRef.current.expressionManager) {
      vrmRef.current.expressionManager.setValue('aa', 0);
      vrmRef.current.expressionManager.setValue('ih', 0);
      vrmRef.current.expressionManager.setValue('ou', 0);
      vrmRef.current.expressionManager.setValue('ee', 0);
      vrmRef.current.expressionManager.setValue('oh', 0);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    error,
    weights,
    weightsRef: currentWeightsRef,
    startListening,
    stopListening,
    sampleFrame,
  };
}

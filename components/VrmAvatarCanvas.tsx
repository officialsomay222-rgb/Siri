'use client';

import React, {useEffect, useRef} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {VRM, VRMLoaderPlugin, VRMUtils} from '@pixiv/three-vrm';
import {AvatarGender, fetchVrmWithCache, QualityTier} from '@/lib/vrm-cache';
import {LipSyncWeights} from '@/lib/lip-sync-audio';

export type AvatarEmotion = 'happy' | 'relaxed' | 'surprised' | 'sad' | 'angry' | 'neutral';
export type AvatarGesture = 'idle' | 'wave' | 'nod' | 'think' | 'cheer' | 'bow';
export type CameraViewMode = 'close' | 'upper' | 'full';

export interface VrmAvatarCanvasProps {
  gender: AvatarGender;
  modelUrl: string;
  qualityTier: QualityTier;
  springPhysicsEnabled: boolean;
  lowEndMobileMode?: boolean;
  fpsCap?: 30 | 60;
  cameraView: CameraViewMode;
  emotion: AvatarEmotion;
  gesture: AvatarGesture;
  isListening: boolean;
  isThinking: boolean;
  customZoomFactor?: number;
  customYOffset?: number;
  customXOffset?: number;
  customCamPitch?: number;
  customFov?: number;
  resolutionScale?: number;
  outlineThickness?: number;
  shadeToony?: number;
  shadeShift?: number;
  lightingTheme?: 'cyber' | 'sunset' | 'violet' | 'daylight';
  keyLightIntensity?: number;
  rimLightIntensity?: number;
  hemiLightIntensity?: number;
  shadingStyle?: 'cel' | 'soft' | 'glossy';
  lipSyncRef: React.MutableRefObject<LipSyncWeights>;
  onSampleAudio: () => void;
  onLoadProgress: (percent: number, fromCache: boolean) => void;
  onLoadComplete: () => void;
  onLoadError: (err: string) => void;
  onFpsUpdate: (fps: number) => void;
  onAvatarTapped: (zone: 'head' | 'body') => void;
}

interface CachedHumanoidBones {
  hips: THREE.Object3D | null;
  spine: THREE.Object3D | null;
  chest: THREE.Object3D | null;
  upperChest: THREE.Object3D | null;
  neck: THREE.Object3D | null;
  head: THREE.Object3D | null;
  leftEye: THREE.Object3D | null;
  rightEye: THREE.Object3D | null;
  leftShoulder: THREE.Object3D | null;
  rightShoulder: THREE.Object3D | null;
  leftUpperArm: THREE.Object3D | null;
  rightUpperArm: THREE.Object3D | null;
  leftLowerArm: THREE.Object3D | null;
  rightLowerArm: THREE.Object3D | null;
  leftHand: THREE.Object3D | null;
  rightHand: THREE.Object3D | null;
}

// Pre-allocated math helpers at module scope to prevent GC in the render loop
const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _headWorld = new THREE.Vector3();
const _chestWorld = new THREE.Vector3();
const _pointerNdc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();

function VrmAvatarCanvas({
  gender,
  modelUrl,
  qualityTier,
  springPhysicsEnabled,
  lowEndMobileMode = false,
  fpsCap = 60,
  cameraView,
  emotion,
  gesture,
  isListening,
  isThinking,
  customZoomFactor = 1.0,
  customYOffset = 0.0,
  customXOffset = 0.0,
  customCamPitch = 0.0,
  customFov = 26,
  resolutionScale = 1.0,
  outlineThickness = 0.0014,
  shadeToony = 0.78,
  shadeShift = -0.05,
  lightingTheme = 'cyber',
  keyLightIntensity = 1.30,
  rimLightIntensity = 1.80,
  hemiLightIntensity = 1.15,
  shadingStyle = 'cel',
  lipSyncRef,
  onSampleAudio,
  onLoadProgress,
  onLoadComplete,
  onLoadError,
  onFpsUpdate,
  onAvatarTapped,
}: VrmAvatarCanvasProps) {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  // VRM version sign: +1 for VRM 0.x (Girl / Pretty girly), -1 for VRM 1.0 (Boy / Silas)
  const vrmSignRef = useRef<number>(1);
  const boneHeightsRef = useRef({headY: 1.38, chestY: 1.12});

  const stateRef = useRef({
    gender,
    qualityTier,
    springPhysicsEnabled,
    lowEndMobileMode,
    fpsCap,
    cameraView,
    emotion,
    gesture,
    isListening,
    isThinking,
    customZoomFactor,
    customYOffset,
    customXOffset,
    customCamPitch,
    customFov,
    resolutionScale,
    outlineThickness,
    shadeToony,
    shadeShift,
    lightingTheme,
    keyLightIntensity,
    rimLightIntensity,
    hemiLightIntensity,
    shadingStyle,
    cameraTransitionActive: true,
    gestureTimer: 0,
    activeGesture: 'idle' as AvatarGesture,
    idealCamPos: new THREE.Vector3(0, 1.32, 1.38),
    idealTarget: new THREE.Vector3(0, 1.26, 0),
  });

  const callbacksRef = useRef({
    onSampleAudio,
    onLoadProgress,
    onLoadComplete,
    onLoadError,
    onFpsUpdate,
    onAvatarTapped,
  });

  useEffect(() => {
    callbacksRef.current = {
      onSampleAudio,
      onLoadProgress,
      onLoadComplete,
      onLoadError,
      onFpsUpdate,
      onAvatarTapped,
    };
  });

  const canvasObjRef = useRef<{
    vrm: VRM | null;
    cachedBones: CachedHumanoidBones | null;
    scene: THREE.Scene | null;
    renderer: THREE.WebGLRenderer | null;
    camera: THREE.PerspectiveCamera | null;
    stageGroup: THREE.Group | null;
    ringMat: THREE.MeshBasicMaterial | null;
    keyLight: THREE.DirectionalLight | null;
    fillLight: THREE.DirectionalLight | null;
    rimLight: THREE.DirectionalLight | null;
    hemiLight: THREE.HemisphereLight | null;
    interactionProxies: {headProxy: THREE.Mesh; bodyProxy: THREE.Mesh} | null;
  }>({
    vrm: null,
    cachedBones: null,
    scene: null,
    renderer: null,
    camera: null,
    stageGroup: null,
    ringMat: null,
    keyLight: null,
    fillLight: null,
    rimLight: null,
    hemiLight: null,
    interactionProxies: null,
  });

  const computeResponsiveFraming = (
    headY: number,
    chestY: number,
    viewMode: CameraViewMode
  ) => {
    const container = canvasMountRef.current;
    const w = container ? container.clientWidth : window.innerWidth;
    const h = container ? Math.max(1, container.clientHeight) : window.innerHeight;
    const isPortraitMobile = w / h < 0.85;
    const isBoy = stateRef.current.gender === 'boy';

    if (viewMode === 'close') {
      const lookY = headY + (isPortraitMobile ? 0.03 : 0.01);
      stateRef.current.idealTarget.set(0, lookY, 0);
      stateRef.current.idealCamPos.set(
        0,
        lookY + 0.02,
        isPortraitMobile ? (isBoy ? 1.20 : 1.12) : (isBoy ? 1.08 : 1.02)
      );
    } else if (viewMode === 'full') {
      const lookY = headY * 0.52 + (isPortraitMobile ? 0.06 : 0.02);
      stateRef.current.idealTarget.set(0, lookY, 0);
      stateRef.current.idealCamPos.set(
        0,
        lookY + 0.04,
        isPortraitMobile ? (isBoy ? 2.95 : 2.75) : (isBoy ? 2.50 : 2.35)
      );
    } else {
      const baseTargetY = isPortraitMobile
        ? (isBoy ? headY - 0.095 : headY - 0.120)
        : (isBoy ? headY - 0.075 : headY - 0.098);
      const baseCamZ = isPortraitMobile
        ? (isBoy ? 1.48 : 1.34)
        : (isBoy ? 1.36 : 1.22);

      const zoom = stateRef.current.customZoomFactor || 1.0;
      const yOff = stateRef.current.customYOffset || 0.0;
      const xOff = stateRef.current.customXOffset || 0.0;
      const pitchOff = stateRef.current.customCamPitch || 0.0;

      const targetY = baseTargetY + yOff;
      const camZ = baseCamZ / zoom;

      stateRef.current.idealTarget.set(xOff, targetY + pitchOff, 0);
      stateRef.current.idealCamPos.set(xOff, targetY + 0.02, camZ);
    }
    stateRef.current.cameraTransitionActive = true;
  };

  useEffect(() => {
    const prevGesture = stateRef.current.gesture;
    const prevView = stateRef.current.cameraView;
    const prevGender = stateRef.current.gender;
    const prevZoom = stateRef.current.customZoomFactor;
    const prevYOff = stateRef.current.customYOffset;
    const prevXOff = stateRef.current.customXOffset;
    const prevPitch = stateRef.current.customCamPitch;
    const prevFov = stateRef.current.customFov;

    stateRef.current.gender = gender;
    stateRef.current.qualityTier = qualityTier;
    stateRef.current.springPhysicsEnabled = springPhysicsEnabled;
    stateRef.current.lowEndMobileMode = lowEndMobileMode;
    stateRef.current.fpsCap = fpsCap;
    stateRef.current.cameraView = cameraView;
    stateRef.current.emotion = emotion;
    stateRef.current.gesture = gesture;
    stateRef.current.isListening = isListening;
    stateRef.current.isThinking = isThinking;
    stateRef.current.customZoomFactor = customZoomFactor;
    stateRef.current.customYOffset = customYOffset;
    stateRef.current.customXOffset = customXOffset;
    stateRef.current.customCamPitch = customCamPitch;
    stateRef.current.customFov = customFov;
    stateRef.current.resolutionScale = resolutionScale;
    stateRef.current.outlineThickness = outlineThickness;
    stateRef.current.shadeToony = shadeToony;
    stateRef.current.shadeShift = shadeShift;
    stateRef.current.lightingTheme = lightingTheme;
    stateRef.current.keyLightIntensity = keyLightIntensity;
    stateRef.current.rimLightIntensity = rimLightIntensity;
    stateRef.current.hemiLightIntensity = hemiLightIntensity;
    stateRef.current.shadingStyle = shadingStyle;

    if (prevGesture !== gesture && gesture !== 'idle') {
      stateRef.current.activeGesture = gesture;
      stateRef.current.gestureTimer = 2.4;
    }

    if (prevFov !== customFov && canvasObjRef.current.camera) {
      canvasObjRef.current.camera.fov = customFov;
      canvasObjRef.current.camera.updateProjectionMatrix();
    }

    if (
      prevView !== cameraView ||
      prevGender !== gender ||
      prevZoom !== customZoomFactor ||
      prevYOff !== customYOffset ||
      prevXOff !== customXOffset ||
      prevPitch !== customCamPitch
    ) {
      computeResponsiveFraming(
        boneHeightsRef.current.headY,
        boneHeightsRef.current.chestY,
        cameraView
      );
    }

    // Apply low-end mode scene visibility & lighting updates only when props change (zero per-frame cost)
    const obj = canvasObjRef.current;
    if (obj.stageGroup) {
      obj.stageGroup.visible = !lowEndMobileMode;
    }
    if (obj.fillLight) {
      obj.fillLight.visible = !lowEndMobileMode;
    }
    if (obj.rimLight) {
      obj.rimLight.visible = !lowEndMobileMode;
    }
    if (obj.keyLight) {
      obj.keyLight.intensity = keyLightIntensity;
    }
    if (obj.hemiLight) {
      obj.hemiLight.intensity = hemiLightIntensity;
    }
    if (obj.rimLight && !lowEndMobileMode) {
      obj.rimLight.intensity = rimLightIntensity;
      const themeHex =
        lightingTheme === 'sunset'
          ? 0xf59e0b
          : lightingTheme === 'violet'
          ? 0xa855f7
          : lightingTheme === 'daylight'
          ? 0x38bdf8
          : gender === 'boy'
          ? 0x38bdf8
          : 0xf43f5e;
      obj.rimLight.color.setHex(themeHex);
    }
    if (obj.renderer) {
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      const targetRatio = lowEndMobileMode
        ? Math.min(dpr, Math.min(resolutionScale, 0.85))
        : Math.min(dpr, resolutionScale);
      obj.renderer.setPixelRatio(Math.max(0.65, targetRatio));
    }
  }, [
    gender,
    qualityTier,
    springPhysicsEnabled,
    lowEndMobileMode,
    fpsCap,
    cameraView,
    emotion,
    gesture,
    isListening,
    isThinking,
    customZoomFactor,
    customYOffset,
    customXOffset,
    customCamPitch,
    customFov,
    resolutionScale,
    outlineThickness,
    shadeToony,
    shadeShift,
    lightingTheme,
    keyLightIntensity,
    rimLightIntensity,
    hemiLightIntensity,
    shadingStyle,
  ]);

  // Dynamic real-time material updates for outline thickness, shadeToony & shadeShift
  useEffect(() => {
    const vrm = canvasObjRef.current.vrm;
    if (!vrm) return;
    vrm.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const rawMat = (obj as THREE.Mesh).material;
        const mats = Array.isArray(rawMat) ? rawMat : [rawMat];
        for (const mat of mats) {
          if (!mat) continue;
          const rec = mat as unknown as Record<string, unknown>;
          if ('outlineWidthFactor' in rec) {
            rec.outlineWidthFactor = outlineThickness;
          }
          if ('shadeToony' in rec) {
            rec.shadeToony = shadeToony;
          }
          if ('shadeShift' in rec) {
            rec.shadeShift = shadeShift;
          }
          mat.needsUpdate = true;
        }
      }
    });
  }, [outlineThickness, shadeToony, shadeShift]);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const canvasSnapshot = canvasObjRef.current;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const computeEffectiveDpr = () => {
      if (isSoftwareGl) return 0.85;
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      if (stateRef.current.lowEndMobileMode) {
        return Math.max(0.65, Math.min(dpr, Math.min(stateRef.current.resolutionScale, 0.85)));
      }
      return Math.max(0.65, Math.min(dpr, stateRef.current.resolutionScale));
    };

    // Transparent WebGL canvas over static hardware-composited CSS studio backdrop
    // Eliminates 100% of 1024x1024 3D backdrop plane overdraw and per-pixel FogExp2 math!
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: true,
      stencil: false,
      depth: true,
      preserveDrawingBuffer: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(computeEffectiveDpr());
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = false;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    canvasSnapshot.renderer = renderer;

    const scene = new THREE.Scene();
    canvasSnapshot.scene = scene;

    const camera = new THREE.PerspectiveCamera(
      stateRef.current.customFov || 26,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      20
    );
    camera.position.copy(stateRef.current.idealCamPos);
    canvasSnapshot.camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(stateRef.current.idealTarget);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 0.7;
    controls.maxDistance = 3.4;
    controls.minPolarAngle = Math.PI * 0.28;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.update();

    let isOrbitDragging = false;
    controls.addEventListener('start', () => {
      isOrbitDragging = true;
      stateRef.current.cameraTransitionActive = false;
    });
    controls.addEventListener('end', () => {
      isOrbitDragging = false;
    });

    // Ultra-lightweight directional studio lighting (No shadow maps, no expensive SpotLight cone math)
    const hemiLight = new THREE.HemisphereLight(
      0xfff8f0,
      0x1e2238,
      stateRef.current.hemiLightIntensity
    );
    hemiLight.position.set(0, 3.2, 0);
    scene.add(hemiLight);
    canvasSnapshot.hemiLight = hemiLight;

    const keyLight = new THREE.DirectionalLight(0xfff9f2, stateRef.current.keyLightIntensity);
    keyLight.position.set(1.0, 2.2, 1.8);
    keyLight.castShadow = false;
    scene.add(keyLight);
    canvasSnapshot.keyLight = keyLight;

    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.62);
    fillLight.position.set(-1.4, 1.6, 1.4);
    fillLight.visible = !stateRef.current.lowEndMobileMode;
    scene.add(fillLight);
    canvasSnapshot.fillLight = fillLight;

    const rimLight = new THREE.DirectionalLight(0x38bdf8, stateRef.current.rimLightIntensity);
    rimLight.position.set(-1.1, 2.1, -1.5);
    rimLight.visible = !stateRef.current.lowEndMobileMode;
    scene.add(rimLight);
    canvasSnapshot.rimLight = rimLight;

    // Ultra-low-poly unlit stage pedestal (MeshBasicMaterial = 0 PBR shader overhead, hidden in Low-End Mobile Mode)
    const stageGroup = new THREE.Group();
    stageGroup.visible = !stateRef.current.lowEndMobileMode;

    const outerPlinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.84, 0.9, 0.05, 24),
      new THREE.MeshBasicMaterial({color: 0x0d1526})
    );
    outerPlinth.position.y = -0.025;
    stageGroup.add(outerPlinth);

    const ringMat = new THREE.MeshBasicMaterial({color: 0x38bdf8});
    const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.76, 0.785, 32), ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.003;
    stageGroup.add(ringMesh);

    scene.add(stageGroup);
    canvasSnapshot.stageGroup = stageGroup;
    canvasSnapshot.ringMat = ringMat;

    // Simplified proxy collision meshes on Layer 1 for fast raycasting
    const proxyMat = new THREE.MeshBasicMaterial({visible: false});
    const headProxy = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), proxyMat);
    headProxy.position.set(0, 1.38, 0);
    headProxy.layers.set(1);
    headProxy.name = 'head';
    scene.add(headProxy);

    const bodyProxy = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.65, 8), proxyMat);
    bodyProxy.position.set(0, 0.95, 0);
    bodyProxy.layers.set(1);
    bodyProxy.name = 'body';
    scene.add(bodyProxy);
    canvasSnapshot.interactionProxies = {headProxy, bodyProxy};

    _raycaster.layers.set(1);

    // Cache bounding rect to avoid synchronous DOM reflow on pointermove
    let cachedRect = container.getBoundingClientRect();
    let pointerDownPos = {x: 0, y: 0};
    let pointerTargetX = 0;
    let pointerTargetY = 0;

    const onPointerMove = (e: PointerEvent) => {
      if (stateRef.current.lowEndMobileMode) return;
      const w = cachedRect.width || 1;
      const h = cachedRect.height || 1;
      const nx = ((e.clientX - cachedRect.left) / w) * 2 - 1;
      const ny = -((e.clientY - cachedRect.top) / h) * 2 + 1;
      pointerTargetX = THREE.MathUtils.clamp(nx * 0.42, -0.42, 0.42);
      pointerTargetY = THREE.MathUtils.clamp(ny * 0.26, -0.24, 0.24);
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = {x: e.clientX, y: e.clientY};
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 8) return;
      const w = cachedRect.width || 1;
      const h = cachedRect.height || 1;
      _pointerNdc.x = ((e.clientX - cachedRect.left) / w) * 2 - 1;
      _pointerNdc.y = -((e.clientY - cachedRect.top) / h) * 2 + 1;
      _raycaster.setFromCamera(_pointerNdc, camera);
      const hits = _raycaster.intersectObjects([headProxy, bodyProxy], false);
      if (hits.length > 0) {
        const hitName = hits[0].object.name === 'head' ? 'head' : 'body';
        callbacksRef.current.onAvatarTapped(hitName);
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove, {passive: true});
    renderer.domElement.addEventListener('pointerdown', onPointerDown, {passive: true});
    renderer.domElement.addEventListener('pointerup', onPointerUp, {passive: true});

    const onResize = () => {
      if (!container) return;
      cachedRect = container.getBoundingClientRect();
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(computeEffectiveDpr());
      computeResponsiveFraming(
        boneHeightsRef.current.headY,
        boneHeightsRef.current.chestY,
        stateRef.current.cameraView
      );
    };
    window.addEventListener('resize', onResize, {passive: true});

    const clock = new THREE.Clock();
    let elapsedTime = 0;
    let blinkTimer = 2.2;
    let blinkWeight = 0;
    let blinkProgress = 0;
    let blinkDuration = 0.18;
    let isBlinking = false;
    let isTabVisible = true;

    const onVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible) {
        clock.start();
        frameId = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const currentExpressions: Record<AvatarEmotion, number> = {
      happy: 0.18,
      relaxed: 0,
      surprised: 0,
      sad: 0,
      angry: 0,
      neutral: 0,
    };
    const emoKeys: AvatarEmotion[] = [
      'happy',
      'relaxed',
      'surprised',
      'sad',
      'angry',
      'neutral',
    ];

    const smoothedVowels = {aa: 0, ih: 0, ou: 0, ee: 0, oh: 0};
    let smoothLookX = 0;
    let smoothLookY = 0;
    let speechDamp = 0;

    let frameCount = 0;
    let fpsAccum = 0;
    let lastReportedFps = 60;
    let frameLimiterAccum = 0;
    let lastRingHex = 0x38bdf8;

    let frameId = 0;
    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (!isTabVisible) return;
      const rawDelta = clock.getDelta();

      // Optional 30 FPS thermal/battery frame cap for low-end mobile devices
      if (stateRef.current.fpsCap === 30 && !isSoftwareGl) {
        frameLimiterAccum += rawDelta;
        if (frameLimiterAccum < 0.031) {
          frameId = requestAnimationFrame(tick);
          return;
        }
      }
      const stepDelta = stateRef.current.fpsCap === 30 ? frameLimiterAccum : rawDelta;
      frameLimiterAccum = 0;

      const delta = Math.min(stepDelta, 0.05);
      elapsedTime += delta;

      frameCount++;
      fpsAccum += stepDelta;
      if (fpsAccum >= 1.25) {
        const currentFps = Math.min(120, Math.round(frameCount / fpsAccum));
        if (Math.abs(currentFps - lastReportedFps) >= 2) {
          lastReportedFps = currentFps;
          callbacksRef.current.onFpsUpdate(currentFps);
        }
        frameCount = 0;
        fpsAccum = 0;
      }

      const isBoy = stateRef.current.gender === 'boy';
      callbacksRef.current.onSampleAudio();
      const lip = lipSyncRef.current;
      speechDamp = THREE.MathUtils.damp(speechDamp, lip.isSpeaking ? 1.0 : 0.0, 5, delta);

      if (!stateRef.current.lowEndMobileMode) {
        const nextRingHex = stateRef.current.isListening
          ? 0x10b981
          : isBoy
          ? 0x38bdf8
          : 0xf43f5e;
        if (nextRingHex !== lastRingHex) {
          lastRingHex = nextRingHex;
          ringMat.color.setHex(nextRingHex);
        }
      }

      if (stateRef.current.cameraTransitionActive) {
        _targetCamPos.copy(stateRef.current.idealCamPos);
        _targetLookAt.copy(stateRef.current.idealTarget);

        camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetCamPos.x, 5, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetCamPos.y, 5, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetCamPos.z, 5, delta);

        controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetLookAt.x, 6, delta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetLookAt.y, 6, delta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetLookAt.z, 6, delta);

        if (
          camera.position.distanceToSquared(_targetCamPos) < 0.0004 &&
          controls.target.distanceToSquared(_targetLookAt) < 0.0004
        ) {
          stateRef.current.cameraTransitionActive = false;
        }
        controls.update();
      } else if (isOrbitDragging) {
        controls.update();
      }

      const vrm = canvasSnapshot.vrm;
      if (vrm) {
        const bones = canvasSnapshot.cachedBones;
        const expr = vrm.expressionManager;
        const s = vrmSignRef.current;

        if (stateRef.current.gestureTimer > 0) {
          stateRef.current.gestureTimer -= delta;
          if (stateRef.current.gestureTimer <= 0) {
            stateRef.current.activeGesture = 'idle';
          }
        } else {
          stateRef.current.activeGesture = stateRef.current.isThinking ? 'think' : 'idle';
        }

        const activeGesture = stateRef.current.activeGesture;
        const breath = Math.sin(elapsedTime * 1.65);
        const slowSway = Math.sin(elapsedTime * 0.95);
        const subSway = Math.cos(elapsedTime * 0.65);

        const microLookX = Math.sin(elapsedTime * 0.55) * 0.05;
        const microLookY = Math.cos(elapsedTime * 0.42) * 0.035;
        smoothLookX = THREE.MathUtils.damp(smoothLookX, pointerTargetX + microLookX, 6, delta);
        smoothLookY = THREE.MathUtils.damp(smoothLookY, pointerTargetY + microLookY, 6, delta);

        if (bones) {
          const {
            hips,
            spine,
            chest,
            upperChest,
            neck,
            head,
            leftEye,
            rightEye,
            leftShoulder,
            rightShoulder,
            leftUpperArm,
            rightUpperArm,
            leftLowerArm,
            rightLowerArm,
            leftHand,
            rightHand,
          } = bones;

          const swayAmp = isBoy ? 0.016 : 0.026;
          if (hips) {
            hips.rotation.z = THREE.MathUtils.damp(hips.rotation.z, slowSway * swayAmp, 5, delta);
            hips.rotation.y = THREE.MathUtils.damp(hips.rotation.y, subSway * 0.028, 5, delta);
          }

          if (spine) {
            const targetSpineX =
              activeGesture === 'bow'
                ? s * 0.32
                : activeGesture === 'think'
                ? s * 0.03
                : s * breath * 0.014;
            spine.rotation.x = THREE.MathUtils.damp(spine.rotation.x, targetSpineX, 5, delta);
            spine.rotation.z = THREE.MathUtils.damp(
              spine.rotation.z,
              -slowSway * (swayAmp * 0.6),
              5,
              delta
            );
          }

          if (chest) {
            const chestX = s * (breath * 0.02 + speechDamp * Math.sin(elapsedTime * 2.8) * 0.018);
            chest.rotation.x = THREE.MathUtils.damp(chest.rotation.x, chestX, 5, delta);
            chest.rotation.y = THREE.MathUtils.damp(chest.rotation.y, -subSway * 0.018, 5, delta);
          }

          if (upperChest) {
            upperChest.rotation.x = THREE.MathUtils.damp(
              upperChest.rotation.x,
              s * breath * 0.012,
              5,
              delta
            );
          }

          if (neck && head) {
            let headTargetX = s * (-smoothLookY * 0.25 + breath * 0.012);
            let headTargetY = s * (smoothLookX * 0.4);
            let headTargetZ = slowSway * (isBoy ? 0.018 : 0.035);

            if (stateRef.current.isListening) {
              headTargetZ = isBoy ? 0.07 : 0.11;
              headTargetX = s * 0.05;
            } else if (activeGesture === 'nod') {
              headTargetX = s * Math.sin(elapsedTime * 7.5) * 0.12;
            } else if (activeGesture === 'think') {
              headTargetZ = isBoy ? 0.08 : -0.12;
              headTargetY = s * (isBoy ? -0.09 : 0.13);
              headTargetX = s * 0.07;
            } else if (speechDamp > 0.05) {
              headTargetX += s * Math.sin(elapsedTime * 3.2) * 0.045 * speechDamp;
              headTargetY += s * Math.sin(elapsedTime * 1.8) * 0.038 * speechDamp;
              headTargetZ += Math.cos(elapsedTime * 1.4) * 0.03 * speechDamp;
            }

            neck.rotation.x = THREE.MathUtils.damp(neck.rotation.x, headTargetX * 0.4, 6, delta);
            neck.rotation.y = THREE.MathUtils.damp(neck.rotation.y, headTargetY * 0.4, 6, delta);
            neck.rotation.z = THREE.MathUtils.damp(neck.rotation.z, headTargetZ * 0.4, 6, delta);

            head.rotation.x = THREE.MathUtils.damp(head.rotation.x, headTargetX * 0.6, 7, delta);
            head.rotation.y = THREE.MathUtils.damp(head.rotation.y, headTargetY * 0.6, 7, delta);
            head.rotation.z = THREE.MathUtils.damp(head.rotation.z, headTargetZ * 0.6, 7, delta);
          }

          if (leftEye && rightEye) {
            let eyeY = s * smoothLookX * 0.12;
            let eyeX = s * -smoothLookY * 0.08;

            if (activeGesture === 'think') {
              eyeX = -s * 0.08;
              eyeY = s * (isBoy ? -0.06 : 0.08);
            }

            leftEye.rotation.y = THREE.MathUtils.damp(leftEye.rotation.y, eyeY, 10, delta);
            leftEye.rotation.x = THREE.MathUtils.damp(leftEye.rotation.x, eyeX, 10, delta);
            rightEye.rotation.y = THREE.MathUtils.damp(rightEye.rotation.y, eyeY, 10, delta);
            rightEye.rotation.x = THREE.MathUtils.damp(rightEye.rotation.x, eyeX, 10, delta);
          }

          if (leftShoulder && rightShoulder) {
            leftShoulder.rotation.z = THREE.MathUtils.damp(
              leftShoulder.rotation.z,
              s * (0.05 + breath * 0.012),
              5,
              delta
            );
            rightShoulder.rotation.z = THREE.MathUtils.damp(
              rightShoulder.rotation.z,
              -s * (0.05 + breath * 0.012),
              5,
              delta
            );
          }

          if (leftUpperArm && rightUpperArm && leftLowerArm && rightLowerArm) {
            const downAngle = isBoy ? 1.24 : 1.28;
            const breathArm = breath * 0.018 + slowSway * 0.012;

            let lUpperX = s * 0.08;
            let lUpperZ = s * (downAngle + breathArm);
            let lLowerY = -0.24;
            let lLowerZ = s * 0.12;

            let rUpperX = s * 0.08;
            let rUpperZ = -s * (downAngle - breathArm);
            let rLowerY = 0.24;
            let rLowerZ = -s * 0.12;
            let rHandZ = 0;
            let lHandZ = 0;

            if (activeGesture === 'wave') {
              rUpperX = s * 0.35;
              rUpperZ = -s * 0.65;
              rLowerY = 0.35;
              rLowerZ = -s * (-1.05 + Math.sin(elapsedTime * 9.5) * 0.18);
              rHandZ = Math.sin(elapsedTime * 9.5) * 0.2;
            } else if (activeGesture === 'cheer') {
              lUpperX = s * 0.28;
              lUpperZ = s * 1.02;
              lLowerY = -0.72 - Math.sin(elapsedTime * 7.5) * 0.1;
              lLowerZ = s * 0.22;

              rUpperX = s * 0.28;
              rUpperZ = -s * 1.02;
              rLowerY = 0.72 + Math.sin(elapsedTime * 7.5) * 0.1;
              rLowerZ = -s * 0.22;
            } else if (activeGesture === 'think') {
              rUpperX = s * 0.36;
              rUpperZ = -s * 1.02;
              rLowerY = 0.92;
              rLowerZ = -s * 0.38;
              rHandZ = -0.12;

              lUpperX = s * 0.12;
              lUpperZ = s * 1.22;
              lLowerY = -0.32;
              lLowerZ = s * 0.14;
            } else if (speechDamp > 0.02) {
              const talkHarmonic = Math.sin(elapsedTime * 2.2);
              const talkHarmonic2 = Math.cos(elapsedTime * 1.7);

              rUpperX = s * (0.12 + 0.14 * speechDamp);
              rUpperZ = -s * (downAngle - 0.22 * speechDamp + talkHarmonic * 0.07 * speechDamp);
              rLowerY = 0.24 + 0.42 * speechDamp + talkHarmonic * 0.12 * speechDamp;
              rLowerZ = -s * (0.12 + 0.14 * speechDamp);
              rHandZ = talkHarmonic * 0.1 * speechDamp;

              lUpperX = s * (0.08 + 0.06 * speechDamp);
              lUpperZ = s * (downAngle - 0.06 * speechDamp + talkHarmonic2 * 0.04 * speechDamp);
              lLowerY = -0.24 - 0.16 * speechDamp;
              lLowerZ = s * (0.12 + 0.06 * speechDamp);
            }

            leftUpperArm.rotation.x = THREE.MathUtils.damp(leftUpperArm.rotation.x, lUpperX, 6, delta);
            leftUpperArm.rotation.z = THREE.MathUtils.damp(leftUpperArm.rotation.z, lUpperZ, 6, delta);
            leftLowerArm.rotation.y = THREE.MathUtils.damp(leftLowerArm.rotation.y, lLowerY, 6, delta);
            leftLowerArm.rotation.z = THREE.MathUtils.damp(leftLowerArm.rotation.z, lLowerZ, 6, delta);

            rightUpperArm.rotation.x = THREE.MathUtils.damp(rightUpperArm.rotation.x, rUpperX, 6, delta);
            rightUpperArm.rotation.z = THREE.MathUtils.damp(rightUpperArm.rotation.z, rUpperZ, 6, delta);
            rightLowerArm.rotation.y = THREE.MathUtils.damp(rightLowerArm.rotation.y, rLowerY, 6, delta);
            rightLowerArm.rotation.z = THREE.MathUtils.damp(rightLowerArm.rotation.z, rLowerZ, 6, delta);

            if (rightHand) {
              rightHand.rotation.z = THREE.MathUtils.damp(rightHand.rotation.z, rHandZ, 8, delta);
            }
            if (leftHand) {
              leftHand.rotation.z = THREE.MathUtils.damp(leftHand.rotation.z, lHandZ, 8, delta);
            }
          }
        }

        // Autonomous Natural Organic Eye Blinking
        blinkTimer -= delta;
        if (blinkTimer <= 0 && !isBlinking) {
          isBlinking = true;
          blinkProgress = 0;
          blinkDuration = 0.17 + Math.random() * 0.05;
        }
        if (isBlinking) {
          blinkProgress += delta / blinkDuration;
          if (blinkProgress >= 1.0) {
            isBlinking = false;
            blinkWeight = 0;
            const isDouble = Math.random() < 0.18;
            blinkTimer = isDouble ? 0.25 : 2.6 + Math.random() * 3.0;
          } else if (blinkProgress < 0.35) {
            const p = blinkProgress / 0.35;
            blinkWeight = p * p;
          } else {
            const p = (blinkProgress - 0.35) / 0.65;
            blinkWeight = Math.pow(1 - p, 3);
          }
        } else if (blinkWeight > 0) {
          blinkWeight = Math.max(0, blinkWeight - delta * 10);
        }

        // Facial Expressions & Smooth 5-Vowel Lip Sync
        if (expr) {
          const targetEmo = stateRef.current.emotion;
          for (let i = 0; i < emoKeys.length; i++) {
            const key = emoKeys[i];
            const isTarget = key === targetEmo;
            let targetWeight = 0;
            if (isTarget) {
              if (speechDamp > 0.08) {
                targetWeight = key === 'happy' ? 0.18 : 0.14;
              } else {
                targetWeight = key === 'happy' ? 0.72 : key === 'relaxed' ? 0.65 : 0.70;
              }
            }
            currentExpressions[key] = THREE.MathUtils.damp(
              currentExpressions[key],
              targetWeight,
              8,
              delta
            );
            if (key !== 'neutral') {
              expr.setValue(key, currentExpressions[key]);
            }
          }

          if (targetEmo === 'neutral') {
            const subtleRelaxed = THREE.MathUtils.damp(0, 0.14, 5, delta);
            expr.setValue('relaxed', subtleRelaxed);
          }

          const effectiveBlink = currentExpressions.happy > 0.5 ? 0 : blinkWeight;
          expr.setValue('blink', effectiveBlink);

          smoothedVowels.aa = THREE.MathUtils.damp(smoothedVowels.aa, lip.aa, 26, delta);
          smoothedVowels.ih = THREE.MathUtils.damp(smoothedVowels.ih, lip.ih, 26, delta);
          smoothedVowels.ou = THREE.MathUtils.damp(smoothedVowels.ou, lip.ou, 26, delta);
          smoothedVowels.ee = THREE.MathUtils.damp(smoothedVowels.ee, lip.ee, 26, delta);
          smoothedVowels.oh = THREE.MathUtils.damp(smoothedVowels.oh, lip.oh, 26, delta);

          expr.setValue('aa', smoothedVowels.aa);
          expr.setValue('ih', smoothedVowels.ih);
          expr.setValue('ou', smoothedVowels.ou);
          expr.setValue('ee', smoothedVowels.ee);
          expr.setValue('oh', smoothedVowels.oh);
        }

        // Bypass SpringBone joint traversal completely when physics is disabled or in Low-End Mobile Mode
        if (
          stateRef.current.springPhysicsEnabled &&
          !stateRef.current.lowEndMobileMode &&
          stateRef.current.qualityTier !== 'low'
        ) {
          vrm.update(delta);
        } else {
          vrm.humanoid?.update();
          vrm.expressionManager?.update();
        }
      }

      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      if (canvasSnapshot.vrm) {
        VRMUtils.deepDispose(canvasSnapshot.vrm.scene);
      }
      renderer.dispose();
    };
  }, [lipSyncRef]);

  // Load VRM Model when modelUrl changes (Girl or Boy) — 100% Untouched Model Quality
  useEffect(() => {
    let cancelled = false;

    async function loadAvatar() {
      const scene = canvasObjRef.current.scene;
      const renderer = canvasObjRef.current.renderer;
      if (!scene || !renderer) return;

      try {
        callbacksRef.current.onLoadProgress(5, false);
        const arrayBuffer = await fetchVrmWithCache(modelUrl, (pct, fromCache) => {
          if (!cancelled) {
            callbacksRef.current.onLoadProgress(pct, fromCache);
          }
        });

        if (cancelled) return;

        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));

        const gltf = await new Promise<{scene: THREE.Group; userData: {vrm?: VRM}}>(
          (resolve, reject) => {
            loader.parse(
              arrayBuffer,
              '',
              (parsed) => resolve(parsed as unknown as {scene: THREE.Group; userData: {vrm?: VRM}}),
              (err) => reject(err)
            );
          }
        );

        if (cancelled) return;

        const vrm = gltf.userData.vrm;
        if (!vrm) {
          throw new Error('Selected file does not contain valid VRM avatar data.');
        }

        if (canvasObjRef.current.vrm) {
          scene.remove(canvasObjRef.current.vrm.scene);
          VRMUtils.deepDispose(canvasObjRef.current.vrm.scene);
          canvasObjRef.current.vrm = null;
          canvasObjRef.current.cachedBones = null;
        }

        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(vrm);

        const isVrm0 = vrm.meta?.metaVersion === '0';
        const s = isVrm0 ? 1 : -1;
        vrmSignRef.current = s;

        const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

        vrm.scene.traverse((obj) => {
          obj.frustumCulled = false;
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
              if (!mat) continue;
              const rec = mat as unknown as Record<string, unknown>;

              if ('outlineWidthMode' in rec) {
                rec.outlineWidthFactor = stateRef.current.outlineThickness;
              }
              if ('shadeToony' in rec) {
                rec.shadeToony = stateRef.current.shadeToony;
              }
              if ('shadeShift' in rec) {
                rec.shadeShift = stateRef.current.shadeShift;
              }

              for (const val of Object.values(rec)) {
                if (val && (val as THREE.Texture).isTexture) {
                  const tex = val as THREE.Texture;
                  tex.colorSpace = THREE.SRGBColorSpace;
                  tex.anisotropy = maxAnisotropy;
                  tex.generateMipmaps = true;
                  tex.minFilter = THREE.LinearMipmapLinearFilter;
                  tex.magFilter = THREE.LinearFilter;
                  tex.needsUpdate = true;
                }
              }
              mat.needsUpdate = true;
            }
          }
        });

        // Cache all 16 humanoid bone nodes once on load to eliminate per-frame string/map lookups
        const h = vrm.humanoid;
        const cachedBones: CachedHumanoidBones = {
          hips: h?.getNormalizedBoneNode('hips') ?? null,
          spine: h?.getNormalizedBoneNode('spine') ?? null,
          chest: h?.getNormalizedBoneNode('chest') ?? null,
          upperChest: h?.getNormalizedBoneNode('upperChest') ?? null,
          neck: h?.getNormalizedBoneNode('neck') ?? null,
          head: h?.getNormalizedBoneNode('head') ?? null,
          leftEye: h?.getNormalizedBoneNode('leftEye') ?? null,
          rightEye: h?.getNormalizedBoneNode('rightEye') ?? null,
          leftShoulder: h?.getNormalizedBoneNode('leftShoulder') ?? null,
          rightShoulder: h?.getNormalizedBoneNode('rightShoulder') ?? null,
          leftUpperArm: h?.getNormalizedBoneNode('leftUpperArm') ?? null,
          rightUpperArm: h?.getNormalizedBoneNode('rightUpperArm') ?? null,
          leftLowerArm: h?.getNormalizedBoneNode('leftLowerArm') ?? null,
          rightLowerArm: h?.getNormalizedBoneNode('rightLowerArm') ?? null,
          leftHand: h?.getNormalizedBoneNode('leftHand') ?? null,
          rightHand: h?.getNormalizedBoneNode('rightHand') ?? null,
        };
        canvasObjRef.current.cachedBones = cachedBones;

        const {leftUpperArm: lUpper, rightUpperArm: rUpper, leftLowerArm: lLower, rightLowerArm: rLower} =
          cachedBones;

        if (lUpper && rUpper && lLower && rLower) {
          lUpper.rotation.set(s * 0.08, 0, s * 1.28);
          rUpper.rotation.set(s * 0.08, 0, -s * 1.28);
          lLower.rotation.set(0, -0.26, s * 0.14);
          rLower.rotation.set(0, 0.26, -s * 0.14);
        }

        const fingerBones = [
          'leftIndexProximal',
          'leftIndexIntermediate',
          'leftMiddleProximal',
          'leftMiddleIntermediate',
          'leftRingProximal',
          'leftRingIntermediate',
          'leftLittleProximal',
          'leftLittleIntermediate',
          'rightIndexProximal',
          'rightIndexIntermediate',
          'rightMiddleProximal',
          'rightMiddleIntermediate',
          'rightRingProximal',
          'rightRingIntermediate',
          'rightLittleProximal',
          'rightLittleIntermediate',
        ] as const;

        for (const boneName of fingerBones) {
          const b = vrm.humanoid?.getNormalizedBoneNode(boneName);
          if (b) {
            const isLeft = boneName.startsWith('left');
            b.rotation.z = (isLeft ? s : -s) * 0.18;
          }
        }

        scene.add(vrm.scene);
        vrm.humanoid?.update();
        vrm.scene.updateMatrixWorld(true);

        const headNode = cachedBones.head;
        const chestNode = cachedBones.chest;
        let headY = 1.38;
        let chestY = 1.12;

        if (headNode) {
          headNode.getWorldPosition(_headWorld);
          if (_headWorld.y > 0.5) headY = _headWorld.y;
        }
        if (chestNode) {
          chestNode.getWorldPosition(_chestWorld);
          if (_chestWorld.y > 0.4) chestY = _chestWorld.y;
        } else {
          chestY = headY - 0.26;
        }

        boneHeightsRef.current = {headY, chestY};

        if (canvasObjRef.current.interactionProxies) {
          canvasObjRef.current.interactionProxies.headProxy.position.y = headY + 0.04;
          canvasObjRef.current.interactionProxies.bodyProxy.position.y = chestY - 0.1;
        }

        computeResponsiveFraming(headY, chestY, stateRef.current.cameraView);
        stateRef.current.activeGesture = 'idle';
        stateRef.current.gestureTimer = 0;
        canvasObjRef.current.vrm = vrm;

        try {
          if (canvasObjRef.current.camera) {
            renderer.compile(scene, canvasObjRef.current.camera);
          }
        } catch {
          // Ignore shader pre-compile warnings
        }

        callbacksRef.current.onLoadComplete();
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load VRM model';
          callbacksRef.current.onLoadError(msg);
        }
      }
    }

    void loadAvatar();

    return () => {
      cancelled = true;
    };
  }, [modelUrl]);

  return (
    <div
      ref={canvasMountRef}
      className={`relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing ${
        lowEndMobileMode
          ? 'bg-[#070B14]'
          : 'bg-[radial-gradient(circle_at_50%_38%,#192544_0%,#0c1326_52%,#05070f_100%)]'
      }`}
      aria-label="Interactive 3D VRM Avatar Viewport"
    />
  );
}

export default React.memo(VrmAvatarCanvas);

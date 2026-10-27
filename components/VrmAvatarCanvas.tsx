'use client';

import React, {useEffect, useRef} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
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
  cameraView: CameraViewMode;
  emotion: AvatarEmotion;
  gesture: AvatarGesture;
  isListening: boolean;
  isThinking: boolean;
  lipSyncRef: React.MutableRefObject<LipSyncWeights>;
  onSampleAudio: () => void;
  onLoadProgress: (percent: number, fromCache: boolean) => void;
  onLoadComplete: () => void;
  onLoadError: (err: string) => void;
  onFpsUpdate: (fps: number) => void;
  onAvatarTapped: (zone: 'head' | 'body') => void;
}

// Pre-allocated math helpers at module scope to prevent GC in the render loop
const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _headWorld = new THREE.Vector3();
const _chestWorld = new THREE.Vector3();
const _pointerNdc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _dummy = new THREE.Object3D();
const _bgColorTarget = new THREE.Color();
const _accentColorTarget = new THREE.Color();

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 120);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.28)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStudioBackdropTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(256, 210, 30, 256, 256, 320);
  grad.addColorStop(0, '#1a2238');
  grad.addColorStop(0.55, '#0d1322');
  grad.addColorStop(1, '#060911');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function VrmAvatarCanvas({
  gender,
  modelUrl,
  qualityTier,
  springPhysicsEnabled,
  cameraView,
  emotion,
  gesture,
  isListening,
  isThinking,
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
    cameraView,
    emotion,
    gesture,
    isListening,
    isThinking,
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

    // Model-aware golden ratio framing:
    // Positioning is calculated so the head and hair sit with plenty of clearance below
    // top status buttons and UI, avoiding any overlap on both mobile and desktop!
    if (viewMode === 'close') {
      const lookY = headY + (isPortraitMobile ? 0.05 : 0.02);
      stateRef.current.idealTarget.set(0, lookY, 0);
      stateRef.current.idealCamPos.set(
        0,
        lookY + 0.02,
        isPortraitMobile ? (isBoy ? 1.26 : 1.16) : (isBoy ? 1.10 : 1.02)
      );
    } else if (viewMode === 'full') {
      const lookY = headY * 0.52 + (isPortraitMobile ? 0.08 : 0.02);
      stateRef.current.idealTarget.set(0, lookY, 0);
      stateRef.current.idealCamPos.set(
        0,
        lookY + 0.04,
        isPortraitMobile ? (isBoy ? 3.10 : 2.85) : (isBoy ? 2.65 : 2.45)
      );
    } else {
      // 'upper' (default waist-to-head portrait view)
      // Aiming slightly higher and pulling back gives a generous 25-30% empty space
      // above the hair, so the character's head never overlays top header buttons!
      const lookY = isPortraitMobile
        ? (isBoy ? headY + 0.04 : headY + 0.03)
        : (isBoy ? headY - 0.04 : headY - 0.03);
      stateRef.current.idealTarget.set(0, lookY, 0);
      stateRef.current.idealCamPos.set(
        0,
        lookY + 0.02,
        isPortraitMobile ? (isBoy ? 1.62 : 1.50) : (isBoy ? 1.42 : 1.32)
      );
    }
    stateRef.current.cameraTransitionActive = true;
  };

  useEffect(() => {
    const prevGesture = stateRef.current.gesture;
    const prevView = stateRef.current.cameraView;
    stateRef.current.gender = gender;
    stateRef.current.qualityTier = qualityTier;
    stateRef.current.springPhysicsEnabled = springPhysicsEnabled;
    stateRef.current.cameraView = cameraView;
    stateRef.current.emotion = emotion;
    stateRef.current.gesture = gesture;
    stateRef.current.isListening = isListening;
    stateRef.current.isThinking = isThinking;

    if (prevGesture !== gesture && gesture !== 'idle') {
      stateRef.current.activeGesture = gesture;
      stateRef.current.gestureTimer = 2.4;
    }
    if (prevView !== cameraView) {
      computeResponsiveFraming(
        boneHeightsRef.current.headY,
        boneHeightsRef.current.chestY,
        cameraView
      );
    }
  }, [
    gender,
    qualityTier,
    springPhysicsEnabled,
    cameraView,
    emotion,
    gesture,
    isListening,
    isThinking,
  ]);

  const vrmRef = useRef<VRM | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const interactionProxiesRef = useRef<{headProxy: THREE.Mesh; bodyProxy: THREE.Mesh} | null>(
    null
  );

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const getPixelRatioForTier = (tier: QualityTier) => {
      if (isSoftwareGl) return 1;
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      if (tier === 'low') return 1.0; // Strictly 1.0 on low-end phones for maximum FPS
      if (tier === 'medium') return Math.min(dpr, 1.35);
      return Math.min(dpr, 1.85);
    };

    const initTier = stateRef.current.qualityTier;
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl && initTier !== 'low',
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      depth: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.setPixelRatio(getPixelRatioForTier(initTier));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = false;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d18);
    const fog = new THREE.FogExp2(0x090d18, 0.09);
    scene.fog = fog;
    sceneRef.current = scene;

    // Mandatory Studio Environment Reflection (RoomEnvironment + PMREMGenerator)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      26,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      30
    );
    camera.position.copy(stateRef.current.idealCamPos);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(stateRef.current.idealTarget);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 0.7;
    controls.maxDistance = 3.4;
    controls.minPolarAngle = Math.PI * 0.28;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.update();

    controls.addEventListener('start', () => {
      stateRef.current.cameraTransitionActive = false;
    });

    // Balanced 3-Point Portrait Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0xf8fafc, 0x1e1b4b, 0.92);
    hemiLight.position.set(0, 3, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.35);
    keyLight.position.set(1.2, 2.2, 2.0);
    keyLight.castShadow = !isSoftwareGl && initTier === 'high';
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 6;
    const d = 1.2;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.55);
    fillLight.position.set(-1.5, 1.6, 1.4);
    scene.add(fillLight);

    const rimLight = new THREE.SpotLight(0xf43f5e, 1.8, 6, Math.PI / 3, 0.65, 1.2);
    rimLight.position.set(-1.1, 2.1, -1.5);
    scene.add(rimLight);

    // Studio Curved Backdrop Wall
    const backdropTex = createStudioBackdropTexture();
    backdropTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const backdropMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 5.5),
      new THREE.MeshBasicMaterial({
        map: backdropTex,
        depthWrite: false,
      })
    );
    backdropMesh.position.set(0, 1.4, -2.2);
    scene.add(backdropMesh);

    // Composite 4-Part Luxury Studio Stage Pedestal (THREE.Group)
    const stageGroup = new THREE.Group();

    const outerPlinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.86, 0.94, 0.06, 64),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.85,
        roughness: 0.2,
      })
    );
    outerPlinth.position.y = -0.03;
    outerPlinth.receiveShadow = true;
    stageGroup.add(outerPlinth);

    const innerDeck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.77, 0.02, 64),
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.25,
        roughness: 0.62,
      })
    );
    innerDeck.position.y = 0.002;
    innerDeck.receiveShadow = true;
    stageGroup.add(innerDeck);

    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xf43f5e,
      emissiveIntensity: 0.9,
      metalness: 0.5,
      roughness: 0.2,
    });
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.011, 16, 96), ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.013;
    stageGroup.add(ringMesh);

    const shadowTex = createContactShadowTexture();
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.95),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.62,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.015;
    stageGroup.add(shadowPlane);

    scene.add(stageGroup);

    // Floating Studio Bokeh Orbs (InstancedMesh)
    const particleCount = 32;
    const particleGeo = new THREE.SphereGeometry(0.014, 8, 8);
    const particleMat = new THREE.MeshBasicMaterial({
      color: 0xfda4af,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const particlesMesh = new THREE.InstancedMesh(particleGeo, particleMat, particleCount);
    particlesMesh.frustumCulled = false;

    const particleSeeds = Array.from({length: particleCount}, (_, i) => ({
      angle: (i / particleCount) * Math.PI * 2,
      radius: 0.65 + (i % 5) * 0.24,
      baseY: 0.25 + ((i * 0.17) % 1.65),
      speed: 0.22 + (i % 4) * 0.08,
      scale: 0.6 + (i % 3) * 0.35,
    }));

    scene.add(particlesMesh);

    // Simplified proxy collision meshes on Layer 1 for fast raycasting
    const proxyMat = new THREE.MeshBasicMaterial({visible: false});
    const headProxy = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), proxyMat);
    headProxy.position.set(0, 1.38, 0);
    headProxy.layers.set(1);
    headProxy.name = 'head';
    scene.add(headProxy);

    const bodyProxy = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.65, 12), proxyMat);
    bodyProxy.position.set(0, 0.95, 0);
    bodyProxy.layers.set(1);
    bodyProxy.name = 'body';
    scene.add(bodyProxy);
    interactionProxiesRef.current = {headProxy, bodyProxy};

    _raycaster.layers.set(1);

    let pointerDownPos = {x: 0, y: 0};
    let pointerTargetX = 0;
    let pointerTargetY = 0;

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerTargetX = THREE.MathUtils.clamp(nx * 0.42, -0.42, 0.42);
      pointerTargetY = THREE.MathUtils.clamp(ny * 0.26, -0.24, 0.24);
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = {x: e.clientX, y: e.clientY};
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 8) return;
      const rect = renderer.domElement.getBoundingClientRect();
      _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
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
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(getPixelRatioForTier(stateRef.current.qualityTier));
      computeResponsiveFraming(
        boneHeightsRef.current.headY,
        boneHeightsRef.current.chestY,
        stateRef.current.cameraView
      );
    };
    window.addEventListener('resize', onResize);

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

    const smoothedVowels = {aa: 0, ih: 0, ou: 0, ee: 0, oh: 0};
    let smoothLookX = 0;
    let smoothLookY = 0;
    let speechDamp = 0;

    let frameCount = 0;
    let fpsAccum = 0;
    let appliedTier: QualityTier = initTier;

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
      const delta = Math.min(rawDelta, 0.05);
      elapsedTime += delta;

      frameCount++;
      fpsAccum += rawDelta;
      if (fpsAccum >= 0.75) {
        const currentFps = Math.min(120, Math.round(frameCount / fpsAccum));
        callbacksRef.current.onFpsUpdate(currentFps);
        frameCount = 0;
        fpsAccum = 0;
      }

      const desiredTier = stateRef.current.qualityTier;
      if (desiredTier !== appliedTier) {
        appliedTier = desiredTier;
        renderer.setPixelRatio(getPixelRatioForTier(appliedTier));
        particlesMesh.visible = appliedTier !== 'low';
      }

      const isBoy = stateRef.current.gender === 'boy';
      const accentHex = isBoy ? 0x38bdf8 : 0xf43f5e;
      const bgHex = isBoy ? 0x070d19 : 0x0b0d18;

      _bgColorTarget.setHex(bgHex);
      _accentColorTarget.setHex(accentHex);

      if (scene.background instanceof THREE.Color) {
        scene.background.lerp(_bgColorTarget, delta * 4);
      }
      fog.color.lerp(_bgColorTarget, delta * 4);
      rimLight.color.lerp(_accentColorTarget, delta * 4);
      particleMat.color.lerp(_accentColorTarget, delta * 4);

      if (particlesMesh.visible) {
        for (let i = 0; i < particleCount; i++) {
          const p = particleSeeds[i];
          const a = p.angle + elapsedTime * p.speed;
          const y = p.baseY + Math.sin(elapsedTime * 0.8 + i) * 0.08;
          _dummy.position.set(Math.cos(a) * p.radius, y, Math.sin(a) * p.radius - 0.15);
          _dummy.scale.setScalar(p.scale);
          _dummy.updateMatrix();
          particlesMesh.setMatrixAt(i, _dummy.matrix);
        }
        particlesMesh.instanceMatrix.needsUpdate = true;
      }

      callbacksRef.current.onSampleAudio();
      const lip = lipSyncRef.current;
      speechDamp = THREE.MathUtils.damp(speechDamp, lip.isSpeaking ? 1.0 : 0.0, 5, delta);

      if (stateRef.current.isListening) {
        ringMat.color.setHex(0x10b981);
        ringMat.emissive.setHex(0x10b981);
        ringMat.emissiveIntensity = 1.0 + Math.sin(elapsedTime * 7) * 0.4;
      } else if (lip.isSpeaking) {
        ringMat.color.setHex(accentHex);
        ringMat.emissive.setHex(accentHex);
        ringMat.emissiveIntensity = 0.75 + speechDamp * 0.6;
      } else {
        ringMat.color.setHex(accentHex);
        ringMat.emissive.setHex(accentHex);
        ringMat.emissiveIntensity = 0.65;
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
      }
      controls.update();

      const vrm = vrmRef.current;
      if (vrm) {
        const humanoid = vrm.humanoid;
        const expr = vrm.expressionManager;
        // s = +1 for VRM 0.x (Girl / Pretty girly), -1 for VRM 1.0 (Boy / Silas)
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
        // Natural 3.8s breathing cycle
        const breath = Math.sin(elapsedTime * 1.65);
        const slowSway = Math.sin(elapsedTime * 0.95);
        const subSway = Math.cos(elapsedTime * 0.65);

        // Subtle autonomous eye/head micro-saccade + pointer tracking
        const microLookX = Math.sin(elapsedTime * 0.55) * 0.05;
        const microLookY = Math.cos(elapsedTime * 0.42) * 0.035;
        smoothLookX = THREE.MathUtils.damp(smoothLookX, pointerTargetX + microLookX, 6, delta);
        smoothLookY = THREE.MathUtils.damp(smoothLookY, pointerTargetY + microLookY, 6, delta);

        if (humanoid) {
          const hips = humanoid.getNormalizedBoneNode('hips');
          const spine = humanoid.getNormalizedBoneNode('spine');
          const chest = humanoid.getNormalizedBoneNode('chest');
          const upperChest = humanoid.getNormalizedBoneNode('upperChest');
          const neck = humanoid.getNormalizedBoneNode('neck');
          const head = humanoid.getNormalizedBoneNode('head');
          const leftEye = humanoid.getNormalizedBoneNode('leftEye');
          const rightEye = humanoid.getNormalizedBoneNode('rightEye');
          const leftShoulder = humanoid.getNormalizedBoneNode('leftShoulder');
          const rightShoulder = humanoid.getNormalizedBoneNode('rightShoulder');
          const leftUpperArm = humanoid.getNormalizedBoneNode('leftUpperArm');
          const rightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm');
          const leftLowerArm = humanoid.getNormalizedBoneNode('leftLowerArm');
          const rightLowerArm = humanoid.getNormalizedBoneNode('rightLowerArm');
          const leftHand = humanoid.getNormalizedBoneNode('leftHand');
          const rightHand = humanoid.getNormalizedBoneNode('rightHand');

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
              // Expressive thoughtful head tilt
              headTargetZ = isBoy ? 0.08 : -0.12;
              headTargetY = s * (isBoy ? -0.09 : 0.13);
              headTargetX = s * 0.07;
            } else if (speechDamp > 0.05) {
              // Fluid harmonic speech cadence nodding without high-frequency volume twitches!
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
              // Thoughtful glance upwards
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

          // Arm & Forearm Pose System:
          // Inverted arm logic: VRM 0.x (Girl) uses s = +1, VRM 1.0 (Boy) uses s = -1
          if (leftUpperArm && rightUpperArm && leftLowerArm && rightLowerArm) {
            const downAngle = isBoy ? 1.24 : 1.28;
            const breathArm = breath * 0.018 + slowSway * 0.012;

            // Default IDLE: Arms softly down at waist, forearms angled gently in front of hips
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
              // Welcoming shoulder-height wave
              rUpperX = s * 0.35;
              rUpperZ = -s * 0.65;
              rLowerY = 0.35;
              rLowerZ = -s * (-1.05 + Math.sin(elapsedTime * 9.5) * 0.18);
              rHandZ = Math.sin(elapsedTime * 9.5) * 0.2;
            } else if (activeGesture === 'cheer') {
              // Enthusiastic chest-level gesture
              lUpperX = s * 0.28;
              lUpperZ = s * 1.02;
              lLowerY = -0.72 - Math.sin(elapsedTime * 7.5) * 0.1;
              lLowerZ = s * 0.22;

              rUpperX = s * 0.28;
              rUpperZ = -s * 1.02;
              rLowerY = 0.72 + Math.sin(elapsedTime * 7.5) * 0.1;
              rLowerZ = -s * 0.22;
            } else if (activeGesture === 'think') {
              // Thoughtful chin/collarbone pose: Right hand gracefully raised toward collarbone
              rUpperX = s * 0.36;
              rUpperZ = -s * 1.02;
              rLowerY = 0.92;
              rLowerZ = -s * 0.38;
              rHandZ = -0.12;

              // Left arm gently cradling near waist
              lUpperX = s * 0.12;
              lUpperZ = s * 1.22;
              lLowerY = -0.32;
              lLowerZ = s * 0.14;
            } else if (speechDamp > 0.02) {
              // Smooth conversational gesturing: fluid phrasing harmonic wave
              const talkHarmonic = Math.sin(elapsedTime * 2.2);
              const talkHarmonic2 = Math.cos(elapsedTime * 1.7);

              // Right hand opens gently in conversational gestures
              rUpperX = s * (0.12 + 0.14 * speechDamp);
              rUpperZ = -s * (downAngle - 0.22 * speechDamp + talkHarmonic * 0.07 * speechDamp);
              rLowerY = 0.24 + 0.42 * speechDamp + talkHarmonic * 0.12 * speechDamp;
              rLowerZ = -s * (0.12 + 0.14 * speechDamp);
              rHandZ = talkHarmonic * 0.1 * speechDamp;

              // Left hand provides conversational grounding
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

        // Autonomous Natural Organic Eye Blinking (Asymmetric: quadratic close, cubic ease-out open)
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
            // Occasional natural double-blink (18% chance)
            const isDouble = Math.random() < 0.18;
            blinkTimer = isDouble ? 0.25 : 2.6 + Math.random() * 3.0;
          } else {
            // Asymmetric biological blink curve: 35% closing, 65% opening
            if (blinkProgress < 0.35) {
              const p = blinkProgress / 0.35;
              blinkWeight = p * p;
            } else {
              const p = (blinkProgress - 0.35) / 0.65;
              blinkWeight = Math.pow(1 - p, 3);
            }
          }
        } else if (blinkWeight > 0) {
          blinkWeight = Math.max(0, blinkWeight - delta * 10);
        }

        // Facial Expressions & Smooth 5-Vowel Lip Sync
        if (expr) {
          const targetEmo = stateRef.current.emotion;
          const emoKeys: AvatarEmotion[] = [
            'happy',
            'relaxed',
            'surprised',
            'sad',
            'angry',
            'neutral',
          ];

          for (const key of emoKeys) {
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

          // In neutral state, add subtle hint of relaxed warmth so the avatar doesn't look blank
          if (targetEmo === 'neutral') {
            const subtleRelaxed = THREE.MathUtils.damp(0, 0.14, 5, delta);
            expr.setValue('relaxed', subtleRelaxed);
          }

          const effectiveBlink = currentExpressions.happy > 0.5 ? 0 : blinkWeight;
          expr.setValue('blink', effectiveBlink);

          // Silky smooth 5-vowel phoneme interpolation
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

        // If physics is disabled or on low tier, pass delta 0 to keep hair/cloth in resting position with zero CPU overhead
        const physicsDelta =
          stateRef.current.springPhysicsEnabled && stateRef.current.qualityTier !== 'low'
            ? delta
            : 0;
        vrm.update(physicsDelta);
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
      if (vrmRef.current) {
        VRMUtils.deepDispose(vrmRef.current.scene);
      }
      renderer.dispose();
    };
  }, [lipSyncRef]);

  // Load VRM Model when modelUrl changes (Girl or Boy)
  useEffect(() => {
    let cancelled = false;

    async function loadAvatar() {
      const scene = sceneRef.current;
      const renderer = rendererRef.current;
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

        if (vrmRef.current) {
          scene.remove(vrmRef.current.scene);
          VRMUtils.deepDispose(vrmRef.current.scene);
          vrmRef.current = null;
        }

        // CRITICAL: Do NOT call VRMUtils.removeUnnecessaryVertices - it corrupts MToon
        // vertex buffer indexes and outline normals on VRM 0.x models, creating black body marks!
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(vrm);

        // Determine VRM 0.x (+1) vs VRM 1.0 (-1) sign
        const isVrm0 = vrm.meta?.metaVersion === '0';
        const s = isVrm0 ? 1 : -1;
        vrmSignRef.current = s;

        const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

        vrm.scene.traverse((obj) => {
          obj.frustumCulled = false;
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            // Disable mesh shadows to completely eliminate toon shadow acne and black marks
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
              if (!mat) continue;
              const rec = mat as unknown as Record<string, unknown>;
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

        // Apply initial relaxed arms-down pose immediately before first render frame
        const lUpper = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
        const rUpper = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
        const lLower = vrm.humanoid?.getNormalizedBoneNode('leftLowerArm');
        const rLower = vrm.humanoid?.getNormalizedBoneNode('rightLowerArm');

        if (lUpper && rUpper && lLower && rLower) {
          lUpper.rotation.set(s * 0.08, 0, s * 1.28);
          rUpper.rotation.set(s * 0.08, 0, -s * 1.28);
          lLower.rotation.set(0, -0.26, s * 0.14);
          rLower.rotation.set(0, 0.26, -s * 0.14);
        }

        // Gently curl fingers inward toward palm
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

        // Measure actual head and chest height to frame both Girl and Boy models at eye level
        const headNode = vrm.humanoid?.getNormalizedBoneNode('head');
        const chestNode = vrm.humanoid?.getNormalizedBoneNode('chest');
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

        if (interactionProxiesRef.current) {
          interactionProxiesRef.current.headProxy.position.y = headY + 0.04;
          interactionProxiesRef.current.bodyProxy.position.y = chestY - 0.1;
        }

        computeResponsiveFraming(headY, chestY, stateRef.current.cameraView);
        stateRef.current.activeGesture = 'idle';
        stateRef.current.gestureTimer = 0;
        vrmRef.current = vrm;

        try {
          if (cameraRef.current) {
            renderer.compile(scene, cameraRef.current);
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
      className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
      aria-label="Interactive 3D VRM Avatar Viewport"
    />
  );
}

export default React.memo(VrmAvatarCanvas);

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Checks whether WebGL is supported on the current device/browser.
 */
export function isWebGLSupported() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    );
  } catch {
    return false;
  }
}

/**
 * Generates a soft circular glow texture in memory (replaces heavy bloom passes).
 */
function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.22, 'rgba(245, 248, 255, 0.72)');
  gradient.addColorStop(0.55, 'rgba(220, 230, 255, 0.16)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Generates a radial fade alpha map so the studio floor melts seamlessly into #050505.
 */
function createFloorFadeTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.45)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

/**
 * Generates a monochrome studio environment map (no external HDR download needed).
 */
function createStudioEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x040406);

  const panelGeo = new THREE.PlaneGeometry(1, 1);
  const disposalQueue = [panelGeo];

  const addLightPanel = (w, h, pos, rot, brightness) => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(brightness, brightness, brightness * 1.03),
      side: THREE.DoubleSide
    });
    disposalQueue.push(mat);
    const mesh = new THREE.Mesh(panelGeo, mat);
    mesh.scale.set(w, h, 1);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    envScene.add(mesh);
  };

  addLightPanel(10, 4, [0, 6.5, 1.5], [Math.PI / 2, 0, 0], 3.8);
  addLightPanel(4, 9, [-6.5, 1.5, -1.5], [0, Math.PI / 2.2, 0], 3.4);
  addLightPanel(5, 7, [6.5, 1, 2.5], [0, -Math.PI / 2.4, 0], 1.3);
  addLightPanel(8, 5, [0, -5.5, 2], [-Math.PI / 2, 0, 0], 0.45);

  const renderTarget = pmrem.fromScene(envScene, 0.04);

  for (const item of disposalQueue) item.dispose();
  pmrem.dispose();

  return renderTarget;
}

/**
 * Builds the procedural 3D robot, studio lighting, and animation loop.
 */
export function createRobotScene({ container, onProgress, onReady, reducedMotion = false }) {
  if (onProgress) onProgress(20);

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  const isLowPowerDevice = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

  const renderer = new THREE.WebGLRenderer({
    antialias: !isLowPowerDevice,
    alpha: true,
    powerPreference: 'high-performance'
  });

  const maxDPR = isLowPowerDevice ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDPR));
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = !isLowPowerDevice;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  container.appendChild(renderer.domElement);
  if (onProgress) onProgress(45);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 40);
  camera.position.set(0, 0.15, 6.4);

  const envTarget = createStudioEnvironment(renderer);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 1.15;

  // Lighting Setup
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x121216, 0.45);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(-3.2, 4.8, 4.2);
  if (!isLowPowerDevice) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 16;
    const d = 3.2;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
  }
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xeef2ff, 0.85);
  fillLight.position.set(4.5, 1.2, 2.5);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 3.6);
  rimLight.position.set(2.4, 3.8, -4.4);
  scene.add(rimLight);

  const faceGlowLight = new THREE.PointLight(0xffffff, 0.4, 2.6);
  faceGlowLight.position.set(0, 0.72, 1.0);
  scene.add(faceGlowLight);

  if (onProgress) onProgress(65);

  // Shared Materials
  const ceramicMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf4f4f6,
    roughness: 0.16,
    metalness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.07,
    reflectivity: 0.95
  });

  const darkTitaniumMaterial = new THREE.MeshStandardMaterial({
    color: 0x1b1b20,
    roughness: 0.36,
    metalness: 0.86
  });

  const matteTrimMaterial = new THREE.MeshStandardMaterial({
    color: 0x0c0c0f,
    roughness: 0.65,
    metalness: 0.45
  });

  const visorBackplateMaterial = new THREE.MeshStandardMaterial({
    color: 0x030305,
    roughness: 0.28,
    metalness: 0.2
  });

  const visorGlassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x060609,
    roughness: 0.04,
    metalness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    transparent: true,
    opacity: 0.22,
    depthWrite: false
  });

  const eyeCoreMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false
  });

  const glowTexture = createGlowTexture();
  const eyeHaloMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffffff,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const coreHaloMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffffff,
    transparent: true,
    opacity: 0.52,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const trackedGeometries = [];
  const trackGeo = (geo) => {
    trackedGeometries.push(geo);
    return geo;
  };

  // =========================================================
  // BUILD ROBOT HIERARCHY
  // =========================================================
  const stageGroup = new THREE.Group();
  scene.add(stageGroup);

  const robotRoot = new THREE.Group();
  stageGroup.add(robotRoot);

  const bodyPivot = new THREE.Group();
  robotRoot.add(bodyPivot);

  // --- TORSO ASSEMBLY ---
  const torsoGroup = new THREE.Group();
  bodyPivot.add(torsoGroup);

  const chestGeo = trackGeo(new RoundedBoxGeometry(1.02, 0.88, 0.7, 5, 0.24));
  const chestMesh = new THREE.Mesh(chestGeo, ceramicMaterial);
  chestMesh.position.set(0, -0.14, 0);
  chestMesh.castShadow = true;
  chestMesh.receiveShadow = true;
  torsoGroup.add(chestMesh);

  const collarGeo = trackGeo(new RoundedBoxGeometry(1.08, 0.15, 0.62, 4, 0.06));
  const collarMesh = new THREE.Mesh(collarGeo, darkTitaniumMaterial);
  collarMesh.position.set(0, 0.23, 0);
  collarMesh.castShadow = true;
  torsoGroup.add(collarMesh);

  const abdomenGeo = trackGeo(new THREE.CylinderGeometry(0.35, 0.21, 0.34, 32));
  const abdomenMesh = new THREE.Mesh(abdomenGeo, matteTrimMaterial);
  abdomenMesh.position.set(0, -0.64, 0);
  abdomenMesh.castShadow = true;
  torsoGroup.add(abdomenMesh);

  const thrusterRingGeo = trackGeo(new THREE.TorusGeometry(0.16, 0.015, 12, 32));
  const thrusterRing = new THREE.Mesh(thrusterRingGeo, eyeCoreMaterial);
  thrusterRing.rotation.x = Math.PI / 2;
  thrusterRing.position.set(0, -0.8, 0);
  torsoGroup.add(thrusterRing);

  // Chest Core Reactor
  const coreHousingGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 32));
  const coreHousing = new THREE.Mesh(coreHousingGeo, matteTrimMaterial);
  coreHousing.rotation.x = Math.PI / 2;
  coreHousing.position.set(0, -0.06, 0.34);
  torsoGroup.add(coreHousing);

  const coreBezelGeo = trackGeo(new THREE.TorusGeometry(0.13, 0.014, 12, 32));
  const coreBezel = new THREE.Mesh(coreBezelGeo, darkTitaniumMaterial);
  coreBezel.position.set(0, -0.06, 0.37);
  torsoGroup.add(coreBezel);

  const coreOrbGeo = trackGeo(new THREE.SphereGeometry(0.055, 24, 24));
  const coreOrb = new THREE.Mesh(coreOrbGeo, eyeCoreMaterial);
  coreOrb.position.set(0, -0.06, 0.36);
  torsoGroup.add(coreOrb);

  const coreHalo = new THREE.Sprite(coreHaloMaterial);
  coreHalo.position.set(0, -0.06, 0.39);
  coreHalo.scale.set(0.45, 0.45, 1);
  torsoGroup.add(coreHalo);

  // --- FLOATING ARTICULATED ARMS ---
  const shoulderGeo = trackGeo(new THREE.SphereGeometry(0.125, 24, 24));
  const upperArmGeo = trackGeo(new THREE.CapsuleGeometry(0.105, 0.3, 10, 20));
  const wristRingGeo = trackGeo(new THREE.TorusGeometry(0.085, 0.012, 10, 24));
  const forearmGeo = trackGeo(new THREE.CapsuleGeometry(0.082, 0.2, 10, 20));

  const createArm = (side) => {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.68, 0.12, 0);

    const shoulder = new THREE.Mesh(shoulderGeo, darkTitaniumMaterial);
    shoulder.castShadow = true;
    armPivot.add(shoulder);

    const upperArm = new THREE.Mesh(upperArmGeo, ceramicMaterial);
    upperArm.position.set(side * 0.06, -0.26, 0.02);
    upperArm.rotation.z = side * 0.14;
    upperArm.castShadow = true;
    armPivot.add(upperArm);

    const wristRing = new THREE.Mesh(wristRingGeo, darkTitaniumMaterial);
    wristRing.rotation.x = Math.PI / 2;
    wristRing.position.set(side * 0.1, -0.49, 0.05);
    armPivot.add(wristRing);

    const forearm = new THREE.Mesh(forearmGeo, ceramicMaterial);
    forearm.position.set(side * 0.1, -0.68, 0.1);
    forearm.rotation.x = -0.22;
    forearm.castShadow = true;
    armPivot.add(forearm);

    bodyPivot.add(armPivot);
    return armPivot;
  };

  const leftArm = createArm(-1);
  const rightArm = createArm(1);

  // --- NECK ASSEMBLY ---
  const neckGroup = new THREE.Group();
  bodyPivot.add(neckGroup);

  const neckColumnGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.17, 0.22, 24));
  const neckColumn = new THREE.Mesh(neckColumnGeo, matteTrimMaterial);
  neckColumn.position.set(0, 0.36, 0);
  neckGroup.add(neckColumn);

  const neckRingGeo = trackGeo(new THREE.TorusGeometry(0.19, 0.032, 14, 32));
  const neckRingLower = new THREE.Mesh(neckRingGeo, darkTitaniumMaterial);
  neckRingLower.rotation.x = Math.PI / 2;
  neckRingLower.position.set(0, 0.34, 0);
  neckGroup.add(neckRingLower);

  const neckRingUpper = new THREE.Mesh(neckRingGeo, darkTitaniumMaterial);
  neckRingUpper.rotation.x = Math.PI / 2;
  neckRingUpper.position.set(0, 0.44, 0);
  neckGroup.add(neckRingUpper);

  // --- HEAD ASSEMBLY ---
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.86, 0);
  bodyPivot.add(headPivot);

  const craniumGeo = trackGeo(new RoundedBoxGeometry(1.18, 0.86, 0.92, 6, 0.28));
  const cranium = new THREE.Mesh(craniumGeo, ceramicMaterial);
  cranium.castShadow = true;
  cranium.receiveShadow = true;
  headPivot.add(cranium);

  const crownStripGeo = trackGeo(new RoundedBoxGeometry(0.1, 0.875, 0.935, 3, 0.03));
  const crownStrip = new THREE.Mesh(crownStripGeo, darkTitaniumMaterial);
  crownStrip.position.set(0, 0.01, -0.02);
  headPivot.add(crownStrip);

  const earRingGeo = trackGeo(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 32));
  const earCapGeo = trackGeo(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 32));
  const earAccentGeo = trackGeo(new THREE.TorusGeometry(0.145, 0.008, 10, 32));

  [-1, 1].forEach((side) => {
    const earGroup = new THREE.Group();
    earGroup.position.set(side * 0.59, 0.0, -0.02);

    const earRing = new THREE.Mesh(earRingGeo, darkTitaniumMaterial);
    earRing.rotation.z = Math.PI / 2;
    earGroup.add(earRing);

    const earCap = new THREE.Mesh(earCapGeo, ceramicMaterial);
    earCap.rotation.z = Math.PI / 2;
    earGroup.add(earCap);

    const earAccent = new THREE.Mesh(earAccentGeo, eyeCoreMaterial);
    earAccent.rotation.y = Math.PI / 2;
    earAccent.position.x = side * 0.048;
    earGroup.add(earAccent);

    headPivot.add(earGroup);
  });

  const antennaStemGeo = trackGeo(new THREE.CylinderGeometry(0.012, 0.02, 0.34, 12));
  const antennaStem = new THREE.Mesh(antennaStemGeo, darkTitaniumMaterial);
  antennaStem.position.set(0.62, 0.26, -0.04);
  headPivot.add(antennaStem);

  const antennaTipGeo = trackGeo(new THREE.SphereGeometry(0.024, 14, 14));
  const antennaTip = new THREE.Mesh(antennaTipGeo, eyeCoreMaterial);
  antennaTip.position.set(0.62, 0.44, -0.04);
  headPivot.add(antennaTip);

  // Visor Frame & Dual-Layer Optical Glass
  const visorBezelGeo = trackGeo(new RoundedBoxGeometry(0.96, 0.56, 0.14, 5, 0.15));
  const visorBezel = new THREE.Mesh(visorBezelGeo, darkTitaniumMaterial);
  visorBezel.position.set(0, -0.01, 0.4);
  headPivot.add(visorBezel);

  const visorBackGeo = trackGeo(new RoundedBoxGeometry(0.87, 0.47, 0.08, 4, 0.13));
  const visorBack = new THREE.Mesh(visorBackGeo, visorBackplateMaterial);
  visorBack.position.set(0, -0.01, 0.435);
  visorBack.renderOrder = 1;
  headPivot.add(visorBack);

  const visorGlassGeo = trackGeo(new RoundedBoxGeometry(0.89, 0.49, 0.09, 5, 0.14));
  const visorGlass = new THREE.Mesh(visorGlassGeo, visorGlassMaterial);
  visorGlass.position.set(0, -0.01, 0.455);
  visorGlass.renderOrder = 4;
  headPivot.add(visorGlass);

  // Eyes Group
  const eyesGroup = new THREE.Group();
  eyesGroup.position.set(0, -0.01, 0.476);
  headPivot.add(eyesGroup);

  const eyeGeo = trackGeo(new THREE.CapsuleGeometry(0.046, 0.06, 8, 16));

  const createEye = (offsetX) => {
    const eyePivot = new THREE.Group();
    eyePivot.position.set(offsetX, 0, 0);

    const eyeMesh = new THREE.Mesh(eyeGeo, eyeCoreMaterial);
    eyeMesh.renderOrder = 2;
    eyePivot.add(eyeMesh);

    const eyeHalo = new THREE.Sprite(eyeHaloMaterial);
    eyeHalo.scale.set(0.36, 0.42, 1);
    eyeHalo.position.z = 0.01;
    eyeHalo.renderOrder = 3;
    eyePivot.add(eyeHalo);

    eyesGroup.add(eyePivot);
    return eyePivot;
  };

  const leftEye = createEye(-0.185);
  const rightEye = createEye(0.185);

  // --- STUDIO FLOOR ---
  const floorFadeTexture = createFloorFadeTexture();
  const floorGeo = trackGeo(new THREE.CircleGeometry(3.2, 48));
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x0b0b0e,
    roughness: 0.42,
    metalness: 0.55,
    alphaMap: floorFadeTexture,
    transparent: true,
    opacity: 0.85
  });

  const floorMesh = new THREE.Mesh(floorGeo, floorMaterial);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(0, -1.36, 0);
  floorMesh.receiveShadow = true;
  stageGroup.add(floorMesh);

  if (onProgress) onProgress(90);

  // =========================================================
  // RESPONSIVE FRAMING & REACTION STATES
  // =========================================================
  const state = {
    paused: false,
    disposed: false,
    targetPointer: { x: 0, y: 0 },
    smoothHeadPointer: { x: 0, y: 0 },
    smoothEyePointer: { x: 0, y: 0 },
    smoothBodyPointer: { x: 0, y: 0 },
    hoveringRobot: false,
    hoverEnergy: 0,
    curiousButton: false,
    curiousEnergy: 0,
    scrollSection: 'hero',
    baseStagePos: new THREE.Vector3(1.38, 0.04, 0),
    targetStagePos: new THREE.Vector3(1.38, 0.04, 0),
    baseStageRotY: -0.22,
    targetStageRotY: -0.22,
    baseScale: 1,
    targetScale: 1,
    blinkTimer: 2.8,
    blinkValue: 1,
    isBlinking: false,
    glanceTimer: 4.5,
    glanceOffset: { x: 0, y: 0 },
    waveActive: false,
    waveProgress: 0,
    currentWaveZ: 0,
    currentWaveX: 0,
    jumpActive: false,
    jumpProgress: 0,
    spinEnergy: 0,
    nodEnergy: 0,
    idleDuration: 0,
    standbyBlend: 0,
    lastFrameTime: performance.now()
  };

  const computeLayoutTargets = () => {
    const w = container.clientWidth || window.innerWidth;
    const isMobile = w < 960;

    if (isMobile) {
      camera.position.set(0, 0.1, 7.6);
      state.baseStagePos.set(0, 0.82, 0);
      state.baseStageRotY = 0;
      state.baseScale = 0.88;
    } else {
      camera.position.set(0, 0.15, 6.4);
      state.baseStagePos.set(1.38, 0.05, 0);
      state.baseStageRotY = -0.22;
      state.baseScale = 1.0;
    }
    updateSectionTarget();
  };

  const updateSectionTarget = () => {
    const w = container.clientWidth || window.innerWidth;
    const isMobile = w < 960;

    if (state.scrollSection === 'hero') {
      state.targetStagePos.copy(state.baseStagePos);
      state.targetStageRotY = state.baseStageRotY;
      state.targetScale = state.baseScale;
    } else if (state.scrollSection === 'about') {
      state.targetStagePos.set(isMobile ? 0 : -1.55, isMobile ? 0.85 : -0.05, -1.2);
      state.targetStageRotY = isMobile ? 0.15 : 0.34;
      state.targetScale = state.baseScale * 0.84;
    } else if (state.scrollSection === 'architecture') {
      state.targetStagePos.set(isMobile ? 0 : 1.68, isMobile ? 0.8 : 0.12, -1.6);
      state.targetStageRotY = -0.45;
      state.targetScale = state.baseScale * 0.78;
    } else if (state.scrollSection === 'specs') {
      state.targetStagePos.set(0, isMobile ? 0.85 : 0.05, -2.0);
      state.targetStageRotY = 0;
      state.targetScale = state.baseScale * 0.74;
    } else {
      state.targetStagePos.set(0, isMobile ? 0.9 : 0.22, -1.4);
      state.targetStageRotY = 0;
      state.targetScale = state.baseScale * 0.82;
    }
  };

  computeLayoutTargets();
  stageGroup.position.copy(state.targetStagePos);
  stageGroup.rotation.y = state.targetStageRotY;
  stageGroup.scale.setScalar(state.targetScale);

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const interactiveMeshes = [cranium, visorGlass, chestMesh, leftArm, rightArm];

  const handleResize = () => {
    if (state.disposed) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDPR));
    renderer.setSize(w, h);
    computeLayoutTargets();
  };

  window.addEventListener('resize', handleResize);

  // =========================================================
  // ANIMATION LOOP
  // =========================================================
  let rafId = 0;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const smoothstep = (edge0, edge1, x) => {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  const animate = (now) => {
    if (state.disposed) return;
    rafId = requestAnimationFrame(animate);

    if (state.paused) {
      state.lastFrameTime = now;
      return;
    }

    const dt = Math.min((now - state.lastFrameTime) / 1000, 0.05);
    state.lastFrameTime = now;
    const elapsed = now * 0.001;
    const motionFactor = reducedMotion ? 0.15 : 1;

    // 1. Stage section glide
    const stageLerp = 1 - Math.exp(-4.5 * dt);
    stageGroup.position.lerp(state.targetStagePos, stageLerp);
    stageGroup.rotation.y = lerp(stageGroup.rotation.y, state.targetStageRotY, stageLerp);
    const nextScale = lerp(stageGroup.scale.x, state.targetScale, stageLerp);
    stageGroup.scale.setScalar(nextScale);

    // 2. Standby sleep after 11 seconds of inactivity
    state.idleDuration += dt;
    const isSleeping = state.idleDuration > 11 && !state.hoveringRobot && !state.curiousButton && !state.waveActive;
    state.standbyBlend = lerp(state.standbyBlend, isSleeping ? 1 : 0, 1 - Math.exp(-3 * dt));

    // 3. Random subtle glances when idle (before standby)
    state.glanceTimer -= dt;
    if (state.glanceTimer <= 0) {
      state.glanceTimer = 3.2 + Math.random() * 4.0;
      const isQuiet = Math.abs(state.targetPointer.x) < 0.08 && Math.abs(state.targetPointer.y) < 0.08;
      if (isQuiet && !reducedMotion && !isSleeping) {
        state.glanceOffset.x = (Math.random() - 0.5) * 0.35;
        state.glanceOffset.y = (Math.random() - 0.5) * 0.2;
      } else {
        state.glanceOffset.x = 0;
        state.glanceOffset.y = 0;
      }
    }

    const activeTrack = 1 - state.standbyBlend * 0.85;
    const goalX = clamp((state.targetPointer.x + state.glanceOffset.x) * activeTrack, -1, 1);
    const goalY = clamp((state.targetPointer.y + state.glanceOffset.y) * activeTrack - state.standbyBlend * 0.35, -1, 1);

    const eyeLerp = 1 - Math.exp(-14 * dt);
    const headLerp = 1 - Math.exp(-7.5 * dt);
    const bodyLerp = 1 - Math.exp(-4.2 * dt);

    state.smoothEyePointer.x = lerp(state.smoothEyePointer.x, goalX, eyeLerp);
    state.smoothEyePointer.y = lerp(state.smoothEyePointer.y, goalY, eyeLerp);
    state.smoothHeadPointer.x = lerp(state.smoothHeadPointer.x, goalX, headLerp);
    state.smoothHeadPointer.y = lerp(state.smoothHeadPointer.y, goalY, headLerp);
    state.smoothBodyPointer.x = lerp(state.smoothBodyPointer.x, goalX, bodyLerp);
    state.smoothBodyPointer.y = lerp(state.smoothBodyPointer.y, goalY, bodyLerp);

    // 4. Polished Smoothstep Wave & Buoyant Hop
    let targetWaveZ = 0;
    let targetWaveX = 0;
    let waveLift = 0;

    if (state.waveActive) {
      state.waveProgress += dt / 1.75;
      if (state.waveProgress >= 1) {
        state.waveActive = false;
        state.waveProgress = 0;
      } else if (!reducedMotion) {
        const p = state.waveProgress;
        const up = smoothstep(0, 0.24, p);
        const down = 1 - smoothstep(0.72, 1.0, p);
        waveLift = up * down;

        // 2 relaxed, fluid side-to-side waves while arm is raised
        const wavePhase = clamp((p - 0.18) / 0.58, 0, 1);
        const sway = Math.sin(wavePhase * Math.PI * 4) * 0.24 * waveLift;

        targetWaveZ = 2.02 * waveLift + sway;
        targetWaveX = -0.34 * waveLift;
      }
    }

    const waveBlendSpeed = 1 - Math.exp(-12 * dt);
    state.currentWaveZ = lerp(state.currentWaveZ, targetWaveZ, waveBlendSpeed);
    state.currentWaveX = lerp(state.currentWaveX, targetWaveX, waveBlendSpeed);

    let jumpOffset = 0;
    if (state.jumpActive) {
      state.jumpProgress += dt / 0.55;
      if (state.jumpProgress >= 1) {
        state.jumpActive = false;
        state.jumpProgress = 0;
      } else if (!reducedMotion) {
        jumpOffset = Math.sin(state.jumpProgress * Math.PI) * 0.13;
      }
    }

    // 5. Other Reaction Energies (Hover, Curious Tilt, Double-Click Spin, Section Nod)
    state.hoverEnergy = lerp(state.hoverEnergy, state.hoveringRobot ? 1 : 0, 1 - Math.exp(-8 * dt));
    state.curiousEnergy = lerp(state.curiousEnergy, state.curiousButton ? 1 : 0, 1 - Math.exp(-7 * dt));
    state.spinEnergy = Math.max(0, state.spinEnergy - dt * 0.85);
    state.nodEnergy = Math.max(0, state.nodEnergy - dt * 1.6);

    let spinAngle = 0;
    if (state.spinEnergy > 0 && !reducedMotion) {
      const progress = 1 - state.spinEnergy;
      const easedSpin = 1 - Math.pow(1 - progress, 3);
      spinAngle = easedSpin * Math.PI * 2;
    }

    const nodAngle = state.nodEnergy > 0 && !reducedMotion
      ? Math.sin((1 - state.nodEnergy) * Math.PI * 2) * 0.16 * state.nodEnergy
      : 0;

    // 6. Floating & Breathing
    const breathSpeed = 2.2 - state.standbyBlend * 0.7;
    const floatY = Math.sin(elapsed * 1.45) * 0.075 * motionFactor * (1 - state.standbyBlend * 0.45)
      - state.standbyBlend * 0.08
      + jumpOffset;
    const breathScale = 1 + Math.sin(elapsed * breathSpeed) * 0.012 * motionFactor;

    robotRoot.position.y = floatY;
    torsoGroup.scale.set(breathScale, 1, breathScale);

    // Body rotation (tracking + 360 spin)
    bodyPivot.rotation.y = state.smoothBodyPointer.x * 0.2 + spinAngle;
    bodyPivot.rotation.x = -state.smoothBodyPointer.y * 0.08;

    // Head rotation (tracking + friendly wave tilt + curious button tilt + section nod)
    headPivot.rotation.y = state.smoothHeadPointer.x * 0.46;
    headPivot.rotation.x = -state.smoothHeadPointer.y * 0.3 + Math.sin(elapsed * 0.9) * 0.02 * motionFactor + nodAngle;
    headPivot.rotation.z = -state.smoothHeadPointer.x * 0.06
      + (state.hoverEnergy * 0.05)
      + (state.curiousEnergy * 0.2)
      + (waveLift * 0.09);

    // Eyes move inside visor ahead of head
    eyesGroup.position.x = state.smoothEyePointer.x * 0.105;
    eyesGroup.position.y = -0.01 + state.smoothEyePointer.y * 0.055;

    // 7. Blinking & Standby Eyelids
    state.blinkTimer -= dt;
    if (state.blinkTimer <= 0 && !state.isBlinking && !isSleeping) {
      state.isBlinking = true;
      state.blinkTimer = 2.6 + Math.random() * 3.8;
    }

    const targetEyeHeight = (1 + state.hoverEnergy * 0.18 + waveLift * 0.16 + state.curiousEnergy * 0.1)
      * (1 - state.standbyBlend * 0.65);

    if (state.isBlinking) {
      state.blinkValue = lerp(state.blinkValue, 0.08, 1 - Math.exp(-32 * dt));
      if (state.blinkValue < 0.14) {
        state.isBlinking = false;
      }
    } else {
      state.blinkValue = lerp(state.blinkValue, targetEyeHeight, 1 - Math.exp(-16 * dt));
    }

    leftEye.scale.y = state.blinkValue;
    rightEye.scale.y = state.blinkValue;

    // Glow Intensities
    const standbyDim = 1 - state.standbyBlend * 0.48;
    const eyeGlow = (0.72 + state.hoverEnergy * 0.22 + waveLift * 0.2 + state.spinEnergy * 0.3 + Math.sin(elapsed * 2.2) * 0.05) * standbyDim;
    eyeHaloMaterial.opacity = clamp(eyeGlow, 0.25, 1);

    const coreGlow = (0.42 + Math.sin(elapsed * breathSpeed) * 0.14 + state.hoverEnergy * 0.2 + state.curiousEnergy * 0.22 + state.spinEnergy * 0.35 + waveLift * 0.15) * standbyDim;
    coreHaloMaterial.opacity = clamp(coreGlow, 0.2, 1);
    coreHalo.scale.setScalar(0.45 + state.spinEnergy * 0.22 + state.curiousEnergy * 0.08);
    faceGlowLight.intensity = (0.36 + state.hoverEnergy * 0.25 + waveLift * 0.28 + state.spinEnergy * 0.35) * standbyDim;

    // 8. Floating Arms & Polished Wave
    const armIdleSwing = Math.sin(elapsed * 1.45 + 0.6) * 0.04 * motionFactor;
    leftArm.position.y = 0.12 + armIdleSwing;
    leftArm.rotation.z = -0.04 + state.hoverEnergy * 0.05 - state.spinEnergy * 0.25;

    rightArm.position.y = 0.12 - armIdleSwing;
    rightArm.rotation.z = 0.04 - state.hoverEnergy * 0.05 + state.currentWaveZ + state.spinEnergy * 0.25;
    rightArm.rotation.x = state.currentWaveX;

    renderer.render(scene, camera);
  };

  if (onProgress) onProgress(100);
  if (onReady) onReady();
  rafId = requestAnimationFrame(animate);

  return {
    setTargetPointer(nx, ny) {
      const wasSleeping = state.idleDuration > 11;
      state.idleDuration = 0;
      if (wasSleeping) state.isBlinking = true;
      state.targetPointer.x = clamp(nx, -1, 1);
      state.targetPointer.y = clamp(ny, -1, 1);
    },
    setScrollSection(sectionName) {
      if (state.scrollSection !== sectionName) {
        state.scrollSection = sectionName;
        state.nodEnergy = 1;
        state.idleDuration = 0;
        updateSectionTarget();
      }
    },
    setHoveringRobot(hovering) {
      state.hoveringRobot = Boolean(hovering);
      if (hovering) state.idleDuration = 0;
    },
    setCuriousState(active) {
      state.curiousButton = Boolean(active);
      if (active) state.idleDuration = 0;
    },
    triggerClickReaction() {
      state.idleDuration = 0;
      if (!state.waveActive) {
        state.waveActive = true;
        state.waveProgress = 0;
      } else if (state.waveProgress > 0.55) {
        state.waveProgress = 0.22;
      }
      state.jumpActive = true;
      state.jumpProgress = 0;
      state.isBlinking = true;
    },
    triggerSpinReaction() {
      state.idleDuration = 0;
      state.spinEnergy = 1;
      state.jumpActive = true;
      state.jumpProgress = 0;
      state.isBlinking = true;
    },
    raycastRobot(ndcX, ndcY) {
      pointerNdc.set(ndcX, ndcY);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(interactiveMeshes, true);
      return hits.length > 0;
    },
    setPaused(paused) {
      state.paused = Boolean(paused);
    },
    dispose() {
      state.disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);

      for (const geo of trackedGeometries) geo.dispose();
      ceramicMaterial.dispose();
      darkTitaniumMaterial.dispose();
      matteTrimMaterial.dispose();
      visorBackplateMaterial.dispose();
      visorGlassMaterial.dispose();
      eyeCoreMaterial.dispose();
      eyeHaloMaterial.dispose();
      coreHaloMaterial.dispose();
      floorMaterial.dispose();
      glowTexture.dispose();
      floorFadeTexture.dispose();
      envTarget.dispose();

      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    }
  };
}

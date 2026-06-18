/* ===========================================================================
   ETERNAL ORBIT — Cinematic 3D Romantic Experience
   Three.js + GSAP + YouTube IFrame API (no build step — pure ES modules)
   ===========================================================================

   STRUCTURE
   0.  CONFIG
   1.  STATE
   2.  BOOT
   3.  RENDERER / SCENE / CAMERA / COMPOSER / CONTROLS
   4.  GALAXY  (starfield, spiral, nebula)
   5.  CRYSTAL CORE
   6.  MEMORY PHOTOS (holographic constellation)
   7.  PARTICLE SYSTEM (explosion / text / heart / nebula morph target generators)
   8.  CINEMATIC TIMELINE (Scenes 1 → 6 + seamless loop transition)
   9.  MUSIC (YouTube IFrame API)
   10. UI WIRING (tap-to-start, sound toggle, free-explore, replay)
   11. RENDER LOOP + RESIZE
   =========================================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* ===========================================================================
   0. CONFIG — swap the music link here, nothing else needs to change
   =========================================================================== */
const MUSIC_URL = "YOUTUBE_LINK_HERE"; // e.g. "https://www.youtube.com/watch?v=XXXXXXXXXXX"
const MUSIC_VOLUME = 40; // 0-100

const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 820;
const STAR_COUNT      = IS_MOBILE ? 5500  : 15000;
const GALAXY_COUNT    = IS_MOBILE ? 7000  : 18000;
const PARTICLE_COUNT  = IS_MOBILE ? 5000  : 12000;
const PHOTO_FILES     = Array.from({ length: 10 }, (_, i) => `images/img${i + 1}.jpg`);

/* ===========================================================================
   1. STATE
   =========================================================================== */
let renderer, scene, camera, composer, bloomPass, controls, clock;
let starField, galaxySpiral;
const nebulaSprites = [];
let crystal, crystalMaterial;
const photoMeshes = [];
let particleSystem, particlePositions;
let starTexture;
let curvePath;
const lookAtTarget = new THREE.Vector3(0, 0, 0);

let masterTimeline = null;
let freeExploreEnabled = false;
let hasLoopedOnce = false;

let ytPlayer = null;
let ytReady = false;
let musicMuted = false;

/* ===========================================================================
   2. BOOT
   =========================================================================== */
init();

function init() {
  setupRenderer();
  setupSceneAndCamera();
  setupComposer();
  setupControls();

  starTexture = makeGlowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.15)', 64);

  createStarfield();
  createGalaxySpiral();
  createNebula();
  createCrystal();
  createParticleSystem();

  loadPhotos().then(() => {
    buildCameraPath();
    buildMasterTimeline();
    bindUI();
    loadYouTubeAPI();
    animate();
  });

  window.addEventListener('resize', onResize);
}

/* ===========================================================================
   3. RENDERER / SCENE / CAMERA / COMPOSER / CONTROLS
   =========================================================================== */
function setupRenderer() {
  const canvas = document.getElementById('bg');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_MOBILE ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
}

function setupSceneAndCamera() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05021a, 0.00055);

  camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 5000);
  camera.position.set(0, 120, 2600);

  clock = new THREE.Clock();

  scene.add(new THREE.AmbientLight(0x6644ff, 0.45));
  const core = new THREE.PointLight(0xff79d6, 2.2, 1200, 2);
  core.position.set(0, 0, 0);
  scene.add(core);
}

function setupComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.3, 0.85, 0.15
  );
  composer.addPass(bloomPass);
}

function setupControls() {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 90;
  controls.maxDistance = 1500;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.25;
  controls.enabled = false; // turned on only once free-explore mode begins
}

/* ===========================================================================
   SHARED HELPER — soft radial-gradient sprite texture, reused everywhere
   (stars, nebula clouds, photo glow backing, particle points)
   =========================================================================== */
function makeGlowTexture(colorInner, colorOuter, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, colorInner);
  grad.addColorStop(0.45, colorOuter);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/* ===========================================================================
   4. GALAXY — starfield shell, spiral arms, nebula clouds
   =========================================================================== */
function createStarfield() {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const palette = [
    new THREE.Color('#ff9fe3'), new THREE.Color('#b48bff'),
    new THREE.Color('#8fc4ff'), new THREE.Color('#ffffff')
  ];

  for (let i = 0; i < STAR_COUNT; i++) {
    const r = 700 + Math.random() * 2800;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    const c = palette[(Math.random() * palette.length) | 0];
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 4.2, map: starTexture, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
  });

  starField = new THREE.Points(geo, mat);
  scene.add(starField);
}

function createGalaxySpiral() {
  const positions = new Float32Array(GALAXY_COUNT * 3);
  const colors = new Float32Array(GALAXY_COUNT * 3);
  const arms = 4;
  const colorCenter = new THREE.Color('#ffeaf9');
  const colorEdge = new THREE.Color('#7a3bff');

  for (let i = 0; i < GALAXY_COUNT; i++) {
    const armOffset = ((i % arms) / arms) * Math.PI * 2;
    const radius = Math.pow(Math.random(), 0.6) * 460;
    const spin = radius * 0.045;
    const angle = armOffset + spin + (Math.random() - 0.5) * 0.45;
    const spread = (1 - radius / 460) * 32 + 5;

    positions[i * 3] = Math.cos(angle) * radius + (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.6;
    positions[i * 3 + 2] = Math.sin(angle) * radius + (Math.random() - 0.5) * spread;

    const mixed = colorCenter.clone().lerp(colorEdge, radius / 460);
    colors[i * 3] = mixed.r; colors[i * 3 + 1] = mixed.g; colors[i * 3 + 2] = mixed.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 3.2, map: starTexture, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending
  });

  galaxySpiral = new THREE.Points(geo, mat);
  galaxySpiral.position.set(0, -40, -150);
  scene.add(galaxySpiral);
}

function createNebula() {
  const palette = ['rgba(255,110,210,0.55)', 'rgba(140,90,255,0.5)', 'rgba(90,160,255,0.45)'];
  for (let i = 0; i < 6; i++) {
    const tex = makeGlowTexture(palette[i % palette.length], 'rgba(40,10,60,0)', 256);
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85
    });
    const sprite = new THREE.Sprite(mat);
    const scale = 650 + Math.random() * 550;
    sprite.scale.set(scale, scale, 1);
    sprite.position.set(
      (Math.random() - 0.5) * 1600,
      (Math.random() - 0.5) * 650,
      (Math.random() - 0.5) * 1600 - 250
    );
    nebulaSprites.push(sprite);
    scene.add(sprite);
  }
}

/* ===========================================================================
   5. CRYSTAL CORE — the heart of the galaxy, a faceted glowing memory-crystal
   =========================================================================== */
function createCrystal() {
  const geo = new THREE.IcosahedronGeometry(26, 1);

  crystalMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      glowColor: { value: new THREE.Color('#ff8fe0') },
      glowColor2: { value: new THREE.Color('#9d6bff') },
      intensity: { value: 1.0 }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPos;
      void main(){
        vNormal = normalize(normalMatrix * normal);
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 glowColor;
      uniform vec3 glowColor2;
      uniform float intensity;
      varying vec3 vNormal;
      varying vec3 vPos;
      void main(){
        float fresnel = pow(1.0 - abs(vNormal.z), 2.4);
        vec3 base = mix(glowColor, glowColor2, sin(vPos.y * 0.09 + time) * 0.5 + 0.5);
        float pulse = 0.7 + 0.3 * sin(time * 2.0);
        vec3 col = base * pulse * intensity + fresnel * 0.7;
        gl_FragColor = vec4(col, 0.9);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  crystal = new THREE.Mesh(geo, crystalMaterial);
  crystal.position.set(0, 0, 0);

  const edges = new THREE.EdgesGeometry(geo);
  const wire = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })
  );
  crystal.add(wire);

  crystal.visible = false; // revealed in Scene 2
  scene.add(crystal);
}

/* ===========================================================================
   6. MEMORY PHOTOS — holographic constellation of img1..img10
   =========================================================================== */
function constellationPosition(i, total) {
  const angle = (i / total) * Math.PI * 2;
  const radius = 150 + (i % 3) * 42;
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    Math.sin(i * 1.7) * 75,
    Math.sin(angle) * radius
  );
}

function loadPhotos() {
  const loader = new THREE.TextureLoader();
  const jobs = PHOTO_FILES.map((src, i) => new Promise((resolve) => {
    loader.load(
      src,
      (tex) => resolve({ tex, i }),
      undefined,
      () => resolve({ tex: null, i }) // missing image won't break the experience
    );
  }));

  return Promise.all(jobs).then((results) => {
    results.forEach(({ tex, i }) => {
      if (!tex) return;
      tex.colorSpace = THREE.SRGBColorSpace;

      const aspect = (tex.image && tex.image.width) ? tex.image.width / tex.image.height : 1.5;
      const w = 34, h = w / aspect;

      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);

      const glowTex = makeGlowTexture('rgba(255,180,235,0.95)', 'rgba(130,80,255,0.25)', 128);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0
      }));
      glow.scale.set(w * 2.1, h * 2.1, 1);
      glow.position.z = -0.6;
      mesh.add(glow);

      const pos = constellationPosition(i, PHOTO_FILES.length);
      mesh.position.copy(pos);
      mesh.userData.basePosition = pos.clone();
      mesh.userData.glow = glow;

      photoMeshes[i] = mesh;
      scene.add(mesh);
    });
  });
}

function buildCameraPath() {
  const valid = photoMeshes.filter(Boolean);
  const pts = (valid.length ? valid : [{ position: new THREE.Vector3(0, 0, 200) }]).map((m) =>
    m.position.clone().multiplyScalar(1.55).add(new THREE.Vector3(
      (Math.random() - 0.5) * 35,
      18 + Math.random() * 35,
      (Math.random() - 0.5) * 35
    ))
  );
  curvePath = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
}

/* ===========================================================================
   7. PARTICLE SYSTEM — shared point cloud reused for explosion / text / heart
   =========================================================================== */
function createParticleSystem() {
  particlePositions = new Float32Array(PARTICLE_COUNT * 3); // starts collapsed at origin
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const palette = [new THREE.Color('#ffffff'), new THREE.Color('#ff8fe0'), new THREE.Color('#b48bff')];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const c = palette[i % palette.length];
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 3.6, map: starTexture, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0
  });

  particleSystem = new THREE.Points(geo, mat);
  scene.add(particleSystem);
}

/** Smoothly re-writes every particle position from its current spot to a new target array. */
function morphParticles(targetPositions, duration, opts = {}) {
  const startPositions = particlePositions.slice();
  const proxy = { p: 0 };
  return gsap.to(proxy, {
    p: 1,
    duration,
    ease: opts.ease || 'power2.inOut',
    onUpdate: () => {
      for (let i = 0; i < particlePositions.length; i++) {
        particlePositions[i] = startPositions[i] + (targetPositions[i] - startPositions[i]) * proxy.p;
      }
      particleSystem.geometry.attributes.position.needsUpdate = true;
    },
    onComplete: opts.onComplete
  });
}

function crystalSurfaceTargets() {
  const arr = new Float32Array(PARTICLE_COUNT * 3);
  const posAttr = crystal.geometry.attributes.position;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const vi = (Math.random() * posAttr.count) | 0;
    arr[i * 3] = posAttr.getX(vi);
    arr[i * 3 + 1] = posAttr.getY(vi);
    arr[i * 3 + 2] = posAttr.getZ(vi);
  }
  return arr;
}

function explosionTargets() {
  const arr = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const r = 60 + Math.random() * 460;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    arr[i * 3 + 2] = r * Math.cos(phi);
  }
  return arr;
}

function nebulaSwirlTargets() {
  const arr = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const r = 320 + Math.random() * 950;
    const theta = Math.random() * Math.PI * 2;
    arr[i * 3] = Math.cos(theta) * r + (Math.random() - 0.5) * 220;
    arr[i * 3 + 1] = (Math.random() - 0.5) * 320;
    arr[i * 3 + 2] = Math.sin(theta) * r - 200;
  }
  return arr;
}

/** Rasterizes a drawing onto an offscreen canvas and samples bright pixels as 3D points. */
function sampleCanvasPositions(drawFn, countNeeded, canvasSize = 480, worldScale = 3.0) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = canvasSize;
  const ctx = cv.getContext('2d');
  drawFn(ctx, canvasSize);

  const data = ctx.getImageData(0, 0, canvasSize, canvasSize).data;
  const candidates = [];
  for (let y = 0; y < canvasSize; y += 2) {
    for (let x = 0; x < canvasSize; x += 2) {
      const a = data[(y * canvasSize + x) * 4 + 3];
      if (a > 80) {
        candidates.push([(x - canvasSize / 2) * worldScale, -(y - canvasSize / 2) * worldScale]);
      }
    }
  }

  const result = new Float32Array(countNeeded * 3);
  for (let i = 0; i < countNeeded; i++) {
    const c = candidates.length ? candidates[(Math.random() * candidates.length) | 0] : [0, 0];
    result[i * 3] = c[0];
    result[i * 3 + 1] = c[1];
    result[i * 3 + 2] = (Math.random() - 0.5) * 10;
  }
  return result;
}

function textTargets() {
  return sampleCanvasPositions((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${size * 0.135}px "Cormorant Garamond", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('I LOVE YOU', size / 2, size / 2);
  }, PARTICLE_COUNT);
}

function heartTargets() {
  return sampleCanvasPositions((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#fff';
    ctx.translate(size / 2, size / 2);
    ctx.scale(size / 45, size / 45);
    ctx.beginPath();
    for (let t = 0; t <= Math.PI * 2 + 0.02; t += 0.01) {
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }, PARTICLE_COUNT, 480, 3.0);
}

function spawnShockwave() {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd6f7, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1, 3, 64), mat);
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);
  gsap.to(ring.scale, { x: 70, y: 70, z: 70, duration: 2.2, ease: 'power2.out' });
  gsap.to(mat, {
    opacity: 0, duration: 2.2,
    onComplete: () => { scene.remove(ring); ring.geometry.dispose(); mat.dispose(); }
  });
}

/* ===========================================================================
   8. CINEMATIC TIMELINE — Scenes 1 → 6 + seamless loop transition
   =========================================================================== */
function buildMasterTimeline() {
  const tl = gsap.timeline({
    paused: true,
    repeat: -1,
    onRepeat: () => {
      if (!hasLoopedOnce) {
        hasLoopedOnce = true;
        enableFreeExplore();
      }
    }
  });

  tl.add(scene1_GalaxyApproach(), 0);     // 0   - 9.5s
  tl.add(scene2_CrystalAwakens(), 9.5);   // 9.5 - 19s
  tl.add(scene3_MemoryFlight(), 19);      // 19  - 34s
  tl.add(scene4_Convergence(), 34);       // 34  - 41s
  tl.add(scene5_Shatter(), 41);           // 41  - 44s
  tl.add(scene6_LoveReveal(), 44);        // 44  - 56s
  tl.add(loopTransition(), 56);           // 56  - 64s -> seamlessly back to Scene 1

  masterTimeline = tl;
}

/* Scene 1 (0-10s) — camera drifts in from deep space toward the galaxy core */
function scene1_GalaxyApproach() {
  const tl = gsap.timeline();
  tl.add(() => {
    camera.position.set(0, 120, 2600);
    lookAtTarget.set(0, 0, 0);
    bloomPass.strength = 1.0;
  }, 0);
  tl.to(camera.position, { x: 0, y: 55, z: 850, duration: 9.5, ease: 'power2.inOut' }, 0);
  tl.to(bloomPass, { strength: 1.5, duration: 9.5 }, 0);
  return tl;
}

/* Scene 2 (10-20s) — the crystal core awakens, memories fade in one by one */
function scene2_CrystalAwakens() {
  const tl = gsap.timeline();
  tl.add(() => { crystal.visible = true; crystal.scale.setScalar(0.01); }, 0);
  tl.to(crystal.scale, { x: 1, y: 1, z: 1, duration: 2, ease: 'back.out(1.6)' }, 0);
  tl.to(crystalMaterial.uniforms.intensity, { value: 1.4, duration: 2 }, 0);
  tl.to(camera.position, { x: 0, y: 35, z: 260, duration: 9, ease: 'sine.inOut' }, 0);
  tl.to(lookAtTarget, { x: 0, y: 0, z: 0, duration: 9 }, 0);

  photoMeshes.forEach((m, i) => {
    if (!m) return;
    const t = 1 + i * 0.7;
    tl.to(m.material, { opacity: 0.88, duration: 1.3, ease: 'sine.out' }, t);
    tl.to(m.userData.glow.material, { opacity: 0.55, duration: 1.3 }, t);
    tl.fromTo(m.position, { y: m.userData.basePosition.y - 16 }, { y: m.userData.basePosition.y, duration: 1.6, ease: 'sine.out' }, t);
  });
  return tl;
}

/* Scene 3 (20-35s) — cinematic CatmullRom flight weaving through the memory constellation */
function scene3_MemoryFlight() {
  const tl = gsap.timeline();
  const proxy = { t: 0 };
  tl.to(proxy, {
    t: 1, duration: 15, ease: 'sine.inOut',
    onUpdate: () => {
      const p = curvePath.getPointAt(proxy.t);
      const look = curvePath.getPointAt(Math.min(proxy.t + 0.035, 1));
      camera.position.copy(p);
      lookAtTarget.copy(look);
    }
  }, 0);
  tl.to(bloomPass, { strength: 1.7, duration: 15 }, 0);
  return tl;
}

/* Scene 4 (35-42s) — memories are pulled into the crystal, energy builds, shockwave fires */
function scene4_Convergence() {
  const tl = gsap.timeline();
  photoMeshes.forEach((m, i) => {
    if (!m) return;
    const t = i * 0.16;
    tl.to(m.position, { x: 0, y: 0, z: 0, duration: 2.2, ease: 'power3.in' }, t);
    tl.to(m.scale, { x: 0.05, y: 0.05, z: 0.05, duration: 2.2, ease: 'power3.in' }, t);
    tl.to(m.material, { opacity: 0, duration: 1.8 }, t + 0.4);
    tl.to(m.userData.glow.material, { opacity: 0, duration: 1.8 }, t + 0.4);
  });
  tl.to(crystalMaterial.uniforms.intensity, { value: 3.4, duration: 6.5, ease: 'power2.in' }, 0);
  tl.to(crystal.scale, { x: 1.45, y: 1.45, z: 1.45, duration: 6.5, ease: 'power2.in' }, 0);
  tl.to(bloomPass, { strength: 2.6, duration: 6.5 }, 0);
  tl.add(spawnShockwave, 5.3);
  tl.to(camera.position, { z: '+=45', duration: 7, ease: 'sine.inOut' }, 0);
  return tl;
}

/* Scene 5 (42-45s) — the crystal shatters into pure light */
function scene5_Shatter() {
  const tl = gsap.timeline();
  tl.add(() => {
    particlePositions.set(crystalSurfaceTargets());
    particleSystem.geometry.attributes.position.needsUpdate = true;
    particleSystem.material.opacity = 1;
  }, 0);
  tl.to(crystalMaterial.uniforms.intensity, { value: 6, duration: 0.55, ease: 'power4.in' }, 0);
  tl.to(crystal.scale, { x: 2.3, y: 2.3, z: 2.3, duration: 0.55, ease: 'power4.in' }, 0);
  tl.add(() => { crystal.visible = false; }, 0.55);
  tl.add(() => morphParticles(explosionTargets(), 2.3, { ease: 'power3.out' }), 0.55);
  tl.to(bloomPass, { strength: 3.0, duration: 0.3 }, 0.55);
  tl.to(bloomPass, { strength: 1.6, duration: 2.0 }, 1.0);
  tl.to(camera.position, { z: '+=110', duration: 3, ease: 'sine.out' }, 0);
  return tl;
}

/* Scene 6 (45-56s) — particles gather into "I LOVE YOU", then bloom into a heart */
function scene6_LoveReveal() {
  const tl = gsap.timeline();
  tl.add(() => morphParticles(textTargets(), 3, { ease: 'power3.inOut' }), 0);
  tl.to(bloomPass, { strength: 2.0, duration: 3 }, 0);
  tl.to(camera.position, { x: 0, y: 0, z: 260, duration: 6, ease: 'sine.inOut' }, 0);
  tl.to(lookAtTarget, { x: 0, y: 0, z: 0, duration: 6 }, 0);

  tl.add(() => morphParticles(heartTargets(), 2.4, { ease: 'power2.inOut' }), 5);
  tl.to(bloomPass, { strength: 2.7, duration: 5 }, 6);
  tl.to(camera.position, { z: 175, duration: 5, ease: 'sine.inOut' }, 6);
  return tl;
}

/* Loop transition (56-64s) — heart trembles, scatters into nebula, nebula folds back into the galaxy */
function loopTransition() {
  const tl = gsap.timeline();
  tl.to(particleSystem.position, { x: '+=0.55', duration: 0.05, repeat: 9, yoyo: true }, 0);
  tl.add(() => morphParticles(explosionTargets(), 2, { ease: 'power3.out' }), 0.6);
  tl.to(bloomPass, { strength: 2.4, duration: 0.4 }, 0.6);
  tl.add(() => morphParticles(nebulaSwirlTargets(), 3, { ease: 'sine.inOut' }), 2.8);
  tl.to(particleSystem.material, { opacity: 0, duration: 2.4 }, 5.6);
  tl.to(bloomPass, { strength: 1.4, duration: 3 }, 3);
  tl.to(camera.position, { x: 0, y: 120, z: 2600, duration: 8, ease: 'power2.inOut' }, 0);
  tl.to(lookAtTarget, { x: 0, y: 0, z: 0, duration: 8 }, 0);
  tl.add(resetSceneForLoop, 7.6);
  return tl;
}

function resetSceneForLoop() {
  crystal.visible = false;
  crystal.scale.setScalar(0.01);
  crystalMaterial.uniforms.intensity.value = 1.0;
  photoMeshes.forEach((m) => {
    if (!m) return;
    m.material.opacity = 0;
    m.userData.glow.material.opacity = 0;
    m.scale.setScalar(1);
    m.position.copy(m.userData.basePosition);
  });
  particleSystem.material.opacity = 0;
  bloomPass.strength = 1.0;
}

/* ===========================================================================
   9. MUSIC — YouTube IFrame API, hidden audio-only player
   =========================================================================== */
function extractYouTubeId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

const youtubeAPIReady = new Promise((resolve) => {
  window.onYouTubeIframeAPIReady = () => resolve();
});

function loadYouTubeAPI() {
  if (extractYouTubeId(https://www.youtube.com/watch?v=d4OMqGKBl6E&list=RDd4OMqGKBl6E&start_radio=1&ab_channel=ARS) === null) return; // placeholder link not replaced yet — skip silently
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

function initMusicPlayer() {
  const videoId = extractYouTubeId(MUSIC_URL);
  if (!videoId) return Promise.resolve(null);

  return youtubeAPIReady.then(() => new Promise((resolve) => {
    ytPlayer = new YT.Player('yt-player', {
      height: '0', width: '0', videoId,
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, loop: 1, playlist: videoId, playsinline: 1 },
      events: {
        onReady: () => { ytReady = true; resolve(ytPlayer); },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) { ytPlayer.seekTo(0); ytPlayer.playVideo(); }
        }
      }
    });
  }));
}

function startMusic() {
  if (!ytPlayer || !ytReady) return;
  ytPlayer.setVolume(0);
  ytPlayer.playVideo();
  fadeMusicTo(MUSIC_VOLUME, 2.5);
  document.getElementById('sound-toggle').classList.add('visible');
}

function fadeMusicTo(vol, duration) {
  if (!ytPlayer) return;
  const proxy = { v: ytPlayer.getVolume ? ytPlayer.getVolume() : 0 };
  gsap.to(proxy, { v: vol, duration, onUpdate: () => ytPlayer.setVolume(Math.round(proxy.v)) });
}

/* ===========================================================================
   10. UI WIRING — tap-to-start, sound toggle, free-explore mode, replay
   =========================================================================== */
function bindUI() {
  const overlay = document.getElementById('tap-overlay');
  const start = () => {
    overlay.classList.add('hidden');
    initMusicPlayer().then((player) => { if (player) startMusic(); });
    masterTimeline.play(0);
    setTimeout(() => overlay.remove(), 1300);
  };
  overlay.addEventListener('click', start, { once: true });
  overlay.addEventListener('touchstart', start, { once: true, passive: true });

  const soundBtn = document.getElementById('sound-toggle');
  soundBtn.addEventListener('click', () => {
    if (!ytPlayer) return;
    musicMuted = !musicMuted;
    document.getElementById('icon-sound-on').style.display = musicMuted ? 'none' : 'block';
    document.getElementById('icon-sound-off').style.display = musicMuted ? 'block' : 'none';
    if (musicMuted) ytPlayer.mute(); else { ytPlayer.unMute(); ytPlayer.setVolume(MUSIC_VOLUME); }
  });

  document.getElementById('replay-btn').addEventListener('click', () => {
    disableFreeExplore();
    hasLoopedOnce = false;
    masterTimeline.restart();
  });
}

function enableFreeExplore() {
  masterTimeline.pause();
  controls.target.set(0, 0, 0);
  controls.enabled = true;
  freeExploreEnabled = true;
  document.getElementById('explore-ui').classList.add('visible');
}

function disableFreeExplore() {
  controls.enabled = false;
  freeExploreEnabled = false;
  document.getElementById('explore-ui').classList.remove('visible');
}

/* ===========================================================================
   11. RENDER LOOP + RESIZE
   =========================================================================== */
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  crystalMaterial.uniforms.time.value = t;
  starField.rotation.y += dt * 0.004;
  galaxySpiral.rotation.y += dt * 0.012;
  nebulaSprites.forEach((s, i) => { s.material.rotation += dt * 0.02 * (i % 2 ? 1 : -1); });
  photoMeshes.forEach((m) => { if (m) m.lookAt(camera.position); });

  if (freeExploreEnabled) {
    controls.update();
  } else {
    camera.lookAt(lookAtTarget);
  }

  composer.render();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
}

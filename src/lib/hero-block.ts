import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

type BalloonPopOptions = {
  inflateDuration?: number;
  explodeDuration?: number;
  onExplodeStart?: () => void;
  onComplete?: () => void;
};

type HeroAPI = {
  getRenderer: () => THREE.WebGLRenderer | null;
  getScene: () => THREE.Scene | null;
  getCamera: () => THREE.Camera | null;
  getMesh: () => THREE.Mesh | THREE.InstancedMesh | null;
  getUniforms: () => Record<string, any> | null;
  THREE: typeof THREE;
  runBalloonPop: (opts?: BalloonPopOptions) => Promise<void>;
  reassemble: () => void;
  setReassemblyTargets: (rects: { x: number; y: number; w: number; h: number; roleId?: string }[]) => void;
  runReassembly: (duration?: number) => Promise<void>;
  runMorph: (duration?: number) => Promise<void>;
  runToCards: (opts?: { targetRects?: CardRect[]; duration?: number }) => Promise<void>;
  setCameraLocked?: (locked: boolean) => void;
};

type HeroCanvas = HTMLCanvasElement & { __hero3d?: HeroAPI };

let canvas: HeroCanvas | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let composer: EffectComposer | null = null;
let bloomPass: UnrealBloomPass | null = null;
let mesh: THREE.InstancedMesh | null = null;
let uniforms: Record<string, any> | null = null;
let disposed = true;
let removeEvents: (() => void) | null = null;
let listenersBound = false;
let ready = false;
const readyQueue: Array<() => void> = [];
let isShaderCompiled = false; // Track shader compilation to prevent first-run glitch
let shaderCompilePromise: Promise<void> | null = null; // Promise for shader compilation
let reflectionMesh: THREE.InstancedMesh | null = null;
let reflectionUniforms: any = null;
let floorY = -3.5; // Approximate floor level, will be updated in resizeToCanvas
export let heroTexturePromise: Promise<THREE.Texture> | null = null;

let IMAGE_URL = "/logo.png";
let COLS = 28;
let ROWS = 18;
let WIDTH = 12;
let HEIGHT = 6.5;
let cameraBaseZ = 8.2;
const CAMERA_BASE_Y = 0.15;

const baseTiles: Array<{
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}> = [];

const explosionState = {
  active: false,
  phase: "idle" as "idle" | "inflate" | "explode",
  elapsed: 0,
  inflateDuration: 0.5,
  explodeDuration: 0.9,
  resolve: null as null | (() => void),
  callbacks: {} as {
    onExplodeStart?: () => void;
    onComplete?: () => void;
  },
  tiles: [] as Array<{
    idx: number;
    colorType: number;
    basePos: THREE.Vector3;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    baseQuat: THREE.Quaternion;
    baseScale: THREE.Vector3;
    scale: THREE.Vector3;
    rot: number;
    rotVel: number;
    travelDir: THREE.Vector3;
    swayDir: THREE.Vector3;
    swayMag: number;
    inflateDist: number;
    explodeDist: number;
    lift: number;
    spin: number;
    delay: number;
  }>,
  currentAmount: 0,
  reassemblyCallback: null as null | (() => void), // Callback for seamless transition
  reassemblyTriggered: false, // Track if callback already invoked early
};

const assemblyState = {
  active: false,
  elapsed: 0,
  duration: 1.35,
  from: 1,
  to: 0,
};

// Unified animation - combines explosion + reassembly into one continuous animation
type CardRect = { x: number; y: number; w: number; h: number; roleId?: string };
const unifiedAnimationState = {
  active: false,
  progress: 0,
  elapsed: 0,
  duration: 1.4,
  targetRects: [] as CardRect[],
  resolve: null as null | (() => void),
};

const INFLATE_RATIO = 0.38;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (min: number, max: number, value: number) => {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
};
const easeInCubic = (x: number) => x * x * x;
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOutCubic = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

const tmpVec = new THREE.Vector3();
const tmpQuat2 = new THREE.Quaternion();
const axisZ = new THREE.Vector3(0, 0, 1);
const dummyPop = new THREE.Object3D();
let prevTime = performance.now();
let baseOpacity = 0.27;
const tmpPointer = new THREE.Vector2();

function dispatchHeroEvent(type: string) {
  if (typeof document === "undefined" || !canvas) return;
  const api = (canvas as any).__hero3d ?? null;
  document.dispatchEvent(new CustomEvent(type, { detail: { canvas, api } }));
}

const vert = /* glsl */ `
// Hero Vertex Shader - Force Update 2
attribute vec2 aTile;

uniform vec2  uTileScale;
uniform vec2  uSpan;
uniform vec2  uMouse;
uniform float uAmp;
uniform float uSigma;
uniform float uScatterAmp;
uniform float uTime;
uniform float uHover;
uniform float uSphereDepth;
uniform vec2  uPointerDrift;
uniform vec2  uPointerTilt;

varying vec2  vUvSample;
varying float vLift;
varying vec3  vNormal;
varying vec3  vWorldPos;
varying vec2  vTileXY;
varying float vEdge;
varying float vRand;
varying float vAssemble;
varying vec3  vSphereDir;
varying float vSphereInfluence;
varying vec3  vTargetColor;

attribute vec3 aTargetColor;
attribute vec3 aReassemblyPos;
uniform float uColorMix;
uniform float uReassemblyMix;
uniform float uMorphProgress;

float hash21(vec2 p){
  p = fract(p*vec2(123.34, 345.45));
  p += dot(p, p+34.345);
  return fract(p.x*p.y);
}

mat3 rotateX(float a){
  float c = cos(a);
  float s = sin(a);
  return mat3(
    1.0, 0.0, 0.0,
    0.0,    c,   -s,
    0.0,    s,    c
  );
}

mat3 rotateY(float a){
  float c = cos(a);
  float s = sin(a);
  return mat3(
      c, 0.0,   s,
    0.0, 1.0, 0.0,
     -s, 0.0,   c
  );
}

mat3 rotateZ(float a){
  float c = cos(a);
  float s = sin(a);
  return mat3(
      c,  -s, 0.0,
      s,   c, 0.0,
    0.0, 0.0, 1.0
  );
}

void main() {
  vec2 uvTile = uv * uTileScale + aTile * uTileScale;
  vUvSample = uvTile;

  vec2 tileCenterN = (aTile + 0.5) * uTileScale - vec2(0.5);
  vec2 tileCenterW = tileCenterN * uSpan;

  vEdge = smoothstep(0.28, 0.72, length(tileCenterN) * 1.6);

  float r1 = hash21(aTile);
  float r2 = hash21(aTile + 13.7);

  vec2 jitter = (vec2(r1, r2) - 0.5) * uScatterAmp;
  jitter *= mix(0.4, 1.0, vEdge);

  vec3 localPos = position;
  vec3 localNormal = normal;

  float ring = smoothstep(0.0, 0.75, length(tileCenterN));
  float baseLift = ring * 0.08;
  float distCenter = length(tileCenterN);
  float centerEase = smoothstep(0.12, 0.7, distCenter);

  float hoverAmount = clamp(uHover, 0.0, 1.0);
  float hoverInfluence = smoothstep(0.02, 0.45, hoverAmount);

  float emblemMaskX = smoothstep(0.55, 0.18, abs((tileCenterW).x) / (uSpan.x * 0.5));
  float emblemMaskY = smoothstep(-uSpan.y * 0.05, -uSpan.y * 0.45, (tileCenterW).y);
  float emblemZone = clamp(emblemMaskX * emblemMaskY, 0.0, 1.0);

  vec2 finalXYLoose = tileCenterW + jitter;
  vec2 pointerDelta = finalXYLoose - uMouse;
  float pointerDistNorm =
    length(pointerDelta) / max(0.001, max(uSpan.x, uSpan.y));
  float stick = hoverInfluence * exp(-pointerDistNorm * pointerDistNorm * 18.0);
  stick *= (1.0 - emblemZone);
  vec2 jitterApplied = mix(jitter, vec2(0.0), stick);
  vec2 finalXY = tileCenterW + jitterApplied;
  vec3 sphereCenter = vec3(uMouse, -uSphereDepth);
  vec3 planePoint = vec3(finalXY, 0.0);
  vec3 toSphere = sphereCenter - planePoint;

  float idleMotion = mix(0.05, 0.22, centerEase);
  float motionMask = max(idleMotion, hoverInfluence) * (1.0 - emblemZone);

  float sphereRadius = uSigma * 2.4;
  float rawSphere = max(0.0, 1.0 - smoothstep(sphereRadius, sphereRadius * 1.35, length(toSphere)));
  float interactive = pow(rawSphere, 1.08) * hoverInfluence * 0.35;
  float ambient = rawSphere * 0.02;
  float bottomBias = smoothstep(-uSpan.y * 1.05, -uSpan.y * 0.05, finalXY.y);
  float topBias = smoothstep(uSpan.y * 0.15, uSpan.y * 0.65, finalXY.y);
  float restingSphere = ambient + bottomBias * 0.14 + centerEase * 0.015;
  float activeSphere = ambient + interactive + bottomBias * 0.32 + topBias * 0.06;
  float sphere = mix(restingSphere, activeSphere, hoverInfluence);
  float pointerBottomBoost = smoothstep(-uSpan.y * 0.85, -uSpan.y * 0.1, uPointerDrift.y);
  sphere += pointerBottomBoost * bottomBias * 0.6;
  sphere = min(sphere, 1.05);

  vec3 dirXY = normalize(vec3(uMouse - finalXY, 0.4));
  float tiltAmount = mix(0.18, 0.4, motionMask);
  float tiltX = dirXY.y * sphere * tiltAmount;
  float tiltY = -dirXY.x * sphere * tiltAmount;
  float tiltInfluence = mix(1.0, 0.55, vEdge);
  float globalTiltX = uPointerTilt.y * mix(0.12, 0.35, motionMask) * tiltInfluence;
  float globalTiltY = -uPointerTilt.x * mix(0.12, 0.35, motionMask) * tiltInfluence;
  float twist = uPointerTilt.x * mix(0.05, 0.2, motionMask) * (1.0 - vEdge * 0.6);
  mat3 globalTilt = rotateZ(twist) * rotateY(globalTiltY) * rotateX(globalTiltX);
  localPos = globalTilt * localPos;
  localNormal = globalTilt * localNormal;

  mat3 bendRot = rotateY(tiltY) * rotateX(tiltX);
  localPos = bendRot * localPos;
  localNormal = bendRot * localNormal;

  float reassembly = smoothstep(0.0, 1.0, uReassemblyMix);

  // Kill rotations when reassembling
  localPos = mix(localPos, position, reassembly);
  localNormal = mix(localNormal, normal, reassembly);

  float lift = uAmp * sphere * (0.12 + 0.25 * motionMask);
  lift += 0.01 * sin(uTime * 0.9 + (aTile.x + aTile.y) * 0.37);
  lift += 0.006 * sin(uTime * 3.1 + r1 * 10.0);

  float edgeFlow = vEdge * 0.25 * sin(uTime * (0.6 + r1*1.4) + r2*20.0);
  float wobbleScale = mix(0.38, 0.04, smoothstep(0.0, 0.65, distCenter));
  float wobble = sin(uTime * (0.8 + r1) + r2 * 25.0) * wobbleScale * (0.35 + 0.65 * motionMask);

  // Kill noise when reassembling
  lift *= (1.0 - reassembly);
  edgeFlow *= (1.0 - reassembly);
  wobble *= (1.0 - reassembly);
  jitterApplied *= (1.0 - reassembly);

  vec4 wp = instanceMatrix * vec4(localPos, 1.0);
  vec2 drift = uPointerDrift
    * mix(vec2(0.45, 0.36), vec2(0.2, 0.15), vEdge)
    * motionMask
    * (1.0 - stick * 0.85);
  
  drift *= (1.0 - reassembly);

  wp.x += jitterApplied.x + drift.x;
  wp.y += jitterApplied.y + drift.y;
  vec2 outward = normalize(finalXY + 1e-4);
  float edgeSpread =
    pow(vEdge, 1.6) * mix(0.22, 0.45, motionMask) * (1.0 - stick);
  wp.x += outward.x * edgeSpread;
  wp.y += outward.y * edgeSpread;
  wp.z += baseLift + lift + edgeFlow + wobble;

  // Morph Pulse & Digital Dissolve
  // Flatten Z to 0 as we progress
  float zFlatten = 1.0 - uMorphProgress;
  
  // Expand XY to fill gaps (make it look like a solid card)
  float xyExpand = 1.0 + uMorphProgress * 0.15;
  
  // Add some digital noise distortion
  float noise = hash21(aTile + uTime * 0.1);
  float distort = (noise - 0.5) * uMorphProgress * 0.8;
  
  vec3 morphedPos = wp.xyz;
  morphedPos.x *= xyExpand;
  morphedPos.y *= xyExpand;
  morphedPos.z *= zFlatten; // Flatten to plane
  
  morphedPos.x += distort;
  morphedPos.y -= distort;
  
  wp.xyz = mix(wp.xyz, morphedPos, uMorphProgress);

  // Final mix to target position
  // aReassemblyPos is the target center. localPos is the vertex offset.
  // We want to land exactly at aReassemblyPos + localPos
  if (uReassemblyMix > 0.0) {
     wp.xyz = mix(wp.xyz, aReassemblyPos + localPos, reassembly);
  }

  vLift    = lift;
  vTileXY  = finalXY;
  vec4 worldPos = modelMatrix * wp;
  vWorldPos= worldPos.xyz;
  vNormal  = normalMatrix * localNormal;
  vRand    = r1;
  vSphereDir = sphereCenter - worldPos.xyz;
  vSphereInfluence = sphere;
  vAssemble = sphere;
  vTargetColor = aTargetColor;

  gl_Position = projectionMatrix * modelViewMatrix * wp;
}
`;

const frag = /* glsl */ `
precision highp float;

uniform sampler2D uTexture;
uniform vec3  uTint;
uniform float uBaseOpacity;
uniform vec3  uFogColor;
uniform vec2  uMouse;
uniform float uCoreRadius;
uniform float uRevealRadius;
uniform float uFrost;
uniform vec2  uTileScale;
uniform float uAlphaFloor;
uniform float uEdgeHideEdge;
uniform float uEdgeHideProb;

varying vec2  vUvSample;
varying float vLift;
varying vec3  vNormal;
varying vec3  vWorldPos;
varying vec2  vTileXY;
varying float vEdge;
varying float vRand;
varying float vAssemble;
varying vec3  vSphereDir;
varying float vSphereInfluence;
varying vec3  vTargetColor;
uniform float uColorMix;
uniform float uMorphProgress;
uniform float uTime;

vec3 frostSample(sampler2D tex, vec2 uv, vec2 dir, float amt){
  vec2 stepv = dir * amt;
  vec3 c = texture2D(tex, uv).rgb * 0.40;
  c += texture2D(tex, uv + stepv).rgb * 0.22;
  c += texture2D(tex, uv - stepv).rgb * 0.22;
  c += texture2D(tex, uv + 2.0*stepv).rgb * 0.08;
  c += texture2D(tex, uv - 2.0*stepv).rgb * 0.08;
  return c;
}

vec3 formLight(vec3 base, vec3 N, vec3 V, vec3 tint) {
  vec3 L = normalize(vec3(-0.35, 0.6, 1.0));
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 24.0);
  float rim  = pow(1.0 - max(dot(N, V), 0.0), 1.8);
  return base * (0.5 + 0.4*diff) + tint * (0.12*spec + 0.18*rim);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);

  float frontF = smoothstep(0.25, 0.85, abs(N.z));

  float blurAmt = (0.55 + 0.45*(1.0 - frontF)) * mix(1.1, 0.22, clamp(vAssemble,0.0,1.0));
  vec2  dir   = normalize(vec2(0.7, 0.3));
  vec2  stepv = dir * uTileScale * blurAmt;
  vec3  img   = frostSample(uTexture, vUvSample, stepv, 1.0);

  float lum = dot(img, vec3(0.299, 0.587, 0.114));
  img = mix(vec3(lum), img, 0.7);

  vec3 sideCol = mix(vec3(0.18,0.18,0.22), uTint*0.25, 0.6);
  vec3 baseCol = mix(sideCol, img, frontF);

  baseCol = baseCol * 1.08 + vec3(0.06);

  float liftN = clamp(vLift * 1.35, 0.0, 1.0);
  baseCol += vec3(0.08, 0.12, 0.22) * liftN;
  baseCol = mix(baseCol, baseCol + uTint * (0.12 + 0.32*liftN), 0.6);
  baseCol = mix(baseCol, baseCol + vec3(0.12, 0.1, 0.2), 0.35);

  vec3 shaded = formLight(baseCol, N, V, uTint);
  vec3 sphereDir = normalize(vSphereDir);
  float backFacing = clamp(-dot(N, sphereDir), 0.0, 1.0);
  float sphereLight = pow(backFacing, 1.4) * vSphereInfluence * 0.05;
  vec3 glowColor = mix(vec3(0.02, 0.05, 0.12), uTint, 0.22);
  vec3 sphereGlow = glowColor * sphereLight;
  vec3 translucency = glowColor * pow(vSphereInfluence, 1.1) * 0.08;
  shaded += sphereGlow + translucency;
  vec3 glowAcc = vec3(0.05, 0.09, 0.16);
  shaded = mix(glowAcc + uTint * 0.03, shaded, 0.94);

  float depth = length(cameraPosition - vWorldPos);
  float fog   = smoothstep(7.0, 18.0, depth);
  shaded = mix(shaded, uFogColor, fog * 0.3);
  shaded = mix(shaded, shaded + vec3(0.08, 0.1, 0.18), 0.35);

  // --- COLOR MORPHING ---
  // Mix in the target team color based on uColorMix
  // Keep it translucent and glassy
  vec3 targetGlow = vTargetColor * 1.2; 
  // Mix gently so we preserve the "glass" lighting (specular, rim)
  shaded = mix(shaded, targetGlow, uColorMix * 0.65);
  
  float dCenter = length(vTileXY);
  float coreBoost  = 1.0 - smoothstep(uCoreRadius, uCoreRadius + 0.01, dCenter);

  float alpha = uBaseOpacity * 0.85;
  alpha *= mix(1.0, 0.55, vEdge);
  alpha *= mix(0.70, 1.0, 1.0 - vRand*0.5);

  alpha += vAssemble * 0.5;
  alpha += 0.30*coreBoost;
  alpha += vSphereInfluence * 0.03;
  float liftBoost = clamp(liftN + vSphereInfluence, 0.0, 1.0);
  float classSeed = fract(vRand * 9.37);
  float alphaGroup;
  if (classSeed < 0.2) {
    alphaGroup = 0.2;
  } else if (classSeed < 0.4) {
    alphaGroup = 0.4;
  } else if (classSeed < 0.6) {
    alphaGroup = 0.6;
  } else if (classSeed < 0.8) {
    alphaGroup = 0.8;
  } else {
    alphaGroup = 1.0;
  }
  float centerSolid = 1.0 - smoothstep(uCoreRadius * 0.4, uCoreRadius * 0.95, dCenter);
  float translucencyMix = mix(alphaGroup, 1.0, centerSolid * 0.9 + liftBoost * 0.7);
  alpha *= translucencyMix;
  alpha += liftBoost * 0.08;
  alpha = mix(alpha, alpha + 0.30, liftN);

  // Boost alpha slightly when morphing, but keep it translucent (frosted glass)
  alpha = mix(alpha, 0.9, uColorMix * 0.4);

  // Morph Flash (Hologram Glitch)
  // Peak at 0.5 progress
  // Flashbang effect: Make it blindingly bright at the peak to hide the transition
  float morphFlash = smoothstep(0.0, 0.4, uMorphProgress) * (1.0 - smoothstep(0.6, 1.0, uMorphProgress));
  morphFlash = pow(morphFlash, 0.5); // Make it linger a bit and be brighter
  
  // Scanline effect
  float scanline = sin(vUvSample.y * 80.0 + uTime * 20.0) * 0.5 + 0.5;
  vec3 glitchColor = mix(uTint, vec3(0.8, 1.0, 0.9), scanline);
  
  // Digital dissolve color shift
  vec3 dissolveColor = mix(shaded, glitchColor, morphFlash * 0.9);
  dissolveColor += vec3(1.0, 1.0, 1.0) * morphFlash * 1.5; // Blinding white hot core
  
  shaded = mix(shaded, dissolveColor, morphFlash);
  alpha = mix(alpha, 1.0, morphFlash);
  
  // Force full opacity at end of morph to match card
  alpha = mix(alpha, 1.0, smoothstep(0.8, 1.0, uMorphProgress));

  float atExtremeEdge = step(uEdgeHideEdge, vEdge);
  float mayHide = step(1.0 - uEdgeHideProb, vRand) * atExtremeEdge;
  float keepBecauseBoost = step(0.01, max(coreBoost, vAssemble));
  if (mayHide > 0.5 && keepBecauseBoost < 0.5) discard;

  alpha = max(alpha, uAlphaFloor * 0.4);
  alpha *= 0.85;
  alpha = clamp(alpha, 0.0, 1.0);

  gl_FragColor = vec4(shaded, alpha);
}
`;

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const line = new THREE.Line3();
const mouseTarget = new THREE.Vector2(0, 0);
const mouseGoal = new THREE.Vector2(0, 0);
let hoverTarget = 0;
const SPHERE_DEPTH_MIN = 1.4;
const SPHERE_DEPTH_MAX = 3.6;
let sphereDepthTarget = 2.2;

function createGradientTexture() {
  if (typeof document === "undefined") return null;
  const size = 512;
  const canvasEl = document.createElement("canvas");
  canvasEl.width = size;
  canvasEl.height = size;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);

  const baseGrad = ctx.createLinearGradient(0, 0, size, size * 1.1);
  baseGrad.addColorStop(0, "rgba(3, 8, 20, 0.18)");
  baseGrad.addColorStop(0.55, "rgba(4, 12, 30, 0.12)");
  baseGrad.addColorStop(1, "rgba(6, 8, 15, 0.08)");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  const glow1 = ctx.createRadialGradient(size * 0.2, size * 0.35, 0, size * 0.2, size * 0.35, size * 0.7);
  glow1.addColorStop(0, "rgba(34,122,255,0.25)");
  glow1.addColorStop(1, "rgba(34,122,255,0)");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, size, size);

  const glow2 = ctx.createRadialGradient(size * 0.78, size * 0.12, 0, size * 0.78, size * 0.12, size * 0.55);
  glow2.addColorStop(0, "rgba(0,255,209,0.18)");
  glow2.addColorStop(1, "rgba(0,255,209,0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvasEl);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function markReady() {
  if (ready) return;
  ready = true;
  while (readyQueue.length) readyQueue.shift()?.();
}

function whenReady() {
  if (ready && mesh && explosionState.tiles.length) {
    return Promise.resolve();
  }
  console.log("[HeroBlock] whenReady waiting...", { ready, mesh: !!mesh, tiles: explosionState.tiles.length });
  return new Promise<void>((resolve) => readyQueue.push(resolve));
}

function syncCanvas(): boolean {
  console.log("[HeroBlock] syncCanvas called");
  // Prioritize the persisted transition canvas (DOM or global storage)
  const next = (document.getElementById("hero-transition-canvas") || (window as any).__persistedHeroCanvas || document.getElementById("hero3d")) as HeroCanvas | null;
  if (!next) {
    canvas = null;
    return false;
  }

  if (canvas && next !== canvas) {
    removeEvents?.();
  }

  canvas = next;
  IMAGE_URL = canvas.dataset.image || "/logo.png";
  COLS = parseInt(canvas.dataset.cols || "28", 10);
  ROWS = parseInt(canvas.dataset.rows || "18", 10);
  WIDTH = parseFloat(canvas.dataset.width || "12");
  HEIGHT = parseFloat(canvas.dataset.height || "6.5");
  // syncReflectionCanvas(); // Removed
  return true;
}

function getCanvasMetrics() {
  if (!canvas) {
    return { width: innerWidth, height: innerHeight, left: 0, top: 0 };
  }
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width || innerWidth);
  const height = Math.max(1, rect.height || innerHeight);
  return {
    width,
    height,
    left: rect.left || 0,
    top: rect.top || 0,
  };
}

// syncReflectionCanvas removed

function resizeReflectionCanvas() {
  // No-op
}

let isCameraLocked = false;

function resizeToCanvas() {
  const { width, height } = getCanvasMetrics();
  if (renderer) {
    renderer.setSize(width, height, false);
  }
  if (camera) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // Only fit to grid if camera is NOT locked.
    // When locked (during transition), we want the viewport to expand
    // without moving the camera, so the grid stays in place.
    if (!isCameraLocked) {
      fitCameraToGrid();
    }
  }
  composer?.setSize(width, height);
  bloomPass?.setSize(width, height);
  resizeReflectionCanvas();

  // Nuclear fix: If the canvas is suspiciously small but the window is large,
  // force it to full screen via inline styles. This overrides missing CSS.
  if (canvas && width < 600 && window.innerWidth > 800) {
    canvas.style.width = "100vw";
    canvas.style.height = "100vh";
    // Re-measure after forcing style
    const newMetrics = getCanvasMetrics();
    if (newMetrics.width > width) {
      // If it grew, recurse once to update renderer size
      resizeToCanvas();
      return;
    }
  }

  // Update reflection mesh position
  if (reflectionMesh) {
    // Calculate floor Y based on camera and visible height
    // visibleHeight at distance Z is 2 * tan(fov/2) * Z
    // camera.position.y is CAMERA_BASE_Y (0.15)
    // So floor is roughly at -visibleHeight/2 + CAMERA_BASE_Y? 
    // No, let's just put it at the bottom of the grid.
    // HEIGHT is 6.5. Grid is centered at 0,0?
    // No, tiles are centered.
    // Let's assume floor is at -HEIGHT/2 - 1.0 (padding)
    floorY = -HEIGHT * 0.5 - 1.5;

    // Mirror position: 2 * floorY - y
    // Since scale.y is -1, we just need to translate it.
    // If original is at y, scaled is at -y.
    // We want it at 2*floorY - y.
    // So we need to add 2*floorY.
    reflectionMesh.position.y = 2 * floorY;
  }
}

function fitCameraToGrid() {
  if (!camera) return;
  const margin = 0.8;
  const gridWidth = WIDTH + margin;
  const gridHeight = HEIGHT + margin;
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const tanVert = Math.tan(verticalFov / 2);

  // Use SCREEN aspect ratio to ensure the grid fits even when we transition to full screen.
  // Window dimensions can fluctuate (address bars, etc), but Screen is stable.
  // We want the "worst case" (narrowest) aspect to ensure we never clip.
  const winAspect = typeof window !== "undefined" ? window.innerWidth / window.innerHeight : 1.0;
  const screenAspect = typeof screen !== "undefined" ? screen.availWidth / screen.availHeight : winAspect;

  // Use the narrower of the two, AND clamp to 1.0 to ensure we treat it as at least square/portrait.
  // This prevents the camera from getting too close in wide "Banner" modes, ensuring
  // it's already positioned for the potential "Full Screen" portrait transition.
  const aspect = Math.min(1.0, Math.min(winAspect, screenAspect));

  const verticalDist = gridHeight / (2 * Math.max(tanVert, 0.0001));
  const horizontalFov = 2 * Math.atan(tanVert * aspect);
  const tanHoriz = Math.tan(horizontalFov / 2);
  const horizontalDist = gridWidth / (2 * Math.max(tanHoriz, 0.0001));
  cameraBaseZ = Math.max(verticalDist, horizontalDist) + 2.2;
  camera.position.z = cameraBaseZ;
}

function setMouse(e?: { clientX?: number; clientY?: number }) {
  const metrics = getCanvasMetrics();
  const clientX = e?.clientX ?? metrics.left + metrics.width / 2;
  const clientY = e?.clientY ?? metrics.top + metrics.height / 2;
  const localX = ((clientX - metrics.left) / metrics.width) * 2 - 1;
  const localY = ((clientY - metrics.top) / metrics.height) * 2 - 1;
  ndc.x = localX;
  ndc.y = -localY;
  if (!camera) return;
  raycaster.setFromCamera(ndc, camera);
  const p0 = raycaster.ray.origin.clone();
  const p1 = p0.clone().add(raycaster.ray.direction.clone().multiplyScalar(100));
  line.start.copy(p0);
  line.end.copy(p1);
  const hit = new THREE.Vector3();
  planeZ.intersectLine(line, hit);
  mouseGoal.set(hit.x, hit.y);
  const relY = THREE.MathUtils.clamp(
    (clientY - metrics.top) / Math.max(metrics.height, 1),
    0,
    1,
  );
  sphereDepthTarget = THREE.MathUtils.lerp(
    SPHERE_DEPTH_MIN,
    SPHERE_DEPTH_MAX,
    relY,
  );
}

function addEvents() {
  if (!canvas) return;
  removeEvents?.();

  const handleMouseMove = (e: MouseEvent) => setMouse(e);
  const handleMouseEnter = () => (hoverTarget = 1);
  const handleMouseLeave = () => {
    hoverTarget = 0;
    const { left, top, width, height } = getCanvasMetrics();
    setMouse({ clientX: left + width / 2, clientY: top + height / 2 });
  };
  const handleResize = () => onResize();

  canvas.addEventListener("mousemove", handleMouseMove, { passive: true });
  canvas.addEventListener("mouseenter", handleMouseEnter);
  canvas.addEventListener("mouseleave", handleMouseLeave);

  const observer = new ResizeObserver(() => {
    handleResize();
  });
  observer.observe(canvas);

  removeEvents = () => {
    canvas?.removeEventListener("mousemove", handleMouseMove);
    canvas?.removeEventListener("mouseenter", handleMouseEnter);
    canvas?.removeEventListener("mouseleave", handleMouseLeave);
    observer.disconnect();
    removeEvents = null;
  };

  const { left, top, width, height } = getCanvasMetrics();
  setMouse({ clientX: left + width / 2, clientY: top + height / 2 });
}

function onResize() {
  resizeToCanvas();
}

function rand2(x: number, y: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

let currentInitId = 0;

function init(opts?: { startExploded?: boolean; canvas?: HTMLCanvasElement }) {
  const myId = ++currentInitId;
  console.log("[HeroBlock] init called", { id: myId, opts, canvas, renderer: !!renderer });
  if (opts?.canvas) {
    canvas = opts.canvas;
  } else if (!syncCanvas() || !canvas) {
    return;
  }

  // Safety check: Ensure dimensions are valid to prevent "clumped" grid
  if (WIDTH < 1 || HEIGHT < 1) {
    console.warn("[HeroBlock] Invalid dimensions detected, resetting to defaults");
    WIDTH = 12;
    HEIGHT = 6.5;
  }

  isCameraLocked = false;

  if (renderer) {
    // If renderer exists, check if it's using the correct canvas
    if (renderer.domElement !== canvas) {
      console.warn("[HeroBlock] Renderer exists but canvas mismatch. Disposing old renderer.");
      renderer.dispose();
      renderer = null;
    } else {
      console.log("[HeroBlock] Reusing existing renderer");
      // Re-attach scene/camera if needed?
      // If we reused renderer, we probably reused scene/camera too unless they were nulled.
      // But disposeHero nulls them.
      // If we skipped disposeHero, they should be fine.
      // If we didn't skip, renderer is null.
      // So if renderer is NOT null here, we are reusing.

      // Ensure we are not disposed
      disposed = false;

      // We might need to resize
      resizeToCanvas();
      attachHeroAPI();
      return;
    }
  }

  disposed = false;
  baseTiles.length = 0;
  explosionState.tiles = [];

  renderer = new THREE.WebGLRenderer({
    canvas: canvas!,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance", // Hint to browser
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.46;

  scene = new THREE.Scene();
  const { width: initialWidth, height: initialHeight } = getCanvasMetrics();
  camera = new THREE.PerspectiveCamera(62, initialWidth / initialHeight, 0.1, 100);
  camera.position.set(0, CAMERA_BASE_Y, cameraBaseZ);
  resizeToCanvas();
  attachHeroAPI();

  resizeToCanvas();
  attachHeroAPI();

  // Create a promise that resolves when the texture is loaded
  if (!heroTexturePromise) {
    heroTexturePromise = new Promise((resolve) => {
      console.log("[HeroBlock] Loading texture:", IMAGE_URL);
      new THREE.TextureLoader().load(
        IMAGE_URL,
        (tex) => {
          console.log("[HeroBlock] Texture loaded");
          resolve(tex);
        },
        undefined,
        (err) => {
          console.error("[HeroBlock] Texture load failed:", err);
          // Resolve anyway to unblock, maybe with a fallback or just broken state
          // Better to resolve so we don't hang
          resolve(new THREE.Texture());
        }
      );
    });
  }

  heroTexturePromise.then((tex) => {
    if (myId !== currentInitId) {
      console.log("[HeroBlock] Init aborted: Stale ID", { myId, currentInitId });
      return;
    }
    tex.colorSpace = THREE.SRGBColorSpace;

    const THICK = 0.42;
    const PAD = 0.8;
    const cellW = WIDTH / COLS;
    const cellH = HEIGHT / ROWS;

    const geo = new THREE.BoxGeometry(cellW * PAD, cellH * PAD, THICK);
    const instGeo = geo.toNonIndexed();
    const count = COLS * ROWS;

    const aTile = new Float32Array(count * 2);
    const targetColors = new Float32Array(count * 3);
    const cCyan = new THREE.Color("#00f2ff");
    const cMagenta = new THREE.Color("#ff00ff");
    const cGold = new THREE.Color("#ffd700");
    const cEmerald = new THREE.Color("#00ff80");

    let k = 0;
    let tc = 0;
    const tileColorTypes = new Uint8Array(count);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        aTile[k++] = x;
        aTile[k++] = y;

        // Random Team Color
        const rand = Math.random();
        let color;
        let cType = 0;
        if (rand < 0.25) { color = cCyan; cType = 0; }
        else if (rand < 0.5) { color = cMagenta; cType = 1; }
        else if (rand < 0.75) { color = cGold; cType = 2; }
        else { color = cEmerald; cType = 3; }

        tileColorTypes[y * COLS + x] = cType;

        // Add some variation
        const variation = (Math.random() - 0.5) * 0.15;
        targetColors[tc++] = Math.max(0, Math.min(1, color.r + variation));
        targetColors[tc++] = Math.max(0, Math.min(1, color.g + variation));
        targetColors[tc++] = Math.max(0, Math.min(1, color.b + variation));
      }
    instGeo.setAttribute("aTile", new THREE.InstancedBufferAttribute(aTile, 2));
    instGeo.setAttribute("aTargetColor", new THREE.InstancedBufferAttribute(targetColors, 3));

    // Initialize reassembly positions (default to 0,0,0)
    const reassemblyPos = new Float32Array(count * 3);
    instGeo.setAttribute("aReassemblyPos", new THREE.InstancedBufferAttribute(reassemblyPos, 3));

    uniforms = {
      uTexture: { value: tex },
      uTileScale: { value: new THREE.Vector2(1 / COLS, 1 / ROWS) },
      uSpan: { value: new THREE.Vector2(WIDTH, HEIGHT) },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uAmp: { value: 0.8 },
      uSigma: { value: 0.95 },
      uScatterAmp: { value: Math.min(cellW, cellH) * 0.35 },
      uTime: { value: 0 },
      uTint: { value: new THREE.Color(0x9d4df2) },
      uBaseOpacity: { value: 0.3 },
      uFogColor: { value: new THREE.Color(0x0d1020) },
      uCoreRadius: { value: Math.min(WIDTH, HEIGHT) * 0.12 },
      uRevealRadius: { value: Math.min(WIDTH, HEIGHT) * 0.055 },
      uFrost: { value: 0.95 },
      uAlphaFloor: { value: 0.025 },
      uEdgeHideEdge: { value: 0.82 },
      uEdgeHideProb: { value: 0.35 },
      uHover: { value: 0.0 },
      uSphereDepth: {
        value: (SPHERE_DEPTH_MIN + SPHERE_DEPTH_MAX) * 0.5,
      },
      uPointerDrift: { value: new THREE.Vector2(0, 0) },
      uPointerTilt: { value: new THREE.Vector2(0, 0) },
      uColorMix: { value: 0.0 },
      uReassemblyMix: { value: 0.0 },
      uMorphProgress: { value: 0.0 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    mesh = new THREE.InstancedMesh(instGeo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // scene.add(mesh) moved to end

    baseTiles.length = 0;
    explosionState.tiles = [];
    const dummy = new THREE.Object3D();

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const idx = y * COLS + x;
        const cx = (x + 0.5) * cellW - WIDTH / 2;
        const cy = (y + 0.5) * cellH - HEIGHT / 2;
        dummy.position.set(cx, cy, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);

        const basePos = dummy.position.clone();
        const baseQuat = dummy.quaternion.clone();
        const baseScale = dummy.scale.clone();
        baseTiles.push({ position: basePos, quaternion: baseQuat, scale: baseScale });

        const r1 = rand2(x, y);
        const r2 = rand2(x + 11.1, y + 3.3);
        const r3 = rand2(x + 9.9, y + 77.7);

        const angle = r1 * Math.PI * 2;
        const travelDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).normalize();
        const swayDir = new THREE.Vector3(-travelDir.y, travelDir.x, 0);

        explosionState.tiles.push({
          idx,
          colorType: tileColorTypes[idx],
          basePos,
          pos: basePos.clone(),
          vel: new THREE.Vector3(),
          baseQuat,
          baseScale,
          scale: baseScale.clone(),
          rot: 0,
          rotVel: 0,
          travelDir,
          swayDir,
          swayMag: (Math.random() * 0.6 + 0.2) * (Math.random() > 0.5 ? 1 : -1),
          inflateDist: 0.55 + Math.random() * 0.65,
          explodeDist: 2.1 + Math.random() * 2.8,
          lift: 0.5 + Math.random() * 1.3,
          spin: (Math.random() - 0.5) * 2.2,
          delay: Math.random() * 0.18,
        });
      }
    }

    mesh.rotation.x = -0.22;
    mesh.rotation.y = 0.1;
    scene?.add(mesh);
    markReady();
    dispatchHeroEvent("hero:block-ready");

    const renderPass = new RenderPass(scene!, camera!);
    renderPass.clearColor = new THREE.Color(0, 0, 0);
    renderPass.clearAlpha = 0;
    const { width, height } = getCanvasMetrics();
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.42,
      0.72,
      0.46,
    );

    // Ensure transparent background for post-processing
    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      stencilBuffer: false,
    });

    composer = new EffectComposer(renderer!, renderTarget);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    resizeToCanvas();

    addEvents();

    // Force a resize check to ensure full screen
    resizeToCanvas();

    // GPU PRE-WARM: Compile shaders SYNCHRONOUSLY to prevent first-click lag
    // This blocks initialization but ensures GPU is fully ready before user can interact
    console.log("[HeroBlock] Pre-compiling shaders...");
    renderer!.compile(scene!, camera!);
    isShaderCompiled = true;
    console.log("[HeroBlock] Shader compilation complete");

    // CRITICAL: Warmup render to force GPU buffer upload
    if (composer && scene && camera) {
      composer.render();
    } else if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
    console.log("[HeroBlock] GPU warmup complete");

    shaderCompilePromise = Promise.resolve();

    animate();
    startIntroAssembly(opts?.startExploded);
  });
}

// updateReflection removed

function animate(t = 0) {
  if (disposed) return;
  requestAnimationFrame(animate);

  try {
    const nowTime = performance.now();
    let dt = (nowTime - prevTime) / 1000 || 0;

    // CRITICAL FIX: More aggressive clamping on first few frames to prevent "rushed" animation
    // If explosion just started (elapsed < 0.15s), clamp dt even more aggressively
    if (explosionState.active && explosionState.elapsed < 0.15) {
      dt = Math.min(0.016, dt); // Cap at ~60fps (16ms) for first few frames
      if (explosionState.elapsed < 0.05) {
        console.log("[HeroBlock] First-frame dt clamp:", dt.toFixed(4), "elapsed:", explosionState.elapsed.toFixed(4));
      }
    } else {
      dt = Math.min(0.05, dt); // Normal clamp (50ms max)
    }

    prevTime = nowTime;

    if (Math.floor(t / 1000) % 2 === 0 && Math.floor(t / 16) % 60 === 0) {
      // console.log("[HeroBlock] animate running", { dt, active: explosionState.active });
    }

    mouseTarget.lerp(mouseGoal, 0.03);

    if (uniforms) {
      uniforms.uTime.value = t / 1000;
      uniforms.uMouse.value.lerp(mouseTarget, 0.06);
      uniforms.uHover.value += (hoverTarget - uniforms.uHover.value) * 0.03;
      if (uniforms.uSphereDepth) {
        uniforms.uSphereDepth.value +=
          (sphereDepthTarget - uniforms.uSphereDepth.value) * 0.08;
      }
      tmpPointer.set(mouseTarget.x, mouseTarget.y);
      if (uniforms.uPointerDrift) {
        const drift = tmpPointer.clone().multiplyScalar(0.08);
        uniforms.uPointerDrift.value.lerp(drift, 0.05);
      }
      if (uniforms.uPointerTilt) {
        const tilt = tmpPointer.clone().multiplyScalar(0.12);
        uniforms.uPointerTilt.value.lerp(tilt, 0.05);
      }
    }

    if (explosionState.active) {
      explosionState.elapsed += dt;

      // DEBUG: Log delta time for first 10 frames to detect lag spikes
      if (explosionState.elapsed < 0.2) {
        console.log("[HeroBlock] Explosion dt:", dt.toFixed(4), "elapsed:", explosionState.elapsed.toFixed(4));
      }

      let progress = 0;
      if (explosionState.phase === "inflate") {
        progress = explosionState.elapsed / explosionState.inflateDuration;
        if (progress >= 1) {
          console.log("[HeroBlock] Phase inflate -> explode");
          explosionState.phase = "explode";
          explosionState.elapsed = 0;
          progress = 0;
          explosionState.callbacks.onExplodeStart?.();
        } else {
          applyBalloonAmount(progress * INFLATE_RATIO);
        }
      }

      if (explosionState.phase === "explode") {
        progress = explosionState.elapsed / explosionState.explodeDuration;

        // OPTIMIZATION: Trigger reassembly slightly early (50ms before complete) for smooth overlap
        if (progress >= 0.94 && explosionState.reassemblyCallback && !explosionState.reassemblyTriggered) {
          console.log("[HeroBlock] Early reassembly trigger for smooth transition");
          explosionState.reassemblyCallback();
          explosionState.reassemblyCallback = null;
          explosionState.reassemblyTriggered = true;
        }

        if (progress >= 1) {
          explosionState.active = false;
          // Hold tiles at fully exploded position (1.0) for seamless transition to reassembly
          applyBalloonAmount(1.0);
          explosionState.currentAmount = 1.0; // Lock position to prevent drift
          explosionState.callbacks.onComplete?.();
          if (explosionState.resolve) {
            explosionState.resolve();
            explosionState.resolve = null;
          }
          // Final fallback: Invoke reassembly callback if not already triggered
          if (explosionState.reassemblyCallback) {
            console.log("[HeroBlock] Fallback reassembly trigger");
            explosionState.reassemblyCallback();
            explosionState.reassemblyCallback = null;
          }
          explosionState.reassemblyTriggered = false; // Reset for next run
        } else {
          const val = INFLATE_RATIO + progress * (1 - INFLATE_RATIO);
          applyBalloonAmount(val);
        }
      }
    } else if (assemblyState.active) {
      assemblyState.elapsed += dt;
      const progress = Math.min(1, assemblyState.elapsed / assemblyState.duration);
      const eased = easeOutBack(progress);
      const amount = THREE.MathUtils.lerp(
        assemblyState.from,
        assemblyState.to,
        eased,
      );
      applyBalloonAmount(amount);
      if (progress >= 1) {
        assemblyState.active = false;
        applyBalloonAmount(assemblyState.to);
      }
    }

    // Unified animation: 0-30% inflate, 30-70% explode, 70-100% reassemble
    if (unifiedAnimationState.active) {
      unifiedAnimationState.elapsed += dt;
      const p = Math.min(1, unifiedAnimationState.elapsed / unifiedAnimationState.duration);
      unifiedAnimationState.progress = p;

      if (p < 0.3) {
        // Inflate phase
        applyBalloonAmount((p / 0.3) * INFLATE_RATIO);
      } else if (p < 0.7) {
        // Explode phase  
        const localP = (p - 0.3) / 0.4;
        applyBalloonAmount(INFLATE_RATIO + localP * (1 - INFLATE_RATIO));
      } else {
        // Reassemble phase
        applyBalloonAmount(1.0);
        if (uniforms) {
          const localP = (p - 0.7) / 0.3;
          uniforms.uReassemblyMix.value = easeInOutCubic(localP);
          uniforms.uColorMix.value = Math.max(uniforms.uColorMix.value, easeInOutCubic(localP));
        }
      }

      if (p >= 1) {
        unifiedAnimationState.active = false;
        unifiedAnimationState.resolve?.();
        unifiedAnimationState.resolve = null;
      }
    }

    if (composer && scene && camera) {
      composer.render();
    } else if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }

    // Robust sizing check: every ~60 frames (approx 1 sec), verify canvas matches window
    // This fixes the "small rectangle" bug if ResizeObserver missed the layout change
    if (renderer && Math.floor(t / 16) % 60 === 0) {
      const { width } = getCanvasMetrics();
      if (Math.abs(width - window.innerWidth) > 50) {
        resizeToCanvas();
      }
    }

    // Update reflection uniforms
    if (reflectionUniforms && uniforms) {
      reflectionUniforms.uTime.value = uniforms.uTime.value;
      reflectionUniforms.uMouse.value.copy(uniforms.uMouse.value);
      reflectionUniforms.uHover.value = uniforms.uHover.value;
      if (reflectionUniforms.uSphereDepth) reflectionUniforms.uSphereDepth.value = uniforms.uSphereDepth.value;
      if (reflectionUniforms.uPointerDrift) reflectionUniforms.uPointerDrift.value.copy(uniforms.uPointerDrift.value);
      if (reflectionUniforms.uPointerTilt) reflectionUniforms.uPointerTilt.value.copy(uniforms.uPointerTilt.value);
      reflectionUniforms.uMorphProgress.value = uniforms.uMorphProgress.value;
      reflectionUniforms.uReassemblyMix.value = uniforms.uReassemblyMix.value;
    }

    // updateReflection(dt); // Removed
  } catch (err) {
    console.error("[HeroBlock] animate loop error:", err);
  }
}

function placeTile(
  tile: (typeof explosionState.tiles)[number],
  stage: "base" | "inflate" | "explode",
  stageProgress: number,
  isReassembling = false,
) {
  if (!mesh) return;
  if (stage === "base") {
    dummyPop.position.copy(tile.basePos);
    dummyPop.quaternion.copy(tile.baseQuat);
    dummyPop.scale.copy(tile.baseScale);
  } else {
    const eased =
      stage === "inflate"
        ? easeInOutCubic(stageProgress)
        : easeOutCubic(stageProgress);
    const distance =
      stage === "inflate"
        ? tile.inflateDist * eased
        : tile.inflateDist + tile.explodeDist * eased;
    tmpVec
      .copy(tile.travelDir)
      .multiplyScalar(distance)
      .addScaledVector(
        tile.swayDir,
        Math.sin(eased * Math.PI) * tile.swayMag,
      );
    dummyPop.position.copy(tile.basePos).add(tmpVec);
    const lift =
      stage === "inflate"
        ? eased * tile.lift * 0.6
        : tile.lift * (0.6 + eased * 0.8);
    dummyPop.position.z += lift;
    const spinAmount =
      stage === "inflate"
        ? eased * tile.spin * 0.5
        : tile.spin * (0.5 + eased * 0.5);
    tmpQuat2.setFromAxisAngle(axisZ, spinAmount);
    dummyPop.quaternion.copy(tile.baseQuat).multiply(tmpQuat2);
    const scaleFactor =
      stage === "inflate"
        ? 1 + eased * 0.24
        : Math.max(0.25, 1.18 - eased * 1.1);
    dummyPop.scale.copy(tile.baseScale).multiplyScalar(scaleFactor);
  }
  dummyPop.updateMatrix();
  mesh.setMatrixAt(tile.idx, dummyPop.matrix);
}

function applyBalloonAmount(amount: number) {
  if (!mesh || !explosionState.tiles.length) return;
  const clamped = Math.min(1.1, Math.max(0, amount));
  const isReassembling =
    assemblyState.active && assemblyState.to <= assemblyState.from;

  // NUCLEAR SAFEGUARD: If explosion is active, absolutely NO assembly updates allowed.
  if (isReassembling && explosionState.active) {
    console.warn("[HeroBlock] Conflict detected in applyBalloonAmount! Aborting assembly.");
    assemblyState.active = false;
    return;
  }

  explosionState.tiles.forEach((tile) => {
    const available = 1 - tile.delay;
    const shifted =
      available > 0 ? (clamped - tile.delay) / available : clamped;
    if (shifted <= 0) {
      placeTile(tile, "base", 0, isReassembling);
      return;
    }
    const localAmount = clamp01(shifted);
    if (localAmount < INFLATE_RATIO) {
      const local = clamp01(localAmount / INFLATE_RATIO);
      placeTile(tile, "inflate", local, isReassembling);
    } else {
      const local = clamp01(
        (localAmount - INFLATE_RATIO) / (1 - INFLATE_RATIO),
      );
      placeTile(tile, "explode", local, isReassembling);
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (uniforms?.uBaseOpacity) {
    const fade = THREE.MathUtils.lerp(
      baseOpacity,
      baseOpacity * 0.4,
      clamp01(clamped),
    );
    uniforms.uBaseOpacity.value = fade;
  }
  if (uniforms?.uColorMix) {
    // Morph to team colors as we explode
    // Gradual transition for smoother effect
    uniforms.uColorMix.value = smoothstep(0.0, 0.9, clamped);
  }
  explosionState.currentAmount = clamped;
}

function startIntroAssembly(startExploded = false) {
  console.log("[HeroBlock] startIntroAssembly called", { startExploded, explosionActive: explosionState.active });
  // Always unlock camera when assembling (returning to banner mode)
  isCameraLocked = false;

  whenReady().then(() => {
    console.log("[HeroBlock] startIntroAssembly woke up", { explosionActive: explosionState.active });
    // RACE CONDITION FIX: If explosion started while we were waiting for ready/texture,
    // do NOT start assembly. The explosion takes precedence.
    if (explosionState.active) {
      console.log("[HeroBlock] Aborting startIntroAssembly because explosion is active");
      return;
    }

    if (!explosionState.tiles.length) return;

    if (startExploded) {
      // For Team Reassembly: Start fully exploded and wait for API to drive it
      applyBalloonAmount(1.1);
      assemblyState.active = false;
      return;
    }

    console.log("[HeroBlock] Starting assembly animation");
    assemblyState.active = true;
    assemblyState.elapsed = 0;
    assemblyState.from = 0.95;
    assemblyState.to = 0;
    assemblyState.duration = 1.6;
    applyBalloonAmount(assemblyState.from);
  });
}

export function disposeHero() {
  console.log("[HeroBlock] disposeHero called", { disposed });
  if (disposed) return;
  disposed = true;
  removeEvents?.();
  composer?.dispose();
  renderer?.dispose();
  renderer = null;
  composer = null;
  scene = null;
  camera = null;
  mesh = null;
  uniforms = null;
  reflectionMesh = null;
  reflectionUniforms = null;
  baseTiles.length = 0;
  explosionState.tiles = [];
  explosionState.active = false;
  assemblyState.active = false;
  if (canvas) {
    if (canvas.__hero3d) delete canvas.__hero3d;
    // If we are disposing the persisted canvas, remove the ID so it doesn't get picked up again
    if (canvas.id === "hero-transition-canvas" || canvas === (window as any).__persistedHeroCanvas) {
      canvas.id = "";
      (window as any).__persistedHeroCanvas = null;
    }
  }
  dispatchHeroEvent("hero:block-disposed");
  isCameraLocked = false;
}

function startBalloonPop(opts: BalloonPopOptions = {}) {
  console.log("[HeroBlock] startBalloonPop called", { active: explosionState.active, shaderCompiled: isShaderCompiled, assemblyActive: assemblyState.active });
  if (explosionState.active) return Promise.resolve();

  // CRITICAL: Stop assembly IMMEDIATELY and force state to 0 to prevent race condition
  // If intro assembly is running when user clicks, we must kill it completely
  assemblyState.active = false;
  applyBalloonAmount(0); // Force tiles to base position NOW

  const {
    inflateDuration = 0.5,
    explodeDuration = 0.9,
    onExplodeStart,
    onComplete,
  } = opts;
  return new Promise<void>((resolve) => {
    // CRITICAL FIX: Wait for shader compilation before starting animation
    const startAnimation = () => {
      console.log("[HeroBlock] startBalloonPop animation starting (shaders ready)");

      // Reset timing IMMEDIATELY before animation starts to prevent delta spikes
      prevTime = performance.now();

      // CRITICAL FIX: Always reset currentAmount to ensure clean start on every click
      // Without this, "Smart Start" logic can engage incorrectly after returning from team page
      explosionState.currentAmount = 0;

      // REMOVED: resizeToCanvas() - relying on ResizeObserver and animate loop to handle this.
      // Calling it here might cause jumps if layout is in flux.

      // Nuclear Option: Force hide the static image to prevent "Overlaying" glitch
      // Use display:none instead of opacity to ensure instant removal
      if (typeof document !== "undefined") {
        const staticImg = document.querySelector(".hero-static-img") as HTMLElement;
        if (staticImg) {
          staticImg.style.display = "none";
        }
      }

      explosionState.active = true;
      explosionState.inflateDuration = inflateDuration;
      explosionState.explodeDuration = explodeDuration;
      explosionState.callbacks = { onExplodeStart, onComplete };

      explosionState.resolve = () => {
        console.log("[HeroBlock] startBalloonPop resolved");
        explosionState.callbacks = {};
        resolve();
      };

      // Smart Start: Check where we are currently
      const current = explosionState.currentAmount || 0;
      console.log("[HeroBlock] Smart Start Check", { current, inflateRatio: INFLATE_RATIO });

      if (current > 0.01) {
        console.log("[HeroBlock] Smart Start from", current);

        if (current < INFLATE_RATIO) {
          explosionState.phase = "inflate";
          const progress = current / INFLATE_RATIO;
          explosionState.elapsed = progress * inflateDuration;
          console.log("[HeroBlock] Smart Start Phase: INFLATE", { progress, elapsed: explosionState.elapsed });
        } else {
          explosionState.phase = "explode";
          const progress = (current - INFLATE_RATIO) / (1 - INFLATE_RATIO);
          explosionState.elapsed = progress * explodeDuration;
          console.log("[HeroBlock] Smart Start Phase: EXPLODE", { progress, elapsed: explosionState.elapsed });
          if (onExplodeStart) onExplodeStart();
        }
      } else {
        // Clean start
        console.log("[HeroBlock] Clean Start");
        explosionState.phase = "inflate";
        explosionState.elapsed = 0;
        applyBalloonAmount(0);
      }

      // Ensure morph is disabled so it doesn't flatten the explosion
      if (uniforms) {
        if (uniforms.uMorphProgress) uniforms.uMorphProgress.value = 0;
        // Disable hover effects during explosion to prevent shader conflicts
        if (uniforms.uHover) uniforms.uHover.value = 0;
      }
      hoverTarget = 0;

      if (!explosionState.tiles.length) {
        // Should not happen
      }
    };

    // If shaders not compiled yet, wait for them to prevent first-run glitch
    if (!isShaderCompiled && shaderCompilePromise) {
      console.log("[HeroBlock] Waiting for shader compilation before starting explosion...");
      shaderCompilePromise.then(startAnimation);
    } else {
      startAnimation();
    }
  });
}

function runBalloonPop(opts: BalloonPopOptions = {}) {
  return whenReady().then(() => startBalloonPop(opts));
}

function computeBalloonProgress(progress: number) {
  const clamped = clamp01(progress);
  if (clamped <= INFLATE_RATIO) {
    const local = clamped / INFLATE_RATIO;
    return INFLATE_RATIO * easeInCubic(local);
  }
  const local = (clamped - INFLATE_RATIO) / (1 - INFLATE_RATIO);
  return INFLATE_RATIO + (1 - INFLATE_RATIO) * easeOutCubic(local);
}

function setReassemblyTargets(rects: { x: number; y: number; w: number; h: number; roleId?: string }[]) {
  if (!mesh || !camera || !rects.length) return;

  const count = mesh.count;
  const attr = mesh.geometry.getAttribute("aReassemblyPos") as THREE.InstancedBufferAttribute;
  const array = attr.array as Float32Array;

  const vec = new THREE.Vector3();

  // Map roleId to colorType
  const roleToColor: Record<string, number> = {
    "driver": 0, "builder": 0,    // Cyan
    "designer": 1,                // Magenta
    "notebooker": 2,              // Gold
    "coder": 3,                   // Emerald
  };

  // Group rects by color type
  const rectsByColor: Record<number, typeof rects> = { 0: [], 1: [], 2: [], 3: [] };
  rects.forEach(r => {
    const c = roleToColor[r.roleId || ""] ?? 3;
    rectsByColor[c].push(r);
  });

  explosionState.tiles.forEach(tile => {
    const colorRects = rectsByColor[tile.colorType];
    // Fallback to any rect if no match found (shouldn't happen if all roles covered)
    const targetRect = colorRects.length ? colorRects[Math.floor(Math.random() * colorRects.length)] : rects[Math.floor(Math.random() * rects.length)];

    const rx = targetRect.x + (Math.random() - 0.5) * targetRect.w;
    const ry = targetRect.y + (Math.random() - 0.5) * targetRect.h;

    vec.set(rx, ry, 0.5);
    vec.unproject(camera!);
    vec.sub(camera!.position).normalize();
    const distance = -camera!.position.z / vec.z;
    const worldPos = camera!.position.clone().add(vec.multiplyScalar(distance));

    array[tile.idx * 3] = worldPos.x;
    array[tile.idx * 3 + 1] = worldPos.y;
    array[tile.idx * 3 + 2] = worldPos.z;
  });

  attr.needsUpdate = true;
}

function runReassembly(duration = 1.2) {
  return new Promise<void>((resolve) => {
    // CRITICAL: If explosion is active, wait for it to complete first
    // Instead of polling, register a callback to avoid frame drops
    const startReassembly = () => {
      console.log("[HeroBlock] runReassembly starting", { explosionActive: explosionState.active });
      const start = performance.now();

      const tick = () => {
        const now = performance.now();
        const p = Math.min(1, (now - start) / (duration * 1000));
        const ease = easeInOutCubic(p);

        if (uniforms) {
          uniforms.uReassemblyMix.value = ease;
          uniforms.uColorMix.value = Math.max(uniforms.uColorMix.value, ease);
        }

        if (p < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };

      tick();
    };

    if (explosionState.active) {
      console.log("[HeroBlock] runReassembly waiting for explosion...");
      // Register callback instead of polling to avoid frame drops
      explosionState.reassemblyCallback = startReassembly;
    } else {
      startReassembly();
    }
  });
}

function runToCards(opts: { targetRects?: CardRect[]; duration?: number } = {}) {
  if (unifiedAnimationState.active) return Promise.resolve();

  return whenReady().then(() => {
    // Stop other animations
    explosionState.active = false;
    assemblyState.active = false;

    // Set target positions if provided
    if (opts.targetRects?.length) {
      setReassemblyTargets(opts.targetRects);
    }

    return new Promise<void>((resolve) => {
      unifiedAnimationState.duration = opts.duration || 1.4;
      unifiedAnimationState.elapsed = 0;
      unifiedAnimationState.progress = 0;
      unifiedAnimationState.resolve = resolve;

      // Reset shader states
      applyBalloonAmount(0);
      if (uniforms) uniforms.uReassemblyMix.value = 0;

      unifiedAnimationState.active = true;
      console.log("[HeroBlock] runToCards started, duration:", unifiedAnimationState.duration);
    });
  });
}

function runMorph(duration = 0.6) {
  return new Promise<void>((resolve) => {
    const start = performance.now();

    const tick = () => {
      const now = performance.now();
      const p = Math.min(1, (now - start) / (duration * 1000));

      // Spike curve: 0 -> 1 -> 0
      // We want it to hang at 1 slightly? No, just a pulse.
      // Actually, let's just go 0 -> 1. The caller can handle the rest or we can do a full pulse.
      // Let's do a full pulse 0 -> 1 -> 0 so it returns to normal (or disappears)
      // But wait, we want to hide the canvas at the peak.
      // So let's just drive uMorphProgress from 0 -> 1.

      if (uniforms) {
        uniforms.uMorphProgress.value = p;
      }

      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };

    tick();
  });
}

function attachHeroAPI() {
  if (!canvas) return;
  canvas.__hero3d = {
    getRenderer: () => renderer,
    getScene: () => scene,
    getCamera: () => camera,
    getMesh: () => mesh,
    getUniforms: () => uniforms,
    THREE,
    runBalloonPop,
    reassemble: startIntroAssembly,
    setReassemblyTargets,
    runReassembly,
    runMorph,
    runToCards,
    setCameraLocked: (locked: boolean) => {
      isCameraLocked = locked;
    },
  };
  dispatchHeroEvent("hero:block-attached");
}

function runHero(opts?: { startExploded?: boolean; canvas?: HTMLCanvasElement }) {
  if (opts?.canvas) {
    canvas = opts.canvas;
  } else if (!syncCanvas() || !canvas) {
    disposeHero();
    return;
  }

  if (!renderer || disposed) {
    init(opts);
  } else if (!canvas.__hero3d) {
    attachHeroAPI();
  }
}

export function bootHero(opts?: { startExploded?: boolean; canvas?: HTMLCanvasElement }) {
  if (typeof window === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => runHero(opts), {
      once: true,
    });
  } else {
    runHero(opts);
  }
}

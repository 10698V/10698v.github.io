/**
 * inkBlot.ts
 * Notebooker CRT ink system:
 * - no plate
 * - full-screen CRT texture always visible
 * - random droplet sizes (small / medium / very big)
 * - splatters across the entire viewport
 */
import { FrameBudget } from "./frame-budget";
import { registerRafLoop } from "./raf-governor";

type Drop = {
  x: number;
  y: number;
  z: number;
  vz: number;
  startZ: number;
  radius: number;
  alpha: number;
  color: string;
};

type Splash = {
  originX: number;
  originY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  age: number;
  life: number;
  rot: number;
  spin: number;
  seed: number;
  morph: number;
  morphVel: number;
  biasX: number;
  biasY: number;
  targetBiasX: number;
  targetBiasY: number;
  biasLerp: number;
  biasLerpVel: number;
  profileA: number[];
  profileB: number[];
};

type Pool = {
  x: number;
  y: number;
  rx: number;
  ry: number;
  alpha: number;
};

type Ripple = {
  x: number;
  y: number;
  r: number;
  alpha: number;
  growth: number;
};

type Blot = {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  age: number;
  lifetime: number;
  seed: number;
  shapeSeed: number;
  morph: number;
  morphVel: number;
  skewX: number;
  skewY: number;
  targetSkewX: number;
  targetSkewY: number;
  skewLerp: number;
  skewLerpVel: number;
  profileA: number[];
  profileB: number[];
  color: string;
};

type StampState = {
  label: string;
  x: number;
  y: number;
  rot: number;
};

const INK_COLORS = [
  "rgba(20, 37, 76, 0.96)",
  "rgba(41, 24, 87, 0.9)",
  "rgba(10, 17, 35, 0.95)",
  "rgba(76, 49, 18, 0.78)",
];

const SPAWN_INTERVAL_MIN = 420;
const SPAWN_INTERVAL_MAX = 1150;
const STAMP_INTERVAL_MIN = 3600;
const STAMP_INTERVAL_MAX = 7600;
const Z_GRAVITY = 980;
const DPR_CAP = 1.5;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const PROFILE_POINTS = 17;
const SPLASH_PROFILE_POINTS = 10;
const fract = (v: number) => v - Math.floor(v);
const hashNoise = (v: number) => fract(Math.sin(v * 12.9898) * 43758.5453);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const makeShapeProfile = (seed: number) => {
  const profile: number[] = [];
  for (let i = 0; i < PROFILE_POINTS; i += 1) {
    const u = i / (PROFILE_POINTS - 1);
    const center = 1 - Math.abs(u - 0.5) * 1.65;
    const bottomBias = smoothstep((u - 0.62) / 0.38);
    const n1 = hashNoise(seed + i * 0.73) - 0.5;
    const n2 = hashNoise(seed * 1.3 + i * 1.91) - 0.5;
    const wave = Math.sin((u * 3.1 + seed * 0.07) * Math.PI * 2) * 0.08;
    const drip = bottomBias * (hashNoise(seed * 2.1 + i * 0.53) - 0.5) * 0.34;
    const val = 0.58 + center * 0.55 + n1 * 0.4 + n2 * 0.22 + wave + drip;
    profile.push(Math.max(0.26, Math.min(1.7, val)));
  }
  return profile;
};

const makeSplashProfile = (seed: number) => {
  const profile: number[] = [];
  const lobeCount = 2 + Math.floor(hashNoise(seed * 0.37) * 4);
  const dipCount = 1 + Math.floor(hashNoise(seed * 0.73) * 3);
  const centers = Array.from({ length: lobeCount }, (_, i) => hashNoise(seed + i * 1.67));
  const dips = Array.from({ length: dipCount }, (_, i) => hashNoise(seed * 1.31 + i * 2.11));
  for (let i = 0; i < SPLASH_PROFILE_POINTS; i += 1) {
    const u = i / SPLASH_PROFILE_POINTS;
    const n1 = hashNoise(seed + i * 0.91) - 0.5;
    const n2 = hashNoise(seed * 1.7 + i * 1.33) - 0.5;
    let val = 0.58 + n1 * 0.85 + n2 * 0.45;

    for (let k = 0; k < centers.length; k += 1) {
      const c = centers[k] ?? 0.5;
      const d = Math.min(Math.abs(u - c), 1 - Math.abs(u - c));
      const amp = 0.55 + hashNoise(seed * 2.4 + k * 0.53) * 0.95;
      const width = 0.08 + hashNoise(seed * 3.9 + k * 0.81) * 0.15;
      val += amp * Math.exp(-(d * d) / (width * width));
    }

    for (let k = 0; k < dips.length; k += 1) {
      const c = dips[k] ?? 0.5;
      const d = Math.min(Math.abs(u - c), 1 - Math.abs(u - c));
      const amp = 0.35 + hashNoise(seed * 4.6 + k * 0.77) * 0.7;
      const width = 0.06 + hashNoise(seed * 5.7 + k * 0.44) * 0.12;
      val -= amp * Math.exp(-(d * d) / (width * width));
    }

    profile.push(Math.max(0.08, Math.min(2.7, val)));
  }
  return profile;
};

const sampleProfile = (profile: number[], u: number) => {
  const p = Math.max(0, Math.min(0.9999, u)) * (profile.length - 1);
  const i0 = Math.floor(p);
  const i1 = Math.min(profile.length - 1, i0 + 1);
  const f = p - i0;
  return lerp(profile[i0] ?? 1, profile[i1] ?? 1, f);
};

const pickDropRadius = () => {
  const t = Math.random();
  if (t < 0.52) return rand(2.1, 4.2);  // small
  if (t < 0.88) return rand(5.0, 9.2);  // medium
  return rand(10.5, 17.8);              // very big
};

type InkDripOptions = {
  palette?: string[];
  loopId?: string;
  fps?: number;
  dprCaps?: number[];
};

export const attachInkDrips = (
  container: HTMLElement,
  options: InkDripOptions = {},
) => {
  const canvas = document.createElement("canvas");
  canvas.className = "inkdrips-canvas";
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  });

  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  container.appendChild(canvas);

  let width = 1;
  let height = 1;
  const dprCaps = options.dprCaps?.length ? options.dprCaps : [DPR_CAP, 1.25, 1.0];
  let dprTier = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, dprCaps[dprTier] ?? DPR_CAP);
  let running = true;

  const frameBudget = new FrameBudget({
    sampleSize: 90,
    downshiftThresholdMs: 22,
    restoreThresholdMs: 16.5,
    cooldownMs: 1200,
    maxTier: Math.max(0, dprCaps.length - 1),
  });

  const drops: Drop[] = [];
  const splashes: Splash[] = [];
  const pools: Pool[] = [];
  const ripples: Ripple[] = [];
  const blots: Blot[] = [];

  let spawnMs = 0;
  let nextSpawn = rand(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_MAX);
  let scanOffset = 0;
  let textureOffset = 0;
  let beamY = 0;
  let stampFlash = 0;
  let stampTimer = 0;
  let nextStamp = rand(STAMP_INTERVAL_MIN, STAMP_INTERVAL_MAX);
  let stampState: StampState | null = null;

  const palette = options.palette?.length ? options.palette : INK_COLORS;

  const resize = () => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, dprCaps[dprTier] ?? dprCaps[dprCaps.length - 1] ?? 1.0);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const spawnDrop = () => {
    const startZ = rand(55, 160);
    drops.push({
      x: rand(0, width),
      y: rand(0, height),
      z: startZ,
      vz: rand(50, 130),
      startZ,
      radius: pickDropRadius(),
      alpha: rand(0.7, 0.96),
      color: palette[Math.floor(Math.random() * palette.length)] ?? INK_COLORS[0],
    });
  };

  const spawnImpact = (drop: Drop) => {
    const shapeSeed = Math.random() * 1000;
    blots.push({
      x: drop.x,
      y: drop.y,
      radius: drop.radius * rand(1.45, 2.6),
      alpha: rand(0.58, 0.9),
      age: 0,
      lifetime: rand(3.6, 7.6),
      seed: Math.random() * Math.PI * 2,
      shapeSeed,
      morph: Math.random(),
      morphVel: rand(0.08, 0.2),
      skewX: rand(-0.18, 0.18),
      skewY: rand(-0.14, 0.14),
      targetSkewX: rand(-0.24, 0.24),
      targetSkewY: rand(-0.2, 0.2),
      skewLerp: Math.random(),
      skewLerpVel: rand(0.08, 0.2),
      profileA: makeShapeProfile(shapeSeed),
      profileB: makeShapeProfile(shapeSeed + 19.31),
      color: drop.color,
    });

    pools.push({
      x: drop.x,
      y: drop.y,
      rx: drop.radius * rand(1.18, 2.4),
      ry: drop.radius * rand(0.62, 1.4),
      alpha: rand(0.66, 0.96),
    });

    ripples.push({
      x: drop.x,
      y: drop.y,
      r: drop.radius * rand(0.68, 1.45),
      alpha: rand(0.38, 0.66),
      growth: rand(14, 30),
    });

    const particleCount = 6 + Math.floor(drop.radius * 1.3) + Math.floor(Math.random() * 8);
    for (let i = 0; i < particleCount; i += 1) {
      const seed = Math.random() * 1000;
      const angle = rand(0, Math.PI * 2);
      const speed = rand(4, 20) * (0.7 + drop.radius * 0.024);
      splashes.push({
        originX: drop.x,
        originY: drop.y,
        x: drop.x,
        y: drop.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * rand(0.58, 0.96),
        radius: rand(1.4, 5.4) * (0.9 + drop.radius * 0.075),
        alpha: rand(0.54, 0.9),
        age: 0,
        life: rand(4.2, 7.5),
        rot: rand(0, Math.PI * 2),
        spin: rand(-1.2, 1.2),
        seed,
        morph: Math.random(),
        morphVel: rand(0.16, 0.4),
        biasX: rand(-0.3, 0.3),
        biasY: rand(-0.25, 0.25),
        targetBiasX: rand(-0.35, 0.35),
        targetBiasY: rand(-0.3, 0.3),
        biasLerp: Math.random(),
        biasLerpVel: rand(0.14, 0.32),
        profileA: makeSplashProfile(seed),
        profileB: makeSplashProfile(seed + 13.7),
      });
    }
  };

  const drawRorschachBlot = (blot: Blot) => {
    const t = clamp01(blot.age / blot.lifetime);
    const fade = t < 0.72 ? 1 : 1 - smoothstep((t - 0.72) / 0.28);
    const settle = smoothstep(Math.min(1, t * 1.2));
    const pulse =
      1 +
      0.09 * Math.sin((t * 6 + blot.seed) * Math.PI * 2) +
      0.05 * Math.sin((t * 11 + blot.seed * 0.7) * Math.PI * 2);
    const majorR = blot.radius * (0.72 + settle * 1.24) * pulse;
    const minorR = majorR * (0.76 + 0.12 * Math.sin(blot.seed * 1.31));
    const morphMix = smoothstep(blot.morph);
    const skewMix = smoothstep(blot.skewLerp);
    const skewX = lerp(blot.skewX, blot.targetSkewX, skewMix);
    const skewY = lerp(blot.skewY, blot.targetSkewY, skewMix);

    const px = majorR * 0.32;
    const py = majorR * 0.12;
    const ny = majorR * 0.03;
    const steps = 40;

    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      const ang = -Math.PI / 2 + u * Math.PI;
      const shapeA = sampleProfile(blot.profileA, u);
      const shapeB = sampleProfile(blot.profileB, u);
      const profile = lerp(shapeA, shapeB, morphMix);
      const wiggle =
        0.08 * Math.sin((u * 9 + blot.seed * 0.4 + blot.age * 1.35) * Math.PI * 2) +
        0.05 * Math.sin((u * 15 + blot.seed * 0.9 + blot.age * 2.1) * Math.PI * 2);
      const shape = Math.max(0.2, profile + wiggle);
      const rx = (majorR * shape) * Math.cos(ang);
      const ry = (minorR * (0.82 + shape * 0.28)) * Math.sin(ang);
      const warpX = skewX * majorR * Math.sin(ang * 2 + blot.seed * 0.8);
      const warpY = skewY * minorR * Math.cos(ang * 3 + blot.seed * 1.1);
      const x = blot.x + rx + px + warpX;
      const y = blot.y + ry + py + ny + warpY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i -= 1) {
      const u = i / steps;
      const ang = -Math.PI / 2 + u * Math.PI;
      const shapeA = sampleProfile(blot.profileA, u);
      const shapeB = sampleProfile(blot.profileB, u);
      const profile = lerp(shapeA, shapeB, morphMix);
      const wiggle =
        0.08 * Math.sin((u * 9 + blot.seed * 0.4 + blot.age * 1.35) * Math.PI * 2) +
        0.05 * Math.sin((u * 15 + blot.seed * 0.9 + blot.age * 2.1) * Math.PI * 2);
      const shape = Math.max(0.2, profile + wiggle);
      const rx = (majorR * shape) * Math.cos(ang);
      const ry = (minorR * (0.82 + shape * 0.28)) * Math.sin(ang);
      const warpX = skewX * majorR * Math.sin(ang * 2 + blot.seed * 0.8);
      const warpY = skewY * minorR * Math.cos(ang * 3 + blot.seed * 1.1);
      const x = blot.x - rx - px - warpX;
      const y = blot.y + ry + py + ny + warpY;
      ctx.lineTo(x, y);
    }
    ctx.closePath();

    const a = blot.alpha * fade;
    ctx.fillStyle = blot.color.replace(/[\d.]+\)$/, `${Math.max(0.15, a)})`);
    ctx.fill();

    // Inner darker core that shifts shape over time.
    ctx.beginPath();
    ctx.ellipse(
      blot.x,
      blot.y + majorR * 0.03,
      majorR * (0.28 + 0.12 * Math.sin(t * 8 + blot.seed)),
      minorR * (0.2 + 0.09 * Math.cos(t * 6 + blot.seed * 0.7)),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = `rgba(10, 16, 40, ${0.22 * fade})`;
    ctx.fill();
  };

  const drawMorphSplash = (s: Splash) => {
    const lifeT = clamp01(s.age / s.life);
    const fade = lifeT < 0.58 ? 1 : 1 - smoothstep((lifeT - 0.58) / 0.42);
    const morphMix = smoothstep(s.morph);
    const biasMix = smoothstep(s.biasLerp);
    const biasX = lerp(s.biasX, s.targetBiasX, biasMix);
    const biasY = lerp(s.biasY, s.targetBiasY, biasMix);
    const steps = 20;
    const sy = 0.62 + 0.52 * (0.5 + 0.5 * Math.sin(s.seed * 0.7 + s.age * 2.45));

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      const ang = u * Math.PI * 2;
      const a = sampleProfile(s.profileA, u);
      const b = sampleProfile(s.profileB, u);
      const shape = lerp(a, b, morphMix);
      const jitter =
        0.18 * Math.sin((u * 8 + s.seed * 0.4 + s.age * 2.9) * Math.PI * 2) +
        0.11 * Math.sin((u * 14 + s.seed * 0.8 + s.age * 4.1) * Math.PI * 2);
      const rr = s.radius * Math.max(0.06, shape + jitter);
      const warpX = 1 + biasX * Math.cos(ang * 2.2 + s.seed * 0.43);
      const warpY = 1 + biasY * Math.sin(ang * 2.8 + s.seed * 0.67);
      const px = Math.cos(ang) * rr * warpX;
      const py = Math.sin(ang) * rr * sy * warpY;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(34, 55, 118, ${Math.min(1, s.alpha * fade * 1.25)})`;
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, 0, s.radius * 0.3, s.radius * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(16, 28, 76, ${0.24 * fade})`;
    ctx.fill();
    ctx.restore();
  };

  const drawCrtBackdrop = () => {
    // Keep CRT presence visible at all times.
    ctx.fillStyle = "rgba(2, 7, 18, 0.38)";
    ctx.fillRect(0, 0, width, height);

    const phosphor = ctx.createLinearGradient(0, 0, 0, height);
    phosphor.addColorStop(0, "rgba(70, 118, 210, 0.07)");
    phosphor.addColorStop(0.52, "rgba(14, 40, 94, 0.03)");
    phosphor.addColorStop(1, "rgba(0, 6, 15, 0.15)");
    ctx.fillStyle = phosphor;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(
      width * 0.38,
      height * 0.28,
      Math.min(width, height) * 0.06,
      width * 0.52,
      height * 0.56,
      Math.max(width, height) * 0.95,
    );
    glow.addColorStop(0, "rgba(92, 160, 255, 0.16)");
    glow.addColorStop(1, "rgba(2, 7, 18, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const vignette = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      Math.min(width, height) * 0.14,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.82,
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.56)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  };

  const drawScrollTexture = () => {
    ctx.strokeStyle = "rgba(210, 190, 155, 0.065)";
    ctx.lineWidth = 0.62;
    const lineSpacing = 13;
    for (let y = -lineSpacing + textureOffset; y < height + lineSpacing; y += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  };

  const drawCRTScanlines = () => {
    ctx.fillStyle = "rgba(210, 236, 255, 0.05)";
    for (let y = scanOffset; y < height; y += 3) {
      ctx.fillRect(0, y, width, 1);
    }

    const beamGrad = ctx.createLinearGradient(0, beamY - 40, 0, beamY + 40);
    beamGrad.addColorStop(0, "rgba(120, 220, 255, 0)");
    beamGrad.addColorStop(0.5, "rgba(120, 220, 255, 0.22)");
    beamGrad.addColorStop(1, "rgba(120, 220, 255, 0)");
    ctx.fillStyle = beamGrad;
    ctx.fillRect(0, beamY - 40, width, 80);
  };

  const drawStampFlash = () => {
    if (stampFlash <= 0 || !stampState) return;
    ctx.save();
    ctx.translate(stampState.x, stampState.y);
    ctx.rotate(stampState.rot);
    ctx.font = `bold ${Math.max(10, Math.round(width / 18))}px "Press Start 2P", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = `rgba(220, 38, 38, ${stampFlash * 0.72})`;
    ctx.lineWidth = 2;
    ctx.strokeText(stampState.label, 0, 0);
    ctx.fillStyle = `rgba(220, 38, 38, ${stampFlash * 0.28})`;
    ctx.fillText(stampState.label, 0, 0);
    const tw = ctx.measureText(stampState.label).width;
    ctx.strokeRect(-tw / 2 - 8, -10, tw + 16, 20);
    ctx.restore();
  };

  const tick = (deltaMs: number, now: number) => {
    if (!running) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    const nextTier = frameBudget.push(deltaMs, now);
    if (nextTier !== dprTier) {
      dprTier = nextTier;
      resize();
    }

    ctx.clearRect(0, 0, width, height);
    drawCrtBackdrop();

    textureOffset = (textureOffset + dt * 8) % 14;
    scanOffset = (scanOffset + dt * 35) % 3;
    beamY = (beamY + dt * 68) % (height + 90);

    spawnMs += dt * 1000;
    if (spawnMs >= nextSpawn) {
      spawnMs = 0;
      nextSpawn = rand(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_MAX);
      spawnDrop();
    }

    stampTimer += dt * 1000;
    if (stampTimer >= nextStamp) {
      stampTimer = 0;
      nextStamp = rand(STAMP_INTERVAL_MIN, STAMP_INTERVAL_MAX);
      stampFlash = 1;
      const stamps = ["PASS", "INSPECTED", "APPROVED", "VERIFIED"];
      stampState = {
        label: stamps[Math.floor(Math.random() * stamps.length)] ?? "PASS",
        x: rand(width * 0.2, width * 0.8),
        y: rand(height * 0.22, height * 0.78),
        rot: rand(-0.25, 0.25),
      };
    }
    stampFlash = Math.max(0, stampFlash - dt * 2.6);
    if (stampFlash <= 0) stampState = null;

    drawScrollTexture();

    for (let i = blots.length - 1; i >= 0; i -= 1) {
      const b = blots[i];
      b.age += dt;
      b.morph += dt * b.morphVel;
      b.skewLerp += dt * b.skewLerpVel;
      if (b.morph >= 1) {
        b.morph -= 1;
        b.shapeSeed += rand(0.7, 2.2);
        b.profileA = b.profileB;
        b.profileB = makeShapeProfile(b.shapeSeed + b.age * 3.1);
      }
      if (b.skewLerp >= 1) {
        b.skewLerp -= 1;
        b.skewX = b.targetSkewX;
        b.skewY = b.targetSkewY;
        b.targetSkewX = rand(-0.24, 0.24);
        b.targetSkewY = rand(-0.2, 0.2);
      }
      if (b.age >= b.lifetime) {
        blots.splice(i, 1);
        continue;
      }
      drawRorschachBlot(b);
    }

    for (let i = pools.length - 1; i >= 0; i -= 1) {
      const p = pools[i];
      p.alpha -= dt * 0.036;
      p.rx += dt * 0.85;
      p.ry += dt * 0.42;
      if (p.alpha <= 0) {
        pools.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(22, 38, 96, ${Math.min(1, p.alpha * 1.1)})`;
      ctx.fill();
    }

    for (let i = ripples.length - 1; i >= 0; i -= 1) {
      const r = ripples[i];
      r.r += r.growth * dt;
      r.alpha -= dt * 0.24;
      if (r.alpha <= 0) {
        ripples.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.64, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(118, 176, 255, ${r.alpha})`;
      ctx.lineWidth = 1.15;
      ctx.stroke();
    }

    for (let i = splashes.length - 1; i >= 0; i -= 1) {
      const s = splashes[i];
      const pullX = (s.originX - s.x) * 2.8 * dt;
      const pullY = (s.originY - s.y) * 2.8 * dt;
      s.vx += pullX;
      s.vy += pullY;
      const drag = Math.exp(-5.6 * dt);
      s.vx *= drag;
      s.vy *= drag;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.alpha -= dt * 0.035;
      s.radius *= 0.99955;
      s.age += dt;
      s.rot += s.spin * dt;
      s.morph += dt * s.morphVel;
      s.biasLerp += dt * s.biasLerpVel;
      if (s.morph >= 1) {
        s.morph -= 1;
        s.seed += rand(2.4, 5.8);
        s.profileA = s.profileB;
        s.profileB = makeSplashProfile(s.seed + s.age * 5.1);
      }
      if (s.biasLerp >= 1) {
        s.biasLerp -= 1;
        s.biasX = s.targetBiasX;
        s.biasY = s.targetBiasY;
        s.targetBiasX = rand(-0.35, 0.35);
        s.targetBiasY = rand(-0.3, 0.3);
      }
      if (s.alpha <= 0 || s.radius < 0.4 || s.age >= s.life) {
        splashes.splice(i, 1);
        continue;
      }
      drawMorphSplash(s);
    }

    // Falling drops: drawn last so they read as above-screen droplets.
    for (let i = drops.length - 1; i >= 0; i -= 1) {
      const d = drops[i];
      d.vz += Z_GRAVITY * dt;
      d.z -= d.vz * dt;
      if (d.z <= 0) {
        spawnImpact(d);
        drops.splice(i, 1);
        continue;
      }

      const near = 1 - clamp01(d.z / d.startZ);
      // Ground shadow where impact will land.
      ctx.beginPath();
      ctx.ellipse(
        d.x,
        d.y,
        d.radius * (1.03 + near * 0.62),
        d.radius * (0.48 + near * 0.34),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = `rgba(8, 14, 28, ${0.08 + near * 0.23})`;
      ctx.fill();

      // Drop shape scales up as it approaches the screen.
      const scale = 0.28 + near * 0.96;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius * scale, 0, Math.PI * 2);
      ctx.fillStyle = d.color.replace(
        /[\d.]+\)$/,
        `${Math.max(0.24, d.alpha * (0.54 + near * 0.46))})`,
      );
      ctx.fill();
    }

    drawCRTScanlines();
    drawStampFlash();

    while (drops.length > 36) drops.shift();
    while (splashes.length > 520) splashes.shift();
    while (pools.length > 180) pools.shift();
    while (ripples.length > 84) ripples.shift();
    while (blots.length > 42) blots.shift();

  };

  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  resize();
  const loop = registerRafLoop(options.loopId ?? `role-notebooker:${Math.random().toString(36).slice(2)}`, {
    fps: options.fps ?? 30,
    autoPauseOnHidden: true,
    onTick: ({ deltaMs, now }) => tick(deltaMs, now),
  });
  loop.start();

  return () => {
    running = false;
    loop.destroy();
    ro.disconnect();
    canvas.remove();
  };
};

// Backward-compatible alias
export const attachInkBlot = attachInkDrips;

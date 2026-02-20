/**
 * builderForge.ts
 * Builder viewport revamp:
 * - exploded-view snap assembly against chassis ghost
 * - PSI gauge + piston actuation synced to snaps
 * - forge stamp micro-event
 */
import { FrameBudget } from "./frame-budget";
import { registerRafLoop } from "./raf-governor";

type PartKind =
  | "c_channel"
  | "gusset"
  | "bearing"
  | "shaft"
  | "gear"
  | "sprocket"
  | "omni_wheel"
  | "piston"
  | "motor"
  | "frame_rail"
  | "standoff"
  | "axle_collar";

type PartDef = {
  label: string;
  kind: PartKind;
  targetX: number;
  targetY: number;
  w: number;
  h: number;
};

type PartState = PartDef & {
  active: boolean;
  status: "exploded" | "snapping" | "locked";
  x: number;
  y: number;
  phase: number;
  snapFromX: number;
  snapFromY: number;
  snapElapsed: number;
  snapDur: number;
  overshootPx: number;
};

type Ring = {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  r0: number;
  r1: number;
  alpha: number;
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
};

type Stamp = {
  active: boolean;
  text: string;
  time: number;
  slamDur: number;
  fadeDur: number;
};

type PistonCycle = {
  active: boolean;
  time: number;
  duration: number;
  originX: number;
  originY: number;
  emittedBurst: boolean;
};

const DPR_CAP = 1.5;
const FPS_AMBIENT_MS = 1000 / 30;
const SNAP_MIN_S = 0.58;
const SNAP_MAX_S = 0.92;
const SNAP_DUR_MIN_S = 0.34;
const SNAP_DUR_MAX_S = 0.54;
const HOLD_COMPLETE_S = 0.82;
const SUMMON_MIN_S = 0.45;
const SUMMON_MAX_S = 0.72;
const STAMP_MIN_S = 10;
const STAMP_MAX_S = 14;
const BASE_PSI = 82;
const MAX_PSI = 120;

const PARTS: PartDef[] = [
  { label: "C-CHANNEL", kind: "c_channel", targetX: 0.34, targetY: 0.5, w: 0.28, h: 0.055 },
  { label: "GUSSET", kind: "gusset", targetX: 0.48, targetY: 0.38, w: 0.1, h: 0.09 },
  { label: "BEARING", kind: "bearing", targetX: 0.58, targetY: 0.43, w: 0.085, h: 0.085 },
  { label: "SHAFT", kind: "shaft", targetX: 0.53, targetY: 0.58, w: 0.23, h: 0.028 },
  { label: "GEAR", kind: "gear", targetX: 0.66, targetY: 0.52, w: 0.11, h: 0.11 },
  { label: "SPROCKET", kind: "sprocket", targetX: 0.73, targetY: 0.4, w: 0.1, h: 0.1 },
  { label: "OMNI WHEEL", kind: "omni_wheel", targetX: 0.27, targetY: 0.66, w: 0.14, h: 0.14 },
  { label: "PISTON", kind: "piston", targetX: 0.78, targetY: 0.62, w: 0.06, h: 0.18 },
  { label: "MOTOR", kind: "motor", targetX: 0.41, targetY: 0.64, w: 0.14, h: 0.11 },
  { label: "FRAME RAIL", kind: "frame_rail", targetX: 0.58, targetY: 0.66, w: 0.3, h: 0.052 },
  { label: "STANDOFF", kind: "standoff", targetX: 0.62, targetY: 0.34, w: 0.052, h: 0.112 },
  { label: "AXLE COLLAR", kind: "axle_collar", targetX: 0.71, targetY: 0.59, w: 0.08, h: 0.08 },
];

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const smoothstep = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const easeOutBackSmall = (t: number) => {
  const x = clamp(t, 0, 1);
  const overshoot = 0.35;
  const c3 = overshoot + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + overshoot * Math.pow(x - 1, 2);
};

const shuffle = <T,>(items: T[]) => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = next[i];
    next[i] = next[j];
    next[j] = a;
  }
  return next;
};

type BuilderForgeOptions = {
  onPsi?: (psi: number) => void;
  loopId?: string;
  fps?: number;
  dprCaps?: number[];
  burstFps?: number;
};

export const attachBuilderForge = (
  container: HTMLElement,
  options: BuilderForgeOptions = {},
) => {
  const canvas = document.createElement("canvas");
  canvas.className = "builder-forge-canvas";
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
  let lastAmbientStepTs = 0;
  let currentLoopFps = options.fps ?? 30;

  const frameBudget = new FrameBudget({
    sampleSize: 90,
    downshiftThresholdMs: 22,
    restoreThresholdMs: 16.5,
    cooldownMs: 1200,
    maxTier: Math.max(0, dprCaps.length - 1),
  });

  let loopMode: "summon" | "assemble" | "hold" = "summon";
  let summonTime = 0;
  let summonDur = rand(SUMMON_MIN_S, SUMMON_MAX_S);
  let holdTime = 0;
  let nextSnapIn = rand(SNAP_MIN_S, SNAP_MAX_S);
  let stampCooldown = rand(STAMP_MIN_S, STAMP_MAX_S);
  let stampClock = 0;

  let psi = BASE_PSI;
  let snapCount = 0;
  let snapOrder: string[] = [];
  let snapCursor = 0;
  let partIndex = new Map<string, PartState>();
  let parts: PartState[] = [];

  const rings: Ring[] = [];
  const sparks: Spark[] = [];
  const stamp: Stamp = {
    active: false,
    text: "INSPECTED // PASS",
    time: 0,
    slamDur: 0.17,
    fadeDur: 0.56,
  };
  const piston: PistonCycle = {
    active: false,
    time: 0,
    duration: 0.8,
    originX: 0.78,
    originY: 0.62,
    emittedBurst: false,
  };

  const toPx = (xN: number, yN: number) => ({ x: xN * width, y: yN * height });
  const pxToNormX = (px: number) => px / Math.max(1, width);
  const pxToNormY = (px: number) => px / Math.max(1, height);

  const resize = () => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, dprCaps[dprTier] ?? dprCaps[dprCaps.length - 1] ?? 1.0);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    resetLoop();
  };

  const spawnRing = (xN: number, yN: number, lifeMs: number, r0: number, r1: number, alpha = 0.8) => {
    const p = toPx(xN, yN);
    rings.push({
      x: p.x,
      y: p.y,
      life: lifeMs / 1000,
      maxLife: lifeMs / 1000,
      r0,
      r1,
      alpha,
    });
  };

  const spawnSparks = (xN: number, yN: number, minCount: number, maxCount: number) => {
    const p = toPx(xN, yN);
    const count = Math.floor(rand(minCount, maxCount + 1));
    const safeCount = clamp(count, 1, 16);
    for (let i = 0; i < safeCount; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(38, 108);
      sparks.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rand(0.22, 0.32),
        maxLife: 0.32,
        size: rand(1.1, 2.3),
      });
    }
  };

  const triggerStamp = (text?: string) => {
    stamp.active = true;
    stamp.text = text ?? (Math.random() < 0.5 ? "INSPECTED // PASS" : "TORQUE VERIFIED");
    stamp.time = 0;
    stamp.slamDur = rand(0.14, 0.2);
    stamp.fadeDur = rand(0.4, 0.7);
    spawnSparks(0.5, 0.5, 10, 16);
  };

  const triggerPistonCycle = () => {
    const pistonPart = partIndex.get("PISTON");
    piston.active = true;
    piston.time = 0;
    piston.duration = rand(0.7, 0.9);
    piston.originX = pistonPart?.targetX ?? 0.78;
    piston.originY = pistonPart?.targetY ?? 0.62;
    piston.emittedBurst = false;
  };

  const partFillColor = () => "rgba(7, 36, 66, 0.9)";
  const partStrokeColor = () => "rgba(110, 237, 255, 0.92)";

  const drawCircle = (x: number, y: number, r: number, fill: string, stroke?: string) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  };

  const drawPart = (p: PartState) => {
    if (!p.active) return;

    const px = p.x * width;
    const py = p.y * height;
    const w = p.w * width;
    const h = p.h * height;

    const drift = p.status === "exploded" ? Math.sin(p.phase) * 1.6 : 0;
    const x = px + drift;
    const y = py;

    ctx.save();
    ctx.translate(x, y);
    if (p.kind === "shaft") ctx.rotate(0.12);

    if (p.kind === "c_channel") {
      ctx.fillStyle = partFillColor();
      ctx.strokeStyle = partStrokeColor();
      ctx.lineWidth = 1.2;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.strokeRect(-w / 2 + 3, -h / 2 + 2, w - 6, h - 4);
    } else if (p.kind === "gusset") {
      ctx.beginPath();
      ctx.moveTo(-w / 2, h / 2);
      ctx.lineTo(w / 2, h / 2);
      ctx.lineTo(-w / 2, -h / 2);
      ctx.closePath();
      ctx.fillStyle = partFillColor();
      ctx.fill();
      ctx.strokeStyle = partStrokeColor();
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (p.kind === "bearing") {
      drawCircle(0, 0, Math.min(w, h) * 0.45, "rgba(11, 44, 80, 0.92)", partStrokeColor());
      drawCircle(0, 0, Math.min(w, h) * 0.2, "rgba(2, 12, 25, 0.92)", "rgba(124, 238, 255, 0.78)");
    } else if (p.kind === "shaft") {
      ctx.fillStyle = "rgba(16, 62, 108, 0.9)";
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = partStrokeColor();
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    } else if (p.kind === "gear" || p.kind === "sprocket") {
      const r = Math.min(w, h) * 0.45;
      const teeth = p.kind === "gear" ? 10 : 12;
      ctx.beginPath();
      for (let i = 0; i <= teeth * 2; i += 1) {
        const t = (i / (teeth * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.82;
        const xx = Math.cos(t) * rr;
        const yy = Math.sin(t) * rr;
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(12, 44, 80, 0.9)";
      ctx.fill();
      ctx.strokeStyle = partStrokeColor();
      ctx.lineWidth = 1.2;
      ctx.stroke();
      drawCircle(0, 0, r * 0.34, "rgba(1, 10, 20, 0.94)", "rgba(122, 232, 255, 0.8)");
    } else if (p.kind === "omni_wheel") {
      const r = Math.min(w, h) * 0.45;
      drawCircle(0, 0, r, "rgba(14, 48, 92, 0.9)", partStrokeColor());
      for (let i = 0; i < 8; i += 1) {
        const t = (i / 8) * Math.PI * 2;
        const rx = Math.cos(t) * r * 0.75;
        const ry = Math.sin(t) * r * 0.75;
        ctx.beginPath();
        ctx.ellipse(rx, ry, r * 0.16, r * 0.08, t, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(108, 225, 255, 0.55)";
        ctx.fill();
      }
      drawCircle(0, 0, r * 0.28, "rgba(2, 12, 24, 0.94)");
    } else if (p.kind === "piston") {
      const extend = piston.active
        ? (() => {
          const t = clamp(piston.time / piston.duration, 0, 1);
          return t < 0.5 ? smoothstep(t / 0.5) : 1 - smoothstep((t - 0.5) / 0.5);
        })()
        : 0;

      const bodyW = w * 0.52;
      const bodyH = h * 0.58;
      const rodW = w * 0.16;
      const rodH = h * (0.38 + extend * 0.46);
      ctx.fillStyle = "rgba(9, 38, 70, 0.92)";
      ctx.fillRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH);
      ctx.strokeStyle = partStrokeColor();
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH);
      ctx.fillStyle = "rgba(128, 230, 255, 0.85)";
      ctx.fillRect(-rodW / 2, -bodyH / 2 - rodH, rodW, rodH);
    } else if (p.kind === "motor") {
      const bodyW = w * 0.76;
      const bodyH = h * 0.72;
      ctx.fillStyle = "rgba(10, 40, 74, 0.94)";
      ctx.fillRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH);
      ctx.strokeStyle = partStrokeColor();
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH);
      ctx.fillStyle = "rgba(121, 232, 255, 0.8)";
      ctx.fillRect(bodyW * 0.24, -bodyH * 0.18, bodyW * 0.26, bodyH * 0.36);
      ctx.strokeStyle = "rgba(92, 210, 255, 0.85)";
      ctx.strokeRect(bodyW * 0.24, -bodyH * 0.18, bodyW * 0.26, bodyH * 0.36);
    } else if (p.kind === "frame_rail") {
      ctx.fillStyle = "rgba(8, 32, 62, 0.92)";
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = partStrokeColor();
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      for (let i = -2; i <= 2; i += 1) {
        drawCircle((i / 2) * (w * 0.36), 0, Math.max(1.2, h * 0.22), "rgba(3, 14, 28, 0.95)", "rgba(116, 233, 255, 0.55)");
      }
    } else if (p.kind === "standoff") {
      const hexR = Math.min(w, h) * 0.38;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const xx = Math.cos(a) * hexR;
        const yy = Math.sin(a) * (h * 0.44);
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(10, 43, 78, 0.94)";
      ctx.fill();
      ctx.strokeStyle = partStrokeColor();
      ctx.lineWidth = 1.1;
      ctx.stroke();
      drawCircle(0, 0, Math.max(1.4, hexR * 0.22), "rgba(2, 12, 24, 0.96)");
    } else if (p.kind === "axle_collar") {
      const r = Math.min(w, h) * 0.42;
      drawCircle(0, 0, r, "rgba(10, 40, 74, 0.92)", partStrokeColor());
      drawCircle(0, 0, r * 0.38, "rgba(2, 12, 24, 0.98)", "rgba(128, 236, 255, 0.78)");
      ctx.strokeStyle = "rgba(120, 232, 255, 0.65)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(r * 0.2, -r * 0.78);
      ctx.lineTo(r * 0.68, -r * 0.26);
      ctx.stroke();
    }

    if (p.status === "locked") {
      ctx.strokeStyle = "rgba(89, 240, 255, 0.46)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2);
    }
    ctx.restore();
  };

  const drawChassisGhost = () => {
    const cx = width * 0.52;
    const cy = height * 0.54;
    const railW = width * 0.44;
    const railGap = height * 0.22;
    const railH = Math.max(6, height * 0.018);

    ctx.strokeStyle = "rgba(84, 224, 255, 0.33)";
    ctx.fillStyle = "rgba(15, 56, 95, 0.14)";
    ctx.lineWidth = 1.15;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(cx - railW / 2, cy - railGap / 2 - railH / 2, railW, railH);
    ctx.strokeRect(cx - railW / 2, cy + railGap / 2 - railH / 2, railW, railH);
    ctx.fillRect(cx - railW / 2, cy - railGap / 2 - railH / 2, railW, railH);
    ctx.fillRect(cx - railW / 2, cy + railGap / 2 - railH / 2, railW, railH);
    ctx.setLineDash([]);

    for (let i = -1; i <= 1; i += 1) {
      const x = cx + i * (railW * 0.26);
      ctx.beginPath();
      ctx.moveTo(x, cy - railGap / 2);
      ctx.lineTo(x, cy + railGap / 2);
      ctx.stroke();
    }
  };

  const drawPsiGauge = () => {
    const boxW = Math.max(72, width * 0.2);
    const boxH = Math.max(34, height * 0.12);
    const x = width - boxW - 10;
    const y = 10;
    const pct = clamp((psi - BASE_PSI) / (MAX_PSI - BASE_PSI), 0, 1);

    ctx.fillStyle = "rgba(3, 16, 34, 0.8)";
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeStyle = "rgba(111, 236, 255, 0.72)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, boxW, boxH);

    ctx.fillStyle = "rgba(138, 239, 255, 0.75)";
    ctx.font = `${Math.max(7, width / 64)}px "Press Start 2P", monospace`;
    ctx.textAlign = "left";
    ctx.fillText("PSI", x + 6, y + 11);

    const barX = x + 6;
    const barY = y + boxH - 12;
    const barW = boxW - 12;
    const barH = 6;
    ctx.fillStyle = "rgba(18, 47, 82, 0.95)";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = "rgba(66, 230, 255, 0.92)";
    ctx.fillRect(barX, barY, barW * pct, barH);
    ctx.strokeStyle = "rgba(130, 239, 255, 0.9)";
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(160, 246, 255, 0.9)";
    ctx.fillText(`${Math.round(psi)}`, x + boxW - 6, y + 11);
  };

  const drawRingsAndSparks = (dt: number) => {
    for (let i = rings.length - 1; i >= 0; i -= 1) {
      const ring = rings[i];
      ring.life -= dt;
      if (ring.life <= 0) {
        rings.splice(i, 1);
        continue;
      }
      const t = 1 - ring.life / ring.maxLife;
      const r = ring.r0 + (ring.r1 - ring.r0) * smoothstep(t);
      const a = ring.alpha * (1 - t);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(124, 239, 255, ${a})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.9;
      s.vy *= 0.9;
      const a = clamp(s.life / s.maxLife, 0, 1);
      const size = s.size * (0.8 + 0.4 * a);
      ctx.fillStyle = `rgba(116, 240, 255, ${a})`;
      ctx.fillRect(s.x - size * 0.5, s.y - size * 0.5, size, size);
    }
  };

  const drawStamp = (dt: number) => {
    if (!stamp.active) return;
    stamp.time += dt;
    const total = stamp.slamDur + stamp.fadeDur;
    if (stamp.time >= total) {
      stamp.active = false;
      return;
    }

    const inSlam = stamp.time < stamp.slamDur;
    const slamT = inSlam ? easeOutBackSmall(stamp.time / stamp.slamDur) : 1;
    const fadeT = inSlam ? 0 : clamp((stamp.time - stamp.slamDur) / stamp.fadeDur, 0, 1);
    const alpha = inSlam ? 1 : 1 - fadeT;
    const shake = inSlam ? (1 - stamp.time / stamp.slamDur) * 2.2 : 0;

    const x = width * 0.5 + Math.sin(stamp.time * 80) * shake;
    const y = height * 0.21 + Math.cos(stamp.time * 95) * shake;
    const w = Math.max(100, width * 0.45) * (0.82 + 0.18 * slamT);
    const h = Math.max(20, height * 0.12) * (0.82 + 0.18 * slamT);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(slamT, slamT);
    ctx.fillStyle = `rgba(6, 18, 40, ${0.78 * alpha})`;
    ctx.strokeStyle = `rgba(142, 243, 255, ${0.9 * alpha})`;
    ctx.lineWidth = 1.3;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(167, 249, 255, ${alpha})`;
    ctx.font = `${Math.max(8, width / 56)}px "Press Start 2P", monospace`;
    ctx.fillText(stamp.text, 0, 3);
    ctx.restore();
  };

  const drawLoopSummon = () => {
    if (loopMode !== "summon") return;
    const t = clamp(summonTime / summonDur, 0, 1);
    const y = -height * 0.15 + t * height * 1.3;
    const g = ctx.createLinearGradient(0, y - 30, 0, y + 30);
    g.addColorStop(0, "rgba(106, 241, 255, 0)");
    g.addColorStop(0.5, "rgba(106, 241, 255, 0.28)");
    g.addColorStop(1, "rgba(106, 241, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 30, width, 60);
  };

  const resetLoop = () => {
    partIndex.clear();
    parts = PARTS.map((p) => ({
      ...p,
      active: true,
      status: "exploded",
      x: p.targetX,
      y: p.targetY,
      phase: Math.random() * Math.PI * 2,
      snapFromX: p.targetX,
      snapFromY: p.targetY,
      snapElapsed: 0,
      snapDur: 0.66,
      overshootPx: rand(1, 2),
    }));
    for (const part of parts) partIndex.set(part.label, part);

    const selectedCount = Math.floor(rand(10, 13));
    const selected = new Set(shuffle(parts.map((p) => p.label)).slice(0, selectedCount));
    const explodedPool = shuffle(parts.filter((p) => selected.has(p.label)));
    const n = explodedPool.length || 1;
    explodedPool.forEach((p, i) => {
      const a = (i / n) * Math.PI * 2 + rand(-0.25, 0.25);
      const r = rand(0.33, 0.44);
      p.x = 0.52 + Math.cos(a) * r;
      p.y = 0.52 + Math.sin(a) * r * 0.72;
      p.active = true;
      p.status = "exploded";
      p.phase = Math.random() * Math.PI * 2;
      p.snapFromX = p.x;
      p.snapFromY = p.y;
      p.snapElapsed = 0;
      p.snapDur = rand(SNAP_DUR_MIN_S, SNAP_DUR_MAX_S);
      p.overshootPx = rand(1, 2);
    });
    parts.forEach((p) => {
      if (!selected.has(p.label)) p.active = false;
    });

    snapOrder = shuffle(Array.from(selected));
    snapCursor = 0;
    snapCount = 0;
    summonTime = 0;
    summonDur = rand(SUMMON_MIN_S, SUMMON_MAX_S);
    nextSnapIn = rand(SNAP_MIN_S, SNAP_MAX_S);
    holdTime = 0;
    loopMode = "summon";
    rings.length = 0;
    sparks.length = 0;
    piston.active = false;
    psi = BASE_PSI + rand(-2, 3);
    options.onPsi?.(psi);
  };

  const startSnap = (label: string) => {
    const p = partIndex.get(label);
    if (!p || !p.active || p.status !== "exploded") return;
    p.status = "snapping";
    p.snapFromX = p.x;
    p.snapFromY = p.y;
    p.snapElapsed = 0;
    p.snapDur = rand(SNAP_DUR_MIN_S, SNAP_DUR_MAX_S);
    p.overshootPx = rand(1, 2);
  };

  const finishSnap = (p: PartState) => {
    p.status = "locked";
    p.x = p.targetX;
    p.y = p.targetY;

    spawnRing(p.targetX, p.targetY, rand(120, 180), 4, 22, 0.85);
    spawnSparks(p.targetX, p.targetY, 8, 14);
    psi = clamp(psi + rand(4.2, 8.4), BASE_PSI, MAX_PSI);
    options.onPsi?.(psi);

    snapCount += 1;
    if (snapCount % 2 === 0) {
      triggerPistonCycle();
    }
  };

  const updateParts = (dt: number) => {
    let snappingCount = 0;
    let lockedCount = 0;
    let activeCount = 0;

    for (const p of parts) {
      if (!p.active) continue;
      activeCount += 1;
      p.phase += dt * 1.8;

      if (p.status === "exploded") {
        p.x += Math.cos(p.phase * 0.9) * 0.0006;
        p.y += Math.sin(p.phase * 1.1) * 0.0006;
      } else if (p.status === "snapping") {
        snappingCount += 1;
        p.snapElapsed += dt;
        const t = clamp(p.snapElapsed / p.snapDur, 0, 1);
        const k = easeOutBackSmall(t);

        const baseX = p.snapFromX + (p.targetX - p.snapFromX) * k;
        const baseY = p.snapFromY + (p.targetY - p.snapFromY) * k;

        const dx = p.targetX - p.snapFromX;
        const dy = p.targetY - p.snapFromY;
        const len = Math.max(0.00001, Math.hypot(dx, dy));
        const nx = dx / len;
        const ny = dy / len;
        const overshootNormX = pxToNormX(p.overshootPx) * nx;
        const overshootNormY = pxToNormY(p.overshootPx) * ny;
        const settlePulse = Math.sin(Math.PI * t) * Math.exp(-4.8 * t);

        p.x = baseX + overshootNormX * settlePulse;
        p.y = baseY + overshootNormY * settlePulse;

        if (t >= 1) finishSnap(p);
      } else if (p.status === "locked") {
        lockedCount += 1;
      }
    }

    return { snappingCount, lockedCount, activeCount };
  };

  const updatePiston = (dt: number) => {
    if (!piston.active) return;
    piston.time += dt;
    const t = clamp(piston.time / piston.duration, 0, 1);
    if (!piston.emittedBurst && t > 0.15) {
      piston.emittedBurst = true;
      spawnRing(piston.originX, piston.originY, 320, 6, 34, 0.55);
    }
    if (t >= 1) piston.active = false;
  };

  const updateLoop = (dt: number) => {
    // PSI decays slowly between snaps.
    psi += (BASE_PSI - psi) * 0.32 * dt;
    options.onPsi?.(psi);

    stampClock += dt;
    if (stampClock >= stampCooldown) {
      stampClock = 0;
      stampCooldown = rand(STAMP_MIN_S, STAMP_MAX_S);
      triggerStamp();
    }

    if (loopMode === "summon") {
      summonTime += dt;
      if (summonTime >= summonDur) {
        loopMode = "assemble";
      }
    } else if (loopMode === "assemble") {
      nextSnapIn -= dt;
      if (nextSnapIn <= 0 && snapCursor < snapOrder.length) {
        startSnap(snapOrder[snapCursor]);
        snapCursor += 1;
        nextSnapIn = rand(SNAP_MIN_S, SNAP_MAX_S);
      }

      const { snappingCount, lockedCount, activeCount } = updateParts(dt);
      if (activeCount > 0 && lockedCount >= activeCount && snappingCount === 0) {
        loopMode = "hold";
        holdTime = HOLD_COMPLETE_S;
        triggerStamp();
      }
    } else if (loopMode === "hold") {
      holdTime -= dt;
      if (holdTime <= 0) resetLoop();
    }

    updatePiston(dt);
  };

  const drawForge = (dt: number) => {
    ctx.clearRect(0, 0, width, height);

    // Blueprint/forge backdrop.
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "rgba(5, 14, 28, 0.98)");
    bg.addColorStop(1, "rgba(4, 10, 24, 0.98)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    drawChassisGhost();
    drawLoopSummon();
    for (const p of parts) drawPart(p);
    drawRingsAndSparks(dt);
    drawStamp(dt);
    drawPsiGauge();
  };

  const tick = (deltaMs: number, now: number) => {
    if (!running) return;
    if (!lastAmbientStepTs) {
      lastAmbientStepTs = now;
    }
    const dt = Math.min(deltaMs / 1000, 0.05);
    const nextTier = frameBudget.push(deltaMs, now);
    if (nextTier !== dprTier) {
      dprTier = nextTier;
      resize();
    }

    const hasBurst = sparks.length > 0 || rings.length > 0 || stamp.active || piston.active;
    const burstFps = options.burstFps ?? 45;
    const nextFps = hasBurst ? burstFps : (options.fps ?? 30);
    if (nextFps !== currentLoopFps) {
      currentLoopFps = nextFps;
      loop.setFps(nextFps);
    }

    if (!hasBurst && now - lastAmbientStepTs < FPS_AMBIENT_MS) {
      return;
    }
    lastAmbientStepTs = now;

    updateLoop(dt);
    drawForge(dt);
  };

  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  resize();
  const loop = registerRafLoop(options.loopId ?? `role-builder:${Math.random().toString(36).slice(2)}`, {
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

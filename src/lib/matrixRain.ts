/**
 * matrixRain.ts — Coder: "PID Rune Compiler"
 * Matrix-style rain with VEX runes, long tails, alpha-fade overlay.
 */

import { FrameBudget } from "./frame-budget";
import { registerRafLoop, type RafLoopController } from "./raf-governor";

export const MATRIX_COL_WIDTH = 18;
export const MATRIX_SPEED_MIN = 50;
export const MATRIX_SPEED_MAX = 180;

const GLITCH_INTERVAL_MIN = 6000;
const GLITCH_INTERVAL_MAX = 14000;

const KATAKANA = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
const VEX_RUNES = "PID ODOM IMU mm° rpm Ψ Ω Σ Λ Ξ";
const DIGITS = "0123456789";
const GLYPH_SET = KATAKANA + DIGITS + VEX_RUNES;

type MatrixRainOptions = {
  loopId?: string;
  fps?: number;
  dprCaps?: number[];
  enableWorker?: boolean;
};

type WorkerInitPayload = {
  type: "init";
  xPositions: Float32Array;
  tailLens: Uint16Array;
  charOffsets: Uint32Array;
  yValues: Float32Array;
  glyphIndices: Uint16Array;
};

type WorkerStepPayload = {
  type: "state";
  requestId: number;
  yValues: Float32Array;
  glyphIndices: Uint16Array;
};

type FallbackState = {
  speeds: Float32Array;
  timers: Float32Array;
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

const clampDpr = (cap: number) => Math.min(window.devicePixelRatio || 1, cap);

export const attachMatrixRain = (container: HTMLElement, options: MatrixRainOptions = {}) => {
  const canvas = document.createElement("canvas");
  canvas.className = "matrix-rain-canvas";
  Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  container.appendChild(canvas);

  const loopId = options.loopId ?? `matrix-rain:${Math.random().toString(36).slice(2)}`;
  const dprCaps = options.dprCaps?.length ? options.dprCaps : [1.5, 1.25, 1.0];

  let width = 1;
  let height = 1;
  let dprTier = 0;
  let dpr = clampDpr(dprCaps[dprTier] ?? 1.5);
  let glitchTimer = 0;
  let glitchFlash = 0;
  let nextGlitch = rand(GLITCH_INTERVAL_MIN, GLITCH_INTERVAL_MAX);

  let xPositions = new Float32Array(0);
  let tailLens = new Uint16Array(0);
  let charOffsets = new Uint32Array(0);
  let yValues = new Float32Array(0);
  let glyphIndices = new Uint16Array(0);
  let fallback: FallbackState | null = null;

  const frameBudget = new FrameBudget({
    sampleSize: 90,
    downshiftThresholdMs: 22,
    restoreThresholdMs: 16.5,
    cooldownMs: 1200,
    maxTier: Math.max(0, dprCaps.length - 1),
  });

  let worker: Worker | null = null;
  let workerReady = false;
  let workerPending = false;
  let workerReqId = 0;

  const fontSize = () => Math.max(11, Math.min(16, width / 28));
  const glyphAt = (idx: number) => GLYPH_SET[idx % GLYPH_SET.length] ?? " ";
  const glyphLength = GLYPH_SET.length;

  const rebuildFallbackState = () => {
    const colCount = Math.max(6, Math.floor(width / MATRIX_COL_WIDTH));
    const spacing = width / colCount;
    xPositions = new Float32Array(colCount);
    tailLens = new Uint16Array(colCount);
    charOffsets = new Uint32Array(colCount);
    yValues = new Float32Array(colCount);

    let totalGlyphs = 0;
    for (let i = 0; i < colCount; i += 1) {
      xPositions[i] = i * spacing + spacing * 0.5;
      const tail = 8 + Math.floor(Math.random() * 18);
      tailLens[i] = tail;
      charOffsets[i] = totalGlyphs;
      totalGlyphs += tail;
      yValues[i] = -Math.random() * height;
    }

    glyphIndices = new Uint16Array(totalGlyphs);
    const speeds = new Float32Array(colCount);
    const timers = new Float32Array(colCount);

    for (let i = 0; i < totalGlyphs; i += 1) {
      glyphIndices[i] = Math.floor(Math.random() * glyphLength);
    }
    for (let i = 0; i < colCount; i += 1) {
      speeds[i] = rand(MATRIX_SPEED_MIN, MATRIX_SPEED_MAX);
      timers[i] = rand(0, 0.5);
    }

    fallback = { speeds, timers };
  };

  const onWorkerMessage = (event: MessageEvent<WorkerInitPayload | WorkerStepPayload>) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "init") {
      xPositions = data.xPositions;
      tailLens = data.tailLens;
      charOffsets = data.charOffsets;
      yValues = data.yValues;
      glyphIndices = data.glyphIndices;
      workerReady = true;
      workerPending = false;
      return;
    }
    if (data.type === "state") {
      yValues = data.yValues;
      glyphIndices = data.glyphIndices;
      workerPending = false;
    }
  };

  const disposeWorker = () => {
    if (!worker) return;
    try {
      worker.postMessage({ type: "dispose" });
    } catch {
      // no-op
    }
    worker.terminate();
    worker = null;
    workerReady = false;
    workerPending = false;
  };

  const initWorker = () => {
    if (options.enableWorker === false || typeof Worker === "undefined") return false;
    try {
      worker = new Worker(new URL("../workers/matrix-rain.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = onWorkerMessage;
      worker.onerror = () => {
        disposeWorker();
        rebuildFallbackState();
      };
      worker.postMessage({
        type: "init",
        width,
        height,
        colWidth: MATRIX_COL_WIDTH,
        glyphCount: glyphLength,
        speedMin: MATRIX_SPEED_MIN,
        speedMax: MATRIX_SPEED_MAX,
      });
      return true;
    } catch {
      disposeWorker();
      return false;
    }
  };

  const resize = () => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    dpr = clampDpr(dprCaps[dprTier] ?? dprCaps[dprCaps.length - 1] ?? 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    if (worker) {
      worker.postMessage({ type: "resize", width, height });
    } else {
      rebuildFallbackState();
    }
  };

  const stepFallback = (dt: number) => {
    if (!fallback) return;
    const fs = fontSize();
    for (let i = 0; i < yValues.length; i += 1) {
      yValues[i] += fallback.speeds[i]! * dt;
      fallback.timers[i]! -= dt;
      if (fallback.timers[i]! <= 0) {
        fallback.timers[i] = rand(0.1, 0.5);
        const tail = tailLens[i] || 1;
        const charOffset = charOffsets[i] || 0;
        const idx = Math.floor(Math.random() * tail);
        glyphIndices[charOffset + idx] = Math.floor(Math.random() * glyphLength);
      }
      const tailLen = tailLens[i] || 0;
      if (yValues[i]! - tailLen * fs > height) {
        yValues[i] = -fs * 2;
        fallback.speeds[i] = rand(MATRIX_SPEED_MIN, MATRIX_SPEED_MAX);
      }
    }
  };

  const draw = () => {
    ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
    ctx.fillRect(0, 0, width, height);

    const fs = fontSize();
    ctx.font = `${fs}px "VT323", "JetBrains Mono", monospace`;

    for (let c = 0; c < yValues.length; c += 1) {
      const tail = tailLens[c] || 0;
      const y = yValues[c] || 0;
      const x = xPositions[c] || 0;
      const offset = charOffsets[c] || 0;

      for (let i = 0; i < tail; i += 1) {
        const charY = y - (tail - 1 - i) * fs;
        if (charY < -fs || charY > height + fs) continue;

        const t = i / Math.max(1, tail - 1);
        const alpha = t * t * 0.9;
        if (i === tail - 1) {
          ctx.fillStyle = "rgba(220, 255, 230, 1)";
          ctx.shadowColor = "rgba(180, 255, 200, 0.9)";
          ctx.shadowBlur = 12;
        } else {
          ctx.fillStyle = `rgba(0, 255, 70, ${alpha})`;
          ctx.shadowColor = `rgba(0, 200, 80, ${alpha * 0.5})`;
          ctx.shadowBlur = alpha > 0.3 ? 6 : 2;
        }
        const glyph = glyphAt(glyphIndices[offset + i] || 0);
        ctx.fillText(glyph, x, charY);
      }
      ctx.shadowBlur = 0;
    }

    if (glitchFlash > 0) {
      const sweepY = (1 - glitchFlash) * height;
      ctx.fillStyle = `rgba(0, 255, 100, ${glitchFlash * 0.15})`;
      ctx.fillRect(0, sweepY - 3, width, 6);
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `rgba(255, 0, 100, ${glitchFlash * 0.08})`;
      ctx.fillRect(0, sweepY - 1, width, 2);
      ctx.globalCompositeOperation = "source-over";
    }
  };

  const loop: RafLoopController = registerRafLoop(loopId, {
    fps: options.fps ?? 30,
    autoPauseOnHidden: true,
    onTick: ({ deltaMs, now }) => {
      const dt = Math.min(0.05, Math.max(0.0001, deltaMs / 1000));
      const nextTier = frameBudget.push(deltaMs, now);
      if (nextTier !== dprTier) {
        dprTier = nextTier;
        resize();
      }

      if (workerReady && worker) {
        if (!workerPending) {
          workerPending = true;
          workerReqId += 1;
          worker.postMessage({
            type: "step",
            dtMs: deltaMs,
            requestId: workerReqId,
          });
        }
      } else {
        stepFallback(dt);
      }

      glitchTimer += deltaMs;
      if (glitchTimer > nextGlitch) {
        glitchTimer = 0;
        nextGlitch = rand(GLITCH_INTERVAL_MIN, GLITCH_INTERVAL_MAX);
        glitchFlash = 1;
      }
      glitchFlash = Math.max(0, glitchFlash - dt * 8);
      draw();
    },
  });

  const ro = new ResizeObserver(() => resize());
  ro.observe(container);

  resize();
  rebuildFallbackState();
  initWorker();
  ctx.fillStyle = "rgba(0, 0, 0, 1)";
  ctx.fillRect(0, 0, width, height);
  loop.start();

  return () => {
    loop.destroy();
    ro.disconnect();
    disposeWorker();
    canvas.remove();
  };
};

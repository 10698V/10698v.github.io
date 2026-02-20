/**
 * matrixRain.ts — Coder: "PID Rune Compiler"
 * Matrix-style rain with VEX runes, long tails, alpha-fade overlay
 */

type Column = {
  x: number;
  y: number;
  speed: number;
  tailLen: number;
  chars: string[];
  charTimer: number;
};

// Katakana + digits + VEX runes
const KATAKANA = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
const VEX_RUNES = "PID ODOM IMU mm° rpm Ψ Ω Σ Λ Ξ";
const DIGITS = "0123456789";
const GLYPH_SET = KATAKANA + DIGITS + VEX_RUNES;

export const MATRIX_COL_WIDTH = 18;
export const MATRIX_SPEED_MIN = 50;
export const MATRIX_SPEED_MAX = 180;
const DPR_MAX = 1.5;
const GLITCH_INTERVAL_MIN = 6000;
const GLITCH_INTERVAL_MAX = 14000;

const pickGlyph = () => GLYPH_SET[Math.floor(Math.random() * GLYPH_SET.length)];

export const attachMatrixRain = (container: HTMLElement) => {
  const canvas = document.createElement("canvas");
  canvas.className = "matrix-rain-canvas";
  Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => { };
  container.appendChild(canvas);

  let width = 0, height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
  let columns: Column[] = [];
  let raf = 0, last = 0, running = true;
  let glitchTimer = 0;
  let glitchFlash = 0;
  let nextGlitch = GLITCH_INTERVAL_MIN + Math.random() * (GLITCH_INTERVAL_MAX - GLITCH_INTERVAL_MIN);

  const fontSize = () => Math.max(11, Math.min(16, width / 28));

  const buildColumns = () => {
    const fs = fontSize();
    const colCount = Math.max(6, Math.floor(width / MATRIX_COL_WIDTH));
    const spacing = width / colCount;
    columns = Array.from({ length: colCount }, (_, i) => {
      const tailLen = 8 + Math.floor(Math.random() * 18);
      return {
        x: i * spacing + spacing * 0.5,
        y: -Math.random() * height,
        speed: MATRIX_SPEED_MIN + Math.random() * (MATRIX_SPEED_MAX - MATRIX_SPEED_MIN),
        tailLen,
        chars: Array.from({ length: tailLen }, () => pickGlyph()),
        charTimer: Math.random() * 0.5,
      };
    });
  };

  const resize = () => {
    width = container.clientWidth || 1;
    height = container.clientHeight || 1;
    dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    buildColumns();
  };

  const render = (dt: number) => {
    // Alpha fade overlay — KEY for long-tail Matrix look
    ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
    ctx.fillRect(0, 0, width, height);

    const fs = fontSize();
    ctx.font = `${fs}px "VT323", "JetBrains Mono", monospace`;

    columns.forEach((col) => {
      col.y += col.speed * dt;

      // Cycle characters periodically
      col.charTimer -= dt;
      if (col.charTimer <= 0) {
        col.charTimer = 0.1 + Math.random() * 0.4;
        const idx = Math.floor(Math.random() * col.chars.length);
        col.chars[idx] = pickGlyph();
      }

      // Reset when off-screen
      if (col.y - col.tailLen * fs > height) {
        col.y = -fs * 2;
        col.speed = MATRIX_SPEED_MIN + Math.random() * (MATRIX_SPEED_MAX - MATRIX_SPEED_MIN);
      }

      // Draw tail (oldest→newest)
      for (let i = 0; i < col.tailLen; i++) {
        const charY = col.y - (col.tailLen - 1 - i) * fs;
        if (charY < -fs || charY > height + fs) continue;

        const t = i / (col.tailLen - 1); // 0=oldest, 1=newest (head)
        const alpha = t * t * 0.9; // quadratic fade

        if (i === col.tailLen - 1) {
          // Bright white HEAD
          ctx.fillStyle = "rgba(220, 255, 230, 1)";
          ctx.shadowColor = "rgba(180, 255, 200, 0.9)";
          ctx.shadowBlur = 12;
        } else {
          ctx.fillStyle = `rgba(0, 255, 70, ${alpha})`;
          ctx.shadowColor = `rgba(0, 200, 80, ${alpha * 0.5})`;
          ctx.shadowBlur = alpha > 0.3 ? 6 : 2;
        }

        ctx.fillText(col.chars[i], col.x, charY);
      }
      ctx.shadowBlur = 0;
    });

    // Glitch sweep micro-event
    if (glitchFlash > 0) {
      const sweepY = (1 - glitchFlash) * height;
      ctx.fillStyle = `rgba(0, 255, 100, ${glitchFlash * 0.15})`;
      ctx.fillRect(0, sweepY - 3, width, 6);
      // Chromatic offset
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `rgba(255, 0, 100, ${glitchFlash * 0.08})`;
      ctx.fillRect(0, sweepY - 1, width, 2);
      ctx.globalCompositeOperation = "source-over";
    }
  };

  const tick = (ts: number) => {
    if (!running) return;
    if (!last) last = ts;
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;

    // Glitch timer
    glitchTimer += dt * 1000;
    if (glitchTimer > nextGlitch) {
      glitchTimer = 0;
      nextGlitch = GLITCH_INTERVAL_MIN + Math.random() * (GLITCH_INTERVAL_MAX - GLITCH_INTERVAL_MIN);
      glitchFlash = 1;
    }
    glitchFlash = Math.max(0, glitchFlash - dt * 8); // 120ms glitch

    render(dt);
    raf = requestAnimationFrame(tick);
  };

  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  resize();
  // Initial black fill so first frames trail correctly
  ctx.fillStyle = "rgba(0, 0, 0, 1)";
  ctx.fillRect(0, 0, width, height);
  raf = requestAnimationFrame(tick);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.remove();
  };
};

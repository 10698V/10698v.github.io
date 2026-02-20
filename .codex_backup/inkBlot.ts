/**
 * inkDrips.ts — Notebooker: "Judge-Scribe of Evidence"
 * Gravity ink droplets + splatter on impact + CRT scanlines + scroll texture
 */

type Droplet = {
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  color: string;
  alpha: number;
  landed: boolean;
  splashTimer: number;
};

type Splatter = {
  x: number; y: number;
  radius: number;
  alpha: number;
};

const INK_COLORS = [
  "rgba(30, 58, 138, 0.8)",   // deep blue
  "rgba(88, 28, 135, 0.7)",   // purple
  "rgba(15, 23, 42, 0.85)",   // near-black
  "rgba(244, 211, 94, 0.6)",  // gold accent
];

const SPAWN_INTERVAL_MIN = 600;
const SPAWN_INTERVAL_MAX = 1800;
const GRAVITY = 120;
const STAMP_INTERVAL_MIN = 4000;
const STAMP_INTERVAL_MAX = 8000;

export const attachInkDrips = (
  container: HTMLElement,
  options: { palette?: string[] } = {},
) => {
  const canvas = document.createElement("canvas");
  canvas.className = "inkdrips-canvas";
  Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => { };
  container.appendChild(canvas);

  let width = 0, height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let raf = 0, last = 0, running = true;

  const droplets: Droplet[] = [];
  const splatters: Splatter[] = [];
  let spawnTimer = 0;
  let nextSpawn = SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
  let stampFlash = 0;
  let stampTimer = 0;
  let nextStamp = STAMP_INTERVAL_MIN + Math.random() * (STAMP_INTERVAL_MAX - STAMP_INTERVAL_MIN);
  let scrollOffset = 0;

  const resize = () => {
    width = container.clientWidth || 1;
    height = container.clientHeight || 1;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const spawnDroplet = () => {
    const color = INK_COLORS[Math.floor(Math.random() * INK_COLORS.length)];
    droplets.push({
      x: 0.1 * width + Math.random() * 0.8 * width,
      y: -5,
      vx: (Math.random() - 0.5) * 15, // slight drift
      vy: 10 + Math.random() * 20,
      radius: 2 + Math.random() * 4,
      color,
      alpha: 0.7 + Math.random() * 0.3,
      landed: false,
      splashTimer: 0,
    });
  };

  const createSplatter = (x: number, y: number, r: number) => {
    const count = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = r + Math.random() * r * 2;
      splatters.push({
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        radius: 1 + Math.random() * 2,
        alpha: 0.4 + Math.random() * 0.4,
      });
    }
  };

  const drawCRTScanlines = () => {
    // Subtle horizontal scanlines
    ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
    for (let y = 0; y < height; y += 3) {
      ctx.fillRect(0, y, width, 1);
    }
  };

  const drawScrollTexture = () => {
    // Faint scroll/paper texture lines moving slowly
    ctx.strokeStyle = "rgba(200, 180, 140, 0.03)";
    ctx.lineWidth = 0.5;
    const lineSpacing = 14;
    const offsetY = scrollOffset % lineSpacing;
    for (let y = -lineSpacing + offsetY; y < height; y += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  };

  const drawStampFlash = () => {
    if (stampFlash <= 0) return;
    const stamps = ["PASS", "INSPECTED", "APPROVED", "VERIFIED"];
    const label = stamps[Math.floor(Math.random() * stamps.length)];
    ctx.save();
    const cx = width * (0.3 + Math.random() * 0.4);
    const cy = height * (0.3 + Math.random() * 0.4);
    ctx.translate(cx, cy);
    ctx.rotate((Math.random() - 0.5) * 0.3);
    ctx.font = `bold ${Math.max(14, width / 12)}px "Press Start 2P", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = `rgba(220, 38, 38, ${stampFlash * 0.7})`;
    ctx.lineWidth = 2;
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = `rgba(220, 38, 38, ${stampFlash * 0.3})`;
    ctx.fillText(label, 0, 0);
    // Border stamp rectangle
    const tw = ctx.measureText(label).width;
    ctx.strokeRect(-tw / 2 - 8, -12, tw + 16, 24);
    ctx.restore();
  };

  const tick = (ts: number) => {
    if (!running) return;
    if (!last) last = ts;
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;

    // Background
    ctx.fillStyle = "rgba(4, 5, 15, 0.15)";
    ctx.fillRect(0, 0, width, height);

    // Scroll texture
    scrollOffset += dt * 8;
    drawScrollTexture();

    // Spawn droplets
    spawnTimer += dt * 1000;
    if (spawnTimer > nextSpawn) {
      spawnTimer = 0;
      nextSpawn = SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
      spawnDroplet();
    }

    // Update droplets
    for (let i = droplets.length - 1; i >= 0; i--) {
      const d = droplets[i];
      if (!d.landed) {
        d.vy += GRAVITY * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;

        if (d.y >= height - d.radius) {
          d.y = height - d.radius;
          d.landed = true;
          d.splashTimer = 0.3;
          createSplatter(d.x, d.y, d.radius);
        }
      } else {
        d.splashTimer -= dt;
        d.alpha -= dt * 0.5;
        if (d.alpha <= 0) {
          droplets.splice(i, 1);
          continue;
        }
      }

      // Draw droplet
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      ctx.fillStyle = d.color.replace(/[\d.]+\)$/, `${d.alpha})`);
      ctx.fill();
    }

    // Draw splatters (persistent, fade slowly)
    for (let i = splatters.length - 1; i >= 0; i--) {
      const s = splatters[i];
      s.alpha -= dt * 0.15;
      if (s.alpha <= 0) { splatters.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(30, 41, 59, ${s.alpha})`;
      ctx.fill();
    }

    // CRT scanlines
    drawCRTScanlines();

    // Stamp micro-event
    stampTimer += dt * 1000;
    if (stampTimer > nextStamp) {
      stampTimer = 0;
      nextStamp = STAMP_INTERVAL_MIN + Math.random() * (STAMP_INTERVAL_MAX - STAMP_INTERVAL_MIN);
      stampFlash = 1;
    }
    stampFlash = Math.max(0, stampFlash - dt * 3);
    drawStampFlash();

    // Cap droplets/splatters
    while (droplets.length > 30) droplets.shift();
    while (splatters.length > 100) splatters.shift();

    raf = requestAnimationFrame(tick);
  };

  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  resize();
  ctx.fillStyle = "rgba(4, 5, 15, 1)";
  ctx.fillRect(0, 0, width, height);
  raf = requestAnimationFrame(tick);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.remove();
  };
};

// Re-export the old name as alias for backward compatibility
export const attachInkBlot = attachInkDrips;

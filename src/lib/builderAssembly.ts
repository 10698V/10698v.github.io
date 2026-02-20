type SnapPayload = {
  index: number;
  x: number;
  y: number;
};

type Part = {
  index: number;
  width: number;
  height: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  snapped: boolean;
  flash: number;
  clock: number;
  wobbleAmp: number;
  wobbleSpeed: number;
  wobbleOffset: number;
};

const TARGET_SLOTS = [
  { x: 0.22, y: 0.28, w: 0.1, h: 0.04 },
  { x: 0.33, y: 0.36, w: 0.06, h: 0.09 },
  { x: 0.46, y: 0.24, w: 0.05, h: 0.12 },
  { x: 0.58, y: 0.32, w: 0.12, h: 0.045 },
  { x: 0.72, y: 0.34, w: 0.08, h: 0.07 },
  { x: 0.28, y: 0.52, w: 0.11, h: 0.04 },
  { x: 0.46, y: 0.5, w: 0.05, h: 0.08 },
  { x: 0.62, y: 0.54, w: 0.11, h: 0.038 },
  { x: 0.74, y: 0.48, w: 0.07, h: 0.05 },
  { x: 0.36, y: 0.7, w: 0.09, h: 0.04 },
  { x: 0.52, y: 0.7, w: 0.05, h: 0.06 },
  { x: 0.66, y: 0.68, w: 0.08, h: 0.04 },
] as const;

export const PART_FALL_SPEED = 0.55; // To tweak gravity strength (fraction of card height per second), change this value.
export const PART_HORIZONTAL_EASE = 4.5; // To tweak horizontal smoothing responsiveness, change this value.
export const PART_WOBBLE_FACTOR = 0.35; // To tweak lateral wobble amplitude relative to part width, change this value.
export const PART_WOBBLE_SPEED = 2.4; // To tweak average wobble frequency (radians per second), change this value.
export const SNAP_ANIMATION_TIME = 0.45; // To tweak how long the neon flash lasts after snapping, change this value.
export const ASSEMBLY_RESET_DELAY = 3.2; // To tweak pause time after all parts snap before restarting, change this value.

export const attachBuilderAssembly = (
  container: HTMLElement,
  options: { onSnap?: (payload: SnapPayload) => void } = {},
) => {
  const canvas = document.createElement("canvas");
  canvas.className = "builder-assembly-canvas";
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => { };
  container.appendChild(canvas);

  let width = 0;
  let height = 0;
  let dpr = window.devicePixelRatio || 1;
  let parts: Part[] = [];
  let raf = 0;
  let last = 0;
  let idleTimer = 0;

  const rebuildParts = () => {
    const base = Math.min(width, height);
    parts = TARGET_SLOTS.map((slot, index) => ({
      index,
      width: slot.w * base,
      height: slot.h * base,
      x: Math.random() * width,
      y: -Math.random() * height - base * (0.3 + Math.random() * 0.4),
      targetX: slot.x * width,
      targetY: slot.y * height,
      speed: PART_FALL_SPEED * (0.75 + Math.random() * 0.5) * height,
      snapped: false,
      flash: 0,
      clock: 0,
      wobbleAmp: slot.w * base * PART_WOBBLE_FACTOR * (0.6 + Math.random() * 0.8),
      wobbleSpeed: PART_WOBBLE_SPEED * (0.8 + Math.random() * 0.6),
      wobbleOffset: Math.random() * Math.PI * 2,
    }));
    idleTimer = 0;
  };

  const resize = () => {
    width = container.clientWidth || 1;
    height = container.clientHeight || 1;
    dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildParts();
  };

  const drawPart = (part: Part) => {
    const wobble = part.snapped ? 0 : Math.sin(part.wobbleOffset + part.clock) * part.wobbleAmp;
    const px = part.x + wobble - part.width / 2;
    const py = part.y - part.height / 2;
    const glow = part.flash > 0 ? 0.85 : 0.45;
    ctx.save();
    ctx.shadowColor = `rgba(56, 189, 248, ${0.6 + glow * 0.3})`;
    ctx.shadowBlur = part.flash > 0 ? 20 : 8;
    ctx.fillStyle = `rgba(14, 116, 144, ${0.75 + glow * 0.2})`;
    ctx.fillRect(px, py, part.width, part.height);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = `rgba(125, 211, 252, ${0.8 + glow * 0.2})`;
    ctx.strokeRect(px, py, part.width, part.height);
    ctx.restore();
  };

  const tick = (ts: number) => {
    if (!last) last = ts;
    const delta = (ts - last) / 1000;
    last = ts;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(0, 8, 18, 0.45)";
    ctx.fillRect(0, 0, width, height);

    let snappedCount = 0;
    const horizontalEase = 1 - Math.exp(-PART_HORIZONTAL_EASE * delta);
    parts.forEach((part) => {
      if (!part.snapped) {
        part.y += part.speed * delta;
        part.x += (part.targetX - part.x) * horizontalEase;
        part.clock += delta * part.wobbleSpeed;
        const reachedY = part.y >= part.targetY;
        if (reachedY) {
          part.y = part.targetY;
        }
        if (reachedY && Math.abs(part.x - part.targetX) < 1.5) {
          part.x = part.targetX;
          part.snapped = true;
          part.flash = 1;
          part.wobbleAmp = 0;
          options.onSnap?.({ index: part.index, x: part.targetX, y: part.targetY });
        }
      } else {
        snappedCount += 1;
        part.flash = Math.max(0, part.flash - delta / SNAP_ANIMATION_TIME);
      }
      drawPart(part);
    });

    if (snappedCount === parts.length) {
      idleTimer += delta;
      if (idleTimer > ASSEMBLY_RESET_DELAY) {
        rebuildParts();
      }
    }

    raf = window.requestAnimationFrame(tick);
  };

  const handleResize = () => resize();

  const observer = new ResizeObserver(() => {
    handleResize();
  });
  observer.observe(container);

  resize();
  tick(performance.now());

  return () => {
    window.cancelAnimationFrame(raf);
    observer.disconnect();
    canvas.remove();
  };
};

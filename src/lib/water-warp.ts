let warpX = 0.5;
let warpY = 0.5;
let warpStrength = 0;
let targetX = 0.5;
let targetY = 0.5;
let targetStrength = 0;
let raf = 0;

const root = () =>
  typeof document !== "undefined" ? document.documentElement : null;

function apply() {
  const el = root();
  if (!el) return;
  el.style.setProperty("--warp-xp", (warpX * 100).toFixed(2));
  el.style.setProperty("--warp-yp", (warpY * 100).toFixed(2));
  el.style.setProperty("--warp-strength", warpStrength.toFixed(3));

  const dx = warpX - 0.5;
  const dy = warpY - 0.5;
  const strength = warpStrength;
  const edgeScale = strength * 6;

  el.style.setProperty("--warp-edge-left", `${(-dx * edgeScale).toFixed(4)}vw`);
  el.style.setProperty("--warp-edge-right", `${(dx * edgeScale).toFixed(4)}vw`);
  el.style.setProperty("--warp-edge-top", `${(-dy * edgeScale * 0.8).toFixed(4)}vh`);
  el.style.setProperty("--warp-edge-bottom", `${(dy * edgeScale * 0.8).toFixed(4)}vh`);
  el.style.setProperty("--warp-bulge", `${(strength * 60).toFixed(2)}px`);
}

function tick() {
  warpX += (targetX - warpX) * 0.12;
  warpY += (targetY - warpY) * 0.12;
  warpStrength += (targetStrength - warpStrength) * 0.15;
  targetStrength *= 0.9;
  apply();

  if (warpStrength < 0.002 && targetStrength < 0.002) {
    warpStrength = 0;
    targetStrength = 0;
    raf = 0;
    apply();
    return;
  }
  raf = requestAnimationFrame(tick);
}

export function signalWaterWarp(
  clientX: number,
  clientY: number,
  strength = 0.35,
) {
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  targetX = Math.min(1, Math.max(0, clientX / w));
  targetY = Math.min(1, Math.max(0, clientY / h));
  targetStrength = Math.min(1, targetStrength + strength);
  if (!raf) raf = requestAnimationFrame(tick);
}

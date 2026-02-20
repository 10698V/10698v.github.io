const HOVER_SELECTOR = "a, button, [role=\"button\"], .tile, [data-cursor=\"hover\"]";
const INPUT_SELECTOR = "input, textarea, select, [contenteditable], [contenteditable=\"true\"]";
const LOCK_SELECTOR = ".tile.is-flipped";

const DEFAULT_ACCENT = "#6beeff";
const PRESS_MS = 160;
const LOCK_FLASH_MS = 180;

const shouldDisableForPointer = () => {
  if (typeof window === "undefined" || typeof matchMedia !== "function") return true;
  return (
    matchMedia("(pointer: coarse)").matches ||
    matchMedia("(hover: none)").matches
  );
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export const initArcanaCursor = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (shouldDisableForPointer()) return;

  const existing = document.getElementById("arcana-cursor");
  if (existing) return;

  const root = document.documentElement;
  const reduced = prefersReducedMotion();

  const cursor = document.createElement("div");
  cursor.id = "arcana-cursor";
  cursor.className = reduced ? "reduced-motion is-hidden" : "is-hidden";
  cursor.setAttribute("aria-hidden", "true");
  cursor.innerHTML = `
    <span class="arcana-cursor__ring"></span>
    <span class="arcana-cursor__dot"></span>
    <span class="arcana-cursor__lock">LOCK</span>
  `;
  document.body.appendChild(cursor);

  root.classList.add("arcana-cursor-enabled");

  let pointerX = window.innerWidth * 0.5;
  let pointerY = window.innerHeight * 0.5;
  let renderX = pointerX;
  let renderY = pointerY;
  let raf = 0;
  let rotation = 0;
  let lastTs = 0;
  let lockState = false;
  let lockFlashTimer = 0;

  const setAccent = (target: HTMLElement | null) => {
    let accent = "";
    if (target) {
      const tile = target.closest<HTMLElement>(".tile");
      if (tile) {
        accent = getComputedStyle(tile).getPropertyValue("--role-accent").trim();
      }
      if (!accent) {
        const styles = getComputedStyle(target);
        accent =
          styles.getPropertyValue("--arcana-accent").trim() ||
          styles.getPropertyValue("--role-accent").trim();
      }
    }
    cursor.style.setProperty("--cursor-accent", accent || DEFAULT_ACCENT);
  };

  const flashLock = () => {
    cursor.classList.add("show-lock");
    window.clearTimeout(lockFlashTimer);
    lockFlashTimer = window.setTimeout(() => {
      cursor.classList.remove("show-lock");
    }, LOCK_FLASH_MS);
  };

  const syncLock = () => {
    const next = Boolean(document.querySelector(LOCK_SELECTOR));
    if (next === lockState) return;
    lockState = next;
    cursor.classList.toggle("is-lock", next);
    if (next) flashLock();
  };

  const showCursor = () => {
    cursor.classList.remove("is-hidden");
  };

  const hideCursor = () => {
    cursor.classList.add("is-hidden");
    cursor.classList.remove("is-hover", "is-press");
  };

  const tick = (ts: number) => {
    if (!lastTs) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.04);
    lastTs = ts;

    const smoothing = reduced ? 1 : 0.24;
    renderX += (pointerX - renderX) * smoothing;
    renderY += (pointerY - renderY) * smoothing;
    cursor.style.transform = `translate3d(${renderX}px, ${renderY}px, 0)`;

    if (!reduced) {
      const hoverSpeed = cursor.classList.contains("is-hover") ? 220 : 90;
      rotation = (rotation + hoverSpeed * dt) % 360;
      cursor.style.setProperty("--cursor-rot", `${rotation.toFixed(2)}deg`);
    }

    raf = window.requestAnimationFrame(tick);
  };

  const onPointerMove = (event: PointerEvent) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (root.classList.contains("arcana-cursor-input")) return;
    showCursor();
  };

  const onPointerOver = (event: Event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    const inputTarget = target.closest<HTMLElement>(INPUT_SELECTOR);
    if (inputTarget) {
      root.classList.add("arcana-cursor-input");
      hideCursor();
      return;
    }

    root.classList.remove("arcana-cursor-input");
    showCursor();

    const interactive = target.closest<HTMLElement>(HOVER_SELECTOR);
    if (interactive) {
      cursor.classList.add("is-hover");
      setAccent(interactive);
    } else {
      cursor.classList.remove("is-hover");
      setAccent(null);
    }
  };

  const onPointerDown = () => {
    if (cursor.classList.contains("is-hidden")) return;
    cursor.classList.add("is-press");
    window.setTimeout(() => cursor.classList.remove("is-press"), PRESS_MS);
  };

  const onPointerUp = () => {
    cursor.classList.remove("is-press");
  };

  const onPointerLeaveWindow = () => {
    root.classList.remove("arcana-cursor-input");
    hideCursor();
  };

  const lockObserver = new MutationObserver(() => syncLock());
  lockObserver.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });

  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerover", onPointerOver, { passive: true });
  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("blur", onPointerLeaveWindow);
  window.addEventListener("pointerout", (event) => {
    if ((event as PointerEvent).relatedTarget === null) onPointerLeaveWindow();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) onPointerLeaveWindow();
  });
  document.addEventListener("astro:page-load", () => {
    syncLock();
  });

  syncLock();
  setAccent(null);
  raf = window.requestAnimationFrame(tick);

  // never auto-cleaned in SPA session; singleton is intentional
  (window as Window & { __arcanaCursorCleanup?: () => void }).__arcanaCursorCleanup = () => {
    window.cancelAnimationFrame(raf);
    window.clearTimeout(lockFlashTimer);
    lockObserver.disconnect();
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerover", onPointerOver);
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("blur", onPointerLeaveWindow);
    cursor.remove();
    root.classList.remove("arcana-cursor-enabled", "arcana-cursor-input");
  };
};

export const triggerArcanaCursorBloom = (durationMs = 360) => {
  const cursor = document.getElementById("arcana-cursor");
  if (!cursor || cursor.classList.contains("reduced-motion")) return;
  cursor.classList.remove("is-bloom");
  void cursor.clientWidth;
  cursor.classList.add("is-bloom");
  window.setTimeout(() => cursor.classList.remove("is-bloom"), durationMs);
};

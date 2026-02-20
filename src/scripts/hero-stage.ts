import { bootHero, disposeHero } from "../lib/hero-block.ts";

type BalloonOpts = {
  inflateDuration?: number;
  explodeDuration?: number;
  onExplodeStart?: () => void;
  onComplete?: () => void;
};

type HeroAPI = {
  runBalloonPop?: (opts?: BalloonOpts) => Promise<void>;
  reassemble?: () => void;
};

declare global {
  interface Window {
    __PRIM3_LOADER_READY?: boolean;
  }
}

let currentHeroAPI: HeroAPI | null = null;
let pendingAssemblyRequest = false;
let heroNavInFlight = false;
let apiListenersBound = false;
let heroCanvas: HTMLCanvasElement | null = null;
let heroStageCleanedUp = false;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

const isLoaderReady = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return true;
  if (window.__PRIM3_LOADER_READY) return true;
  if (document.body?.dataset.loaderState === "done") return true;
  const loader = document.querySelector<HTMLElement>("[data-site-loader]");
  if (!loader) return true;
  return loader.dataset.active !== "true";
};

const markFromHero = () => {
  try {
    window.sessionStorage.setItem("__prim3_from_hero__", "1");
  } catch {
    // ignore
  }
};

function setHeroAPI(api: HeroAPI | null) {
  currentHeroAPI = api;
  if (api && pendingAssemblyRequest) {
    pendingAssemblyRequest = false;
    api.reassemble?.();
  }
}

function onHeroApiReady(event: Event) {
  const detail = (event as CustomEvent)?.detail;
  if (detail?.canvas === heroCanvas && detail?.api) {
    setHeroAPI(detail.api as HeroAPI);
  }
}

function onHeroApiDisposed(event: Event) {
  const detail = (event as CustomEvent)?.detail;
  if (detail?.canvas === heroCanvas) {
    setHeroAPI(null);
  }
}

function bindHeroApiEvents(canvas: HTMLCanvasElement) {
  if (heroCanvas !== canvas) {
    heroCanvas = canvas;
    setHeroAPI((canvas as any).__hero3d ?? null);
  }
  if (!apiListenersBound) {
    document.addEventListener("hero:block-attached", onHeroApiReady as EventListener);
    document.addEventListener("hero:block-ready", onHeroApiReady as EventListener);
    document.addEventListener("hero:block-disposed", onHeroApiDisposed as EventListener);
    apiListenersBound = true;
  }

  const existing = (canvas as any).__hero3d as HeroAPI | undefined;
  if (existing) setHeroAPI(existing);
}

function requestHeroAssembly() {
  if (currentHeroAPI?.reassemble) {
    currentHeroAPI.reassemble();
  } else {
    pendingAssemblyRequest = true;
  }
}

function waitForLoaderAndAssemble() {
  const trigger = () => requestHeroAssembly();
  if (isLoaderReady()) {
    trigger();
  } else {
    let fired = false;
    const runOnce = () => {
      if (fired) return;
      fired = true;
      trigger();
    };
    window.addEventListener("site-loader:start", runOnce, { once: true });
    window.setTimeout(runOnce, 900);
  }
}

async function navigateWithHeroExplosion(href: string) {
  console.log("[Hero] navigateWithHeroExplosion called");
  if (heroNavInFlight) {
    console.warn("[Hero] Navigation already in flight");
    return;
  }
  heroNavInFlight = true;

  try {
    const { triggerHeroTransition } = await import("../lib/route-transitions.ts");
    triggerHeroTransition(href, "hero3d", 1100);
  } catch (err) {
    console.error("[Hero] Transition failed", err);
    window.location.href = href;
  } finally {
    heroNavInFlight = false;
  }
}

let heroClickHandler: ((e: MouseEvent) => void) | null = null;
let heroKeyHandler: ((e: KeyboardEvent) => void) | null = null;

function initNavigation(canvas: HTMLCanvasElement) {
  if (canvas.dataset.heroNav === "1") return;
  canvas.dataset.heroNav = "1";

  const goToTeam = () => navigateWithHeroExplosion("/team");

  heroClickHandler = (event: MouseEvent) => {
    console.log("[Hero] Click detected");
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    goToTeam();
  };

  heroKeyHandler = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      goToTeam();
    }
  };

  canvas.addEventListener("click", heroClickHandler);
  canvas.addEventListener("keydown", heroKeyHandler);
  canvas.style.cursor = "pointer";
}

function removeNavigationEvents(canvas: HTMLCanvasElement) {
  if (heroClickHandler) {
    canvas.removeEventListener("click", heroClickHandler);
    heroClickHandler = null;
  }
  if (heroKeyHandler) {
    canvas.removeEventListener("keydown", heroKeyHandler);
    heroKeyHandler = null;
  }
  canvas.dataset.heroNav = "0";
  canvas.style.cursor = "";
}

async function activateHero(shell: HTMLElement, opts?: { startExploded?: boolean }) {
  if (!shell) return;
  shell.classList.add("hero-shell--active");
  const { bootHero } = await import("../lib/hero-block.ts");
  bootHero(opts);
}

function bootHeroModule() {
  const shell = document.querySelector<HTMLElement>("[data-hero-shell]");
  let canvas = document.getElementById("hero3d") as HTMLCanvasElement | null;
  if (!shell || !canvas) return;

  // Check for persisted canvas and restore it if available
  const persisted = (window as any).__persistedHeroCanvas as HTMLCanvasElement | undefined;
  if (persisted && persisted !== canvas) {
    console.log("[HeroStage] Restoring persisted canvas to slot");

    // Copy attributes from new canvas to persisted one to ensure it matches current page state
    const attrs = canvas.getAttributeNames();
    attrs.forEach(name => {
      const val = canvas!.getAttribute(name);
      if (val !== null) persisted.setAttribute(name, val);
    });

    // Reset styles that were set during transition
    Object.assign(persisted.style, {
      position: "",
      inset: "",
      width: "100%",
      height: "100%",
      maxWidth: "",
      maxHeight: "",
      zIndex: "",
      pointerEvents: "", // Re-enable pointer events
      transform: "",
    });

    persisted.id = "hero3d"; // Ensure ID matches

    // Swap in DOM
    canvas.replaceWith(persisted);
    canvas = persisted;
  }

  bindHeroApiEvents(canvas);

  // Force reset nav state to ensure listeners are re-attached
  // This is crucial when returning to the persisted canvas
  canvas.dataset.heroNav = "0";
  initNavigation(canvas); // Attach listeners immediately
  waitForLoaderAndAssemble();

  // NOTE: bootHero() is called inside run() below, gated behind loader start.

  const run = () => {
    // Boot hero AFTER loader signals start — avoid heavy work during loader.
    bootHero();

    requestAnimationFrame(() => {
      // Check for return from team
      let startExploded = false;
      try {
        if (window.sessionStorage.getItem("__prim3_from_team__") === "1") {
          window.sessionStorage.removeItem("__prim3_from_team__");
          startExploded = true;
        }
      } catch { }

      activateHero(shell, { startExploded });

      // If startExploded, we don't need explicit reassemble call because init handles it.

      // If startExploded, we don't need explicit reassemble call because init handles it.
      // But we might want to ensure it triggers if init was already done?
      // If init was already done (renderer exists), bootHero calls runHero which calls attachHeroAPI.
      // It does NOT call init again.
      // So if the hero was NOT disposed (e.g. cached), we need to trigger reassemble manually.
      if (startExploded) {
        // We can try to get the API and call reassemble just in case it was already running.
        // But usually on navigation we dispose everything.
        // Let's assume it's a fresh init for now.
      }
    });
  };

  if (isLoaderReady()) {
    run();
  } else {
    let booted = false;
    const runOnce = () => {
      if (booted) return;
      booted = true;
      run();
    };
    window.addEventListener("site-loader:start", runOnce, { once: true });
    // Fallback for SPA/back-nav race where loader event was already consumed.
    window.setTimeout(runOnce, 900);
  }
}

export function cleanupHeroStage() {
  if (heroStageCleanedUp) return;

  // ALWAYS remove navigation events first, regardless of transition type.
  if (currentHeroAPI) {
    const canvas = document.getElementById("hero3d") as HTMLCanvasElement;
    if (canvas) removeNavigationEvents(canvas);
    // Also check persisted canvas
    const persisted = (window as any).__persistedHeroCanvas;
    if (persisted) removeNavigationEvents(persisted);
  }

  // Check if we are transitioning to Team page
  // If so, we MUST NOT dispose the hero, because we want to reuse it.
  try {
    if (window.sessionStorage.getItem("__prim3_from_hero__") === "1") {
      console.log("[HeroStage] Skipping dispose due to hero->team transition");
      return;
    }
  } catch { }

  heroStageCleanedUp = true;

  disposeHero();
  // We don't remove apiListenersBound because they are global and might be needed if we return
  // But strictly speaking we could if we wanted to be perfectly clean.
  // For now, disposeHero handles the heavy WebGL stuff.
}

export function initHeroStage() {
  heroNavInFlight = false;
  currentHeroAPI = null;
  pendingAssemblyRequest = false;
  heroCanvas = null;
  heroStageCleanedUp = false;

  // Clear the "from hero" flag so that subsequent navigations (or reloads)
  // don't accidentally skip cleanup.
  try {
    window.sessionStorage.removeItem("__prim3_from_hero__");
  } catch { }

  const run = () => {
    // Give the DOM a moment to settle after swap
    requestAnimationFrame(() => {
      bootHeroModule();
    });
  };

  if (document.readyState !== "loading") {
    run();
  } else {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  }
}

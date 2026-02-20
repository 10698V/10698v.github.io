import { preloadTeamPage } from "./portfolio-loader.ts";
import { navigateSoft } from "./spa-router.ts";

// Smooth 3D frosted glass explosion with a graceful fallback

type Opts = {
  linkSelector: string;
  sourceCanvasId: string;
  duration?: number;
  bg?: string;
};

let _heroImg: HTMLImageElement | null = null;

type HeroAPI = {
  runBalloonPop: (opts?: {
    inflateDuration?: number;
    explodeDuration?: number;
    onExplodeStart?: () => void;
    onComplete?: () => void;
  }) => Promise<void>;
  setCameraLocked?: (locked: boolean) => void;
};

export function prewarmHeroMask(url: string) {
  if (_heroImg) return;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";
  img.loading = "eager";
  img.src = url;
  img.onload = () => console.log("[transition] Hero image prewarmed");
  _heroImg = img;
}

function waitForHeroAPI(canvas: HTMLCanvasElement | null, timeout = 900) {
  if (!canvas) return Promise.resolve<HeroAPI | null>(null);
  const api = (canvas as any).__hero3d as HeroAPI | undefined;
  if (api?.runBalloonPop) return Promise.resolve(api);

  return new Promise<HeroAPI | null>((resolve) => {
    let settled = false;
    const finish = (value: HeroAPI | null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("hero:block-attached", onReady as EventListener);
      document.removeEventListener("hero:block-ready", onReady as EventListener);
      document.removeEventListener("hero:block-disposed", onDispose as EventListener);
      clearTimeout(timer);
      resolve(value);
    };

    const onReady = (evt: Event) => {
      const detail = (evt as CustomEvent)?.detail;
      if (detail?.canvas === canvas && detail?.api?.runBalloonPop) {
        finish(detail.api as HeroAPI);
      }
    };

    const onDispose = (evt: Event) => {
      const detail = (evt as CustomEvent)?.detail;
      if (detail?.canvas === canvas) {
        finish(null);
      }
    };

    document.addEventListener("hero:block-attached", onReady as EventListener);
    document.addEventListener("hero:block-ready", onReady as EventListener);
    document.addEventListener("hero:block-disposed", onDispose as EventListener);

    const timer = window.setTimeout(() => {
      finish(((canvas as any).__hero3d as HeroAPI | undefined) ?? null);
    }, timeout);
  });
}

function fadeOutAndNavigate(heroWrap: HTMLElement | null, href: string, bg: string) {
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "9999",
    pointerEvents: "none",
    background: bg,
    opacity: "0",
    transition: "opacity 0.45s ease",
  } as CSSStyleDeclaration);
  document.body.appendChild(overlay);
  overlay.offsetHeight;
  overlay.style.opacity = "1";
  if (heroWrap) {
    heroWrap.style.transition = "opacity 0.3s ease";
    heroWrap.style.opacity = "0";
  }
  setTimeout(() => {
    window.location.href = href;
  }, 460);
}

export function triggerHeroTransition(href: string, sourceCanvasId: string, duration = 1200, bg = "#0a0b11") {
  const markFromHero = () => {
    try {
      window.sessionStorage.setItem("__prim3_from_hero__", "1");
    } catch { }
  };

  const flagEnterFromHero = () => {
    try {
      document.body.dataset.enterFromHero = "1";
    } catch { }
  };

  const ensureTeamPrefetch = () => {
    preloadTeamPage().catch(() => { });
  };

  ensureTeamPrefetch();
  flagEnterFromHero();

  const prefersReducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
  if (prefersReducedQuery.matches) {
    markFromHero();
    navigateSoft(href, { fromHero: true }).catch(() => {
      window.location.href = href;
    });
    return;
  }

  try {
    const linkPrefetch = document.createElement("link");
    linkPrefetch.rel = "prefetch";
    linkPrefetch.href = href;
    document.head.appendChild(linkPrefetch);
    fetch(href, { credentials: "same-origin" }).catch(() => { });
  } catch { }

  const hero = document.getElementById(sourceCanvasId) as HTMLCanvasElement | null;
  const heroWrap = hero?.closest("section") as HTMLElement | null;

  waitForHeroAPI(hero).then((heroAPI) => {
    // Keep canvas visible and positioned during transition
    // Team page will run runToCards() for the actual animation
    if (heroAPI) {
      if (heroAPI.setCameraLocked) {
        heroAPI.setCameraLocked(true);
      }

      if (heroWrap) {
        Object.assign(heroWrap.style, {
          position: "fixed",
          inset: "0",
          width: "100vw",
          height: "100vh",
          zIndex: "9999",
          margin: "0",
          padding: "0",
          borderRadius: "0",
          transform: "none",
          background: "transparent",
        });

        const stage = heroWrap.querySelector(".hero-stage") as HTMLElement;
        if (stage) {
          Object.assign(stage.style, {
            height: "100vh",
            width: "100vw",
            maxHeight: "none",
          });
        }

        const reflection = heroWrap.querySelector(".hero-reflection") as HTMLElement;
        if (reflection) reflection.style.display = "none";

        if (hero) {
          hero.id = "hero-transition-canvas";
          document.body.appendChild(hero);
          (window as any).__persistedHeroCanvas = hero;

          Object.assign(hero.style, {
            position: "fixed",
            inset: "0",
            width: "100%",
            height: "100%",
            maxWidth: "none",
            maxHeight: "none",
            zIndex: "50",
            pointerEvents: "none",
          });

          window.dispatchEvent(new Event("resize"));
          requestAnimationFrame(() => {
            window.dispatchEvent(new Event("resize"));
          });
        }
      }
    }

    // DISABLED: Old explosion system - unified animation now handles everything
    // The Team page will run runToCards() which does inflate->explode->reassemble in one shot
    /*
    if (heroAPI?.runBalloonPop) {
      const totalSec = Math.max(duration / 1000, 0.6);
      const inflateSec = Math.max(0.38, Math.min(totalSec * 0.4, 0.65));
      const explodeSec = Math.max(0.6, totalSec - inflateSec);
    
      let navTriggered = false;
      const triggerNav = () => {
        if (navTriggered) return;
        navTriggered = true;
        markFromHero();
        navigateSoft(href, { fromHero: true }).catch(() => {
          window.location.href = href;
        });
      };
    
      // REMOVED: Premature navigation trigger was cutting animation short
      // setTimeout(triggerNav, totalSec * 1000 * 0.85);
      // Now we ONLY navigate when runBalloonPop completes
    
      heroAPI
        .runBalloonPop({
          inflateDuration: inflateSec,
          explodeDuration: explodeSec,
          onExplodeStart: () => { },
        })
        .then(() => {
          triggerNav();
        })
        .catch(() => {
          triggerNav();
        });
    } else {
      markFromHero();
      navigateSoft(href, { fromHero: true }).catch(() => fadeOutAndNavigate(heroWrap, href, bg));
    }
    */

    // NEW: Just navigate immediately - unified animation handles everything
    // Navigate immediately - team page will handle animation
    markFromHero();
    setTimeout(() => {
      navigateSoft(href, { fromHero: true }).catch(() => {
        window.location.href = href;
      });
    }, 100);
  });
}

export function setupHeroToTeamTransition(opts: Opts) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const { linkSelector, sourceCanvasId, duration = 1200, bg = "#0a0b11" } = opts;
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(linkSelector),
  );
  if (!links.length) return;

  const handleClick = (event: MouseEvent) => {
    const link = event.currentTarget as HTMLAnchorElement | null;
    if (!link) return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();

    const href = link.getAttribute("href") || "/";
    triggerHeroTransition(href, sourceCanvasId, duration, bg);
  };

  links.forEach((link) => {
    if (link.dataset.heroTransitionBound === "1") return;
    link.dataset.heroTransitionBound = "1";
    link.addEventListener("click", handleClick);
  });
}
// Restore persisted canvas after swap
document.addEventListener("astro:after-swap", () => {
  const persisted = (window as any).__persistedHeroCanvas;
  if (persisted && !document.body.contains(persisted)) {
    console.log("[Route] Restoring persisted hero canvas");
    document.body.appendChild(persisted);
  }
});

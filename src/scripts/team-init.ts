import { bootRogerTiles, disposeRogerTiles } from "../lib/roger-tiles.ts";
import { navigateSoft } from "../lib/spa-router.ts";
import { initRoleBacks, cleanupRoleBacks } from "./role-back.ts";

type TeamInitOptions = {
  fromHero?: boolean;
};

const TEAM_HANDLE = "[team]";
let lastTilesContainer: Element | null = null;
let gsapLoader: Promise<{ gsap: any; ScrollTrigger: any }> | null = null;
let teamPageCleanedUp = false;

export function isTeamRoute(pathname: string = typeof window !== "undefined" ? window.location.pathname : "") {
  return pathname === "/team" || pathname === "/team/" || pathname === "/team/index.html";
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

async function loadGsap() {
  if (!gsapLoader) {
    gsapLoader = Promise.all([
      import("https://esm.sh/gsap@3.12.5"),
      import("https://esm.sh/gsap@3.12.5/ScrollTrigger?external=gsap"),
    ]).then(([gsapModule, scrollModule]) => {
      const gsap = (gsapModule as any).gsap ?? gsapModule.default ?? gsapModule;
      const ScrollTrigger = (scrollModule as any).ScrollTrigger ?? scrollModule.default ?? scrollModule;
      gsap.registerPlugin(ScrollTrigger);
      return { gsap, ScrollTrigger };
    });
  }
  return gsapLoader;
}

function detectFromHeroFlag(opts?: TeamInitOptions) {
  let fromHero = Boolean(opts?.fromHero);
  try {
    const stored = window.sessionStorage.getItem("__prim3_from_hero__") === "1";
    if (stored) {
      fromHero = true;
      window.sessionStorage.removeItem("__prim3_from_hero__");
    }
  } catch {
    // no-op
  }
  return fromHero;
}

let summonIntroRunning = false; // Guard against duplicate calls

function runSummonIntro(fromHero: boolean) {
  console.log("[Team] runSummonIntro called, fromHero:", fromHero, "running:", summonIntroRunning);

  // CRITICAL: Prevent duplicate execution
  // This can be called multiple times in quick succession on SPA navigation
  if (summonIntroRunning) {
    console.log("[Team] runSummonIntro already running, skipping duplicate call");
    return;
  }
  summonIntroRunning = true;

  const page = document.querySelector<HTMLElement>(".team-page");
  const header = document.querySelector<HTMLElement>(".team-header");
  if (!page) {
    summonIntroRunning = false;
    return;
  }

  const reduced = prefersReducedMotion();

  const resetIntroState = () => {
    delete document.body.dataset.enterFromHero;
    page.style.opacity = "1";
    page.style.transform = "";
    summonIntroRunning = false; // Reset flag on completion
  };

  // Safety net: Force reset after 4s in case animation hangs or fails
  setTimeout(() => {
    resetIntroState();
  }, 4000);

  if (reduced) {
    resetIntroState();
    return;
  }

  page.dataset.summonInit = "1";

  loadGsap()
    .then(({ gsap }) => {
      console.log("[Team] GSAP loaded");

      // 0. Instant Hide (Prevent FOUC) - Handled by CSS .hero-transition
      // We just ensure the page container is visible so the background shows
      const cards = page.querySelectorAll(".tile");
      const grid = page.querySelector(".team-grid");
      page.style.opacity = "1";

      if (fromHero && cards.length) {
        console.log("[Team] Starting Reassembly Sequence");

        // 1. Header (animate immediately)
        if (header) {
          gsap.fromTo(
            header,
            { y: -30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8, ease: "power3.out", delay: 0.2 }
          );
        }

        // 2. Async Reassembly
        console.log("[Team] Importing hero-block...");
        import("../lib/hero-block.ts")
          .then(async ({ bootHero, disposeHero }) => {
            console.log("[Team] hero-block imported successfully");
            import("./team-reassembly").then(async ({ getTeamCardRects }) => {
              console.log("[Team] Modules loaded");

              // Check for existing persisted canvas (DOM or global)
              const existingCanvas = (document.getElementById("hero-transition-canvas") || (window as any).__persistedHeroCanvas) as HTMLCanvasElement | null;
              let canvas: HTMLCanvasElement;
              let isAdopting = false;

              if (existingCanvas) {
                console.log("[Team] Adopting existing hero canvas");
                canvas = existingCanvas;
                isAdopting = true;
                // Reset ID
                canvas.id = "";
              } else {
                // Ensure clean slate only if NOT adopting
                if (disposeHero) disposeHero();

                // Create canvas directly on body (no fake container)
                // We use mix-blend-mode: screen to make the black background transparent
                // and blend the glowing cubes additively over the REAL site background.
                canvas = document.createElement("canvas");
                document.body.appendChild(canvas);
              }

              Object.assign(canvas.style, {
                position: "fixed",
                inset: "0",
                width: "100%",
                height: "100%",
                zIndex: "50",
                pointerEvents: "none",
                backgroundColor: "transparent",
                mixBlendMode: "screen", // Critical: Blends black background away
                filter: "saturate(1.15) brightness(1.12)", // Match Home page look
              });

              // Wait for API
              const waitForApi = new Promise<any>((resolve) => {
                // If adopting, the API might already be attached. Check immediately.
                if (isAdopting && (canvas as any).__hero3d) {
                  resolve((canvas as any).__hero3d);
                  return;
                }

                const onReady = (e: any) => {
                  if (e.detail.canvas === canvas) {
                    document.removeEventListener("hero:block-ready", onReady);
                    resolve(e.detail.api);
                  }
                };
                document.addEventListener("hero:block-ready", onReady);
              });

              // Boot Hero
              console.log("[Team] Booting Hero on canvas (adopting:", isAdopting, ")");
              try {
                // If adopting, we don't want to startExploded=true necessarily, 
                // we want it to continue from where it is (which is exploding).
                // But bootHero handles idempotency.
                bootHero({ canvas, startExploded: true });
              } catch (err) {
                console.error("[Team] bootHero failed:", err);
                throw err;
              }

              const api = await waitForApi;
              console.log("[Team] Hero API ready");

              // Reveal Page Container (already visible, but ensure opacity is 1)
              gsap.set(page, { opacity: 1 });
              // Grid is hidden via opacity 0, we will animate it in or its children
              if (grid) gsap.set(grid, { opacity: 1 }); // Make container visible, children are still hidden via opacity 0

              // Calculate targets
              const rects = getTeamCardRects();
              console.log("[Team] Calculated rects:", rects.length);

              if (api.setReassemblyTargets && api.runToCards) {
                // NEW: Use unified animation (explosion->reassembly in one smooth animation)
                console.log("[Team] Running unified animation");
                await api.runToCards({ targetRects: rects, duration: 1.8 });  // Increased from 1.4s

                // Morph Effect & Handoff
                console.log("[Team] Running morph effect");

                // Start morph (duration 0.6s)
                const morphPromise = api.runMorph ? api.runMorph(0.6) : Promise.resolve();

                // Reveal cards at peak of morph (approx 0.4s in)
                gsap.delayedCall(0.35, () => {
                  console.log("[Team] Handoff to DOM");

                  // REMOVE the hiding class to reveal the content
                  document.documentElement.classList.remove("hero-transition");

                  gsap.fromTo(cards,
                    { opacity: 0, scale: 1.1, filter: "brightness(1.5)" },
                    { opacity: 1, scale: 1, filter: "brightness(1)", duration: 0.5, ease: "power2.out" }
                  );
                });

                await morphPromise;

                // Fade out canvas after morph completes
                gsap.to(canvas, {
                  opacity: 0,
                  duration: 0.3,
                  onComplete: () => {
                    canvas.remove();
                    if (disposeHero) disposeHero();
                  }
                });
              } else {
                console.warn("[Team] API missing setReassemblyTargets");
                gsap.to(cards, { opacity: 1, duration: 0.5 });
                canvas.remove();
              }
            });
          })
          .catch((err) => {
            console.error("[Team] Failed to import hero-block:", err);
            // Fallback
            gsap.to(cards, { opacity: 1, duration: 0.5 });
          });

      } else {
        console.log("[Team] Standard Entrance");
        const tl = gsap.timeline({
          defaults: { ease: "power2.out" },
          onComplete: resetIntroState,
        });

        // 1. Page Reveal
        tl.to(
          page,
          {
            opacity: 1,
            duration: 0.55,
            ease: "power2.out",
          },
          0.1
        );

        // 2. Header
        if (header) {
          tl.fromTo(
            header,
            { y: -30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" },
            0.2
          );
        }

        // 3. Cards Stagger
        if (cards.length) {
          tl.fromTo(
            cards,
            { y: 40, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8, stagger: 0.1 },
            "-=0.4"
          );
        }
      }
    })
    .catch((e) => {
      console.error("[Team] GSAP load failed", e);
      resetIntroState();
    });
}

function bindTileFlips() {
  let currentlyFlippedTile: HTMLElement | null = null;
  let flipping = false; // guard against rapid-click race conditions
  const tiles = Array.from(document.querySelectorAll<HTMLElement>(".tile"));

  const emitFlipEvent = (tile: HTMLElement) => {
    tile.dispatchEvent(
      new CustomEvent("tile:flipped", {
        detail: { flipped: tile.classList.contains("is-flipped") },
      }),
    );
  };

  const setFlippedState = (tile: HTMLElement, flipped: boolean) => {
    tile.classList.toggle("is-flipped", flipped);
    tile.setAttribute("aria-pressed", flipped ? "true" : "false");
    emitFlipEvent(tile);
  };

  const enforceSingleFlipped = () => {
    const flipped = tiles.filter((tile) => tile.classList.contains("is-flipped"));
    if (!flipped.length) {
      currentlyFlippedTile = null;
      return;
    }
    currentlyFlippedTile = flipped[0] ?? null;
    for (let i = 1; i < flipped.length; i += 1) {
      setFlippedState(flipped[i], false);
    }
  };

  enforceSingleFlipped();

  tiles.forEach((tile) => {
    if (tile.dataset.flipBound === "1") return;
    tile.dataset.flipBound = "1";

    const toggle = (force?: boolean) => {
      if (flipping) return;
      flipping = true;
      const release = () => {
        window.setTimeout(() => {
          flipping = false;
        }, 140);
      };

      try {
        const next = typeof force === "boolean" ? force : !tile.classList.contains("is-flipped");

        if (next && currentlyFlippedTile && currentlyFlippedTile !== tile) {
          setFlippedState(currentlyFlippedTile, false);
          currentlyFlippedTile = null;
        }

        setFlippedState(tile, next);
        currentlyFlippedTile = next ? tile : null;
        enforceSingleFlipped();
      } finally {
        release();
      }
    };

    tile.addEventListener("click", (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && target.closest(".tile-true-btn")) return;
      toggle();
    });

    tile.addEventListener("keydown", (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && target.closest(".tile-true-btn")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        toggle(false);
      }
      if (event.key === "Enter" || event.key === " ") {
        if (target === tile) {
          event.preventDefault();
          toggle();
        }
      }
    });

    tile.setAttribute("aria-pressed", tile.classList.contains("is-flipped") ? "true" : "false");
    emitFlipEvent(tile);
  });
}

function bindMagicalBurst() {
  document.querySelectorAll<HTMLElement>(".tile").forEach((tile) => {
    if (tile.dataset.burstBound === "1") return;
    tile.dataset.burstBound = "1";

    const burstEl = tile.querySelector<HTMLElement>(".tile-burst");
    if (!burstEl) return;

    tile.addEventListener("click", (e) => {
      // Only trigger burst if not already flipped (clicking front side)
      if (tile.classList.contains("is-flipped")) return;
      burstEl.classList.remove("is-active");
      void burstEl.offsetWidth; // force reflow
      burstEl.classList.add("is-active");
      setTimeout(() => burstEl.classList.remove("is-active"), 500);
    });
  });
}

function bindGoHomeDust() {
  const btn = document.querySelector<HTMLAnchorElement>(".go-home-btn");
  if (!btn || btn.dataset.dustBound === "1") return;
  btn.dataset.dustBound = "1";

  btn.addEventListener("click", (event) => {
    if (prefersReducedMotion()) return;
    event.preventDefault();
    const href = btn.getAttribute("href") || "/";
    try { window.sessionStorage.setItem("__prim3_from_team__", "1"); } catch { }
    loadGsap()
      .then(({ gsap }) => {
        const tiles = gsap.utils.toArray(".tile") as HTMLElement[];
        const tl = gsap.timeline({
          defaults: { ease: "power2.in", duration: 0.5 },
          onComplete: () => {
            navigateSoft(href, { fromHero: false, fromTeam: true }).catch(() => {
              window.location.href = href;
            });
          },
        });

        if (tiles.length) {
          tl.to(
            tiles,
            {
              opacity: 0,
              scale: 0.85,
              rotateY: 10,
              filter: "blur(6px)",
              stagger: { each: 0.04, from: "random" },
            },
            0,
          );
        } else {
          tl.add(() => {
            navigateSoft(href, { fromHero: false, fromTeam: true }).catch(() => {
              window.location.href = href;
            });
          });
        }
      })
      .catch(() => {
        navigateSoft(href, { fromHero: false, fromTeam: true }).catch(() => {
          window.location.href = href;
        });
      });
  });
}

async function bindTeamGridAnimations() {
  if (prefersReducedMotion()) return;
  const { gsap } = await loadGsap();
  const cards = gsap.utils.toArray(".team-card") as HTMLElement[];
  cards.forEach((el, i) => {
    if (el.dataset.teamRevealBound === "1") return;
    el.dataset.teamRevealBound = "1";
    gsap.from(el, {
      scrollTrigger: { trigger: el, start: "top 85%", once: true },
      opacity: 0,
      y: 24,
      duration: 0.6,
      ease: "power2.out",
      delay: i * 0.06,
      immediateRender: false,
    });
  });
}

function bootRipples(container: Element | null) {
  if (!container) return;
  if ((container as HTMLElement).dataset.ripplesBooted === "1") return;
  (container as HTMLElement).dataset.ripplesBooted = "1";

  (window as any).__PRIM3_RIPPLE_DPR = 0.9;

  // Boot synchronously â€” modules are preloaded during the loader phase
  bootRogerTiles();
  console.log(`${TEAM_HANDLE} WebGL tiles booted`);
}

export function cleanupTeamPage() {
  if (teamPageCleanedUp) return;
  teamPageCleanedUp = true;
  disposeRogerTiles();
  cleanupRoleBacks();
  // Kill GSAP triggers if necessary?
  // Usually ScrollTrigger.refresh() or .getAll().forEach(t => t.kill())
  // But for now we just clean up the custom stuff.
}

export function initTeamPage(opts?: TeamInitOptions) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // CRITICAL: Prevent duplicate initialization
  // This function can be called multiple times via:
  // 1. astro:page-load event (team.astro line 56)
  // 2. SPA router's runPageInit (spa-router.ts line 206)
  // Only allow one initialization per page instance
  const page = document.querySelector<HTMLElement>(".team-page");
  if (page?.dataset.summonInit === "1") {
    console.log("[Team] initTeamPage called but already initializing, skipping");
    return;
  }

  // Reset cleanup flag
  teamPageCleanedUp = false;

  // Ensure cleanup runs when we leave this route
  document.addEventListener("astro:before-swap", cleanupTeamPage, { once: true });

  const fromHero = detectFromHeroFlag(opts);
  const teamGrid = document.querySelector(".team-grid");
  if (page) {
    delete page.dataset.summonPending;
    page.dataset.summonInit = "1"; // Mark as initializing EARLY to prevent duplicates
  }
  if (teamGrid !== lastTilesContainer) {
    if (teamGrid) {
      (teamGrid as HTMLElement).dataset.ripplesBooted = "0";
    }
    lastTilesContainer = teamGrid;
  }

  bindTileFlips();
  bindMagicalBurst();
  bindGoHomeDust();
  bootRipples(teamGrid);
  void bindTeamGridAnimations();

  // Initialize role backs immediately â€” modules are preloaded during loader
  initRoleBacks();

  runSummonIntro(fromHero);
}



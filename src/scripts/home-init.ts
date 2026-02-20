import { prewarmHeroMask, setupHeroToTeamTransition } from "../lib/route-transitions.ts";
import { initHeroStage, cleanupHeroStage } from "./hero-stage.ts";
import { preloadTeamPage } from "../lib/portfolio-loader.ts";

const HOME_HANDLE = "[home]";
let gsapLoader: Promise<{ gsap: any; ScrollTrigger: any }> | null = null;
let scrollTriggerRegistered = false;
let idlePrefetchScheduled = false;
let homeCleanupBound = false;
let homePageShowBound = false;
let heroRecoveryTimers: number[] = [];

export function isHomeRoute(pathname: string = typeof window !== "undefined" ? window.location.pathname : "") {
  return pathname === "" || pathname === "/" || pathname === "/index" || pathname === "/index.html";
}

async function loadGsap() {
  if (!gsapLoader) {
    gsapLoader = Promise.all([
      import("https://esm.sh/gsap@3.12.5"),
      import("https://esm.sh/gsap@3.12.5/ScrollTrigger?external=gsap"),
    ]).then(([gsapModule, scrollModule]) => {
      const gsap = (gsapModule as any).gsap ?? gsapModule.default ?? gsapModule;
      const ScrollTrigger = (scrollModule as any).ScrollTrigger ?? scrollModule.default ?? scrollModule;
      if (!scrollTriggerRegistered) {
        gsap.registerPlugin(ScrollTrigger as any);
        scrollTriggerRegistered = true;
      }
      return { gsap, ScrollTrigger };
    });
  }
  return gsapLoader;
}

function prefetchTeamOnIdle() {
  if (idlePrefetchScheduled) return;
  idlePrefetchScheduled = true;
  const runPrefetch = () => preloadTeamPage().catch(() => { });
  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(runPrefetch);
  } else {
    setTimeout(runPrefetch, 1200);
  }
}

function bindTeamHoverPrefetch() {
  const link = document.querySelector<HTMLAnchorElement>('a[href="/team"]');
  if (!link || link.dataset.teamPrefetchBound === "1") return;
  link.dataset.teamPrefetchBound = "1";
  const triggerPrefetch = () => preloadTeamPage().catch(() => { });
  link.addEventListener("mouseenter", triggerPrefetch, { once: true });
  link.addEventListener("focus", triggerPrefetch, { once: true });
}

function runReveals(gsap: any) {
  const reveals = gsap.utils.toArray(".reveal") as HTMLElement[];
  reveals.forEach((el: HTMLElement) => {
    if (el.dataset.revealBound === "1") return;
    el.dataset.revealBound = "1";
    gsap.from(el, {
      opacity: 0,
      y: 50,
      duration: 1,
      ease: "power2.out",
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
      },
      immediateRender: false,
    });
  });
}

function cleanupHome() {
  while (heroRecoveryTimers.length) {
    const id = heroRecoveryTimers.pop();
    if (typeof id === "number") window.clearTimeout(id);
  }
  cleanupHeroStage();
  // We could also kill ScrollTriggers here if we wanted to be thorough
}

function scheduleHeroRecovery() {
  const ensure = () => {
    if (!isHomeRoute()) return;
    const shell = document.querySelector<HTMLElement>("[data-hero-shell]");
    const canvas = document.getElementById("hero3d") as HTMLCanvasElement | null;
    if (!shell || !canvas) return;
    if (!shell.classList.contains("hero-shell--active")) {
      shell.classList.add("hero-shell--active");
      initHeroStage();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 16 || rect.height < 16) {
      initHeroStage();
    }
  };

  const delays = [120, 420, 950, 1600];
  heroRecoveryTimers.forEach((id) => window.clearTimeout(id));
  heroRecoveryTimers = delays.map((ms) => window.setTimeout(ensure, ms));
}

async function runHomeScripts(opts?: { fromTeam?: boolean }) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  document.documentElement.classList.remove("hero-transition");
  delete document.body?.dataset.enterFromHero;

  if (!homeCleanupBound) {
    document.addEventListener("astro:before-swap", cleanupHome);
    homeCleanupBound = true;
  }

  if (!homePageShowBound) {
    window.addEventListener("pageshow", () => {
      if (!isHomeRoute()) return;
      requestAnimationFrame(() => initHeroStage());
    });
    homePageShowBound = true;
  }

  initHeroStage();
  scheduleHeroRecovery();
  prewarmHeroMask("/logo.png");

  setupHeroToTeamTransition({
    linkSelector: 'a[href="/team"]',
    sourceCanvasId: "hero3d",
    duration: 1100,
  });

  const { gsap } = await loadGsap();
  runReveals(gsap);
  prefetchTeamOnIdle();
  bindTeamHoverPrefetch();
  console.log(`${HOME_HANDLE} ready`);
}

export function initHomePage(opts?: { fromTeam?: boolean }) {
  void runHomeScripts(opts);
}

export function initHomeScripts() {
  initHomePage();
}

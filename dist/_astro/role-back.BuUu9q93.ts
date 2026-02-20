import { attachMatrixRain } from "../lib/matrixRain";
import { attachBuilderForge } from "../lib/builderForge";
import { attachFieldOdometry } from "../lib/fieldOdometry";
import { attachDesignerGlyphforge } from "../lib/designerGlyphforge";
import { createTypewriter } from "../lib/pixelTypewriter";
import { attachInkDrips } from "../lib/inkBlot";

const NOTEBOOK_TYPE_INTERVAL_MS = 48; // To tweak notebook typing speed per character, change this value.
const NOTEBOOK_LINE_DELAY_MS = 420; // To tweak notebook delay between lines, change this value.
const ARCANA_SIGILS = ["\u29bf", "\u2736", "\u2234", "\u2609", "\u2727", "\u2726", "\u2728"];
const PROC_LABELS = ["RUNE SURGE", "ARCANA PROC", "AETHER BURST", "GLYPH CASCADE"];

let roleBacksActive = false;
let roleBacksCleanup: (() => void) | null = null;
// Single-active-FX: only one card runs effects at a time
let currentlyActivePause: (() => void) | null = null;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export const cleanupRoleBacks = () => {
  if (roleBacksCleanup) {
    roleBacksCleanup();
    roleBacksCleanup = null;
  }
  roleBacksActive = false;
};

export const initRoleBacks = () => {
  if (roleBacksActive) return;
  roleBacksActive = true;

  const roots = document.querySelectorAll<HTMLElement>(".role-back[data-role]");
  const cleanups: (() => void)[] = [];

  roots.forEach((root) => {
    try {
      if (root.dataset.enhanced === "1") return;
      root.dataset.enhanced = "1";

      const roleId = root.getAttribute("data-role");
      if (!roleId) return;
      const tile = root.closest<HTMLElement>(".tile");
      if (!tile) return;

      const writers = new Map<
        string,
        {
          controller: ReturnType<typeof createTypewriter>;
          lines: HTMLElement[];
        }
      >();
      let matrixCleanup: (() => void) | undefined;
      let builderCleanup: (() => void) | undefined;
      let driverCleanup: (() => void) | undefined;
      let designerCleanup: (() => void) | undefined;
      let active = false;
      let scrollReadyTimer = 0;
      let inkBlotCleanup: (() => void) | undefined;
      let driverEntrancePlayed = false;
      let builderEntrancePlayed = false;
      let notebookEntrancePlayed = false;
      let coderEntrancePlayed = false;
      let designerEntrancePlayed = false;
      const timeouts = new Set<number>();
      const intervals = new Set<number>();
      let microEventTimer = 0;

      const clearTimers = () => {
        timeouts.forEach((id) => window.clearTimeout(id));
        intervals.forEach((id) => window.clearInterval(id));
        timeouts.clear();
        intervals.clear();
      };

      const setTimer = (fn: () => void, delay: number) => {
        const id = window.setTimeout(() => {
          timeouts.delete(id);
          fn();
        }, delay);
        timeouts.add(id);
        return id;
      };

      const pulseClass = (
        element: Element | null | undefined,
        className: string,
        duration = 600,
      ) => {
        if (!element) return;
        element.classList.add(className);
        setTimer(() => element.classList.remove(className), duration);
      };

      const randMs = (base: number, variance = 0) => base + Math.random() * variance;

      const randomizeActivationVariant = () => {
        const sigil = root.querySelector<HTMLElement>("[data-arcana-sigil]");
        if (sigil) {
          sigil.textContent = ARCANA_SIGILS[Math.floor(Math.random() * ARCANA_SIGILS.length)] ?? "\u29bf";
        }
        const proc = root.querySelector<HTMLElement>(".arcana-proc");
        if (proc) {
          proc.textContent = PROC_LABELS[Math.floor(Math.random() * PROC_LABELS.length)] ?? "ARCANA PROC";
        }

        root.style.setProperty("--fx-seed-a", (0.75 + Math.random() * 1.6).toFixed(3));
        root.style.setProperty("--fx-seed-b", (0.2 + Math.random() * 0.9).toFixed(3));

        // Notebook runes get a new constellation every flip.
        root.querySelectorAll<HTMLElement>(".notebook-rune").forEach((rune, index) => {
          rune.style.setProperty("--delay", `${(Math.random() * 1.4 + index * 0.08).toFixed(2)}s`);
          rune.style.setProperty("--x", `${Math.round(8 + Math.random() * 84)}%`);
          rune.style.setProperty("--travel", `${Math.round(40 + Math.random() * 35)}%`);
        });

        root.querySelectorAll<HTMLElement>(".designer-constraints span").forEach((tag) => {
          tag.style.opacity = (0.62 + Math.random() * 0.3).toFixed(2);
          tag.style.transform = `translate(${(-3 + Math.random() * 6).toFixed(1)}px, ${(-2 + Math.random() * 4).toFixed(1)}px)`;
        });
      };

      const restartAnimations = (elements: Iterable<HTMLElement>) => {
        for (const element of elements) {
          element.style.animation = "none";
          // Force reflow so the animation restarts when flipped back.
          void element.offsetWidth;
          element.style.animation = "";
        }
      };

      const getWriter = (key: string, options = {}) => {
        if (!writers.has(key)) {
          const host = root.querySelector<HTMLElement>(`[data-typewriter="${key}"]`);
          if (!host) return null;
          const lines = Array.from(host.querySelectorAll<HTMLElement>("[data-line]"));
          if (!lines.length) return null;
          writers.set(key, {
            controller: createTypewriter(lines, options),
            lines,
          });
        }
        const entry = writers.get(key);
        if (!entry) return null;
        entry.controller.stop();
        entry.controller.reset();
        entry.lines.forEach((line) => {
          line.classList.remove(
            "is-visible",
            "is-finished",
            "is-glow",
            "is-impact",
            "is-muted",
            "is-final-line",
          );
        });
        return entry;
      };

      const ensureInkBlot = () => {
        if (prefersReducedMotion()) return;
        if (inkBlotCleanup) return;
        const host = root.querySelector<HTMLElement>("[data-inkblot]");
        if (!host) return;
        inkBlotCleanup = attachInkDrips(host);
      };

      const setBuilderTelemetry = (psiRaw: number) => {
        const psi = Math.max(0, Math.round(psiRaw));
        const psiNode = root.querySelector<HTMLElement>('[data-telemetry-value="air-psi"]');
        if (psiNode) psiNode.textContent = String(psi);
        const tensionNode = root.querySelector<HTMLElement>('[data-telemetry-value="tension"]');
        if (tensionNode) {
          tensionNode.textContent = psi >= 94 ? "OK" : psi >= 88 ? "WARN" : "LOW";
        }
      };

      const startEffects = () => {
        if (active) return;
        active = true;

        if (roleId === "coder") {
          const canvasHost = root.querySelector<HTMLElement>("[data-matrix]");
          const scene = root.querySelector<HTMLElement>(".coder-scene");
          const terminal = root.querySelector<HTMLElement>(".coder-terminal");
          const cube = root.querySelector<HTMLElement>(".coder-cube");
          const bootLog = root.querySelector<HTMLElement>("[data-coder-boot]");
          const matrixLayer = root.querySelector<HTMLElement>(".coder-matrix");
          if (!prefersReducedMotion() && canvasHost && canvasHost.clientWidth > 10) {
            requestAnimationFrame(() => {
              matrixCleanup = attachMatrixRain(canvasHost);
            });
          }

          const pulseCube = () => pulseClass(cube, "is-active", 1200);
          const pulseGlitch = () => pulseClass(matrixLayer, "is-glitching", 900);
          const nudgeTerminal = () => pulseClass(terminal, "is-nudge", 520);

          const writerEntry = getWriter("coder", {
            interval: prefersReducedMotion() ? 0 : 32,
            lineDelay: prefersReducedMotion() ? 0 : 400,
            onLineStart: (line: HTMLElement) => line.classList.add("is-visible"),
            onLineComplete: (line: HTMLElement) => {
              line.classList.add("is-finished");
              if (line.dataset.cube === "1") pulseCube();
              if (line.dataset.glitch === "1") pulseGlitch();
              if (line.dataset.nudge === "1") nudgeTerminal();
            },
          });

          if (!coderEntrancePlayed) {
            coderEntrancePlayed = true;
            pulseClass(scene, "is-blackout", 200);
            pulseClass(scene, "is-crt", 900);
            pulseClass(scene, "is-booting", 1200);
            pulseClass(terminal, "is-sliding", 1100);
            if (bootLog) {
              bootLog.textContent =
                "[ SIGMA_MATRIX ONLINE ]\n[ ACCESS LEVEL: ROOT // VRC_2025_26 ]";
              pulseClass(bootLog, "is-visible", 1100);
              setTimer(() => (bootLog.textContent = ""), 1200);
            }
          }

          const storm = () => {
            pulseClass(matrixLayer, "is-storm", 1200);
            setTimer(storm, randMs(6000, 2200));
          };
          if (!prefersReducedMotion()) storm();
          writerEntry?.controller.play();
        } else if (roleId === "driver") {
          const viewportHost = root.querySelector<HTMLElement>("[data-driver]");
          if (!prefersReducedMotion() && viewportHost && viewportHost.clientWidth > 10) {
            requestAnimationFrame(() => {
              driverCleanup = attachFieldOdometry(viewportHost);
            });
          }

          if (!driverEntrancePlayed) {
            driverEntrancePlayed = true;
          }

          const writerEntry = getWriter("driver", {
            interval: prefersReducedMotion() ? 0 : 30,
            lineDelay: prefersReducedMotion() ? 0 : 340,
            onLineStart: (line: HTMLElement) => line.classList.add("is-visible"),
            onLineComplete: (line: HTMLElement) => {
              line.classList.add("is-finished");
            },
          });
          writerEntry?.controller.play();
        } else if (roleId === "builder") {
          const assemblyHost = root.querySelector<HTMLElement>("[data-builder]");
          if (!prefersReducedMotion() && assemblyHost && assemblyHost.clientWidth > 10) {
            requestAnimationFrame(() => {
              builderCleanup = attachBuilderForge(assemblyHost, {
                onPsi: setBuilderTelemetry,
              });
            });
          }
          setBuilderTelemetry(100);

          if (!builderEntrancePlayed) {
            builderEntrancePlayed = true;
          }

          const writerEntry = getWriter("builder", {
            interval: prefersReducedMotion() ? 0 : 34,
            lineDelay: prefersReducedMotion() ? 0 : 330,
            onLineStart: (line: HTMLElement) => line.classList.add("is-visible"),
            onLineComplete: (line: HTMLElement) => {
              line.classList.add("is-finished");
            },
          });
          writerEntry?.controller.play();
        } else if (roleId === "notebooker") {
          const scrollPaper = root.querySelector<HTMLElement>(".notebook-scroll__paper");
          const caps = Array.from(root.querySelectorAll<HTMLElement>(".notebook-scroll__cap"));
          const runes = root.querySelector<HTMLElement>(".notebook-runes");
          const terminal = root.querySelector<HTMLElement>(".notebook-terminal");
          const ghostPage = root.querySelector<HTMLElement>(".notebook-ghostpage");
          const judge = root.querySelector<HTMLElement>(".notebook-judge");
          const timeline = root.querySelector<HTMLElement>(".notebook-timeline");
          let notebookLinesRef: HTMLElement[] = [];

          if (!notebookEntrancePlayed) {
            notebookEntrancePlayed = true;
            pulseClass(scrollPaper, "is-entrance", 1100);
            pulseClass(runes, "is-ring", 1100);
          }

          const writerEntry = getWriter("notebook", {
            interval: prefersReducedMotion() ? 0 : NOTEBOOK_TYPE_INTERVAL_MS,
            lineDelay: prefersReducedMotion() ? 0 : NOTEBOOK_LINE_DELAY_MS,
            onLineStart: (line: HTMLElement) => line.classList.add("is-visible"),
            onLineComplete: (line: HTMLElement) => {
              line.classList.add("is-finished");
              const index = notebookLinesRef.indexOf(line);
              if (index === 0) {
                caps.forEach((cap) => pulseClass(cap, "is-contract", 600));
              }
              if (line.dataset.glow === "1") {
                line.classList.add("is-glow");
                pulseClass(runes, "is-surging", 900);
              }
              if (line.dataset.final === "1") {
                line.classList.add("is-final-line");
                terminal?.classList.add("is-final");
                notebookLinesRef.forEach((item) => {
                  if (item !== line) item.classList.add("is-muted");
                });
                pulseClass(timeline, "is-tracing", 1500);
              }
            },
          });
          notebookLinesRef = writerEntry?.lines ?? [];
          writerEntry?.controller.play();
          ensureInkBlot();

          const loopGhostPage = () => {
            pulseClass(ghostPage, "is-active", 1400);
            setTimer(loopGhostPage, randMs(9500, 2400));
          };
          const loopJudge = () => {
            pulseClass(judge, "is-active", 1200);
            setTimer(loopJudge, randMs(15000, 4200));
          };
          loopGhostPage();
          loopJudge();
        } else if (roleId === "designer") {
          const designerHost = root.querySelector<HTMLElement>("[data-designer]");
          const blueprint = root.querySelector<HTMLElement>(".designer-blueprint");
          const constraints = root.querySelectorAll<HTMLElement>(".designer-constraints span");
          const terminal = root.querySelector<HTMLElement>(".designer-terminal");
          const progress = root.querySelector<HTMLElement>(".designer-progress");
          const toast = root.querySelector<HTMLElement>(".designer-toast");
          if (!prefersReducedMotion() && designerHost && designerHost.clientWidth > 10) {
            requestAnimationFrame(() => {
              designerCleanup = attachDesignerGlyphforge(designerHost);
            });
          }
          if (!designerEntrancePlayed) {
            designerEntrancePlayed = true;
            pulseClass(blueprint, "is-booting", 1200);
            constraints.forEach((item) => pulseClass(item, "is-drop", 900));
          }

          const writerEntry = getWriter("designer", {
            interval: prefersReducedMotion() ? 0 : 30,
            lineDelay: prefersReducedMotion() ? 0 : 340,
            onLineStart: (line: HTMLElement) => line.classList.add("is-visible"),
            onLineComplete: (line: HTMLElement) => {
              line.classList.add("is-finished");
              if (line.dataset.blueprintGlow === "1") {
                pulseClass(blueprint, "is-validated", 1100);
              }
              if (line.dataset.blueprintAura === "1") {
                pulseClass(blueprint, "is-aura", 1100);
              }
              if (line.dataset.blueprintProgress === "1") {
                pulseClass(progress, "is-active", 1500);
              }
              if (line.dataset.blueprintTilt === "1") {
                pulseClass(blueprint, "is-tilt", 1400);
                pulseClass(toast, "is-visible", 1200);
              }
            },
          });
          writerEntry?.controller.play();
          restartAnimations(root.querySelectorAll<HTMLElement>("[data-blueprint-line]"));
          restartAnimations(root.querySelectorAll<HTMLElement>(".designer-constraints span"));
        }
      };

      const stopEffects = () => {
        if (!active) return;
        active = false;
        window.clearTimeout(scrollReadyTimer);
        scrollReadyTimer = 0;
        clearTimers();
        root.classList.remove(
          "is-scroll-ready", "is-prophecy-final",
          "is-revealing", "is-glitch-tear", "is-crt-boot",
          "is-warp-snap", "is-blueprint-draw", "is-spark-burst",
          "is-prophecy-glow", "is-glitch-spike", "is-speedline-surge",
          "is-measure-ping",
        );
        driverEntrancePlayed = false;
        builderEntrancePlayed = false;
        notebookEntrancePlayed = false;
        coderEntrancePlayed = false;
        designerEntrancePlayed = false;
        root
          .querySelectorAll<HTMLElement>(".driver-scene, .driver-viewport")
          .forEach((el) => el.classList.remove("is-entering", "is-waking", "is-boosting", "is-warping", "is-camera-snap", "is-photo"));
        root
          .querySelectorAll<HTMLElement>(".builder-scene")
          .forEach((el) => el.classList.remove("is-booting", "is-bpm", "is-stomp", "is-assembling", "is-boost", "is-wake", "is-quake"));
        root
          .querySelectorAll<HTMLElement>(".notebook-scroll__paper, .notebook-runes, .notebook-ghostpage, .notebook-judge")
          .forEach((el) => el.classList.remove("is-entrance", "is-ring", "is-surging", "is-active", "is-tracing"));
        root.querySelector<HTMLElement>(".notebook-terminal")?.classList.remove("is-final");
        root.querySelector<HTMLElement>(".notebook-timeline")?.classList.remove("is-tracing");
        root
          .querySelectorAll<HTMLElement>(".designer-blueprint, .designer-progress, .designer-toast")
          .forEach((el) => el.classList.remove("is-booting", "is-validated", "is-aura", "is-tilt", "is-visible", "is-active"));
        root.querySelector<HTMLElement>(".coder-terminal")?.classList.remove("is-sliding", "is-nudge");
        root.querySelector<HTMLElement>(".coder-cube")?.classList.remove("is-active");
        root.querySelector<HTMLElement>(".coder-scene")?.classList.remove("is-blackout", "is-crt", "is-booting");
        root.querySelector<HTMLElement>(".coder-matrix")?.classList.remove("is-rain-burst", "is-storm");
        const bootLog = root.querySelector<HTMLElement>("[data-coder-boot]");
        if (bootLog) bootLog.textContent = "";
        // Remove shockwave elements
        root.querySelectorAll(".role-back__shockwave").forEach((el) => el.remove());
        matrixCleanup?.();
        matrixCleanup = undefined;
        builderCleanup?.();
        builderCleanup = undefined;
        driverCleanup?.();
        driverCleanup = undefined;
        designerCleanup?.();
        designerCleanup = undefined;
        inkBlotCleanup?.();
        inkBlotCleanup = undefined;
        writers.forEach((entry) => {
          entry.controller.stop();
          entry.lines.forEach((line) => {
            line.textContent = "";
            line.classList.remove(
              "is-visible",
              "is-finished",
              "is-glow",
              "is-impact",
              "is-muted",
              "is-final-line",
            );
          });
        });
      };



      /* ── Micro-events (3–8 s loop while active) ──────────── */
      const MICRO_EVENTS: Record<string, () => void> = {
        coder: () => {
          pulseClass(root, "is-glitch-spike", 400);
          const matrixLayer = root.querySelector<HTMLElement>(".coder-matrix");
          if (matrixLayer) pulseClass(matrixLayer, "is-rain-burst", 500);
        },
        driver: () => {
          pulseClass(root, "is-speedline-surge", 500);
        },
        designer: () => {
          pulseClass(root, "is-measure-ping", 400);
        },
        builder: () => {
          pulseClass(root, "is-spark-burst", 500);
        },
        notebooker: () => {
          pulseClass(root, "is-prophecy-glow", 600);
          const viewport = root.querySelector<HTMLElement>(".role-viewport");
          if (!viewport) return;
          const sw = document.createElement("span");
          sw.className = "role-back__shockwave";
          viewport.appendChild(sw);
          setTimer(() => sw.remove(), 700);
        },
      };

      const startMicroEvents = () => {
        if (!roleId || prefersReducedMotion()) return;
        const handler = MICRO_EVENTS[roleId];
        if (!handler) return;
        const loop = () => {
          if (!active) return;
          handler();
          const nextDelay = 3000 + Math.random() * 5000; // 3–8s
          microEventTimer = setTimer(loop, nextDelay) as unknown as number;
        };
        // First event after 3–5s
        microEventTimer = setTimer(loop, 3000 + Math.random() * 2000) as unknown as number;
      };

      const stopMicroEvents = () => {
        if (microEventTimer) {
          window.clearTimeout(microEventTimer);
          microEventTimer = 0;
        }
      };

      /* ── Flip reveal animation ──────────────────────────── */
      const triggerFlipReveal = () => {
        if (prefersReducedMotion()) return;
        root.classList.remove("is-revealing", "is-glitch-tear");
        void root.offsetWidth; // force reflow
        root.classList.add("is-revealing");
        // Add per-role entrance signature
        if (roleId === "coder") {
          root.classList.add("is-crt-boot");
          setTimer(() => root.classList.remove("is-crt-boot"), 600);
        } else if (roleId === "driver") {
          root.classList.add("is-warp-snap");
          setTimer(() => root.classList.remove("is-warp-snap"), 600);
        } else if (roleId === "designer") {
          root.classList.add("is-blueprint-draw");
          setTimer(() => root.classList.remove("is-blueprint-draw"), 1350);
        } else if (roleId === "builder") {
          root.classList.add("is-spark-burst");
          setTimer(() => root.classList.remove("is-spark-burst"), 500);
        } else if (roleId === "notebooker") {
          root.classList.add("is-prophecy-glow");
          setTimer(() => root.classList.remove("is-prophecy-glow"), 600);
        }
        // Glitch tear on all roles
        setTimer(() => {
          root.classList.add("is-glitch-tear");
          setTimer(() => root.classList.remove("is-glitch-tear"), 300);
        }, 100);
        // Remove revealing class
        setTimer(() => root.classList.remove("is-revealing"), 500);
      };

      const applyState = (flipped: boolean) => {
        root.classList.toggle("is-active", flipped);
        if (flipped) {
          randomizeActivationVariant();
          // Single-active-FX: pause the previous active card
          if (currentlyActivePause) {
            currentlyActivePause();
          }
          currentlyActivePause = () => {
            stopMicroEvents();
            stopEffects();
          };
          triggerFlipReveal();
          startEffects();
          window.clearTimeout(scrollReadyTimer);
          scrollReadyTimer = setTimer(() => {
            if (!active) return;
            root.classList.add("is-scroll-ready");
            if (roleId === "notebooker") ensureInkBlot();
          }, 420);
          // Start micro-events after entrance completes
          setTimer(() => startMicroEvents(), 1500);
        } else {
          if (currentlyActivePause) {
            currentlyActivePause();
            currentlyActivePause = null;
          }
          stopMicroEvents();
          stopEffects();
        }
      };

      const onFlip = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        applyState(Boolean(detail?.flipped));
      };

      tile.addEventListener("tile:flipped", onFlip);
      cleanups.push(() => tile.removeEventListener("tile:flipped", onFlip));

      applyState(tile.classList.contains("is-flipped"));

      const handleVisibility = () => {
        if (!active) return;
        if (document.hidden) {
          clearTimers();
          writers.forEach((entry) => entry.controller.stop());
        } else {
          // Simplest resume without full restart of entrance animations
          writers.forEach((entry) => entry.controller.play());
          if (roleId === "driver") {
            const viewport = root.querySelector<HTMLElement>(".driver-viewport");
            const pulseSpeed = () => {
              pulseClass(viewport, "is-boosting", 1200);
              setTimer(pulseSpeed, randMs(5200, 1800));
            };
            pulseSpeed();
          } else if (roleId === "notebooker") {
            const ghostPage = root.querySelector<HTMLElement>(".notebook-ghostpage");
            const loopGhostPage = () => {
              pulseClass(ghostPage, "is-active", 1400);
              setTimer(loopGhostPage, randMs(9500, 2400));
            };
            loopGhostPage();
          }
        }
      };
      document.addEventListener("visibilitychange", handleVisibility);

      cleanups.push(() => {
        document.removeEventListener("visibilitychange", handleVisibility);
        stopEffects();
      });

    } catch (err) {
      console.error("Error initializing role back for", root.dataset.role, err);
    }
  });

  roleBacksCleanup = () => {
    cleanups.forEach((fn) => fn());
  };
};

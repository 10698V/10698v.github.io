type RafTick = {
  now: number;
  deltaMs: number;
  deltaSec: number;
};

type RafLoopOptions = {
  fps?: number;
  autoPauseOnHidden?: boolean;
  onTick: (tick: RafTick) => void;
};

type LoopState = {
  name: string;
  fps: number;
  frameIntervalMs: number;
  autoPauseOnHidden: boolean;
  pausedByHidden: boolean;
  running: boolean;
  paused: boolean;
  lastTickAt: number;
  onTick: (tick: RafTick) => void;
};

export type RafLoopController = {
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  setFps: (fps: number) => void;
  destroy: () => void;
  isRunning: () => boolean;
};

const MIN_FPS = 1;
const MAX_FPS = 240;

const clampFps = (fps: number) => Math.max(MIN_FPS, Math.min(MAX_FPS, Math.round(fps)));

const perfDebugEnabled = () => {
  try {
    return localStorage.getItem("__prim3_perf_debug") === "1";
  } catch {
    return false;
  }
};

const debugLog = (...args: unknown[]) => {
  if (!perfDebugEnabled()) return;
  console.log("[raf-governor]", ...args);
};

class RafGovernor {
  private loops = new Map<string, LoopState>();
  private rafId = 0;
  private hiddenBound = false;

  register(name: string, options: RafLoopOptions): RafLoopController {
    const existing = this.loops.get(name);
    if (existing) {
      this.loops.delete(name);
      debugLog("replacing loop", name);
    }

    const fps = clampFps(options.fps ?? 60);
    const state: LoopState = {
      name,
      fps,
      frameIntervalMs: 1000 / fps,
      autoPauseOnHidden: options.autoPauseOnHidden ?? true,
      pausedByHidden: false,
      running: false,
      paused: false,
      lastTickAt: 0,
      onTick: options.onTick,
    };
    this.loops.set(name, state);
    this.bindHiddenHandler();
    debugLog("registered", name, "fps", fps, "active", this.loops.size);

    const ensureLoop = () => this.ensureRaf();

    return {
      start: () => {
        state.running = true;
        state.paused = false;
        state.pausedByHidden = false;
        state.lastTickAt = 0;
        debugLog("start", name);
        ensureLoop();
      },
      stop: () => {
        state.running = false;
        state.paused = false;
        state.pausedByHidden = false;
        state.lastTickAt = 0;
        debugLog("stop", name);
        this.cancelRafIfIdle();
      },
      pause: () => {
        state.paused = true;
        state.lastTickAt = 0;
        debugLog("pause", name);
        this.cancelRafIfIdle();
      },
      resume: () => {
        if (!state.running) return;
        state.paused = false;
        state.lastTickAt = 0;
        debugLog("resume", name);
        ensureLoop();
      },
      setFps: (nextFps: number) => {
        const clamped = clampFps(nextFps);
        if (clamped === state.fps) return;
        state.fps = clamped;
        state.frameIntervalMs = 1000 / clamped;
        state.lastTickAt = 0;
        debugLog("setFps", name, clamped);
      },
      destroy: () => {
        this.loops.delete(name);
        debugLog("destroy", name, "remaining", this.loops.size);
        this.cancelRafIfIdle();
      },
      isRunning: () => state.running && !state.paused,
    };
  }

  private bindHiddenHandler() {
    if (this.hiddenBound || typeof document === "undefined") return;
    this.hiddenBound = true;
    document.addEventListener("visibilitychange", () => {
      const hidden = document.hidden;
      this.loops.forEach((loop) => {
        if (!loop.autoPauseOnHidden || !loop.running) return;
        if (hidden) {
          if (!loop.paused) {
            loop.paused = true;
            loop.pausedByHidden = true;
            loop.lastTickAt = 0;
            debugLog("auto-paused", loop.name);
          }
        } else if (loop.pausedByHidden) {
          loop.paused = false;
          loop.pausedByHidden = false;
          loop.lastTickAt = 0;
          debugLog("auto-resumed", loop.name);
        }
      });
      if (hidden) {
        this.cancelRafIfIdle();
      } else {
        this.ensureRaf();
      }
    });
  }

  private hasActiveLoops() {
    for (const loop of this.loops.values()) {
      if (loop.running && !loop.paused) return true;
    }
    return false;
  }

  private ensureRaf() {
    if (this.rafId || !this.hasActiveLoops() || typeof window === "undefined") return;
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  private cancelRafIfIdle() {
    if (!this.rafId || this.hasActiveLoops() || typeof window === "undefined") return;
    window.cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private tick = (now: number) => {
    this.rafId = 0;

    this.loops.forEach((loop) => {
      if (!loop.running || loop.paused) return;

      if (!loop.lastTickAt) {
        loop.lastTickAt = now;
        return;
      }

      const elapsed = now - loop.lastTickAt;
      if (elapsed + 0.01 < loop.frameIntervalMs) return;

      loop.lastTickAt = now;
      const deltaMs = Math.min(250, elapsed);
      try {
        loop.onTick({
          now,
          deltaMs,
          deltaSec: deltaMs / 1000,
        });
      } catch (error) {
        console.error(`[raf-governor] loop "${loop.name}" failed`, error);
      }
    });

    this.ensureRaf();
  };
}

const governor = new RafGovernor();

export const registerRafLoop = (name: string, options: RafLoopOptions): RafLoopController =>
  governor.register(name, options);

type LoaderOptions = {
  assets?: string[];
  minDuration?: number;
};

declare global {
  interface Window {
    __PRIM3_LOADER_READY?: boolean;
  }
}

const BUILD_ID: string =
  (typeof (import.meta as any).env !== "undefined" &&
    (import.meta as any).env.PUBLIC_BUILD_ID) ||
  "__dev_build__";

const STORAGE_KEY = "__prim3_intro_seen";
const FORCE_INTRO_LS = "__prim3_force_intro";

const TEAM_PREFETCH_URL = "/team/index.html";
let teamPrefetched = false;
let teamPrefetchPromise: Promise<void> | null = null;

type PhaseKey =
  | "binding"
  | "etching"
  | "charging"
  | "calibrating"
  | "linking"
  | "seal";

type PhaseState = "PENDING" | "SYNCING" | "LOCKED";

type TaskFactory = () => Promise<unknown>;

type RegisterTaskOptions = {
  critical?: boolean;
  id?: string;
  retryCount?: number;
  isAsset?: boolean;
  onSuccess?: () => void;
};

const PHASE_ORDER: PhaseKey[] = [
  "binding",
  "etching",
  "charging",
  "calibrating",
  "linking",
  "seal",
];

const PHASE_LABEL: Record<PhaseKey, string> = {
  binding: "BINDING SIGILS",
  etching: "ETCHING FIELD GRID",
  charging: "CHARGING HERO CORE",
  calibrating: "CALIBRATING ODOM / IMU",
  linking: "LINKING CHANNELS",
  seal: "SEAL INTEGRITY",
};

const READY_PROPHECIES = [
  "OATH ACCEPTED. ENTER THE HERO STAGE.",
  "THE GRID AWAKENS. YOUR PARTY IS BOUND.",
  "CHANNEL LOCK: OP3 // BEGIN RUN.",
];

const STARTING_LOGS = [
  "> mount: summoning shell // ok",
  "> bootstrap: ritual console // online",
];

function isFullIntroNeeded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("intro") === "1") return true;
  } catch {
    // no-op
  }
  try {
    if (window.localStorage.getItem(FORCE_INTRO_LS) === "1") return true;
  } catch {
    // no-op
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored !== BUILD_ID;
  } catch {
    return true;
  }
}

function markIntroSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, BUILD_ID);
    window.localStorage.removeItem(FORCE_INTRO_LS);
  } catch {
    // no-op
  }
}

function signalLoaderStart(): void {
  if (typeof window === "undefined") return;
  window.__PRIM3_LOADER_READY = true;
  window.dispatchEvent(new CustomEvent("site-loader:start"));
}

function removeManifestScript(): void {
  document.getElementById("preload-manifest")?.remove();
}

export function markTeamPrefetched(): void {
  teamPrefetched = true;
}

export function getPrefetchedTeamHTML(): null {
  return null;
}

export function preloadTeamPage(): Promise<void> {
  if (typeof window === "undefined" || typeof fetch === "undefined") return Promise.resolve();
  if (teamPrefetched) return Promise.resolve();
  if (teamPrefetchPromise) return teamPrefetchPromise;

  teamPrefetchPromise = fetch(TEAM_PREFETCH_URL, {
    credentials: "same-origin",
    cache: "force-cache",
  })
    .then(() => {
      markTeamPrefetched();
    })
    .catch((err) => {
      teamPrefetchPromise = null;
      throw err;
    });

  return teamPrefetchPromise;
}

function preloadImage(url: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!url) {
      resolve();
      return;
    }
    const done = () => resolve();
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    img.onload = done;
    img.onerror = () => {
      if (typeof fetch === "function") {
        fetch(url, { mode: "no-cors" })
          .catch(() => {
            // no-op
          })
          .finally(done);
      } else {
        done();
      }
    };
    img.src = url;
    if (img.complete) done();
  });
}

export function bootPortfolioLoader(options: LoaderOptions = {}): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const loader = document.querySelector<HTMLElement>("[data-site-loader]");
  if (!loader) {
    removeManifestScript();
    signalLoaderStart();
    if (document.body) document.body.dataset.loaderState = "done";
    return;
  }

  const bar = loader.querySelector<HTMLElement>("[data-loader-bar]");
  const status = loader.querySelector<HTMLElement>("[data-loader-status]");
  const statusSub = loader.querySelector<HTMLElement>(".site-loader__status-sub");
  const track = loader.querySelector<HTMLElement>("[role='progressbar']");
  const pressStartBtn = loader.querySelector<HTMLElement>("[data-press-start]");
  const pressStartTextEl = pressStartBtn?.querySelector<HTMLElement>(".press-start-btn__text") ?? null;
  const pressStartSubEl = pressStartBtn?.querySelector<HTMLElement>(".press-start-btn__sub") ?? null;
  const phaseRows = Array.from(loader.querySelectorAll<HTMLElement>("[data-phase-key]"));
  const panel = loader.querySelector<HTMLElement>(".site-loader__panel");
  const sealEl = loader.querySelector<HTMLElement>(".site-loader__header-seal");
  const prophecyEl = loader.querySelector<HTMLElement>("[data-loader-prophecy]");
  const logEl = loader.querySelector<HTMLElement>("[data-loader-log]");
  const relicChargeEl = loader.querySelector<HTMLElement>("[data-loader-relic-charge]");

  let prophecyTimer = 0;
  let panelPulseTimer = 0;
  let castTimer = 0;

  const phaseElements = new Map<PhaseKey, HTMLElement>();
  phaseRows.forEach((row) => {
    const key = row.dataset.phaseKey as PhaseKey | undefined;
    if (!key) return;
    phaseElements.set(key, row);
  });

  const phaseProgress: Record<PhaseKey, { total: number; done: number; state: PhaseState }> = {
    binding: { total: 0, done: 0, state: "PENDING" },
    etching: { total: 0, done: 0, state: "PENDING" },
    charging: { total: 0, done: 0, state: "PENDING" },
    calibrating: { total: 0, done: 0, state: "PENDING" },
    linking: { total: 0, done: 0, state: "PENDING" },
    seal: { total: 0, done: 0, state: "PENDING" },
  };

  const phaseSummary = (key: PhaseKey) => {
    const p = phaseProgress[key];
    const total = Math.max(0, p.total);
    const done = Math.max(0, p.done);
    if (p.state === "LOCKED") return "LOCKED";
    if (p.state === "SYNCING") return `SYNCING ${Math.min(done, total)}/${Math.max(total, 1)}`;
    if (!total) return "PENDING";
    return `PENDING ${Math.min(done, total)}/${total}`;
  };

  const refreshPhaseRow = (key: PhaseKey) => {
    const row = phaseElements.get(key);
    if (!row) return;
    const p = phaseProgress[key];
    row.dataset.phaseStatus = p.state;
    row.classList.toggle("is-syncing", p.state === "SYNCING");
    row.classList.toggle("is-locked", p.state === "LOCKED");
    row.classList.toggle("is-pending", p.state === "PENDING");
    const stateEl = row.querySelector<HTMLElement>("[data-phase-state]");
    if (stateEl) stateEl.textContent = phaseSummary(key);
  };

  let activePhase: PhaseKey = "binding";
  let runningTasks = 0;
  let failedTasks = 0;
  let totalTasks = 0;
  let completed = 0;
  let totalAssets = 0;
  let loadedAssets = 0;
  let failedAssets = 0;
  let activeTaskLabel = "BOOTSTRAP";

  const criticalTaskMap = new Map<
    string,
    {
      phase: PhaseKey;
      label: string;
      factory: TaskFactory;
      retryCount: number;
      onSuccess?: () => void;
    }
  >();
  const criticalFailures = new Set<string>();

  const moduleSignals = {
    fontReady: false,
    teamShell: false,
    rogerTiles: false,
    teamInit: false,
    heroCore: false,
    roleBack: false,
    routeTransitions: false,
    ripples: false,
  };

  const setLoaderState = (state: "idle" | "loading" | "armed" | "done") => {
    if (document.body) document.body.dataset.loaderState = state;
  };

  const updateStatusLine = () => {
    if (!status) return;
    const phase = phaseProgress[activePhase];
    const done = Math.min(phase.done, phase.total);
    const total = Math.max(phase.total, 1);
    if (runningTasks > 0) {
      status.textContent = `${PHASE_LABEL[activePhase]} // ${done}/${total} // ${activeTaskLabel}`;
      return;
    }
    if (phase.state === "LOCKED") {
      status.textContent = `${PHASE_LABEL[activePhase]} // LOCKED`;
      return;
    }
    status.textContent = `${PHASE_LABEL[activePhase]} // STANDBY`;
  };

  const updateStatusMeta = () => {
    if (!statusSub) return;
    const failPart = failedTasks > 0 ? ` FAIL ${failedTasks}` : " FAIL 0";
    const assetPart = `ASSET ${loadedAssets}/${Math.max(totalAssets, 1)}`;
    const phase = phaseProgress[activePhase];
    const phasePart = `PHASE ${PHASE_LABEL[activePhase]} ${Math.min(phase.done, phase.total)}/${Math.max(phase.total, 1)}`;
    statusSub.textContent = `${phasePart} | TASK ${completed}/${Math.max(totalTasks, 1)} RUN ${runningTasks}${failPart} | ${assetPart}`;
  };

  const appendLog = (line: string) => {
    if (!logEl) return;
    const p = document.createElement("p");
    p.className = "site-loader__log-line";
    p.textContent = line;
    logEl.appendChild(p);
    while (logEl.children.length > 10) {
      logEl.firstElementChild?.remove();
    }
    logEl.scrollTop = logEl.scrollHeight;
  };

  const pulsePanelFlip = () => {
    if (!panel) return;
    panel.classList.add("is-phase-flip");
    window.clearTimeout(panelPulseTimer);
    panelPulseTimer = window.setTimeout(() => panel.classList.remove("is-phase-flip"), 110);
  };

  const setPhaseState = (key: PhaseKey, next: PhaseState) => {
    const state = phaseProgress[key];
    if (!state || state.state === next) return;
    activePhase = key;
    state.state = next;
    refreshPhaseRow(key);

    if (next === "LOCKED") {
      pulsePanelFlip();
      sealEl && (sealEl.textContent = `SEAL: ${PHASE_LABEL[key]} LOCKED`);
    }

    updateStatusLine();
    updateStatusMeta();
  };

  const lockPhase = (key: PhaseKey) => {
    setPhaseState(key, "LOCKED");
    if (key !== "seal") {
      const next = PHASE_ORDER.find((phase) => {
        if (phase === "seal") return false;
        const p = phaseProgress[phase];
        return p.total > 0 && p.done < p.total && p.state !== "LOCKED";
      });
      if (next) setPhaseState(next, "SYNCING");
    }
  };

  const setRelicProgress = (ratio: number) => {
    const clamped = Math.max(0, Math.min(1, ratio));
    loader.style.setProperty("--loader-progress", clamped.toFixed(3));
    if (relicChargeEl) {
      relicChargeEl.style.width = `${Math.round(clamped * 100)}%`;
    }
  };

  const updateProgress = (ratio: number) => {
    const clamped = Math.max(0, Math.min(1, ratio || 0));
    const pct = Math.round(clamped * 100);
    loader.dataset.active = "true";
    setRelicProgress(clamped);
    if (bar) bar.style.width = `${pct}%`;
    if (track) track.setAttribute("aria-valuenow", `${pct}`);
    updateStatusLine();
    updateStatusMeta();
  };

  const clearArmedEffects = () => {
    window.clearInterval(prophecyTimer);
    window.clearTimeout(castTimer);
    prophecyTimer = 0;
    castTimer = 0;
  };

  const finishLoader = () => {
    clearArmedEffects();
    if (status) status.textContent = "CHANNEL LINKED";
    if (sealEl) sealEl.textContent = "SEAL: INTEGRITY STABLE";
    setLoaderState("done");
    window.setTimeout(() => {
      loader.dataset.active = "false";
      removeManifestScript();
    }, 300);
  };

  const enterSite = () => {
    markIntroSeen();
    signalLoaderStart();
    finishLoader();
  };

  const armStartButton = (mode: "ready" | "force" = "ready", missing: string[] = []) => {
    const forceMode = mode === "force";
    setLoaderState("armed");
    if (status) status.textContent = forceMode ? "CRITICAL CHECK // REVIEW" : "SUMMONING GRID READY";
    if (sealEl) sealEl.textContent = forceMode ? "SEAL: PARTIAL // FORCE REQUIRED" : "SEAL: READY";
    if (pressStartTextEl) pressStartTextEl.textContent = forceMode ? "FORCE START" : "PRESS START";
    if (pressStartSubEl) {
      pressStartSubEl.textContent = forceMode
        ? `missing: ${missing.slice(0, 2).join(" // ") || "critical links"}`
        : "cast enter ritual";
    }

    if (prophecyEl) {
      let idx = 0;
      prophecyEl.textContent = READY_PROPHECIES[idx];
      prophecyTimer = window.setInterval(() => {
        idx = (idx + 1) % READY_PROPHECIES.length;
        prophecyEl.textContent = READY_PROPHECIES[idx] ?? READY_PROPHECIES[0];
      }, 2400);
    }

    appendLog(forceMode ? `> critical: ${missing.join(", ") || "unknown"} // manual override` : "> seal: memory lattice // stable");
    loader.classList.add("is-stable");

    if (pressStartBtn) {
      pressStartBtn.classList.add("is-visible", "is-ignite");
      pressStartBtn.removeAttribute("disabled");
      pressStartBtn.setAttribute("aria-disabled", "false");
      window.setTimeout(() => pressStartBtn.classList.remove("is-ignite"), 680);
    }

    let activated = false;
    let keyTimer = 0;

    const cleanupListeners = () => {
      if (!pressStartBtn) return;
      pressStartBtn.removeEventListener("pointerdown", onPointerActivate);
      pressStartBtn.removeEventListener("click", onClickActivate);
      pressStartBtn.removeEventListener("keydown", onButtonKey);
      window.removeEventListener("keydown", onWindowKey);
      if (keyTimer) {
        window.clearTimeout(keyTimer);
        keyTimer = 0;
      }
    };

    const onActivate = () => {
      if (activated) return;
      activated = true;
      cleanupListeners();
      if (pressStartBtn) {
        pressStartBtn.classList.add("is-casting");
        castTimer = window.setTimeout(() => {
          pressStartBtn.classList.remove("is-visible", "is-casting");
          enterSite();
        }, 190);
      } else {
        enterSite();
      }
    };

    const onPointerActivate = (e: PointerEvent) => {
      e.preventDefault();
      onActivate();
    };

    const onClickActivate = (e: MouseEvent) => {
      e.preventDefault();
      onActivate();
    };

    const onButtonKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    };

    const onWindowKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (document.body?.dataset.loaderState !== "armed") return;
      e.preventDefault();
      onActivate();
    };

    pressStartBtn?.addEventListener("pointerdown", onPointerActivate);
    pressStartBtn?.addEventListener("click", onClickActivate);
    pressStartBtn?.addEventListener("keydown", onButtonKey);

    // Keep keyboard activation available even when focus is not on the button.
    // Delay the global listener one tick so it does not steal the same key used to arm.
    keyTimer = window.setTimeout(() => {
      window.addEventListener("keydown", onWindowKey);
    }, 0);
  };

  const prefersReduced =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  const waitForPredicate = (
    predicate: () => boolean,
    timeoutMs = 1800,
    pollMs = 50,
  ) =>
    new Promise<void>((resolve, reject) => {
      const start = performance.now();
      const tick = () => {
        if (predicate()) {
          resolve();
          return;
        }
        if (performance.now() - start >= timeoutMs) {
          reject(new Error("timeout"));
          return;
        }
        window.setTimeout(tick, pollMs);
      };
      tick();
    });

  const waitForRipplesReady = (timeoutMs = 2200) =>
    waitForPredicate(() => Boolean((window as any).jQuery?.fn?.ripples), timeoutMs, 60);

  const collectMissingCriticalSignals = () => {
    const missing: string[] = [];
    const fontsCheck = (document as any).fonts?.check?.('12px "Press Start 2P"') ?? true;
    if (!moduleSignals.fontReady || !fontsCheck) missing.push("binding sigils");
    if (!moduleSignals.teamShell) missing.push("team route shell");
    if (!moduleSignals.rogerTiles) missing.push("roger tiles");
    if (!moduleSignals.teamInit) missing.push("team bootstrap");
    if (!moduleSignals.heroCore) missing.push("hero core");
    if (!moduleSignals.roleBack) missing.push("role arcana");
    if (!moduleSignals.routeTransitions) missing.push("route transitions");
    if (!moduleSignals.ripples || !(window as any).jQuery?.fn?.ripples) missing.push("ripple shaders");
    return missing;
  };

  const retryCriticalTasks = async () => {
    if (!criticalFailures.size) return;
    const failures = Array.from(criticalFailures);
    for (const id of failures) {
      const task = criticalTaskMap.get(id);
      if (!task) continue;
      let resolved = false;
      for (let attempt = 1; attempt <= task.retryCount; attempt += 1) {
        activeTaskLabel = `${task.label} [retry ${attempt}]`;
        if (status) status.textContent = `${PHASE_LABEL[task.phase]} // RETRY ${attempt}`;
        updateStatusMeta();
        appendLog(`${task.label} // retry ${attempt}`);
        try {
          await task.factory();
          task.onSuccess?.();
          criticalFailures.delete(id);
          resolved = true;
          appendLog(`${task.label} // locked`);
          break;
        } catch {
          // keep retrying
        }
      }
      if (!resolved) appendLog(`${task.label} // critical-fail`);
    }
  };

  STARTING_LOGS.forEach(appendLog);
  if (prophecyEl) prophecyEl.textContent = "THE RITUAL LATTICE IS FORMING...";
  PHASE_ORDER.forEach(refreshPhaseRow);

  if (!isFullIntroNeeded()) {
    setLoaderState("loading");
    loader.dataset.active = "true";
    const quickTaskTotal = 3;
    phaseProgress.binding.total = 1;
    phaseProgress.etching.total = 1;
    phaseProgress.linking.total = 1;
    refreshPhaseRow("binding");
    refreshPhaseRow("etching");
    refreshPhaseRow("linking");
    const markQuickTask = (phase: PhaseKey, label: string) => {
      activePhase = phase;
      activeTaskLabel = label;
      phaseProgress[phase].done = Math.min(phaseProgress[phase].total, phaseProgress[phase].done + 1);
      refreshPhaseRow(phase);
      completed = Math.min(quickTaskTotal, completed + 1);
      updateProgress(0.45 + (completed / quickTaskTotal) * 0.45);
    };

    totalTasks = quickTaskTotal;
    setPhaseState("binding", "SYNCING");
    updateProgress(0.15);

    const quickTasks: Promise<void>[] = [];
    const fontReady = (document as any).fonts?.ready as Promise<unknown> | undefined;
    if (fontReady) {
      quickTasks.push(
        fontReady
          .then(() => {
            moduleSignals.fontReady = true;
            markQuickTask("binding", "font sigils");
          })
          .catch(() => {
            markQuickTask("binding", "font sigils fallback");
          }),
      );
    } else {
      markQuickTask("binding", "font sigils fallback");
    }
    quickTasks.push(
      preloadTeamPage()
        .then(() => {
          moduleSignals.teamShell = true;
          markQuickTask("etching", "team route shell");
        })
        .catch(() => {
          markQuickTask("etching", "team route shell fallback");
        }),
    );
    quickTasks.push(
      waitForRipplesReady(1200)
        .then(() => {
          moduleSignals.ripples = true;
          markQuickTask("linking", "ripple shaders");
        })
        .catch(() => {
          markQuickTask("linking", "ripple shaders fallback");
        }),
    );

    Promise.all(quickTasks)
      .then(() => new Promise<void>((r) => setTimeout(r, prefersReduced ? 90 : 280)))
      .catch(() => new Promise<void>((r) => setTimeout(r, prefersReduced ? 90 : 280)))
      .then(() => {
        PHASE_ORDER.forEach((phase) => setPhaseState(phase, "LOCKED"));
        updateProgress(1);
        enterSite();
      });
    return;
  }

  setLoaderState("loading");
  updateProgress(0);
  updateStatusMeta();

  const assets = Array.from(new Set((options.assets ?? []).filter(Boolean)));
  totalAssets = assets.length;

  const taskList: Promise<void>[] = [];

  const registerTask = (
    phase: PhaseKey,
    label: string,
    factory: TaskFactory,
    opts: RegisterTaskOptions = {},
  ) => {
    const taskId = opts.id ?? `${phase}:${label}`;
    totalTasks += 1;
    phaseProgress[phase].total += 1;
    refreshPhaseRow(phase);
    updateStatusMeta();

    if (phaseProgress[phase].state === "PENDING") {
      const hasSyncing = PHASE_ORDER.some((key) => phaseProgress[key].state === "SYNCING");
      if (!hasSyncing) setPhaseState(phase, "SYNCING");
    }

    if (opts.critical) {
      criticalTaskMap.set(taskId, {
        phase,
        label,
        factory,
        retryCount: Math.max(1, opts.retryCount ?? 2),
        onSuccess: opts.onSuccess,
      });
    }

    taskList.push(
      Promise.resolve()
        .then(() => {
          runningTasks += 1;
          activePhase = phase;
          activeTaskLabel = label;
          updateStatusLine();
          updateStatusMeta();
          appendLog(`${label} // syncing`);
          return factory();
        })
        .then(() => {
          opts.onSuccess?.();
          if (opts.isAsset) loadedAssets += 1;
          appendLog(`${label} // ok`);
        })
        .catch(() => {
          failedTasks += 1;
          if (opts.isAsset) failedAssets += 1;
          if (opts.critical) criticalFailures.add(taskId);
          appendLog(`${label} // fallback`);
        })
        .then(() => {
          runningTasks = Math.max(0, runningTasks - 1);
          completed += 1;
          phaseProgress[phase].done += 1;
          refreshPhaseRow(phase);
          updateProgress(completed / Math.max(1, totalTasks));

          if (phaseProgress[phase].done >= phaseProgress[phase].total) {
            lockPhase(phase);
          }
        }),
    );
  };

  const startTs = performance.now();

  const fontReady = (document as any).fonts?.ready as Promise<unknown> | undefined;
  if (fontReady) {
    registerTask("binding", "> bind: type sigils", () => fontReady, {
      critical: true,
      id: "binding:fonts",
      onSuccess: () => {
        moduleSignals.fontReady = true;
      },
    });
  }

  registerTask("etching", "> preload: team route shell", () => preloadTeamPage(), {
    critical: true,
    id: "etching:team-shell",
    onSuccess: () => {
      moduleSignals.teamShell = true;
    },
  });
  registerTask("etching", "> bind: roger tiles module", () => import("../lib/roger-tiles.ts"), {
    critical: true,
    id: "etching:roger-tiles",
    onSuccess: () => {
      moduleSignals.rogerTiles = true;
    },
  });
  registerTask("etching", "> bind: team scene bootstrap", () => import("../scripts/team-init.ts"), {
    critical: true,
    id: "etching:team-init",
    onSuccess: () => {
      moduleSignals.teamInit = true;
    },
  });

  for (const url of assets) {
    registerTask("charging", `> preload: ${url.split("/").pop() ?? "asset"}`, () => preloadImage(url), {
      isAsset: true,
    });
  }
  registerTask("charging", "> preload: hero core module", () => import("../lib/hero-block.ts"), {
    critical: true,
    id: "charging:hero-core",
    onSuccess: () => {
      moduleSignals.heroCore = true;
    },
  });

  registerTask(
    "calibrating",
    "> compile: world shader cache",
    () =>
      import("three").then((THREE) => {
      try {
        const tmpRenderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: false,
          powerPreference: "low-power",
        });
        tmpRenderer.setSize(1, 1);
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshBasicMaterial();
        const mesh = new THREE.Mesh(geo, mat);
        const scene = new THREE.Scene();
        scene.add(mesh);
        const cam = new THREE.PerspectiveCamera();
        tmpRenderer.render(scene, cam);
        geo.dispose();
        mat.dispose();
        tmpRenderer.dispose();
      } catch {
        // ignore
      }
      }),
  );

  registerTask("linking", "> bind: role arcana modules", () => import("../scripts/role-back.ts"), {
    critical: true,
    id: "linking:role-back",
    onSuccess: () => {
      moduleSignals.roleBack = true;
    },
  });
  registerTask("linking", "> link: route transition matrix", () => import("../lib/route-transitions.ts"), {
    critical: true,
    id: "linking:route-transitions",
    onSuccess: () => {
      moduleSignals.routeTransitions = true;
    },
  });
  registerTask("linking", "> bind: ripple shaders", () => waitForRipplesReady(2200), {
    critical: true,
    id: "linking:ripples-ready",
    onSuccess: () => {
      moduleSignals.ripples = true;
    },
    retryCount: 3,
  });
  registerTask("linking", "> link: gsap channel", () => import("gsap"));
  registerTask("linking", "> link: scroll trigger channel", () => import("gsap/ScrollTrigger"));
  registerTask("linking", "> link: lenis channel", () => import("@studio-freight/lenis"));

  Promise.all(taskList).then(() => {
    const elapsed = performance.now() - startTs;
    const minDuration = Math.max(0, options.minDuration ?? 0);
    const waitMs = Math.max(0, minDuration - elapsed);

    window.setTimeout(async () => {
      PHASE_ORDER.forEach((phase) => {
        if (phase === "seal") return;
        const p = phaseProgress[phase];
        if (p.state !== "LOCKED") lockPhase(phase);
      });

      setPhaseState("seal", "SYNCING");
      appendLog("> seal: integrity lattice // syncing");
      window.setTimeout(async () => {
        await retryCriticalTasks();
        const missing = collectMissingCriticalSignals();
        if (missing.length) {
          if (status) status.textContent = "CRITICAL LINKS // PARTIAL";
          appendLog(`> missing critical: ${missing.join(", ")}`);
        }
        lockPhase("seal");
        loader.classList.add("is-stable");
        setRelicProgress(1);
        updateProgress(1);

        if (prefersReduced) {
          enterSite();
        } else {
          armStartButton(missing.length ? "force" : "ready", missing);
        }
      }, 140);
    }, waitMs);
  });
}

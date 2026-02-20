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
  const track = loader.querySelector<HTMLElement>("[role='progressbar']");
  const pressStartBtn = loader.querySelector<HTMLElement>("[data-press-start]");
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

  const setLoaderState = (state: "idle" | "loading" | "armed" | "done") => {
    if (document.body) document.body.dataset.loaderState = state;
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
    state.state = next;

    const row = phaseElements.get(key);
    if (row) {
      row.dataset.phaseStatus = next;
      row.classList.toggle("is-syncing", next === "SYNCING");
      row.classList.toggle("is-locked", next === "LOCKED");
      row.classList.toggle("is-pending", next === "PENDING");
      const stateEl = row.querySelector<HTMLElement>("[data-phase-state]");
      if (stateEl) stateEl.textContent = next;
    }

    if (next === "LOCKED") {
      pulsePanelFlip();
      sealEl && (sealEl.textContent = `SEAL: ${PHASE_LABEL[key]} LOCKED`);
    }

    if (next === "SYNCING" && status) {
      status.textContent = `${PHASE_LABEL[key]} // SYNCING`;
    }
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

  const armStartButton = () => {
    setLoaderState("armed");
    if (status) status.textContent = "SUMMONING GRID READY";
    if (sealEl) sealEl.textContent = "SEAL: READY";

    if (prophecyEl) {
      let idx = 0;
      prophecyEl.textContent = READY_PROPHECIES[idx];
      prophecyTimer = window.setInterval(() => {
        idx = (idx + 1) % READY_PROPHECIES.length;
        prophecyEl.textContent = READY_PROPHECIES[idx] ?? READY_PROPHECIES[0];
      }, 2400);
    }

    appendLog("> seal: memory lattice // stable");
    loader.classList.add("is-stable");

    if (pressStartBtn) {
      pressStartBtn.classList.add("is-visible", "is-ignite");
      window.setTimeout(() => pressStartBtn.classList.remove("is-ignite"), 680);
    }

    const onActivate = () => {
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

    pressStartBtn?.addEventListener("click", onActivate, { once: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.removeEventListener("keydown", onKey);
        onActivate();
      }
    };
    window.addEventListener("keydown", onKey);
  };

  const prefersReduced =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  STARTING_LOGS.forEach(appendLog);
  if (prophecyEl) prophecyEl.textContent = "THE RITUAL LATTICE IS FORMING...";

  if (!isFullIntroNeeded()) {
    setLoaderState("loading");
    loader.dataset.active = "true";
    setPhaseState("binding", "SYNCING");
    updateProgress(0.45);

    const quickTasks: Promise<void>[] = [];
    const fontReady = (document as any).fonts?.ready as Promise<unknown> | undefined;
    if (fontReady) quickTasks.push(fontReady.then(() => {}).catch(() => {}));
    quickTasks.push(preloadTeamPage().catch(() => {}));

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

  const assets = Array.from(new Set((options.assets ?? []).filter(Boolean)));
  const taskList: Promise<void>[] = [];
  let completed = 0;
  let totalTasks = 0;

  const registerTask = (phase: PhaseKey, label: string, promise: Promise<unknown>) => {
    totalTasks += 1;
    phaseProgress[phase].total += 1;

    if (phaseProgress[phase].state === "PENDING") {
      const hasSyncing = PHASE_ORDER.some((key) => phaseProgress[key].state === "SYNCING");
      if (!hasSyncing) setPhaseState(phase, "SYNCING");
    }

    taskList.push(
      promise
        .then(() => {
          appendLog(`${label} // ok`);
        })
        .catch(() => {
          appendLog(`${label} // fallback`);
        })
        .then(() => {
          completed += 1;
          phaseProgress[phase].done += 1;
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
    registerTask("binding", "> bind: type sigils", fontReady);
  }

  registerTask("etching", "> preload: team route shell", preloadTeamPage());
  registerTask("etching", "> bind: roger tiles module", import("../lib/roger-tiles.ts"));
  registerTask("etching", "> bind: team scene bootstrap", import("../scripts/team-init.ts"));

  for (const url of assets) {
    registerTask("charging", `> preload: ${url.split("/").pop() ?? "asset"}`, preloadImage(url));
  }
  registerTask("charging", "> preload: hero core module", import("../lib/hero-block.ts"));

  registerTask(
    "calibrating",
    "> compile: world shader cache",
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

  registerTask("linking", "> bind: role arcana modules", import("../scripts/role-back.ts"));
  registerTask("linking", "> link: route transition matrix", import("../lib/route-transitions.ts"));
  registerTask("linking", "> link: gsap channel", import("gsap"));
  registerTask("linking", "> link: scroll trigger channel", import("gsap/ScrollTrigger"));
  registerTask("linking", "> link: lenis channel", import("@studio-freight/lenis"));

  Promise.all(taskList).then(() => {
    const elapsed = performance.now() - startTs;
    const minDuration = Math.max(0, options.minDuration ?? 0);
    const waitMs = Math.max(0, minDuration - elapsed);

    window.setTimeout(() => {
      PHASE_ORDER.forEach((phase) => {
        if (phase === "seal") return;
        const p = phaseProgress[phase];
        if (p.state !== "LOCKED") lockPhase(phase);
      });

      setPhaseState("seal", "SYNCING");
      appendLog("> seal: integrity lattice // syncing");
      window.setTimeout(() => {
        lockPhase("seal");
        loader.classList.add("is-stable");
        setRelicProgress(1);
        updateProgress(1);

        if (prefersReduced) {
          enterSite();
        } else {
          armStartButton();
        }
      }, 140);
    }, waitMs);
  });
}

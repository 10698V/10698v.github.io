// One WebGLRenderer + one RAF for the whole page of tiles.
import { WebGLRenderer } from "three";

type Job = () => void;

let renderer: WebGLRenderer | null = null;
let raf = 0;
let jobs: Job[] = [];
let dpr = 1;

function loop() {
  raf = requestAnimationFrame(loop);

  // clear once per frame (full canvas, transparent)
  const r = renderer!;
  r.setScissorTest(false);
  r.clear(true, true, true);

  for (const j of jobs) j();
}

export function getSharedRenderer(): WebGLRenderer {
  if (!renderer) {
    const cap = (globalThis as any).__PRIM3_RIPPLE_DPR;
    dpr = Math.min(Number(cap) || (window.devicePixelRatio || 1), 1.25); // sane cap

    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      pointerEvents: "none",
      zIndex: "12",
      mixBlendMode: "normal",
    } as CSSStyleDeclaration);
    document.body.appendChild(canvas);

    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(dpr);
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.setClearColor(0x000000, 0);   // transparent clear
    renderer.autoClear = false;            // we clear manually in loop()

    addEventListener("resize", () => {
      renderer!.setSize(innerWidth, innerHeight, false);
    });
  }
  if (!raf) loop();
  return renderer!;
}

export function addFrameJob(job: Job) {
  jobs.push(job);
}

export function removeFrameJob(job: Job) {
  jobs = jobs.filter((j) => j !== job);
}

export function getDPR() { return dpr; }

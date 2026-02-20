/**
 * designerGlyphforge.ts
 * Designer viewport: lines draw briskly while geometry morphs smoothly over time.
 */

type NodePoint = {
  x: number;
  y: number;
};

type Segment = {
  a: number;
  b: number;
  width: number;
  speed: number;
  phase: number;
};

type Pulse = {
  x: number;
  y: number;
  r: number;
  alpha: number;
  growth: number;
};

const DPR_CAP = 1.5;
const NODE_COUNT = 8;
const MORPH_MIN_MS = 9800;
const MORPH_MAX_MS = 15000;
const PULSE_MIN_MS = 1100;
const PULSE_MAX_MS = 2100;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

export const attachDesignerGlyphforge = (container: HTMLElement) => {
  const canvas = document.createElement("canvas");
  canvas.className = "designer-glyphforge-canvas";
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  });

  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  container.appendChild(canvas);

  let width = 1;
  let height = 1;
  let dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  let running = true;
  let raf = 0;
  let lastTs = 0;
  let animT = Math.random() * 100;

  let morphMs = 0;
  let morphDuration = MORPH_MIN_MS + Math.random() * (MORPH_MAX_MS - MORPH_MIN_MS);
  let nodeA: NodePoint[] = [];
  let nodeB: NodePoint[] = [];
  let segments: Segment[] = [];
  const pulses: Pulse[] = [];
  let pulseMs = 0;
  let nextPulse = PULSE_MIN_MS + Math.random() * (PULSE_MAX_MS - PULSE_MIN_MS);

  const rand = (min: number, max: number) => min + Math.random() * (max - min);

  const resize = () => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const makeNodes = (base?: NodePoint[]) => {
    const nodes: NodePoint[] = [];
    for (let i = 0; i < NODE_COUNT; i += 1) {
      if (base?.[i]) {
        nodes.push({
          x: Math.min(width * 0.9, Math.max(width * 0.1, base[i].x + rand(-28, 28))),
          y: Math.min(height * 0.9, Math.max(height * 0.1, base[i].y + rand(-22, 22))),
        });
      } else {
        nodes.push({
          x: rand(width * 0.14, width * 0.86),
          y: rand(height * 0.14, height * 0.86),
        });
      }
    }
    return nodes;
  };

  const makeSegments = () => {
    const next: Segment[] = [];
    // Backbone chain
    for (let i = 0; i < NODE_COUNT - 1; i += 1) {
      next.push({
        a: i,
        b: i + 1,
        width: rand(1.05, 2.1),
        speed: rand(0.072, 0.16),
        phase: Math.random(),
      });
    }
    // Cross-links for CAD-like detail
    for (let i = 0; i < 5; i += 1) {
      const a = Math.floor(Math.random() * NODE_COUNT);
      let b = Math.floor(Math.random() * NODE_COUNT);
      if (a === b) b = (b + 2) % NODE_COUNT;
      next.push({
        a,
        b,
        width: rand(0.8, 1.5),
        speed: rand(0.055, 0.13),
        phase: Math.random(),
      });
    }
    return next;
  };

  const lerpedNode = (idx: number, t: number): NodePoint => {
    const a = nodeA[idx];
    const b = nodeB[idx];
    if (!a || !b) return { x: width * 0.5, y: height * 0.5 };
    const m = smoothstep(t);
    return {
      x: a.x + (b.x - a.x) * m,
      y: a.y + (b.y - a.y) * m,
    };
  };

  const drawGrid = () => {
    const step = 14;
    ctx.strokeStyle = "rgba(96, 165, 250, 0.11)";
    ctx.lineWidth = 1;
    for (let x = 0.5; x < width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0.5; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  };

  const drawSegments = (morphT: number) => {
    for (const seg of segments) {
      const a = lerpedNode(seg.a, morphT);
      const b = lerpedNode(seg.b, morphT);

      // Faint full blueprint line
      ctx.strokeStyle = "rgba(125, 211, 252, 0.2)";
      ctx.lineWidth = seg.width;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // Brisk draw-out pass for line motion
      const cyc = (animT * seg.speed + seg.phase) % 1;
      const drawPct = smoothstep(cyc);
      const hx = a.x + (b.x - a.x) * drawPct;
      const hy = a.y + (b.y - a.y) * drawPct;

      ctx.strokeStyle = "rgba(244, 114, 182, 0.82)";
      ctx.lineWidth = Math.max(0.9, seg.width - 0.25);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(hx, hy);
      ctx.stroke();

      ctx.fillStyle = "rgba(244, 114, 182, 0.9)";
      ctx.beginPath();
      ctx.arc(hx, hy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const drawNodes = (morphT: number) => {
    for (let i = 0; i < NODE_COUNT; i += 1) {
      const n = lerpedNode(i, morphT);
      ctx.fillStyle = "rgba(125, 211, 252, 0.82)";
      ctx.beginPath();
      ctx.arc(n.x, n.y, 1.65, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const spawnPulse = (morphT: number) => {
    const idx = Math.floor(Math.random() * NODE_COUNT);
    const n = lerpedNode(idx, morphT);
    pulses.push({
      x: n.x,
      y: n.y,
      r: rand(4, 10),
      alpha: rand(0.35, 0.65),
      growth: rand(18, 34),
    });
  };

  const drawPulses = (dt: number) => {
    for (let i = pulses.length - 1; i >= 0; i -= 1) {
      const p = pulses[i];
      p.r += p.growth * dt;
      p.alpha -= dt * 0.55;
      if (p.alpha <= 0) {
        pulses.splice(i, 1);
        continue;
      }
      ctx.strokeStyle = `rgba(34, 211, 238, ${p.alpha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const tick = (ts: number) => {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    animT += dt;

    morphMs += dt * 1000;
    let morphT = morphMs / morphDuration;
    if (morphT >= 1) {
      nodeA = nodeB;
      nodeB = makeNodes(nodeA);
      morphMs = 0;
      morphDuration = MORPH_MIN_MS + Math.random() * (MORPH_MAX_MS - MORPH_MIN_MS);
      morphT = 0;
    }

    ctx.fillStyle = "rgba(4, 8, 20, 0.2)";
    ctx.fillRect(0, 0, width, height);
    drawGrid();
    drawSegments(morphT);
    drawNodes(morphT);

    pulseMs += dt * 1000;
    if (pulseMs >= nextPulse) {
      pulseMs = 0;
      nextPulse = PULSE_MIN_MS + Math.random() * (PULSE_MAX_MS - PULSE_MIN_MS);
      spawnPulse(morphT);
    }
    drawPulses(dt);
    while (pulses.length > 24) pulses.shift();

    raf = requestAnimationFrame(tick);
  };

  const rebuild = () => {
    resize();
    nodeA = makeNodes();
    nodeB = makeNodes(nodeA);
    segments = makeSegments();
  };

  const ro = new ResizeObserver(() => rebuild());
  ro.observe(container);
  rebuild();
  raf = requestAnimationFrame(tick);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.remove();
  };
};

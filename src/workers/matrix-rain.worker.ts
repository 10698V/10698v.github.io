type InitMessage = {
  type: "init";
  width: number;
  height: number;
  colWidth: number;
  glyphCount: number;
  speedMin: number;
  speedMax: number;
};

type ResizeMessage = {
  type: "resize";
  width: number;
  height: number;
};

type StepMessage = {
  type: "step";
  dtMs: number;
  requestId: number;
};

type DisposeMessage = {
  type: "dispose";
};

type IncomingMessage = InitMessage | ResizeMessage | StepMessage | DisposeMessage;

type Column = {
  y: number;
  speed: number;
  tailLen: number;
  charTimer: number;
  charOffset: number;
};

const GLITCH_MIN = 6000;
const GLITCH_MAX = 14000;

let width = 1;
let height = 1;
let colWidth = 18;
let glyphCount = 64;
let speedMin = 50;
let speedMax = 180;

let columns: Column[] = [];
let xPositions = new Float32Array(0);
let tailLens = new Uint16Array(0);
let charOffsets = new Uint32Array(0);
let charIndices = new Uint16Array(0);
let ys = new Float32Array(0);
let glitchTimerMs = 0;
let nextGlitchMs = GLITCH_MIN;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randGlyph = () => Math.floor(rand(0, Math.max(1, glyphCount)));

const fontSize = () => Math.max(11, Math.min(16, width / 28));

const rebuild = () => {
  const count = Math.max(6, Math.floor(width / Math.max(1, colWidth)));
  columns = [];
  xPositions = new Float32Array(count);
  tailLens = new Uint16Array(count);
  charOffsets = new Uint32Array(count);

  const spacing = width / count;
  let charTotal = 0;
  for (let i = 0; i < count; i += 1) {
    const tailLen = 8 + Math.floor(rand(0, 18));
    xPositions[i] = i * spacing + spacing * 0.5;
    tailLens[i] = tailLen;
    charOffsets[i] = charTotal;
    columns.push({
      y: -Math.random() * height,
      speed: rand(speedMin, speedMax),
      tailLen,
      charTimer: rand(0, 0.5),
      charOffset: charTotal,
    });
    charTotal += tailLen;
  }

  charIndices = new Uint16Array(charTotal);
  ys = new Float32Array(count);
  for (let i = 0; i < charIndices.length; i += 1) charIndices[i] = randGlyph();
  for (let i = 0; i < columns.length; i += 1) ys[i] = columns[i]?.y ?? 0;
};

const cloneStateBuffers = () => {
  const yOut = ys.slice();
  const glyphOut = charIndices.slice();
  return { yOut, glyphOut };
};

const postInit = () => {
  const xOut = xPositions.slice();
  const tailOut = tailLens.slice();
  const offsetsOut = charOffsets.slice();
  const state = cloneStateBuffers();
  (self as DedicatedWorkerGlobalScope).postMessage(
    {
      type: "init",
      xPositions: xOut,
      tailLens: tailOut,
      charOffsets: offsetsOut,
      yValues: state.yOut,
      glyphIndices: state.glyphOut,
    },
    [
      xOut.buffer,
      tailOut.buffer,
      offsetsOut.buffer,
      state.yOut.buffer,
      state.glyphOut.buffer,
    ],
  );
};

const postStep = (requestId: number) => {
  const state = cloneStateBuffers();
  (self as DedicatedWorkerGlobalScope).postMessage(
    {
      type: "state",
      requestId,
      yValues: state.yOut,
      glyphIndices: state.glyphOut,
      glitchTriggered: false,
    },
    [state.yOut.buffer, state.glyphOut.buffer],
  );
};

const step = (dtMs: number, requestId: number) => {
  if (!columns.length) {
    postStep(requestId);
    return;
  }
  const dt = Math.min(0.05, Math.max(0.0001, dtMs / 1000));
  const fs = fontSize();
  for (let i = 0; i < columns.length; i += 1) {
    const col = columns[i];
    if (!col) continue;
    col.y += col.speed * dt;
    col.charTimer -= dt;
    if (col.charTimer <= 0) {
      col.charTimer = rand(0.1, 0.5);
      const localIdx = Math.floor(rand(0, col.tailLen));
      charIndices[col.charOffset + localIdx] = randGlyph();
    }
    if (col.y - col.tailLen * fs > height) {
      col.y = -fs * 2;
      col.speed = rand(speedMin, speedMax);
    }
    ys[i] = col.y;
  }

  glitchTimerMs += dtMs;
  if (glitchTimerMs > nextGlitchMs) {
    glitchTimerMs = 0;
    nextGlitchMs = rand(GLITCH_MIN, GLITCH_MAX);
  }

  postStep(requestId);
};

const onMessage = (event: MessageEvent<IncomingMessage>) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "init") {
    width = Math.max(1, data.width || 1);
    height = Math.max(1, data.height || 1);
    colWidth = Math.max(1, data.colWidth || 18);
    glyphCount = Math.max(1, data.glyphCount || 64);
    speedMin = Math.max(1, data.speedMin || 50);
    speedMax = Math.max(speedMin + 1, data.speedMax || 180);
    glitchTimerMs = 0;
    nextGlitchMs = rand(GLITCH_MIN, GLITCH_MAX);
    rebuild();
    postInit();
    return;
  }

  if (data.type === "resize") {
    width = Math.max(1, data.width || 1);
    height = Math.max(1, data.height || 1);
    rebuild();
    postInit();
    return;
  }

  if (data.type === "step") {
    step(data.dtMs, data.requestId);
    return;
  }

  if (data.type === "dispose") {
    columns = [];
    xPositions = new Float32Array(0);
    tailLens = new Uint16Array(0);
    charOffsets = new Uint32Array(0);
    charIndices = new Uint16Array(0);
    ys = new Float32Array(0);
  }
};

(self as DedicatedWorkerGlobalScope).onmessage = onMessage;

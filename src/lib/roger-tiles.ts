// src/lib/roger-tiles.ts
// add HalfFloatType
import {
    WebGLRenderer, Scene, OrthographicCamera, Mesh, PlaneGeometry, ShaderMaterial,
    CanvasTexture, Vector2, WebGLRenderTarget, RGBAFormat, UnsignedByteType, HalfFloatType,
    LinearFilter, ClampToEdgeWrapping, SRGBColorSpace, NoToneMapping, NearestFilter
} from "three";
import { registerRafLoop, type RafLoopController } from "./raf-governor";

/** device pixel ratio cap for perf */
const DPR = Math.min((window as any).__PRIM3_RIPPLE_DPR || window.devicePixelRatio || 1, 1.35);

/** cover-fit scale (like object-fit: cover) returned as [sx, sy] */
function coverScale(tw: number, th: number, vw: number, vh: number): [number, number] {
    const arT = tw / th, arV = vw / vh;
    return (arT > arV) ? [arV / arT, 1] : [1, arT / arV];
}

/* ------------------------ Fullscreen quad shaders ------------------------ */
const QUAD_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** wave simulation: classic two-buffer heightfield (r channel) */
// replace SIM_FRAG with this
const SIM_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uPrev;
uniform sampler2D uCurr;
uniform vec2  uTexel;
uniform float uDamping;   // try 0.985..0.995

void main() {
  float p = texture2D(uPrev, vUv).r;
  float c = texture2D(uCurr, vUv).r;

  float l = texture2D(uCurr, vUv - vec2(uTexel.x, 0.0)).r;
  float r = texture2D(uCurr, vUv + vec2(uTexel.x, 0.0)).r;
  float t = texture2D(uCurr, vUv - vec2(0.0, uTexel.y)).r;
  float b = texture2D(uCurr, vUv + vec2(0.0, uTexel.y)).r;

  // average neighbors
  float avg = 0.25 * (l + r + t + b);
  // classic 2nd-order wave: next = (avg * 2.0 - p) * damping
  float next = (avg * 2.0 - p) * uDamping;

  gl_FragColor = vec4(next, next, next, 1.0);
}
`;


/** adds a circular drop to the current heightfield (in r) */
const DROP_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTex;
  uniform vec2  uPoint;     // 0..1
  uniform float uRadius;    // in UV
  uniform float uStrength;  // positive/negative

  void main() {
    float h = texture2D(uTex, vUv).r;
    float d = distance(vUv, uPoint);
    float falloff = smoothstep(uRadius, 0.0, d); // 1 in center ? 0 at radius
    h += falloff * uStrength;
    gl_FragColor = vec4(h, h, h, 1.0);
  }
`;

/** final display: sample image with chunky pixel warp and original colors */
const DISPLAY_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;

uniform sampler2D uMap;
uniform sampler2D uHeight;
uniform vec2  uTexScale;
uniform vec2  uResolution;   // portrait size in pixels
uniform vec2  uPointer;      // 0..1 ripple center
uniform float uTime;
uniform float uStrength;     // 0..1

vec4 encodeSRGB(vec4 lin) {
  return vec4(pow(lin.rgb, vec3(1.0/2.2)), lin.a);
}

vec2 sampleUv(vec2 uv) {
  return clamp((uv - 0.5) * uTexScale + 0.5, 0.0, 1.0);
}

void main() {
  vec2 baseUv = vUv;

  if (uStrength <= 0.0) {
    vec4 base = texture2D(uMap, sampleUv(baseUv));
    gl_FragColor = encodeSRGB(base);
    return;
  }

  vec2 uv = baseUv;
  vec2 center = uPointer;
  float d = distance(uv, center);
  float proceduralWave = sin(d * 80.0 - uTime * 4.0) * exp(-d * 6.0);
  float heightWave = texture2D(uHeight, uv).r;
  float wave = proceduralWave + heightWave * 1.1;

  vec2 texel = 1.0 / uResolution;
  vec2 dir = d > 1e-5 ? (uv - center) / d : vec2(0.0);
  uv += dir * wave * (uStrength * 10.0) * texel;

  float blockSize = 2.0; // chunky 2x2 pixels
  vec2 block = blockSize * texel;
  uv = (floor(uv / block) + 0.5) * block;

  vec4 base = texture2D(uMap, sampleUv(uv));
  gl_FragColor = encodeSRGB(base);
}
`;


/* ------------------------------ RippleSim ------------------------------- */
/* ------------------------------ RippleSim (fixed) ------------------------------ */
class RippleSim {
    readonly size: number;
    readonly renderer: WebGLRenderer;
    readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    readonly scene = new Scene();
    readonly texel = new Vector2(1, 1);

    // triple-buffer to avoid feedback (prev, curr ? next)
    rtPrev: WebGLRenderTarget;
    rtCurr: WebGLRenderTarget;
    rtNext: WebGLRenderTarget;

    quad: Mesh;
    stepMat: ShaderMaterial;
    dropMat: ShaderMaterial;

    damping = 0.982;
    dropPos = new Vector2(0.5, 0.5);
    dropRadius = 0.025;
    dropStrength = 0.8;

    constructor(renderer: WebGLRenderer, size = 512) {
        this.size = size;
        this.renderer = renderer;
        const type = (renderer.capabilities.isWebGL2 ? HalfFloatType : UnsignedByteType);
        const makeRT = () =>
            new WebGLRenderTarget(size, size, {
                format: RGBAFormat,
                type,
                minFilter: LinearFilter,
                magFilter: LinearFilter,
                depthBuffer: false,
                stencilBuffer: false
            });

        this.rtPrev = makeRT();
        this.rtCurr = makeRT();
        this.rtNext = makeRT();

        this.texel.set(1 / size, 1 / size);

        this.stepMat = new ShaderMaterial({
            vertexShader: QUAD_VERT,
            fragmentShader: SIM_FRAG,
            uniforms: {
                uPrev: { value: this.rtPrev.texture },
                uCurr: { value: this.rtCurr.texture },
                uTexel: { value: this.texel },
                uDamping: { value: this.damping }
            }
        });

        this.dropMat = new ShaderMaterial({
            vertexShader: QUAD_VERT,
            fragmentShader: DROP_FRAG,
            uniforms: {
                uTex: { value: this.rtCurr.texture },  // sample from curr
                uPoint: { value: this.dropPos },
                uRadius: { value: this.dropRadius },
                uStrength: { value: this.dropStrength }
            }
        });

        this.quad = new Mesh(new PlaneGeometry(2, 2), this.stepMat);
        this.scene.add(this.quad);

        // clear all three to zero
        const clearRT = (rt: WebGLRenderTarget) => {
            this.renderer.setRenderTarget(rt);
            this.renderer.clear(true, true, true);
        };
        clearRT(this.rtPrev);
        clearRT(this.rtCurr);
        clearRT(this.rtNext);
        this.renderer.setRenderTarget(null);
    }

    texture() {
        // expose the CURRENT height field (what display uses)
        return this.rtCurr.texture;
    }

    addDrop(uv: Vector2, radius: number, strength: number) {
        // read: rtCurr, write: rtNext, then swap rtCurr ? rtNext
        this.dropPos.copy(uv);
        this.dropRadius = radius;
        this.dropStrength = strength;

        (this.dropMat.uniforms.uPoint.value as Vector2).copy(this.dropPos);
        this.dropMat.uniforms.uRadius.value = this.dropRadius;
        this.dropMat.uniforms.uStrength.value = this.dropStrength;
        this.dropMat.uniforms.uTex.value = this.rtCurr.texture;

        this.quad.material = this.dropMat;
        this.renderer.setRenderTarget(this.rtNext);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);

        // rotate curr/next so output becomes the new current
        let tmp = this.rtCurr; this.rtCurr = this.rtNext; this.rtNext = tmp;

        // restore step material
        this.quad.material = this.stepMat;
    }

    step() {
        // compute next = f(prev, curr), writing into rtNext
        this.stepMat.uniforms.uPrev.value = this.rtPrev.texture;
        this.stepMat.uniforms.uCurr.value = this.rtCurr.texture;

        this.quad.material = this.stepMat;
        this.renderer.setRenderTarget(this.rtNext);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);

        // rotate: prev ? curr, curr ? next
        let tmp = this.rtPrev; this.rtPrev = this.rtCurr; this.rtCurr = this.rtNext; this.rtNext = tmp;
    }

    dispose() {
        this.rtPrev.dispose();
        this.rtCurr.dispose();
        this.rtNext.dispose();
        this.dropMat.dispose();
        this.stepMat.dispose();
        if (this.quad.material instanceof ShaderMaterial) {
            this.quad.material.dispose();
        }
        this.quad.geometry.dispose();
    }
}

/* ------------------------------ Tile code ------------------------------- */
const FLOW_SIZE = 160;
const POINTER_VISCOSITY = 0.52;
const POINTER_MIN_SPEED = 0.0015;

// draw <img> into a canvas ? CanvasTexture
const PIXEL_BASE = 1024; // cap resolution for ripple texture while keeping clarity

function canvasTextureFromImage(img: HTMLImageElement) {
    const c = document.createElement("canvas");

    // pick a small working resolution based on the shorter side
    const shortest = Math.max(1, Math.min(img.naturalWidth, img.naturalHeight));
    const scale = Math.min(1, PIXEL_BASE / shortest);

    const w = Math.max(32, Math.round(img.naturalWidth * scale));
    const h = Math.max(32, Math.round(img.naturalHeight * scale));

    c.width = w;
    c.height = h;

    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, h);

    const tex = new CanvasTexture(c);
    tex.needsUpdate = true;
    tex.colorSpace = SRGBColorSpace;

    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    tex.wrapS = ClampToEdgeWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.generateMipmaps = false;

    return tex;
}


type TileState = {
    wrap: HTMLElement;
    tile: HTMLElement | null;
    img: HTMLImageElement;
    renderer: WebGLRenderer;
    scene: Scene;
    cam: OrthographicCamera;
    sim: RippleSim;
    uniforms: Record<string, any>;
    ro: ResizeObserver;
    last: Vector2;
    hovered: boolean;
    lastFrame: number;
    inView: boolean;
    bounds: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
};

const tileInstances: TileState[] = [];
const tileByWrap = new WeakMap<HTMLElement, TileState>();
let rogerHooked = false;
let tilesController: RafLoopController | null = null;
let tilesFps = 30;
let idleSince = 0;
let tileViewportObserver: IntersectionObserver | null = null;

function ensureTilesTicker() {
    const IDLE_THRESHOLD = 2000; // 2s with no interaction = idle, skip render
    if (!tilesController) {
        tilesController = registerRafLoop("roger-tiles", {
            fps: 30,
            autoPauseOnHidden: true,
            onTick: ({ now }) => {
                if (tileInstances.length === 0) return;

                let activeCount = 0;
                let hoveredCount = 0;
                for (let i = 0; i < tileInstances.length; i++) {
                    const st = tileInstances[i];
                    if (!st || !st.inView) continue;

                    // Skip flipped tiles — back face is showing, no ripple needed
                    if (st.tile?.classList.contains("is-flipped")) {
                        st.hovered = false;
                        st.wrap?.classList.remove("is-ripple-hover");
                        if (st.img) {
                            st.img.style.visibility = "";
                            st.img.style.opacity = "";
                        }
                        continue;
                    }

                    // Skip idle tiles — not hovered and last frame was >2s ago
                    if (!st.hovered && st.lastFrame && (now - st.lastFrame > IDLE_THRESHOLD)) continue;

                    activeCount += 1;
                    if (st.hovered) hoveredCount += 1;
                    st.sim.step();
                    st.uniforms.uHeight.value = st.sim.texture();
                    st.uniforms.uTime.value = now * 0.001;
                    st.renderer.render(st.scene, st.cam);
                    st.lastFrame = now;
                }

                const nextFps = hoveredCount > 0 ? 45 : 30;
                if (nextFps !== tilesFps) {
                    tilesFps = nextFps;
                    tilesController?.setFps(nextFps);
                }

                if (activeCount === 0) {
                    if (!idleSince) idleSince = now;
                    if (now - idleSince > IDLE_THRESHOLD) {
                        tilesController?.stop();
                    }
                } else {
                    idleSince = 0;
                }
            }
        });
    }
    if (!tilesController.isRunning()) {
        idleSince = 0;
        tilesController.start();
    }
}

function stopTilesTickerIfIdle() {
    if (!tilesController || tileInstances.length > 0) return;
    tilesController.destroy();
    tilesController = null;
    tilesFps = 30;
    idleSince = 0;
    tileViewportObserver?.disconnect();
    tileViewportObserver = null;
}

function wakeTilesTicker() {
    if (tileInstances.length === 0) return;
    ensureTilesTicker();
}

function ensureTileViewportObserver() {
    if (tileViewportObserver || typeof IntersectionObserver === "undefined") return;
    tileViewportObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            const target = entry.target as HTMLElement;
            const st = tileByWrap.get(target);
            if (!st) continue;
            st.inView = entry.isIntersecting;
            if (entry.isIntersecting) {
                st.lastFrame = performance.now();
                wakeTilesTicker();
            }
        }
    }, {
        root: null,
        threshold: 0.05,
    });
}

// tiny helper
const clamp = (x: number, min: number, max: number) =>
    Math.max(min, Math.min(max, x));

const ENABLE_TILE_WARP = false;
const BASE_CORNER = 38;
const CORNER_RANGE = 220;
const CORNER_MIN = 10;
const CLIP_RANGE_X = 18;
const CLIP_RANGE_Y = 18;
const GOO_RANGE = 10;

type TileWarpState = {
    raf: number;
    strength: number;
    targetStrength: number;
    x: number;
    y: number;
    lagX: number;
    lagY: number;
    targetX: number;
    targetY: number;
};
const tileWarpStates = new WeakMap<HTMLElement, TileWarpState>();
type TileSurfaceHandlers = { handler: (e: PointerEvent) => void; leave: () => void };
const tileSurfaceHandlers = new WeakMap<HTMLElement, TileSurfaceHandlers>();

function tickTileWarp(tile: HTMLElement, state: TileWarpState) {
    if (!ENABLE_TILE_WARP) return;
    const easing = 0.045;
    state.strength += (state.targetStrength - state.strength) * easing;
    state.targetStrength *= 0.99;

    state.x += (state.targetX - state.x) * easing;
    state.y += (state.targetY - state.y) * easing;
    state.lagX += (state.x - state.lagX) * 0.02;
    state.lagY += (state.y - state.lagY) * 0.02;

    if (
        state.strength < 0.002 &&
        state.targetStrength < 0.002 &&
        Math.abs(state.lagX - 0.5) < 0.001 &&
        Math.abs(state.lagY - 0.5) < 0.001
    ) {
        state.strength = 0;
        state.targetStrength = 0;
        state.x = 0.5;
        state.y = 0.5;
        state.lagX = 0.5;
        state.lagY = 0.5;
        state.raf = 0;
        tile.style.setProperty("--tile-warp-strength", "0");
        tile.style.setProperty("--tile-warp-bulge", "0px");
        tile.style.setProperty("--tile-warp-bend-x", "0deg");
        tile.style.setProperty("--tile-warp-bend-y", "0deg");
        tile.style.setProperty("--tile-warp-x", "0.5");
        tile.style.setProperty("--tile-warp-y", "0.5");
        tile.style.setProperty("--tile-corner-tl", `${BASE_CORNER}px`);
        tile.style.setProperty("--tile-corner-tr", `${BASE_CORNER}px`);
        tile.style.setProperty("--tile-corner-br", `${BASE_CORNER}px`);
        tile.style.setProperty("--tile-corner-bl", `${BASE_CORNER}px`);
        tile.style.setProperty("--tile-clip-left", "0%");
        tile.style.setProperty("--tile-clip-right", "0%");
        tile.style.setProperty("--tile-clip-top", "0%");
        tile.style.setProperty("--tile-clip-bottom", "0%");
        tile.style.setProperty("--tile-goo-x", "0%");
        tile.style.setProperty("--tile-goo-y", "0%");
        return;
    }

    const dx = state.x - 0.5;
    const dy = state.y - 0.5;
    const bendMul = 185;

    tile.style.setProperty("--tile-warp-strength", state.strength.toFixed(4));
    tile.style.setProperty("--tile-warp-x", state.x.toFixed(4));
    tile.style.setProperty("--tile-warp-y", state.y.toFixed(4));
    tile.style.setProperty("--tile-warp-bulge", (state.strength * 42).toFixed(2) + "px");
    tile.style.setProperty("--tile-warp-bend-x", (-dy * state.strength * bendMul).toFixed(3) + "deg");
    tile.style.setProperty("--tile-warp-bend-y", (dx * state.strength * bendMul).toFixed(3) + "deg");

    const rangeScale = CORNER_RANGE * state.strength;
    const tl = BASE_CORNER + (-dx - dy) * rangeScale;
    const tr = BASE_CORNER + (dx - dy) * rangeScale;
    const br = BASE_CORNER + (dx + dy) * rangeScale;
    const bl = BASE_CORNER + (-dx + dy) * rangeScale;
    tile.style.setProperty("--tile-corner-tl", `${Math.max(CORNER_MIN, tl)}px`);
    tile.style.setProperty("--tile-corner-tr", `${Math.max(CORNER_MIN, tr)}px`);
    tile.style.setProperty("--tile-corner-br", `${Math.max(CORNER_MIN, br)}px`);
    tile.style.setProperty("--tile-corner-bl", `${Math.max(CORNER_MIN, bl)}px`);

    const clipLeft = (state.x - 0.5) * CLIP_RANGE_X * state.strength;
    const clipRight = (0.5 - state.x) * CLIP_RANGE_X * state.strength;
    const clipTop = (state.y - 0.5) * CLIP_RANGE_Y * state.strength;
    const clipBottom = (0.5 - state.y) * CLIP_RANGE_Y * state.strength;
    tile.style.setProperty("--tile-clip-left", `${clipLeft.toFixed(3)}%`);
    tile.style.setProperty("--tile-clip-right", `${clipRight.toFixed(3)}%`);
    tile.style.setProperty("--tile-clip-top", `${clipTop.toFixed(3)}%`);
    tile.style.setProperty("--tile-clip-bottom", `${clipBottom.toFixed(3)}%`);

    const gooX = dx * GOO_RANGE * state.strength;
    const gooY = dy * GOO_RANGE * state.strength;
    tile.style.setProperty("--tile-goo-x", `${gooX.toFixed(3)}%`);
    tile.style.setProperty("--tile-goo-y", `${gooY.toFixed(3)}%`);

    state.raf = requestAnimationFrame(() => tickTileWarp(tile, state));
}

function pumpTileWarp(tile: HTMLElement, uv: Vector2, magnitude: number) {
    if (!ENABLE_TILE_WARP) return;
    const state =
        tileWarpStates.get(tile) ??
        (() => {
            const next: TileWarpState = {
                raf: 0,
                strength: 0,
                targetStrength: 0,
                x: 0.5,
                y: 0.5,
                lagX: 0.5,
                lagY: 0.5,
                targetX: 0.5,
                targetY: 0.5,
            };
            tileWarpStates.set(tile, next);
            return next;
        })();

    state.targetX = clamp(uv.x, 0, 1);
    state.targetY = clamp(1 - uv.y, 0, 1); // convert to top-left origin
    state.targetStrength = Math.min(1.8, state.targetStrength + magnitude * 2);

    if (!state.raf) state.raf = requestAnimationFrame(() => tickTileWarp(tile, state));
}

function relaxTileWarp(tile: HTMLElement | null) {
    if (!ENABLE_TILE_WARP) return;
    if (!tile) return;
    const state = tileWarpStates.get(tile);
    if (!state) return;
    state.targetStrength = 0;
    state.targetX = 0.5;
    state.targetY = 0.5;
    state.lagX = 0.5;
    state.lagY = 0.5;
}

function disposeTileWarp(tile: HTMLElement | null) {
    if (!ENABLE_TILE_WARP) return;
    if (!tile) return;
    const state = tileWarpStates.get(tile);
    if (!state) return;
    if (state.raf) cancelAnimationFrame(state.raf);
    tileWarpStates.delete(tile);
    tile.style.removeProperty("--tile-warp-strength");
    tile.style.removeProperty("--tile-warp-x");
    tile.style.removeProperty("--tile-warp-y");
    tile.style.removeProperty("--tile-warp-bend-x");
    tile.style.removeProperty("--tile-warp-bend-y");
    tile.style.removeProperty("--tile-warp-bulge");
    tile.style.removeProperty("--tile-corner-tl");
    tile.style.removeProperty("--tile-corner-tr");
    tile.style.removeProperty("--tile-corner-br");
    tile.style.removeProperty("--tile-corner-bl");
    tile.style.removeProperty("--tile-clip-left");
    tile.style.removeProperty("--tile-clip-right");
    tile.style.removeProperty("--tile-clip-top");
    tile.style.removeProperty("--tile-clip-bottom");
    tile.style.removeProperty("--tile-goo-x");
    tile.style.removeProperty("--tile-goo-y");
}

function attachTileSurfaceWarp(tile: HTMLElement | null) {
    if (!ENABLE_TILE_WARP) return;
    if (!tile || tileSurfaceHandlers.has(tile)) return;
    const handler = (e: PointerEvent) => {
        if (tile.classList.contains("is-flipped")) return;
        const rect = tile.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const u = (e.clientX - rect.left) / rect.width;
        const v = 1 - (e.clientY - rect.top) / rect.height;
        const uv = new Vector2(
            Math.min(1, Math.max(0, u)),
            Math.min(1, Math.max(0, v))
        );
        pumpTileWarp(tile, uv, 0.25);
    };
    const leave = () => relaxTileWarp(tile);
    tile.addEventListener("pointerenter", handler, { passive: true });
    tile.addEventListener("pointermove", handler, { passive: true });
    tile.addEventListener("pointerleave", leave);
    tileSurfaceHandlers.set(tile, { handler, leave });
}

function detachTileSurfaceWarp(tile: HTMLElement | null) {
    if (!tile) return;
    const handlers = tileSurfaceHandlers.get(tile);
    if (!handlers) return;
    tile.removeEventListener("pointerenter", handlers.handler);
    tile.removeEventListener("pointermove", handlers.handler);
    tile.removeEventListener("pointerleave", handlers.leave);
    tileSurfaceHandlers.delete(tile);
}

function warpFromUV(el: HTMLElement, uv: Vector2, magnitude: number) {
    if (!ENABLE_TILE_WARP) return;
    const tile = el.closest<HTMLElement>(".tile");
    if (tile) {
        pumpTileWarp(tile, uv, magnitude);
    }
}

function makeTile(wrap: HTMLElement, img: HTMLImageElement) {
    const st = {} as TileState;
    st.wrap = wrap; st.img = img; st.hovered = false;
    st.tile = wrap.closest(".tile");
    st.last = new Vector2(0.5, 0.5);
    st.lastFrame = 0;
    st.inView = true;
    st.bounds = {
        left: 0,
        top: 0,
        width: 1,
        height: 1,
    };

    img.style.transition = img.style.transition || "opacity 0.2s ease";

    // renderer
    st.renderer = new WebGLRenderer({ alpha: true, antialias: false, powerPreference: "high-performance", premultipliedAlpha: false });
    st.renderer.outputColorSpace = SRGBColorSpace;
    st.renderer.toneMapping = NoToneMapping;
    st.renderer.setClearColor(0x000000, 0);
    st.renderer.setPixelRatio(DPR);

    const rect = wrap.getBoundingClientRect();
    st.renderer.setSize(rect.width, rect.height, false);
    st.bounds.left = rect.left;
    st.bounds.top = rect.top;
    st.bounds.width = Math.max(1, rect.width);
    st.bounds.height = Math.max(1, rect.height);
    Object.assign(st.renderer.domElement.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
    wrap.appendChild(st.renderer.domElement);

    // sim
    st.sim = new RippleSim(st.renderer, FLOW_SIZE);

    // display scene
    st.scene = new Scene();
    st.cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    st.cam.position.set(0, 0, 1);
    st.cam.up.set(0, 1, 0);
    st.cam.lookAt(0, 0, 0);

    const photoTex = canvasTextureFromImage(img);
    const dbuf = new Vector2(); st.renderer.getDrawingBufferSize(dbuf);
    const [sx, sy] = coverScale(img.naturalWidth, img.naturalHeight, dbuf.x, dbuf.y);
    const texResolution = new Vector2(
        photoTex.image?.width ?? img.naturalWidth,
        photoTex.image?.height ?? img.naturalHeight
    );

    st.uniforms = {
        uMap: { value: photoTex },
        uHeight: { value: st.sim.texture() },
        uTexScale: { value: new Vector2(sx, sy) },
        uResolution: { value: texResolution },
        uPointer: { value: st.last.clone() },
        uTime: { value: 0 },
        uStrength: { value: 0.8 }
    };
    st.uniforms.uResolution.value.set(texResolution.x, texResolution.y);
    st.uniforms.uStrength.value = 0.8;

    const dispMat = new ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: DISPLAY_FRAG,
        uniforms: st.uniforms,
        transparent: true,
        toneMapped: false
    });

    const quad = new Mesh(new PlaneGeometry(2, 2), dispMat);
    quad.rotation.set(0, 0, 0);
    quad.position.set(0, 0, 0);
    st.scene.add(quad);

    const el = st.renderer.domElement;
    const updateBounds = () => {
        const b = el.getBoundingClientRect();
        st.bounds.left = b.left;
        st.bounds.top = b.top;
        st.bounds.width = Math.max(1, b.width);
        st.bounds.height = Math.max(1, b.height);
    };
    const toUV = (e: PointerEvent) => {
        const x = (e.clientX - st.bounds.left) / st.bounds.width;
        const y = 1 - (e.clientY - st.bounds.top) / st.bounds.height;
        return new Vector2(x, y);
    };

    el.addEventListener("pointerenter", (e: PointerEvent) => {
        if (st.tile?.classList.contains("is-flipped")) return;
        updateBounds();
        wrap.classList.add("is-ripple-hover");
        st.hovered = true;
        st.last.copy(toUV(e));
        st.uniforms.uPointer.value.copy(st.last);
        st.sim.addDrop(st.last, 0.035, 0.14);
        warpFromUV(wrap, st.last, 0.24);
        wakeTilesTicker();
    });

    el.addEventListener("pointermove", (e: PointerEvent) => {
        if (!st.hovered || st.tile?.classList.contains("is-flipped")) return;
        wrap.classList.add("is-ripple-hover");
        const uv = toUV(e);
        const delta = uv.clone().sub(st.last);
        const speed = delta.length();
        const viscousUv = st.last.clone().add(delta.multiplyScalar(POINTER_VISCOSITY));
        st.uniforms.uPointer.value.copy(viscousUv);
        if (speed > POINTER_MIN_SPEED) {
            const strength = clamp(speed * 1.6, 0.02, 0.18);
            st.sim.addDrop(viscousUv, 0.026, strength);
            warpFromUV(wrap, viscousUv, strength * 0.6);
            st.last.copy(viscousUv);
        } else {
            st.last.lerp(uv, POINTER_VISCOSITY);
        }
        wakeTilesTicker();
    }, { passive: true });

    el.addEventListener("pointerleave", () => {
        st.hovered = false;
        wrap.classList.remove("is-ripple-hover");
        img.style.visibility = "";
        img.style.opacity = "";
        relaxTileWarp(wrap.closest(".tile"));
    });
    // resize ? fix cover scale to drawing buffer size
    st.ro = new ResizeObserver(() => {
        const r = wrap.getBoundingClientRect();
        st.renderer.setSize(r.width, r.height, false);
        updateBounds();
        st.renderer.getDrawingBufferSize(dbuf);
        (st.uniforms.uTexScale.value as Vector2).set(...coverScale(img.naturalWidth, img.naturalHeight, dbuf.x, dbuf.y));
    });
    st.ro.observe(wrap);
    ensureTileViewportObserver();
    tileByWrap.set(wrap, st);
    tileViewportObserver?.observe(wrap);

    // render an initial frame before hiding the fallback img
    try {
        st.sim.step();
        st.uniforms.uHeight.value = st.sim.texture();
        st.uniforms.uTime.value = performance.now() * 0.001;
        st.renderer.render(st.scene, st.cam);
        st.lastFrame = performance.now();
        wrap.dataset.rippleReady = "1";
        wrap.classList.add("ripple-ready");
        if (!wrap.classList.contains("is-ripple-hover")) {
            img.style.visibility = "";
            img.style.opacity = "";
        }
    } catch {
        wrap.dataset.rippleReady = "0";
        wrap.classList.remove("ripple-ready");
        img.style.visibility = "";
        img.style.opacity = "";
    }
    attachTileSurfaceWarp(st.tile);

    tileInstances.push(st);
    ensureTilesTicker();
    return st;
}

function disposeTile(st: TileState) {
    try { st.ro?.disconnect(); } catch { }
    tileViewportObserver?.unobserve(st.wrap);
    tileByWrap.delete(st.wrap);
    st.sim?.dispose();
    st.renderer?.dispose();
    st.scene?.clear();
    st.renderer?.domElement?.remove();
    if (st.img) st.img.style.visibility = "";
    if (st.wrap) {
        delete st.wrap.dataset.rippleReady;
        st.wrap.classList.remove("ripple-ready", "is-ripple-active", "is-ripple-hover");
        if (st.wrap.dataset?.ripplesInit) delete st.wrap.dataset.ripplesInit;
    }
    disposeTileWarp(st.wrap?.closest(".tile") ?? null);
    detachTileSurfaceWarp(st.tile);
    stopTilesTickerIfIdle();
}

export function bootRogerTiles() {
    disposeRogerTiles();
    if (typeof document !== "undefined" && !rogerHooked) {
        rogerHooked = true;
        document.addEventListener("astro:before-swap", disposeRogerTiles);
    }
    document.querySelectorAll<HTMLElement>(".tile").forEach((card) => {
        const wrap = card.querySelector<HTMLElement>(".roger-wrap");
        const img = card.querySelector<HTMLImageElement>(".roger-src");
        if (!wrap || !img) return;
        attachTileSurfaceWarp(card);
        const start = () => {
            try {
                const st = makeTile(wrap, img);
                if (st?.wrap) {
                    st.wrap.dataset.rippleReady = st.wrap.dataset.rippleReady || "1";
                    st.wrap.classList.add("ripple-ready");
                }
            } catch (err) {
                console.warn("[roger-tiles] Failed to boot tile", err);
                wrap.classList.remove("is-ripple-active");
                wrap.classList.remove("ripple-ready");
                img.style.visibility = "";
            }
        };
        wrap.classList.add("is-ripple-active");
        if (img.complete) {
            img.decode ? img.decode().then(start).catch(start) : start();
        } else {
            img.addEventListener("load", () => {
                img.decode ? img.decode().then(start).catch(start) : start();
            }, { once: true });
        }
    });
}
export function disposeRogerTiles() {
    while (tileInstances.length) {
        const st = tileInstances.pop();
        if (!st) continue;
        disposeTile(st);
        st.wrap?.classList.remove("is-ripple-active");
    }
}




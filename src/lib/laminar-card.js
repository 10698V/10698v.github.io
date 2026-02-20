// src/lib/laminar-card.js
import * as THREE from "three";

const DPR = Math.min(window.devicePixelRatio || 1, 2);

const VERT = /* glsl */`
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uImage, uFlow;
  uniform vec2  uTexScale;
  uniform float uTrailScale, uEdge;

  float edgeMask(vec2 uv, float e){
    float m = smoothstep(0.0,e,uv.x)*smoothstep(0.0,e,1.0-uv.x);
          m*= smoothstep(0.0,e,uv.y)*smoothstep(0.0,e,1.0-uv.y);
    return m;
  }

  void main(){
    vec2 uv   = vUv;
    vec2 flow = (texture2D(uFlow, uv).rg - 0.5) * 2.0;
    flow     *= edgeMask(uv, uEdge);                 // keep borders pinned
    vec2 suv  = (uv - 0.5) * uTexScale + 0.5;        // object-fit: cover
    gl_FragColor = texture2D(uImage, suv + flow * uTrailScale);
  }
`;

function coverScale(tw, th, vw, vh){
  const arT = tw / th, arV = vw / vh;
  return arT > arV ? [arV / arT, 1] : [1, arT / arV];
}

class LaminarCardImpl {
  constructor(wrapper){
    this.w   = wrapper;
    this.img = wrapper.querySelector("img.base-photo");
    if (!this.img) return;

    if (this.img.complete) this.start();
    else this.img.addEventListener("load", ()=>this.start(), { once:true });
  }

  start(){
    const b = this.w.getBoundingClientRect();
    const W = Math.max(2, Math.floor(b.width));
    const H = Math.max(2, Math.floor(b.height));

    this.renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true });
    this.renderer.setPixelRatio(DPR);
    this.renderer.setSize(W, H, false);
    Object.assign(this.renderer.domElement.style, { position:"absolute", inset:"0", width:"100%", height:"100%" });
    this.w.appendChild(this.renderer.domElement);

    // Hide the fallback photo once WebGL is mounted
    this.img.style.visibility = "hidden";

    this.scene  = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);

    // Texture from the existing <img> (no CORS issues)
    this.tex = new THREE.Texture(this.img);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.needsUpdate = true;

    // Flow field (RG vector map)
    this.S = 512;
    this.flowCanvas = document.createElement("canvas");
    this.flowCanvas.width = this.flowCanvas.height = this.S;
    this.flow = this.flowCanvas.getContext("2d");
    this.flow.fillStyle = "rgb(128,128,128)";
    this.flow.fillRect(0,0,this.S,this.S);
    this.flowTex = new THREE.CanvasTexture(this.flowCanvas);
    this.flowTex.minFilter = this.flowTex.magFilter = THREE.LinearFilter;
    this.flowTex.needsUpdate = true;

    const [sx, sy] = coverScale(this.img.naturalWidth, this.img.naturalHeight, W * DPR, H * DPR);
    this.uniforms = {
      uImage:      { value: this.tex },
      uFlow:       { value: this.flowTex },
      uTexScale:   { value: new THREE.Vector2(sx, sy) },
      uTrailScale: { value: 0.06 },     // softer default
      uEdge:       { value: 0.035 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent:true
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), mat));

    // pointer state
    this.hover=false; this.prev={x:.5,y:.5}; this.curr={x:.5,y:.5};

    const el = this.renderer.domElement;
    const toLocal = (e)=>{ const r = el.getBoundingClientRect(); return { x:(e.clientX-r.left)/r.width, y:(e.clientY-r.top)/r.height }; };
    el.addEventListener("pointerenter", (e)=>{ this.hover=true; const p=toLocal(e); this.prev=this.curr=p; });
    el.addEventListener("pointermove",  (e)=>{ this.curr=toLocal(e); });
    el.addEventListener("pointerleave", ()=>{ this.hover=false; });

    // Keep canvas perfectly fitted (also fix initial “half-width” race)
    this.framesToFix = 6;
    new ResizeObserver(()=> this.fixSize()).observe(this.w);

    this.loop();
  }

  fixSize(){
    const r = this.w.getBoundingClientRect();
    const W = Math.max(2, Math.floor(r.width));
    const H = Math.max(2, Math.floor(r.height));
    this.renderer.setSize(W, H, false);
    const [sx, sy] = coverScale(this.img.naturalWidth, this.img.naturalHeight, W * DPR, H * DPR);
    this.uniforms.uTexScale.value.set(sx, sy);
  }

  stamp(p, v){
    const speed = Math.hypot(v.x, v.y);
    if (speed < 0.002) return;

    const S = this.S, ctx = this.flow;
    const x = p.x * S, y = p.y * S;

    const gain  = 600.0;                           // was 900: softer displacement
    const R = Math.max(0, Math.min(255, 128 + gain * v.x));
    const G = Math.max(0, Math.min(255, 128 + gain * v.y));
    const ang   = Math.atan2(v.y, v.x);
    const major = S * (0.030 + Math.min(1.0, speed * 3.0) * 0.065);
    const minor = major * 0.55;

    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang); ctx.scale(major, minor);
    const grad = ctx.createRadialGradient(0,0,0, 0,0,1);
    grad.addColorStop(0, `rgba(${R},${G},128,0.65)`);
    grad.addColorStop(1, `rgba(128,128,128,0.0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0,0,1,0,6.28318530718); ctx.fill();
    ctx.restore();
  }

  loop(){
    // First few frames: force-fit to avoid the initial half-width look
    if (this.framesToFix > 0){ this.fixSize(); this.framesToFix--; }

    // Faster decay when not hovering → image returns to original quickly
    const decay = this.hover ? 0.12 : 0.30;  // ↑ this number = faster reset
    this.flow.fillStyle = `rgba(128,128,128,${decay})`;
    this.flow.fillRect(0,0,this.S,this.S);

    if (this.hover){
      const vx = this.curr.x - this.prev.x;
      const vy = this.curr.y - this.prev.y;
      this.stamp(this.curr, { x:vx, y:vy });
    }
    this.prev = { ...this.curr };

    this.flowTex.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(()=>this.loop());
  }
}

export function bootAll(){
  const nodes = document.querySelectorAll(".liquid-wrap");
  console.log("[Laminar] boot", nodes.length);
  nodes.forEach(n => new LaminarCardImpl(n));
}

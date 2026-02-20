import{W as N,d as E,u as q,b as U,o as I,V as u,S as g,n as W,v as _,H as A,w as B,h as G,x as O,y as w,z as M,L as P,i as V}from"./spa-router.3jzHxz5n.js";const z=Math.min(window.__PRIM3_RIPPLE_DPR||window.devicePixelRatio||1,1.35);function b(t,r,e,a){const s=t/r,i=e/a;return s>i?[i/s,1]:[1,s/i]}const R=`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,Y=`
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
`,X=`
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
`,j=`
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
`;class Q{size;renderer;camera=new I(-1,1,1,-1,0,1);scene=new U;texel=new u(1,1);rtPrev;rtCurr;rtNext;quad;stepMat;dropMat;damping=.982;dropPos=new u(.5,.5);dropRadius=.025;dropStrength=.8;constructor(r,e=512){this.size=e,this.renderer=r;const a=r.capabilities.isWebGL2?A:B,s=()=>new G(e,e,{format:V,type:a,minFilter:P,magFilter:P,depthBuffer:!1,stencilBuffer:!1});this.rtPrev=s(),this.rtCurr=s(),this.rtNext=s(),this.texel.set(1/e,1/e),this.stepMat=new g({vertexShader:R,fragmentShader:Y,uniforms:{uPrev:{value:this.rtPrev.texture},uCurr:{value:this.rtCurr.texture},uTexel:{value:this.texel},uDamping:{value:this.damping}}}),this.dropMat=new g({vertexShader:R,fragmentShader:X,uniforms:{uTex:{value:this.rtCurr.texture},uPoint:{value:this.dropPos},uRadius:{value:this.dropRadius},uStrength:{value:this.dropStrength}}}),this.quad=new W(new _(2,2),this.stepMat),this.scene.add(this.quad);const i=d=>{this.renderer.setRenderTarget(d),this.renderer.clear(!0,!0,!0)};i(this.rtPrev),i(this.rtCurr),i(this.rtNext),this.renderer.setRenderTarget(null)}texture(){return this.rtCurr.texture}addDrop(r,e,a){this.dropPos.copy(r),this.dropRadius=e,this.dropStrength=a,this.dropMat.uniforms.uPoint.value.copy(this.dropPos),this.dropMat.uniforms.uRadius.value=this.dropRadius,this.dropMat.uniforms.uStrength.value=this.dropStrength,this.dropMat.uniforms.uTex.value=this.rtCurr.texture,this.quad.material=this.dropMat,this.renderer.setRenderTarget(this.rtNext),this.renderer.render(this.scene,this.camera),this.renderer.setRenderTarget(null);let s=this.rtCurr;this.rtCurr=this.rtNext,this.rtNext=s,this.quad.material=this.stepMat}step(){this.stepMat.uniforms.uPrev.value=this.rtPrev.texture,this.stepMat.uniforms.uCurr.value=this.rtCurr.texture,this.quad.material=this.stepMat,this.renderer.setRenderTarget(this.rtNext),this.renderer.render(this.scene,this.camera),this.renderer.setRenderTarget(null);let r=this.rtPrev;this.rtPrev=this.rtCurr,this.rtCurr=this.rtNext,this.rtNext=r}dispose(){this.rtPrev.dispose(),this.rtCurr.dispose(),this.rtNext.dispose(),this.dropMat.dispose(),this.stepMat.dispose(),this.quad.material instanceof g&&this.quad.material.dispose(),this.quad.geometry.dispose()}}const Z=160,C=.52,J=.0015,K=1e3/60,$=1024;function ee(t){const r=document.createElement("canvas"),e=Math.max(1,Math.min(t.naturalWidth,t.naturalHeight)),a=Math.min(1,$/e),s=Math.max(32,Math.round(t.naturalWidth*a)),i=Math.max(32,Math.round(t.naturalHeight*a));r.width=s,r.height=i;const d=r.getContext("2d");d.imageSmoothingEnabled=!1,d.drawImage(t,0,0,s,i);const n=new O(r);return n.needsUpdate=!0,n.colorSpace=E,n.minFilter=w,n.magFilter=w,n.wrapS=M,n.wrapT=M,n.generateMipmaps=!1,n}const c=[];let L=!1,h=0,p=!1;function te(){if(p)return;p=!0;const t=2e3,r=e=>{if(!p)return;if(c.length===0){p=!1,h=0;return}const a=e||performance.now();for(let s=0;s<c.length;s++){const i=c[s];if(i){if(i.tile?.classList.contains("is-flipped")){i.hovered=!1,i.wrap?.classList.remove("is-ripple-hover"),i.img&&(i.img.style.visibility="",i.img.style.opacity="");continue}!i.hovered&&i.lastFrame&&a-i.lastFrame>t||(!i.lastFrame||a-i.lastFrame>=K)&&(i.sim.step(),i.uniforms.uHeight.value=i.sim.texture(),i.uniforms.uTime.value=a*.001,i.renderer.render(i.scene,i.cam),i.lastFrame=a)}}h=requestAnimationFrame(r)};h=requestAnimationFrame(r)}function re(){!p||c.length>0||(cancelAnimationFrame(h),h=0,p=!1)}const ie=(t,r,e)=>Math.max(r,Math.min(e,t)),D=new WeakMap;function se(t){if(!t)return;const r=D.get(t);r&&(t.removeEventListener("pointerenter",r.handler),t.removeEventListener("pointermove",r.handler),t.removeEventListener("pointerleave",r.leave),D.delete(t))}function ae(t,r){const e={};e.wrap=t,e.img=r,e.hovered=!1,e.tile=t.closest(".tile"),e.last=new u(.5,.5),e.lastFrame=0,r.style.transition=r.style.transition||"opacity 0.2s ease",e.renderer=new N({alpha:!0,antialias:!1,powerPreference:"high-performance",premultipliedAlpha:!1}),e.renderer.outputColorSpace=E,e.renderer.toneMapping=q,e.renderer.setClearColor(0,0),e.renderer.setPixelRatio(z);const a=t.getBoundingClientRect();e.renderer.setSize(a.width,a.height,!1),Object.assign(e.renderer.domElement.style,{position:"absolute",inset:"0",width:"100%",height:"100%"}),t.appendChild(e.renderer.domElement),e.sim=new Q(e.renderer,Z),e.scene=new U,e.cam=new I(-1,1,1,-1,0,1),e.cam.position.set(0,0,1),e.cam.up.set(0,1,0),e.cam.lookAt(0,0,0);const s=ee(r),i=new u;e.renderer.getDrawingBufferSize(i);const[d,n]=b(r.naturalWidth,r.naturalHeight,i.x,i.y),x=new u(s.image?.width??r.naturalWidth,s.image?.height??r.naturalHeight);e.uniforms={uMap:{value:s},uHeight:{value:e.sim.texture()},uTexScale:{value:new u(d,n)},uResolution:{value:x},uPointer:{value:e.last.clone()},uTime:{value:0},uStrength:{value:.8}},e.uniforms.uResolution.value.set(x.x,x.y),e.uniforms.uStrength.value=.8;const k=new g({vertexShader:R,fragmentShader:j,uniforms:e.uniforms,transparent:!0,toneMapped:!1}),y=new W(new _(2,2),k);y.rotation.set(0,0,0),y.position.set(0,0,0),e.scene.add(y);const v=e.renderer.domElement,T=o=>{const l=v.getBoundingClientRect(),m=(o.clientX-l.left)/l.width,f=1-(o.clientY-l.top)/l.height;return new u(m,f)};v.addEventListener("pointerenter",o=>{e.tile?.classList.contains("is-flipped")||(t.classList.add("is-ripple-hover"),e.hovered=!0,e.last.copy(T(o)),e.uniforms.uPointer.value.copy(e.last),e.sim.addDrop(e.last,.035,.14),e.last,void 0)}),v.addEventListener("pointermove",o=>{if(!e.hovered||e.tile?.classList.contains("is-flipped"))return;t.classList.add("is-ripple-hover");const l=T(o),m=l.clone().sub(e.last),f=m.length(),S=e.last.clone().add(m.multiplyScalar(C));if(e.uniforms.uPointer.value.copy(S),f>J){const H=ie(f*1.6,.02,.18);e.sim.addDrop(S,.026,H),e.last.copy(S)}else e.last.lerp(l,C)},{passive:!0}),v.addEventListener("pointerleave",()=>{e.hovered=!1,t.classList.remove("is-ripple-hover"),r.style.visibility="",r.style.opacity="",t.closest(".tile")}),e.ro=new ResizeObserver(()=>{const o=t.getBoundingClientRect();e.renderer.setSize(o.width,o.height,!1),e.renderer.getDrawingBufferSize(i),e.uniforms.uTexScale.value.set(...b(r.naturalWidth,r.naturalHeight,i.x,i.y))}),e.ro.observe(t);try{e.sim.step(),e.uniforms.uHeight.value=e.sim.texture(),e.uniforms.uTime.value=performance.now()*.001,e.renderer.render(e.scene,e.cam),e.lastFrame=performance.now(),t.dataset.rippleReady="1",t.classList.add("ripple-ready"),t.classList.contains("is-ripple-hover")||(r.style.visibility="",r.style.opacity="")}catch{t.dataset.rippleReady="0",t.classList.remove("ripple-ready"),r.style.visibility="",r.style.opacity=""}return e.tile,c.push(e),te(),e}function ne(t){try{t.ro?.disconnect()}catch{}t.sim?.dispose(),t.renderer?.dispose(),t.scene?.clear(),t.renderer?.domElement?.remove(),t.img&&(t.img.style.visibility=""),t.wrap&&(delete t.wrap.dataset.rippleReady,t.wrap.classList.remove("ripple-ready","is-ripple-active","is-ripple-hover"),t.wrap.dataset?.ripplesInit&&delete t.wrap.dataset.ripplesInit),t.wrap?.closest(".tile"),se(t.tile),re()}function le(){F(),typeof document<"u"&&!L&&(L=!0,document.addEventListener("astro:before-swap",F)),document.querySelectorAll(".tile").forEach(t=>{const r=t.querySelector(".roger-wrap"),e=t.querySelector(".roger-src");if(!r||!e)return;const a=()=>{try{const s=ae(r,e);s?.wrap&&(s.wrap.dataset.rippleReady=s.wrap.dataset.rippleReady||"1",s.wrap.classList.add("ripple-ready"))}catch(s){console.warn("[roger-tiles] Failed to boot tile",s),r.classList.remove("is-ripple-active"),r.classList.remove("ripple-ready"),e.style.visibility=""}};r.classList.add("is-ripple-active"),e.complete?e.decode?e.decode().then(a).catch(a):a():e.addEventListener("load",()=>{e.decode?e.decode().then(a).catch(a):a()},{once:!0})})}function F(){for(;c.length;){const t=c.pop();t&&(ne(t),t.wrap?.classList.remove("is-ripple-active"))}}export{le as bootRogerTiles,F as disposeRogerTiles};

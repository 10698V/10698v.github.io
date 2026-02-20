import{b as B}from"./portfolio-loader.-z5lzify.js";import{B as j,S as Y,I as $,O as X,a as S,b as K,P as Z,W as J,R as Q,C as ee,V as te,c as ie}from"./spa-router.3jzHxz5n.js";import{gsap as C}from"./index.Dj4XqqbB.js";import{E as se,R as ne,U as oe,S as re}from"./UnrealBloomPass.D6T5-zMz.js";import ae from"./lenis.DpvFmOB5.js";import{ScrollTrigger as W}from"./ScrollTrigger.CcPJIpJ9.js";const ce='a, button, [role="button"], .tile, [data-cursor="hover"]',de='input, textarea, select, [contenteditable], [contenteditable="true"]',le=".tile.is-flipped",ue="#6beeff",me=160,he=180,ve=()=>typeof window>"u"||typeof matchMedia!="function"?!0:matchMedia("(pointer: coarse)").matches||matchMedia("(hover: none)").matches,pe=()=>typeof window<"u"&&typeof matchMedia=="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches,H=()=>{if(typeof window>"u"||typeof document>"u"||ve()||document.getElementById("arcana-cursor"))return;const e=document.documentElement,i=pe(),t=document.createElement("div");t.id="arcana-cursor",t.className=i?"reduced-motion is-hidden":"is-hidden",t.setAttribute("aria-hidden","true"),t.innerHTML=`
    <span class="arcana-cursor__ring"></span>
    <span class="arcana-cursor__dot"></span>
    <span class="arcana-cursor__lock">LOCK</span>
  `,document.body.appendChild(t),e.classList.add("arcana-cursor-enabled");let a=window.innerWidth*.5,u=window.innerHeight*.5,y=a,o=u,w=0,g=0,m=0,h=!1,c=0;const x=s=>{let r="";if(s){const p=s.closest(".tile");if(p&&(r=getComputedStyle(p).getPropertyValue("--role-accent").trim()),!r){const l=getComputedStyle(s);r=l.getPropertyValue("--arcana-accent").trim()||l.getPropertyValue("--role-accent").trim()}}t.style.setProperty("--cursor-accent",r||ue)},L=()=>{t.classList.add("show-lock"),window.clearTimeout(c),c=window.setTimeout(()=>{t.classList.remove("show-lock")},he)},b=()=>{const s=!!document.querySelector(le);s!==h&&(h=s,t.classList.toggle("is-lock",s),s&&L())},v=()=>{t.classList.remove("is-hidden")},_=()=>{t.classList.add("is-hidden"),t.classList.remove("is-hover","is-press")},R=s=>{m||(m=s);const r=Math.min((s-m)/1e3,.04);m=s;const p=i?1:.24;if(y+=(a-y)*p,o+=(u-o)*p,t.style.transform=`translate3d(${y}px, ${o}px, 0)`,!i){const l=t.classList.contains("is-hover")?220:90;g=(g+l*r)%360,t.style.setProperty("--cursor-rot",`${g.toFixed(2)}deg`)}w=window.requestAnimationFrame(R)},T=s=>{a=s.clientX,u=s.clientY,!e.classList.contains("arcana-cursor-input")&&v()},I=s=>{const r=s.target instanceof HTMLElement?s.target:null;if(!r)return;if(r.closest(de)){e.classList.add("arcana-cursor-input"),_();return}e.classList.remove("arcana-cursor-input"),v();const l=r.closest(ce);l?(t.classList.add("is-hover"),x(l)):(t.classList.remove("is-hover"),x(null))},M=()=>{t.classList.contains("is-hidden")||(t.classList.add("is-press"),window.setTimeout(()=>t.classList.remove("is-press"),me))},A=()=>{t.classList.remove("is-press")},P=()=>{e.classList.remove("arcana-cursor-input"),_()},D=new MutationObserver(()=>b());D.observe(document.body,{subtree:!0,attributes:!0,attributeFilter:["class"]}),document.addEventListener("pointermove",T,{passive:!0}),document.addEventListener("pointerover",I,{passive:!0}),document.addEventListener("pointerdown",M,{passive:!0}),document.addEventListener("pointerup",A,{passive:!0}),window.addEventListener("blur",P),window.addEventListener("pointerout",s=>{s.relatedTarget===null&&P()}),document.addEventListener("visibilitychange",()=>{document.hidden&&P()}),document.addEventListener("astro:page-load",()=>{b()}),b(),x(null),w=window.requestAnimationFrame(R),window.__arcanaCursorCleanup=()=>{window.cancelAnimationFrame(w),window.clearTimeout(c),D.disconnect(),document.removeEventListener("pointermove",T),document.removeEventListener("pointerover",I),document.removeEventListener("pointerdown",M),document.removeEventListener("pointerup",A),window.removeEventListener("blur",P),t.remove(),e.classList.remove("arcana-cursor-enabled","arcana-cursor-input")}},F=(n=360)=>{const e=document.getElementById("arcana-cursor");!e||e.classList.contains("reduced-motion")||(e.classList.remove("is-bloom"),e.clientWidth,e.classList.add("is-bloom"),window.setTimeout(()=>e.classList.remove("is-bloom"),n))},fe=`
  uniform float uTime;
  uniform float uProgress;
  uniform float uExplosionStrength;
  
  attribute vec3 aGridPosition;
  attribute vec3 aCardPosition;
  attribute float aRandom;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  
  // Simplex 3D Noise 
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  
  float snoise(vec3 v) { 
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    
    // First corner
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 = v - i + dot(i, C.xxx) ;
    
    // Other corners
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    
    // Permutations
    i = mod289(i); 
    vec4 p = permute( permute( permute( 
               i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
             + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
             
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );
    
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                  dot(p2,x2), dot(p3,x3) ) );
  }

  void main() {
    vUv = uv;
    vNormal = normal;
    
    // Base Interpolation
    vec3 basePos = mix(aGridPosition, aCardPosition, uProgress);
    
    // Explosion Noise
    float explosionCurve = sin(uProgress * 3.14159);
    
    // Use aGridPosition for stable noise field
    vec3 noiseVec = vec3(
      snoise(aGridPosition * 0.1 + uTime * 0.5 + aRandom),
      snoise(aGridPosition * 0.1 + uTime * 0.5 + aRandom + 100.0),
      snoise(aGridPosition * 0.1 + uTime * 0.5 + aRandom + 200.0)
    );
    
    // Apply explosion
    vec3 finalPos = basePos + (noiseVec * explosionCurve * uExplosionStrength * (1.0 + aRandom));
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
  }
`,we=`
  varying vec2 vUv;
  varying vec3 vNormal;
  
  void main() {
    vec3 light = normalize(vec3(1.0, 1.0, 1.0));
    float d = max(dot(vNormal, light), 0.0);
    vec3 color = vec3(0.1, 0.1, 0.1) + vec3(0.9) * d;
    gl_FragColor = vec4(color, 1.0);
  }
`;class ge{constructor(e){this.scene=e,this.count=1e3,this.mesh=null,this.init()}init(){const e=new j(.5,.5,.5),i=new Y({vertexShader:fe,fragmentShader:we,uniforms:{uTime:{value:0},uProgress:{value:0},uExplosionStrength:{value:3}}});this.mesh=new $(e,i,this.count),this.mesh.frustumCulled=!1,this.generatePositions(),this.scene.add(this.mesh)}generatePositions(){const e=[],i=[],t=[];for(let o=0;o<this.count;o++){const w=o%10*1.5-7.5,g=Math.floor(o/10)%10*1.5-7.5,m=Math.floor(o/100)*1.5-7.5;e.push(w,g,m);const h=40,c=.6,x=o%h*c-h*c/2,L=Math.floor(o/h)*c-25*c/2;i.push(x,L,0),t.push(Math.random());const v=new X;v.position.set(0,0,0),v.updateMatrix(),this.mesh.setMatrixAt(o,v.matrix)}this.mesh.instanceMatrix.needsUpdate=!0,this.mesh.geometry.setAttribute("aGridPosition",new S(new Float32Array(e),3)),this.mesh.geometry.setAttribute("aCardPosition",new S(new Float32Array(i),3)),this.mesh.geometry.setAttribute("aRandom",new S(new Float32Array(t),1))}update(e){this.mesh&&this.mesh.material.uniforms&&(this.mesh.material.uniforms.uTime.value=e)}animateTo(e){const i=e==="CARD"?1:0;this.mesh&&this.mesh.material.uniforms&&C.to(this.mesh.material.uniforms.uProgress,{value:i,duration:2,ease:"power3.inOut"})}}const xe={uniforms:{tDiffuse:{value:null},uTime:{value:0},nIntensity:{value:.5},sIntensity:{value:.05},sCount:{value:4096},grayscale:{value:0}},vertexShader:`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,fragmentShader:`
    uniform float uTime;
    uniform float nIntensity;
    uniform float sIntensity;
    uniform float sCount;
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    
    void main() {
      vec4 cTextureScreen = texture2D( tDiffuse, vUv );
      float x = vUv.x * vUv.y * uTime *  1000.0;
      x = mod( x, 13.0 ) * mod( x, 123.0 );
      float dx = mod( x, 0.01 );
      vec3 cResult = cTextureScreen.rgb + cTextureScreen.rgb * clamp( 0.1 + dx * 100.0, 0.0, 1.0 );
      vec2 sc = vec2( sin( vUv.y * sCount ), cos( vUv.y * sCount ) );
      cResult += cTextureScreen.rgb * vec3( sc.x, sc.y, sc.x ) * sIntensity;
      cResult = cTextureScreen.rgb + clamp( nIntensity, 0.0,1.0 ) * ( cResult - cTextureScreen.rgb );
      gl_FragColor =  vec4( cResult, cTextureScreen.a );
    }
  `};class ye{constructor(){if(window.webglInstance)return window.webglInstance;this.container=document.querySelector("#webgl-overlay"),this.width=window.innerWidth,this.height=window.innerHeight,this.pixelRatio=Math.min(window.devicePixelRatio,1.5),this.scene=new K,this.camera=new Z(75,this.width/this.height,.1,100),this.camera.position.z=15,this.renderer=new J({alpha:!1,antialias:!1,powerPreference:"high-performance",stencil:!1,depth:!0}),this.renderer.setPixelRatio(this.pixelRatio),this.renderer.setSize(this.width,this.height),this.renderer.setClearColor(132371,1),this.renderer.toneMapping=Q,this.container&&this.container.appendChild(this.renderer.domElement),this.clock=new ee,this.isPlaying=!1,this._rafId=null,this.cubeGrid=new ge(this.scene),this.initPostProcessing(),this.initEvents(),window.webglInstance=this}initPostProcessing(){this.composer=new se(this.renderer);const e=new ne(this.scene,this.camera);this.composer.addPass(e);const i=new oe(new te(this.width,this.height),1.5,.4,.85);i.threshold=.2,i.strength=.8,i.radius=.5,this.composer.addPass(i),this.grainPass=new re(xe),this.grainPass.uniforms.nIntensity.value=.3,this.grainPass.uniforms.sIntensity.value=.05,this.composer.addPass(this.grainPass)}initEvents(){this._onResize=this.onResize.bind(this),window.addEventListener("resize",this._onResize),this._onVisibility=()=>{document.hidden?this.pause():this.resume()},document.addEventListener("visibilitychange",this._onVisibility)}onResize(){this.width=window.innerWidth,this.height=window.innerHeight,this.pixelRatio=Math.min(window.devicePixelRatio,1.5),this.camera.aspect=this.width/this.height,this.camera.updateProjectionMatrix(),this.renderer.setSize(this.width,this.height),this.renderer.setPixelRatio(this.pixelRatio),this.composer.setSize(this.width,this.height)}onNavigation(e){console.log(`[World] Navigated to: ${e}`),e==="/"||e===""?this.cubeGrid.animateTo("GRID"):this.cubeGrid.animateTo("CARD")}onScroll(e){const i=e.velocity||0;this.targetRotationZ=-i*.001}resume(){this.isPlaying||(this.isPlaying=!0,this.clock.start(),this._rafId=requestAnimationFrame(this._renderLoop.bind(this)))}pause(){this.isPlaying&&(this.isPlaying=!1,this.clock.stop(),this._rafId!==null&&(cancelAnimationFrame(this._rafId),this._rafId=null))}_renderLoop(){if(!this.isPlaying)return;const e=this.clock.getElapsedTime();this.cubeGrid&&this.cubeGrid.update(e),this.grainPass&&(this.grainPass.uniforms.uTime.value=e),this.targetRotationZ!==void 0&&(this.camera.rotation.z+=(this.targetRotationZ-this.camera.rotation.z)*.1),this.composer.render(),this._rafId=requestAnimationFrame(this._renderLoop.bind(this))}render(){this.resume()}dispose(){this.pause(),this._onResize&&window.removeEventListener("resize",this._onResize),this._onVisibility&&document.removeEventListener("visibilitychange",this._onVisibility),this.renderer.dispose()}}C.registerPlugin(W);const O=document.getElementById("preload-manifest");let N=[];if(O?.textContent)try{N=JSON.parse(O.textContent)}catch(n){console.warn("[loader] Unable to parse manifest",n)}B({assets:N,minDuration:1400});ie();H();let d;const be=()=>{if(d)return;const n=new ae({duration:1.2,smooth:!0,direction:"vertical",gestureDirection:"vertical",smoothTouch:!1,touchMultiplier:2});d=n,n.on("scroll",i=>{W.update(),window.webglInstance&&window.webglInstance.onScroll(i)});function e(i){n.raf(i),requestAnimationFrame(e)}requestAnimationFrame(e),C.ticker.lagSmoothing(0)};let f,E=null,U=.5,k=.5;const q=()=>{const n=document.documentElement,e=document.querySelector("[data-interactive-bg]");if(e){if(!f){const i=()=>{n.style.setProperty("--cursor-xp",`${U}`),n.style.setProperty("--cursor-yp",`${k}`),E=null};f=(a,u)=>{U=a/window.innerWidth,k=u/window.innerHeight,E===null&&(E=requestAnimationFrame(i))};const t=a=>f(a.clientX,a.clientY);window.addEventListener("pointermove",t,{passive:!0}),window.addEventListener("pointerleave",()=>f(window.innerWidth/2,window.innerHeight/2)),window.addEventListener("resize",()=>f(window.innerWidth/2,window.innerHeight/2))}f(window.innerWidth/2,window.innerHeight/2),e.classList.add("interactive-bg--ready")}};let z,G=!1;const V=()=>{G||(G=!0,z=new ye,z.resume(),be(),q())};window.__PRIM3_LOADER_READY?(V(),F(340)):window.addEventListener("site-loader:start",()=>{V(),F(340)},{once:!0});document.addEventListener("astro:page-load",()=>{H(),q(),d&&d.resize&&d.resize();const n=window.webglInstance||z;n&&n.onNavigation(window.location.pathname)});document.addEventListener("astro:after-swap",()=>{d&&d.resize&&d.resize()});

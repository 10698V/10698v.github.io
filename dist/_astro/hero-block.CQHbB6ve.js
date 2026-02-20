import{W as $e,d as Be,A as et,b as tt,P as ot,T as at,e as lt,B as rt,f as X,a as ae,V as k,S as nt,N as st,I as it,D as ct,O as Ie,g as L,h as ut,H as mt,i as pt,L as He,j as dt,M as U,k as ft,l as ht,m as vt,Q as gt}from"./spa-router.3jzHxz5n.js";import{R as yt,U as xt,E as bt}from"./UnrealBloomPass.D6T5-zMz.js";let s=null,d=null,b=null,p=null,B=null,pe=null,h=null,r=null,W=!0,O=null,K=!1;const de=[];let fe=!1,he=null,ve=null,y=null,Ae=-3.5,le=null,ge="/logo.png",F=28,G=18,E=12,T=6.5,ye=8.2;const wt=.15,t={active:!1,phase:"idle",elapsed:0,inflateDuration:.5,explodeDuration:.9,resolve:null,callbacks:{},tiles:[],currentAmount:0,reassemblyCallback:null,reassemblyTriggered:!1},f={active:!1,elapsed:0,duration:1.35,from:1,to:0},v={active:!1,progress:0,elapsed:0,duration:1.4,targetRects:[],resolve:null},g=.38,Z=e=>Math.min(1,Math.max(0,e)),Mt=(e,o,l)=>{const a=Math.max(0,Math.min(1,(l-e)/(o-e)));return a*a*(3-2*a)},Pt=e=>1-Math.pow(1-e,3),J=e=>e<.5?4*e*e*e:1-Math.pow(-2*e+2,3)/2,St=e=>1+2.70158*Math.pow(e-1,3)+1.70158*Math.pow(e-1,2),Re=new L,Ee=new gt,Ct=new L(0,0,1),R=new Ie;let xe=performance.now(),De=.27;const re=new k;function be(e){if(typeof document>"u"||!s)return;const o=s.__hero3d??null;document.dispatchEvent(new CustomEvent(e,{detail:{canvas:s,api:o}}))}const Tt=`
// Hero Vertex Shader - Force Update 2
attribute vec2 aTile;

uniform vec2  uTileScale;
uniform vec2  uSpan;
uniform vec2  uMouse;
uniform float uAmp;
uniform float uSigma;
uniform float uScatterAmp;
uniform float uTime;
uniform float uHover;
uniform float uSphereDepth;
uniform vec2  uPointerDrift;
uniform vec2  uPointerTilt;

varying vec2  vUvSample;
varying float vLift;
varying vec3  vNormal;
varying vec3  vWorldPos;
varying vec2  vTileXY;
varying float vEdge;
varying float vRand;
varying float vAssemble;
varying vec3  vSphereDir;
varying float vSphereInfluence;
varying vec3  vTargetColor;

attribute vec3 aTargetColor;
attribute vec3 aReassemblyPos;
uniform float uColorMix;
uniform float uReassemblyMix;
uniform float uMorphProgress;

float hash21(vec2 p){
  p = fract(p*vec2(123.34, 345.45));
  p += dot(p, p+34.345);
  return fract(p.x*p.y);
}

mat3 rotateX(float a){
  float c = cos(a);
  float s = sin(a);
  return mat3(
    1.0, 0.0, 0.0,
    0.0,    c,   -s,
    0.0,    s,    c
  );
}

mat3 rotateY(float a){
  float c = cos(a);
  float s = sin(a);
  return mat3(
      c, 0.0,   s,
    0.0, 1.0, 0.0,
     -s, 0.0,   c
  );
}

mat3 rotateZ(float a){
  float c = cos(a);
  float s = sin(a);
  return mat3(
      c,  -s, 0.0,
      s,   c, 0.0,
    0.0, 0.0, 1.0
  );
}

void main() {
  vec2 uvTile = uv * uTileScale + aTile * uTileScale;
  vUvSample = uvTile;

  vec2 tileCenterN = (aTile + 0.5) * uTileScale - vec2(0.5);
  vec2 tileCenterW = tileCenterN * uSpan;

  vEdge = smoothstep(0.28, 0.72, length(tileCenterN) * 1.6);

  float r1 = hash21(aTile);
  float r2 = hash21(aTile + 13.7);

  vec2 jitter = (vec2(r1, r2) - 0.5) * uScatterAmp;
  jitter *= mix(0.4, 1.0, vEdge);

  vec3 localPos = position;
  vec3 localNormal = normal;

  float ring = smoothstep(0.0, 0.75, length(tileCenterN));
  float baseLift = ring * 0.08;
  float distCenter = length(tileCenterN);
  float centerEase = smoothstep(0.12, 0.7, distCenter);

  float hoverAmount = clamp(uHover, 0.0, 1.0);
  float hoverInfluence = smoothstep(0.02, 0.45, hoverAmount);

  float emblemMaskX = smoothstep(0.55, 0.18, abs((tileCenterW).x) / (uSpan.x * 0.5));
  float emblemMaskY = smoothstep(-uSpan.y * 0.05, -uSpan.y * 0.45, (tileCenterW).y);
  float emblemZone = clamp(emblemMaskX * emblemMaskY, 0.0, 1.0);

  vec2 finalXYLoose = tileCenterW + jitter;
  vec2 pointerDelta = finalXYLoose - uMouse;
  float pointerDistNorm =
    length(pointerDelta) / max(0.001, max(uSpan.x, uSpan.y));
  float stick = hoverInfluence * exp(-pointerDistNorm * pointerDistNorm * 18.0);
  stick *= (1.0 - emblemZone);
  vec2 jitterApplied = mix(jitter, vec2(0.0), stick);
  vec2 finalXY = tileCenterW + jitterApplied;
  vec3 sphereCenter = vec3(uMouse, -uSphereDepth);
  vec3 planePoint = vec3(finalXY, 0.0);
  vec3 toSphere = sphereCenter - planePoint;

  float idleMotion = mix(0.05, 0.22, centerEase);
  float motionMask = max(idleMotion, hoverInfluence) * (1.0 - emblemZone);

  float sphereRadius = uSigma * 2.4;
  float rawSphere = max(0.0, 1.0 - smoothstep(sphereRadius, sphereRadius * 1.35, length(toSphere)));
  float interactive = pow(rawSphere, 1.08) * hoverInfluence * 0.35;
  float ambient = rawSphere * 0.02;
  float bottomBias = smoothstep(-uSpan.y * 1.05, -uSpan.y * 0.05, finalXY.y);
  float topBias = smoothstep(uSpan.y * 0.15, uSpan.y * 0.65, finalXY.y);
  float restingSphere = ambient + bottomBias * 0.14 + centerEase * 0.015;
  float activeSphere = ambient + interactive + bottomBias * 0.32 + topBias * 0.06;
  float sphere = mix(restingSphere, activeSphere, hoverInfluence);
  float pointerBottomBoost = smoothstep(-uSpan.y * 0.85, -uSpan.y * 0.1, uPointerDrift.y);
  sphere += pointerBottomBoost * bottomBias * 0.6;
  sphere = min(sphere, 1.05);

  vec3 dirXY = normalize(vec3(uMouse - finalXY, 0.4));
  float tiltAmount = mix(0.18, 0.4, motionMask);
  float tiltX = dirXY.y * sphere * tiltAmount;
  float tiltY = -dirXY.x * sphere * tiltAmount;
  float tiltInfluence = mix(1.0, 0.55, vEdge);
  float globalTiltX = uPointerTilt.y * mix(0.12, 0.35, motionMask) * tiltInfluence;
  float globalTiltY = -uPointerTilt.x * mix(0.12, 0.35, motionMask) * tiltInfluence;
  float twist = uPointerTilt.x * mix(0.05, 0.2, motionMask) * (1.0 - vEdge * 0.6);
  mat3 globalTilt = rotateZ(twist) * rotateY(globalTiltY) * rotateX(globalTiltX);
  localPos = globalTilt * localPos;
  localNormal = globalTilt * localNormal;

  mat3 bendRot = rotateY(tiltY) * rotateX(tiltX);
  localPos = bendRot * localPos;
  localNormal = bendRot * localNormal;

  float reassembly = smoothstep(0.0, 1.0, uReassemblyMix);

  // Kill rotations when reassembling
  localPos = mix(localPos, position, reassembly);
  localNormal = mix(localNormal, normal, reassembly);

  float lift = uAmp * sphere * (0.12 + 0.25 * motionMask);
  lift += 0.01 * sin(uTime * 0.9 + (aTile.x + aTile.y) * 0.37);
  lift += 0.006 * sin(uTime * 3.1 + r1 * 10.0);

  float edgeFlow = vEdge * 0.25 * sin(uTime * (0.6 + r1*1.4) + r2*20.0);
  float wobbleScale = mix(0.38, 0.04, smoothstep(0.0, 0.65, distCenter));
  float wobble = sin(uTime * (0.8 + r1) + r2 * 25.0) * wobbleScale * (0.35 + 0.65 * motionMask);

  // Kill noise when reassembling
  lift *= (1.0 - reassembly);
  edgeFlow *= (1.0 - reassembly);
  wobble *= (1.0 - reassembly);
  jitterApplied *= (1.0 - reassembly);

  vec4 wp = instanceMatrix * vec4(localPos, 1.0);
  vec2 drift = uPointerDrift
    * mix(vec2(0.45, 0.36), vec2(0.2, 0.15), vEdge)
    * motionMask
    * (1.0 - stick * 0.85);
  
  drift *= (1.0 - reassembly);

  wp.x += jitterApplied.x + drift.x;
  wp.y += jitterApplied.y + drift.y;
  vec2 outward = normalize(finalXY + 1e-4);
  float edgeSpread =
    pow(vEdge, 1.6) * mix(0.22, 0.45, motionMask) * (1.0 - stick);
  wp.x += outward.x * edgeSpread;
  wp.y += outward.y * edgeSpread;
  wp.z += baseLift + lift + edgeFlow + wobble;

  // Morph Pulse & Digital Dissolve
  // Flatten Z to 0 as we progress
  float zFlatten = 1.0 - uMorphProgress;
  
  // Expand XY to fill gaps (make it look like a solid card)
  float xyExpand = 1.0 + uMorphProgress * 0.15;
  
  // Add some digital noise distortion
  float noise = hash21(aTile + uTime * 0.1);
  float distort = (noise - 0.5) * uMorphProgress * 0.8;
  
  vec3 morphedPos = wp.xyz;
  morphedPos.x *= xyExpand;
  morphedPos.y *= xyExpand;
  morphedPos.z *= zFlatten; // Flatten to plane
  
  morphedPos.x += distort;
  morphedPos.y -= distort;
  
  wp.xyz = mix(wp.xyz, morphedPos, uMorphProgress);

  // Final mix to target position
  // aReassemblyPos is the target center. localPos is the vertex offset.
  // We want to land exactly at aReassemblyPos + localPos
  if (uReassemblyMix > 0.0) {
     wp.xyz = mix(wp.xyz, aReassemblyPos + localPos, reassembly);
  }

  vLift    = lift;
  vTileXY  = finalXY;
  vec4 worldPos = modelMatrix * wp;
  vWorldPos= worldPos.xyz;
  vNormal  = normalMatrix * localNormal;
  vRand    = r1;
  vSphereDir = sphereCenter - worldPos.xyz;
  vSphereInfluence = sphere;
  vAssemble = sphere;
  vTargetColor = aTargetColor;

  gl_Position = projectionMatrix * modelViewMatrix * wp;
}
`,kt=`
precision highp float;

uniform sampler2D uTexture;
uniform vec3  uTint;
uniform float uBaseOpacity;
uniform vec3  uFogColor;
uniform vec2  uMouse;
uniform float uCoreRadius;
uniform float uRevealRadius;
uniform float uFrost;
uniform vec2  uTileScale;
uniform float uAlphaFloor;
uniform float uEdgeHideEdge;
uniform float uEdgeHideProb;

varying vec2  vUvSample;
varying float vLift;
varying vec3  vNormal;
varying vec3  vWorldPos;
varying vec2  vTileXY;
varying float vEdge;
varying float vRand;
varying float vAssemble;
varying vec3  vSphereDir;
varying float vSphereInfluence;
varying vec3  vTargetColor;
uniform float uColorMix;
uniform float uMorphProgress;
uniform float uTime;

vec3 frostSample(sampler2D tex, vec2 uv, vec2 dir, float amt){
  vec2 stepv = dir * amt;
  vec3 c = texture2D(tex, uv).rgb * 0.40;
  c += texture2D(tex, uv + stepv).rgb * 0.22;
  c += texture2D(tex, uv - stepv).rgb * 0.22;
  c += texture2D(tex, uv + 2.0*stepv).rgb * 0.08;
  c += texture2D(tex, uv - 2.0*stepv).rgb * 0.08;
  return c;
}

vec3 formLight(vec3 base, vec3 N, vec3 V, vec3 tint) {
  vec3 L = normalize(vec3(-0.35, 0.6, 1.0));
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 24.0);
  float rim  = pow(1.0 - max(dot(N, V), 0.0), 1.8);
  return base * (0.5 + 0.4*diff) + tint * (0.12*spec + 0.18*rim);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);

  float frontF = smoothstep(0.25, 0.85, abs(N.z));

  float blurAmt = (0.55 + 0.45*(1.0 - frontF)) * mix(1.1, 0.22, clamp(vAssemble,0.0,1.0));
  vec2  dir   = normalize(vec2(0.7, 0.3));
  vec2  stepv = dir * uTileScale * blurAmt;
  vec3  img   = frostSample(uTexture, vUvSample, stepv, 1.0);

  float lum = dot(img, vec3(0.299, 0.587, 0.114));
  img = mix(vec3(lum), img, 0.7);

  vec3 sideCol = mix(vec3(0.18,0.18,0.22), uTint*0.25, 0.6);
  vec3 baseCol = mix(sideCol, img, frontF);

  baseCol = baseCol * 1.08 + vec3(0.06);

  float liftN = clamp(vLift * 1.35, 0.0, 1.0);
  baseCol += vec3(0.08, 0.12, 0.22) * liftN;
  baseCol = mix(baseCol, baseCol + uTint * (0.12 + 0.32*liftN), 0.6);
  baseCol = mix(baseCol, baseCol + vec3(0.12, 0.1, 0.2), 0.35);

  vec3 shaded = formLight(baseCol, N, V, uTint);
  vec3 sphereDir = normalize(vSphereDir);
  float backFacing = clamp(-dot(N, sphereDir), 0.0, 1.0);
  float sphereLight = pow(backFacing, 1.4) * vSphereInfluence * 0.05;
  vec3 glowColor = mix(vec3(0.02, 0.05, 0.12), uTint, 0.22);
  vec3 sphereGlow = glowColor * sphereLight;
  vec3 translucency = glowColor * pow(vSphereInfluence, 1.1) * 0.08;
  shaded += sphereGlow + translucency;
  vec3 glowAcc = vec3(0.05, 0.09, 0.16);
  shaded = mix(glowAcc + uTint * 0.03, shaded, 0.94);

  float depth = length(cameraPosition - vWorldPos);
  float fog   = smoothstep(7.0, 18.0, depth);
  shaded = mix(shaded, uFogColor, fog * 0.3);
  shaded = mix(shaded, shaded + vec3(0.08, 0.1, 0.18), 0.35);

  // --- COLOR MORPHING ---
  // Mix in the target team color based on uColorMix
  // Keep it translucent and glassy
  vec3 targetGlow = vTargetColor * 1.2; 
  // Mix gently so we preserve the "glass" lighting (specular, rim)
  shaded = mix(shaded, targetGlow, uColorMix * 0.65);
  
  float dCenter = length(vTileXY);
  float coreBoost  = 1.0 - smoothstep(uCoreRadius, uCoreRadius + 0.01, dCenter);

  float alpha = uBaseOpacity * 0.85;
  alpha *= mix(1.0, 0.55, vEdge);
  alpha *= mix(0.70, 1.0, 1.0 - vRand*0.5);

  alpha += vAssemble * 0.5;
  alpha += 0.30*coreBoost;
  alpha += vSphereInfluence * 0.03;
  float liftBoost = clamp(liftN + vSphereInfluence, 0.0, 1.0);
  float classSeed = fract(vRand * 9.37);
  float alphaGroup;
  if (classSeed < 0.2) {
    alphaGroup = 0.2;
  } else if (classSeed < 0.4) {
    alphaGroup = 0.4;
  } else if (classSeed < 0.6) {
    alphaGroup = 0.6;
  } else if (classSeed < 0.8) {
    alphaGroup = 0.8;
  } else {
    alphaGroup = 1.0;
  }
  float centerSolid = 1.0 - smoothstep(uCoreRadius * 0.4, uCoreRadius * 0.95, dCenter);
  float translucencyMix = mix(alphaGroup, 1.0, centerSolid * 0.9 + liftBoost * 0.7);
  alpha *= translucencyMix;
  alpha += liftBoost * 0.08;
  alpha = mix(alpha, alpha + 0.30, liftN);

  // Boost alpha slightly when morphing, but keep it translucent (frosted glass)
  alpha = mix(alpha, 0.9, uColorMix * 0.4);

  // Morph Flash (Hologram Glitch)
  // Peak at 0.5 progress
  // Flashbang effect: Make it blindingly bright at the peak to hide the transition
  float morphFlash = smoothstep(0.0, 0.4, uMorphProgress) * (1.0 - smoothstep(0.6, 1.0, uMorphProgress));
  morphFlash = pow(morphFlash, 0.5); // Make it linger a bit and be brighter
  
  // Scanline effect
  float scanline = sin(vUvSample.y * 80.0 + uTime * 20.0) * 0.5 + 0.5;
  vec3 glitchColor = mix(uTint, vec3(0.8, 1.0, 0.9), scanline);
  
  // Digital dissolve color shift
  vec3 dissolveColor = mix(shaded, glitchColor, morphFlash * 0.9);
  dissolveColor += vec3(1.0, 1.0, 1.0) * morphFlash * 1.5; // Blinding white hot core
  
  shaded = mix(shaded, dissolveColor, morphFlash);
  alpha = mix(alpha, 1.0, morphFlash);
  
  // Force full opacity at end of morph to match card
  alpha = mix(alpha, 1.0, smoothstep(0.8, 1.0, uMorphProgress));

  float atExtremeEdge = step(uEdgeHideEdge, vEdge);
  float mayHide = step(1.0 - uEdgeHideProb, vRand) * atExtremeEdge;
  float keepBecauseBoost = step(0.01, max(coreBoost, vAssemble));
  if (mayHide > 0.5 && keepBecauseBoost < 0.5) discard;

  alpha = max(alpha, uAlphaFloor * 0.4);
  alpha *= 0.85;
  alpha = clamp(alpha, 0.0, 1.0);

  gl_FragColor = vec4(shaded, alpha);
}
`,ne=new ft,se=new k,Bt=new vt(new L(0,0,1),0),ie=new ht,q=new k(0,0),Le=new k(0,0);let $=0;const Ne=1.4,ze=3.6;let Ye=2.2;function Ht(){if(!K)for(K=!0;de.length;)de.shift()?.()}function we(){return K&&h&&t.tiles.length?Promise.resolve():(console.log("[HeroBlock] whenReady waiting...",{ready:K,mesh:!!h,tiles:t.tiles.length}),new Promise(e=>de.push(e)))}function Xe(){console.log("[HeroBlock] syncCanvas called");const e=document.getElementById("hero-transition-canvas")||window.__persistedHeroCanvas||document.getElementById("hero3d");return e?(s&&e!==s&&O?.(),s=e,ge=s.dataset.image||"/logo.png",F=parseInt(s.dataset.cols||"28",10),G=parseInt(s.dataset.rows||"18",10),E=parseFloat(s.dataset.width||"12"),T=parseFloat(s.dataset.height||"6.5"),!0):(s=null,!1)}function N(){if(!s)return{width:innerWidth,height:innerHeight,left:0,top:0};const e=s.getBoundingClientRect(),o=Math.max(1,e.width||innerWidth),l=Math.max(1,e.height||innerHeight);return{width:o,height:l,left:e.left||0,top:e.top||0}}let j=!1;function I(){const{width:e,height:o}=N();if(d&&d.setSize(e,o,!1),p&&(p.aspect=e/o,p.updateProjectionMatrix(),j||At()),B?.setSize(e,o),pe?.setSize(e,o),s&&e<600&&window.innerWidth>800&&(s.style.width="100vw",s.style.height="100vh",N().width>e)){I();return}ve&&(Ae=-T*.5-1.5,ve.position.y=2*Ae)}function At(){if(!p)return;const e=.8,o=E+e,l=T+e,a=U.degToRad(p.fov),n=Math.tan(a/2),c=typeof window<"u"?window.innerWidth/window.innerHeight:1,u=typeof screen<"u"?screen.availWidth/screen.availHeight:c,i=Math.min(1,Math.min(c,u)),m=l/(2*Math.max(n,1e-4)),M=2*Math.atan(n*i),P=Math.tan(M/2),w=o/(2*Math.max(P,1e-4));ye=Math.max(m,w)+2.2,p.position.z=ye}function ce(e){const o=N(),l=e?.clientX??o.left+o.width/2,a=e?.clientY??o.top+o.height/2,n=(l-o.left)/o.width*2-1,c=(a-o.top)/o.height*2-1;if(se.x=n,se.y=-c,!p)return;ne.setFromCamera(se,p);const u=ne.ray.origin.clone(),i=u.clone().add(ne.ray.direction.clone().multiplyScalar(100));ie.start.copy(u),ie.end.copy(i);const m=new L;Bt.intersectLine(ie,m),Le.set(m.x,m.y);const M=U.clamp((a-o.top)/Math.max(o.height,1),0,1);Ye=U.lerp(Ne,ze,M)}function Rt(){if(!s)return;O?.();const e=M=>ce(M),o=()=>$=1,l=()=>{$=0;const{left:M,top:P,width:w,height:H}=N();ce({clientX:M+w/2,clientY:P+H/2})},a=()=>Et();s.addEventListener("mousemove",e,{passive:!0}),s.addEventListener("mouseenter",o),s.addEventListener("mouseleave",l);const n=new ResizeObserver(()=>{a()});n.observe(s),O=()=>{s?.removeEventListener("mousemove",e),s?.removeEventListener("mouseenter",o),s?.removeEventListener("mouseleave",l),n.disconnect(),O=null};const{left:c,top:u,width:i,height:m}=N();ce({clientX:c+i/2,clientY:u+m/2})}function Et(){I()}function Dt(e,o){const l=Math.sin(e*12.9898+o*78.233)*43758.5453;return l-Math.floor(l)}let ue=0;function Ft(e){const o=++ue;if(console.log("[HeroBlock] init called",{id:o,opts:e,canvas:s,renderer:!!d}),e?.canvas)s=e.canvas;else if(!Xe()||!s)return;if((E<1||T<1)&&(console.warn("[HeroBlock] Invalid dimensions detected, resetting to defaults"),E=12,T=6.5),j=!1,d)if(d.domElement!==s)console.warn("[HeroBlock] Renderer exists but canvas mismatch. Disposing old renderer."),d.dispose(),d=null;else{console.log("[HeroBlock] Reusing existing renderer"),W=!1,I(),Q();return}W=!1,t.tiles=[],d=new $e({canvas:s,antialias:!0,alpha:!0,powerPreference:"high-performance"}),d.setPixelRatio(Math.min(devicePixelRatio,2)),d.setClearColor(0,0),d.outputColorSpace=Be,d.toneMapping=et,d.toneMappingExposure=.46,b=new tt;const{width:l,height:a}=N();p=new ot(62,l/a,.1,100),p.position.set(0,wt,ye),I(),Q(),I(),Q(),le||(le=new Promise(n=>{console.log("[HeroBlock] Loading texture:",ge),new at().load(ge,c=>{console.log("[HeroBlock] Texture loaded"),n(c)},void 0,c=>{console.error("[HeroBlock] Texture load failed:",c),n(new lt)})})),le.then(n=>{if(o!==ue){console.log("[HeroBlock] Init aborted: Stale ID",{myId:o,currentInitId:ue});return}n.colorSpace=Be;const c=.42,u=.8,i=E/F,m=T/G,P=new rt(i*u,m*u,c).toNonIndexed(),w=F*G,H=new Float32Array(w*2),V=new Float32Array(w*3),Oe=new X("#00f2ff"),Ue=new X("#ff00ff"),je=new X("#ffd700"),Ve=new X("#00ff80");let Me=0,ee=0;const Pe=new Uint8Array(w);for(let S=0;S<G;S++)for(let C=0;C<F;C++){H[Me++]=C,H[Me++]=S;const z=Math.random();let A,Y=0;z<.25?(A=Oe,Y=0):z<.5?(A=Ue,Y=1):z<.75?(A=je,Y=2):(A=Ve,Y=3),Pe[S*F+C]=Y;const _=(Math.random()-.5)*.15;V[ee++]=Math.max(0,Math.min(1,A.r+_)),V[ee++]=Math.max(0,Math.min(1,A.g+_)),V[ee++]=Math.max(0,Math.min(1,A.b+_))}P.setAttribute("aTile",new ae(H,2)),P.setAttribute("aTargetColor",new ae(V,3));const Ze=new Float32Array(w*3);P.setAttribute("aReassemblyPos",new ae(Ze,3)),r={uTexture:{value:n},uTileScale:{value:new k(1/F,1/G)},uSpan:{value:new k(E,T)},uMouse:{value:new k(0,0)},uAmp:{value:.8},uSigma:{value:.95},uScatterAmp:{value:Math.min(i,m)*.35},uTime:{value:0},uTint:{value:new X(10309106)},uBaseOpacity:{value:.3},uFogColor:{value:new X(856096)},uCoreRadius:{value:Math.min(E,T)*.12},uRevealRadius:{value:Math.min(E,T)*.055},uFrost:{value:.95},uAlphaFloor:{value:.025},uEdgeHideEdge:{value:.82},uEdgeHideProb:{value:.35},uHover:{value:0},uSphereDepth:{value:(Ne+ze)*.5},uPointerDrift:{value:new k(0,0)},uPointerTilt:{value:new k(0,0)},uColorMix:{value:0},uReassemblyMix:{value:0},uMorphProgress:{value:0}};const qe=new nt({uniforms:r,vertexShader:Tt,fragmentShader:kt,transparent:!0,depthTest:!0,depthWrite:!1,blending:st});h=new it(P,qe,w),h.instanceMatrix.setUsage(ct),t.tiles=[];const D=new Ie;for(let S=0;S<G;S++)for(let C=0;C<F;C++){const z=S*F+C,A=(C+.5)*i-E/2,Y=(S+.5)*m-T/2;D.position.set(A,Y,0),D.rotation.set(0,0,0),D.scale.set(1,1,1),D.updateMatrix(),h.setMatrixAt(z,D.matrix);const _=D.position.clone(),Ke=D.quaternion.clone(),Te=D.scale.clone(),ke=Dt(C,S)*Math.PI*2,oe=new L(Math.cos(ke),Math.sin(ke),0).normalize(),Je=new L(-oe.y,oe.x,0);t.tiles.push({idx:z,colorType:Pe[z],basePos:_,pos:_.clone(),vel:new L,baseQuat:Ke,baseScale:Te,scale:Te.clone(),rot:0,rotVel:0,travelDir:oe,swayDir:Je,swayMag:(Math.random()*.6+.2)*(Math.random()>.5?1:-1),inflateDist:.55+Math.random()*.65,explodeDist:2.1+Math.random()*2.8,lift:.5+Math.random()*1.3,spin:(Math.random()-.5)*2.2,delay:Math.random()*.18})}h.rotation.x=-.22,h.rotation.y=.1,b?.add(h),Ht(),be("hero:block-ready");const te=new yt(b,p);te.clearColor=new X(0,0,0),te.clearAlpha=0;const{width:Se,height:Ce}=N();pe=new xt(new k(Se,Ce),.42,.72,.46);const Qe=new ut(Se,Ce,{minFilter:He,magFilter:He,format:pt,type:mt,stencilBuffer:!1});B=new bt(d,Qe),B.addPass(te),B.addPass(pe),I(),Rt(),I(),console.log("[HeroBlock] Pre-compiling shaders..."),d.compile(b,p),fe=!0,console.log("[HeroBlock] Shader compilation complete"),B&&b&&p?B.render():d&&b&&p&&d.render(b,p),console.log("[HeroBlock] GPU warmup complete"),he=Promise.resolve(),We(),_e(e?.startExploded)})}function We(e=0){if(!W){requestAnimationFrame(We);try{const o=performance.now();let l=(o-xe)/1e3||0;if(t.active&&t.elapsed<.15?(l=Math.min(.016,l),t.elapsed<.05&&console.log("[HeroBlock] First-frame dt clamp:",l.toFixed(4),"elapsed:",t.elapsed.toFixed(4))):l=Math.min(.05,l),xe=o,Math.floor(e/1e3)%2===0&&Math.floor(e/16)%60,q.lerp(Le,.03),r){if(r.uTime.value=e/1e3,r.uMouse.value.lerp(q,.06),r.uHover.value+=($-r.uHover.value)*.03,r.uSphereDepth&&(r.uSphereDepth.value+=(Ye-r.uSphereDepth.value)*.08),re.set(q.x,q.y),r.uPointerDrift){const a=re.clone().multiplyScalar(.08);r.uPointerDrift.value.lerp(a,.05)}if(r.uPointerTilt){const a=re.clone().multiplyScalar(.12);r.uPointerTilt.value.lerp(a,.05)}}if(t.active){t.elapsed+=l,t.elapsed<.2&&console.log("[HeroBlock] Explosion dt:",l.toFixed(4),"elapsed:",t.elapsed.toFixed(4));let a=0;if(t.phase==="inflate"&&(a=t.elapsed/t.inflateDuration,a>=1?(console.log("[HeroBlock] Phase inflate -> explode"),t.phase="explode",t.elapsed=0,a=0,t.callbacks.onExplodeStart?.()):x(a*g)),t.phase==="explode")if(a=t.elapsed/t.explodeDuration,a>=.94&&t.reassemblyCallback&&!t.reassemblyTriggered&&(console.log("[HeroBlock] Early reassembly trigger for smooth transition"),t.reassemblyCallback(),t.reassemblyCallback=null,t.reassemblyTriggered=!0),a>=1)t.active=!1,x(1),t.currentAmount=1,t.callbacks.onComplete?.(),t.resolve&&(t.resolve(),t.resolve=null),t.reassemblyCallback&&(console.log("[HeroBlock] Fallback reassembly trigger"),t.reassemblyCallback(),t.reassemblyCallback=null),t.reassemblyTriggered=!1;else{const n=g+a*(1-g);x(n)}}else if(f.active){f.elapsed+=l;const a=Math.min(1,f.elapsed/f.duration),n=St(a),c=U.lerp(f.from,f.to,n);x(c),a>=1&&(f.active=!1,x(f.to))}if(v.active){v.elapsed+=l;const a=Math.min(1,v.elapsed/v.duration);if(v.progress=a,a<.3)x(a/.3*g);else if(a<.7){const n=(a-.3)/.4;x(g+n*(1-g))}else if(x(1),r){const n=(a-.7)/.3;r.uReassemblyMix.value=J(n),r.uColorMix.value=Math.max(r.uColorMix.value,J(n))}a>=1&&(v.active=!1,v.resolve?.(),v.resolve=null)}if(B&&b&&p?B.render():d&&b&&p&&d.render(b,p),d&&Math.floor(e/16)%60===0){const{width:a}=N();Math.abs(a-window.innerWidth)>50&&I()}y&&r&&(y.uTime.value=r.uTime.value,y.uMouse.value.copy(r.uMouse.value),y.uHover.value=r.uHover.value,y.uSphereDepth&&(y.uSphereDepth.value=r.uSphereDepth.value),y.uPointerDrift&&y.uPointerDrift.value.copy(r.uPointerDrift.value),y.uPointerTilt&&y.uPointerTilt.value.copy(r.uPointerTilt.value),y.uMorphProgress.value=r.uMorphProgress.value,y.uReassemblyMix.value=r.uReassemblyMix.value)}catch(o){console.error("[HeroBlock] animate loop error:",o)}}}function me(e,o,l,a=!1){if(h){if(o==="base")R.position.copy(e.basePos),R.quaternion.copy(e.baseQuat),R.scale.copy(e.baseScale);else{const n=o==="inflate"?J(l):Pt(l),c=o==="inflate"?e.inflateDist*n:e.inflateDist+e.explodeDist*n;Re.copy(e.travelDir).multiplyScalar(c).addScaledVector(e.swayDir,Math.sin(n*Math.PI)*e.swayMag),R.position.copy(e.basePos).add(Re);const u=o==="inflate"?n*e.lift*.6:e.lift*(.6+n*.8);R.position.z+=u;const i=o==="inflate"?n*e.spin*.5:e.spin*(.5+n*.5);Ee.setFromAxisAngle(Ct,i),R.quaternion.copy(e.baseQuat).multiply(Ee);const m=o==="inflate"?1+n*.24:Math.max(.25,1.18-n*1.1);R.scale.copy(e.baseScale).multiplyScalar(m)}R.updateMatrix(),h.setMatrixAt(e.idx,R.matrix)}}function x(e){if(!h||!t.tiles.length)return;const o=Math.min(1.1,Math.max(0,e)),l=f.active&&f.to<=f.from;if(l&&t.active){console.warn("[HeroBlock] Conflict detected in applyBalloonAmount! Aborting assembly."),f.active=!1;return}if(t.tiles.forEach(a=>{const n=1-a.delay,c=n>0?(o-a.delay)/n:o;if(c<=0){me(a,"base",0,l);return}const u=Z(c);if(u<g){const i=Z(u/g);me(a,"inflate",i,l)}else{const i=Z((u-g)/(1-g));me(a,"explode",i,l)}}),h.instanceMatrix.needsUpdate=!0,r?.uBaseOpacity){const a=U.lerp(De,De*.4,Z(o));r.uBaseOpacity.value=a}r?.uColorMix&&(r.uColorMix.value=Mt(0,.9,o)),t.currentAmount=o}function _e(e=!1){console.log("[HeroBlock] startIntroAssembly called",{startExploded:e,explosionActive:t.active}),j=!1,we().then(()=>{if(console.log("[HeroBlock] startIntroAssembly woke up",{explosionActive:t.active}),t.active){console.log("[HeroBlock] Aborting startIntroAssembly because explosion is active");return}if(t.tiles.length){if(e){x(1.1),f.active=!1;return}console.log("[HeroBlock] Starting assembly animation"),f.active=!0,f.elapsed=0,f.from=.95,f.to=0,f.duration=1.6,x(f.from)}})}function It(){console.log("[HeroBlock] disposeHero called",{disposed:W}),!W&&(W=!0,O?.(),B?.dispose(),d?.dispose(),d=null,B=null,b=null,p=null,h=null,r=null,ve=null,y=null,t.tiles=[],t.active=!1,f.active=!1,s&&(s.__hero3d&&delete s.__hero3d,(s.id==="hero-transition-canvas"||s===window.__persistedHeroCanvas)&&(s.id="",window.__persistedHeroCanvas=null)),be("hero:block-disposed"),j=!1)}function Lt(e={}){if(console.log("[HeroBlock] startBalloonPop called",{active:t.active,shaderCompiled:fe,assemblyActive:f.active}),t.active)return Promise.resolve();f.active=!1,x(0);const{inflateDuration:o=.5,explodeDuration:l=.9,onExplodeStart:a,onComplete:n}=e;return new Promise(c=>{const u=()=>{if(console.log("[HeroBlock] startBalloonPop animation starting (shaders ready)"),xe=performance.now(),t.currentAmount=0,typeof document<"u"){const m=document.querySelector(".hero-static-img");m&&(m.style.display="none")}t.active=!0,t.inflateDuration=o,t.explodeDuration=l,t.callbacks={onExplodeStart:a,onComplete:n},t.resolve=()=>{console.log("[HeroBlock] startBalloonPop resolved"),t.callbacks={},c()};const i=t.currentAmount||0;if(console.log("[HeroBlock] Smart Start Check",{current:i,inflateRatio:g}),i>.01)if(console.log("[HeroBlock] Smart Start from",i),i<g){t.phase="inflate";const m=i/g;t.elapsed=m*o,console.log("[HeroBlock] Smart Start Phase: INFLATE",{progress:m,elapsed:t.elapsed})}else{t.phase="explode";const m=(i-g)/(1-g);t.elapsed=m*l,console.log("[HeroBlock] Smart Start Phase: EXPLODE",{progress:m,elapsed:t.elapsed}),a&&a()}else console.log("[HeroBlock] Clean Start"),t.phase="inflate",t.elapsed=0,x(0);r&&(r.uMorphProgress&&(r.uMorphProgress.value=0),r.uHover&&(r.uHover.value=0)),$=0,t.tiles.length};!fe&&he?(console.log("[HeroBlock] Waiting for shader compilation before starting explosion..."),he.then(u)):u()})}function Nt(e={}){return we().then(()=>Lt(e))}function Ge(e){if(!h||!p||!e.length)return;h.count;const o=h.geometry.getAttribute("aReassemblyPos"),l=o.array,a=new L,n={driver:0,builder:0,designer:1,notebooker:2,coder:3},c={0:[],1:[],2:[],3:[]};e.forEach(u=>{const i=n[u.roleId||""]??3;c[i].push(u)}),t.tiles.forEach(u=>{const i=c[u.colorType],m=i.length?i[Math.floor(Math.random()*i.length)]:e[Math.floor(Math.random()*e.length)],M=m.x+(Math.random()-.5)*m.w,P=m.y+(Math.random()-.5)*m.h;a.set(M,P,.5),a.unproject(p),a.sub(p.position).normalize();const w=-p.position.z/a.z,H=p.position.clone().add(a.multiplyScalar(w));l[u.idx*3]=H.x,l[u.idx*3+1]=H.y,l[u.idx*3+2]=H.z}),o.needsUpdate=!0}function zt(e=1.2){return new Promise(o=>{const l=()=>{console.log("[HeroBlock] runReassembly starting",{explosionActive:t.active});const a=performance.now(),n=()=>{const c=performance.now(),u=Math.min(1,(c-a)/(e*1e3)),i=J(u);r&&(r.uReassemblyMix.value=i,r.uColorMix.value=Math.max(r.uColorMix.value,i)),u<1?requestAnimationFrame(n):o()};n()};t.active?(console.log("[HeroBlock] runReassembly waiting for explosion..."),t.reassemblyCallback=l):l()})}function Yt(e={}){return v.active?Promise.resolve():we().then(()=>(t.active=!1,f.active=!1,e.targetRects?.length&&Ge(e.targetRects),new Promise(o=>{v.duration=e.duration||1.4,v.elapsed=0,v.progress=0,v.resolve=o,x(0),r&&(r.uReassemblyMix.value=0),v.active=!0,console.log("[HeroBlock] runToCards started, duration:",v.duration)})))}function Xt(e=.6){return new Promise(o=>{const l=performance.now(),a=()=>{const n=performance.now(),c=Math.min(1,(n-l)/(e*1e3));r&&(r.uMorphProgress.value=c),c<1?requestAnimationFrame(a):o()};a()})}function Q(){s&&(s.__hero3d={getRenderer:()=>d,getScene:()=>b,getCamera:()=>p,getMesh:()=>h,getUniforms:()=>r,THREE:dt,runBalloonPop:Nt,reassemble:_e,setReassemblyTargets:Ge,runReassembly:zt,runMorph:Xt,runToCards:Yt,setCameraLocked:e=>{j=e}},be("hero:block-attached"))}function Fe(e){if(e?.canvas)s=e.canvas;else if(!Xe()||!s){It();return}!d||W?Ft(e):s.__hero3d||Q()}function Ot(e){typeof window>"u"||(document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>Fe(e),{once:!0}):Fe(e))}export{Ot as bootHero,It as disposeHero,le as heroTexturePromise};

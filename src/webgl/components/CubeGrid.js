import * as THREE from 'three';
import gsap from 'gsap';

const vertexShader = `
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
`;

const fragmentShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  
  void main() {
    vec3 light = normalize(vec3(1.0, 1.0, 1.0));
    float d = max(dot(vNormal, light), 0.0);
    vec3 color = vec3(0.1, 0.1, 0.1) + vec3(0.9) * d;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export class CubeGrid {
    constructor(scene) {
        this.scene = scene;
        this.count = 1000;
        this.mesh = null;

        this.init();
    }

    init() {
        const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uProgress: { value: 0 },
                uExplosionStrength: { value: 3.0 }
            }
        });

        this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
        this.mesh.frustumCulled = false; // Disable culling to prevent flickering

        this.generatePositions();

        this.scene.add(this.mesh);
    }

    generatePositions() {
        const gridPositions = [];
        const cardPositions = [];
        const randoms = [];

        const gridDim = 10;
        const gridSpacing = 1.5;
        const gridOffset = (gridDim * gridSpacing) / 2;

        for (let i = 0; i < this.count; i++) {
            // Grid
            const x = (i % gridDim) * gridSpacing - gridOffset;
            const y = (Math.floor(i / gridDim) % gridDim) * gridSpacing - gridOffset;
            const z = (Math.floor(i / (gridDim * gridDim))) * gridSpacing - gridOffset;
            gridPositions.push(x, y, z);

            // Card
            const cardCols = 40;
            const cardSpacing = 0.6;
            const cx = (i % cardCols) * cardSpacing - (cardCols * cardSpacing / 2);
            const cy = (Math.floor(i / cardCols)) * cardSpacing - (25 * cardSpacing / 2);
            const cz = 0;
            cardPositions.push(cx, cy, cz);

            randoms.push(Math.random());

            const dummy = new THREE.Object3D();
            dummy.position.set(0, 0, 0);
            dummy.updateMatrix();
            this.mesh.setMatrixAt(i, dummy.matrix);
        }

        this.mesh.instanceMatrix.needsUpdate = true;

        this.mesh.geometry.setAttribute('aGridPosition', new THREE.InstancedBufferAttribute(new Float32Array(gridPositions), 3));
        this.mesh.geometry.setAttribute('aCardPosition', new THREE.InstancedBufferAttribute(new Float32Array(cardPositions), 3));
        this.mesh.geometry.setAttribute('aRandom', new THREE.InstancedBufferAttribute(new Float32Array(randoms), 1));
    }

    update(time) {
        if (this.mesh && this.mesh.material.uniforms) {
            this.mesh.material.uniforms.uTime.value = time;
        }
    }

    animateTo(state) {
        const target = state === 'CARD' ? 1 : 0;

        if (this.mesh && this.mesh.material.uniforms) {
            gsap.to(this.mesh.material.uniforms.uProgress, {
                value: target,
                duration: 2.0,
                ease: 'power3.inOut'
            });
        }
    }
}

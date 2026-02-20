import * as THREE from 'three';
import { CubeGrid } from './components/CubeGrid';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { registerRafLoop } from '../lib/raf-governor.ts';
import { FrameBudget } from '../lib/frame-budget.ts';

const FilmGrainShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "uTime": { value: 0 },
        "nIntensity": { value: 0.5 },
        "sIntensity": { value: 0.05 },
        "sCount": { value: 4096 },
        "grayscale": { value: 0 }
    },
    vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
    fragmentShader: `
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
  `
};

export class World {
    constructor() {
        if (window.webglInstance) {
            return window.webglInstance;
        }

        this.container = document.querySelector('#webgl-overlay');
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.qualityTier = 0;
        this.dprCaps = [1.5, 1.25, 1.0];
        this.frameBudget = new FrameBudget({
            sampleSize: 90,
            downshiftThresholdMs: 22,
            restoreThresholdMs: 16.5,
            cooldownMs: 1200,
            maxTier: 2,
        });
        this.pixelRatio = Math.min(window.devicePixelRatio, this.dprCaps[this.qualityTier] || 1.5);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 100);
        this.camera.position.z = 15;

        this.renderer = new THREE.WebGLRenderer({
            alpha: false,
            antialias: false,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true
        });
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(this.width, this.height);
        this.renderer.setClearColor(0x020513, 1);
        this.renderer.toneMapping = THREE.ReinhardToneMapping;

        if (this.container) {
            this.container.appendChild(this.renderer.domElement);
        }

        this.isPlaying = false; // Start paused — caller starts via resume()
        this.elapsedTime = 0;
        this.loopController = registerRafLoop('world-render', {
            fps: 45,
            autoPauseOnHidden: true,
            onTick: ({ deltaMs, now }) => this._renderLoop(deltaMs, now),
        });

        this.cubeGrid = new CubeGrid(this.scene);

        this.initPostProcessing();
        this.initEvents();
        // Do NOT call render() here — start paused

        window.webglInstance = this;
    }

    initPostProcessing() {
        this.composer = new EffectComposer(this.renderer);

        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(this.width, this.height),
            1.5, 0.4, 0.85
        );
        bloomPass.threshold = 0.2;
        bloomPass.strength = 0.8;
        bloomPass.radius = 0.5;
        this.composer.addPass(bloomPass);

        this.grainPass = new ShaderPass(FilmGrainShader);
        this.grainPass.uniforms.nIntensity.value = 0.3;
        this.grainPass.uniforms.sIntensity.value = 0.05;
        this.composer.addPass(this.grainPass);
    }

    initEvents() {
        this._onResize = this.onResize.bind(this);
        window.addEventListener('resize', this._onResize);

        // Pause/resume on tab visibility
        this._onVisibility = () => {
            if (document.hidden) {
                this.pause();
            } else {
                this.resume();
            }
        };
        document.addEventListener('visibilitychange', this._onVisibility);
    }

    onResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.applyPixelRatio();

        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(this.width, this.height);
        this.composer.setSize(this.width, this.height);
    }

    applyPixelRatio() {
        const cap = this.dprCaps[this.qualityTier] ?? 1.0;
        const next = Math.min(window.devicePixelRatio || 1, cap);
        if (Math.abs(next - this.pixelRatio) < 0.001) return;
        this.pixelRatio = next;
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(this.width, this.height, false);
        this.composer.setSize(this.width, this.height);
    }

    onNavigation(route) {
        if (route === '/' || route === '') {
            this.cubeGrid.animateTo('GRID');
            this.loopController.setFps(45);
        } else {
            this.cubeGrid.animateTo('CARD');
            this.loopController.setFps(30);
        }
    }

    onScroll(e) {
        const velocity = e.velocity || 0;
        this.targetRotationZ = -velocity * 0.001;
    }

    /** Start / resume the render loop */
    resume() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.loopController.start();
    }

    /** Pause the render loop */
    pause() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        this.loopController.stop();
    }

    _renderLoop(deltaMs) {
        if (!this.isPlaying) return;

        const clampedMs = Math.min(250, Math.max(1, deltaMs));
        this.elapsedTime += clampedMs / 1000;
        const time = this.elapsedTime;
        const nextTier = this.frameBudget.push(clampedMs);
        if (nextTier !== this.qualityTier) {
            this.qualityTier = nextTier;
            this.applyPixelRatio();
        }

        if (this.cubeGrid) {
            this.cubeGrid.update(time);
        }

        if (this.grainPass) {
            this.grainPass.uniforms.uTime.value = time;
        }

        if (this.targetRotationZ !== undefined) {
            this.camera.rotation.z += (this.targetRotationZ - this.camera.rotation.z) * 0.1;
        }

        this.composer.render();
    }

    // Keep old render() as alias for resume() for compat
    render() {
        this.resume();
    }

    dispose() {
        this.pause();
        this.loopController.destroy();
        if (this._onResize) window.removeEventListener('resize', this._onResize);
        if (this._onVisibility) document.removeEventListener('visibilitychange', this._onVisibility);
        this.renderer.dispose();
    }
}

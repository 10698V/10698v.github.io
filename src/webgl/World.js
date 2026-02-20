import * as THREE from 'three';
import { CubeGrid } from './components/CubeGrid';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

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
        this.pixelRatio = Math.min(window.devicePixelRatio, 1.5); // Clamped harder for perf

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

        this.clock = new THREE.Clock();
        this.isPlaying = false; // Start paused — caller starts via resume()
        this._rafId = null;

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
        this.pixelRatio = Math.min(window.devicePixelRatio, 1.5);

        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.composer.setSize(this.width, this.height);
    }

    onNavigation(route) {
        console.log(`[World] Navigated to: ${route}`);
        if (route === '/' || route === '') {
            this.cubeGrid.animateTo('GRID');
        } else {
            this.cubeGrid.animateTo('CARD');
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
        this.clock.start();
        this._rafId = requestAnimationFrame(this._renderLoop.bind(this));
    }

    /** Pause the render loop */
    pause() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        this.clock.stop();
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    _renderLoop() {
        if (!this.isPlaying) return;

        const time = this.clock.getElapsedTime();

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

        this._rafId = requestAnimationFrame(this._renderLoop.bind(this));
    }

    // Keep old render() as alias for resume() for compat
    render() {
        this.resume();
    }

    dispose() {
        this.pause();
        if (this._onResize) window.removeEventListener('resize', this._onResize);
        if (this._onVisibility) document.removeEventListener('visibilitychange', this._onVisibility);
        this.renderer.dispose();
    }
}

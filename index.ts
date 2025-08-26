import { WebGPUApp } from './webgpu';
const outW: number = 160, outH: number = 90; // ASCII grid (change to taste)
const edgeBias: number = 0.35, contrast: number = 1.1, invert: number = 0;

// Main initialization function
async function initializeApp(): Promise<void> {
    // Use refactored WebGPU module
    const canvas = document.getElementById('gfx') as HTMLCanvasElement;
    const video = document.getElementById('cam') as HTMLVideoElement;
    const app = await WebGPUApp.initialize(canvas, video);
    await app.run();
    
    // Controls and shortcuts
        setupControlListeners();
        console.log("✅ Control listeners set up");
}

// Control setup
function setupControlListeners(): void {
    const controls = {
        width: document.getElementById('width') as HTMLInputElement,
        height: document.getElementById('height') as HTMLInputElement,
        contrast: document.getElementById('contrast') as HTMLInputElement,
        edgeBias: document.getElementById('edgeBias') as HTMLInputElement,
        invert: document.getElementById('invert') as HTMLInputElement,
        atlas: document.getElementById('atlas') as HTMLSelectElement
    };

    // Update display values
    controls.width.addEventListener('input', () => {
        (document.getElementById('widthValue') as HTMLSpanElement).textContent = controls.width.value;
    });
    controls.height.addEventListener('input', () => {
        (document.getElementById('heightValue') as HTMLSpanElement).textContent = controls.height.value;
    });
    controls.contrast.addEventListener('input', () => {
        (document.getElementById('contrastValue') as HTMLSpanElement).textContent = controls.contrast.value;
    });
    controls.edgeBias.addEventListener('input', () => {
        (document.getElementById('edgeBiasValue') as HTMLSpanElement).textContent = controls.edgeBias.value;
    });

    // Update WebGPU uniforms when controls change
    controls.width.addEventListener('change', () => {
        if (window.webGPUApp) {
            window.webGPUApp.settings.width = parseInt(controls.width.value);
            window.webGPUApp.updateUniforms();
        }
    });

    controls.height.addEventListener('change', () => {
        if (window.webGPUApp) {
            window.webGPUApp.settings.height = parseInt(controls.height.value);
            window.webGPUApp.updateUniforms();
        }
    });

    controls.contrast.addEventListener('change', () => {
        if (window.webGPUApp) {
            window.webGPUApp.settings.contrast = parseFloat(controls.contrast.value);
            window.webGPUApp.updateUniforms();
        }
    });

    controls.edgeBias.addEventListener('change', () => {
        if (window.webGPUApp) {
            window.webGPUApp.settings.edgeBias = parseFloat(controls.edgeBias.value);
            window.webGPUApp.updateUniforms();
        }
    });

    controls.invert.addEventListener('change', () => {
        if (window.webGPUApp) {
            window.webGPUApp.settings.invert = controls.invert.checked ? 1.0 : 0.0;
            window.webGPUApp.updateUniforms();
        }
    });

    controls.atlas.addEventListener('change', () => {
        if (window.webGPUApp) {
            window.webGPUApp.switchAtlas(controls.atlas.value);
        }
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

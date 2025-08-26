import { WebGPUApp } from './webgpu';
const outW: number = 160, outH: number = 90; // ASCII grid (change to taste)
const edgeBias: number = 0.35, contrast: number = 1.1, invert: number = 0;

// Main initialization function
async function initializeApp(): Promise<void> {
    // Use refactored WebGPU module
    const canvas = document.getElementById('gfx') as HTMLCanvasElement;
    const video = document.getElementById('cam') as HTMLVideoElement;
    // Start webcam from here so permission is requested before GPU init
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        (video as any).srcObject = stream;
        await video.play();
        } catch (e) {
        console.error('❌ Failed to start webcam:', e);
        throw e;
    }

    // Initialize WebGPU app
    const app = await WebGPUApp.initialize(canvas, video);
    window.webGPUApp = app;

    // Hide loading and update status
        if (window.appControls) {
            window.appControls.hideLoading();
        window.appControls.updateStatus("Running | Press 'H' for help | Press 'W' to toggle webcam");
    }
    
    // Setup controls and shortcuts
        setupControlListeners();
        console.log("✅ Control listeners set up");

    // Start rendering loop
    await app.run();
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
    controls.width.addEventListener('change', async () => {
        if (window.webGPUApp) {
            window.webGPUApp.settings.width = parseInt(controls.width.value);
            await window.webGPUApp.updateUniforms();
        }
    });

    controls.height.addEventListener('change', async () => {
        if (window.webGPUApp) {
            window.webGPUApp.settings.height = parseInt(controls.height.value);
            await window.webGPUApp.updateUniforms();
        }
    });

    controls.contrast.addEventListener('change', async () => {
        if (window.webGPUApp) {
            window.webGPUApp.settings.contrast = parseFloat(controls.contrast.value);
            await window.webGPUApp.updateUniforms();
        }
    });

    controls.edgeBias.addEventListener('change', async () => {
        if (window.webGPUApp) {
            window.webGPUApp.settings.edgeBias = parseFloat(controls.edgeBias.value);
            await window.webGPUApp.updateUniforms();
        }
    });

    controls.invert.addEventListener('change', async () => {
        if (window.webGPUApp) {
            window.webGPUApp.settings.invert = controls.invert.checked ? 1.0 : 0.0;
            await window.webGPUApp.updateUniforms();
        }
    });

    controls.atlas.addEventListener('change', async () => {
        if (window.webGPUApp) {
            await window.webGPUApp.switchAtlas(controls.atlas.value);
        }
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

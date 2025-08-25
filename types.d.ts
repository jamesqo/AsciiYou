// TypeScript definitions for WebGPU objects
interface WebGPUApp {
    device: GPUDevice;
    outW: number;
    outH: number;
    edgeBias: number;
    contrast: number;
    invert: number;
    atlasTex: GPUTexture;
    camTex: GPUTexture;
    outputTex: GPUTexture;
    uniforms: GPUBuffer;
    cols: number;
    rows: number;
    cellPx: number;
    computePipeline: GPUComputePipeline;
    renderPipeline: GPURenderPipeline;
    computeBindGroup: GPUBindGroup;
    renderBindGroup: GPUBindGroup;
    updateUniforms: (newOutW: number, newOutH: number, newEdgeBias: number, newContrast: number, newInvert: number) => void;
    switchAtlas: (atlasType: string) => Promise<void>;
}

interface AppControls {
    updateStatus: (message: string) => void;
    hideLoading: () => void;
    showError: (message: string) => void;
    getControls: () => {
        width: HTMLInputElement;
        height: HTMLInputElement;
        contrast: HTMLInputElement;
        edgeBias: HTMLInputElement;
        invert: HTMLInputElement;
        atlas: HTMLSelectElement;
    };
}

interface DebugApp {
    debugCanvas: () => void;
    debugTextures: () => void;
    snapshotCanvas: () => void;
    debugRenderState: () => void;
    validateWebGPUPipeline: () => void;
    testCanvasDrawing: () => void;
    fullDebug: () => void;
    screenshotCanvas: () => void;
}

// Extend Navigator interface with WebGPU support
interface Navigator {
  gpu: GPU;
}

// Extend Window interface with custom properties
interface Window {
  webgpuApp: WebGPUApp;
  appControls: AppControls;
  frameCount?: number;
  debugApp: DebugApp;
}

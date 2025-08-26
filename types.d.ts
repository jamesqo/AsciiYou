import type { WebGPUApp } from './webgpu';

interface AppControls {
  hideLoading: () => void;
  updateStatus: (msg: string) => void;
}

interface DebugTools {
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
declare global {
  interface Window {
    webGPUApp: WebGPUApp;
    appControls: {
      hideLoading: () => void;
      updateStatus: (msg: string) => void;
    };
    debugTools: DebugTools;
    frameCount?: number;
  }
}

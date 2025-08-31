import type { ASCIIRenderer } from './engine/ASCIIRenderer';

export interface AppControls {
  hideLoading: () => void;
  updateStatus: (msg: string) => void;
}

export interface DebugTools {
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
    renderer: ASCIIRenderer;
    appControls: {
      hideLoading: () => void;
      updateStatus: (msg: string) => void;
    };
    debugTools: DebugTools;
    frameCount?: number;
  }
}

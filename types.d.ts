
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
interface Window {
  webGPUApp: WebGPUApp;
  debugTools: DebugTools;
  frameCount?: number;
}

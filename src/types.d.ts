import type { ASCIIRenderer } from './engine/ASCIIRenderer';

export interface AtlasInfo {
  cellW: number;
  cellH: number;
  numCols: number;
  numRows: number;
  ramp: string;
  path: string;
}

export interface UserSettings {
  outW: number;
  outH: number;
  contrast: number;
  edgeBias: number;
  invert: number; // 0 or 1
  atlas: string;
}

export interface AppConfig {
  atlasInfo: AtlasInfo;
  defaultSettings: UserSettings;
}

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

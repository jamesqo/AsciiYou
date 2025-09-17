import type { AppConfig } from '../types'

const RAMP_DENSE = " .'`^\",:;~+_-?|\\/][}{)(tfrxYU0OZ#MW&8B@$";

export const appConfig: AppConfig = {
    apiUrl: 'http://localhost:3000',
    atlasInfo: {
        cellW: 32,
        cellH: 46,
        numCols: 16,
        numRows: Math.ceil(RAMP_DENSE.length / 16),
        ramp: RAMP_DENSE,
        // lives under public/ so Vite serves it as-is
        path: '/assets/dense_atlas_fira-code-bold_32x46.png'
    },
    defaultSettings: {
        outW: 150,
        outH: 60,
        contrast: 1.1,
        edgeBias: 0.15,
        invert: 0,
        atlas: 'dense'
    }
};

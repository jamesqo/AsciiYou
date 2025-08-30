export class Ramps {
    static readonly DENSE: string = " .'`^\",:;~+_-?|\\/][}{)(tfrxYU0OZ#MW&8B@$";
    // static readonly BLOCKS: string = " ░▒▓█";
}

export class AtlasInfo {
    static readonly CELL_W: number = 32;
    static readonly CELL_H: number = 46;
    static readonly NUM_COLS: number = 16;
    static readonly NUM_ROWS: number = Math.ceil(Ramps.DENSE.length / AtlasInfo.NUM_COLS);
    static readonly RAMP_LEN: number = Ramps.DENSE.length;
    static readonly ATLAS_PATH: string = 'assets/dense_atlas_fira-code-bold_32x46.png';
}

export class DefaultSettings {
    static readonly WIDTH: number = 150;
    static readonly HEIGHT: number = 60;
    static readonly CONTRAST: number = 1.1;
    static readonly EDGE_BIAS: number = 0.15;
    static readonly INVERT: number = 0;
    static readonly ATLAS: string = 'dense';
}

export class Ramps {
    static readonly DENSE: string = " .'`^\",:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
    // static readonly BLOCKS: string = " ░▒▓█";
}

export class AtlasInfo {
    static readonly CELL_W: number = 32;
    static readonly CELL_H: number = 46;
    static readonly NUM_COLS: number = 16;
    static readonly NUM_ROWS: number = 5;
    static readonly ATLAS_PATH: string = 'assets/dense_atlas_fira-code-bold_32x46.png';
}

export class DefaultSettings {
    static readonly WIDTH: number = 80;
    static readonly HEIGHT: number = 30;
    static readonly CONTRAST: number = 1.1;
    static readonly EDGE_BIAS: number = -0.1;
    static readonly INVERT: number = 0;
    static readonly ATLAS: string = 'dense';
}

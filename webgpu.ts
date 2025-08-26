// Use global WebGPUApp and AppControls interfaces from types.d.ts

export class UserSettings {
    width: number = 160;
    height: number = 90;
    contrast: number = 1.1;
    edgeBias: number = 0.35;
    invert: number = 0;
    atlas: string = 'dense';
}

export class WebGPUApp {
    settings!: UserSettings;

    device!: GPUDevice;
    atlasTex!: GPUTexture;
    camTex!: GPUTexture;
    outputTex!: GPUTexture;

    uniforms!: GPUBuffer;
    cols!: number;
    rows!: number;
    cellPx!: number;

    computePipeline!: GPUComputePipeline;
    renderPipeline!: GPURenderPipeline;

    computeBindGroup!: GPUBindGroup;
    renderBindGroup!: GPUBindGroup;

    private canvas!: HTMLCanvasElement;
    private ctx!: GPUCanvasContext;
    private format!: GPUTextureFormat;
    private video!: HTMLVideoElement;

    private constructor() {}

    static async initialize(canvas: HTMLCanvasElement, video: HTMLVideoElement): Promise<WebGPUApp> {
        const app = new WebGPUApp();

        const adapter: GPUAdapter | null = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("WebGPU not supported. Please use a modern browser with WebGPU support.");

        app.device = await adapter.requestDevice();
        app.settings = new UserSettings();

        // Configure canvas & video
        app.configureCanvas(canvas);
        app.video = video;

        // Resources
        app.atlasTex = await app.createAtlasTexture(app.settings.atlas);
        app.camTex = await app.createCamTexture();
        app.outputTex = await app.createOutputTexture();
        app.uniforms = await app.createUniforms();

        // Pipelines & bind groups
        app.computePipeline = await app.createComputePipeline();
        app.renderPipeline = await app.createRenderPipeline();
        app.computeBindGroup = await app.createComputeBindGroup();
        app.renderBindGroup = await app.createRenderBindGroup();

        // Error handling
        app.device.onuncapturederror = (e: GPUUncapturedErrorEvent) => {
            console.error('🔴 WebGPU uncaptured error:', e.error);
        };

        // expose instance to global (matches types.d.ts expectations)
        (window as any).webGPUApp = app as unknown as WebGPUApp;

        return app;
    }

    private configureCanvas(canvas: HTMLCanvasElement): void {
        this.canvas = canvas;
        this.ctx = canvas.getContext('webgpu') as GPUCanvasContext;
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.ctx.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' });
    }

    private async loadAtlasBitmap(atlasType: string): Promise<{ bitmap: ImageBitmap; cols: number; rows: number; cellPx: number; }> {
        const RAMP_DENSE: string = " .'`^\",:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
        const RAMP_BLOCKS: string = " ░▒▓█";
        const cols = 16;
        const cellPx = 32;
        let path = 'assets/dense_atlas.png';
        let rows: number;
        if (atlasType === 'blocks') {
            path = 'assets/blocks_atlas.png';
            rows = Math.ceil(RAMP_BLOCKS.length / cols);
        } else {
            rows = Math.ceil(RAMP_DENSE.length / cols);
        }
        const res = await fetch(path);
        if (!res.ok) throw new Error(`Failed to load ${atlasType} atlas: ${res.status}`);
        const bitmap = await createImageBitmap(await res.blob());
        return { bitmap, cols, rows, cellPx };
    }

    private async createAtlasTexture(atlasType: string): Promise<GPUTexture> {
        const { bitmap, cols, rows, cellPx } = await this.loadAtlasBitmap(atlasType);
        const atlasTex = this.device.createTexture({
            size: [bitmap.width, bitmap.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.device.queue.copyExternalImageToTexture(
            { source: bitmap },
            { texture: atlasTex },
            [bitmap.width, bitmap.height]
        );
        this.cols = cols;
        this.rows = rows;
        this.cellPx = cellPx;
        return atlasTex;
    }

    private async createCamTexture(): Promise<GPUTexture> {
        return this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        });
    }

    private async createOutputTexture(): Promise<GPUTexture> {
        return this.device.createTexture({
            size: [this.settings.width, this.settings.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });
    }

    private async createUniforms(): Promise<GPUBuffer> {
        const data = new Float32Array([
            this.settings.width,
            this.settings.height,
            this.settings.edgeBias,
            this.settings.contrast,
            this.settings.invert,
            this.cols,
            this.rows,
            this.cellPx,
            this.atlasTex.width,
            this.atlasTex.height
        ]);
        const buf = this.device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        this.device.queue.writeBuffer(buf, 0, data as BufferSource);
        return buf;
    }

    private async loadShaders(): Promise<{ computeWGSL: string; renderWGSL: string; }> {
        const [computeResponse, renderResponse] = await Promise.all([
            fetch('shaders/compute.wgsl'),
            fetch('shaders/render.wgsl')
        ]);
        if (!computeResponse.ok) throw new Error(`Failed to load compute shader: ${computeResponse.status}`);
        if (!renderResponse.ok) throw new Error(`Failed to load render shader: ${renderResponse.status}`);
        return { computeWGSL: await computeResponse.text(), renderWGSL: await renderResponse.text() };
    }

    private async createComputePipeline(): Promise<GPUComputePipeline> {
        const { computeWGSL } = await this.loadShaders();
        const compMod = this.device.createShaderModule({ code: computeWGSL });
        return this.device.createComputePipeline({ layout: 'auto', compute: { module: compMod, entryPoint: 'main' } });
    }

    private async createRenderPipeline(): Promise<GPURenderPipeline> {
        const { renderWGSL } = await this.loadShaders();
        const renMod = this.device.createShaderModule({ code: renderWGSL });
        return this.device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: renMod, entryPoint: 'vs_main' },
            fragment: { module: renMod, entryPoint: 'fs_main', targets: [{ format: this.format }] },
            primitive: { topology: 'triangle-list' }
        });
    }

    private async createComputeBindGroup(): Promise<GPUBindGroup> {
        const computeSampler = this.device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
        return this.device.createBindGroup({
            layout: this.computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: computeSampler },
                { binding: 1, resource: this.camTex.createView() },
                { binding: 2, resource: { buffer: this.device.createBuffer({ size: this.settings.width * this.settings.height * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }) } },
                { binding: 3, resource: { buffer: this.uniforms } }
            ]
        });
    }

    private async createRenderBindGroup(): Promise<GPUBindGroup> {
        const renderSampler = this.device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
        // Recreate index buffer for render bind group; store once if needed
        const idxBuffer: GPUBuffer = this.device.createBuffer({ size: this.settings.width * this.settings.height * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        return this.device.createBindGroup({
            layout: this.renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: idxBuffer } },
                { binding: 1, resource: this.atlasTex.createView() },
                { binding: 2, resource: renderSampler },
                { binding: 3, resource: { buffer: this.uniforms } }
            ]
        });
    }

    async run(): Promise<void> {
        const frame = async () => {
            try {
                this.device.queue.copyExternalImageToTexture(
                    { source: this.video },
                    { texture: this.camTex },
                    [this.canvas.width, this.canvas.height]
                );

                const encoder = this.device.createCommandEncoder();
                // Compute pass
                {
                    const pass = encoder.beginComputePass();
                    pass.setPipeline(this.computePipeline);
                    pass.setBindGroup(0, this.computeBindGroup);
                    pass.dispatchWorkgroups(Math.ceil(this.settings.width / 16), Math.ceil(this.settings.height / 16));
                    pass.end();
                }
                // Render pass
                const view = this.ctx.getCurrentTexture().createView();
                {
                    const pass = encoder.beginRenderPass({
                        colorAttachments: [{ view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }]
                    });
                    pass.setPipeline(this.renderPipeline);
                    pass.setBindGroup(0, this.renderBindGroup);
                    pass.draw(3, 1, 0, 0);
                    pass.end();
                }
                this.device.queue.submit([encoder.finish()]);
            } catch (e) {
                console.error('❌ Frame render error:', e);
            } finally {
                requestAnimationFrame(frame);
            }
        };
        requestAnimationFrame(frame);

        // No UI callbacks invoked here
    }

    updateUniforms(): void {
        const data = new Float32Array([
            this.settings.width,
            this.settings.height,
            this.settings.edgeBias,
            this.settings.contrast,
            this.settings.invert,
            this.cols, this.rows, this.cellPx, this.atlasTex.width, this.atlasTex.height
        ]);
        this.device.queue.writeBuffer(this.uniforms, 0, data as BufferSource);
    }

    async switchAtlas(atlasType: string): Promise<void> {
        const { bitmap, cols, rows } = await this.loadAtlasBitmap(atlasType);
        this.device.queue.copyExternalImageToTexture(
            { source: bitmap },
            { texture: this.atlasTex },
            [this.atlasTex.width, this.atlasTex.height]
        );
        this.cols = cols;
        this.rows = rows;
        this.updateUniforms(this.settings.width, this.settings.height, this.settings.edgeBias, this.settings.contrast, this.settings.invert);
    }
}



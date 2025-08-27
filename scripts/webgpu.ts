// Use global WebGPUApp and AppControls interfaces from types.d.ts

import { RAMP_DENSE, RAMP_BLOCKS } from './constants';

export class UserSettings {
    width: number = 160;
    height: number = 90;
    contrast: number = 1.1;
    edgeBias: number = -0.1; // TODO revert back to 0.35 once we've debugged the render shader
    invert: number = 0;
    atlas: string = 'dense';
}

export class WebGPUApp {
    settings!: UserSettings;

    device!: GPUDevice;
    atlasTex!: GPUTexture;
    camTex!: GPUTexture;
    private atlasWidth!: number;
    private atlasHeight!: number;

    uniforms!: GPUBuffer;
    cols!: number;
    rows!: number;
    cellPx!: number;

    computePipeline!: GPUComputePipeline;
    renderPipeline!: GPURenderPipeline;

    computeBindGroup!: GPUBindGroup;
    renderBindGroup!: GPUBindGroup;
    private indexBuffer!: GPUBuffer;

    private canvas!: HTMLCanvasElement;
    private ctx!: GPUCanvasContext;
    private format!: GPUTextureFormat;
    private video!: HTMLVideoElement;

    // #region Debug helpers

    private setupErrorHandlers(): void {
        this.device.onuncapturederror = (e: GPUUncapturedErrorEvent) => {
            console.error('🔴 WebGPU uncaptured error:', e.error);
        };
        this.device.lost.then((info) => {
            console.error('🔌 WebGPU device lost:', info);
        });
    }

    private captureStackTrace(depth = 1): string {
        const err = new Error();
        const stack = err.stack?.split("\n") ?? [];
        return stack.slice(depth).join("\n");
    }

    private async withValidation<T>(op: () => T | Promise<T>): Promise<T> {
        const stackTrace = this.captureStackTrace();

        this.device.pushErrorScope('validation');
        const result = await op();
        const err = await this.device.popErrorScope();
        if (err) {
            console.error(`❌ GPU ValidationError:`, err);
            console.error(`Caller info:\n${stackTrace}`);
            throw err;
        }
        return result;
    }

    public async dumpIndexBuffer(): Promise<Uint32Array> {
        const numCells = this.settings.width * this.settings.height;
        const byteSize = numCells * 4;

        // Create a staging buffer to copy the index buffer to, then
        // copy data out of the staging buffer into a Uint32Array.
        // The index buffer is used as the GPU as STORAGE during rendering--
        // giving it MAP_READ usage would slow things down, ie. by placing
        // it in CPU-mappable memory.
        const staging = this.device.createBuffer({
            size: byteSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        // Copy from index buffer -> staging buffer
        const encoder = this.device.createCommandEncoder();
        encoder.copyBufferToBuffer(this.indexBuffer, 0, staging, 0, byteSize);
        this.device.queue.submit([encoder.finish()]);

        // Copy from staging buffer -> Uint32Array copy
        await staging.mapAsync(GPUMapMode.READ);
        const mapped = staging.getMappedRange();
        const indices = new Uint32Array(mapped.slice(0)); // slice(0) copies the ArrayBuffer

        // Free up resources from the staging buffer
        staging.unmap();
        staging.destroy();

        return indices;
    }

    public async dumpCurrentASCII(): Promise<string> {
        const indices = Array.from(await this.dumpIndexBuffer());
        const chars = indices.map(i => RAMP_DENSE[i]);
        const cols = this.settings.width;
        const rows = this.settings.height;
        let out = '';
        for (let r = 0; r < rows; r++) {
            const start = r * cols;
            const end = start + cols;
            out += chars.slice(start, end).join('');
            if (r < rows - 1) out += '\n';
        }
        return out;
    }

    // #endregion

    private constructor() {}

    static async initialize(canvas: HTMLCanvasElement, video: HTMLVideoElement): Promise<WebGPUApp> {
        const app = new WebGPUApp();

        const adapter: GPUAdapter | null = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("WebGPU not supported. Please use a modern browser with WebGPU support.");

        app.device = await adapter.requestDevice();
        app.settings = new UserSettings();

        // Install debug/error handlers early
        app.setupErrorHandlers();

        // Configure canvas & video
        app.configureCanvas(canvas);
        app.video = video;

        // Resources
        app.atlasTex = await app.createAtlasTexture(app.settings.atlas);
        app.camTex = await app.createCamTexture();
        app.uniforms = await app.createUniforms();
        app.indexBuffer = app.createIndexBuffer();

        // Pipelines & bind groups
        app.computePipeline = await app.createComputePipeline();
        app.renderPipeline = await app.createRenderPipeline();
        app.computeBindGroup = await app.createComputeBindGroup();
        app.renderBindGroup = await app.createRenderBindGroup();

        return app;
    }

    private createIndexBuffer(): GPUBuffer {
        const numCells = this.settings.width * this.settings.height;
        // Shared buffer for compute (write) and render (read)
        return this.device.createBuffer({
            size: numCells * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });
    }

    private async resizeIndexBuffer(): Promise<void> {
        if (!this.indexBuffer) {
            throw new Error('Index buffer not initialized');
        }

        // It is not safe to destroy the index buffer while it is in use,
        // so recreate the bind groups first (which reference it) before
        // destroying the old one.
        const old = this.indexBuffer;
        this.indexBuffer = this.createIndexBuffer();
        await this.recreateBindGroups();
        old.destroy();
    }

    private configureCanvas(canvas: HTMLCanvasElement): void {
        this.canvas = canvas;
        this.ctx = canvas.getContext('webgpu') as GPUCanvasContext;
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.ctx.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    }

    private async loadAtlasBitmap(atlasType: string): Promise<{ bitmap: ImageBitmap; cols: number; rows: number; cellPx: number; }> {
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
        this.atlasWidth = bitmap.width;
        this.atlasHeight = bitmap.height;
        return atlasTex;
    }

    private async createCamTexture(): Promise<GPUTexture> {
        return this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
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
            this.atlasWidth,
            this.atlasHeight
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

    private async verifyCompilation(module: GPUShaderModule): Promise<void> {
        // Check WGSL compile diagnostics (if supported)
        const info = await (module.getCompilationInfo?.());
        if (info) {
            for (const m of info.messages) {
                const where = m.lineNum !== undefined ? `:${m.lineNum}:${m.linePos}` : "";
                const msg = `[WGSL:${m.type}] ${m.message}${where}`;
                if (m.type === 'error') console.error(msg);
                else if (m.type === 'warning') console.warn(msg);
                else console.log(msg);
            }
            if (info.messages.some(m => m.type === 'error')) {
                throw new Error('WGSL compile error(s) in compute shader. See logs above.');
            }
        }
    }

    private async createComputePipeline(): Promise<GPUComputePipeline> {
        const { computeWGSL } = await this.loadShaders();
        const compMod = this.device.createShaderModule({ code: computeWGSL });
        await this.verifyCompilation(compMod);

        return await this.withValidation(async () => {
            const p = await this.device.createComputePipelineAsync({ layout: 'auto', compute: { module: compMod, entryPoint: 'main' } });
            p.label = 'pipeline/compute-main';
            return p;
        });
    }

    private async createRenderPipeline(): Promise<GPURenderPipeline> {
        const { renderWGSL } = await this.loadShaders();
        const renMod = this.device.createShaderModule({ code: renderWGSL });
        await this.verifyCompilation(renMod);

        return await this.withValidation(async () => {
            const p = await this.device.createRenderPipelineAsync({
                layout: 'auto',
                vertex: { module: renMod, entryPoint: 'vs_main' },
                fragment: { module: renMod, entryPoint: 'fs_main', targets: [{ format: this.format }] },
                primitive: { topology: 'triangle-list' }
            });
            p.label = 'pipeline/render-main';
            return p;
        });
    }

    private async createComputeBindGroup(): Promise<GPUBindGroup> {
        const computeSampler = this.device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
        return this.device.createBindGroup({
            layout: this.computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: computeSampler },
                { binding: 1, resource: this.camTex.createView() },
                { binding: 2, resource: { buffer: this.indexBuffer } },
                { binding: 3, resource: { buffer: this.uniforms } }
            ]
        });
    }

    private async createRenderBindGroup(): Promise<GPUBindGroup> {
        const renderSampler = this.device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
        return this.device.createBindGroup({
            layout: this.renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.indexBuffer } },
                { binding: 1, resource: this.atlasTex.createView() },
                { binding: 2, resource: renderSampler },
                { binding: 3, resource: { buffer: this.uniforms } }
            ]
        });
    }

    // Re-creates the bind groups when fields that they reference change.
    private async recreateBindGroups(): Promise<void> {
        // NOTE: It is not necessary to destroy the old bind groups--
        // they are immutable descriptor objects with no explicit lifetime API,
        // and they are automatically garbage collected.

        this.computeBindGroup = await this.createComputeBindGroup();
        this.renderBindGroup = await this.createRenderBindGroup();
    }

    private doComputePass(encoder: GPUCommandEncoder): void {
        const pass = encoder.beginComputePass();
        pass.label = 'pass/compute';
        pass.setPipeline(this.computePipeline);
        pass.setBindGroup(0, this.computeBindGroup);
        pass.dispatchWorkgroups(Math.ceil(this.settings.width / 16), Math.ceil(this.settings.height / 16));
        pass.end();
    }

    private doRenderPass(encoder: GPUCommandEncoder, view: GPUTextureView): void {
        const pass = encoder.beginRenderPass({
            colorAttachments: [{ view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }]
        });
        pass.label = 'pass/render';
        pass.setPipeline(this.renderPipeline);
        pass.setBindGroup(0, this.renderBindGroup);
        pass.draw(3, 1, 0, 0);
        pass.end();
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
                encoder.label = 'encoder/frame';

                this.doComputePass(encoder);

                const view = this.ctx.getCurrentTexture().createView();
                this.doRenderPass(encoder, view);

                this.device.queue.submit([encoder.finish()]);
            } catch (e) {
                console.error('❌ Frame render error:', e);
            } finally {
                requestAnimationFrame(frame);
            }
        };
        requestAnimationFrame(frame);
    }

    async updateUniforms(): Promise<void> {
        const data = new Float32Array([
            this.settings.width,
            this.settings.height,
            this.settings.edgeBias,
            this.settings.contrast,
            this.settings.invert,
            this.cols, this.rows, this.cellPx, this.atlasTex.width, this.atlasTex.height
        ]);
        this.device.queue.writeBuffer(this.uniforms, 0, data as BufferSource);
        // Re-allocate index buffer, which depends on the width and height set by the user
        await this.resizeIndexBuffer();
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
        await this.updateUniforms();
    }
}

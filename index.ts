const outW: number = 160, outH: number = 90; // ASCII grid (change to taste)
const edgeBias: number = 0.35, contrast: number = 1.1, invert: number = 0;

// Main initialization function
async function initializeApp(): Promise<void> {
    try {
        console.log("🚀 Starting WebGPU initialization...");
        
        // Update status during initialization
        if (window.appControls) {
            window.appControls.updateStatus("Initializing WebGPU...");
        }

        // --- WebGPU Setup
        console.log("📡 Requesting WebGPU adapter...");
        const adapter: GPUAdapter | null = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error("WebGPU not supported. Please use a modern browser with WebGPU support.");
        }
        console.log("✅ WebGPU adapter obtained:", adapter);
        
        console.log("🔧 Requesting WebGPU device...");
        const device: GPUDevice = await adapter.requestDevice();
        console.log("✅ WebGPU device created");
        
        // Create the global WebGPU app object early
        window.webgpuApp = {
            device,
            outW,
            outH,
            edgeBias,
            contrast,
            invert
        } as WebGPUApp;
        
        const canvas: HTMLCanvasElement = document.getElementById('gfx') as HTMLCanvasElement;
        console.log("🎨 Canvas element:", canvas, "Dimensions:", canvas.width, "x", canvas.height);
        
        const ctx: GPUCanvasContext = canvas.getContext('webgpu') as GPUCanvasContext;
        console.log("🔌 WebGPU context:", ctx);

        const format: GPUTextureFormat = navigator.gpu.getPreferredCanvasFormat();
        console.log("🎯 Preferred canvas format:", format);
        
        ctx.configure({ device, format, alphaMode: "premultiplied" });
        console.log("✅ Canvas configured for WebGPU");

        if (window.appControls) {
            window.appControls.updateStatus("Setting up webcam...");
        }

        // --- 1) Webcam
        console.log("📹 Setting up webcam...");
        const vid: HTMLVideoElement = document.getElementById('cam') as HTMLVideoElement;
        console.log("📹 Video element:", vid);
        
        await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
            .then(s => (vid.srcObject = s, vid.play()));
        console.log("✅ Webcam started, srcObject:", vid.srcObject);

        if (window.appControls) {
            window.appControls.updateStatus("Loading glyph atlas...");
        }

        // --- 2) Load pre-generated glyph atlas
        console.log("🔤 Loading glyph atlas...");
        const RAMP_DENSE: string = " .'`^\",:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
        const RAMP_BLOCKS: string = " ░▒▓█";
        
        // Atlas configuration
        const cols: number = 16;                         // atlas grid columns
        const cellPx: number = 32;                       // px per glyph tile
        
        // Load the default dense atlas
        console.log("📥 Fetching dense_atlas.png...");
        const atlasResponse: Response = await fetch('assets/dense_atlas.png');
        if (!atlasResponse.ok) {
            throw new Error(`Failed to load glyph atlas: ${atlasResponse.status}`);
        }
        console.log("✅ Atlas fetched, status:", atlasResponse.status);
        
        const atlasBitmap: ImageBitmap = await createImageBitmap(await atlasResponse.blob());
        console.log("🖼️ Atlas bitmap created:", atlasBitmap.width, "x", atlasBitmap.height);
        
        // Calculate rows for dense atlas
        const rows: number = Math.ceil(RAMP_DENSE.length / cols);
        console.log("📊 Atlas grid:", cols, "x", rows, "cells,", RAMP_DENSE.length, "characters");

        if (window.appControls) {
            window.appControls.updateStatus("Uploading to GPU...");
        }

        // Upload atlas to GPU
        console.log("⬆️ Uploading atlas to GPU...");
        const atlasTex: GPUTexture = window.webgpuApp.device.createTexture({
            size: [atlasBitmap.width, atlasBitmap.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });
        console.log("✅ Atlas texture created:", atlasTex.width, "x", atlasTex.height);
        
        window.webgpuApp.device.queue.copyExternalImageToTexture(
            { source: atlasBitmap },
            { texture: atlasTex },
            [atlasBitmap.width, atlasBitmap.height]
        );
        console.log("✅ Atlas copied to GPU texture");
        
        const atlasView: GPUTextureView = atlasTex.createView();
        const atlasSampler: GPUSampler = window.webgpuApp.device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
        console.log("✅ Atlas view and sampler created");

        // --- 3) Camera texture (each frame: copyExternalImageToTexture from <video>)
        console.log("📷 Creating camera texture...");
        const camTex: GPUTexture = window.webgpuApp.device.createTexture({
            size: [canvas.width, canvas.height], // will resample into this
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        });
        console.log("✅ Camera texture created:", camTex.width, "x", camTex.height);
        const camView: GPUTextureView = camTex.createView();

        // --- 3.5) Output texture (compute writes here, render reads)
        console.log("📤 Creating output texture...");
        const outputTex: GPUTexture = window.webgpuApp.device.createTexture({
            size: [outW, outH], // ASCII grid size
            format: 'rgba8unorm',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });
        console.log("✅ Output texture created:", outputTex.width, "x", outputTex.height);

        // --- 4) ASCII index buffer (compute writes here, fragment reads)
        console.log("📝 Creating index buffer...");
        const idxBuffer: GPUBuffer = window.webgpuApp.device.createBuffer({
            size: outW * outH * 4, // u32 per cell
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        console.log("✅ Index buffer created, size:", idxBuffer.size, "bytes");

        // --- 5) Uniforms
        console.log("⚙️ Setting up uniforms...");
        const uniformArr: Float32Array = new Float32Array([outW, outH, edgeBias, contrast, invert, cols, rows, cellPx, atlasBitmap.width, atlasBitmap.height]);
        console.log("📊 Uniform array:", Array.from(uniformArr));
        
        const uniforms: GPUBuffer = window.webgpuApp.device.createBuffer({
            size: uniformArr.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        window.webgpuApp.device.queue.writeBuffer(uniforms, 0, uniformArr as GPUAllowSharedBufferSource);
        console.log("✅ Uniforms uploaded to GPU");

        // Add all textures and buffers to the global object
        window.webgpuApp.atlasTex = atlasTex;
        window.webgpuApp.camTex = camTex;
        window.webgpuApp.outputTex = outputTex;
        window.webgpuApp.uniforms = uniforms;
        window.webgpuApp.cols = cols;
        window.webgpuApp.rows = rows;
        window.webgpuApp.cellPx = cellPx;

        if (window.appControls) {
            window.appControls.updateStatus("Loading shaders...");
        }

        // --- 6) Load shaders from external files
        console.log("📚 Loading shaders...");
        let computeWGSL: string, renderWGSL: string;
        try {
            const [computeResponse, renderResponse]: [Response, Response] = await Promise.all([
                fetch('shaders/compute.wgsl'),
                fetch('shaders/render.wgsl')
            ]);
            
            if (!computeResponse.ok) {
                throw new Error(`Failed to load compute shader: ${computeResponse.status}`);
            }
            if (!renderResponse.ok) {
                throw new Error(`Failed to load render shader: ${renderResponse.status}`);
            }
            
            computeWGSL = await computeResponse.text();
            renderWGSL = await renderResponse.text();
            console.log("✅ Shaders loaded successfully");
            console.log("📝 Compute shader length:", computeWGSL.length, "chars");
            console.log("🎨 Render shader length:", renderWGSL.length, "chars");
        } catch (error) {
            throw new Error(`Shader loading failed: ${(error as Error).message}`);
        }

        if (window.appControls) {
            window.appControls.updateStatus("Compiling shaders...");
        }

        // --- 7) Pipelines & bind groups
        console.log("🔨 Creating shader modules...");
        const compMod: GPUShaderModule = window.webgpuApp.device.createShaderModule({ code: computeWGSL });
        const renMod: GPUShaderModule = window.webgpuApp.device.createShaderModule({ code: renderWGSL });
        console.log("✅ Shader modules created");

        // Creating compute pipeline...
        console.log("🔧 Creating compute pipeline...");
        try {
            window.webgpuApp.computePipeline = window.webgpuApp.device.createComputePipeline({
                layout: 'auto',
                compute: {
                    module: compMod,
                    entryPoint: 'main'
                }
            });
            console.log("✅ Compute pipeline created");
        } catch (error) {
            console.error("❌ Compute pipeline creation failed:", error);
            throw error;
        }

        // Creating render pipeline...
        console.log("🔧 Creating render pipeline...");
        try {
            window.webgpuApp.renderPipeline = window.webgpuApp.device.createRenderPipeline({
                layout: 'auto',
                vertex: {
                    module: renMod,
                    entryPoint: 'vs_main'
                },
                fragment: {
                    module: renMod,
                    entryPoint: 'fs_main',
                    targets: [{
                        format: format
                    }]
                },
                primitive: {
                    topology: 'triangle-list'
                }
            });
            console.log("✅ Render pipeline created");
        } catch (error) {
            console.error("❌ Render pipeline creation failed:", error);
            throw error;
        }

        // Creating bind groups...
        console.log("🔧 Creating bind groups...");
        try {
            // Create sampler for compute shader
            const computeSampler = window.webgpuApp.device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
            
            window.webgpuApp.computeBindGroup = window.webgpuApp.device.createBindGroup({
                layout: window.webgpuApp.computePipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: computeSampler },                    // Binding 0: Sampler
                    { binding: 1, resource: camTex.createView() },               // Binding 1: Camera texture
                    { binding: 2, resource: { buffer: idxBuffer } },             // Binding 2: Index buffer
                    { binding: 3, resource: { buffer: uniforms } }               // Binding 3: Uniforms
                ]
            });
            console.log("✅ Compute bind group created");

            // Create sampler for render shader
            const renderSampler = window.webgpuApp.device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
            
            window.webgpuApp.renderBindGroup = window.webgpuApp.device.createBindGroup({
                layout: window.webgpuApp.renderPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: idxBuffer } },             // Binding 0: Index buffer
                    { binding: 1, resource: atlasTex.createView() },             // Binding 1: Atlas texture
                    { binding: 2, resource: renderSampler },                     // Binding 2: Sampler
                    { binding: 3, resource: { buffer: uniforms } }               // Binding 3: Uniforms
                ]
            });
            console.log("✅ Render bind group created");
        } catch (error) {
            console.error("❌ Bind group creation failed:", error);
            throw error;
        }

        if (window.appControls) {
            window.appControls.updateStatus("Starting render loop...");
        }

        // --- 8) Frame loop
        console.log("🔄 Setting up render loop...");
        async function frame(): Promise<void> {
            try {
                // Upload latest camera frame to camTex
                window.webgpuApp.device.queue.copyExternalImageToTexture(
                    { source: vid },                // HTMLVideoElement
                    { texture: camTex },
                    [canvas.width, canvas.height]
                );

                const encoder: GPUCommandEncoder = window.webgpuApp.device.createCommandEncoder();

                // Compute: camera -> ASCII indices
                {
                    const pass: GPUComputePassEncoder = encoder.beginComputePass();
                    pass.setPipeline(window.webgpuApp.computePipeline);
                    pass.setBindGroup(0, window.webgpuApp.computeBindGroup);
                    pass.dispatchWorkgroups(Math.ceil(outW / 16), Math.ceil(outH / 16));
                    pass.end();
                }

                // Render: indices + atlas -> canvas
                const view: GPUTextureView = ctx.getCurrentTexture().createView();
                {
                    const pass: GPURenderPassEncoder = encoder.beginRenderPass({
                        colorAttachments: [{
                            view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store'
                        }]
                    });
                    pass.setPipeline(window.webgpuApp.renderPipeline);
                    pass.setBindGroup(0, window.webgpuApp.renderBindGroup);
                    pass.draw(3, 1, 0, 0); // full-screen triangle
                    pass.end();
                }

                window.webgpuApp.device.queue.submit([encoder.finish()]);
                
                // Debug: log every 30 frames (1 second at 30fps)
                if (window.frameCount === undefined) window.frameCount = 0;
                window.frameCount++;
                if (window.frameCount % 30 === 0) {
                    // console.log("🎬 Frame rendered:", window.frameCount, "Video readyState:", vid.readyState);
                }
                
                requestAnimationFrame(frame);
            } catch (error) {
                console.error("❌ Frame render error:", error);
            }
        }

        // Start the render loop
        requestAnimationFrame(frame);
        console.log("✅ Render loop started");

        // Success! Hide loading and update status
        if (window.appControls) {
            window.appControls.hideLoading();
            window.appControls.updateStatus("Running | Press 'H' for help | Press 'W' to toggle webcam | Press 'R' to reset");
        }

        // Add the remaining properties to the existing webgpuApp object
        window.webgpuApp.updateUniforms = function(newOutW: number, newOutH: number, newEdgeBias: number, newContrast: number, newInvert: number): void {
            const newUniformArr: Float32Array = new Float32Array([newOutW, newOutH, newEdgeBias, newContrast, newInvert, this.cols, this.rows, this.cellPx, this.atlasTex.width, this.atlasTex.height]);
            window.webgpuApp.device.queue.writeBuffer(uniforms, 0, newUniformArr as GPUAllowSharedBufferSource);
            console.log("🔄 Uniforms updated:", Array.from(newUniformArr));
        };
        
        window.webgpuApp.switchAtlas = async function(atlasType: string): Promise<void> {
            try {
                let atlasPath: string, newCols: number, newRows: number;
                
                switch(atlasType) {
                    case 'blocks':
                        atlasPath = 'assets/blocks_atlas.png';
                        newCols = 16;
                        newRows = Math.ceil(RAMP_BLOCKS.length / newCols);
                        break;
                    default: // dense
                        atlasPath = 'assets/dense_atlas.png';
                        newCols = 16;
                        newRows = Math.ceil(RAMP_DENSE.length / newCols);
                        break;
                }
                
                const response: Response = await fetch(atlasPath);
                if (!response.ok) {
                    throw new Error(`Failed to load ${atlasType} atlas: ${response.status}`);
                }
                
                const newAtlasBitmap: ImageBitmap = await createImageBitmap(await response.blob());
                
                // Update the atlas texture
                window.webgpuApp.device.queue.copyExternalImageToTexture(
                    { source: newAtlasBitmap },
                    { texture: this.atlasTex },
                    [this.atlasTex.width, this.atlasTex.height]
                );
                
                // Update the stored values
                this.cols = newCols;
                this.rows = newRows;
                
                // Update uniforms with new atlas dimensions
                this.updateUniforms(
                    this.outW, 
                    this.outH, 
                    parseFloat(window.appControls.getControls().edgeBias.value), 
                    parseFloat(window.appControls.getControls().contrast.value), 
                    window.appControls.getControls().invert.checked ? 1.0 : 0.0
                );
                
                console.log(`🔄 Switched to ${atlasType} atlas`);
            } catch (error) {
                console.error('❌ Failed to switch atlas:', error);
            }
        };

        // Set up control listeners
        setupControlListeners();
        
        console.log("✅ Control listeners set up");

    } catch (error) {
        console.error("❌ Initialization failed:", error);
        if (window.appControls) {
            window.appControls.showError(`Initialization failed: ${(error as Error).message}`);
        }
    }
}

// Control setup
function setupControlListeners(): void {
    const controls = {
        width: document.getElementById('width') as HTMLInputElement,
        height: document.getElementById('height') as HTMLInputElement,
        contrast: document.getElementById('contrast') as HTMLInputElement,
        edgeBias: document.getElementById('edgeBias') as HTMLInputElement,
        invert: document.getElementById('invert') as HTMLInputElement,
        atlas: document.getElementById('atlas') as HTMLSelectElement
    };

    // Update display values
    controls.width.addEventListener('input', () => {
        (document.getElementById('widthValue') as HTMLSpanElement).textContent = controls.width.value;
    });
    controls.height.addEventListener('input', () => {
        (document.getElementById('heightValue') as HTMLSpanElement).textContent = controls.height.value;
    });
    controls.contrast.addEventListener('input', () => {
        (document.getElementById('contrastValue') as HTMLSpanElement).textContent = controls.contrast.value;
    });
    controls.edgeBias.addEventListener('input', () => {
        (document.getElementById('edgeBiasValue') as HTMLSpanElement).textContent = controls.edgeBias.value;
    });

    // Update WebGPU uniforms when controls change
    controls.width.addEventListener('change', () => {
        if (window.webgpuApp) {
            window.webgpuApp.outW = parseInt(controls.width.value);
            window.webgpuApp.updateUniforms(
                window.webgpuApp.outW,
                window.webgpuApp.outH,
                parseFloat(controls.edgeBias.value),
                parseFloat(controls.contrast.value),
                controls.invert.checked ? 1.0 : 0.0
            );
        }
    });

    controls.height.addEventListener('change', () => {
        if (window.webgpuApp) {
            window.webgpuApp.outH = parseInt(controls.height.value);
            window.webgpuApp.updateUniforms(
                window.webgpuApp.outW,
                window.webgpuApp.outH,
                parseFloat(controls.edgeBias.value),
                parseFloat(controls.contrast.value),
                controls.invert.checked ? 1.0 : 0.0
            );
        }
    });

    controls.contrast.addEventListener('change', () => {
        if (window.webgpuApp) {
            window.webgpuApp.updateUniforms(
                window.webgpuApp.outW,
                window.webgpuApp.outH,
                parseFloat(controls.edgeBias.value),
                parseFloat(controls.contrast.value),
                controls.invert.checked ? 1.0 : 0.0
            );
        }
    });

    controls.edgeBias.addEventListener('change', () => {
        if (window.webgpuApp) {
            window.webgpuApp.updateUniforms(
                window.webgpuApp.outW,
                window.webgpuApp.outH,
                parseFloat(controls.edgeBias.value),
                parseFloat(controls.contrast.value),
                controls.invert.checked ? 1.0 : 0.0
            );
        }
    });

    controls.invert.addEventListener('change', () => {
        if (window.webgpuApp) {
            window.webgpuApp.updateUniforms(
                window.webgpuApp.outW,
                window.webgpuApp.outH,
                parseFloat(controls.edgeBias.value),
                parseFloat(controls.contrast.value),
                controls.invert.checked ? 1.0 : 0.0
            );
        }
    });

    controls.atlas.addEventListener('change', () => {
        if (window.webgpuApp) {
            window.webgpuApp.switchAtlas(controls.atlas.value);
        }
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

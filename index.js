const outW = 160, outH = 90; // ASCII grid (change to taste)
const edgeBias = 0.35, contrast = 1.1, invert = 0;

// Main initialization function
async function initializeApp() {
    try {
        // Update status during initialization
        if (window.appControls) {
            window.appControls.updateStatus("Initializing WebGPU...");
        }

        // --- WebGPU Setup
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error("WebGPU not supported. Please use a modern browser with WebGPU support.");
        }
        
        const device = await adapter.requestDevice();
        const canvas = document.getElementById('gfx');
        const ctx = canvas.getContext('webgpu');

        const format = navigator.gpu.getPreferredCanvasFormat();
        ctx.configure({ device, format, alphaMode: "premultiplied" });

        if (window.appControls) {
            window.appControls.updateStatus("Setting up webcam...");
        }

        // --- 1) Webcam
        const vid = document.getElementById('cam');
        await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
            .then(s => (vid.srcObject = s, vid.play()));

        if (window.appControls) {
            window.appControls.updateStatus("Loading glyph atlas...");
        }

        // --- 2) Load pre-generated glyph atlas
        const RAMP_DENSE = " .'`^\",:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
        const RAMP_BLOCKS = " ░▒▓█";
        
        // Atlas configuration
        const cols = 16;                         // atlas grid columns
        const cellPx = 32;                       // px per glyph tile
        
        // Load the default dense atlas
        const atlasResponse = await fetch('assets/dense_atlas.png');
        if (!atlasResponse.ok) {
            throw new Error(`Failed to load glyph atlas: ${atlasResponse.status}`);
        }
        const atlasBitmap = await createImageBitmap(await atlasResponse.blob());
        
        // Calculate rows for dense atlas
        const rows = Math.ceil(RAMP_DENSE.length / cols);

        if (window.appControls) {
            window.appControls.updateStatus("Uploading to GPU...");
        }

        // Upload atlas to GPU
        const atlasTex = device.createTexture({
            size: [atlasBitmap.width, atlasBitmap.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });
        device.queue.copyExternalImageToTexture(
            { source: atlasBitmap },
            { texture: atlasTex },
            [atlasBitmap.width, atlasBitmap.height]
        );
        const atlasView = atlasTex.createView();
        const atlasSampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });

        // --- 3) Camera texture (each frame: copyExternalImageToTexture from <video>)
        const camTex = device.createTexture({
            size: [canvas.width, canvas.height], // will resample into this
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        });
        const camView = camTex.createView();

        // --- 4) ASCII index buffer (compute writes here, fragment reads)
        const idxBuffer = device.createBuffer({
            size: outW * outH * 4, // u32 per cell
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        // --- 5) Uniforms
        const uniformArr = new Float32Array([outW, outH, edgeBias, contrast, invert, cols, rows, cellPx, atlasBitmap.width, atlasBitmap.height]);
        const uniforms = device.createBuffer({
            size: uniformArr.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(uniforms, 0, uniformArr);

        if (window.appControls) {
            window.appControls.updateStatus("Loading shaders...");
        }

        // --- 6) Load shaders from external files
        let computeWGSL, renderWGSL;
        try {
            const [computeResponse, renderResponse] = await Promise.all([
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
        } catch (error) {
            throw new Error(`Shader loading failed: ${error.message}`);
        }

        if (window.appControls) {
            window.appControls.updateStatus("Compiling shaders...");
        }

        // --- 7) Pipelines & bind groups
        const compMod = device.createShaderModule({ code: computeWGSL });
        const renMod = device.createShaderModule({ code: renderWGSL });

        const compPipe = device.createComputePipeline({
            layout: 'auto',
            compute: { module: compMod, entryPoint: 'main' }
        });
        const renPipe = device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: renMod, entryPoint: 'vs_main' },
            fragment: { module: renMod, entryPoint: 'fs_main', targets: [{ format }] },
            primitive: { topology: 'triangle-list' }
        });

        const compGroup = device.createBindGroup({
            layout: compPipe.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: device.createSampler({}) },
                { binding: 1, resource: camView },
                { binding: 2, resource: { buffer: idxBuffer } },
                { binding: 3, resource: { buffer: uniforms } },
            ]
        });
        const renGroup = device.createBindGroup({
            layout: renPipe.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: idxBuffer } },
                { binding: 1, resource: atlasView },
                { binding: 2, resource: atlasSampler },
                { binding: 3, resource: { buffer: uniforms } },
            ]
        });

        if (window.appControls) {
            window.appControls.updateStatus("Starting render loop...");
        }

        // --- 8) Frame loop
        async function frame() {
            // Upload latest camera frame to camTex
            device.queue.copyExternalImageToTexture(
                { source: vid },                // HTMLVideoElement
                { texture: camTex },
                [canvas.width, canvas.height]
            );

            const encoder = device.createCommandEncoder();

            // Compute: camera -> ASCII indices
            {
                const pass = encoder.beginComputePass();
                pass.setPipeline(compPipe);
                pass.setBindGroup(0, compGroup);
                pass.dispatchWorkgroups(Math.ceil(outW / 16), Math.ceil(outH / 16));
                pass.end();
            }

            // Render: indices + atlas -> canvas
            const view = ctx.getCurrentTexture().createView();
            {
                const pass = encoder.beginRenderPass({
                    colorAttachments: [{
                        view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store'
                    }]
                });
                pass.setPipeline(renPipe);
                pass.setBindGroup(0, renGroup);
                pass.draw(3, 1, 0, 0); // full-screen triangle
                pass.end();
            }

            device.queue.submit([encoder.finish()]);
            requestAnimationFrame(frame);
        }

        // Start the render loop
        requestAnimationFrame(frame);

        // Success! Hide loading and update status
        if (window.appControls) {
            window.appControls.hideLoading();
            window.appControls.updateStatus("Running | Press 'H' for help | Press 'W' to toggle webcam | Press 'R' to reset");
        }

        // Store references for control updates
        window.webgpuApp = {
            device,
            uniforms,
            compGroup,
            renGroup,
            outW,
            outH,
            atlasTex,
            cols,
            rows,
            cellPx,
            updateUniforms: function(newOutW, newOutH, newEdgeBias, newContrast, newInvert) {
                const newUniformArr = new Float32Array([newOutW, newOutH, newEdgeBias, newContrast, newInvert, this.cols, this.rows, this.cellPx, this.atlasTex.width, this.atlasTex.height]);
                device.queue.writeBuffer(uniforms, 0, newUniformArr);
            },
            switchAtlas: async function(atlasType) {
                try {
                    let atlasPath, newCols, newRows;
                    
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
                    
                    const response = await fetch(atlasPath);
                    if (!response.ok) {
                        throw new Error(`Failed to load ${atlasType} atlas: ${response.status}`);
                    }
                    
                    const newAtlasBitmap = await createImageBitmap(await response.blob());
                    
                    // Update the atlas texture
                    device.queue.copyExternalImageToTexture(
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
                    
                    console.log(`Switched to ${atlasType} atlas`);
                } catch (error) {
                    console.error('Failed to switch atlas:', error);
                }
            }
        };

        // Set up control listeners
        setupControlListeners();

    } catch (error) {
        console.error("Initialization failed:", error);
        
        if (window.appControls) {
            window.appControls.hideLoading();
            window.appControls.showError(`Initialization failed: ${error.message}`);
        } else {
            // Fallback if controls aren't ready yet
            document.getElementById('loading').classList.add('hidden');
            const errorDiv = document.getElementById('error');
            errorDiv.textContent = `Initialization failed: ${error.message}`;
            errorDiv.classList.remove('hidden');
        }
    }
}

// Wait for DOM and controls to be ready, then initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM is already ready, wait a bit for controls to be set up
    setTimeout(initializeApp, 100);
}

// Set up control listeners for real-time updates
function setupControlListeners() {
    if (!window.appControls) return;
    
    const controls = window.appControls.getControls();
    
    // Width and height controls
    controls.width.addEventListener('input', (e) => {
        const newWidth = parseInt(e.target.value);
        if (window.webgpuApp) {
            window.webgpuApp.outW = newWidth;
            window.webgpuApp.updateUniforms(
                newWidth, 
                window.webgpuApp.outH, 
                parseFloat(controls.edgeBias.value), 
                parseFloat(controls.contrast.value), 
                controls.invert.checked ? 1.0 : 0.0
            );
        }
    });
    
    controls.height.addEventListener('input', (e) => {
        const newHeight = parseInt(e.target.value);
        if (window.webgpuApp) {
            window.webgpuApp.outH = newHeight;
            window.webgpuApp.updateUniforms(
                window.webgpuApp.outW, 
                newHeight, 
                parseFloat(controls.edgeBias.value), 
                parseFloat(controls.contrast.value), 
                controls.invert.checked ? 1.0 : 0.0
            );
        }
    });
    
    // Contrast control
    controls.contrast.addEventListener('input', (e) => {
        if (window.webgpuApp) {
            window.webgpuApp.updateUniforms(
                window.webgpuApp.outW, 
                window.webgpuApp.outH, 
                parseFloat(controls.edgeBias.value), 
                parseFloat(e.target.value), 
                controls.invert.checked ? 1.0 : 0.0
            );
        }
    });
    
    // Edge bias control
    controls.edgeBias.addEventListener('input', (e) => {
        if (window.webgpuApp) {
            window.webgpuApp.updateUniforms(
                window.webgpuApp.outW, 
                window.webgpuApp.outH, 
                parseFloat(e.target.value), 
                parseFloat(controls.contrast.value), 
                controls.invert.checked ? 1.0 : 0.0
            );
        }
    });
    
    // Invert control
    controls.invert.addEventListener('change', (e) => {
        if (window.webgpuApp) {
            window.webgpuApp.updateUniforms(
                window.webgpuApp.outW, 
                window.webgpuApp.outH, 
                parseFloat(controls.edgeBias.value), 
                parseFloat(controls.contrast.value), 
                e.target.checked ? 1.0 : 0.0
            );
        }
    });
    
    // Atlas control
    controls.atlas.addEventListener('change', (e) => {
        if (window.webgpuApp) {
            window.webgpuApp.switchAtlas(e.target.value);
        }
    });
}

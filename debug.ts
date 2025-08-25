function debugCanvas(): void {
    console.log("🔍 === CANVAS DEBUG ===");
    const canvas: HTMLCanvasElement | null = document.getElementById('gfx') as HTMLCanvasElement;
    if (!canvas) {
        console.log("❌ Canvas element not found");
        return;
    }
    
    console.log("Canvas element:", canvas);
    console.log("Canvas dimensions:", canvas.width, "x", canvas.height);
    console.log("Canvas style dimensions:", canvas.style.width, "x", canvas.style.height);
    console.log("Canvas computed style:", getComputedStyle(canvas).width, "x", getComputedStyle(canvas).height);
    console.log("Canvas visible:", canvas.offsetWidth > 0 && canvas.offsetHeight > 0);
    console.log("Canvas position:", canvas.offsetLeft, canvas.offsetTop);
    console.log("Canvas z-index:", getComputedStyle(canvas).zIndex);
}

function debugTextures(): void {
    console.log("🔍 === TEXTURE DEBUG ===");
    if (window.webgpuApp && window.webgpuApp.device) {
        console.log("Camera texture:", window.webgpuApp.camTex);
        console.log("Atlas texture:", window.webgpuApp.atlasTex);
        console.log("Output texture:", window.webgpuApp.outputTex);
        
        // Check if textures have valid dimensions
        if (window.webgpuApp.camTex) {
            console.log("Camera texture dimensions:", window.webgpuApp.camTex.width, "x", window.webgpuApp.camTex.height);
        }
        if (window.webgpuApp.atlasTex) {
            console.log("Atlas texture dimensions:", window.webgpuApp.atlasTex.width, "x", window.webgpuApp.atlasTex.height);
        }
        if (window.webgpuApp.outputTex) {
            console.log("Output texture dimensions:", window.webgpuApp.outputTex.width, "x", window.webgpuApp.outputTex.height);
        }
    }
}

function snapshotCanvas(): void {
    console.log("📸 === CANVAS SNAPSHOT ===");
    const canvas: HTMLCanvasElement | null = document.getElementById('gfx') as HTMLCanvasElement;
    if (!canvas) {
        console.log("❌ Canvas element not found");
        return;
    }
    
    // Method 1: Get canvas data as image data
    try {
        const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
        if (ctx) {
            const imageData: ImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            console.log("2D context image data:", imageData);
            console.log("First few pixels:", Array.from(imageData.data.slice(0, 20)));
        } else {
            console.log("❌ 2D context not available");
        }
    } catch (e) {
        console.log("❌ 2D context error:", e);
    }
    
    // Method 2: Convert to data URL
    try {
        const dataURL: string = canvas.toDataURL();
        console.log("Canvas data URL length:", dataURL.length);
        console.log("Data URL preview:", dataURL.substring(0, 100) + "...");
    } catch (e) {
        console.log("❌ toDataURL error:", e);
    }
    
    // Method 3: Check if canvas has any content
    const hasContent: boolean = canvas.width > 0 && canvas.height > 0;
    console.log("Canvas has dimensions:", hasContent);
}

function debugRenderState(): void {
    console.log("🔍 === RENDER STATE DEBUG ===");
    if (window.webgpuApp) {
        console.log("Current uniforms:", window.webgpuApp.uniforms);
        console.log("Current dimensions:", window.webgpuApp.outW, "x", window.webgpuApp.outH);
        console.log("Current contrast:", window.webgpuApp.contrast);
        console.log("Current edge bias:", window.webgpuApp.edgeBias);
        console.log("Current invert:", window.webgpuApp.invert);
    }
}

function validateWebGPUPipeline(): void {
    console.log("🔍 === WEBGPU PIPELINE VALIDATION ===");
    if (window.webgpuApp) {
        const app: WebGPUApp = window.webgpuApp;
        console.log("Device:", app.device);
        console.log("Compute pipeline:", app.computePipeline);
        console.log("Render pipeline:", app.renderPipeline);
        console.log("Bind groups:", app.computeBindGroup, app.renderBindGroup);
        
        // Check if all required components exist
        const hasDevice: boolean = !!app.device;
        const hasComputePipeline: boolean = !!app.computePipeline;
        const hasRenderPipeline: boolean = !!app.renderPipeline;
        const hasBindGroups: boolean = !!(app.computeBindGroup && app.renderBindGroup);
        
        console.log("Pipeline validation:", {
            device: hasDevice ? "✅" : "❌",
            computePipeline: hasComputePipeline ? "✅" : "❌",
            renderPipeline: hasRenderPipeline ? "✅" : "❌",
            bindGroups: hasBindGroups ? "✅" : "❌"
        });
    }
}

function testCanvasDrawing(): void {
    console.log("🎨 === TESTING CANVAS DRAWING ===");
    const canvas: HTMLCanvasElement | null = document.getElementById('gfx') as HTMLCanvasElement;
    if (!canvas) {
        console.log("❌ Canvas element not found");
        return;
    }
    
    try {
        // Try to get a 2D context
        const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
        if (ctx) {
            console.log("✅ 2D context available");
            
            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw a test pattern
            ctx.fillStyle = '#00ff88';
            ctx.fillRect(0, 0, 100, 100);
            
            ctx.fillStyle = '#ff0088';
            ctx.fillRect(100, 100, 100, 100);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = '24px monospace';
            ctx.fillText('TEST', 50, 150);
            
            console.log("✅ Test pattern drawn successfully");
            console.log("Canvas should now show green and red squares with 'TEST' text");
        } else {
            console.log("❌ 2D context not available");
        }
    } catch (e) {
        console.log("❌ Canvas drawing error:", e);
    }
}

function debugWebGPUBuffers(): void {
    console.log("🔍 === WEBGPU BUFFER DEBUG ===");
    if (window.webgpuApp) {
        const app = window.webgpuApp;
        
        // Check uniform buffer
        if (app.uniforms) {
            console.log("Uniforms buffer:", app.uniforms);
            console.log("Uniforms size:", app.uniforms.size);
            console.log("Uniforms usage:", app.uniforms.usage);
        }
        
        // Check if we have access to other buffers
        console.log("Available buffers:", {
            uniforms: !!app.uniforms,
            // Add other buffers as they become available
        });
    }
}

function debugShaderResources(): void {
    console.log("🔍 === SHADER RESOURCES DEBUG ===");
    if (window.webgpuApp) {
        const app = window.webgpuApp;
        
        // Check textures
        console.log("Camera texture:", {
            exists: !!app.camTex,
            width: app.camTex?.width,
            height: app.camTex?.height,
            format: app.camTex?.format,
            usage: app.camTex?.usage
        });
        
        console.log("Atlas texture:", {
            exists: !!app.atlasTex,
            width: app.atlasTex?.width,
            height: app.atlasTex?.height,
            format: app.atlasTex?.format,
            usage: app.atlasTex?.usage
        });
        
        console.log("Output texture:", {
            exists: !!app.outputTex,
            width: app.outputTex?.width,
            height: app.outputTex?.height,
            format: app.outputTex?.format,
            usage: app.outputTex?.usage
        });
    }
}

function testShaderCompilation(): void {
    console.log("🔍 === SHADER COMPILATION TEST ===");
    if (window.webgpuApp && window.webgpuApp.device) {
        const device = window.webgpuApp.device;
        
        // Test compute shader
        try {
            const computeResponse = fetch('shaders/compute.wgsl');
            computeResponse.then(response => response.text()).then(code => {
                try {
                    const module = device.createShaderModule({ code });
                    console.log("✅ Compute shader compiled successfully");
                    console.log("Code length:", code.length, "characters");
                } catch (error) {
                    console.error("❌ Compute shader compilation failed:", error);
                }
            });
        } catch (error) {
            console.error("❌ Failed to load compute shader:", error);
        }
        
        // Test render shader
        try {
            const renderResponse = fetch('shaders/render.wgsl');
            renderResponse.then(response => response.text()).then(code => {
                try {
                    const module = device.createShaderModule({ code });
                    console.log("✅ Render shader compiled successfully");
                    console.log("Code length:", code.length, "characters");
                } catch (error) {
                    console.error("❌ Render shader compilation failed:", error);
                }
            });
        } catch (error) {
            console.error("❌ Failed to load render shader:", error);
        }
    }
}

function fullDebug(): void {
    console.log("🔍 === FULL DEBUG ===");
    debugCanvas();
    debugTextures();
    snapshotCanvas();
    debugRenderState();
    validateWebGPUPipeline();
    debugWebGPUBuffers();
    debugShaderResources();
    testShaderCompilation();
}

function screenshotCanvas(): void {
    console.log("📸 === CANVAS SCREENSHOT ===");
    const canvas: HTMLCanvasElement | null = document.getElementById('gfx') as HTMLCanvasElement;
    if (!canvas) {
        console.log("❌ Canvas element not found");
        return;
    }
    
    // Convert to blob and POST to dev server to persist under screenshots/
    try {
        canvas.toBlob(async (blob) => {
            if (!blob) {
                console.log("❌ Failed to create PNG blob from canvas");
                return;
            }
            try {
                const res = await fetch('/__screenshot', { method: 'POST', body: blob });
                if (!res.ok) {
                    console.log("❌ Screenshot upload failed:", res.status);
                } else {
                    const name = await res.text();
                    console.log(`✅ Screenshot saved as screenshots/${name}`);
                }
            } catch (err) {
                console.log("❌ Screenshot upload error:", err);
            }
        }, 'image/png');
    } catch (e) {
        console.log("❌ toBlob error:", e);
    }
}

// Set up keyboard shortcuts
function setupDebugShortcuts(): void {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'd') {
            fullDebug();
        }
    });
    
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 't') {
            testCanvasDrawing();
        }
    });
    
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 's') {
            screenshotCanvas();
        }
    });
}

// Make functions globally available
window.debugApp = {
    debugCanvas,
    debugTextures,
    snapshotCanvas,
    debugRenderState,
    validateWebGPUPipeline,
    testCanvasDrawing,
    fullDebug,
    screenshotCanvas
};

// Auto-setup shortcuts when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupDebugShortcuts);
} else {
    setupDebugShortcuts();
}

console.log("🔧 Debug functions loaded. Press 'D' for debug, 'T' for test drawing");
console.log("🔧 Debug functions also available via window.debugApp");

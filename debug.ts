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

function fullDebug(): void {
    console.log("🔍 === FULL DEBUG ===");
    debugCanvas();
    debugTextures();
    snapshotCanvas();
    debugRenderState();
    validateWebGPUPipeline();
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
}

// Make functions globally available
window.debugApp = {
    debugCanvas,
    debugTextures,
    snapshotCanvas,
    debugRenderState,
    validateWebGPUPipeline,
    testCanvasDrawing,
    fullDebug
};

// Auto-setup shortcuts when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupDebugShortcuts);
} else {
    setupDebugShortcuts();
}

console.log("🔧 Debug functions loaded. Press 'D' for debug, 'T' for test drawing");
console.log("🔧 Debug functions also available via window.debugApp");

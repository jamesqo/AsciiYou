import type { ASCIIRenderer } from "@/engine/ASCIIRenderer";
import type { DebugTools } from '@/types'

export function debugCanvas(): void {
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

export function debugTextures(): void {
    console.log("🔍 === TEXTURE DEBUG ===");
    if (window.renderer && window.renderer.device) {
        console.log("Camera texture:", window.renderer.camTex);
        console.log("Atlas texture:", window.renderer.atlasTex);
        
        // Check if textures have valid dimensions
        if (window.renderer.camTex) {
            console.log("Camera texture dimensions:", window.renderer.camTex.width, "x", window.renderer.camTex.height);
        }
        if (window.renderer.atlasTex) {
            console.log("Atlas texture dimensions:", window.renderer.atlasTex.width, "x", window.renderer.atlasTex.height);
        }
    }
}

export function snapshotCanvas(): void {
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

export function debugRenderState(): void {
    console.log("🔍 === RENDER STATE DEBUG ===");
    if (window.renderer) {
        console.log("Current uniforms:", window.renderer.uniforms);
        console.log("Current dimensions:", window.renderer.outW, "x", window.renderer.outH);
        console.log("Current contrast:", window.renderer.contrast);
        console.log("Current edge bias:", window.renderer.edgeBias);
        console.log("Current invert:", window.renderer.invert);
    }
}

export function validateWebGPUPipeline(): void {
    console.log("🔍 === WEBGPU PIPELINE VALIDATION ===");
    if (window.renderer) {
        const renderer: ASCIIRenderer = window.renderer;
        console.log("Device:", renderer.device);
        console.log("Compute pipeline:", renderer.computePipeline);
        console.log("Render pipeline:", renderer.renderPipeline);
        console.log("Bind groups:", renderer.computeBindGroup, renderer.renderBindGroup);
        
        // Check if all required components exist
        const hasDevice: boolean = !!renderer.device;
        const hasComputePipeline: boolean = !!renderer.computePipeline;
        const hasRenderPipeline: boolean = !!renderer.renderPipeline;
        const hasBindGroups: boolean = !!(renderer.computeBindGroup && renderer.renderBindGroup);
        
        console.log("Pipeline validation:", {
            device: hasDevice ? "✅" : "❌",
            computePipeline: hasComputePipeline ? "✅" : "❌",
            renderPipeline: hasRenderPipeline ? "✅" : "❌",
            bindGroups: hasBindGroups ? "✅" : "❌"
        });
    }
}

export function testCanvasDrawing(): void {
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

export function debugWebGPUBuffers(): void {
    console.log("🔍 === WEBGPU BUFFER DEBUG ===");
    if (window.renderer) {
        const renderer = window.renderer;
        
        // Check uniform buffer
        if (renderer.uniforms) {
            console.log("Uniforms buffer:", renderer.uniforms);
            console.log("Uniforms size:", renderer.uniforms.size);
            console.log("Uniforms usage:", renderer.uniforms.usage);
        }
        
        // Check if we have access to other buffers
        console.log("Available buffers:", {
            uniforms: !!renderer.uniforms,
            // Add other buffers as they become available
        });
    }
}

export function debugShaderResources(): void {
    console.log("🔍 === SHADER RESOURCES DEBUG ===");
    if (window.renderer) {
        const renderer = window.renderer;
        
        // Check textures
        console.log("Camera texture:", {
            exists: !!renderer.camTex,
            width: renderer.camTex?.width,
            height: renderer.camTex?.height,
            format: renderer.camTex?.format,
            usage: renderer.camTex?.usage
        });
        
        console.log("Atlas texture:", {
            exists: !!renderer.atlasTex,
            width: renderer.atlasTex?.width,
            height: renderer.atlasTex?.height,
            format: renderer.atlasTex?.format,
            usage: renderer.atlasTex?.usage
        });
    }
}

export function testShaderCompilation(): void {
    console.log("🔍 === SHADER COMPILATION TEST ===");
    if (window.renderer && window.renderer.device) {
        const device = window.renderer.device;
        
        // Test compute shader
        try {
            const computeResponse = fetch('src/shaders/computeMask.wgsl');
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
            const renderResponse = fetch('src/shaders/renderMask.wgsl');
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

export function fullDebug(): void {
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

export function screenshotCanvas(): void {
    console.log("📸 === CANVAS SCREENSHOT ===");
    const canvas: HTMLCanvasElement | null = document.getElementById('gfx') as HTMLCanvasElement;
    if (!canvas) {
        console.log("❌ Canvas element not found");
        return;
    }
    
    // Convert to PNG + ASCII and POST JSON to dev server to persist under debug/
    canvas.toBlob(async (blob) => {
        if (!blob) {
            console.log("❌ Failed to create PNG blob from canvas");
            return;
        }
        // 0) Dump current ASCII state
        const ascii = await window.renderer?.dumpASCIIMask();

        // 1) Save screenshot as raw blob
        const res1 = await fetch('/debug/save-screenshot', { method: 'POST', body: blob });
        // 2) Save ASCII as plain text
        const res2 = await fetch('/debug/save-ascii', { method: 'POST', body: (ascii ?? '') });

        if (!res1.ok || !res2.ok) {
            console.log("❌ saveDebugInfo failed:", res1.status, res2.status);
        } else {
            const json1 = await res1.json();
            const json2 = await res2.json();
            console.log("✅ Saved:", json1.file, json2.file);
        }
    }, 'image/png');
}

// Set up keyboard shortcuts
export function attachDebugShortcuts(tools: DebugTools): () => void {
    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'd') tools.fullDebug();
        if (e.key === 't') tools.testCanvasDrawing();
        if (e.key === 's') tools.screenshotCanvas();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
}


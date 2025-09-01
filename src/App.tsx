import React, { useEffect, useRef } from 'react'
import { ASCIIRenderer } from '@/engine/ASCIIRenderer'
import {
    attachDebugShortcuts,
    debugCanvas,
    debugRenderState,
    debugShaderResources,
    debugTextures,
    fullDebug,
    screenshotCanvas,
    snapshotCanvas,
    testCanvasDrawing,
    debugWebGPUBuffers,
    validateWebGPUPipeline
} from '@/util/debugHelpers'
import type { DebugTools } from '@/types'
import { UIProvider } from '@/state/UIContext'
import { uiStore } from '@/state/UIStore'
import { Controls } from '@/components/Controls'

export default function App() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const rendererRef = useRef<ASCIIRenderer | null>(null)

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const video = videoRef.current!
            const canvas = canvasRef.current!
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
                video.srcObject = stream
                await video.play()
                if (cancelled) return

                const renderer = await ASCIIRenderer.initialize(canvas, video)
                window.renderer = renderer
                rendererRef.current = renderer
                uiStore.setRenderer(renderer)
                await renderer.run()
            } catch (e) {
                console.error('❌ init error', e)
            }
        })()
        return () => { cancelled = true }
    }, [])

    // Dev-only: wire debug tools with lifecycle-friendly shortcuts (no window any casts)
    useEffect(() => {
        if (!import.meta.env.DEV) return
        const tools: DebugTools = {
            debugCanvas,
            debugTextures,
            snapshotCanvas,
            debugRenderState,
            validateWebGPUPipeline,
            testCanvasDrawing,
            fullDebug,
            screenshotCanvas
        }
        window.debugTools = tools
        const detach = attachDebugShortcuts(tools)
        return () => detach()
    }, [])

    return (
        <UIProvider>
            <div className="app">
                <div className="header">
                    <div className="title">ASCII Art Webcam</div>
                    <Controls />
                </div>

                <video id="cam" ref={videoRef} autoPlay muted playsInline />
                <div className="canvas-container">
                    <canvas id="gfx" ref={canvasRef} width={1280} height={720} />
                </div>

                <div className="status">Running | Press 'H' for help</div>
            </div>
        </UIProvider>
    )
}

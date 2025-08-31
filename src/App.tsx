import React, { useEffect, useRef, useState } from 'react'
import { WebGPUApp } from './webgpu'
import { DefaultSettings } from './constants'
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
} from './util/debugHelpers'
import type { DebugTools } from './types'

export default function App() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const appRef = useRef<WebGPUApp | null>(null)

    const [width, setWidth] = useState<number>(DefaultSettings.WIDTH)
    const [height, setHeight] = useState<number>(DefaultSettings.HEIGHT)
    const [contrast, setContrast] = useState<number>(DefaultSettings.CONTRAST)
    const [edgeBias, setEdgeBias] = useState<number>(DefaultSettings.EDGE_BIAS)
    const [invert, setInvert] = useState<boolean>(!!DefaultSettings.INVERT)

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

                const app = await WebGPUApp.initialize(canvas, video)
                window.webGPUApp = app
                appRef.current = app
                await app.run()
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

    useEffect(() => {
        const app = appRef.current
        if (!app) return
        app.settings.width = width
        app.settings.height = height
        app.settings.contrast = contrast
        app.settings.edgeBias = edgeBias
        app.settings.invert = invert ? 1.0 : 0.0
        app.updateUniforms().catch(console.error)
    }, [width, height, contrast, edgeBias, invert])

    return (
        <div className="app">
            <div className="header">
                <div className="title">ASCII Art Webcam</div>
                <div className="controls">
                    <div className="control-group">
                        <label>Width:</label>
                        <input type="range" min={40} max={200} step={10} value={width} onChange={e => setWidth(parseInt(e.target.value))} />
                        <span>{width}</span>
                    </div>
                    <div className="control-group">
                        <label>Height:</label>
                        <input type="range" min={30} max={120} step={5} value={height} onChange={e => setHeight(parseInt(e.target.value))} />
                        <span>{height}</span>
                    </div>
                    <div className="control-group">
                        <label>Contrast:</label>
                        <input type="range" min={0.5} max={2.0} step={0.1} value={contrast} onChange={e => setContrast(parseFloat(e.target.value))} />
                        <span>{contrast}</span>
                    </div>
                    <div className="control-group">
                        <label>Edge Bias:</label>
                        <input type="range" min={0.0} max={1.0} step={0.05} value={edgeBias} onChange={e => setEdgeBias(parseFloat(e.target.value))} />
                        <span>{edgeBias}</span>
                    </div>
                    <div className="control-group">
                        <label>Invert:</label>
                        <input type="checkbox" checked={invert} onChange={e => setInvert(e.target.checked)} />
                    </div>
                </div>
            </div>

            <video id="cam" ref={videoRef} autoPlay playsInline />
            <div className="canvas-container">
                <canvas id="gfx" ref={canvasRef} width={1280} height={720} />
            </div>

            <div className="status">Running | Press 'H' for help</div>
        </div>
    )
}

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
import { StoreProvider, useStores } from '@/stores/StoreContext'
import { Controls } from '@/components/Controls'
import { SDPClient } from './service/SDPClient'

export default function App() {
    const { uiStore, huddleStore, signalingStore } = useStores()
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const rendererRef = useRef<ASCIIRenderer | null>(null)

    // runs once on mount
    // won't re-run because the dependency array is empty
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
    // also runs once on mount
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

    const newHuddleClicked = async () => {
        const joinOk = await huddleStore.startNew();
        console.log('joined huddle', joinOk);

        // Wire user video feed into the RTCPeerConnection
        const videoStream = videoRef.current!.srcObject as MediaStream
        // Initialize RTCPeerConnection and start SDP negotiation with server
        await signalingStore.beginServerExchange({
            videoStream,
            sdpUrl: joinOk.sdpNegotiationUrl
        })
    }

    return (
        <div className="app">
            <div className="header">
                <div className="title">ASCII Art Webcam</div>
                <Controls />
                <button onClick={newHuddleClicked}>New huddle</button>
            </div>

            <video id="cam" ref={videoRef} autoPlay muted playsInline />
            <div className="canvas-container">
                <canvas id="gfx" ref={canvasRef} width={1280} height={720} />
            </div>

            <div className="status">Running | Press 'H' for help</div>
        </div>
    )
}

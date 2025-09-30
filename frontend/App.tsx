import React, { useEffect, useRef, useState } from 'react'
import { ASCIIRenderer } from '@/engine/ASCIIRenderer'
import {
    attachDebugShortcuts,
    debugCanvas,
    debugRenderState,
    debugTextures,
    fullDebug,
    screenshotCanvas,
    snapshotCanvas,
    testCanvasDrawing,
    validateWebGPUPipeline
} from '@/util/debugHelpers'
import type { DebugTools } from '@/types'
import { useStores } from '@/stores/StoreContext'
import { FeedControls } from '@/components/FeedControls'
import { ASCIIFeed } from '@/components/ASCIIFeed'
import { VideoFeed } from '@/components/VideoFeed'

export default function App() {
    const { uiStore, huddleStore, streamingStore } = useStores()
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const [joinOpen, setJoinOpen] = useState(false)
    const [joinCode, setJoinCode] = useState("")

    // Dev-only: wire debug tools with lifecycle-friendly shortcuts (no window any casts)
    // Runs once on mount
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
        await streamingStore.startStreaming({
            videoStream,
            token: joinOk.streamingToken
        })
    }

    const handleJoinCodeSubmit = async (joinCode: string) => {
        // NOTE: for now the join code is just the huddle ID,
        // but this may change in the future
        const joinOk = await huddleStore.join(joinCode);
        console.log('joined huddle', joinOk);

        // Wire user video feed into the RTCPeerConnection
        const videoStream = videoRef.current!.srcObject as MediaStream
        // Initialize RTCPeerConnection and start SDP negotiation with server
        await streamingStore.startStreaming({
            videoStream,
            token: joinOk.streamingToken
        })
    }

    const joinHuddleClicked = () => {
        setJoinCode("")
        setJoinOpen(true)
    }

    return (
        <div className="app">
            <div className="header">
                <div className="title">ASCII Art Webcam</div>
                <FeedControls />
                <button onClick={newHuddleClicked}>New huddle</button>
                <button onClick={joinHuddleClicked}>Join huddle</button>
            </div>

            <VideoFeed id="cam" ref={videoRef} autoStart />

            <ASCIIFeed
                videoRef={videoRef}
                width={1280}
                height={720}
                onReady={(renderer: ASCIIRenderer) => {
                    uiStore.setRenderer(renderer)
                }}
                onError={(e: unknown) => console.error('❌ ASCIIFeed init error', e)}
            />

            <div className="status">Running | Press 'H' for help</div>

            {joinOpen && (
                <div className="modal-backdrop">
                    <div className="modal">
                        <div className="title">Enter join code:</div>
                        <input
                            className="modal-input"
                            autoFocus
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    setJoinOpen(false)
                                    handleJoinCodeSubmit(joinCode.trim())
                                }
                            }}
                            placeholder="e.g. h_xxx"
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

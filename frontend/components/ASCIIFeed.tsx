import React, { useEffect, useRef } from "react";
import { ASCIIRenderer } from "@/engine/ASCIIRenderer";

type Props = {
    videoRef: React.RefObject<HTMLVideoElement>;
    width?: number;
    height?: number;
    className?: string;
    onReady?: (renderer: ASCIIRenderer) => void;
    onError?: (err: unknown) => void;
};

export const ASCIIFeed: React.FC<Props> = ({
    videoRef,
    width,
    height,
    className = "canvas-container",
    onReady,
    onError,
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rendererRef = useRef<ASCIIRenderer | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas) return;

            try {
                // Ensure the <video> has data ready to render a frame
                if (video.readyState < 2) {
                    await new Promise<void>((resolve) => {
                        const onData = () => {
                            video.removeEventListener("loadeddata", onData);
                            resolve();
                        };
                        video.addEventListener("loadeddata", onData, { once: true });
                    });
                }

                const renderer = await ASCIIRenderer.initialize(canvas, video);
                // used by debugHelpers.ts
                window.renderer = renderer;
                rendererRef.current = renderer;
                onReady?.(renderer);
                if (!cancelled) await renderer.run();
            } catch (e) {
                if (!cancelled) onError?.(e);
            }
        })();
        return () => { cancelled = true };
    }, [videoRef, onReady, onError]);

    return (
        <div className={className}>
            <canvas id="gfx" ref={canvasRef} width={width} height={height} />
        </div>
    );
};



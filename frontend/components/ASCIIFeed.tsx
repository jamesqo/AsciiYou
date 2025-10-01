import React, { useEffect, useRef } from "react";
import { ASCIIRenderer } from "@/engine/ASCIIRenderer";
import { mountHiddenVideo } from "@/util/streamUtils";

type Props = {
    stream: MediaStream | null; // provided MediaStream is wrapped into a hidden <video>
    width?: number;
    height?: number;
    className?: string;
    onReady?: (renderer: ASCIIRenderer) => void;
    onError?: (err: unknown) => void;
};

export const ASCIIFeed: React.FC<Props> = ({
    stream,
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
        let disposer: (() => void) | null = null;
        (async () => {
            if (!stream) return;
            const canvas = canvasRef.current;
            if (!canvas) return;

            const { video, dispose } = await mountHiddenVideo(stream);
            disposer = dispose;

            try {
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
        return () => {
            cancelled = true;
            disposer?.();
        };
    }, [stream, onReady, onError]);

    return (
        <div className={className}>
            <canvas id="gfx" ref={canvasRef} width={width} height={height} />
        </div>
    );
};



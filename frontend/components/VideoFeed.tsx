import React, { forwardRef, useEffect, useRef } from "react";

type Props = {
  id?: string;
  className?: string;
  muted?: boolean;
  playsInline?: boolean;
  autoStart?: boolean; // when true and no stream provided, capture local camera
  constraints?: MediaStreamConstraints;
  stream?: MediaStream | null; // optional external stream (e.g., remote mediasoup stream)
  onReady?: (stream: MediaStream) => void;
  onError?: (err: unknown) => void;
};

export const VideoFeed = forwardRef<HTMLVideoElement, Props>(function VideoFeed(
  {
    id = "cam",
    className,
    muted = true,
    playsInline = true,
    autoStart = false,
    constraints,
    stream,
    onReady,
    onError,
  },
  ref
) {
  const innerRef = useRef<HTMLVideoElement | null>(null);
  const ownedStreamRef = useRef<MediaStream | null>(null);

  // merge refs
  useEffect(() => {
    if (!ref) return;
    if (typeof ref === "function") {
      ref(innerRef.current);
    } else {
      // @ts-expect-error - readonly in type but assignable at runtime
      ref.current = innerRef.current;
    }
  }, [ref]);

  // Attach provided stream (remote or externally managed)
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    if (stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
    }
  }, [stream]);

  // Optionally capture local camera if no external stream
  useEffect(() => {
    if (!autoStart || stream) return;
    let stopped = false;

    (async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia(
          constraints ?? ({ video: { facingMode: "user" }, audio: false } as MediaStreamConstraints)
        );
        if (stopped) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        ownedStreamRef.current = media;
        const el = innerRef.current!;
        el.srcObject = media;
        await el.play();
        onReady?.(media);
      } catch (e) {
        onError?.(e);
      }
    })();

    return () => {
      stopped = true;
      const owned = ownedStreamRef.current;
      if (owned) {
        owned.getTracks().forEach((t) => t.stop());
        ownedStreamRef.current = null;
      }
    };
  }, [autoStart, constraints, stream, onReady, onError]);

  return (
    <video id={id} className={className} ref={innerRef} autoPlay muted={muted} playsInline={playsInline} />
  );
});



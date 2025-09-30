import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

type Props = {
  id?: string;
  className?: string;
  muted?: boolean;
  playsInline?: boolean;
  stream: MediaStream | null; // external stream (e.g., camera feed, remote mediasoup stream)
};

export const VideoFeed = forwardRef<HTMLVideoElement, Props>(function VideoFeed(
  {
    id = "cam",
    className,
    muted = true,
    playsInline = true,
    stream,
  },
  ref
) {
  const innerRef = useRef<HTMLVideoElement | null>(null);
  // Merge refs -- makes the parent's ref point to the inner ref
  useImperativeHandle(ref, () => innerRef.current as HTMLVideoElement, []);

  // Attach provided stream (remote or externally managed)
  useEffect(() => {
    const videoEl = innerRef.current;
    if (!videoEl) return;
    videoEl.srcObject = stream;
    videoEl.play().catch(() => {});
  }, [stream]);

  return (
    <video id={id} className={className} ref={innerRef} autoPlay muted={muted} playsInline={playsInline} />
  );
});



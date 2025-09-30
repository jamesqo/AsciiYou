import { useCallback, useEffect, useRef, useState } from "react";

type UseCameraOpts = {
  autoStart?: boolean;
  constraints?: MediaStreamConstraints;
};

export function useCamera(opts: UseCameraOpts = {}) {
  const { autoStart = false, constraints } = opts;
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const ownedRef = useRef<MediaStream | null>(null);

  const start = useCallback(async (c?: MediaStreamConstraints) => {
    setError(null);
    setStarting(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia(
        c ?? (constraints ?? ({ video: { facingMode: "user" }, audio: false } as MediaStreamConstraints))
      );
      ownedRef.current = media;
      setStream(media);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setStarting(false);
    }
  }, [constraints]);

  const stop = useCallback(() => {
    const s = ownedRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      ownedRef.current = null;
    }
    setStream(null);
  }, []);

  useEffect(() => {
    if (!autoStart) return;
    let cancelled = false;
    (async () => {
      try {
        await start();
      } catch {
        // error already recorded
      }
      if (cancelled) {
        stop();
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [autoStart, start, stop]);

  return { stream, start, stop, starting, error } as const;
}



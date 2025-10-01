export type MountedVideo = {
    video: HTMLVideoElement;
    dispose: () => void;
};

type MountVideoOpts = {
    container?: HTMLElement; // defaults to document.body
    waitFor?: 'loadeddata' | 'loadedmetadata' | false; // default 'loadeddata'
    autoplay?: boolean;      // default true
    muted?: boolean;         // default true
    playsInline?: boolean;   // default true
};

export async function mountHiddenVideo(stream: MediaStream, opts: MountVideoOpts = {}): Promise<MountedVideo> {
    const {
        container = document.body,
        waitFor = 'loadeddata',
        autoplay = true,
        muted = true,
        playsInline = true,
    } = opts;

    const v = document.createElement('video');
    v.className = 'offscreen-video';
    if (muted) v.muted = true;
    if (playsInline) v.playsInline = true;
    if (autoplay) v.autoplay = true;

    v.srcObject = stream;
    container.appendChild(v);

    if (waitFor === 'loadeddata' && v.readyState < 2) {
        await new Promise<void>((res) => v.addEventListener('loadeddata', () => res(), { once: true }));
    } else if (waitFor === 'loadedmetadata' && v.readyState < 1) {
        await new Promise<void>((res) => v.addEventListener('loadedmetadata', () => res(), { once: true }));
    }

    try { await v.play(); } catch {}

    const dispose = () => {
        try {
            v.pause();
            (v as any).srcObject = null;
            v.remove();
        } catch {}
    };

    return { video: v, dispose };
}



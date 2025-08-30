#!/usr/bin/env python3
# ascii_cam.py  —  CPU-only terminal ASCII video (macOS ok)
import cv2, numpy as np, curses, time, sys, argparse

# Character ramps
RAMP_DENSE  = np.array(list(" .'`^\",:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$"), dtype='<U1')
RAMP_BLOCKS = np.array(list(" ░▒▓█"), dtype='<U1')

def to_ascii_frame(gray, ramp, width=120, use_edges=True, contrast=1.0, invert=False):
    h, w = gray.shape
    new_w = max(20, width)
    new_h = max(6, int(h * (new_w / w) * 0.5))  # char cell aspect fix
    small = cv2.resize(gray, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

    # contrast around midgray
    if contrast != 1.0:
        small = np.clip(((small.astype(np.float32) - 127.5) * contrast) + 127.5, 0, 255).astype(np.uint8)
    if invert:
        small = 255 - small

    if use_edges:
        gx = cv2.Sobel(small, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(small, cv2.CV_32F, 0, 1, ksize=3)
        edge = np.abs(gx) + np.abs(gy)
        edge /= (edge.max() + 1e-6)
    else:
        edge = 0

    # luminance -> ramp index, bias darker on edges
    lum = small.astype(np.float32) / 255.0
    base = lum * (len(ramp) - 1)
    idx = np.clip(base + edge * 0.35 * (len(ramp) - 1), 0, len(ramp) - 1).astype(np.int32)

    return ramp[idx]

def run(stdscr, cam_index=0, width=120, fps_cap=30, mirror=True, use_edges=True, contrast=1.1, invert=False, ramp=RAMP_DENSE):
    curses.curs_set(0)
    stdscr.nodelay(True)

    cap = cv2.VideoCapture(cam_index, cv2.CAP_AVFOUNDATION)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    if not cap.isOpened():
        raise RuntimeError("Could not open webcam. Check macOS Camera permission for your terminal.")

    last = time.time()
    while True:
        if stdscr.getch() == ord('q'):
            break
        ok, frame = cap.read()
        if not ok:
            continue

        if mirror:
            frame = cv2.flip(frame, 1)

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        chars = to_ascii_frame(gray, ramp, width=width, use_edges=use_edges, contrast=contrast, invert=invert)

        h, w = chars.shape
        max_y, max_x = stdscr.getmaxyx()
        h = min(h, max_y - 1)
        w = min(w, max_x - 1)
        for y in range(h):
            stdscr.addstr(y, 0, "".join(chars[y, :w]))

        now = time.time()
        dt = now - last
        last = now
        fps = 1.0 / dt if dt > 0 else 0
        stdscr.addstr(min(h, max_y - 1), 0, f"q to quit | {fps:5.1f} FPS")
        stdscr.clrtoeol()
        stdscr.refresh()

        if fps_cap:
            time.sleep(max(0, (1.0 / fps_cap) - (time.time() - now)))

    cap.release()

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--cam", type=int, default=0, help="Camera index (default: 0)")
    p.add_argument("--width", type=int, default=120, help="Character width (default: 120)")
    p.add_argument("--fps-cap", type=int, default=30, help="FPS cap (0 = uncapped)")
    p.add_argument("--mirror", dest="mirror", action="store_true", help="Mirror the preview (default)")
    p.add_argument("--no-mirror", dest="mirror", action="store_false", help="Disable mirroring")
    p.add_argument("--no-edges", dest="edges", action="store_false", help="Disable edge bias")
    p.add_argument("--contrast", type=float, default=1.1, help="Contrast multiplier")
    p.add_argument("--invert", action="store_true", help="Invert luminance mapping")
    p.add_argument("--blocks", action="store_true", help="Use block character ramp ░▒▓█")
    p.set_defaults(mirror=True, edges=True)
    args = p.parse_args()

    ramp = RAMP_BLOCKS if args.blocks else RAMP_DENSE

    try:
        curses.wrapper(
            run,
            cam_index=args.cam,
            width=args.width,
            fps_cap=args.fps_cap,
            mirror=args.mirror,
            use_edges=args.edges,
            contrast=args.contrast,
            invert=args.invert,
            ramp=ramp,
        )
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()

#!/usr/bin/env python3

"""
img2ascii.py — Convert images to ASCII art (with optional edge-aware glyph selection).

Usage:
  python img2ascii.py input.jpg --width 120 --invert --no-edges --out out.txt

Notes:
- Works best with photos or logos that have decent contrast.
- The "edge-aware" mode uses Sobel gradients to emphasize outlines with glyphs like "/\\|_".
- Outputs plain text by default. If you use a monospaced font, the aspect ratio will look correct.
"""
import argparse
import numpy as np
from PIL import Image, ImageOps, ImageFilter
import sys
from pathlib import Path
from scipy import ndimage as ndi

# Character ramps from light -> dark (you can tweak these)
RAMP_STANDARD = " .:-=+*#%@"
RAMP_DENSE    = " .'`^\",:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$"
RAMP_EDGES    = " .,-~:;+i!lI?/\\|()1{}[]*tfrxjvczXYUJCLQ0OZmwqpdbkhao#MW&B8%@"
RAMP_BLOCKS   = " ░▒▓█"  # for terminal blocks (looks great where supported)

def to_ascii(
    img: Image.Image,
    width: int = 120,
    invert: bool = False,
    ramp: str = RAMP_DENSE,
    edge_aware: bool = True,
    contrast: float = 1.0,
    sharpen: bool = False,
):
    # Convert to grayscale early; keep a copy for edges
    gray = ImageOps.grayscale(img)
    if sharpen:
        gray = gray.filter(ImageFilter.UnsharpMask(radius=1.5, percent=150, threshold=3))
    # Maintain aspect ratio, but compensate for character cell aspect (~2:1 height:width in many terminals)
    w, h = gray.size
    if w <= 0 or h <= 0:
        raise ValueError(f"Invalid image dimensions: {w}x{h}")
    
    new_w = max(4, min(int(width), 10000))  # Cap at reasonable max
    new_h = max(2, int(h * (new_w / w) * 0.5))  # 0.5 compensates typical terminal aspect
    gray = gray.resize((new_w, new_h), Image.Resampling.BICUBIC)

    # Optionally compute edges with Sobel to pick glyphs that "feel" like lines
    edge_mag = None
    if edge_aware:
        # Simple Sobel on numpy
        g = np.asarray(gray, dtype=np.float32) / 255.0
        
        gx = ndi.sobel(g, axis=1, mode="reflect")  # x-gradient
        gy = ndi.sobel(g, axis=0, mode="reflect")  # y-gradient
        edge_mag = np.abs(gx) + np.abs(gy) # L1 norm is good enough for bias
        edge_mag = (edge_mag / (edge_mag.max() + 1e-6))

    # Adjust contrast
    arr = np.asarray(gray, dtype=np.float32) / 255.0
    if contrast != 1.0 and contrast > 0:  # Validate contrast value
        # Simple contrast around 0.5
        arr = ((arr - 0.5) * contrast) + 0.5
        arr = np.clip(arr, 0.0, 1.0)

    if invert:
        arr = 1.0 - arr

    ramp_len = len(ramp)
    # If edge-aware, blend luminance rank with edge magnitude to bias toward darker chars on edges
    if edge_aware and edge_mag is not None and edge_mag.shape == arr.shape:
        # Weight edges so strong edges choose denser glyphs
        # Blend factor: more edge => push toward darker/denser end
        # Map luminance to index, then subtract a portion based on edge strength
        base_idx = (arr * (ramp_len - 1)).astype(np.float32)
        bias = (edge_mag * 0.35) * (ramp_len - 1)  # tuneable
        idx = np.clip(base_idx + bias, 0, ramp_len - 1).astype(np.int32)
    else:
        idx = (arr * (ramp_len - 1)).astype(np.int32)

    # Build lines
    lut = np.array(list(ramp), dtype='<U1')
    chars = lut[idx]                         # shape (H, W), all in NumPy/C
    lines = ["".join(row) for row in chars]  # still one join per line
    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", help="Path to input image")
    parser.add_argument("--width", type=int, default=120, help="Output width in characters (default: 120)")
    parser.add_argument("--invert", action="store_true", help="Invert brightness mapping")
    parser.add_argument("--no-edges", dest="edge_aware", action="store_false", help="Disable edge-aware mode")
    parser.add_argument("--blocks", action="store_true", help="Use terminal block characters (░▒▓█)")
    parser.add_argument("--dense", action="store_true", help="Use dense ramp for smoother tones (default)")
    parser.add_argument("--standard", action="store_true", help="Use short standard ramp")
    parser.add_argument("--contrast", type=float, default=1.0, help="Contrast multiplier (e.g., 1.2 for more pop)")
    parser.add_argument("--sharpen", action="store_true", help="Sharpen before converting (can help edges)")
    parser.add_argument("--out", type=str, default="", help="Write result to this file instead of STDOUT")
    args = parser.parse_args()

    ramp = RAMP_DENSE
    if args.standard:
        ramp = RAMP_STANDARD
    if args.blocks:
        ramp = RAMP_BLOCKS

    # Validate arguments
    if args.width <= 0:
        print(f"Width must be positive, got: {args.width}", file=sys.stderr)
        sys.exit(1)
    
    if args.contrast <= 0:
        print(f"Contrast must be positive, got: {args.contrast}", file=sys.stderr)
        sys.exit(1)

    try:
        img = Image.open(args.input)
    except (FileNotFoundError, PermissionError, OSError) as e:
        print(f"Failed to open image: {e}", file=sys.stderr)
        sys.exit(1)

    ascii_art = to_ascii(
        img,
        width=args.width,
        invert=args.invert,
        ramp=ramp,
        edge_aware=args.edge_aware,
        contrast=args.contrast,
        sharpen=args.sharpen,
    )

    if args.out:
        Path(args.out).write_text(ascii_art, encoding='utf-8')
    else:
        print(ascii_art)

if __name__ == "__main__":
    main()

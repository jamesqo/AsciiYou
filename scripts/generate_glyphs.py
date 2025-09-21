#!/usr/bin/env python3
"""
Generate individual glyph PNGs for characters in the dense ASCII ramp.

Requirements:
  - Pillow (PIL)

This script renders each character from RAMP_DENSE using a chosen font family
and saves each glyph as a PNG
with the filename including the uniform glyph cell dimensions (w x h),
e.g., "#_32x40.png" or "space_32x40.png".

Example:
  python demos/generate_glyphs.py --output-dir glyphs --font-family Inconsolata --font-size 32 --cols 16

TODO: the generated atlas looks a bit odd with characters such as 'p' and 'q' elevated
If we want to avoid this behavior when rendering glyphs, we must treat each row as a 'line box'
"""

import argparse
import os
import sys
from typing import Optional, Tuple

from PIL import Image, ImageDraw, ImageFont


# Character ramp (dense) — matches the web app
RAMP_DENSE = " .'`^\",:;~+_-?|\\/][}{)(tfrxYU0OZ#MW&8B@$"


def expand_user_and_vars(path: str) -> str:
    return os.path.expandvars(os.path.expanduser(path))


def try_load_font(font_path: str, font_size: int) -> Optional[ImageFont.FreeTypeFont]:
    try:
        return ImageFont.truetype(font_path, font_size)
    except (OSError, IOError):
        return None


def find_font_variant(
    font_family: str,
    font_size: int,
    explicit_path: Optional[str],
    want_bold: bool = True,
    extra_search_dirs: Optional[Tuple[str, ...]] = None,
) -> Tuple[Optional[ImageFont.FreeTypeFont], str, bool]:
    """
    Attempt to load the requested font family.

    Returns (font, path_used, is_true_bold)
    - font may be None if not found
    - is_true_bold indicates whether the loaded font is a bold face
    """
    if explicit_path:
        path = expand_user_and_vars(explicit_path)
        font = try_load_font(path, font_size)
        if font is not None:
            # Assume explicit path points to bold or desired variant
            return font, path, want_bold

    candidate_dirs = [
        "./assets/fonts",
        "./fonts",
        os.path.join(os.path.dirname(__file__), "../assets/fonts"),
        "/Library/Fonts",
        os.path.expanduser("~/Library/Fonts"),
        "/System/Library/Fonts",
        "/System/Library/Fonts/Supplemental",
    ]
    if extra_search_dirs:
        candidate_dirs = list(extra_search_dirs) + candidate_dirs

    fam = font_family.strip()
    # Prepare candidate file names
    bold_candidates = [
        f"{fam}-Bold.ttf",
        f"{fam} Bold.ttf",
        f"{fam}-Bold.otf",
        f"{fam}-Bold.ttc",
        f"{fam}-SemiBold.ttf",
        f"{fam}-DemiBold.ttf",
    ]
    regular_candidates = [
        f"{fam}-Regular.ttf",
        f"{fam}.ttf",
        f"{fam}.otf",
        f"{fam}.ttc",
    ]

    if want_bold:
        # Try bold faces first
        for d in candidate_dirs:
            for f in bold_candidates:
                path = os.path.join(expand_user_and_vars(d), f)
                if os.path.isfile(path):
                    font = try_load_font(path, font_size)
                    if font is not None:
                        return font, path, True

    for d in candidate_dirs:
        for f in regular_candidates:
            path = os.path.join(expand_user_and_vars(d), f)
            if os.path.isfile(path):
                font = try_load_font(path, font_size)
                if font is not None:
                    return font, path, False

    # Try by font name via FreeType — not always supported
    if want_bold:
        for name in (f"{fam}-Bold", f"{fam} Bold"):
            try:
                font = ImageFont.truetype(name, font_size)
                return font, f"{name} (system)", True
            except (OSError, IOError):
                pass
    try:
        font = ImageFont.truetype(fam, font_size)
        return font, f"{fam} (system)", False
    except (OSError, IOError):
        pass

    return None, "", False


def sanitize_char_for_filename(ch: str) -> str:
    if ch == " ":
        return "space"
    if ch in "\\/|:*?\"<>":
        return f"char_{ord(ch)}"
    # Use visible character directly
    return ch


def measure_glyph_bbox(
    ch: str,
    font: ImageFont.FreeTypeFont,
    bg: Tuple[int, int, int],
) -> Tuple[int, int, Tuple[int, int, int, int]]:
    # Temporary canvas to measure text bbox precisely
    canvas_size = 4 * max(32, font.size)
    temp_img = Image.new("RGB", (canvas_size, canvas_size), bg)
    temp_draw = ImageDraw.Draw(temp_img)
    # Measure with baseline anchor so widths match how we place text later
    bbox = temp_draw.textbbox((0, 0), ch, font=font, anchor="ls")
    tw = max(1, bbox[2] - bbox[0])
    th = max(1, bbox[3] - bbox[1])
    return tw, th, bbox


def draw_glyph_to_cell(
    ch: str,
    font: ImageFont.FreeTypeFont,
    fg: Tuple[int, int, int],
    bg: Tuple[int, int, int],
    cell_w: int,
    cell_h: int,
    bottom_padding: int,
) -> Image.Image:
    img = Image.new("RGB", (cell_w, cell_h), bg)
    draw = ImageDraw.Draw(img)
    # Horizontal centering and bottom-justified baseline with padding
    bbox = draw.textbbox((0, 0), ch, font=font, anchor="ls")
    tw = max(1, bbox[2] - bbox[0])
    # Use font descent to compute baseline from bottom
    try:
        _ascent, descent = font.getmetrics()
    except (AttributeError, TypeError, ValueError):
        descent = int(round(font.size * 0.25))
    tx = (cell_w - tw) // 2
    # Place baseline so bottom padding is respected; top padding becomes >= specified padding
    ty = cell_h - max(1, bottom_padding) - descent
    draw.text((tx, ty), ch, font=font, fill=fg, anchor="ls")
    return img


def normalize_tag(text: str) -> str:
    t = text.strip().lower().replace(" ", "-")
    # Keep alnum, dash, underscore only
    return "".join(ch for ch in t if (ch.isalnum() or ch in "-_"))


def get_font_tag(font: ImageFont.FreeTypeFont) -> str:
    try:
        family, style = font.getname()
    except (AttributeError, TypeError, ValueError):
        family, style = ("font", "regular")
    return normalize_tag(f"{family}-{style}")


def create_atlas_image(
    ramp: str,
    font: ImageFont.FreeTypeFont,
    fg: Tuple[int, int, int],
    bg: Tuple[int, int, int],
    cell_w: int,
    cell_h: int,
    cols: int,
    bottom_padding: int,
) -> Image.Image:
    rows = (len(ramp) + cols - 1) // cols
    atlas = Image.new("RGB", (cols * cell_w, rows * cell_h), bg)
    draw = ImageDraw.Draw(atlas)

    for idx, ch in enumerate(ramp):
        r = idx // cols
        c = idx % cols
        x0 = c * cell_w
        y0 = r * cell_h

        # Measure character (use baseline anchor)
        bbox = draw.textbbox((0, 0), ch, font=font, anchor="ls")
        tw = max(1, bbox[2] - bbox[0])
        # Bottom-justify using measured bbox; horizontally center
        tx = x0 + (cell_w - tw) // 2
        ty = y0 + cell_h - max(1, bottom_padding) - bbox[3]

        # Draw character
        draw.text((tx, ty), ch, font=font, fill=fg, anchor="ls")

    return atlas


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate glyph PNGs for RAMP_DENSE using a specified font family.")
    parser.add_argument("--output-dir", default="assets/glyphs", help="Directory to save glyph PNGs")
    parser.add_argument("--font-path", default="assets/fonts/FiraCode-Bold.ttf", help="Explicit path to font file (.ttf/.otf)")
    parser.add_argument("--font-family", default="Fira Code", help="Font family name to search for (e.g., Inconsolata, Menlo)")
    parser.add_argument("--weight", choices=["regular", "bold"], default="bold", help="Desired font weight; loads bold if available, else regular")
    parser.add_argument("--font-size", type=int, default=36, help="Font size in pixels")
    parser.add_argument("--padding", type=int, default=4, help="Padding around glyph bbox (pixels)")
    parser.add_argument("--fg", default="#ffffff", help="Foreground color (hex like #ffffff)")
    parser.add_argument("--bg", default="#000000", help="Background color (hex like #000000)")
    parser.add_argument("--cols", type=int, default=16, help="Number of columns in the atlas grid")

    args = parser.parse_args()

    def parse_hex_color(s: str) -> Tuple[int, int, int]:
        s = s.strip()
        if s.startswith("#"):
            s = s[1:]
        if len(s) == 3:
            s = "".join([c * 2 for c in s])
        if len(s) != 6:
            raise ValueError("Color must be #rgb or #rrggbb")
        return tuple(int(s[i : i + 2], 16) for i in (0, 2, 4))

    fg = parse_hex_color(args.fg)
    bg = parse_hex_color(args.bg)

    want_bold = args.weight == "bold"
    font, font_path_used, is_true_bold = find_font_variant(
        font_family=args.font_family,
        font_size=args.font_size,
        explicit_path=args.font_path or None,
        want_bold=want_bold,
    )
    if font is None:
        print(f"ERROR: Could not load font family '{args.font_family}'. Install it or pass --font-path.")
        sys.exit(1)

    os.makedirs(args.output_dir, exist_ok=True)

    if want_bold and is_true_bold:
        print(f"Loaded bold font: {font_path_used}")
    else:
        print(f"Loaded font: {font_path_used}")

    print(f"Generating {len(RAMP_DENSE)} glyphs to: {args.output_dir}")

    # First pass: measure all glyph bbox sizes
    measured_widths = []
    measured_heights = []
    bboxes = {}
    for ch in RAMP_DENSE:
        gw, gh, bbox = measure_glyph_bbox(
            ch=ch,
            font=font,
            bg=bg,
        )
        measured_widths.append(gw)
        measured_heights.append(gh)
        bboxes[ch] = (gw, gh, bbox)

    # Infer uniform cell size from measured glyph bbox sizes
    max_w = max(measured_widths) if measured_widths else args.font_size
    max_h = max(measured_heights) if measured_heights else args.font_size
    cell_w = max_w + 2 * args.padding
    cell_h = max_h + 2 * args.padding
    print(f"Inferred cell size: {cell_w}x{cell_h} (w x h)")

    # Second pass: render and save fixed-size glyph PNGs (filenames include uniform cell size)
    for ch in RAMP_DENSE:
        glyph_img = draw_glyph_to_cell(
            ch=ch,
            font=font,
            fg=fg,
            bg=bg,
            cell_w=cell_w,
            cell_h=cell_h,
            bottom_padding=args.padding,
        )

        safe_name = sanitize_char_for_filename(ch)
        filename = f"{safe_name}_{cell_w}x{cell_h}.png"
        out_path = os.path.join(args.output_dir, filename)
        glyph_img.save(out_path, "PNG")

    # Create an atlas written into assets/
    font_tag = get_font_tag(font)
    atlas_filename = f"dense_atlas_{font_tag}_{cell_w}x{cell_h}.png"
    assets_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets"))
    os.makedirs(assets_dir, exist_ok=True)
    atlas_path = os.path.join(assets_dir, atlas_filename)
    atlas_img = create_atlas_image(
        ramp=RAMP_DENSE,
        font=font,
        fg=fg,
        bg=bg,
        cell_w=cell_w,
        cell_h=cell_h,
        cols=args.cols,
        bottom_padding=args.padding,
    )
    atlas_img.save(atlas_path, "PNG")
    print(f"Created atlas: {atlas_path} ({atlas_img.width}x{atlas_img.height})")

    print("Done.")


if __name__ == "__main__":
    main()



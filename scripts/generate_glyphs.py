#!/usr/bin/env python3

"""
generate_glyphs.py — Generate character glyph images for ASCII art webcam app.

This script creates a set of PNG images for each character in the ASCII ramps,
which can be used as texture atlases in the WebGPU application.

Usage:
  python scripts/generate_glyphs.py
"""

import os
from PIL import Image, ImageDraw, ImageFont
import argparse

# Character ramps (same as in the web app)
RAMP_DENSE = " .'`^\",:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$"
RAMP_BLOCKS = " ░▒▓█"

def create_glyph_image(char, size=32, font_size=24, bg_color=(0, 0, 0), fg_color=(255, 255, 255)):
    """Create a single glyph image."""
    # Create image with padding
    img = Image.new('RGB', (size, size), bg_color)
    draw = ImageDraw.Draw(img)
    
    # Try to use a monospace font
    try:
        # Try system monospace fonts
        font_names = ['Courier New', 'Monaco', 'Menlo', 'Consolas', 'DejaVu Sans Mono']
        font = None
        
        for font_name in font_names:
            try:
                font = ImageFont.truetype(font_name, font_size)
                break
            except:
                continue
        
        if font is None:
            # Fallback to default font
            font = ImageFont.load_default()
            
    except Exception:
        font = ImageFont.load_default()
    
    # Calculate text position to center it
    bbox = draw.textbbox((0, 0), char, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    x = (size - text_width) // 2
    y = (size - text_height) // 2
    
    # Draw the character
    draw.text((x, y), char, fill=fg_color, font=font)
    
    return img

def create_atlas(ramp, cols=16, cell_size=32, output_path="assets/glyphs.png"):
    """Create a texture atlas from a character ramp."""
    # Calculate grid dimensions
    rows = (len(ramp) + cols - 1) // cols  # Ceiling division
    
    # Create atlas image
    atlas_width = cols * cell_size
    atlas_height = rows * cell_size
    atlas = Image.new('RGB', (atlas_width, atlas_height), (0, 0, 0))
    
    # Place each character
    for i, char in enumerate(ramp):
        row = i // cols
        col = i % cols
        
        x = col * cell_size
        y = row * cell_size
        
        # Create individual glyph image
        glyph = create_glyph_image(char, cell_size)
        
        # Paste into atlas
        atlas.paste(glyph, (x, y))
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # Save atlas
    atlas.save(output_path, 'PNG')
    print(f"Created atlas: {output_path} ({atlas_width}x{atlas_height})")
    
    return atlas

def create_individual_glyphs(ramp, output_dir="assets/glyphs", cell_size=32):
    """Create individual glyph images."""
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    for i, char in enumerate(ramp):
        # Create filename-safe character name
        if char == ' ':
            char_name = 'space'
        elif char in '\\/|':
            char_name = f'char_{ord(char)}'
        else:
            char_name = char
        
        # Create glyph image
        glyph = create_glyph_image(char, cell_size)
        
        # Save individual file
        output_path = os.path.join(output_dir, f"{char_name}.png")
        glyph.save(output_path, 'PNG')
    
    print(f"Created {len(ramp)} individual glyphs in: {output_dir}")

def main():
    parser = argparse.ArgumentParser(description="Generate character glyph images for ASCII art")
    parser.add_argument("--output-dir", default="assets", help="Output directory for assets")
    parser.add_argument("--cell-size", type=int, default=32, help="Size of each glyph cell in pixels")
    parser.add_argument("--cols", type=int, default=16, help="Number of columns in atlas")
    parser.add_argument("--individual", action="store_true", help="Also create individual glyph files")
    
    args = parser.parse_args()
    
    print("Generating ASCII art glyph assets...")
    
    # Create assets directory
    os.makedirs(args.output_dir, exist_ok=True)
    
    # Generate dense ramp atlas
    dense_atlas_path = os.path.join(args.output_dir, "dense_atlas.png")
    create_atlas(RAMP_DENSE, args.cols, args.cell_size, dense_atlas_path)
    
    # Generate blocks ramp atlas
    blocks_atlas_path = os.path.join(args.output_dir, "blocks_atlas.png")
    create_atlas(RAMP_BLOCKS, args.cols, args.cell_size, blocks_atlas_path)
    
    # Create individual glyphs if requested
    if args.individual:
        dense_glyphs_dir = os.path.join(args.output_dir, "dense_glyphs")
        blocks_glyphs_dir = os.path.join(args.output_dir, "blocks_glyphs")
        standard_glyphs_dir = os.path.join(args.output_dir, "standard_glyphs")
        
        create_individual_glyphs(RAMP_DENSE, dense_glyphs_dir, args.cell_size)
        create_individual_glyphs(RAMP_BLOCKS, blocks_glyphs_dir, args.cell_size)
    
    # Create metadata file
    metadata = {
        "dense_atlas": {
            "path": "dense_atlas.png",
            "cols": args.cols,
            "rows": (len(RAMP_DENSE) + args.cols - 1) // args.cols,
            "cell_size": args.cell_size,
            "characters": RAMP_DENSE
        },
        "blocks_atlas": {
            "path": "blocks_atlas.png",
            "cols": args.cols,
            "rows": (len(RAMP_BLOCKS) + args.cols - 1) // args.cols,
            "cell_size": args.cell_size,
            "characters": RAMP_BLOCKS
        },

    }
    
    import json
    metadata_path = os.path.join(args.output_dir, "metadata.json")
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Created metadata: {metadata_path}")
    print("Glyph generation complete!")

if __name__ == "__main__":
    main()

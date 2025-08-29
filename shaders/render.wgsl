struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VSOut {
  let pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  let p = pos[vi];
  return VSOut(vec4<f32>(p, 0.0, 1.0), p * 0.5 + 0.5);
}

@group(0) @binding(0) var<storage, read> idx: array<u32>;
@group(0) @binding(1) var glyphAtlas: texture_2d<f32>;
@group(0) @binding(2) var atlasSamp: sampler;
@group(0) @binding(3) var<uniform> U: Uniforms;

struct Uniforms {
  outW: f32, outH: f32, edgeBias: f32, contrast: f32, invert: f32,
  cols: f32, rows: f32, rampLen: f32, cellW: f32, cellH: f32, atlasW: f32, atlasH: f32,
};

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  // Which cell are we in?
  let flipped = 1.0 - in.uv;
  let px = flipped * vec2<f32>(U.outW, U.outH);
  let cx = clamp(u32(px.x), 0u, u32(U.outW)-1u);
  let cy = clamp(u32(px.y), 0u, u32(U.outH)-1u);
  let i  = idx[cy * u32(U.outW) + cx];            // ASCII index

  // UV within the cell (0..1)
  let frac = fract(px);

  // Atlas tile for index i
  let cols = u32(U.cols);
  let u = i % cols;
  let v = i / cols;

  let tileSize = vec2<f32>(U.cellW / U.atlasW, U.cellH / U.atlasH);
  let tileOrigin = vec2<f32>(f32(u) * tileSize.x, f32(v) * tileSize.y);
  let uv = tileOrigin + frac * tileSize;

  let g = textureSample(glyphAtlas, atlasSamp, uv).r; // glyph luminance
  return vec4<f32>(g, g, g, 1.0);
}

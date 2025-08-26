struct Uniforms {
  outW: f32, outH: f32, edgeBias: f32, contrast: f32, invert: f32,
  cols: f32, rows: f32, cellPx: f32, atlasW: f32, atlasH: f32,
};

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var cam : texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> idx: array<u32>;
@group(0) @binding(3) var<uniform> U: Uniforms;

fn luma(c: vec3<f32>) -> f32 { 
  return dot(c, vec3<f32>(0.299, 0.587, 0.114)); 
}

@compute @workgroup_size(16,16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u32(U.outW) || gid.y >= u32(U.outH)) { 
    return; 
  }
  
  // Map cell center to camera UV
  let uv = vec2<f32>((f32(gid.x)+0.5)/U.outW, (f32(gid.y)+0.5)/U.outH);

  // Sobel 3x3 in source space
  let texSize = vec2<f32>(textureDimensions(cam, 0)); // use mipmap level 0 -- explicit level required for compute shaders
  let texel   = 1.0 / texSize;

  var L: array<array<f32,3>,3>;
  for (var j:i32=-1; j<=1; j++){
    for (var i:i32=-1; i<=1; i++){
      let coord = clamp(uv + vec2<f32>(f32(i),f32(j))*texel, vec2<f32>(0.0), vec2<f32>(1.0));
      L[j+1][i+1] = luma(textureSampleLevel(cam, samp, coord, 0.0).rgb); // use mipmap level 0 -- explicit level required for compute shaders
    }
  }

  // Sobel gradients
  let gx = L[0][0] + 2.0*L[1][0] + L[2][0] - L[0][2] - 2.0*L[1][2] - L[2][2];
  let gy = L[0][0] + 2.0*L[0][1] + L[0][2] - L[2][0] - 2.0*L[2][1] - L[2][2];
  let edge = sqrt(gx*gx + gy*gy);

  // Luminance at center
  var lum: f32 = L[1][1];

  // Contrast adjustment
  if (U.contrast != 1.0) {
    lum = ((lum - 0.5) * U.contrast) + 0.5;
    lum = clamp(lum, 0.0, 1.0);
  }

  // Invert if requested
  if (U.invert > 0.5) {
    lum = 1.0 - lum;
  }

  // Map to ASCII index with edge bias
  // TODO must be changed if we want to support different ramps
  let base = lum * 69.0; // 70 chars in RAMP_DENSE
  let bias = edge * U.edgeBias * 69.0;
  let idx_val = clamp(base + bias, 0.0, 69.0);
  
  let cell_idx = gid.y * u32(U.outW) + gid.x;
  idx[cell_idx] = u32(idx_val);
}

struct VSOut { @builtin(position) pos: vec4<f32>; };

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VSOut {
  var p = array<vec2<f32>, 3>(
    vec2(-1.0, -3.0),
    vec2(-1.0,  1.0),
    vec2( 3.0,  1.0)
  );
  return VSOut(vec4(p[vi], 0.0, 1.0));
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
  return vec4(1.0, 0.0, 1.0, 1.0);  // magenta
}

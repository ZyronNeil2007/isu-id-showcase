// GLSL sources. All lit materials share the COMMON chunk: procedural studio environment,
// PCSS-style soft shadows, GGX-ish env reflections and ACES tone mapping.
const V = '#version 300 es\n';
const P = 'precision highp float;\nprecision highp int;\nprecision highp sampler2DShadow;\n';

export const COMMON = `
uniform vec3 uCam; uniform float uMood; uniform vec3 uKeyDir; uniform float uExposure;
uniform mat4 uLightVP; uniform sampler2DShadow uShadow; uniform sampler2D uShadowRaw; uniform vec4 uSh; // x bias, y uv-per-depth, z strength, w on
const float PI = 3.14159265359;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 vogel(int i, int n, float phi){ float r = sqrt((float(i) + .5) / float(n)); float t = float(i) * 2.399963 + phi; return r * vec2(cos(t), sin(t)); }

float softbox(vec3 d, vec3 c, vec3 up, vec2 hs, float soft){
  float k = dot(d, c); if (k <= 0.02) return 0.0;
  vec3 r = d / k; vec3 right = normalize(cross(up, c)); vec3 u2 = cross(c, right);
  vec2 q = abs(vec2(dot(r, right), dot(r, u2)));
  vec2 e = 1.0 - smoothstep(hs - soft, hs + soft, q); return e.x * e.y;
}
vec3 envColor(vec3 d, float rough){
  float soft = 0.04 + rough * 0.6;
  vec3 sky = mix(vec3(0.98, 0.965, 0.93) * 0.92, vec3(0.05, 0.095, 0.072), uMood);
  vec3 hor = mix(vec3(0.90, 0.875, 0.82) * 0.78, vec3(0.028, 0.058, 0.044), uMood);
  vec3 flr = mix(vec3(0.46, 0.42, 0.35) * 0.55, vec3(0.012, 0.022, 0.017), uMood);
  vec3 c = d.y > 0.0 ? mix(hor, sky, smoothstep(0.0, 0.85, d.y)) : mix(hor, flr, smoothstep(0.0, 0.45, -d.y));
  float boost = mix(1.0, 2.4, uMood);
  float k1 = softbox(d, normalize(vec3(-0.55, 0.42, 0.72)), vec3(0, 1, 0), vec2(0.5, 0.72), soft);
  float k2 = softbox(d, normalize(vec3(0.95, 0.10, 0.22)), vec3(0, 1, 0), vec2(0.16, 1.0), soft);
  float k3 = softbox(d, normalize(vec3(0.10, 0.96, -0.18)), vec3(0, 0, 1), vec2(0.8, 0.7), soft);
  float k4 = softbox(d, normalize(vec3(-0.35, 0.25, -0.92)), vec3(0, 1, 0), vec2(0.9, 0.5), soft);
  c += vec3(1.0, 0.975, 0.93) * (k1 * 3.4 + k3 * 1.5) * boost + vec3(0.92, 1.0, 0.96) * k2 * 2.2 * boost + vec3(1.0, 0.96, 0.88) * k4 * 1.3 * boost;
  return c;
}
vec3 irradiance(vec3 n){
  vec3 up = mix(vec3(0.95, 0.93, 0.88), vec3(0.055, 0.105, 0.078), uMood);
  vec3 dn = mix(vec3(0.44, 0.40, 0.34), vec3(0.016, 0.028, 0.022), uMood);
  vec3 c = mix(dn, up, n.y * 0.5 + 0.5);
  c += vec3(1.0, 0.97, 0.92) * pow(max(dot(n, normalize(vec3(-0.55, 0.42, 0.72))), 0.0), 1.4) * mix(0.42, 0.7, uMood);
  return c;
}
vec3 keyColor(){ return mix(vec3(1.0, 0.965, 0.9) * 2.3, vec3(1.0, 0.98, 0.92) * 3.0, uMood); }
vec3 envBRDF(vec3 F0, float rough, float NoV){
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022); const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1; float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y; vec2 AB = vec2(-1.04, 1.04) * a004 + r.zw;
  return F0 * AB.x + AB.y;
}
float shadowAtN(vec3 wp, vec3 n, int cnt){
  if (uSh.w < 0.5) return 1.0;
  vec3 p = wp + n * uSh.x;
  vec3 sc = (uLightVP * vec4(p, 1.0)).xyz * 0.5 + 0.5;
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  float phi = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  float bs = 0.0, bn = 0.0;
  for (int i = 0; i < 10; i++){
    vec2 o = vogel(i, 10, phi) * 0.02;
    float d = texture(uShadowRaw, sc.xy + o).r;
    if (d < sc.z - 0.0012){ bs += d; bn += 1.0; }
  }
  if (bn < 0.5) return 1.0;
  float pen = (sc.z - bs / bn) * uSh.y;
  float r = clamp(pen, 0.0009, 0.04);
  float s = 0.0;
  for (int i = 0; i < 32; i++){ if (i >= cnt) break; s += texture(uShadow, vec3(sc.xy + vogel(i, cnt, phi + 1.7) * r, sc.z - 0.0009)); }
  return mix(1.0, s / float(cnt), uSh.z);
}
float shadowAt(vec3 wp, vec3 n){ return shadowAtN(wp, n, 16); }
vec3 aces(vec3 x){ x *= 0.62; return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 finish(vec3 c){ c = aces(c * uExposure); vec3 g = pow(c, vec3(1.0 / 2.2)); return g + (hash12(gl_FragCoord.xy + 7.0) - 0.5) / 255.0; }
`;

// ---------------------------------------------------------------- background
export const BG_VS = V + `out vec2 vP; void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vP = p; gl_Position = vec4(p * 2.0 - 1.0, 0.9999, 1.0); }`;
export const BG_FS = V + P + `
in vec2 vP; out vec4 o; uniform float uMood; uniform vec2 uRes; uniform vec2 uSpot; uniform float uExposure;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 q = (vP - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float d = length(q - uSpot);
  vec3 lc = mix(vec3(0.80, 0.775, 0.715), vec3(0.985, 0.972, 0.94), exp(-d * d * 1.6));
  lc *= 1.0 - 0.16 * smoothstep(0.35, 1.2, length(q));
  vec3 dc = mix(vec3(0.0045, 0.012, 0.0085), vec3(0.036, 0.092, 0.062), exp(-d * d * 2.4));
  dc += vec3(0.0, 0.03, 0.012) * exp(-pow(length(q - vec2(0.0, -0.35)), 2.0) * 5.0);
  dc *= 1.0 - 0.55 * smoothstep(0.3, 1.1, length(q));
  vec3 c = mix(lc, dc, uMood);
  c += (hash12(gl_FragCoord.xy) - 0.5) * (mix(1.4, 2.4, uMood) / 255.0);
  o = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------- shadow catcher wall
export const WALL_VS = V + `layout(location=0) in vec3 aPos; uniform mat4 uVP, uModel; out vec3 vW; void main(){ vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; gl_Position = uVP * w; }`;
export const WALL_FS = V + P + COMMON + `
in vec3 vW; out vec4 o; uniform float uCatch;
void main(){
  float s = shadowAtN(vW, vec3(0.0, 0.0, 1.0), 32);
  vec3 col = mix(vec3(0.20, 0.15, 0.09), vec3(0.0, 0.012, 0.006), uMood);
  float a = (1.0 - s) * uCatch * mix(0.09, 0.3, uMood);
  o = vec4(col, a);
}`;

export const DEPTH_FS = V + P + `out vec4 o; void main(){ o = vec4(0.0); }`;

// ---------------------------------------------------------------- card (PVC)
export const CARD_VS = V + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUV; layout(location=5) in float aK;
uniform mat4 uModel, uVP; uniform vec2 uBend; out vec3 vW; out vec3 vN; out vec2 vUV; out float vK; out vec3 vLocal;
void main(){
  vec3 p = aPos;
  float dzdx = 2.0 * uBend.y * p.x, dzdy = 2.0 * uBend.x * p.y;
  p.z += uBend.x * p.y * p.y + uBend.y * p.x * p.x;
  vec3 t = normalize(vec3(1.0, 0.0, dzdx)), b = normalize(vec3(0.0, 1.0, dzdy));
  mat3 R = mat3(t, b, normalize(cross(t, b)));
  vec4 w = uModel * vec4(p, 1.0); vW = w.xyz; vN = mat3(uModel) * (R * aNor); vUV = aUV; vK = aK; vLocal = aPos;
  gl_Position = uVP * w;
}`;
export const CARD_FS = V + P + COMMON + `
in vec3 vW; in vec3 vN; in vec2 vUV; in float vK; in vec3 vLocal; out vec4 o;
uniform sampler2D uFront, uBack; uniform float uWeight; uniform float uGlow;
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(uCam - vW); vec3 L = normalize(uKeyDir);
  vec3 alb; float rough = 0.24;
  if (vK < 0.5) alb = texture(uFront, vUV).rgb;
  else if (vK < 1.5) alb = texture(uBack, vec2(1.0 - vUV.x, vUV.y)).rgb;
  else { alb = vec3(0.86, 0.88, 0.85); rough = 0.34; }
  // laminate micro-roughness
  float nz = hash12(floor(vLocal.xy * 900.0)) - 0.5;
  vec3 Nn = normalize(N + (vec3(nz, hash12(floor(vLocal.xy * 700.0) + 3.0) - 0.5, 0.0)) * 0.012);
  float NoV = clamp(dot(Nn, V), 0.0001, 1.0);
  float sh = shadowAt(vW, N);
  float NoL = max(dot(Nn, L), 0.0);
  vec3 diff = alb * (irradiance(Nn) * (1.0 - 0.14 * (1.0 - sh)) + keyColor() * NoL * sh);
  vec3 R = reflect(-V, Nn);
  vec3 spec = envColor(R, rough) * envBRDF(vec3(0.05), rough, NoV);
  vec3 coat = envColor(R, 0.05) * pow(1.0 - NoV, 4.0) * 0.5;
  float edge = vK > 1.5 ? 1.0 : 0.0;
  vec3 c = diff * (1.0 - 0.04) + spec * mix(1.0, sh * 0.6 + 0.4, 0.5) + coat + edge * vec3(0.05);
  c += uGlow * vec3(0.06, 0.22, 0.12);
  o = vec4(finish(c), 1.0) * uWeight;
}`;

// ---------------------------------------------------------------- cloth (strap / sleeve / knit)
export const CLOTH_VS = V + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUV; layout(location=3) in vec4 aTan; layout(location=5) in float aK;
uniform mat4 uModel, uVP; out vec3 vW; out vec3 vN; out vec3 vT; out vec2 vUV; out float vK;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; vN = mat3(uModel) * aNor; vT = mat3(uModel) * aTan.xyz; vUV = aUV; vK = aK; gl_Position = uVP * w;
}`;
export const CLOTH_FS = V + P + COMMON + `
in vec3 vW; in vec3 vN; in vec3 vT; in vec2 vUV; in float vK; out vec4 o;
uniform sampler2D uBase, uVals, uFlame, uOrn, uSeal, uWord;
uniform int uMode; uniform vec3 uTint; uniform vec4 uHL; uniform float uTime;
vec4 over(vec4 dst, vec4 src){ return vec4(src.rgb * src.a + dst.rgb * (1.0 - src.a), 1.0); }
vec4 decal(sampler2D t, float s, float v, vec4 r, bool flip){
  vec2 uv = vec2((s - r.x) / (r.y - r.x), (v - r.z) / (r.w - r.z));
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  if (flip) uv = 1.0 - uv;
  return texture(t, vec2(uv.x, 1.0 - uv.y));
}
void main(){
  vec3 N = normalize(vN); vec3 T = normalize(vT); bool ff = gl_FrontFacing;
  if (!ff) N = -N;
  vec3 Bt = normalize(cross(vN, T)); if (!ff) Bt = -Bt;
  if (uMode == 2){ N = normalize(vN); if (dot(N, uCam - vW) < 0.0) N = -N; }
  float s = vUV.x, v = vUV.y;
  vec3 alb; float emis = 0.0; float rib = 0.0; float cavity = 1.0; float prt = 0.0;
  float mmx = s, mmy = v * 20.0; float sc = 1.0;
  if (uMode == 0){
    if (ff){
      vec4 c = vec4(texture(uBase, vec2(s / 900.0, 1.0 - v)).rgb, 1.0);
      vec4 dv = decal(uVals, s, v, vec4(58.0, 316.0, 0.0, 1.0), false);
      float hl = smoothstep(uHL.x - 2.0, uHL.x + 1.0, s) * (1.0 - smoothstep(uHL.y - 1.0, uHL.y + 2.0, s));
      dv.rgb *= 1.0 + uHL.z * hl * 1.6; c = over(c, dv); emis += dv.a * uHL.z * hl * 0.9;
      vec4 fl = decal(uFlame, s, v, vec4(322.0, 342.0, 0.05, 0.95), false) + decal(uFlame, s, v, vec4(574.0, 594.0, 0.05, 0.95), false);
      fl = clamp(fl, 0.0, 1.0); c = over(c, fl); emis += fl.a * (0.12 + uHL.w * 0.9);
      vec4 on = decal(uOrn, s, v, vec4(362.0, 428.0, 0.0, 1.0), false) + decal(uOrn, s, v, vec4(472.0, 538.0, 0.0, 1.0), true);
      c = over(c, clamp(on, 0.0, 1.0));
      vec4 se = decal(uSeal, s, v, vec4(441.0, 459.0, 0.05, 0.95), false); c = over(c, se); emis += se.a * uHL.w * 0.25;
      vec4 wm = decal(uWord, s, v, vec4(608.0, 847.0, 0.05, 0.95), false); c = over(c, wm); emis += wm.a * 0.05;
      prt = max(max(dv.a, fl.a), max(clamp(on.a, 0.0, 1.0), max(se.a, wm.a)));   // printed areas sit on top of the yarn texture
      alb = c.rgb;
    } else alb = texture(uBase, vec2(s / 900.0, 0.5)).rgb * 0.55;
  } else if (uMode == 1){
    mmx = vUV.y * 40.0; mmy = vUV.x * 20.0;
    if (vK < 0.5) alb = texture(uBase, vec2(vUV.x, 0.1 + 0.8 * vUV.y)).rgb; else alb = vec3(0.045, 0.2, 0.1);   // face = the middle 40 mm of the 50 mm artwork (seal stays centred)
  } else { alb = uTint; mmx = vUV.x * 60.0; mmy = vUV.y * 60.0; sc = 4.0; }
  // woven micro-structure (fades out when finer than a pixel)
  float aa = 1.0 - smoothstep(0.05 * sc, 0.16 * sc, fwidth(mmx) + fwidth(mmy));
  float px = 6.2831853 / (0.42 * sc), py = 6.2831853 / (0.36 * sc);
  float ph = px * mmx + py * mmy;
  float h = sin(ph) * 0.5 + sin(px * 0.5 * mmx - py * 1.3 * mmy) * 0.25 + sin(mmy * 12.566 / sc) * 0.35;
  float dhx = px * cos(ph) * 0.5 + px * 0.25 * cos(px * 0.5 * mmx - py * 1.3 * mmy);
  float dhy = py * cos(ph) * 0.5 - py * 0.325 * cos(px * 0.5 * mmx - py * 1.3 * mmy) + 4.4 * cos(mmy * 12.566 / sc) / sc;
  float aaW = aa * (1.0 - 0.72 * prt);
  vec3 Nm = normalize(N - (T * dhx + Bt * dhy) * 0.021 * sc * aaW);
  alb *= 1.0 + h * 0.07 * aaW;
  // selvedge
  float ed = 1.0; if (uMode == 0){ float e = min(v, 1.0 - v); ed = smoothstep(0.0, 0.05, e); Nm = normalize(Nm + Bt * (v < 0.5 ? 1.0 : -1.0) * (1.0 - ed) * 0.9); alb *= 0.82 + 0.18 * ed; }
  vec3 V = normalize(uCam - vW); vec3 L = normalize(uKeyDir);
  float NoV = clamp(dot(Nm, V), 0.0001, 1.0);
  float sh = shadowAt(vW, N);
  float wrap = clamp((dot(Nm, L) + 0.35) / 1.35, 0.0, 1.0);
  vec3 diff = alb * (irradiance(Nm) * (1.0 - 0.16 * (1.0 - sh)) + keyColor() * wrap * sh);
  vec3 H = normalize(L + V); float TH = dot(T, H); float aniso = pow(sqrt(max(1.0 - TH * TH, 0.0)), 50.0) * clamp(dot(Nm, L) + 0.25, 0.0, 1.0) * sh;
  vec3 R = reflect(-V, Nm);
  vec3 spec = envColor(R, 0.6) * envBRDF(vec3(0.045), 0.6, NoV) * 0.85;
  float rim = pow(1.0 - NoV, 3.0);
  vec3 sheen = (alb * 1.2 + 0.25) * rim * (irradiance(Nm) * 0.28 + 0.06);
  float veil = 1.0 - 0.6 * prt;   // printed artwork: less sheen/specular veil, so the print reads cleanly
  vec3 c = diff * (1.0 + 0.3 * prt) + (spec + sheen + aniso * vec3(0.30, 0.34, 0.30) * keyColor() * 0.35) * veil + alb * emis;
  o = vec4(finish(c), 1.0);
}`;

// ---------------------------------------------------------------- metal / gloss dielectric
export const GEO_VS = V + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUV;
uniform mat4 uModel, uVP; out vec3 vW; out vec3 vN; out vec2 vUV;
void main(){ vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; vN = mat3(uModel) * aNor; vUV = aUV; gl_Position = uVP * w; }`;
export const METAL_FS = V + P + COMMON + `
in vec3 vW; in vec3 vN; in vec2 vUV; out vec4 o; uniform vec3 uBase; uniform float uRough; uniform float uMetal;
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCam - vW); vec3 L = normalize(uKeyDir);
  float NoV = clamp(dot(N, V), 0.0001, 1.0); float sh = shadowAt(vW, N);
  vec3 F0 = mix(vec3(0.04), uBase, uMetal);
  vec3 R = reflect(-V, N);
  float brush = (hash12(floor(vUV * vec2(40.0, 700.0))) - 0.5) * 0.05;
  vec3 spec = envColor(R, uRough + brush) * envBRDF(F0, uRough, NoV) * mix(0.55 + 0.45 * sh, 1.0, 0.4);
  vec3 diff = uBase * (1.0 - uMetal) * (irradiance(N) + keyColor() * max(dot(N, L), 0.0) * sh);
  o = vec4(finish(diff + spec), 1.0);
}`;

// ---------------------------------------------------------------- clear PVC card holder (alpha-blended, premultiplied)
export const HOLDER_FS = V + P + COMMON + `
in vec3 vW; in vec3 vN; in vec2 vUV; in float vK; in vec3 vLocal; out vec4 o;
float capsuleSd(vec2 p, vec2 c, float hl, float r){ vec2 d = abs(p - c); return length(max(d - vec2(hl - r, 0.0), 0.0)) - r; }
void main(){
  float sd = capsuleSd(vLocal.xy, vec2(0.0, 0.435), 0.052, 0.0105);
  float sd2 = min(length(vLocal.xy - vec2(0.215, 0.435)) - 0.0135, length(vLocal.xy - vec2(-0.215, 0.435)) - 0.0135);
  float hole = min(sd, sd2);
  if (hole < 0.0) discard;
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCam - vW); vec3 L = normalize(uKeyDir);
  float NoV = clamp(dot(N, V), 0.0001, 1.0);
  vec3 R = reflect(-V, N);
  vec3 spec = envColor(R, 0.07) * envBRDF(vec3(0.05), 0.07, NoV) * 1.1;
  float fres = pow(1.0 - NoV, 3.0);
  float hdr = smoothstep(0.392, 0.400, vLocal.y);
  float edge = vK > 1.5 ? 1.0 : 0.0;
  float rim = 1.0 - smoothstep(0.0, 0.006, hole);
  float a = 0.028 + 0.45 * fres + 0.5 * hdr + edge * 0.5 + rim * 0.55;
  vec3 film = vec3(0.90, 0.95, 0.92) * (irradiance(N) * 0.55 + keyColor() * max(dot(N, L), 0.0) * 0.12);
  vec3 col = finish(film + spec);
  float sa = clamp(a + max(spec.r, max(spec.g, spec.b)) * 1.0, 0.0, 0.9);
  o = vec4(col * sa, sa);
}`;

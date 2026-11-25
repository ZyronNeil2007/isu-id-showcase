// Offline hand mesh generator: smooth-union SDF of the rig in its base (pinch) pose -> naive surface nets
// -> skinned mesh (positions/normals/AO/weights) baked into src/scene/hand.generated.ts
import { writeFileSync } from 'node:fs';
import { BONES, solveRig, NBONES } from '../src/scene/handRig';
import { m4, V3 } from '../src/engine/math';

const H = +(process.env.STEP || 0.0125);
const W = solveRig();
const segs = BONES.map((b, i) => ({ a: m4.point(W[i], [0, 0, 0]) as V3, b: m4.point(W[i], b.segB) as V3, r0: b.r0, r1: b.r1, i }));

const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
function sdSeg(p: V3, a: V3, b: V3, r0: number, r1: number, sx = 1, sz = 1) {
  const px = p[0] - a[0], py = p[1] - a[1], pz = p[2] - a[2], bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz || 1)));
  const dx = (px - bx * t) / sx, dy = py - by * t, dz = (pz - bz * t) / sz;
  return (Math.hypot(dx, dy, dz) - (r0 + (r1 - r0) * t)) * Math.min(sx, sz);
}
function sdEll(p: V3, c: V3, r: V3) {
  const x = (p[0] - c[0]) / r[0], y = (p[1] - c[1]) / r[1], z = (p[2] - c[2]) / r[2];
  const k0 = Math.hypot(x, y, z), k1 = Math.hypot(x / r[0], y / r[1], z / r[2]);
  return k1 > 1e-6 ? k0 * (k0 - 1) / k1 : -Math.min(...r);
}
function sdRBox(p: V3, c: V3, h: V3, r: number) {
  const qx = Math.abs(p[0] - c[0]) - h[0] + r, qy = Math.abs(p[1] - c[1]) - h[1] + r, qz = Math.abs(p[2] - c[2]) - h[2] + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

const fingerGroups = [[2, 3, 4], [5, 6, 7], [8, 9, 10], [11, 12, 13]];
function sdf(p: V3): number {
  // palm volume
  let d = sdRBox(p, [0.0, 0.50, 0.0], [0.345, 0.43, 0.105], 0.09);
  d = smin(d, sdEll(p, [0, 0.10, -0.01], [0.30, 0.22, 0.15]), 0.10);
  d = smin(d, sdEll(p, [0.20, 0.30, 0.12], [0.17, 0.26, 0.12]), 0.12);   // thenar
  d = smin(d, sdEll(p, [-0.22, 0.36, 0.06], [0.12, 0.30, 0.10]), 0.10);  // hypothenar
  d = smin(d, sdSeg(p, [-0.30, 0.90, -0.03], [0.30, 0.96, -0.03], 0.098, 0.098), 0.06); // knuckle bar
  // forearm (elliptical)
  const f = segs[0]; d = smin(d, sdSeg(p, f.a, f.b, f.r0, f.r1, 0.88, 1.12), 0.14);
  // fingers: union within a finger is tight, finger to palm blends, finger to finger barely
  let fingersAll = 1e9;
  for (const g of fingerGroups) {
    let fd = 1e9;
    for (const bi of g) { const s = segs[bi]; fd = smin(fd, sdSeg(p, s.a, s.b, s.r0, s.r1), 0.03); }
    fingersAll = Math.min(fingersAll, fd);
    d = smin(d, fd, 0.05);
  }
  let td = 1e9; for (const bi of [14, 15, 16]) { const s = segs[bi]; td = smin(td, sdSeg(p, s.a, s.b, s.r0, s.r1), 0.04); }
  d = smin(d, td, 0.07);
  return d;
}
const grad = (p: V3): V3 => {
  const e = 0.004;
  const gx = sdf([p[0] + e, p[1], p[2]]) - sdf([p[0] - e, p[1], p[2]]);
  const gy = sdf([p[0], p[1] + e, p[2]]) - sdf([p[0], p[1] - e, p[2]]);
  const gz = sdf([p[0], p[1], p[2] + e]) - sdf([p[0], p[1], p[2] - e]);
  const l = Math.hypot(gx, gy, gz) || 1; return [gx / l, gy / l, gz / l];
};

// bounds from segments
let lo: V3 = [1e9, 1e9, 1e9], hi: V3 = [-1e9, -1e9, -1e9];
for (const s of segs) for (const pt of [s.a, s.b]) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pt[k] - 0.3); hi[k] = Math.max(hi[k], pt[k] + 0.3); }
lo = [lo[0] - 0.1, lo[1], lo[2] - 0.1]; hi = [hi[0] + 0.1, hi[1] + 0.1, hi[2] + 0.1];
const nx = Math.ceil((hi[0] - lo[0]) / H), ny = Math.ceil((hi[1] - lo[1]) / H), nz = Math.ceil((hi[2] - lo[2]) / H);
console.log('grid', nx, ny, nz, 'bounds', lo.map(v => v.toFixed(2)), hi.map(v => v.toFixed(2)));
const idx = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
const F = new Float32Array(nx * ny * nz);
for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[idx(i, j, k)] = sdf([lo[0] + i * H, lo[1] + j * H, lo[2] + k * H]);

// naive surface nets
const vid = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
const cidx = (i: number, j: number, k: number) => (k * (ny - 1) + j) * (nx - 1) + i;
const verts: V3[] = [];
const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
  const v = corners.map(([a, b, c]) => F[idx(i + a, j + b, k + c)]);
  let mask = 0; for (let c = 0; c < 8; c++) if (v[c] < 0) mask |= 1 << c;
  if (mask === 0 || mask === 255) continue;
  let n = 0; const s: V3 = [0, 0, 0];
  for (const [a, b] of edges) {
    if ((v[a] < 0) === (v[b] < 0)) continue;
    const t = v[a] / (v[a] - v[b]);
    for (let q = 0; q < 3; q++) s[q] += corners[a][q] + (corners[b][q] - corners[a][q]) * t;
    n++;
  }
  vid[cidx(i, j, k)] = verts.length;
  verts.push([lo[0] + (i + s[0] / n) * H, lo[1] + (j + s[1] / n) * H, lo[2] + (k + s[2] / n) * H]);
}
const tris: number[] = [];
const quad = (a: number, b: number, c: number, d: number, flip: boolean) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) tris.push(a, c, b, a, d, c); else tris.push(a, b, c, a, c, d); };
for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
  const f0 = F[idx(i, j, k)] < 0;
  if (f0 !== (F[idx(i + 1, j, k)] < 0)) quad(vid[cidx(i, j - 1, k - 1)], vid[cidx(i, j, k - 1)], vid[cidx(i, j, k)], vid[cidx(i, j - 1, k)], f0);
  if (f0 !== (F[idx(i, j + 1, k)] < 0)) quad(vid[cidx(i - 1, j, k - 1)], vid[cidx(i - 1, j, k)], vid[cidx(i, j, k)], vid[cidx(i, j, k - 1)], f0);
  if (f0 !== (F[idx(i, j, k + 1)] < 0)) quad(vid[cidx(i - 1, j - 1, k)], vid[cidx(i, j - 1, k)], vid[cidx(i, j, k)], vid[cidx(i - 1, j, k)], f0);
}
console.log('verts', verts.length, 'tris', tris.length / 3);

// project to the surface (2 Newton steps) and compute normals / AO / weights
const nor: V3[] = [], ao: number[] = [], J: number[][] = [], WT: number[][] = [];
for (let vi = 0; vi < verts.length; vi++) {
  let p = verts[vi];
  for (let it = 0; it < 3; it++) { const d = sdf(p), g = grad(p); p = [p[0] - g[0] * d, p[1] - g[1] * d, p[2] - g[2] * d]; }
  verts[vi] = p; const n = grad(p); nor.push(n);
  let occ = 0, w = 1;
  for (let s = 1; s <= 5; s++) { const h = s * 0.035; const d = sdf([p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h]); occ += (h - d) * w; w *= 0.6; }
  ao.push(Math.max(0, Math.min(1, 1 - 3.2 * occ)));
  // skin weights: soft nearest-bone
  const ds = segs.map(s => ({ i: s.i, d: Math.max(0, sdSeg(p, s.a, s.b, s.r0, s.r1) + 0.0) }));
  // the palm bone owns the whole palm volume
  const pp = ds[1]; pp.d = Math.max(0, sdRBox(p, [0, 0.5, 0], [0.35, 0.43, 0.11], 0.09) - 0.02);
  ds.sort((a, b) => a.d - b.d);
  const top = ds.slice(0, 4); const wmin = top[0].d;
  const ws = top.map(t => Math.exp(-(t.d - wmin) / 0.032));
  const sum = ws.reduce((a, b) => a + b, 0);
  J.push(top.map(t => t.i)); WT.push(ws.map(x => x / sum));
}

// quantise & write
const nv = verts.length;
const bmin = [1e9, 1e9, 1e9], bmax = [-1e9, -1e9, -1e9];
for (const p of verts) for (let k = 0; k < 3; k++) { bmin[k] = Math.min(bmin[k], p[k]); bmax[k] = Math.max(bmax[k], p[k]); }
const pos = new Int16Array(nv * 3), nrm = new Int8Array(nv * 3), aoB = new Uint8Array(nv), jB = new Uint8Array(nv * 4), wB = new Uint8Array(nv * 4);
for (let i = 0; i < nv; i++) {
  for (let k = 0; k < 3; k++) { pos[i * 3 + k] = Math.round(((verts[i][k] - bmin[k]) / (bmax[k] - bmin[k]) * 2 - 1) * 32767); nrm[i * 3 + k] = Math.round(nor[i][k] * 127); }
  aoB[i] = Math.round(ao[i] * 255);
  let ws = WT[i].map(x => Math.round(x * 255)); const dif = 255 - ws.reduce((a, b) => a + b, 0); ws[0] += dif;
  for (let k = 0; k < 4; k++) { jB[i * 4 + k] = J[i][k]; wB[i * 4 + k] = ws[k]; }
}
const ind = nv > 65535 ? new Uint32Array(tris) : new Uint16Array(tris);
const b64 = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
writeFileSync(new URL('../src/scene/hand.generated.ts', import.meta.url), `// GENERATED by tools/genhand.ts — do not edit
export const HAND = { nv: ${nv}, bmin: ${JSON.stringify(bmin.map(v => +v.toFixed(5)))}, bmax: ${JSON.stringify(bmax.map(v => +v.toFixed(5)))}, u32: ${ind instanceof Uint32Array},
pos: "${b64(pos)}", nor: "${b64(nrm)}", ao: "${b64(aoB)}", j: "${b64(jB)}", w: "${b64(wB)}", idx: "${b64(ind)}" };
`);
console.log('written', (nv * 18 + tris.length * (ind.BYTES_PER_ELEMENT)) / 1024 | 0, 'KB raw');

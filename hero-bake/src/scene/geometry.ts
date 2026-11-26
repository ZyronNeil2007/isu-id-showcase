// Procedural geometry builders. All return plain typed arrays so they can feed GL.mesh().
import { V3 } from '../engine/math';

export interface Geo { pos: Float32Array; nor: Float32Array; uv: Float32Array; kind?: Float32Array; idx: Uint16Array | Uint32Array; }

const pack = (p: number[], n: number[], u: number[], k: number[] | null, idx: number[]): Geo => ({
  pos: new Float32Array(p), nor: new Float32Array(n), uv: new Float32Array(u), kind: k ? new Float32Array(k) : undefined,
  idx: p.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx),
});

// Rounded-rectangle outline (counter-clockwise), returns [x,y] pairs and outward normals.
function roundedOutline(w: number, h: number, r: number, seg: number, inset = 0) {
  const pts: number[][] = [], nrm: number[][] = [];
  const hx = w / 2, hy = h / 2, rr = Math.max(0.0001, r - inset);
  const cx = [hx - r, -(hx - r), -(hx - r), hx - r], cy = [hy - r, hy - r, -(hy - r), -(hy - r)];
  for (let c = 0; c < 4; c++) for (let i = 0; i <= seg; i++) {
    const a = (c * 90 + (i / seg) * 90) * Math.PI / 180, nx = Math.cos(a), ny = Math.sin(a);
    pts.push([cx[c] + nx * rr, cy[c] + ny * rr]); nrm.push([nx, ny]);
  }
  return { pts, nrm };
}

// Thin plate with bevelled rim. kind: 0 front face, 1 back face, 2 edge/bevel. UV spans the plate [0,1]^2.
export function slab(w: number, h: number, t: number, r: number, bevel = 0.0025, seg = 8): Geo {
  const P: number[] = [], N: number[] = [], U: number[] = [], K: number[] = [], I: number[] = [];
  const uv = (x: number, y: number) => [x / w + 0.5, y / h + 0.5];
  const ring = (inset: number, z: number, nz: number, nOut: number, kind: number) => {
    const { pts, nrm } = roundedOutline(w, h, r, seg, 0);
    const base = P.length / 3;
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i], [nx, ny] = nrm[i];
      const ox = x - nx * inset, oy = y - ny * inset;
      P.push(ox, oy, z); const l = Math.hypot(nx * nOut, ny * nOut, nz) || 1;
      N.push(nx * nOut / l, ny * nOut / l, nz / l); U.push(...uv(ox, oy)); K.push(kind);
    }
    return { base, n: pts.length };
  };
  const hz = t / 2;
  const fi = ring(bevel, hz, 1, 0, 0), bi = ring(bevel, -hz, -1, 0, 1);
  // faces as fans from a centre vertex
  const fc = P.length / 3; P.push(0, 0, hz); N.push(0, 0, 1); U.push(0.5, 0.5); K.push(0);
  for (let i = 0; i < fi.n; i++) I.push(fc, fi.base + i, fi.base + (i + 1) % fi.n);
  const bc = P.length / 3; P.push(0, 0, -hz); N.push(0, 0, -1); U.push(0.5, 0.5); K.push(1);
  for (let i = 0; i < bi.n; i++) I.push(bc, bi.base + (i + 1) % bi.n, bi.base + i);
  // bevel + side
  const f2 = ring(0, hz - bevel, 0.7071, 0.7071, 2), s1 = ring(0, hz - bevel, 0, 1, 2), s2 = ring(0, -hz + bevel, 0, 1, 2), b2 = ring(0, -hz + bevel, -0.7071, 0.7071, 2);
  const quad = (a: { base: number; n: number }, b: { base: number; n: number }) => {
    for (let i = 0; i < a.n; i++) { const j = (i + 1) % a.n; I.push(a.base + i, b.base + i, b.base + j, a.base + i, b.base + j, a.base + j); }
  };
  quad(fi, f2); quad(s1, s2); quad(b2, bi);
  return pack(P, N, U, K, I);
}

export function torus(R: number, r: number, seg = 48, tseg = 16): Geo {
  const P: number[] = [], N: number[] = [], U: number[] = [], I: number[] = [];
  for (let i = 0; i <= seg; i++) for (let j = 0; j <= tseg; j++) {
    const a = i / seg * Math.PI * 2, b = j / tseg * Math.PI * 2;
    const cx = Math.cos(a) * R, cy = Math.sin(a) * R, nx = Math.cos(a) * Math.cos(b), ny = Math.sin(a) * Math.cos(b), nz = Math.sin(b);
    P.push(cx + nx * r, cy + ny * r, nz * r); N.push(nx, ny, nz); U.push(i / seg, j / tseg);
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < tseg; j++) {
    const a = i * (tseg + 1) + j, b = a + tseg + 1; I.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return pack(P, N, U, null, I);
}

// Rounded box centred at the origin (half extents hx,hy,hz; corner radius r).
export function roundedBox(hx: number, hy: number, hz: number, r: number, n = 8): Geo {
  const P: number[] = [], N: number[] = [], U: number[] = [], I: number[] = [];
  const faces: [V3, V3, V3][] = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, 1], [-1, 0, 0]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
  const ext: V3 = [hx, hy, hz], inner: V3 = [hx - r, hy - r, hz - r];
  for (const [nrm, a, b] of faces) {
    const base = P.length / 3;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const s = i / n * 2 - 1, t = j / n * 2 - 1;
      const p: V3 = [nrm[0] * ext[0] + a[0] * s * ext[0] + b[0] * t * ext[0], nrm[1] * ext[1] + a[1] * s * ext[1] + b[1] * t * ext[1], nrm[2] * ext[2] + a[2] * s * ext[2] + b[2] * t * ext[2]];
      const c: V3 = [Math.max(-inner[0], Math.min(inner[0], p[0])), Math.max(-inner[1], Math.min(inner[1], p[1])), Math.max(-inner[2], Math.min(inner[2], p[2]))];
      let d: V3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; const l = Math.hypot(...d) || 1; d = [d[0] / l, d[1] / l, d[2] / l];
      P.push(c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r); N.push(d[0], d[1], d[2]); U.push(i / n, j / n);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const q = base + i * (n + 1) + j; I.push(q, q + n + 1, q + 1, q + n + 1, q + n + 2, q + 1); }
  }
  return pack(P, N, U, null, I);
}

// Capsule-ish cylinder along +Y from y0..y1 with hemispherical caps (radius r)
export function capsule(y0: number, y1: number, r: number, seg = 24, cap = 8): Geo {
  const P: number[] = [], N: number[] = [], U: number[] = [], I: number[] = [];
  const rows: [number, number, number][] = []; // y, radius, ny
  for (let i = 0; i <= cap; i++) { const a = (1 - i / cap) * Math.PI / 2; rows.push([y0 - Math.sin(a) * r, Math.cos(a) * r, -Math.sin(a)]); }
  for (let i = 0; i <= cap; i++) { const a = (i / cap) * Math.PI / 2; rows.push([y1 + Math.sin(a) * r, Math.cos(a) * r, Math.sin(a)]); }
  rows.forEach(([y, rad, ny], ri) => {
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), nl = Math.sqrt(1 - ny * ny);
      P.push(c * rad, y, s * rad); N.push(c * nl, ny, s * nl); U.push(j / seg, ri / (rows.length - 1));
    }
  });
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; I.push(a, a + 1, b, b, a + 1, b + 1); }
  return pack(P, N, U, null, I);
}

export function sphere(seg = 24, rings = 14): Geo {
  const P: number[] = [], N: number[] = [], U: number[] = [], I: number[] = [];
  for (let i = 0; i <= rings; i++) for (let j = 0; j <= seg; j++) {
    const a = i / rings * Math.PI, b = j / seg * Math.PI * 2;
    const x = Math.sin(a) * Math.cos(b), y = Math.cos(a), z = Math.sin(a) * Math.sin(b);
    P.push(x, y, z); N.push(x, y, z); U.push(j / seg, i / rings);
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
  return pack(P, N, U, null, I);
}

// Open sleeve tube around +Y: radius profile r(y) with fabric folds, uv = (angle/2pi*?, y)
export function sleeve(y0: number, y1: number, rAt: (y: number, a: number) => number, ex: number, ez: number, rows = 90, seg = 72): Geo {
  const P: number[] = [], N: number[] = [], U: number[] = [], I: number[] = [];
  const pt = (y: number, a: number): V3 => { const r = rAt(y, a); return [Math.cos(a) * r * ex, y, Math.sin(a) * r * ez]; };
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= seg; j++) {
    const y = y0 + (y1 - y0) * i / rows, a = j / seg * Math.PI * 2;
    const p = pt(y, a), pa = pt(y, a + 0.01), py = pt(y + 0.01, a);
    const ta: V3 = [pa[0] - p[0], pa[1] - p[1], pa[2] - p[2]], ty: V3 = [py[0] - p[0], py[1] - p[1], py[2] - p[2]];
    const n: V3 = [ta[1] * ty[2] - ta[2] * ty[1], ta[2] * ty[0] - ta[0] * ty[2], ta[0] * ty[1] - ta[1] * ty[0]]; const l = Math.hypot(...n) || 1;
    P.push(...p); N.push(n[0] / l, n[1] / l, n[2] / l); U.push(j / seg, i / rows);
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; I.push(a, a + 1, b, b, a + 1, b + 1); }
  return pack(P, N, U, null, I);
}

// Catmull-Rom spline through control points (centripetal-free uniform variant), `sub` samples per span.
export function catmull(pts: V3[], sub = 8): V3[] {
  const out: V3[] = [], n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let s = 0; s < sub; s++) {
      const t = s / sub, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)) as V3);
    }
  }
  out.push(pts[n - 1]); return out;
}

// Round tube swept along a polyline (parallel-transport frames) with rounded end caps. radius may vary along the path.
export function tube(path: V3[], radius: number | ((u: number) => number), seg = 14, cap = true): Geo {
  const P: number[] = [], N: number[] = [], U: number[] = [], I: number[] = [];
  const n = path.length, rad = (u: number) => typeof radius === 'number' ? radius : radius(u);
  const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const T: V3[] = path.map((_, i) => { const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)]; return norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]); });
  let nm: V3 = norm(cross(T[0], Math.abs(T[0][2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  const frames: { c: V3; t: V3; nm: V3; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = T[i], d = nm[0] * t[0] + nm[1] * t[1] + nm[2] * t[2];
    nm = norm([nm[0] - t[0] * d, nm[1] - t[1] * d, nm[2] - t[2] * d]);
    frames.push({ c: path[i], t, nm, r: rad(i / (n - 1)) });
  }
  const rows: number[] = [];
  // k = fraction of the tube radius at this ring, off = axial offset (for spherical caps)
  const addRing = (f: { c: V3; t: V3; nm: V3; r: number }, k: number, off: number, v: number) => {
    rows.push(P.length / 3); const b = cross(f.t, f.nm);
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
      const dir: V3 = [f.nm[0] * cs + b[0] * sn, f.nm[1] * cs + b[1] * sn, f.nm[2] * cs + b[2] * sn];
      P.push(f.c[0] + f.t[0] * off * f.r + dir[0] * k * f.r, f.c[1] + f.t[1] * off * f.r + dir[1] * k * f.r, f.c[2] + f.t[2] * off * f.r + dir[2] * k * f.r);
      const q = norm([dir[0] * k + f.t[0] * off, dir[1] * k + f.t[1] * off, dir[2] * k + f.t[2] * off]);
      N.push(q[0], q[1], q[2]); U.push(j / seg, v);
    }
  };
  const caps = [0.0, 0.38, 0.72, 0.92];
  if (cap) for (const k of caps) addRing(frames[0], k, -Math.sqrt(1 - k * k), 0);
  frames.forEach((f, i) => addRing(f, 1, 0, i / (n - 1)));
  if (cap) for (const k of [...caps].reverse()) addRing(frames[n - 1], k, Math.sqrt(1 - k * k), 1);
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < seg; j++) { const a = rows[i] + j, b = rows[i + 1] + j; I.push(a, a + 1, b, b, a + 1, b + 1); }
  return pack(P, N, U, null, I);
}

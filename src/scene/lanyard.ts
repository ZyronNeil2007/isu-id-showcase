// Lanyard centre-line (the strap as hung on a neck: two strands from the clip, wrapping behind at the top)
// and its ribbon mesh. Strip coordinates (s in mm along the supplied SVG strip, v across) are baked into the UVs.
import { V3, v3, smooth } from '../engine/math';

export const LAN = { L: 9.0, R: 0.62, W: 0.2, Hs: 0 };
LAN.Hs = Math.sqrt(Math.pow((LAN.L - Math.PI * LAN.R) / 2, 2) - LAN.R * LAN.R);

export interface Path { n: number; P: V3[]; T: V3[]; N: V3[]; S: number[]; len: number; }

export function buildPath(): Path {
  const { R, Hs } = LAN, pts: V3[] = [];
  const step = 0.02;
  const seg = (a: V3, b: V3) => { const l = v3.len(v3.sub(b, a)), n = Math.max(2, Math.round(l / step)); for (let i = 0; i < n; i++) pts.push(v3.lerp(a, b, i / n)); };
  seg([0, 0, 0], [-R, Hs, 0]);
  const na = Math.round(Math.PI * R / step);
  for (let i = 0; i < na; i++) { const f = Math.PI + (i / na) * Math.PI; pts.push([R * Math.cos(f), Hs, R * Math.sin(f)]); }
  seg([R, Hs, 0], [0, 0, 0]); pts.push([0, 0, 0]);
  // round the two shoulder corners
  let cur = pts;
  for (let pass = 0; pass < 7; pass++) {
    const nxt: V3[] = cur.map((p, i) => {
      if (i === 0 || i === cur.length - 1) return p;
      const k = Math.min(10, i, cur.length - 1 - i); let s: V3 = [0, 0, 0];
      for (let j = -k; j <= k; j++) s = v3.add(s, cur[i + j]);
      return v3.mul(s, 1 / (2 * k + 1));
    });
    cur = nxt;
  }
  const n = cur.length, S: number[] = [0];
  for (let i = 1; i < n; i++) S.push(S[i - 1] + v3.len(v3.sub(cur[i], cur[i - 1])));
  const len = S[n - 1];
  const T: V3[] = [], N: V3[] = [], P: V3[] = cur.map(p => [...p] as V3);
  for (let i = 0; i < n; i++) {
    const a = cur[Math.max(0, i - 1)], b = cur[Math.min(n - 1, i + 1)]; T.push(v3.norm(v3.sub(b, a)));
  }
  for (let i = 0; i < n; i++) {
    const p = cur[i], w = smooth(Hs - 1.1, Hs - 0.15, p[1]);
    const rad = v3.norm([p[0], 0, p[2]]);
    const nd = v3.norm(v3.lerp([0, 0, 1], rad, w));
    const t = T[i]; N.push(v3.norm(v3.sub(nd, v3.mul(t, v3.dot(nd, t)))));
    // strand A sits slightly in front of strand B where they overlap in the clip piece
    if (i < n / 2) P[i] = [p[0], p[1], p[2] + 0.011 * (1 - smooth(0.0, 0.7, p[1]))];
    S[i] = S[i] / len * 900;
  }
  return { n, P, T, N, S, len };
}

export function ribbon(path: Path) {
  const { n, P, T, N, S } = path, W = LAN.W, pos = new Float32Array(n * 6), nor = new Float32Array(n * 6), uv = new Float32Array(n * 4), tan = new Float32Array(n * 8);
  for (let i = 0; i < n; i++) {
    const B = v3.cross(N[i], T[i]);
    for (let k = 0; k < 2; k++) {
      const o = (i * 2 + k) * 3, sgn = k === 0 ? 0.5 : -0.5;
      pos[o] = P[i][0] + B[0] * W * sgn; pos[o + 1] = P[i][1] + B[1] * W * sgn; pos[o + 2] = P[i][2] + B[2] * W * sgn;
      nor.set(N[i], o); uv[(i * 2 + k) * 2] = S[i]; uv[(i * 2 + k) * 2 + 1] = k;
      tan.set([T[i][0], T[i][1], T[i][2], 0], (i * 2 + k) * 4);
    }
  }
  const idx = new Uint16Array((n - 1) * 6);
  for (let i = 0; i < n - 1; i++) { const a = i * 2, b = a + 2; idx.set([a, a + 1, b, a + 1, b + 1, b], i * 6); }
  return { pos, nor, uv, tan, idx };
}

export function pathAt(path: Path, sMm: number) {
  const { S, P, T, N } = path; let lo = 0, hi = path.n - 1;
  sMm = Math.max(0, Math.min(900, sMm));
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= sMm) lo = m; else hi = m; }
  const f = (sMm - S[lo]) / ((S[hi] - S[lo]) || 1);
  return { P: v3.lerp(P[lo], P[hi], f), T: v3.norm(v3.lerp(T[lo], T[hi], f)), N: v3.norm(v3.lerp(N[lo], N[hi], f)) };
}

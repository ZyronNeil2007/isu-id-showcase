// Offline grip solver: finds finger angles + a small hand offset so that
//  - the index pad rests on the FRONT face and the thumb pad on the BACK face, 0.3 mm clear of the card (contact, never inside it)
//  - nothing else touches the card, and no hand surface crosses the card plane inside the card outline.
import { handAttrs } from '../src/scene/handMesh';
import { skinMatrices, poseFor, Pose } from '../src/scene/handRig';
import { CIH_INV } from '../src/story/story';
import { m4, M4, V3, q } from '../src/engine/math';
const H = handAttrs(); const A = (loc: number) => H.attrs.find(a => a.loc === loc)!.data as Float32Array;
const POS = A(0), JJ = A(3), WW = A(4), NV = POS.length / 3, IDX = H.idx, NT = IDX.length / 3;
const DOM = new Uint8Array(NV); for (let v = 0; v < NV; v++) { let bi = JJ[v * 4], bw = WW[v * 4]; for (let k = 1; k < 4; k++) if (WW[v * 4 + k] > bw) { bw = WW[v * 4 + k]; bi = JJ[v * 4 + k]; } DOM[v] = bi; }
const grp = (b: number) => (b === 0 ? 0 : Math.floor((b - 1) / 3) + 1);   // 0 palm 1 index 2 middle 3 ring 4 pinky 5 thumb
const G = Uint8Array.from(DOM, grp);
const HX = 0.27, HY = 0.43, HT = 0.00475;
const bones = new Float32Array(24 * 16); const cz = new Float32Array(NV), cx = new Float32Array(NV), cy = new Float32Array(NV);

export interface Params { a: Record<string, V3>; d: V3; r?: V3; }
export function cardSpace(par: Params, base: Pose = {}) {
  const pose: Pose = { ...poseFor(0, 0, 0), ...par.a, ...base }; skinMatrices(pose, bones);
  const r = par.r || [0, 0, 0]; const T = m4.fromTRS(par.d, q.euler(r[0], r[1], r[2])); const M = m4.mul(T, CIH_INV);       // hand space -> card space (with the hand shifted by d)
  for (let v = 0; v < NV; v++) {
    const x = POS[v * 3], y = POS[v * 3 + 1], z = POS[v * 3 + 2]; let px = 0, py = 0, pz = 0;
    for (let k = 0; k < 4; k++) { const w = WW[v * 4 + k]; if (w <= 0) continue; const b = JJ[v * 4 + k] * 16;
      px += w * (bones[b] * x + bones[b + 4] * y + bones[b + 8] * z + bones[b + 12]); py += w * (bones[b + 1] * x + bones[b + 5] * y + bones[b + 9] * z + bones[b + 13]); pz += w * (bones[b + 2] * x + bones[b + 6] * y + bones[b + 10] * z + bones[b + 14]); }
    cx[v] = M[0] * px + M[4] * py + M[8] * pz + M[12]; cy[v] = M[1] * px + M[5] * py + M[9] * pz + M[13]; cz[v] = M[2] * px + M[6] * py + M[10] * pz + M[14];
  }
}
// pierce count + group z extremes over the face
export function metrics(clear = 0.0003) {
  let pierce = 0, deepest = 0; const g: Record<number, { zmin: number; zmax: number; n: number }> = {};
  for (let t = 0; t < NT; t++) {
    const a = IDX[t * 3], b = IDX[t * 3 + 1], c = IDX[t * 3 + 2]; const za = cz[a], zb = cz[b], zc = cz[c];
    const hi = Math.max(za, zb, zc), lo = Math.min(za, zb, zc);
    const x = (cx[a] + cx[b] + cx[c]) / 3, y = (cy[a] + cy[b] + cy[c]) / 3; if (Math.abs(x) > HX || Math.abs(y) > HY) continue;
    // a face fully inside the slab, or straddling a face of the slab, counts as inside the card
    if (hi > HT + clear && lo < -(HT + clear)) { pierce++; deepest = Math.max(deepest, Math.min(hi, -lo)); }
    else if (lo < HT && hi > -HT) { pierce++; deepest = Math.max(deepest, Math.min(HT - lo, hi + HT)); }
    const e = (g[G[a]] ||= { zmin: 9, zmax: -9, n: 0 }); e.n++; e.zmin = Math.min(e.zmin, lo); e.zmax = Math.max(e.zmax, hi);
  }
  return { pierce, deepest, g };
}
export const mm = (v: number) => (v * 100).toFixed(2);
// vertex-level contact info for the index (front side) and thumb (back side)
export function contact() {
  let dF = 9, dB = -9, nF = 0, nB = 0, other = 0, oz = 9; const tgt = HT + 0.0003;
  for (let v = 0; v < NV; v++) {
    if (Math.abs(cx[v]) > HX || Math.abs(cy[v]) > HY) continue; const z = cz[v], g = G[v];
    if (g === 1 && z > 0) { if (z < dF) dF = z; if (z < tgt + 0.0012) nF++; }
    else if (g === 5 && z < 0) { if (z > dB) dB = z; if (z > -(tgt + 0.0012)) nB++; }
    else if (g !== 0 && Math.abs(z) < HT + 0.002) { other++; oz = Math.min(oz, Math.abs(z)); }
  }
  return { dF, dB, nF, nB, other, tgt };
}

// Offline: measures how far the posed hand mesh penetrates the card slab at reveal progress p (node, no GL).
import { handAttrs } from '../src/scene/handMesh';
import { skinMatrices, poseFor, BONE_NAMES } from '../src/scene/handRig';
import { handAt, heroCardPose } from '../src/story/story';
import { m4, v3, M4, V3 } from '../src/engine/math';

const H = handAttrs(); const A = (loc: number) => H.attrs.find(a => a.loc === loc)!.data as Float32Array;
const POS = A(0), JJ = A(3), WW = A(4); const NV = POS.length / 3;
const bones = new Float32Array(24 * 16);
const cardM = (p: number): M4 => { const q = heroCardPose(p); return m4.fromTRS(q.pos, q.quat); };
const HALF = [0.27, 0.43, 0.0055];   // card half extents (x, y, z) in card space

export interface Hit { n: number; depth: number; bone: number; worst: number[]; push: V3; }
export function skinAll(p: number, over?: { M?: M4; open?: number; relax?: number }): Float32Array {
  const h = handAt(p)!; const M = over?.M || h.M;
  skinMatrices(poseFor(over?.open ?? h.open, over?.relax ?? h.relax, h.flick), bones);
  const out = new Float32Array(NV * 3);
  for (let v = 0; v < NV; v++) {
    const x = POS[v * 3], y = POS[v * 3 + 1], z = POS[v * 3 + 2]; let px = 0, py = 0, pz = 0;
    for (let k = 0; k < 4; k++) { const w = WW[v * 4 + k]; if (w <= 0) continue; const b = JJ[v * 4 + k] * 16;
      px += w * (bones[b] * x + bones[b + 4] * y + bones[b + 8] * z + bones[b + 12]); py += w * (bones[b + 1] * x + bones[b + 5] * y + bones[b + 9] * z + bones[b + 13]); pz += w * (bones[b + 2] * x + bones[b + 6] * y + bones[b + 10] * z + bones[b + 14]); }
    out[v * 3] = M[0] * px + M[4] * py + M[8] * pz + M[12]; out[v * 3 + 1] = M[1] * px + M[5] * py + M[9] * pz + M[13]; out[v * 3 + 2] = M[2] * px + M[6] * py + M[10] * pz + M[14];
  }
  return out;
}
const GROUP = (b: number) => (b === 0 ? 'palm' : b <= 3 ? 'index' : b <= 6 ? 'middle' : b <= 9 ? 'ring' : b <= 12 ? 'pinky' : 'thumb');
const IDX = H.idx; const NT = IDX.length / 3;
const DOM = new Uint8Array(NV); for (let v = 0; v < NV; v++) { let bi = JJ[v * 4], bw = WW[v * 4]; for (let k = 1; k < 4; k++) if (WW[v * 4 + k] > bw) { bw = WW[v * 4 + k]; bi = JJ[v * 4 + k]; } DOM[v] = bi; }
export interface Pierce { groups: Record<string, number>; total: number; deepest: number; where: V3 | null; }
// Where the posed hand surface crosses the card's mid-plane INSIDE the card rectangle (a finger going around an edge crosses outside it and is fine).
// `tol` keeps skin that merely rests on a face (within tol of the plane) from counting.
export function pierce(world: Float32Array, p: number, tol = 0.0016): Pierce {
  const C = m4.invert(cardM(p)); const cz = new Float32Array(NV), cxs = new Float32Array(NV), cys = new Float32Array(NV);
  for (let v = 0; v < NV; v++) { const x = world[v * 3], y = world[v * 3 + 1], z = world[v * 3 + 2];
    cxs[v] = C[0] * x + C[4] * y + C[8] * z + C[12]; cys[v] = C[1] * x + C[5] * y + C[9] * z + C[13]; cz[v] = C[2] * x + C[6] * y + C[10] * z + C[14]; }
  const groups: Record<string, number> = {}; let total = 0, deepest = 0; let where: V3 | null = null;
  for (let t = 0; t < NT; t++) {
    const a = IDX[t * 3], b = IDX[t * 3 + 1], c = IDX[t * 3 + 2];
    const za = cz[a], zb = cz[b], zc = cz[c];
    const hi = Math.max(za, zb, zc), lo = Math.min(za, zb, zc);
    if (hi < tol || lo > -tol) continue;                      // triangle does not straddle the card, beyond the tolerance, on both sides
    // centroid of the straddling triangle must lie over the card face
    const x = (cxs[a] + cxs[b] + cxs[c]) / 3, y = (cys[a] + cys[b] + cys[c]) / 3;
    if (Math.abs(x) > HALF[0] || Math.abs(y) > HALF[1]) continue;
    const dep = Math.min(hi, -lo); total++; const g = GROUP(DOM[a]); groups[g] = (groups[g] || 0) + 1;
    if (dep > deepest) { deepest = dep; where = [x, y, (za + zb + zc) / 3]; }
  }
  return { groups, total, deepest, where };
}
// smallest distance (mm) from any hand vertex to the card slab (negative = inside)
export function clearance(world: Float32Array, p: number): number {
  const C = m4.invert(cardM(p)); let best = 9;
  for (let v = 0; v < NV; v++) {
    const x = world[v * 3], y = world[v * 3 + 1], z = world[v * 3 + 2];
    const cx = Math.abs(C[0] * x + C[4] * y + C[8] * z + C[12]) - HALF[0], cy = Math.abs(C[1] * x + C[5] * y + C[9] * z + C[13]) - HALF[1], cz = Math.abs(C[2] * x + C[6] * y + C[10] * z + C[14]) - 0.00475;
    const d = Math.hypot(Math.max(cx, 0), Math.max(cy, 0), Math.max(cz, 0)) + Math.min(Math.max(cx, cy, cz), 0); if (d < best) best = d;
  }
  return best * 100;
}
if (process.argv[1]?.includes('collide')) {
  const ps = process.argv.slice(2).map(Number); const list = ps.length ? ps : Array.from({ length: 33 }, (_, i) => i * 0.02);
  for (const p of list) { const r = pierce(skinAll(p), p); const w = skinAll(p); console.log(p.toFixed(3), 'pierce', r.total, 'deep', (r.deepest * 100).toFixed(1), 'clear(mm)', clearance(w, p).toFixed(1), JSON.stringify(r.groups)); }
}
void v3; void BONE_NAMES;

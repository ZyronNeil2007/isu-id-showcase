import { handAttrs } from '../src/scene/handMesh';
import { skinMatrices, poseFor } from '../src/scene/handRig';
import { m4 } from '../src/engine/math';
const H = handAttrs(); const A = (loc: number) => H.attrs.find(a => a.loc === loc)!.data as Float32Array;
const POS = A(0), JJ = A(3), WW = A(4), NV = POS.length / 3, IDX = H.idx;
const bones = new Float32Array(24 * 16);
const pose = poseFor(0, 0, 0); const ov = process.argv[2] ? JSON.parse(process.argv[2]) : {}; for (const k in ov) pose[k] = ov[k];
skinMatrices(pose, bones);
const out = new Float32Array(NV * 3);
for (let v = 0; v < NV; v++) { const x = POS[v * 3], y = POS[v * 3 + 1], z = POS[v * 3 + 2]; let px = 0, py = 0, pz = 0;
  for (let k = 0; k < 4; k++) { const w = WW[v * 4 + k]; if (w <= 0) continue; const b = JJ[v * 4 + k] * 16;
    px += w * (bones[b] * x + bones[b + 4] * y + bones[b + 8] * z + bones[b + 12]); py += w * (bones[b + 1] * x + bones[b + 5] * y + bones[b + 9] * z + bones[b + 13]); pz += w * (bones[b + 2] * x + bones[b + 6] * y + bones[b + 10] * z + bones[b + 14]); }
  out[v * 3] = px; out[v * 3 + 1] = py; out[v * 3 + 2] = pz; }
const d = (a: Float32Array, i: number, j: number) => Math.hypot(a[i * 3] - a[j * 3], a[i * 3 + 1] - a[j * 3 + 1], a[i * 3 + 2] - a[j * 3 + 2]);
const res: [number, number][] = [];
for (let t = 0; t < IDX.length / 3; t++) { const a = IDX[t * 3], b = IDX[t * 3 + 1], c = IDX[t * 3 + 2]; let r = 0;
  for (const [i, j] of [[a, b], [b, c], [c, a]]) r = Math.max(r, d(out, i, j) / Math.max(1e-5, d(POS, i, j))); res.push([r, t]); }
res.sort((x, y) => y[0] - x[0]);
const big = res.filter(r => r[0] > 3); console.log('tris stretched >3x:', big.length, ' >2x:', res.filter(r => r[0] > 2).length);
const cl: Record<string, number> = {}; for (const [r, t] of big) { const v = IDX[t * 3]; const k = JJ[v * 4]; cl[k] = (cl[k] || 0) + 1; } console.log('by dominant bone', JSON.stringify(cl));
console.log(res.slice(0, 5).map(([r, t]) => r.toFixed(1) + '@' + [0, 1, 2].map(k => POS[IDX[t * 3] * 3 + k].toFixed(2)).join(',')).join('  '));
void m4;
// detail of the worst triangles
for (const [r, t] of res.slice(0, 6)) { const vs = [IDX[t * 3], IDX[t * 3 + 1], IDX[t * 3 + 2]]; console.log('r', r.toFixed(1), vs.map(v => `v${v}(${[0, 1, 2].map(k => POS[v * 3 + k].toFixed(2))}) w:` + [0, 1, 2, 3].map(k => JJ[v * 4 + k] + ':' + WW[v * 4 + k].toFixed(2)).join('/')).join('  ||  ')); }

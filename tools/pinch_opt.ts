import { BONES, solveRig } from '../src/scene/handRig';
import { m4, V3, v3 } from '../src/engine/math';
// parameter list: [bone index, euler comp]
const P: [number, number][] = [[2,0],[3,0],[4,0],[2,2],[14,0],[14,2],[14,1],[15,0],[16,0],[15,1],[16,1]];
const init = P.map(([b, c]) => BONES[b].base[c]);
const apply = (x: number[]) => { P.forEach(([b, c], i) => { BONES[b].base[c] = x[i]; }); };
function tips() {
  const W = solveRig();
  const ci = m4.point(W[4], [0, 0.55 * 0.135 / 0.135 * 0.135, BONES[4].r1 * 0.9]);
  const ct = m4.point(W[16], [0, 0.55 * 0.16, BONES[16].r1 * 0.9]);
  const ni = m4.dir(W[4], [0, 0, 1]), nt = m4.dir(W[16], [0, 0, 1]);
  return { ci, ct, ni, nt };
}
function cost(x: number[]) {
  apply(x); const { ci, ct, ni, nt } = tips();
  const d = v3.len(v3.sub(ci, ct));
  let c = (d - 0.012) ** 2 * 400 + (1 + v3.dot(v3.norm(ni), v3.norm(nt))) ** 2 * 1.2;
  // pad normal should point toward the other contact
  const a = v3.norm(v3.sub(ct, ci)); c += (1 - v3.dot(v3.norm(ni), a)) ** 2 * 0.3 + (1 + v3.dot(v3.norm(nt), a)) ** 2 * 0.3;
  x.forEach((v, i) => { c += ((v - init[i]) / 70) ** 2 * 0.25; if (Math.abs(v) > 95) c += 5; });
  // keep the contact in front of the palm and above the knuckles
  const mid = v3.mul(v3.add(ci, ct), 0.5); if (mid[2] < 0.35) c += (0.35 - mid[2]) ** 2 * 20;
  return c;
}
let best = init.slice(), bc = cost(best), step = 12;
for (let it = 0; it < 400; it++) {
  let improved = false;
  for (let i = 0; i < best.length; i++) for (const s of [-step, step]) {
    const t = best.slice(); t[i] += s; const c = cost(t); if (c < bc) { bc = c; best = t; improved = true; }
  }
  if (!improved) step *= 0.6; if (step < 0.2) break;
}
apply(best); const { ci, ct, ni } = tips();
console.log('cost', bc.toFixed(4)); P.forEach(([b, c], i) => console.log(BONES[b].name, ['x','y','z'][c], best[i].toFixed(1)));
console.log('contact I', ci.map(v => +v.toFixed(3)), 'T', ct.map(v => +v.toFixed(3)), 'axis', v3.norm(v3.sub(ci, ct)).map(v => +v.toFixed(3)), 'dist', v3.len(v3.sub(ci, ct)).toFixed(3));
// card frame: z = from index contact toward thumb contact (front faces thumb), y = card length (away from palm), x = y × z
{
  const W = solveRig(); const a = v3.norm(v3.sub(ci, ct)); const z = v3.mul(a, -1);
  let y: V3 = [0, 1, 0]; y = v3.norm(v3.sub(y, v3.mul(z, v3.dot(y, z)))); const x = v3.cross(y, z);
  const mid = v3.mul(v3.add(ci, ct), 0.5); const c = v3.madd(mid, y, 0.43 - 0.13);
  console.log('CARD_IN_HAND', JSON.stringify({ x, y, z, c }));
}

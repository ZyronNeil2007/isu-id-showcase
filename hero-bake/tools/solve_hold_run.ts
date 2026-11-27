import { cardSpace, metrics, contact, Params, mm } from './solve_hold';
import { V3 } from '../src/engine/math';
const HOLD0: Record<string, V3> = { i1: [32.7, 0, -7.6], i2: [43.2, 0, 0], i3: [45, 0, 0], t1: [0.2, 14.7, 11.3], t2: [-0.5, 0, -5.4], t3: [-35, 7.9, 0] };
const KEYS: [string, number][] = [['i1', 0], ['i1', 2], ['i2', 0], ['i3', 0], ['t1', 0], ['t1', 1], ['t1', 2], ['t2', 0], ['t2', 2], ['t3', 0], ['t3', 1]];
const x0 = [...KEYS.map(([k, a]) => HOLD0[k][a]), 0, 0, 0, 0, 0, 0];
const MASK = (process.env.MASK || '1,0,1,1,1,0,0,1,0,1,0,0,0,1,0,0,0').split(',').map(Number);
const SIG = [...KEYS.map(() => 2), 0.02, 0.02, 0.02, 0.03, 0.03, 0.03].map((v, j) => v * MASK[j]);
const lo = [10, -25, 10, 0, -25, -10, -10, -35, -25, -70, -20, -0.3, -0.3, -0.3, -0.35, -0.35, -0.35], hi = [65, 10, 80, 75, 35, 45, 35, 35, 25, 25, 35, 0.3, 0.3, 0.3, 0.35, 0.35, 0.35];
const toPar = (x: number[]): Params => { const a: Record<string, V3> = {}; for (const k in HOLD0) a[k] = [...HOLD0[k]] as V3; KEYS.forEach(([k, i], j) => { a[k][i] = x[j]; }); return { a, d: [x[11], x[12], x[13]], r: [x[14], x[15], x[16]] }; };
export function cost(x: number[], log = false) {
  cardSpace(toPar(x)); const m = metrics(); const c = contact(); let s = 0;
  s += m.pierce * 0.3 + m.deepest * 3000;
  s += c.dF > 5 ? 800 : Math.pow((c.dF - c.tgt) * 1000, 2) * 40;      // mm^2
  s += c.dB < -5 ? 800 : Math.pow((c.dB + c.tgt) * 1000, 2) * 40;
  s += Math.max(0, 120 - c.nF) * 0.5 + Math.max(0, 120 - c.nB) * 0.5;   // real contact patches
  s += c.other * 0.4;                                                     // other fingers stay off the card
  let reg = 0; for (let j = 0; j < 11; j++) reg += Math.pow((x[j] - x0[j]) / 25, 2); s += reg * 6;
  s += (x[11] ** 2 + x[12] ** 2 + x[13] ** 2) * 60 + (x[14] ** 2 + x[15] ** 2 + x[16] ** 2) * 20;
  if (log) console.log('pierce', m.pierce, 'deep', mm(m.deepest), 'dF', mm(c.dF), 'dB', mm(c.dB), 'nF', c.nF, 'nB', c.nB, 'other', c.other, 'cost', s.toFixed(1));
  return s;
}
let best = x0.slice(), bc = cost(best, true), sig = 1;
const rnd = () => { let u = 0; for (let i = 0; i < 6; i++) u += Math.random(); return u - 3; };
for (let it = 0; it < 500; it++) {
  let improved = false;
  for (let k = 0; k < 10; k++) {
    const y = best.map((v, j) => Math.min(hi[j], Math.max(lo[j], v + rnd() * SIG[j] * sig)));
    const c = cost(y); if (c < bc) { bc = c; best = y; improved = true; }
  }
  sig = improved ? Math.min(1.6, sig * 1.1) : Math.max(0.3, sig * 0.9);
  if (it % 200 === 0) console.log(it, bc.toFixed(1), 'sig', sig.toFixed(2));
}
cost(best, true);
const p = toPar(best); console.log(JSON.stringify(p.a), 'offset', JSON.stringify(p.d), 'rot', JSON.stringify(p.r));

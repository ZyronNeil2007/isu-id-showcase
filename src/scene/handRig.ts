// Hand skeleton shared by the offline mesh generator (tools/genhand.ts) and the runtime.
// Hand frame: Y along the fingers, +Z out of the palm, +X toward the thumb (right hand). 1 unit = 100 mm.
import { M4, m4, q, DEG, V3 } from '../engine/math';

export interface BoneDef {
  name: string; parent: number; off: V3; pre: V3; base: V3; segB: V3; r0: number; r1: number;
}
const B = (name: string, parent: number, off: V3, segB: V3, r0: number, r1: number, base: V3 = [0, 0, 0], pre: V3 = [0, 0, 0]): BoneDef => ({ name, parent, off, pre, base, segB, r0, r1 });

export const BONES: BoneDef[] = [
  B('fore', -1, [0, 0, 0], [0, -1.5, 0], 0.27, 0.34),
  B('palm', 0, [0, 0, 0], [0, 0.93, 0], 0.27, 0.27),
  // index
  B('i1', 1, [0.285, 0.94, 0.0], [0, 0.40, 0], 0.095, 0.088, [84, 0, -14.3]),
  B('i2', 2, [0, 0.40, 0], [0, 0.23, 0], 0.088, 0.080, [66.7, 0, 0]),
  B('i3', 3, [0, 0.23, 0], [0, 0.135, 0], 0.080, 0.070, [41.5, 0, 0]),
  // middle
  B('m1', 1, [0.10, 0.97, 0.0], [0, 0.44, 0], 0.097, 0.090, [76, 0, 0]),
  B('m2', 5, [0, 0.44, 0], [0, 0.26, 0], 0.090, 0.082, [88, 0, 0]),
  B('m3', 6, [0, 0.26, 0], [0, 0.14, 0], 0.082, 0.070, [36, 0, 0]),
  // ring
  B('r1', 1, [-0.09, 0.94, 0.0], [0, 0.41, 0], 0.092, 0.085, [82, 0, 3]),
  B('r2', 8, [0, 0.41, 0], [0, 0.24, 0], 0.085, 0.078, [90, 0, 0]),
  B('r3', 9, [0, 0.24, 0], [0, 0.13, 0], 0.078, 0.066, [38, 0, 0]),
  // pinky
  B('p1', 1, [-0.265, 0.86, 0.0], [0, 0.31, 0], 0.082, 0.075, [86, 0, 8]),
  B('p2', 11, [0, 0.31, 0], [0, 0.18, 0], 0.075, 0.069, [86, 0, 0]),
  B('p3', 12, [0, 0.18, 0], [0, 0.11, 0], 0.069, 0.060, [38, 0, 0]),
  // thumb
  B('t1', 1, [0.17, 0.10, 0.04], [0, 0.40, 0], 0.122, 0.104, [2, -14.6, 22], [20, 0, -40]),
  B('t2', 14, [0, 0.40, 0], [0, 0.29, 0], 0.104, 0.090, [18, 8.1, 0]),
  B('t3', 15, [0, 0.29, 0], [0, 0.16, 0], 0.090, 0.074, [2.6, 8.3, 0]),
];
export const FINGERS = { index: [2, 3, 4], middle: [5, 6, 7], ring: [8, 9, 10], pinky: [11, 12, 13], thumb: [14, 15, 16] };
export const NBONES = BONES.length;

export type Pose = Record<string, V3>; // bone name -> extra euler (deg) added to base

export function localMat(b: BoneDef, extra: V3 = [0, 0, 0]): M4 {
  const pre = q.euler(b.pre[0] * DEG, b.pre[1] * DEG, b.pre[2] * DEG);
  const rot = q.euler((b.base[0] + extra[0]) * DEG, (b.base[1] + extra[1]) * DEG, (b.base[2] + extra[2]) * DEG);
  return m4.mul(m4.translate(b.off[0], b.off[1], b.off[2]), m4.fromTRS([0, 0, 0], q.mul(pre, rot)));
}
// World (hand-frame) matrices for every bone
export function solveRig(pose: Pose = {}): M4[] {
  const out: M4[] = [];
  for (let i = 0; i < BONES.length; i++) {
    const b = BONES[i]; const l = localMat(b, pose[b.name]);
    out.push(b.parent < 0 ? l : m4.mul(out[b.parent], l));
  }
  return out;
}

let restInv: M4[] | null = null;
export function skinMatrices(pose: Pose, out: Float32Array): M4[] {
  if (!restInv) restInv = solveRig().map(m4.invert);
  const w = solveRig(pose);
  for (let i = 0; i < w.length; i++) out.set(m4.mul(w[i], restInv[i]), i * 16);
  return w;
}

// animation: open 0 (pinched on the card) -> 1 (released); relax 0..1 flattens the hand afterwards
export function poseFor(open: number, relax: number, flick = 0): Pose {
  const o = open, r = relax;
  const p: Pose = {
    t1: [-14 * o - 10 * r, 0, -8 * o], t2: [-24 * o - 12 * r, 0, 0], t3: [-26 * o - 10 * r, 0, 0],
    i1: [-34 * o - 36 * r + 8 * flick, 0, 6 * o], i2: [-34 * o - 36 * r, 0, 0], i3: [-12 * o - 16 * r, 0, 0],
    m1: [-14 * o - 52 * r, 0, 0], m2: [-16 * o - 54 * r, 0, 0], m3: [-8 * o - 24 * r, 0, 0],
    r1: [-14 * o - 56 * r, 0, 0], r2: [-14 * o - 56 * r, 0, 0], r3: [-8 * o - 26 * r, 0, 0],
    p1: [-14 * o - 56 * r, 0, 0], p2: [-14 * o - 52 * r, 0, 0], p3: [-8 * o - 26 * r, 0, 0],
  };
  return p;
}

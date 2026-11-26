// Hand skeleton fitted to the supplied Hand.obj (see hand.generated.ts). Hand frame: Y along the fingers, +Z out of the palm, +X toward the thumb (right hand). 1 unit = 100 mm.
// The mesh is modelled in the sculpt's own relaxed pose, which is the rig's rest pose: every pose below is a set of extra euler angles (deg, bone-local; x = flexion) on top of it.
import { M4, m4, q, DEG, V3 } from '../engine/math';
import { RIG } from './hand.generated';

export const NBONES = RIG.names.length;
export const BONE_NAMES = RIG.names as readonly string[];
const PARENT = RIG.parent as readonly number[];
const REST_W: M4[] = (RIG.rest as readonly (readonly number[])[]).map(a => Float32Array.from(a));
const REST_INV: M4[] = REST_W.map(m => m4.invert(m));
const REST_L: M4[] = REST_W.map((w, i) => (PARENT[i] < 0 ? w : m4.mul(REST_INV[PARENT[i]], w)));
export const BONE_LEN = RIG.len as readonly number[];
export const FINGERS = { index: [1, 2, 3], middle: [4, 5, 6], ring: [7, 8, 9], pinky: [10, 11, 12], thumb: [13, 14, 15] };

export type Pose = Record<string, V3>; // bone name -> extra euler (deg): [flexion, twist, abduction]
const NAME_IDX: Record<string, number> = {}; BONE_NAMES.forEach((n, i) => { NAME_IDX[n] = i; });

// World (hand-frame) matrices for every bone in the given pose
export function solveRig(pose: Pose = {}): M4[] {
  const out: M4[] = [];
  for (let i = 0; i < NBONES; i++) {
    const e = pose[BONE_NAMES[i]];
    const l = e ? m4.mul(REST_L[i], m4.fromTRS([0, 0, 0], q.euler(e[0] * DEG, e[1] * DEG, e[2] * DEG))) : REST_L[i];
    out.push(PARENT[i] < 0 ? l : m4.mul(out[PARENT[i]], l));
  }
  return out;
}
export function skinMatrices(pose: Pose, out: Float32Array): M4[] {
  const w = solveRig(pose);
  for (let i = 0; i < w.length; i++) out.set(m4.mul(w[i], REST_INV[i]), i * 16);
  return w;
}

// ---- animation poses (extra angles relative to the sculpt's relaxed pose)
type PoseTable = Record<string, V3>;
const HOLD: PoseTable = {   // pinching the card (index pad on the front face, thumb pad on the back; solved so the pads meet 12 mm apart)
  i1: [32.7, 0, -7.6], i2: [43.2, 0, 0], i3: [45, 0, 0],
  t1: [0.2, 14.7, 11.3], t2: [-0.5, 0, -5.4], t3: [-35, 7.9, 0],
};
const OPEN: PoseTable = {   // card released: thumb and index let go, everything else lets the card fly
  i1: [4, 0, -6], i2: [8, 0, 0], i3: [10, 0, 0],
  t1: [-6, 6, 6], t2: [-8, 0, -4], t3: [-22, 4, 0],
};
const RELAX: PoseTable = {};  // settled afterwards
const lerp3 = (a: V3 | undefined, b: V3 | undefined, t: number): V3 => { const A = a || [0, 0, 0], B = b || [0, 0, 0]; return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; };

// open 0 (pinched on the card) -> 1 (released); relax 0..1 settles the hand afterwards; flick is a short index-finger kick at the release
export function poseFor(open: number, relax: number, flick = 0): Pose {
  const p: Pose = {};
  for (let i = 1; i < NBONES; i++) {
    const n = BONE_NAMES[i];
    const a = lerp3(HOLD[n], OPEN[n], open), b = lerp3(a, RELAX[n], relax);
    p[n] = b;
  }
  if (flick) { const f = p['i1']; p['i1'] = [f[0] + 8 * flick, f[1], f[2]]; }
  return p;
}

// Rest-pose bone frames for the skin shader (nails, tone): origin + length, axis + radius, pad-side (flexion) direction, nail-side direction
const RAD = [0, 0.085, 0.082, 0.078, 0.088, 0.085, 0.080, 0.082, 0.080, 0.075, 0.070, 0.068, 0.064, 0.100, 0.095, 0.090];
export function handShaderData(): { ba: Float32Array; bx: Float32Array; bp: Float32Array; bd: Float32Array } {
  const n = 16, ba = new Float32Array(n * 4), bx = new Float32Array(n * 4), bp = new Float32Array(n * 4), bd = new Float32Array(n * 4);
  for (let i = 0; i < NBONES; i++) {
    const W = REST_W[i];
    ba.set([W[12], W[13], W[14], BONE_LEN[i]], i * 4);
    bx.set([W[4], W[5], W[6], RAD[i]], i * 4);
    bp.set([W[8], W[9], W[10], 0], i * 4);
    bd.set([-W[8], -W[9], -W[10], 0], i * 4);
  }
  return { ba, bx, bp, bd };
}
export const setHandUniforms = (gl: WebGL2RenderingContext, prog: { l(n: string): WebGLUniformLocation | null }) => {
  const d = handShaderData();
  gl.uniform4fv(prog.l('uBA'), d.ba); gl.uniform4fv(prog.l('uBX'), d.bx); gl.uniform4fv(prog.l('uBP'), d.bp); gl.uniform4fv(prog.l('uBD'), d.bd);
};

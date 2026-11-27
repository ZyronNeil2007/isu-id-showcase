import { skinAll } from './collide';
import { handAt, heroCardPose } from '../src/story/story';
import { m4 } from '../src/engine/math';
import { handAttrs } from '../src/scene/handMesh';
const H = handAttrs(); const A = (l: number) => H.attrs.find(a => a.loc === l)!.data as Float32Array; const JJ = A(3), WW = A(4);
const G = (b: number) => (b === 0 ? 'palm' : b <= 3 ? 'index' : b <= 6 ? 'middle' : b <= 9 ? 'ring' : b <= 12 ? 'pinky' : 'thumb');
for (const p of process.argv.slice(2).map(Number)) {
  const w = skinAll(p), q = heroCardPose(p), C = m4.invert(m4.fromTRS(q.pos, q.quat)); const NV = w.length / 3;
  const front: Record<string, number> = {}, back: Record<string, number> = {}, inside: Record<string, number> = {};
  for (let v = 0; v < NV; v++) {
    const x = w[v*3], y = w[v*3+1], z = w[v*3+2];
    const cx = C[0]*x+C[4]*y+C[8]*z+C[12], cy = C[1]*x+C[5]*y+C[9]*z+C[13], cz = C[2]*x+C[6]*y+C[10]*z+C[14];
    if (Math.abs(cx) > 0.27 || Math.abs(cy) > 0.43) continue;
    let bi = JJ[v*4], bw = WW[v*4]; for (let k = 1; k < 4; k++) if (WW[v*4+k] > bw) { bw = WW[v*4+k]; bi = JJ[v*4+k]; }
    const g = G(bi);
    if (cz > 0.00475) front[g] = (front[g] || 0) + 1; else if (cz < -0.00475) back[g] = (back[g] || 0) + 1; else inside[g] = (inside[g] || 0) + 1;
  }
  console.log(p, 'front', JSON.stringify(front), 'back', JSON.stringify(back), 'inside', JSON.stringify(inside));
}

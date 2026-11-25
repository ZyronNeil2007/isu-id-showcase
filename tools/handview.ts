// Dev-only viewer for the hand mesh (not shipped).
import { GL } from '../src/engine/gl';
import { m4, DEG, V3, v3 } from '../src/engine/math';
import { SKIN_VS, SKIN_FS } from '../src/engine/shaders';
import { handAttrs } from '../src/scene/handMesh';
import { skinMatrices, poseFor } from '../src/scene/handRig';
import { slab } from '../src/scene/geometry';
import { METAL_FS, GEO_VS } from '../src/engine/shaders';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement; canvas.width = 900; canvas.height = 900;
const g = new GL(canvas); const gl = g.gl;
const { attrs, idx } = handAttrs(); const mesh = g.mesh(attrs, idx);
const prog = g.program('skin', SKIN_VS, SKIN_FS);
const bones = new Float32Array(24 * 16);
const open = +(q.get('open') || 0), relax = +(q.get('relax') || 0);
skinMatrices(poseFor(open, relax), bones);
const yaw = +(q.get('yaw') || 0) * DEG, pitch = +(q.get('pitch') || 0) * DEG, dist = +(q.get('d') || 5);
const CIH = { x: [-0.9985, 0, 0.0554], y: [0.0232, 0.9079, 0.4185], z: [-0.0503, 0.4191, -0.9065], c: [0.3968, 1.0049, 0.5346] } as any;
const side = q.get('card') === 'A' ? -1 : 1;
const zc = v3.mul(CIH.z, -side) as V3; // option B => front normal = +a = -z
const yc = CIH.y as V3; const xc = v3.cross(yc, zc);
const cardM = new Float32Array([xc[0], xc[1], xc[2], 0, yc[0], yc[1], yc[2], 0, zc[0], zc[1], zc[2], 0, CIH.c[0], CIH.c[1], CIH.c[2], 1]);
let cam: V3, target: V3, up: V3 = [0, 1, 0];
if (q.get('view') === 'card') { target = v3.add(CIH.c, v3.mul(yc, -0.2)) as V3; const d = v3.add(v3.mul(zc, Math.cos(yaw)), v3.mul(xc, Math.sin(yaw))); cam = v3.add(target, v3.mul(v3.norm(v3.add(d, v3.mul(yc, Math.sin(pitch)))), dist)) as V3; up = yc; }
else { cam = [Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist + 0.5, Math.cos(yaw) * Math.cos(pitch) * dist]; target = [0, 0.4, 0]; }
gl.viewport(0, 0, 900, 900); gl.clearColor(0.8, 0.78, 0.72, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
const vp = m4.mul(m4.perspective(30 * DEG, 1, 0.1, 50), m4.lookAt(cam, target, up));
prog.use(); prog.i('uShadow', 5); prog.i('uShadowRaw', 6); prog.v3('uCam', cam); prog.f('uMood', 0); prog.v3('uKeyDir', v3.norm([-0.4, 0.5, 0.75])); prog.f('uExposure', 1);
prog.v4('uSh', [0, 0, 0, 0]); prog.v3('uSkin', [0.50, 0.30, 0.20]); prog.f('uWeight', 1);
prog.m('uVP', vp); prog.m('uModel', m4.ident()); gl.uniformMatrix4fv(prog.l('uBones'), false, bones);
g.draw(mesh);
if (q.get('card')) {
  const sg = slab(0.54, 0.86, 0.012, 0.0318);
  const cm = g.mesh([{ loc: 0, data: sg.pos, size: 3 }, { loc: 1, data: sg.nor, size: 3 }, { loc: 2, data: sg.uv, size: 2 }], sg.idx);
  const mp = g.program('metal', GEO_VS, METAL_FS); mp.use(); mp.i('uShadow', 5); mp.i('uShadowRaw', 6);
  mp.v3('uCam', cam); mp.f('uMood', 0); mp.v3('uKeyDir', v3.norm([-0.4, 0.5, 0.75])); mp.f('uExposure', 1); mp.v4('uSh', [0, 0, 0, 0]);
  mp.v3('uBase', [0.9, 0.95, 0.9]); mp.f('uRough', 0.3); mp.f('uMetal', 0); mp.m('uVP', vp); mp.m('uModel', cardM); g.draw(cm);
}
(window as any).done = true;

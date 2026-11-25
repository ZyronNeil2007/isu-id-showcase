import { HAND } from './hand.generated';
import type { AttrSpec } from '../engine/gl';

const dec = (s: string) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

export function handAttrs(): { attrs: AttrSpec[]; idx: Uint16Array | Uint32Array } {
  const nv = HAND.nv;
  const p16 = new Int16Array(dec(HAND.pos).buffer), n8 = new Int8Array(dec(HAND.nor).buffer);
  const ao8 = dec(HAND.ao), j8 = dec(HAND.j), w8 = dec(HAND.w);
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), ao = new Float32Array(nv), j = new Float32Array(nv * 4), w = new Float32Array(nv * 4);
  for (let i = 0; i < nv; i++) {
    for (let k = 0; k < 3; k++) {
      pos[i * 3 + k] = ((p16[i * 3 + k] / 32767) + 1) / 2 * (HAND.bmax[k] - HAND.bmin[k]) + HAND.bmin[k];
      nor[i * 3 + k] = n8[i * 3 + k] / 127;
    }
    ao[i] = ao8[i] / 255;
    for (let k = 0; k < 4; k++) { j[i * 4 + k] = j8[i * 4 + k]; w[i * 4 + k] = w8[i * 4 + k] / 255; }
  }
  const ib = dec(HAND.idx);
  const idx = HAND.u32 ? new Uint32Array(ib.buffer) : new Uint16Array(ib.buffer);
  return { attrs: [{ loc: 0, data: pos, size: 3 }, { loc: 1, data: nor, size: 3 }, { loc: 3, data: j, size: 4 }, { loc: 4, data: w, size: 4 }, { loc: 5, data: ao, size: 1 }], idx };
}

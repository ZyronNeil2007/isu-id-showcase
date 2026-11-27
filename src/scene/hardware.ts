// Lanyard hardware, modelled after the supplied references (buckle.webp, D-Ring_Swivel_Clasp.png) and placed/scaled like muckup.jpg.
//   - a black two-part side-release buckle (female slot-loop on the strap, waisted body with squeeze prongs, male slot-loop on the end-piece)
//   - a polished D-ring swivel snap hook (flat-topped D-ring, bolt + washer + collar swivel, teardrop frame with a hinged spring gate)
// Lanyard space: origin where the two strands meet, +y up, the badge hangs towards -y. Units: 1 = 100 mm.
import { M4, V3, m4 } from '../engine/math';
import { Geo, torus, roundedBox, catmull } from './geometry';

export interface HwPart { geo: Geo; M: M4; base: V3; rough: number; metal: number; jaw?: boolean; }

/** where the split ring sits (centre of the hook's lower bar) */
export const HW_RING_Y = -1.035;
/** the spring gate hinges about this point (lanyard space) */
export const GATE_PIVOT: [number, number] = [0.0, -0.85];
/** the visible end-piece is short, like the mockup: 40 mm of the 50 mm artwork (the outer 5 mm top and bottom are the part folded away inside the buckle and round the D-ring). Centre y and length: */
export const SLEEVE_SHIFT = -0.51, SLEEVE_LEN = 0.40;

// ---------------------------------------------------------------- mesh helpers
const norm3 = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** area-weighted smooth normals, then flip winding if the faces disagree with them (the shader flips normals on back faces) */
function finish(P: number[], I: number[], U: number[]): Geo {
  const n = P.length / 3, N = new Float32Array(n * 3);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const o of [a, b, c]) { N[o] += f[0]; N[o + 1] += f[1]; N[o + 2] += f[2]; }
  }
  for (let i = 0; i < n; i++) { const q = norm3([N[i * 3], N[i * 3 + 1], N[i * 3 + 2]]); N[i * 3] = q[0]; N[i * 3 + 1] = q[1]; N[i * 3 + 2] = q[2]; }
  // orientation: a closed surface has outward normals; compare with the direction from the centroid
  let cx = 0, cy = 0, cz = 0; for (let i = 0; i < n; i++) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; } cx /= n; cy /= n; cz /= n;
  let s = 0; for (let i = 0; i < n; i++) s += (P[i * 3] - cx) * N[i * 3] + (P[i * 3 + 1] - cy) * N[i * 3 + 1] + (P[i * 3 + 2] - cz) * N[i * 3 + 2];
  return { pos: new Float32Array(P), nor: N, uv: new Float32Array(U), idx: n > 65535 ? new Uint32Array(I) : new Uint16Array(I), _flip: s < 0 } as any;
}
/** finalize: if the winding turned out inward, reverse it (the shader flips normals on back faces, so winding must be outward) */
function fin(P: number[], I: number[], U: number[]): Geo {
  const g = finish(P, I, U) as any;
  if (g._flip) { for (let t = 0; t < g.idx.length; t += 3) { const x = g.idx[t + 1]; g.idx[t + 1] = g.idx[t + 2]; g.idx[t + 2] = x; } for (let i = 0; i < g.nor.length; i++) g.nor[i] = -g.nor[i]; }
  delete g._flip; return g;
}

/** rounded-rectangle outline (centre 0,0, half extents a,b, corner radius r) -> points + outward normals */
function rrProfile(a: number, b: number, r: number, seg: number) {
  r = Math.max(1e-4, Math.min(r, a - 1e-4, b - 1e-4));
  const pts: number[][] = [], nrm: number[][] = [];
  const cx = [a - r, -(a - r), -(a - r), a - r], cy = [b - r, b - r, -(b - r), -(b - r)];
  for (let c = 0; c < 4; c++) for (let i = 0; i <= seg; i++) {
    const t = (c * 90 + (i / seg) * 90) * Math.PI / 180, nx = Math.cos(t), ny = Math.sin(t);
    pts.push([cx[c] + nx * r, cy[c] + ny * r]); nrm.push([nx, ny]);
  }
  return { pts, nrm };
}

/** loft along -y through rounded-rectangle sections of varying size (x half-width hw, z half-depth hz); ends are bevelled and capped */
export function loft(rows: { y: number; hw: number; hz: number; r?: number }[], bevel = 0.005, seg = 4): Geo {
  const rs = [...rows];
  const f = rs[0], l = rs[rs.length - 1];
  rs.unshift({ y: f.y, hw: f.hw - bevel, hz: f.hz - bevel, r: (f.r ?? 0.01) }); rs[1] = { ...f, y: f.y - bevel * 0.8 };
  rs.push({ ...l, y: l.y + bevel * 0.8 }, { y: l.y, hw: l.hw - bevel, hz: l.hz - bevel, r: (l.r ?? 0.01) });
  const P: number[] = [], U: number[] = [], I: number[] = [];
  const ringN = 4 * (seg + 1);
  rs.forEach((row, ri) => {
    const { pts } = rrProfile(row.hw, row.hz, row.r ?? 0.01, seg);
    for (let j = 0; j < ringN; j++) { P.push(pts[j][0], row.y, pts[j][1]); U.push(j / ringN, ri / (rs.length - 1)); }
  });
  for (let i = 0; i < rs.length - 1; i++) for (let j = 0; j < ringN; j++) {
    const a = i * ringN + j, b = i * ringN + (j + 1) % ringN, c = a + ringN, d = b + ringN; I.push(a, b, c, b, d, c);
  }
  for (const [ri, up] of [[0, true], [rs.length - 1, false]] as [number, boolean][]) {
    const c = P.length / 3; P.push(0, rs[ri].y, 0); U.push(0.5, 0.5);
    for (let j = 0; j < ringN; j++) { const a = ri * ringN + j, b = ri * ringN + (j + 1) % ringN; if (up) I.push(c, b, a); else I.push(c, a, b); }
  }
  return fin(P, I, U);
}

/** sweep a rounded-rectangle section (w in the plane, d across it) along a planar path in XY. Open paths get flat rounded ends. */
export function sweep(path: number[][], closed: boolean, w: number, d: number, r: number, seg = 4): Geo {
  const n = path.length, { pts, nrm } = rrProfile(w / 2, d / 2, r, seg), ringN = pts.length;
  const P: number[] = [], U: number[] = [], I: number[] = [];
  // arc length for the UVs
  const S: number[] = [0]; for (let i = 1; i < n; i++) S.push(S[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const tot = S[n - 1] + (closed ? Math.hypot(path[0][0] - path[n - 1][0], path[0][1] - path[n - 1][1]) : 0) || 1;
  const T: number[][] = path.map((_, i) => {
    const a = path[closed ? (i + n - 1) % n : Math.max(0, i - 1)], b = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  });
  for (let i = 0; i < n; i++) {
    const nx = -T[i][1], ny = T[i][0];
    for (let j = 0; j < ringN; j++) { P.push(path[i][0] + nx * pts[j][0], path[i][1] + ny * pts[j][0], pts[j][1]); U.push(j / ringN, S[i] / tot); }
  }
  const rings = closed ? n : n - 1;
  for (let i = 0; i < rings; i++) for (let j = 0; j < ringN; j++) {
    const a = i * ringN + j, b = i * ringN + (j + 1) % ringN, c = ((i + 1) % n) * ringN + j, e = ((i + 1) % n) * ringN + (j + 1) % ringN; I.push(a, b, c, b, e, c);
  }
  if (!closed) {
    for (const [ri, up] of [[0, true], [n - 1, false]] as [number, boolean][]) {
      // rounded end: a shrunken inner ring then a centre point (keeps the end soft instead of a flat disc)
      const base = P.length / 3, t = T[ri], k = up ? -1 : 1, e = Math.min(w, d) * 0.22;
      const inner = rrProfile(w / 2 - e, d / 2 - e, Math.max(1e-3, r - e), seg).pts, nx = -t[1], ny = t[0];
      for (let j = 0; j < ringN; j++) { P.push(path[ri][0] + nx * inner[j][0] + t[0] * k * e, path[ri][1] + ny * inner[j][0] + t[1] * k * e, inner[j][1]); U.push(j / ringN, up ? 0 : 1); }
      const c = P.length / 3; P.push(path[ri][0] + t[0] * k * e, path[ri][1] + t[1] * k * e, 0); U.push(0.5, up ? 0 : 1);
      for (let j = 0; j < ringN; j++) {
        const a = ri * ringN + j, b = ri * ringN + (j + 1) % ringN, ia = base + j, ib = base + (j + 1) % ringN;
        if (up) { I.push(a, ia, b, b, ia, ib, c, ib, ia); } else { I.push(a, b, ia, b, ib, ia, c, ia, ib); }
      }
    }
  }
  return fin(P, I, U);
}

/** surface of revolution about +y. profile = [radius, y] going top -> bottom; list a point twice for a crease. */
export function lathe(profile: number[][], seg = 28): Geo {
  const P: number[] = [], U: number[] = [], I: number[] = [], m = profile.length;
  for (let i = 0; i < m; i++) for (let j = 0; j <= seg; j++) {
    const a = j / seg * Math.PI * 2; P.push(Math.cos(a) * profile[i][0], profile[i][1], Math.sin(a) * profile[i][0]); U.push(j / seg, i / (m - 1));
  }
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; I.push(a, a + 1, b, a + 1, b + 1, b); }
  return fin(P, I, U);
}

export function ellipsoid(a: number, b: number, c: number, seg = 22, rings = 14): Geo {
  const P: number[] = [], U: number[] = [], I: number[] = [];
  for (let i = 0; i <= rings; i++) for (let j = 0; j <= seg; j++) {
    const t = i / rings * Math.PI, u = j / seg * Math.PI * 2;
    P.push(a * Math.sin(t) * Math.cos(u), b * Math.cos(t), c * Math.sin(t) * Math.sin(u)); U.push(j / seg, i / rings);
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const q = i * (seg + 1) + j, r = q + seg + 1; I.push(q, r, q + 1, r, r + 1, q + 1); }
  return fin(P, I, U);
}

/** half-dome rivet head facing +z, base radius r, height h */
const dome = (r: number, h: number) => lathe([[0, h], [r * 0.45, h * 0.93], [r * 0.8, h * 0.68], [r * 0.97, h * 0.3], [r, 0], [r, -0.004], [0, -0.004]], 24);

/** smooth a planar control polygon (Catmull-Rom) so swept bars have no facets */
const smoothPath = (pts: number[][], sub = 6): number[][] => catmull(pts.map(p => [p[0], p[1], 0] as V3), sub).map(p => [p[0], p[1]]);

// ---------------------------------------------------------------- placement helpers
const T3 = (x: number, y: number, z: number) => m4.translate(x, y, z);
const RX = (a: number) => m4.rotX(a);

// ---------------------------------------------------------------- hardware
export function buildHardware(): HwPart[] {
  const out: HwPart[] = [];
  const steel: V3 = [0.80, 0.81, 0.83], satin: V3 = [0.70, 0.71, 0.73], blk: V3 = [0.012, 0.013, 0.015], blk2: V3 = [0.007, 0.007, 0.008], web: V3 = [0.012, 0.085, 0.07];
  const add = (geo: Geo, M: M4, base: V3, rough: number, metal: number, jaw = false) => out.push({ geo, M, base, rough, metal, jaw });

  // ================================================================ side-release buckle (black acetal)
  // overall 24 x 40 mm, from just over the strap end (y +0.02) to y -0.38. Proportions follow buckle.webp's assembled view.
  const y0 = 0.02, X = (px: number) => (px - 315) * 0.00096, Y = (py: number) => y0 - (py - 5) * 0.000825;
  const PL = 0.5;   // plastic roughness (satin moulded finish)
  // female part: upper slot-loop, the strap goes through the slot
  const loopTop = [Y(5), Y(150)], slotTop = [Y(45), Y(110)];
  const hwTop = X(440), swTop = X(410);
  const bar = (x0: number, x1: number, ya: number, yb: number, hz: number, r: number, base = blk, rough = PL) =>
    add(roundedBox((x1 - x0) / 2, (ya - yb) / 2, hz, r, 5), T3((x0 + x1) / 2, (ya + yb) / 2, 0), base, rough, 0);
  bar(-hwTop, hwTop, loopTop[0], slotTop[0] - 0.002, 0.021, 0.011);                         // top bar
  bar(-hwTop, hwTop, slotTop[1] + 0.002, loopTop[1] - 0.004, 0.021, 0.011);                // bar under the slot
  bar(-hwTop, -swTop, loopTop[0], loopTop[1], 0.021, 0.011);                               // sides
  bar(swTop, hwTop, loopTop[0], loopTop[1], 0.021, 0.011);
  // the webbing running through the slot (dark teal, matches the strap's buckle end)
  add(roundedBox(swTop - 0.003, (slotTop[0] - slotTop[1]) / 2 + 0.004, 0.0075, 0.003, 3), T3(0, (slotTop[0] + slotTop[1]) / 2, -0.004), web, 0.85, 0);
  // body: waisted plate that carries the squeeze prongs, then flares out to the male slot-loop
  const hwB = (px: number) => px * 0.00096;
  add(loft([
    { y: Y(146), hw: hwB(125), hz: 0.030, r: 0.014 }, { y: Y(230), hw: hwB(125), hz: 0.031, r: 0.015 }, { y: Y(262), hw: hwB(114), hz: 0.031, r: 0.015 },
    { y: Y(298), hw: hwB(97), hz: 0.031, r: 0.015 }, { y: Y(330), hw: hwB(100), hz: 0.030, r: 0.015 }, { y: Y(366), hw: hwB(117), hz: 0.029, r: 0.014 }, { y: Y(394), hw: hwB(122), hz: 0.027, r: 0.013 },
  ], 0.006, 5), T3(0, 0, 0), blk, PL - 0.06, 0);
  // squeeze prongs: oval bosses at the waist, each with a recessed dimple
  for (const sx of [-1, 1]) {
    add(ellipsoid(0.034, 0.052, 0.021, 20, 12), T3(sx * 0.082, Y(288), 0.012), blk, PL - 0.1, 0);
    add(ellipsoid(0.014, 0.017, 0.004, 14, 8), T3(sx * 0.080, Y(284), 0.0336), blk2, 0.62, 0);
  }
  // fine seam where the female part meets the body, and the face panel line above the male loop
  add(roundedBox(hwTop - 0.004, 0.0019, 0.0235, 0.0012, 3), T3(0, Y(148), 0.0), blk2, 0.7, 0);
  add(roundedBox(0.081, 0.0016, 0.0155, 0.001, 3), T3(0, Y(388), 0.0265), blk2, 0.7, 0);
  // male part: lower slot-loop, the end-piece is threaded through it
  const loopLow = [Y(386), Y(490)], slotLow = [Y(420), Y(455)];
  const hwL = X(430), swL = X(397);
  bar(-hwL, hwL, slotLow[1] + 0.002, loopLow[1], 0.0215, 0.011);                          // bottom bar
  bar(-hwL, -swL, loopLow[0], loopLow[1], 0.0215, 0.011);
  bar(swL, hwL, loopLow[0], loopLow[1], 0.0215, 0.011);
  bar(-hwL, hwL, loopLow[0], slotLow[0] - 0.002, 0.0215, 0.011);

  // ================================================================ D-ring swivel snap hook (polished nickel)
  const YB = -0.665, A = 0.113, FR = 0.016;           // D-ring: flat bar centre-line y, half-width (centre-line), fillet radius
  const pts: number[][] = [];
  for (let i = 0; i <= 6; i++) pts.push([-(A - FR) + (2 * (A - FR) * i) / 6, YB]);                                              // flat bar, left -> right
  for (let i = 1; i <= 5; i++) { const t = (i / 5) * Math.PI / 2; pts.push([(A - FR) + Math.sin(t) * FR, YB - FR + Math.cos(t) * FR]); }   // right fillet
  for (let i = 1; i < 40; i++) { const t = (i / 40) * Math.PI; pts.push([Math.cos(t) * A, YB - FR - Math.sin(t) * A]); }       // half-round
  for (let i = 0; i < 5; i++) { const t = (i / 5) * Math.PI / 2; pts.push([-(A - FR) - Math.cos(t) * FR, YB - FR + Math.sin(t) * FR]); }   // left fillet
  add(sweep(pts, true, 0.021, 0.028, 0.0075, 4), m4.ident(), steel, 0.15, 1);

  // swivel: bolt head inside the D, washer + collar under the arc, then the hook neck
  const yAp = YB - FR - A;                                  // centre-line of the arc's lowest point
  add(lathe([[0, yAp + 0.026], [0.012, yAp + 0.0245], [0.0185, yAp + 0.019], [0.0195, yAp + 0.009], [0.0195, yAp + 0.0], [0, yAp + 0.0]], 28), m4.ident(), steel, 0.2, 1);
  add(lathe([[0, yAp - 0.0105], [0.032, yAp - 0.0105], [0.0345, yAp - 0.0125], [0.0345, yAp - 0.0185], [0.031, yAp - 0.0205], [0, yAp - 0.0205]], 32), m4.ident(), satin, 0.2, 1);
  const yN = -0.81;                                          // top of the hook body
  add(lathe([[0, yAp - 0.02], [0.0235, yAp - 0.02], [0.0235, yAp - 0.0245], [0.0265, yAp - 0.028], [0.0265, yN + 0.002], [0.0215, yN - 0.004], [0, yN - 0.004]], 28), m4.ident(), steel, 0.17, 1);

  // hook body: solid neck/shoulder block, teardrop frame bar, hinge rivets
  const s = 0.00051, hx = (px: number) => (px - 235) * 0.00066, hy = (py: number) => yN - (py - 300) * s;   // 130 mm-wide snap hook: ~0.68 of the D-ring width, as in the reference
  add(loft([
    { y: yN, hw: 0.026, hz: 0.020, r: 0.012 }, { y: yN - 0.025, hw: 0.034, hz: 0.0205, r: 0.012 }, { y: yN - 0.05, hw: 0.047, hz: 0.021, r: 0.012 }, { y: yN - 0.072, hw: 0.056, hz: 0.021, r: 0.012 },
  ], 0.006, 5), m4.ident(), steel, 0.15, 1);
  const frame: number[][] = [[222, 372], [208, 412], [186, 452], [160, 515], [140, 575], [129, 630], [130, 675], [144, 715], [176, 742], [235, 750], [294, 742], [327, 716], [341, 676], [341, 636], [336, 618]].map(([px, py]) => [hx(px), hy(py)]);
  add(sweep(smoothPath(frame), false, 0.026, 0.041, 0.0105, 4), m4.ident(), steel, 0.15, 1);
  // the hinge rivet, both faces (the gate swings about it)
  const hp: [number, number] = [GATE_PIVOT[0], GATE_PIVOT[1]];
  for (const sz of [1, -1]) add(dome(0.0135, 0.0075), m4.mul(T3(hp[0], hp[1], sz * 0.0205), sz > 0 ? RX(Math.PI / 2) : RX(-Math.PI / 2)), steel, 0.14, 1);
  // spring gate: a slimmer bar from the hinge down the right side to the nose of the frame
  const gate: number[][] = [[237, 385], [258, 418], [282, 470], [306, 525], [326, 575], [337, 608]].map(([px, py]) => [hx(px), hy(py)]);
  add(sweep(smoothPath(gate, 5), false, 0.017, 0.031, 0.007, 4), m4.ident(), satin, 0.17, 1, true);

  // split ring in the YZ plane: it links the hook's lower bar and passes through the badge holder's hanging slot
  add(torus(0.04, 0.0062, 56, 10), m4.mul(T3(0, HW_RING_Y, 0), m4.rotY(Math.PI / 2)), steel, 0.16, 1);
  return out;
}

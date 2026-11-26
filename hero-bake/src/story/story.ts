// Scroll -> scene. Every pose below is a pure function of scroll progress, so the whole film scrubs both ways.
import { M4, V3, Q4, m4, q, v3, clamp, lerp, smooth, smoother, easeOut, easeInOut, range, noise1, DEG } from '../engine/math';
import { Frame, CardDraw } from '../scene/world';
import { Path, pathAt, LAN } from '../scene/lanyard';

// ---------------------------------------------------------------- helpers
type Key = [number, number, number?];
export function curve(keys: Key[]) {
  const n = keys.length, tg = keys.map((k, i) => k[2] ?? (i === 0 ? (keys[1][1] - k[1]) / (keys[1][0] - k[0]) * 0.5 : i === n - 1 ? (k[1] - keys[i - 1][1]) / (k[0] - keys[i - 1][0]) * 0.5 : (keys[i + 1][1] - keys[i - 1][1]) / (keys[i + 1][0] - keys[i - 1][0])));
  return (x: number) => {
    if (x <= keys[0][0]) return keys[0][1]; if (x >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0; while (keys[i + 1][0] < x) i++;
    const x0 = keys[i][0], x1 = keys[i + 1][0], h = x1 - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * keys[i][1] + (t3 - 2 * t2 + t) * h * tg[i] + (-2 * t3 + 3 * t2) * keys[i + 1][1] + (t3 - t2) * h * tg[i + 1];
  };
}
const lerp3 = (a: V3, b: V3, t: number): V3 => v3.lerp(a, b, t);
const T = (p: V3) => m4.translate(p[0], p[1], p[2]);
const mulAll = (...ms: M4[]) => ms.reduce((a, b) => m4.mul(a, b));

// ---------------------------------------------------------------- hand <-> card relationship (from the pinch solve)
const yc: V3 = v3.norm([-0.0018, 0.9998, 0.0219]), zc: V3 = v3.norm([-0.08, -0.022, 0.9966]);
const xc: V3 = v3.norm(v3.cross(yc, zc));
const cc: V3 = [0.4081, 1.1759, 0.5358];
const CIH = new Float32Array([xc[0], xc[1], xc[2], 0, yc[0], yc[1], yc[2], 0, zc[0], zc[1], zc[2], 0, cc[0], cc[1], cc[2], 1]);
const CIH_INV = m4.invert(CIH);
export const CARD_H = 0.86, CARD_W = 0.54;
const SKIN: V3 = [0.46, 0.265, 0.175];

// ---------------------------------------------------------------- hardware / holder geometry (lanyard space, +y up)
const HANG_Y = 1.0;                       // lanyard origin (where the strands meet) when hanging
const RING_Y = -1.31;                     // split ring centre
const CARD_BELOW = 0.50;                  // card centre sits this far below the ring when seated
const SLIDE_OUT = 0.95;                   // how far the card is pulled out of the holder (downwards) to be free
const HANG_POS: V3 = [0, HANG_Y, 0];
const PIVOT: V3 = [0, LAN.Hs, 0];
export function lanyardMatrix(pos: V3, theta: number): M4 {
  return mulAll(T(pos), T(PIVOT), m4.rotZ(theta), T([-PIVOT[0], -PIVOT[1], -PIVOT[2]]));
}
// holder frame (also the seated card): swings about the split ring; `slide` pulls the card down out of the holder
function attachedCard(lanM: M4, phi: number, slide = 0): M4 { return mulAll(lanM, T([0, RING_Y, 0]), m4.rotZ(phi), T([0, -CARD_BELOW - slide, 0])); }

// ---------------------------------------------------------------- hero keyframes
const P_REL = 0.275;
const CARD_START_Y = HANG_Y + RING_Y - CARD_BELOW - SLIDE_OUT;          // card waits just under the holder
const hx = curve([[0, 0.55], [0.12, 0.02], [0.2, 0], [P_REL, 0.04], [0.4, 0.2], [0.6, 0.0], [0.74, 0], [1, 0]]);
const hy = curve([[0, -1.55], [0.1, -0.78], [0.15, -0.72], [0.205, -0.84, -0.3], [P_REL, -0.12, 9.5], [0.34, 0.42, 6], [0.4, 0.55, 0], [0.52, 0.42, -1.0], [0.62, 0.30, -1.4], [0.70, -0.9, -7], [0.745, CARD_START_Y, -1.5], [1, CARD_START_Y, 0]]);
const hz = curve([[0, 0.3], [0.2, 0.3], [P_REL, 0.35], [0.4, 0.62], [0.55, 0.62], [0.68, 0.55], [0.745, 0.0], [1, 0]]);
const pitch = curve([[0, 0], [0.14, 0], [0.205, -0.24], [0.245, 0.30, 6], [P_REL, 0.34, 0], [0.36, 0.1, -3], [0.44, -0.12, 0], [0.56, 0.06, 0], [0.66, 0, 0], [1, 0]]);
const roll = curve([[0, -0.1], [0.14, -0.02], [P_REL, 0.03], [0.36, 0.22, 0], [0.46, -0.2, 0], [0.56, 0.1], [0.66, 0, 0], [1, 0]]);
const yawC = (p: number) => { const r = clamp((p - P_REL) / 0.355); return Math.PI * 2 * (r * r * (3 - 2 * r)) + 0.06 * Math.sin(p * 30) * (1 - r) * (p > P_REL ? 1 : 0); };
const bendAt = (p: number) => {
  const flick = Math.exp(-Math.pow((p - 0.255) / 0.016, 2));
  const rel = p > P_REL ? Math.exp(-(p - P_REL) * 38) * Math.cos((p - P_REL) * 210) * 0.1 : 0;
  return flick * 0.1 + rel;
};

export function heroCardPose(p: number): { pos: V3; quat: Q4 } {
  const pos: V3 = [hx(p), hy(p), hz(p)];
  const yaw = p > P_REL ? yawC(p) : 0;
  return { pos, quat: q.euler(pitch(p), yaw, roll(p)) };
}
const cardMatrix = (pose: { pos: V3; quat: Q4 }) => m4.fromTRS(pose.pos, pose.quat);

// lanyard descent + swing
const lanY = curve([[0.50, 5.2], [0.56, 4.2, -9], [0.66, 2.2, -9], [0.72, 1.15, -3.2], [0.745, HANG_Y, 2], [0.77, HANG_Y, 0], [1, HANG_Y, 0]]);
const swing = (t: number, amp: number) => amp * Math.exp(-t * 3.1) * Math.sin(t * 8.4);

export interface HudState {
  p: { reveal: number; lanyard: number; identity: number; frontback: number; final: number };
  section: string; stop: number; stopT: number; item: number; itemT: number;
  cardM: M4; cardM2: M4 | null; lanM: M4 | null; jaw: number; showEdit: number; flipB: number;
  words: number; path: Path; hold: number; pLocal: number;
}

export interface Inputs {
  sy: number; vw: number; vh: number; time: number; mouse: [number, number]; reduced: boolean; mobile: boolean;
  sections: Record<string, { top: number; h: number }>; path: Path;
}

// ---------------------------------------------------------------- tour stops
// Strap stops dwell on a stretch of the strip (s in mm); hardware stops dwell on a fixed spot in lanyard space.
interface Stop { id: string; p0: number; p1: number; s?: number; d?: number; pan?: [number, number]; hw?: { eye: V3; tgt: V3; orbit: number }; }
export const STOPS: Stop[] = [
  { id: 'strap', s: 40, d: 1.3, p0: 0.205, p1: 0.27, pan: [30, 120] },
  { id: 'values', s: 187, d: 1.95, p0: 0.325, p1: 0.49, pan: [80, 300] },
  { id: 'flame', s: 332, d: 0.62, p0: 0.535, p1: 0.59, pan: [326, 338] },
  { id: 'ornament', s: 395, d: 0.95, p0: 0.625, p1: 0.675, pan: [375, 415] },
  { id: 'seal', s: 450, d: 0.5, p0: 0.71, p1: 0.76, pan: [447, 453] },
  { id: 'wordmark', s: 728, d: 2.4, p0: 0.795, p1: 0.85, pan: [660, 800] },
  { id: 'buckle', p0: 0.89, p1: 0.935, hw: { eye: [0.25, -0.26, 1.85], tgt: [0, -0.32, 0], orbit: 0.5 } },
  { id: 'clasp', p0: 0.965, p1: 1.0, hw: { eye: [0.3, -1.1, 1.95], tgt: [0, -1.16, 0], orbit: 0.4 } },
];
const WORDS: [number, number][] = [[62.5, 95.2], [107.9, 141.2], [153.9, 244.4], [257, 311.4]];

function cameraOnStrap(path: Path, lanM: M4, s: number, d: number, yaw: number, lift = 0) {
  const { P, T: Tn, N } = pathAt(path, s);
  const B = v3.cross(N, Tn);
  const Pw = m4.point(lanM, P), Tw = v3.norm(m4.dir(lanM, Tn)), Nw = v3.norm(m4.dir(lanM, N)), Bw = v3.norm(m4.dir(lanM, B));
  const off = v3.add(v3.mul(Nw, Math.cos(yaw)), v3.mul(Tw, Math.sin(yaw)));
  const eye = v3.add(v3.madd(Pw, off, d), v3.mul(Bw, lift));
  return { eye, target: Pw, up: Bw };
}
interface Cam { eye: V3; target: V3; up: V3; }
// camera for stop i at dwell fraction t (0..1)
function stopCam(i: number, t: number, lanM: M4, path: Path, wide: number): Cam {
  const st = STOPS[i];
  if (st.hw) {
    const a = st.hw.orbit * Math.sin(t * Math.PI * 0.9 + 0.3) * 0.5, rel = v3.sub(st.hw.eye, st.hw.tgt), c = Math.cos(a), sn = Math.sin(a);
    const r: V3 = [rel[0] * c + rel[2] * sn, rel[1], -rel[0] * sn + rel[2] * c];
    return { eye: m4.point(lanM, v3.madd(st.hw.tgt, r, wide)), target: m4.point(lanM, st.hw.tgt), up: v3.norm(m4.dir(lanM, [0, 1, 0])) };
  }
  const pan = st.pan!, s = lerp(pan[0], pan[1], easeInOut(t)), yaw = 0.22 * Math.sin(t * Math.PI * 0.9 + 0.3) + 0.06;
  const f = cameraOnStrap(path, lanM, s, st.d! * wide, yaw);
  return { eye: f.eye, target: f.target, up: f.up };
}

// ---------------------------------------------------------------- the story
export class Story {
  update(I: Inputs): { frame: Frame; hud: HudState } {
    const { sy, vw, vh, time, reduced } = I, aspect = vw / vh;
    const S = I.sections, has = (k: string) => !!S[k];
    const full = (k: string) => has(k) ? clamp((sy - S[k].top) / Math.max(1, S[k].h)) : 0;
    const heldP = (k: string) => has(k) ? clamp((sy - S[k].top) / Math.max(1, S[k].h - vh)) : 0;
    const pr = { reveal: full('reveal'), lanyard: full('lanyard'), identity: full('identity'), frontback: heldP('frontback'), final: heldP('final') };
    const mx = reduced ? 0 : I.mouse[0], my = reduced ? 0 : I.mouse[1];
    const idle = reduced ? 0 : 1;
    const wide = Math.max(1, 0.9 / aspect);   // pull the camera back on narrow screens

    const frame: Frame = {
      w: 0, h: 0, eye: [0, 0, 5.6], target: [0, 0, 0], up: [0, 1, 0], fov: 28, mood: 0, spot: [0, 0.05], exposure: 1.0,
      lightCenter: [0, 0, 0], lightExtent: 3.4, shadow: true, cards: [], blur: null, lan: null, hand: null, wall: 1, keyDir: v3.norm([-0.42, 0.50, 0.76]),
    };
    const hud: HudState = { p: pr, section: 'reveal', stop: -1, stopT: 0, item: -1, itemT: 0, cardM: m4.ident(), cardM2: null, lanM: null, jaw: 0, showEdit: 0, flipB: 0, words: -1, path: I.path, hold: 0, pLocal: 0 };
    const mkLan = (M: M4, jaw: number, phiHolder: number, hl: [number, number, number, number] = [0, 0, 0, 0]) => ({ M, jaw, hl, holder: attachedCard(M, phiHolder, 0) });

    // ============================================================ 01 REVEAL
    const cur = this.section(I);
    hud.section = cur;
    if (cur === 'reveal') {
      const p = pr.reveal; hud.pLocal = p;
      let cardM = cardMatrix(heroCardPose(p));
      const inHand = p <= P_REL;
      // hand follows the card until release, then continues on its own path
      const handFromCard = (pp: number) => m4.mul(cardMatrix(heroCardPose(pp)), CIH_INV);
      let handM: M4;
      if (inHand) handM = handFromCard(p);
      else {
        const base = handFromCard(P_REL);
        const dx = curve([[P_REL, 0], [P_REL + 0.05, 0.12], [0.36, 0.3], [0.45, 0.65], [0.55, 1.15]])(p), dy = curve([[P_REL, 0], [P_REL + 0.05, 0.42], [0.34, 0.5, -1], [0.42, -0.5, -9], [0.52, -2.2, -9], [0.6, -3.4]])(p), dz = curve([[P_REL, 0], [0.4, 0.35], [0.55, 0.5]])(p);
        handM = m4.mul(T([dx, dy, dz]), base);
      }
      frame.hand = { M: handM, open: smooth(0.24, 0.29, p), relax: smooth(0.31, 0.46, p), flick: -Math.exp(-Math.pow((p - 0.235) / 0.025, 2)), skin: SKIN };
      if (p > 0.64) frame.hand = null;
      // lanyard assembly arrives from above with the clear holder hanging empty
      if (p > 0.49) {
        const th = swing(Math.max(0, (p - 0.745) * 26), reduced ? 0.008 : 0.03) + idle * 0.003 * Math.sin(time * 0.9) * smooth(0.9, 1, p);
        const lanM = lanyardMatrix([0, lanY(p), 0], th);
        const gate = p < 0.82 ? 0.7 : lerp(0.7, 0, easeOut(clamp((p - 0.82) / 0.04)));        // the lobster gate snaps shut once the card is seated
        const phiH = -swing(Math.max(0, (p - 0.835) * 26), reduced ? 0.01 : 0.09) + idle * 0.006 * Math.sin(time * 1.3 + 1) * smooth(0.9, 1, p);
        frame.lan = mkLan(lanM, gate, phiH); hud.lanM = lanM; hud.jaw = gate;
        // the card swoops under the holder, then slides up into it
        const slide = p < 0.77 ? SLIDE_OUT : SLIDE_OUT * (1 - easeInOut(range(p, 0.77, 0.83)));
        const seated = attachedCard(lanM, phiH, slide);
        const w = smooth(0.69, 0.74, p);
        cardM = w <= 0 ? cardM : blendM(cardM, seated, w);
      }
      const bend = bendAt(p);
      frame.cards = [{ M: cardM, bend: [bend, bend * 0.4], glow: 0 }];
      hud.cardM = cardM;
      // motion blur on the card in flight
      const speed = v3.len(v3.sub(heroCardPose(p).pos, heroCardPose(Math.max(0, p - 0.004)).pos)) / 0.004;
      const qa = heroCardPose(p).quat, qb = heroCardPose(Math.max(0, p - 0.004)).quat;
      const om = 2 * Math.acos(clamp(Math.abs(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3]), 0, 1)) / 0.004;
      if (!reduced && p < 0.69 && (speed > 1.0 || om > 2.5)) {
        const Texp = Math.min(0.011, 0.06 / Math.max(speed, 1e-3), 0.22 / Math.max(om, 1e-3)), K = 12, ms: M4[] = [];
        for (let i = 0; i < K; i++) ms.push(cardMatrix(heroCardPose(clamp(p - Texp * (i / (K - 1)) + Texp * 0.5, 0, 1))));
        frame.blur = ms;
      }
      // camera: close for the hand and the spin, pulls back while the card swoops under the holder, then pushes in
      const ty = curve([[0, -0.55], [0.12, -0.42], [0.27, -0.4], [0.38, 0.12], [0.48, 0.2], [0.62, 0.05], [0.70, -0.5], [0.83, -0.5], [1, -0.15]])(p);
      const dist = (curve([[0, 5.9], [0.27, 5.4], [0.4, 4.4], [0.52, 4.4], [0.62, 5.2], [0.70, 6.7], [0.83, 6.7], [1, 5.45]])(p)) * wide;
      frame.target = [0, ty, 0]; frame.eye = [mx * 0.32, ty + 0.22 + my * 0.14, dist];
      const sh = (window as any).__shift; if (sh) { frame.target[0] += sh[0]; frame.eye[0] += sh[0]; frame.target[1] += sh[1]; frame.eye[1] += sh[1]; }   // offline: off-centre static poster
      frame.spot = [0.0, 0.04 + 0.12 * smooth(0.3, 0.45, p) - 0.02];
      frame.mood = 0; frame.lightCenter = [0, 0.1, 0]; frame.lightExtent = 3.9; frame.wall = 1;
      hud.hold = 1 - smooth(0.2, 0.3, p);
    }

    // ============================================================ 02 LANYARD TOUR
    else if (cur === 'lanyard') {
      const p = pr.lanyard; hud.pLocal = p;
      const lanM = lanyardMatrix(HANG_POS, idle * 0.012 * Math.sin(time * 0.6));
      const phiH = idle * 0.008 * Math.sin(time * 1.1);
      const cardM = attachedCard(lanM, phiH);
      frame.mood = smooth(0, 0.1, p) * 0.97;
      frame.wall = 1 - smooth(0.04, 0.14, p);
      frame.lightCenter = [0, 1.5, 0]; frame.lightExtent = 5.6;
      const heroEye: V3 = [mx * 0.32, -0.15 + 0.22 + my * 0.14, 5.45 * wide];
      const hero: Cam = { eye: heroEye, target: [0, -0.15, 0], up: [0, 1, 0] };
      const over: Cam = { eye: [3.2, 1.3, 11.8 * wide], target: [0, 1.15, 0], up: [0, 1, 0] };
      let cam: Cam, stop = -1, stopT = 0, hl: [number, number, number, number] = [0, 0, 0, 0];
      if (p < 0.2) {
        const a = smoother(0.0, 0.12, p), b = smoother(0.12, 0.2, p), f0 = stopCam(0, 0, lanM, I.path, wide);
        // pull back to reveal the entire lanyard, then swoop toward the first stop
        const e1 = lerp3(hero.eye, over.eye, a), t1 = lerp3(hero.target, over.target, a);
        cam = { eye: lerp3(e1, f0.eye, b), target: lerp3(t1, f0.target, b), up: v3.norm(lerp3(hero.up, f0.up, b)) };
        if (p > 0.12) stop = 0;
      } else {
        let i = 0; while (i < STOPS.length - 1 && p >= STOPS[i + 1].p0) i++;
        const st = STOPS[i], nx = STOPS[i + 1];
        if (p <= st.p1 || !nx) {
          stopT = range(p, st.p0, st.p1); stop = i; cam = stopCam(i, stopT, lanM, I.path, wide);
        } else {
          // travel between stops: blend the two stop cameras and swing the eye out a little for parallax
          const u = smoother(0, 1, range(p, st.p1, nx.p0)), a = stopCam(i, 1, lanM, I.path, wide), b = stopCam(i + 1, 0, lanM, I.path, wide);
          const eye = lerp3(a.eye, b.eye, u), tgt = lerp3(a.target, b.target, u);
          cam = { eye: v3.madd(eye, v3.sub(eye, tgt), 0.55 * Math.sin(u * Math.PI)), target: tgt, up: v3.norm(lerp3(a.up, b.up, u)) };
          stop = u < 0.5 ? i : i + 1;
        }
        if (stop === 1 && p <= STOPS[1].p1) {
          const w = Math.min(3, Math.floor(stopT * 4.0)), within = stopT * 4 - w; hud.words = w;
          hl = [WORDS[w][0], WORDS[w][1], 0.9 * Math.sin(Math.PI * clamp(within)) * 0.6 + 0.4, 0];
        }
        if (stop === 2) hl[3] = 0.6 + 0.4 * Math.sin(time * 3);
      }
      const gate = stop === 7 ? 0.62 * Math.sin(Math.PI * clamp(stopT * 1.05)) : 0;     // demonstrate the spring gate at the clasp
      frame.lan = mkLan(lanM, gate, phiH, hl); frame.cards = [{ M: cardM, bend: [0, 0], glow: 0 }]; hud.cardM = cardM; hud.lanM = lanM; hud.jaw = gate;
      hud.stop = stop; hud.stopT = stopT;
      const mk2 = smoother(0.0, 0.12, p); frame.eye = v3.add(cam.eye, [mx * 0.06 * mk2, my * 0.04 * mk2, 0]); frame.target = cam.target; frame.up = cam.up;
      frame.spot = [0.05, 0.0];
      frame.exposure = lerp(1.0, 0.94, smooth(0.04, 0.2, p));
    }

    // ============================================================ 03 IDENTITY (card detaches, component breakdown)
    else if (cur === 'identity') {
      const p = pr.identity; hud.pLocal = p;
      frame.mood = 1; frame.wall = 0.0; frame.lightCenter = [0, 0.2, 0]; frame.lightExtent = 4.8;
      const hangLan = lanyardMatrix(HANG_POS, 0);
      // 0 - 0.2: the gate opens, the card slides down out of the holder, the lanyard rises away and the card floats to the stage
      const gateOpen = smooth(0.0, 0.05, p), slideOut = easeInOut(range(p, 0.03, 0.11)) * SLIDE_OUT, toStage = smoother(0.09, 0.2, p), lanUp = smoother(0.13, 0.27, p);
      const lanM = lanyardMatrix([0, lerp(HANG_Y, 7.0, lanUp), 0], 0);
      if (p < 0.3) { frame.lan = mkLan(lanM, 0.62 * gateOpen, 0); hud.lanM = lanM; hud.jaw = 0.62 * gateOpen; }
      const items = ITEMS, nItems = items.length;
      const u = clamp((p - 0.2) / 0.76), fIdx = u * nItems, idx = Math.min(nItems - 1, Math.floor(fIdx)), local = fIdx - idx;
      hud.item = p < 0.2 ? -1 : idx; hud.itemT = local;
      // the card turns over after the last front item
      const nFront = items.filter(i => i.side === 0).length;
      const turn = smoother(nFront - 0.5, nFront + 0.1, fIdx);
      const endHold = smoother(0.94, 1.0, p);                      // settle toward the front/back showcase pose
      const wob = idle * 0.05 * Math.sin(time * 0.8) * (1 - endHold);
      const sweep = (-0.18 + 0.3 * Math.sin(fIdx * 0.8)) * 0.35 * (1 - endHold);
      const yaw = Math.PI * turn + sweep * toStage + wob;
      const stage: V3 = [0, 0.05 + idle * 0.03 * Math.sin(time * 1.2) * toStage, 0.9];
      const stagePose = m4.fromTRS(stage, q.euler(0.04 * Math.sin(p * 9) * toStage, yaw, 0.015 * Math.sin(p * 7) * toStage));
      const cm = toStage <= 0 ? attachedCard(hangLan, 0, slideOut) : blendM(attachedCard(hangLan, 0, slideOut), stagePose, toStage);
      frame.cards = [{ M: cm, bend: [0, 0], glow: 0 }]; hud.cardM = cm;
      // camera: starts on the clasp (where the tour ended), pulls back to watch the card slide out, then centres on the card
      const c0 = stopCam(STOPS.length - 1, 1, hangLan, I.path, wide);
      const wideEye: V3 = [0.5, -0.9, 4.6 * wide], wideT: V3 = [0, -0.95, 0];
      const pullBack = smoother(0.0, 0.09, p);
      const k = (a: number, b: number) => a + (b - a) * (local > 0.72 ? smoother(0.72, 1, local) : 0);
      const nxt = items[Math.min(nItems - 1, idx + 1)], it = items[idx];
      const act = p < 0.2 ? 0 : 1;
      const fx = act * k(it.fx, nxt.fx), fy = act * k(it.fy, nxt.fy), fz = act * k(it.zoom, nxt.zoom);
      const dCam = (4.2 - 1.9 * fz) * wide;
      const c2: V3 = [stage[0] + fx * 0.85, stage[1] + fy * 0.85, 0.9];
      const side = I.mobile ? 0 : -0.3 * smooth(0.12, 0.26, p);
      const ce = smoother(0.1, 0.22, p);
      let eye = lerp3(lerp3(c0.eye, wideEye, pullBack), [c2[0] + mx * 0.16 + side, c2[1] + 0.05 + my * 0.1, 0.9 + dCam], ce);
      let tgt = lerp3(lerp3(c0.target, wideT, pullBack), [c2[0] + side, c2[1], 0.9], ce);
      // hand the camera back to the front/back showcase framing at the end
      const fbDist = (aspect < 0.85 ? 4.6 : 3.6) * wide;
      eye = lerp3(eye, [mx * 0.15, 0.1 + my * 0.08, fbDist], endHold); tgt = lerp3(tgt, [0, 0, 0], endHold);
      frame.eye = eye; frame.target = tgt; frame.up = lerp3(c0.up, [0, 1, 0], pullBack); frame.spot = [I.mobile ? 0 : 0.18 * (1 - endHold), 0.02 + 0.03 * endHold];
    }

    // ============================================================ 04 FRONT & BACK
    else if (cur === 'frontback') {
      const p = pr.frontback; hud.pLocal = p;
      frame.mood = 1 - smoother(0.0, 0.22, p); frame.wall = smooth(0.1, 0.3, p); frame.lightCenter = [0, 0, 0]; frame.lightExtent = 3.4;
      const stack = aspect < 0.85;
      const enter = smoother(0.0, 0.28, p);
      const flip = smoother(0.62, 0.9, p);
      hud.flipB = flip;
      const sep = stack ? 0 : 0.64, sepY = stack ? 0.55 : 0;
      const shiftX = (aspect > 1.15 ? -0.46 : 0) * smooth(0.2, 0.4, p) * (1 - smooth(0.88, 0.98, p));
      const tilt = (x: number) => ({ y: mx * 0.22 + 0.12 * Math.sin(time * 0.7 + x) * idle + (p - 0.5) * 0.18, x: -my * 0.12 + 0.03 * Math.sin(time * 0.9 + x) * idle });
      const tA = tilt(0), tB = tilt(2);
      // card A: starts where the identity section left it (centre, back toward the camera)
      const aPos: V3 = lerp3([0, 0.05, 0.9], [-sep + shiftX, sepY, 0.2], enter);
      const aYaw = lerp(Math.PI, Math.PI * 2 + 0.2, enter) + tA.y + Math.PI * flip;
      const A: CardDraw = { M: m4.fromTRS(aPos, q.euler(tA.x, aYaw, 0)), bend: [0, 0], glow: 0 };
      // card B (back side) slides in from the right
      const bPos: V3 = lerp3([stack ? 0 : 4.2, stack ? -3.4 : 0, 0.2], [sep + shiftX, -sepY, 0.2], enter);
      const bYaw = Math.PI - 0.2 * enter + tB.y - Math.PI * flip;
      const B: CardDraw = { M: m4.fromTRS(bPos, q.euler(tB.x, bYaw, 0)), bend: [0, 0], glow: 0 };
      frame.cards = [A, B]; hud.cardM = A.M; hud.cardM2 = B.M;
      const dist = (stack ? 4.6 : 3.6) * wide;
      frame.eye = [mx * 0.15, 0.1 + my * 0.08, dist]; frame.target = [0, 0, 0]; frame.spot = [0, 0.05];
      hud.showEdit = smooth(0.3, 0.42, p) * (1 - smooth(0.9, 0.98, p));
    }

    // ============================================================ 06 FINAL
    else {
      const p = pr.final; hud.pLocal = p;
      frame.mood = 1; frame.wall = 0.0; frame.lightCenter = [0, 0.3, 0]; frame.lightExtent = 4.8;
      const drop = smoother(0.0, 0.3, p);
      const theta = swing(Math.max(0, (p - 0.3) * 8), 0.03) + idle * 0.012 * Math.sin(time * 0.7);
      const lanM = lanyardMatrix([0, lerp(6.4, HANG_Y, drop), 0], theta);
      const phi = -swing(Math.max(0, (p - 0.3) * 8), 0.05) + idle * 0.01 * Math.sin(time * 1.2 + 1);
      const cardM = attachedCard(lanM, phi);
      frame.lan = mkLan(lanM, 0, phi); frame.cards = [{ M: cardM, bend: [0, 0], glow: 0 }]; hud.cardM = cardM; hud.lanM = lanM;
      const az = (p - 0.3) * 0.5 * (aspect > 1.15 ? 0.5 : 1) + mx * 0.25, el = 0.04 + my * 0.08;
      const dist = lerp(6.4, 5.2, smoother(0.1, 0.9, p)) * wide;
      const desk = aspect > 1.15;
      const ty = desk ? -0.15 : -1.6, tx = desk ? -1.15 : 0;      // assembly sits right of the text on wide screens, above it on phones
      frame.target = [tx, ty, 0]; frame.eye = [tx + Math.sin(az) * dist, ty + 0.22 + dist * Math.sin(el), Math.cos(az) * dist];
      frame.spot = [0.0, -0.04]; frame.exposure = 1.05;
    }
    frame.fov = frame.fov || 28;
    return { frame, hud };
  }

  section(I: Inputs): string {
    const S = I.sections, y = I.sy;
    if (S.final && y > S.final.top - I.vh) return 'final';
    if (S.frontback && y >= S.frontback.top) return 'frontback';
    if (S.identity && y >= S.identity.top) return 'identity';
    if (S.lanyard && y >= S.lanyard.top) return 'lanyard';
    return 'reveal';
  }
}

function blendM(a: M4, b: M4, t: number): M4 {
  const ta: V3 = [a[12], a[13], a[14]], tb: V3 = [b[12], b[13], b[14]];
  return m4.fromTRS(lerp3(ta, tb, t), q.slerp(mq(a), mq(b), t));
}
function mq(m: M4): Q4 {
  const t = m[0] + m[5] + m[10]; let x, y, z, w;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; w = 0.25 * s; x = (m[6] - m[9]) / s; y = (m[8] - m[2]) / s; z = (m[1] - m[4]) / s; }
  else if (m[0] > m[5] && m[0] > m[10]) { const s = Math.sqrt(1 + m[0] - m[5] - m[10]) * 2; w = (m[6] - m[9]) / s; x = 0.25 * s; y = (m[4] + m[1]) / s; z = (m[8] + m[2]) / s; }
  else if (m[5] > m[10]) { const s = Math.sqrt(1 + m[5] - m[0] - m[10]) * 2; w = (m[8] - m[2]) / s; x = (m[4] + m[1]) / s; y = 0.25 * s; z = (m[9] + m[6]) / s; }
  else { const s = Math.sqrt(1 + m[10] - m[0] - m[5]) * 2; w = (m[1] - m[4]) / s; x = (m[8] + m[2]) / s; y = (m[9] + m[6]) / s; z = 0.25 * s; }
  return q.norm([x, y, z, w]);
}

// ---------------------------------------------------------------- identity breakdown items (card pixel space 816 x 1296)
export interface Item { id: string; side: 0 | 1; title: string; body: string; rect: [number, number, number, number]; fx: number; fy: number; zoom: number; }
const px = (x: number, y: number) => [(x / 816 - 0.5) * CARD_W, (0.5 - y / 1296) * CARD_H] as const;
const mk = (id: string, side: 0 | 1, title: string, body: string, rect: [number, number, number, number], zoom = 0.6): Item => {
  const [cx, cy] = px(rect[0] + rect[2] / 2, rect[1] + rect[3] / 2);
  return { id, side, title, body, rect, fx: side === 1 ? -cx : cx, fy: cy, zoom };
};
export const ITEMS: Item[] = [
  mk('brand', 0, 'University branding', 'The seal and the Isabela State University wordmark sit together at the top left of the card, in the university’s green and gold.', [34, 78, 724, 138], 0.55),
  mk('republic', 0, 'Republic of the Philippines', 'The government heading in semi-bold Poppins, set above the university name and centred over the wordmark.', [198, 86, 560, 40], 0.9),
  mk('campus', 0, 'Campus identification', 'The campus line under the wordmark reads “Cabagan, Isabela” in the supplied template.', [198, 170, 560, 40], 0.9),
  mk('photo', 0, 'Student photograph', 'A square 453 px frame with a 6 px green border and rounded corners. The silhouette is a placeholder for the student’s photo.', [181, 300, 453, 453], 0.55),
  mk('name', 0, 'Student name', 'The name is set large in bold green, with a small “NAME” caption beneath. “STUDENT NAME” is an editable placeholder.', [68, 872, 680, 90], 0.75),
  mk('number', 0, 'Student number', 'A bold student number with its “STUDENT NUMBER” caption. “20-2002” is a placeholder value.', [180, 976, 456, 100], 0.9),
  mk('college', 0, 'College / designation', 'The college or designation, wrapped over up to three lines in semi-bold capitals above the closing gold and green bands.', [68, 1106, 680, 140], 0.65),
  mk('contact', 1, 'Emergency contact', 'Four labelled lines: contact person, address, contact number and birth date. All four values are placeholders.', [22, 140, 480, 320], 0.7),
  mk('qr', 1, 'QR code area', 'A green QR code with the university seal at its centre.', [500, 138, 282, 282], 0.8),
  mk('stickers', 1, 'Semester stickers', 'Three white windows on a green band for the 1st semester, 2nd semester and summer validation stickers.', [0, 467, 816, 295], 0.6),
  mk('signatory', 1, 'Authorized signatory', 'The registrar’s signature above her printed name, Mercy C. Albano, University Registrar.', [230, 764, 356, 210], 0.8),
  mk('notice', 1, 'Certification and notice', 'A certification that the cardholder is a student of Isabela State University, Echague Campus, and a non-transferable notice.', [50, 970, 716, 280], 0.55),
];

// The renderer: builds every mesh once and draws a FrameState (shadow pass, main pass, motion-blur composite).
import { GL, Mesh, Prog } from '../engine/gl';
import { M4, V3, m4, v3, DEG } from '../engine/math';
import * as S from '../engine/shaders';
import { slab, torus, roundedBox, capsule, sphere, sleeve, tube, catmull, Geo } from './geometry';
import { buildPath, ribbon, Path } from './lanyard';
import { buildHardware, GATE_PIVOT, SLEEVE_SHIFT, SLEEVE_LEN } from './hardware';
import { handAttrs } from './handMesh';
import { skinMatrices, poseFor, setHandUniforms } from './handRig';

export interface CardDraw { M: M4; bend: [number, number]; glow: number; }
export interface Frame {
  w: number; h: number; eye: V3; target: V3; up: V3; fov: number; mood: number; spot: [number, number]; exposure: number;
  lightCenter: V3; lightExtent: number; shadow: boolean;
  cards: CardDraw[]; blur: M4[] | null;
  lan: { M: M4; jaw: number; hl: [number, number, number, number]; holder: M4 | null } | null;
  hand: { M: M4; open: number; relax: number; flick: number; skin: V3; contact?: boolean } | null;
  wall: number; keyDir: V3;
}
export interface Textures { front: WebGLTexture; back: WebGLTexture; base: WebGLTexture; vals: WebGLTexture; flame: WebGLTexture; orn: WebGLTexture; seal: WebGLTexture; word: WebGLTexture; clip: WebGLTexture; }

const attrs = (g: Geo, extra: { loc: number; data: Float32Array; size: number }[] = []) => [
  { loc: 0, data: g.pos, size: 3 }, { loc: 1, data: g.nor, size: 3 }, { loc: 2, data: g.uv, size: 2 },
  ...(g.kind ? [{ loc: 5, data: g.kind, size: 1 }] : []), ...extra];

interface Part { mesh: Mesh; M: M4; base: V3; rough: number; metal: number; jaw?: boolean; }

export class World {
  gl: WebGL2RenderingContext;
  path: Path;
  cardMesh: Mesh; holderMesh!: Mesh; strapMesh: Mesh; sleeveMesh: Mesh; wallMesh: Mesh; handMesh: Mesh; knitMesh: Mesh;
  hardware: Part[] = [];
  shadow: ReturnType<GL['shadow']>;
  acc: ReturnType<GL['target']> | null = null; accOK = false;
  bones = new Float32Array(24 * 16);
  lightVP = m4.ident(); vp = m4.ident(); view = m4.ident(); proj = m4.ident();
  tex!: Textures;
  P: Record<string, Prog> = {}; D: Record<string, Prog> = {};
  constructor(public g: GL, public mobile: boolean) {
    this.gl = g.gl; const gl = this.gl;
    this.accOK = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    this.path = buildPath();
    const card = slab(0.54, 0.86, 0.0095, 0.0318, 0.0022, 8);
    this.cardMesh = g.mesh(attrs(card), card.idx);
    const r = ribbon(this.path);
    this.strapMesh = g.mesh([{ loc: 0, data: r.pos, size: 3 }, { loc: 1, data: r.nor, size: 3 }, { loc: 2, data: r.uv, size: 2 }, { loc: 3, data: r.tan, size: 4 }], r.idx);
    const sl = slab(0.20, SLEEVE_LEN, 0.034, 0.03, 0.004, 6);
    for (let i = 1; i < sl.pos.length; i += 3) sl.pos[i] += SLEEVE_SHIFT;   // short visible tab (see hardware.ts): top tucked in the buckle, bottom folded round the D-ring
    const tan = new Float32Array(sl.pos.length / 3 * 4); for (let i = 0; i < tan.length; i += 4) tan[i + 1] = 1;
    this.sleeveMesh = g.mesh(attrs(sl, [{ loc: 3, data: tan, size: 4 }]), sl.idx);
    const wq = new Float32Array([-14, -9, 0, 14, -9, 0, 14, 9, 0, -14, 9, 0]);
    this.wallMesh = g.mesh([{ loc: 0, data: wq, size: 3 }], new Uint16Array([0, 1, 2, 0, 2, 3]));
    const h = handAttrs(); this.handMesh = g.mesh(h.attrs, h.idx);
    // forearm sleeve (knit cuff) in hand space
    const knit = sleeve(-3.4, -0.62, (y, a) => {
      const t = (y + 3.4) / 2.78; const base = 0.36 + 0.08 * (1 - t) + 0.015 * Math.pow(1 - t, 2);
      const cuff = y > -0.82 ? 0.025 * Math.sin((y + 0.62) / 0.2 * Math.PI) : 0;
      return base + cuff + 0.018 * Math.sin(5 * a + 3.2 * y) * (1 - t * 0.4) + 0.012 * Math.sin(11 * a - 5 * y) + 0.01 * Math.sin(3 * a + 9 * y);
    }, 0.92, 1.12, 90, 72);
    this.knitMesh = g.mesh(attrs(knit), knit.idx);
    // hardware (lanyard space, origin = where the two strands meet; y points up, the card hangs towards -y): see hardware.ts
    for (const h of buildHardware()) this.hardware.push({ mesh: g.mesh(attrs(h.geo), h.geo.idx), M: h.M, base: h.base, rough: h.rough, metal: h.metal, jaw: h.jaw });
    const hold = slab(0.60, 0.96, 0.016, 0.05, 0.004, 8);
    this.holderMesh = g.mesh(attrs(hold), hold.idx);
    this.shadow = g.shadow(mobile ? 1024 : 2048);
    this.compile();
  }

  compile() {
    const g = this.g;
    this.P.bg = g.program('bg', S.BG_VS, S.BG_FS); this.P.wall = g.program('wall', S.WALL_VS, S.WALL_FS);
    this.P.card = g.program('card', S.CARD_VS, S.CARD_FS); this.P.cloth = g.program('cloth', S.CLOTH_VS, S.CLOTH_FS);
    this.P.holder = g.program('holder', S.CARD_VS, S.HOLDER_FS);
    this.P.metal = g.program('metal', S.GEO_VS, S.METAL_FS); this.P.skin = g.program('skin', S.SKIN_VS, S.SKIN_FS);
    this.D.card = g.program('dcard', S.CARD_VS, S.DEPTH_FS); this.D.cloth = g.program('dcloth', S.CLOTH_VS, S.DEPTH_FS);
    this.D.geo = g.program('dgeo', S.GEO_VS, S.DEPTH_FS); this.D.skin = g.program('dskin', S.SKIN_VS, S.DEPTH_FS);
    this.P.comp = g.program('comp', S.BG_VS, `#version 300 es\nprecision highp float; uniform sampler2D uT; uniform vec2 uRes; out vec4 o; void main(){ o = texture(uT, gl_FragCoord.xy / uRes); }`);
    this.dummyVao = this.gl.createVertexArray()!;
  }
  dummyVao!: WebGLVertexArrayObject;

  setTextures(t: Textures) { this.tex = t; }

  private common(p: Prog, f: Frame) {
    const gl = this.gl; p.use();
    p.v3('uCam', f.eye); p.f('uMood', f.mood); p.v3('uKeyDir', v3.norm(f.keyDir)); p.f('uExposure', f.exposure);
    p.m('uLightVP', this.lightVP); p.i('uShadow', 5); p.i('uShadowRaw', 6);
    p.v4('uSh', [0.012, 19.9 * 0.11 / (2 * f.lightExtent), 1.0, f.shadow ? 1 : 0]);
    p.m('uVP', this.vp);
    void gl;
  }
  private bindShadow() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.shadow.depth); gl.bindSampler(5, null);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.shadow.depth); gl.bindSampler(6, this.shadow.raw);
  }

  project(p: V3): [number, number, number] {
    const q = m4.point(this.vp, p); return [(q[0] * 0.5 + 0.5), (1 - (q[1] * 0.5 + 0.5)), q[2]];
  }

  // ------------------------------------------------------------------ passes
  private drawCasters(f: Frame, vpM: M4, depth: boolean) {
    const g = this.g, gl = this.gl, T = this.tex;
    const cardP = depth ? this.D.card : this.P.card;
    // cards (the blur pass is handled by the caller)
    cardP.use(); cardP.m('uVP', vpM);
    for (const c of f.cards) { cardP.m('uModel', c.M); cardP.v2('uBend', c.bend[0], c.bend[1]); if (!depth) { cardP.f('uGlow', c.glow); cardP.f('uWeight', 1); } g.draw(this.cardMesh); }
    void T;
  }

  render(f: Frame) {
    const g = this.g, gl = this.gl, T = this.tex;
    const aspect = f.w / f.h;
    this.proj = m4.perspective(f.fov * DEG, aspect, 0.2, 60);
    this.view = m4.lookAt(f.eye, f.target, f.up);
    this.vp = m4.mul(this.proj, this.view);
    // light matrices
    const kd = v3.norm(f.keyDir), lc = f.lightCenter, e = f.lightExtent;
    const lview = m4.lookAt(v3.madd(lc, kd, 10), lc, [0, 1, 0]);
    this.lightVP = m4.mul(m4.ortho(-e, e, -e, e, 0.1, 20), lview);

    if (f.blur && this.accOK && (!this.acc || this.acc.w !== f.w || this.acc.h !== f.h)) { if (this.acc) { gl.deleteTexture(this.acc.tex); gl.deleteFramebuffer(this.acc.fb); gl.deleteRenderbuffer(this.acc.rb); } gl.activeTexture(gl.TEXTURE0); this.acc = g.target(f.w, f.h); }
    const hand = f.hand, lan = f.lan;
    let jawM: M4 | null = null;
    if (lan) { const px = GATE_PIVOT[0], py = GATE_PIVOT[1]; jawM = m4.mul(m4.translate(px, py, 0), m4.mul(m4.rotZ(-lan.jaw * 0.75), m4.translate(-px, -py, 0))); }   // spring gate swings inward
    if (hand) skinMatrices(poseFor(hand.open, hand.relax, hand.flick), this.bones);
    const wm = hand ? hand.M : m4.ident();

    // ---------- shadow pass
    // the depth texture is sampled by the main pass, so detach it before rendering into it (avoids a feedback loop)
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, null);
    if (f.shadow) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadow.fb); gl.viewport(0, 0, this.shadow.size, this.shadow.size);
      gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.colorMask(false, false, false, false);
      this.drawCasters(f, this.lightVP, true);
      if (lan) {
        const c = this.D.cloth; c.use(); c.m('uVP', this.lightVP); c.m('uModel', lan.M); g.draw(this.strapMesh); g.draw(this.sleeveMesh);
        const d = this.D.geo; d.use(); d.m('uVP', this.lightVP);
        for (const h of this.hardware) { d.m('uModel', m4.mul(lan.M, h.jaw && jawM ? m4.mul(jawM, h.M) : h.M)); g.draw(h.mesh); }
      }
      if (hand) {
        const s = this.D.skin; s.use(); s.m('uVP', this.lightVP); s.m('uModel', wm); gl.uniformMatrix4fv(s.l('uBones'), false, this.bones); this.contact(s, f); g.draw(this.handMesh);
        const c = this.D.cloth; c.use(); c.m('uVP', this.lightVP); c.m('uModel', wm); g.draw(this.knitMesh);
      }
      gl.colorMask(true, true, true, true);
    }

    // ---------- main pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, f.w, f.h);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.bindVertexArray(this.dummyVao);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    const bg = this.P.bg; bg.use(); bg.f('uMood', f.mood); bg.v2('uRes', f.w, f.h); bg.v2('uSpot', f.spot[0], f.spot[1]); bg.f('uExposure', f.exposure);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL);
    this.bindShadow();

    if (f.wall > 0.001) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      const w = this.P.wall; this.common(w, f); w.m('uModel', m4.translate(0, 0, -1.8)); w.f('uCatch', f.wall); g.draw(this.wallMesh);
      gl.disable(gl.BLEND); gl.depthMask(true);
    }

    if (lan && jawM) {
      const c = this.P.cloth; this.common(c, f);
      g.gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.base); c.i('uBase', 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.vals); c.i('uVals', 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, T.flame); c.i('uFlame', 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, T.orn); c.i('uOrn', 3);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, T.seal); c.i('uSeal', 4);
      gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, T.word); c.i('uWord', 7);
      c.v4('uHL', lan.hl); c.i('uMode', 0); c.v3('uTint', [1, 1, 1]); c.m('uModel', lan.M);
      g.draw(this.strapMesh);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.clip); c.i('uMode', 1); g.draw(this.sleeveMesh);
      const m = this.P.metal; this.common(m, f);
      for (const h of this.hardware) {
        m.m('uModel', m4.mul(lan.M, h.jaw ? m4.mul(jawM, h.M) : h.M)); m.v3('uBase', h.base); m.f('uRough', h.rough); m.f('uMetal', h.metal); g.draw(h.mesh);
      }
    }
    if (hand) {
      const s = this.P.skin; this.common(s, f); s.m('uModel', wm); s.v3('uSkin', hand.skin); s.f('uWeight', 1); gl.uniformMatrix4fv(s.l('uBones'), false, this.bones); setHandUniforms(gl, s); this.contact(s, f); g.draw(this.handMesh);
      const c = this.P.cloth; this.common(c, f); c.i('uMode', 2); c.v3('uTint', [0.035, 0.2, 0.095]); c.m('uModel', wm); c.v4('uHL', [0, 0, 0, 0]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.base); c.i('uBase', 0); g.draw(this.knitMesh);
    }
    // cards
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.front); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.back);
    const cp = this.P.card; this.common(cp, f); cp.i('uFront', 0); cp.i('uBack', 1);
    if (f.blur && f.blur.length > 1 && this.accOK) this.drawBlurred(f, cp);
    else for (const c of f.cards) { cp.m('uModel', c.M); cp.v2('uBend', c.bend[0], c.bend[1]); cp.f('uGlow', c.glow); cp.f('uWeight', 1); g.draw(this.cardMesh); }
    // clear PVC holder: far sheet first, then near sheet, premultiplied blending, no depth writes
    if (lan && lan.holder) {
      const hp = this.P.holder; this.common(hp, f); hp.m('uModel', m4.mul(lan.holder, m4.translate(0, 0.03, 0))); hp.v2('uBend', 0, 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.FRONT); g.draw(this.holderMesh); gl.cullFace(gl.BACK); g.draw(this.holderMesh);
      gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.depthMask(true);
    }
  }

  /** card slab uniforms for the skin shaders (contact projection) */
  private contact(s: Prog, f: Frame) {
    const gl = this.gl, c = f.cards[0];
    if (!f.hand || !c || !f.hand.contact) { gl.uniform1f(s.l('uCOn'), 0); return; }
    gl.uniform1f(s.l('uCOn'), 1); gl.uniformMatrix4fv(s.l('uCI'), false, m4.invert(c.M)); gl.uniformMatrix4fv(s.l('uCM'), false, c.M);
  }

  private drawBlurred(f: Frame, cp: Prog) {
    const g = this.g, gl = this.gl;
    const acc = this.acc!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fb); gl.viewport(0, 0, f.w, f.h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // the hand is laid into the accumulation buffer's depth first, so fingers in front of the card stay in front of its blur
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.colorMask(false, false, false, false);
    if (f.hand) { const s = this.D.skin; s.use(); s.m('uVP', this.vp); s.m('uModel', f.hand.M); gl.uniformMatrix4fv(s.l('uBones'), false, this.bones); this.contact(s, f); g.draw(this.handMesh); }
    gl.colorMask(true, true, true, true); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    const c0 = f.cards[0], K = f.blur!.length; cp.use(); cp.f('uWeight', 1 / K); cp.v2('uBend', c0.bend[0], c0.bend[1]); cp.f('uGlow', c0.glow);
    for (const M of f.blur!) { cp.m('uModel', M); g.draw(this.cardMesh); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, f.w, f.h); gl.disable(gl.CULL_FACE); gl.disable(gl.DEPTH_TEST);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(true);
    const cm = this.P.comp; cm.use(); cm.v2('uRes', f.w, f.h); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, acc.tex); cm.i('uT', 0);
    gl.bindVertexArray(this.dummyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST);
    // the card itself goes on top, crisp and opaque and depth-tested against the hand: the blur only ever adds a streak trailing behind it
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex.front); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex.back);
    cp.use(); cp.i('uFront', 0); cp.i('uBack', 1);
    for (const c of f.cards) { cp.m('uModel', c.M); cp.v2('uBend', c.bend[0], c.bend[1]); cp.f('uGlow', c.glow); cp.f('uWeight', 1); g.draw(this.cardMesh); }
  }
}

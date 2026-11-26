// DOM overlay: captions, tour callouts + leader lines, identity highlight boxes, labels. Driven by HudState each frame.
import { M4, V3, m4, v3, clamp, easeOut } from '../engine/math';
import { Frame } from '../scene/world';
import { World } from '../scene/world';
import { HudState, ITEMS, STOPS } from '../story/story';
import { CARD_W, CARD_H } from '../art/cardArt';
import { pathAt } from '../scene/lanyard';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const WORDS: [number, number][] = [[62.5, 95.2], [107.9, 141.2], [153.9, 244.4], [257, 311.4]];
const TITLES = ['The strap', 'Core values', 'The flame', 'Ornament', 'University seal', 'Wordmark', 'Side-release buckle', 'Swivel lobster clasp'];
const ANCHOR_S = [70, 187, 332, 395, 450, 728];   // strap point each callout points at (mm along the strip)
const HW_ANCHOR: Record<number, V3> = { 6: [0.0, -0.22, 0.05], 7: [0.0, -1.08, 0.05] };   // hardware stops: fixed points in lanyard space

export class Hud {
  world!: World; root = $('hud'); root2 = $('hud2'); lines = document.getElementById('lines') as unknown as SVGSVGElement;
  beats = [...document.querySelectorAll<HTMLElement>('.beat')];
  callouts = [...document.querySelectorAll<HTMLElement>('.callout')];
  navBtns = [...document.querySelectorAll<HTMLElement>('.bar nav button')];
  words = [...document.querySelectorAll<HTMLElement>('#valWords span')];
  cue = $('cue'); tourbar = $('tourbar'); tbN = $('tbN'); tbT = $('tbT'); tbP = $('tbP');
  idpanel = $('idpanel'); idSide = $('idSide'); idCount = $('idCount'); idTitle = $('idTitle'); idBody = $('idBody'); idSteps = $('idSteps');
  fbA = $('fbA'); fbB = $('fbB'); fbHint = $('fbHint'); editor = $('editor'); finale = $('finale');
  lead = document.getElementById('ln-lead') as unknown as SVGPathElement; dot = document.getElementById('ln-dot') as unknown as SVGCircleElement; ring = document.getElementById('ln-ring') as unknown as SVGCircleElement;
  box = document.getElementById('ln-box') as unknown as SVGPolygonElement; idlead = document.getElementById('ln-idlead') as unknown as SVGPathElement; ticks = document.getElementById('ln-ticks') as unknown as SVGGElement;
  tickEls: SVGPathElement[] = [];
  tone = 'light'; curItem = -2; curStop = -9; stopSince = 0; itemSince = 0; shownItem = -2; swapTimer = 0; curSec = ''; hot = -2; side = -1;
  sheetOff = false;

  constructor() {
    for (let i = 0; i < 4; i++) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('class', 'tick'); this.ticks.appendChild(p); this.tickEls.push(p); }
    for (let i = 0; i < ITEMS.length; i++) this.idSteps.appendChild(document.createElement('i'));
  }

  /** hero beats (no 3D): same caption windows as before, driven by scroll progress only; also clears every other section's overlay */
  updateHero(p: number) {
    const h: HudState = { p: { reveal: p, lanyard: 0, identity: 0, frontback: 0, final: 0 }, section: 'reveal', stop: -1, stopT: 0, item: -1, itemT: 0, cardM: m4.ident(), cardM2: null, lanM: null, jaw: 0, showEdit: 0, flipB: 0, words: -1, path: null as unknown as HudState['path'], hold: 0, pLocal: p };
    this.setSheetCover(false);
    this.update(h, null as unknown as Frame, innerWidth, innerHeight, 0, 0);
  }

  setSheetCover(off: boolean) { if (off !== this.sheetOff) { this.sheetOff = off; this.root.classList.toggle('off', off); this.lines.style.display = off ? 'none' : ''; } }

  private px(p: V3, vw: number, vh: number): [number, number] { const s = this.world.project(p); return [s[0] * vw, s[1] * vh]; }

  update(h: HudState, f: Frame, vw: number, vh: number, time: number, mood: number) {
    // tone follows the scene's background
    const tone = mood > 0.55 ? 'dark' : 'light';
    if (tone !== this.tone) { this.tone = tone; this.root.dataset.tone = tone; this.lines.classList.toggle('dark', tone === 'dark'); }
    const sec = h.section, p = h.pLocal;
    if (sec !== this.curSec) {
      this.curSec = sec;
      const navKey = sec === 'final' ? 'final' : sec;
      this.navBtns.forEach(b => b.classList.toggle('on', b.dataset.go === navKey));
    }
    // beats (progress windows inside a section)
    for (const b of this.beats) { const on = b.dataset.sec === sec && p >= +(b.dataset.a || 0) && p < +(b.dataset.b || 1); if (b.classList.contains('on') !== on) b.classList.toggle('on', on); }
    this.cue.classList.toggle('off', !(sec === 'reveal' && h.p.reveal < 0.045));

    // ---- tour
    const inTour = sec === 'lanyard' && h.lanM !== null;
    const stop = inTour ? h.stop : -1;
    if (stop !== this.curStop) { this.curStop = stop; this.stopSince = time; this.callouts.forEach((c, i) => c.classList.toggle('on', i === stop)); }
    this.tourbar.classList.toggle('on', inTour && stop >= 0);
    if (inTour) {
      const pp = clamp((h.pLocal - 0.2) / 0.8);
      this.tbP.style.width = (pp * 100).toFixed(1) + '%';
      if (stop >= 0) { this.tbN.textContent = String(stop + 1).padStart(2, '0'); this.tbT.textContent = TITLES[stop] || ''; }
    }
    this.tourLines(h, vw, vh, time, inTour && stop >= 0 ? stop : -1);

    // values: word-by-word highlight
    const hw = inTour && stop === 1 ? h.words : -1;
    if (hw !== this.hot) { this.hot = hw; this.words.forEach((w, i) => w.classList.toggle('hot', i === hw)); }

    // ---- identity
    const inId = sec === 'identity' && h.item >= 0;
    this.idpanel.classList.toggle('on', inId);
    if (inId && h.item !== this.curItem) {
      this.curItem = h.item; this.itemSince = time;
      this.idpanel.classList.add('swap'); clearTimeout(this.swapTimer);
      this.swapTimer = window.setTimeout(() => {
        const it = ITEMS[this.curItem]; if (!it) return;
        this.idSide.textContent = it.side === 0 ? 'Front' : 'Back'; this.idCount.textContent = `${this.curItem + 1} / ${ITEMS.length}`;
        this.idTitle.textContent = it.title; this.idBody.textContent = it.body; this.idpanel.classList.remove('swap');
      }, this.shownItem === -2 ? 0 : 230);
      this.shownItem = h.item;
      [...this.idSteps.children].forEach((c, i) => { c.className = i < h.item ? 'done' : i === h.item ? 'cur' : ''; });
    }
    this.identityBox(h, vw, vh, time, inId);

    // ---- front & back
    const inFB = sec === 'frontback';
    const showFB = inFB && h.pLocal > 0.25;
    this.fbA.classList.toggle('on', showFB); this.fbB.classList.toggle('on', showFB); this.fbHint.classList.toggle('on', inFB && h.pLocal > 0.3 && h.pLocal < 0.62);
    this.editor.classList.toggle('on', inFB && h.showEdit > 0.5);
    if (showFB && h.cardM2) {
      this.label(this.fbA, h.cardM, f, vw, vh); this.label(this.fbB, h.cardM2, f, vw, vh);
    }
    // ---- finale
    this.finale.classList.toggle('on', sec === 'final' && h.pLocal > 0.3);
    this.root2.classList.toggle('off', sec !== 'final');
  }

  private label(el: HTMLElement, M: M4, f: Frame, vw: number, vh: number) {
    const c: V3 = [M[12], M[13], M[14]], z: V3 = [M[8], M[9], M[10]];
    const facing = v3.dot(z, v3.sub(f.eye, c)) > 0;
    const t = facing ? 'Front' : 'Back'; const sp = el.firstElementChild as HTMLElement; if (sp.textContent !== t) sp.textContent = t;
    const below = m4.point(M, [0, -0.43 - 0.07, 0]);
    const [x, y] = this.px(below, vw, vh);
    el.style.left = x.toFixed(1) + 'px'; el.style.top = clamp(y, 70, vh - 44).toFixed(1) + 'px';
  }

  // ---------------------------------------------------------------- tour leader line
  private tourLines(h: HudState, vw: number, vh: number, time: number, stop: number) {
    const on = stop >= 0;
    const vis = on ? '1' : '0';
    if (!on) { this.lead.style.opacity = '0'; this.dot.style.opacity = '0'; this.ring.style.opacity = '0'; this.placeNothing(); return; }
    const co = this.callouts[stop]; const wide = vw < 600;
    // place callout
    const left = !wide && stop % 2 === 0;
    if (!wide) {
      co.style.left = left ? `max(var(--gx), 6vw)` : 'auto'; co.style.right = left ? 'auto' : `max(var(--gr), 6vw)`;
      co.style.top = 'auto'; co.style.bottom = `calc(var(--gb) + ${vh < 640 ? 44 : 70}px)`;
    }
    // anchor point on the strap
    let anchor: V3 | null = null, s = ANCHOR_S[stop];
    if (stop === 1 && h.words >= 0) s = (WORDS[h.words][0] + WORDS[h.words][1]) / 2;
    if (stop === 0) s = 40 + 24;
    if (HW_ANCHOR[stop]) { anchor = h.lanM ? m4.point(h.lanM, HW_ANCHOR[stop]) : null; }
    else if (h.lanM) { const pa = pathAt(h.path, s); anchor = m4.point(h.lanM, pa.P); }
    if (!anchor) return;
    const [ax, ay] = this.px(anchor, vw, vh);
    const r = co.getBoundingClientRect();
    const sx = clamp(ax, r.left + 24, r.right - 24), sy = r.top;
    const L = Math.hypot(ax - sx, ay - sy);
    const t = clamp((time - this.stopSince) / 0.7), e = easeOut(t);
    const mx = sx, my = (sy + ay) / 2;
    this.lead.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)} L${mx.toFixed(1)} ${(my + (ay - my) * 0).toFixed(1)} L${ax.toFixed(1)} ${ay.toFixed(1)}`);
    this.lead.style.strokeDasharray = `${L.toFixed(0)}`; this.lead.style.strokeDashoffset = (L * (1 - e)).toFixed(1); this.lead.style.opacity = '0.85';
    this.dot.setAttribute('cx', ax.toFixed(1)); this.dot.setAttribute('cy', ay.toFixed(1)); this.dot.style.opacity = vis;
    const pulse = (time * 0.9) % 1;
    this.ring.setAttribute('cx', ax.toFixed(1)); this.ring.setAttribute('cy', ay.toFixed(1)); this.ring.setAttribute('r', (5 + pulse * 18).toFixed(1)); this.ring.style.opacity = (0.8 * (1 - pulse)).toFixed(2);
  }
  private placeNothing() { }

  // ---------------------------------------------------------------- identity highlight
  private identityBox(h: HudState, vw: number, vh: number, time: number, on: boolean) {
    if (!on || !h.cardM || h.item < 0) { this.box.style.opacity = '0'; this.idlead.style.opacity = '0'; this.tickEls.forEach(t => t.style.opacity = '0'); return; }
    const it = ITEMS[h.item]; const [x, y, w, hh] = it.rect; const M = h.cardM;
    const z = it.side === 0 ? 0.0062 : -0.0062, sgn = it.side === 0 ? 1 : -1;
    const loc = (px: number, py: number): V3 => [sgn * (px / CARD_W - 0.5) * 0.54, (0.5 - py / CARD_H) * 0.86, z];
    const pad = 6;
    const pts = [loc(x - pad, y - pad), loc(x + w + pad, y - pad), loc(x + w + pad, y + hh + pad), loc(x - pad, y + hh + pad)].map(q => this.px(m4.point(M, q), vw, vh));
    const e = easeOut(clamp((time - this.itemSince) / 0.7));
    this.box.setAttribute('points', pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '));
    this.box.style.strokeDashoffset = (1 - e).toFixed(3); this.box.style.opacity = '1'; this.box.style.fillOpacity = String(e);
    // corner brackets
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4], c = pts[(i + 3) % 4]; const k = 0.18 * e;
      const p1 = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], p2 = [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k];
      this.tickEls[i].setAttribute('d', `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L${a[0].toFixed(1)} ${a[1].toFixed(1)} L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`); this.tickEls[i].style.opacity = String(e);
    }
    // connector to the info panel
    const pr = this.idpanel.getBoundingClientRect(); const mobile = vw < 980;
    const ax = mobile ? pr.left + pr.width / 2 : pr.right, ay = mobile ? pr.top : pr.top + pr.height / 2;
    let best = pts[0], bd = 1e9; for (const p of pts) { const d = Math.hypot(p[0] - ax, p[1] - ay); if (d < bd) { bd = d; best = p; } }
    const L = Math.hypot(best[0] - ax, best[1] - ay);
    this.idlead.setAttribute('d', `M${ax.toFixed(1)} ${ay.toFixed(1)} L${best[0].toFixed(1)} ${best[1].toFixed(1)}`);
    this.idlead.style.strokeDasharray = String(L.toFixed(0)); this.idlead.style.strokeDashoffset = (L * (1 - e)).toFixed(1); this.idlead.style.opacity = (0.8 * e).toFixed(2);
  }
}
void STOPS;

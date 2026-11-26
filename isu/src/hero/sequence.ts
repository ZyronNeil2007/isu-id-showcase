// Scroll-scrubbed image sequence on a 2D canvas. No WebGL, no per-frame DOM work.
//  - scroll progress (0..1) -> fractional frame -> nearest frame is drawn (only when it changes)
//  - frames load progressively, nearest to the viewer's position first, in small batches
//  - decoded frames are only forced for the few around the playhead; the rest are just fetched
//  - rendering and loading pause while the hero is off-screen or the tab is hidden
import { MANIFEST, SetId } from './manifest.generated';

export type SeqState = 'idle' | 'loading' | 'ready' | 'failed';
interface Opts { canvas: HTMLCanvasElement; host: HTMLElement; onState: (s: SeqState) => void; lowEnd: boolean; }

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const frameUrl = (set: SetId, i: number) => `${MANIFEST.sets[set].dir}frame_${String(i).padStart(3, '0')}.webp`;

/** which responsive set suits this viewport (aspect < 0.9 mirrors the 3D camera's portrait rule) */
export function pickSet(vw: number, vh: number, dpr: number, lowEnd: boolean): SetId {
  if (vw / vh < 0.9) return 'pt';
  return lowEnd || vh * Math.min(dpr, 2) <= 640 ? 'md' : 'lg';
}

export class FrameSequence {
  private ctx: CanvasRenderingContext2D | null;
  private set: SetId = 'lg';
  private imgs: (HTMLImageElement | null)[] = [];
  private status: Uint8Array = new Uint8Array(0);        // 0 none, 1 loading, 2 loaded, 3 failed (after retry)
  private tries: Uint8Array = new Uint8Array(0);
  private active = 0;                                     // in-flight requests
  private progress = 0; private shown = -1; private cur = 0;
  private dirty = true; private raf = 0; private visible = false; private started = false; private gen = 0;
  private drawn = false; private cw = 0; private ch = 0; private state: SeqState = 'idle';
  private readonly maxConn: number; private readonly ahead: number; private readonly noFar: boolean; private lastFar = 0;
  private timer = 0; private firstTimer = 0;
  private io: IntersectionObserver | null = null;
  private bound = { vis: () => this.onVisibility(), resize: () => this.layout() };

  constructor(private o: Opts) {
    this.ctx = o.canvas.getContext('2d', { alpha: false });
    const nc = (navigator as any).connection;
    const save = !!(nc && (nc.saveData || /(^|-)2g$/.test(nc.effectiveType || '')));
    this.maxConn = save ? 2 : o.lowEnd ? 3 : 4;
    this.ahead = save ? 6 : o.lowEnd ? 8 : 10;           // frames kept ready past the playhead; everything else is filled in slowly, a frame at a time
    this.noFar = save;                                    // data saver: never pre-fetch beyond the window
  }

  start(set: SetId) {
    if (!this.ctx) { this.setState('failed'); return; }
    if (this.started) return; this.started = true;
    this.useSet(set);
    this.io = new IntersectionObserver(es => { this.visible = es[es.length - 1].isIntersecting; if (this.visible) { this.dirty = true; this.pump(); this.schedule(); } }, { rootMargin: '10% 0px' });
    this.io.observe(this.o.host);
    document.addEventListener('visibilitychange', this.bound.vis);
  }

  private useSet(set: SetId) {
    this.set = set; this.gen++;
    const n = MANIFEST.count;
    this.imgs = new Array(n).fill(null); this.status = new Uint8Array(n); this.tries = new Uint8Array(n);
    this.active = 0; this.shown = -1; this.dirty = true;
    if (!this.drawn) this.setState('loading');
    clearTimeout(this.firstTimer);
    this.firstTimer = window.setTimeout(() => { if (this.status[0] !== 2) this.setState('failed'); }, 9000);   // never wait forever: the static image takes over
    this.layout(); this.pump();
  }

  /** viewport changed: re-pick the set if the orientation/size class changed, then resize the backing store */
  resize(vw: number, vh: number, dpr: number) {
    if (!this.started) return;
    const want = pickSet(vw, vh, dpr, this.o.lowEnd);
    if (want !== this.set) this.useSet(want); else this.layout();
  }

  private layout() {
    const c = this.o.canvas, vw = innerWidth, vh = innerHeight;
    // backing store: viewport x dpr, capped so a weak GPU never fills a huge canvas
    let s = Math.min(devicePixelRatio || 1, 2);
    const cap = this.o.lowEnd ? 1.4e6 : 2.6e6;
    if (vw * vh * s * s > cap) s = Math.sqrt(cap / (vw * vh));
    const w = Math.max(2, Math.round(vw * s)), h = Math.max(2, Math.round(vh * s));
    if (w !== this.cw || h !== this.ch) { this.cw = w; this.ch = h; c.width = w; c.height = h; this.shown = -1; }
    this.dirty = true; this.schedule();
  }

  /** feed scroll progress of the hero (0..1). Cheap: stores a number and asks for one rAF. */
  setProgress(p: number) {
    p = clamp01(p);
    if (p === this.progress) return;
    this.progress = p;
    const P = MANIFEST.p, n = P.length;
    // binary search the progress table -> fractional frame -> nearest frame
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m] <= p) lo = m; else hi = m; }
    const t = P[hi] > P[lo] ? clamp01((p - P[lo]) / (P[hi] - P[lo])) : 0;
    const idx = t < 0.5 ? lo : hi;
    if (idx !== this.cur) { this.cur = idx; this.dirty = true; this.pump(); this.schedule(); }
  }
  get frame() { return this.cur; }

  private schedule() { if (!this.raf && this.visible && this.dirty && !document.hidden) this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); }); }

  private nearestLoaded(i: number) {
    const n = this.status.length;
    for (let d = 0; d < n; d++) { if (i - d >= 0 && this.status[i - d] === 2) return i - d; if (i + d < n && this.status[i + d] === 2) return i + d; }
    return -1;
  }

  private draw() {
    if (!this.dirty || !this.ctx) return;
    const i = this.nearestLoaded(this.cur);
    if (i < 0) return;                                     // nothing yet: the page background / static image shows
    if (i === this.shown) { this.dirty = false; return; }
    const im = this.imgs[i]; if (!im) return;
    const iw = im.naturalWidth, ih = im.naturalHeight, cw = this.cw, ch = this.ch;
    const k = Math.max(cw / iw, ch / ih), dw = iw * k, dh = ih * k;      // cover, centred: the scene is centred on the same point in 3D
    this.ctx.drawImage(im, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    this.shown = i; this.dirty = false;                   // a later load of a closer frame marks it dirty again
    if (!this.drawn) { this.drawn = true; clearTimeout(this.firstTimer); this.setState('ready'); }
  }

  // ---------------------------------------------------------------- loading
  private order(): number[] {
    // nearest-first, biased forward (scrolling down is the common case)
    const n = this.status.length, c = this.cur, out: number[] = [];
    for (let d = 0; d < n; d++) { const f = c + d, b = c - d; if (f < n) out.push(f); if (d > 0 && b >= 0 && d <= (d < 4 ? 4 : this.ahead / 2)) out.push(b); }
    for (let i = 0; i < n; i++) if (!out.includes(i)) out.push(i);
    return out;
  }

  private pump() {
    if (!this.visible && this.started && this.status[0] === 2) return;      // off-screen: no new requests
    const n = this.status.length; if (!n) return;
    const o = this.order();
    for (const i of o) {
      if (this.active >= this.maxConn) break;
      if (this.status[i] !== 0) continue;
      // outside the lookahead window the rest trickles in (one frame per beat), and only once the window is complete
      const d = i - this.cur;
      if (d > this.ahead || d < -this.ahead / 2) {
        if (this.noFar || this.pendingNear() > 0) continue;
        const gap = this.o.lowEnd ? 260 : 140, wait = this.lastFar + gap - performance.now();
        if (wait > 0) { this.later(wait); break; }
        this.lastFar = performance.now();
      }
      this.load(i);
    }
  }
  private pendingNear() { let k = 0; const n = this.status.length; for (let d = -4; d <= this.ahead; d++) { const i = this.cur + d; if (i >= 0 && i < n && this.status[i] !== 2 && this.status[i] !== 3) k++; } return k; }

  private load(i: number) {
    const g = this.gen; this.status[i] = 1; this.active++;
    const im = new Image(); im.decoding = 'async';
    im.onload = () => {
      if (g !== this.gen) return;
      this.active--; this.imgs[i] = im; this.status[i] = 2;
      if (this.nearestLoaded(this.cur) !== this.shown) this.dirty = true;
      // decode ahead for the frames about to be drawn so scrubbing never stalls on decode
      if (Math.abs(i - this.cur) <= 3 && im.decode) im.decode().catch(() => { }).then(() => { if (g === this.gen) { this.dirty = true; this.schedule(); } });
      this.schedule(); this.later();
    };
    im.onerror = () => {
      if (g !== this.gen) return;
      this.active--; this.tries[i]++;
      this.status[i] = this.tries[i] >= 2 ? 3 : 0;           // one retry, then give up on that frame (neighbours cover it)
      if (i === 0 && this.status[0] === 3) this.setState('failed');
      this.later(this.status[i] === 0 ? 1200 : 0);
    };
    im.src = frameUrl(this.set, i);
  }
  private later(ms = 0) { clearTimeout(this.timer); this.timer = window.setTimeout(() => this.pump(), ms); }

  private setState(s: SeqState) { if (s !== this.state) { this.state = s; this.o.onState(s); } }
  private onVisibility() { if (!document.hidden) { this.dirty = true; this.pump(); this.schedule(); } }

  destroy() {
    this.gen++; this.io?.disconnect(); document.removeEventListener('visibilitychange', this.bound.vis);
    clearTimeout(this.timer); clearTimeout(this.firstTimer); cancelAnimationFrame(this.raf); this.imgs = [];
  }
}

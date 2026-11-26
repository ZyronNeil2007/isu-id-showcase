// App entry: boot (fonts, images, GL, textures), scroll loop, resize, fallback, editor and details wiring.
import { GL } from './engine/gl';
import { World, Textures } from './scene/world';
import { Story, Inputs, ITEMS } from './story/story';
import { Hud } from './ui/hud';
import { A } from './art/assets.generated';
import { CardData, DEFAULT_CARD, CardImages, loadCardImages, loadFonts, makeCanvas, drawFront, drawBack, CARD_W, CARD_H } from './art/cardArt';
import { clamp } from './engine/math';
import { FrameSequence, pickSet, SeqState } from './hero/sequence';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const qs = new URLSearchParams(location.search);
const TEST = qs.has('test');
const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
const HQ = qs.has('hq');                                    // offline baking: full-quality textures
const mobile = !HQ && (matchMedia('(max-width: 820px)').matches || /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent));
const lowEnd = mobile || ((navigator as any).deviceMemory || 8) <= 4 || (navigator.hardwareConcurrency || 8) <= 4;
const SECTION_IDS = ['reveal', 'lanyard', 'identity', 'frontback', 'details', 'final'];

const setProgress = (v: number) => { const b = document.getElementById('ldBar'); if (b) b.style.width = (v * 100).toFixed(0) + '%'; };
const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()));
const idle = () => new Promise<void>(r => setTimeout(r, 0));

function wireStatic() {
  for (const [id, key] of [['brandSeal', 'cardSeal'], ['footSeal', 'cardSeal'], ['dSeal', 'lan_seal'], ['dFlame', 'lan_flame'], ['dOrn', 'lan_ornament'], ['dWord', 'lan_wordmark'], ['dWord2', 'lan_wordmark']] as const) {
    const el = document.getElementById(id) as HTMLImageElement | null; if (el) el.src = A[key];
  }
  document.querySelectorAll<HTMLElement>('[data-go]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault(); const k = b.dataset.go!;
    const tops: Record<string, number> = {};
    for (const id of SECTION_IDS) { const el = document.getElementById(id); if (el) tops[id] = el.getBoundingClientRect().top + scrollY; }
    const vh = innerHeight;
    // land on a representative moment of each section
    const y = k === 'top' ? 0 : k === 'details' ? tops.details : k === 'final' ? tops.final + (document.getElementById('final')!.offsetHeight - vh) * 0.9
      : k === 'reveal' ? tops.reveal + document.getElementById('reveal')!.offsetHeight * 0.98 : tops[k] + 2;
    scrollTo({ top: Math.max(0, y), behavior: reducedMQ.matches ? 'auto' : 'smooth' });
  }));
}

function fallback(im: CardImages) {
  document.documentElement.classList.add('no-webgl');
  const fr = $<HTMLCanvasElement>('fbFront'), bk = $<HTMLCanvasElement>('fbBack');
  for (const [c, fn] of [[fr, drawFront], [bk, drawBack]] as const) { c.width = CARD_W; c.height = CARD_H; (fn as typeof drawFront)(c.getContext('2d')!, im, DEFAULT_CARD); }
  for (const [id, key] of [['fbSeal', 'lan_seal'], ['fbWord', 'lan_wordmark'], ['fbFlame', 'lan_flame']] as const) (document.getElementById(id) as HTMLImageElement).src = A[key];
  $('fallback').hidden = false; $('loader').classList.add('done');
}

class Editor {
  data: CardData = { ...DEFAULT_CARD }; dirty = false;
  constructor(private im: CardImages, private front: HTMLCanvasElement, private back: HTMLCanvasElement, private fx: CanvasRenderingContext2D, private bx: CanvasRenderingContext2D, private onChange: () => void) {
    const map: [string, keyof CardData][] = [['f-name', 'name'], ['f-number', 'number'], ['f-college', 'college'], ['f-contact', 'contact'], ['f-contactNo', 'contactNo'], ['f-address', 'address'], ['f-birth', 'birth']];
    for (const [id, key] of map) {
      const el = $<HTMLInputElement>(id);
      el.addEventListener('input', () => { (this.data as any)[key] = el.value || (DEFAULT_CARD as any)[key]; this.dirty = true; });
    }
    $<HTMLInputElement>('f-photo').addEventListener('change', async e => {
      const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
      const url = URL.createObjectURL(f); try { this.data.photo = await loadImg(url); this.dirty = true; } catch { /* ignore bad files */ } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
    });
    $('edReset').addEventListener('click', () => {
      this.data = { ...DEFAULT_CARD }; this.dirty = true;
      for (const [id] of map) $<HTMLInputElement>(id).value = ''; $<HTMLInputElement>('f-photo').value = '';
    });
    const ed = $('editor'), tg = $('edToggle');
    if (matchMedia('(max-width: 700px)').matches) { ed.classList.add('collapsed'); tg.textContent = 'Show'; tg.setAttribute('aria-expanded', 'false'); }   // keep both cards visible on phones
    tg.addEventListener('click', () => { const c = ed.classList.toggle('collapsed'); tg.textContent = c ? 'Show' : 'Hide'; tg.setAttribute('aria-expanded', String(!c)); });
    // keyboard focus inside the editor should not scroll the story
    ed.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  }
  redraw() { drawFront(this.fx, this.im, this.data); drawBack(this.bx, this.im, this.data); this.dirty = false; this.onChange(); }
}

function buildDetails(frontC: HTMLCanvasElement, backC: HTMLCanvasElement) {
  for (const [id, src, side] of [['mFront', frontC, 0], ['mBack', backC, 1]] as const) {
    const host = $(id), cv = host.querySelector('canvas') as HTMLCanvasElement; cv.getContext('2d')!.drawImage(src, 0, 0, cv.width, cv.height);
    host.querySelectorAll('.bx').forEach(n => n.remove());
    for (const it of ITEMS) if (it.side === side) {
      const b = document.createElement('div'); b.className = 'bx'; b.title = it.title;
      b.style.cssText = `left:${(it.rect[0] / CARD_W * 100).toFixed(2)}%;top:${(it.rect[1] / CARD_H * 100).toFixed(2)}%;width:${(it.rect[2] / CARD_W * 100).toFixed(2)}%;height:${(it.rect[3] / CARD_H * 100).toFixed(2)}%`;
      host.appendChild(b);
    }
  }
}

const hasWebGL2 = () => { try { const x = document.createElement('canvas').getContext('webgl2'); if (!x) return false; x.getExtension('WEBGL_lose_context')?.loseContext(); return true; } catch { return false; } };

// The 3D engine (lanyard tour -> finale) is created lazily; the hero never touches it.
interface Gfx { g: GL; world: World; story: Story; tFront: WebGLTexture; tBack: WebGLTexture }

async function boot() {
  wireStatic();
  const root = document.documentElement;
  setProgress(0.05);
  let sm = scrollY;                                   // smoothed scroll position
  const sections: Inputs['sections'] = {};
  const measure = () => { for (const id of SECTION_IDS) { const el = document.getElementById(id); if (!el) continue; const r = el.getBoundingClientRect(); sections[id] = { top: r.top + scrollY, h: r.height }; } };
  const hud = new Hud();
  root.classList.toggle('reduced', reducedMQ.matches);

  // ---- hero image sequence (starts first: it is the only thing the first screen needs)
  let vw = innerWidth, vh = innerHeight;
  let seqState: SeqState = 'idle';
  const onSeq = (s: SeqState) => { seqState = s; root.classList.toggle('seq-ready', s === 'ready'); root.classList.toggle('seq-fail', s === 'failed'); finishLoader(); };
  const seq = new FrameSequence({ canvas: $<HTMLCanvasElement>('seqc'), host: $('reveal'), onState: onSeq, lowEnd });
  let seqStarted = false;
  const startSeq = () => { if (seqStarted || reducedMQ.matches) return; seqStarted = true; seq.start(pickSet(vw, vh, devicePixelRatio || 1, lowEnd)); };
  measure();

  // ---- loader: gone once the first frame is on screen (or the static fallback has taken over)
  let loaderDone = false, loaderTimer = 0, glState: 'idle' | 'booting' | 'ready' | 'failed' = 'idle', gfx: Gfx | null = null, glOn = false;
  const finishLoader = () => {
    if (loaderDone) return;
    const heroOk = !inGL() && (reducedMQ.matches || seqState === 'ready' || seqState === 'failed');
    if (!heroOk && !(inGL() && glState === 'ready')) return;
    loaderDone = true; $('loader').classList.add('done'); root.classList.add('ready');
  };
  const inGL = () => !!sections.lanyard && sm >= sections.lanyard.top;
  startSeq();

  // ---- 2D card art (details sheet + editor + 3D textures all draw from these canvases)
  await loadFonts(); setProgress(0.3);
  const im = await loadCardImages(); setProgress(0.5);
  if (!hasWebGL2()) { console.warn('WebGL 2 unavailable'); fallback(im); return; }
  const scale = mobile ? 1.25 : 2;
  const F = makeCanvas(scale), B = makeCanvas(scale);
  drawFront(F.x, im, DEFAULT_CARD); drawBack(B.x, im, DEFAULT_CARD);
  buildDetails(F.c, B.c);
  const ed = new Editor(im, F.c, B.c, F.x, B.x, () => { if (gfx) { gfx.g.updateTex(gfx.tFront, F.c); gfx.g.updateTex(gfx.tBack, B.c); } buildDetails(F.c, B.c); });
  setProgress(0.8);

  // ---- 3D engine, created on demand
  const canvas = $<HTMLCanvasElement>('gl');
  let quality = TEST ? 1 : (mobile ? 0.8 : 1), cw = 0, ch = 0, dpr = Math.min(devicePixelRatio || 1, 2);
  const resizeGL = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(vw * dpr * quality)), h = Math.max(2, Math.round(vh * dpr * quality));
    if (w !== cw || h !== ch) { cw = w; ch = h; canvas.width = w; canvas.height = h; }
  };
  const bootGL = async () => {
    if (glState !== 'idle') return; glState = 'booting';
    try {
      resizeGL();
      const g = new GL(canvas);
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); location.reload(); });
      const tFront = g.tex(F.c), tBack = g.tex(B.c); await idle();
      const names = ['base', 'values', 'flame', 'ornament', 'seal', 'wordmark', 'clip'] as const;
      const imgs = await Promise.all(names.map(n => loadImg(A['lan_' + n])));
      const T: Record<string, WebGLTexture> = {};
      for (let k = 0; k < names.length; k++) { T[names[k]] = g.tex(imgs[k], { maxSize: mobile ? 2048 : 4096 }); await idle(); }   // one texture per task keeps the page responsive
      const tex: Textures = { front: tFront, back: tBack, base: T.base, vals: T.values, flame: T.flame, orn: T.ornament, seal: T.seal, word: T.wordmark, clip: T.clip };
      const world = new World(g, mobile); await idle();
      world.setTextures(tex);
      hud.world = world; gfx = { g, world, story: new Story(), tFront, tBack };
      glState = 'ready'; (window as any).__isu.gfx = gfx;
      finishLoader(); wake();
    } catch (e) { console.error(e); glState = 'failed'; fallback(im); scrollTo(0, 0); }
  };

  // ---- layout / input
  const onResize = () => { vw = innerWidth; vh = innerHeight; measure(); if (seqStarted) seq.resize(vw, vh, devicePixelRatio || 1); if (glState === 'ready') resizeGL(); wake(); };
  addEventListener('resize', onResize); addEventListener('orientationchange', () => setTimeout(onResize, 200));
  new ResizeObserver(() => { measure(); wake(); }).observe(document.body);
  document.fonts.ready.then(() => { measure(); wake(); });
  reducedMQ.addEventListener?.('change', () => { root.classList.toggle('reduced', reducedMQ.matches); startSeq(); setTimeout(onResize, 50); });
  let mt: [number, number] = [0, 0], ms: [number, number] = [0, 0];
  addEventListener('pointermove', e => { if (!glOn) return; mt = [(e.clientX / vw) * 2 - 1, -((e.clientY / vh) * 2 - 1)]; wake(); }, { passive: true });
  document.addEventListener('pointerleave', () => { mt = [0, 0]; });
  addEventListener('scroll', () => wake(), { passive: true });

  // ---- loop: event-driven in the hero (one rAF per scroll change), continuous only while the 3D scenes are live
  let last = performance.now(), time = 0, slow = 0, fast = 0, raf = 0, heroP = -1;
  const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };
  const setGL = (on: boolean) => { if (on !== glOn) { glOn = on; root.classList.toggle('gl-on', on); } };
  const run = (now: number, forced?: { sy: number; time: number }): boolean => {
    const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000)); last = now;
    const reduced = reducedMQ.matches;
    const target = forced ? forced.sy : scrollY;
    sm = (reduced || TEST || forced) ? target : sm + (target - sm) * (1 - Math.exp(-dt * 12));
    if (Math.abs(target - sm) < 0.1) sm = target;
    const lan = sections.lanyard, rev = sections.reveal;
    if (!lan || !rev) return false;
    const p = clamp((sm - rev.top) / Math.max(1, rev.h));
    // warm the 3D engine up as the toss finishes (or at once when the page opens further down)
    if (glState === 'idle' && (p > 0.55 || sm >= lan.top - vh * 0.5)) void bootGL();

    if (sm < lan.top || glState !== 'ready') {
      // ------------------------------------------------ HERO: image sequence, no WebGL
      setGL(false);
      // jumped past the hero before the 3D engine is ready: bring the loader back if it takes a while
      if (loaderDone && inGL() && glState !== 'ready' && !loaderTimer) loaderTimer = window.setTimeout(() => { loaderTimer = 0; if (inGL() && glState !== 'ready') { loaderDone = false; $('loader').classList.remove('done'); } }, 700);
      const hp = reduced ? (p < 0.4 ? 0 : 1) : p;                  // reduced motion: title, then the finished presentation
      if (!reduced) seq.setProgress(p);
      if (hp !== heroP) { heroP = hp; hud.updateHero(hp); }
      (window as any).__isu.last = (window as any).__isu.last || { frame: null, hud: null };
      return sm !== target;
    }
    // ------------------------------------------------ 3D scenes (lanyard tour -> finale)
    time = forced ? forced.time : time + dt;
    const { g, world, story } = gfx!;
    ms = [ms[0] + (mt[0] - ms[0]) * (1 - Math.exp(-dt * 5)), ms[1] + (mt[1] - ms[1]) * (1 - Math.exp(-dt * 5))];
    if (!TEST && !forced) {
      if (dt > 1 / 38) { slow++; fast = 0; } else if (dt < 1 / 56) { fast++; slow = 0; } else { slow = Math.max(0, slow - 1); }
      if (slow > 40 && quality > 0.55) { quality = Math.max(0.55, quality * 0.86); slow = 0; resizeGL(); }
      else if (fast > 300 && quality < (mobile ? 0.9 : 1)) { quality = Math.min(mobile ? 0.9 : 1, quality * 1.08); fast = 0; resizeGL(); }
    }
    const det = sections.details;
    const covered = !!det && target >= det.top - 1 && target + vh <= det.top + det.h + 1;
    hud.setSheetCover(covered);
    if (covered) return sm !== target;
    const { frame, hud: hs } = story.update({ sy: sm, vw, vh, time, mouse: ms, reduced, mobile, sections, path: world.path });
    frame.w = cw; frame.h = ch;
    world.render(frame);
    setGL(true); heroP = -1;
    hud.update(hs, frame, vw, vh, time, frame.mood);
    (window as any).__isu.last = { frame, hud: hs };
    void g;
    return true;
  };
  const tick = (now: number) => { raf = 0; if (run(now) && !TEST) wake(); };
  (window as any).__isu = { run: (sy: number, t = 1) => run(performance.now(), { sy, time: t }), sections, hud, seq, size: () => [cw, ch], quality: (q: number) => { quality = q; resizeGL(); }, last: null, gfx: null };

  await nextFrame(); run(performance.now());
  setProgress(1);
  // never hold the page hostage: the first frame has 9 s (see FrameSequence), then the static image takes over
  const poll = () => { finishLoader(); if (!loaderDone) setTimeout(poll, 400); }; poll();
  void ed;
}

boot().catch(err => { console.error(err); document.getElementById('loader')?.classList.add('done'); document.documentElement.classList.add('seq-fail'); });

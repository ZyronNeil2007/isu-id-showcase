// App entry: boot (fonts, images, GL, textures), scroll loop, resize, fallback, editor and details wiring.
import { GL } from './engine/gl';
import { World, Textures } from './scene/world';
import { Story, Inputs, ITEMS } from './story/story';
import { Hud } from './ui/hud';
import { A } from './art/assets.generated';
import { CardData, DEFAULT_CARD, CardImages, loadCardImages, loadFonts, makeCanvas, drawFront, drawBack, CARD_W, CARD_H } from './art/cardArt';
import { clamp } from './engine/math';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const qs = new URLSearchParams(location.search);
const TEST = qs.has('test');
const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = !qs.has('hq') && (matchMedia('(max-width: 820px)').matches || /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent));
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

async function boot() {
  wireStatic();
  setProgress(0.05);
  await loadFonts(); setProgress(0.2);
  const im = await loadCardImages(); setProgress(0.35);
  const canvas = $<HTMLCanvasElement>('gl');
  let g: GL;
  try { g = new GL(canvas); } catch (e) { console.warn('WebGL 2 unavailable', e); fallback(im); return; }
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); location.reload(); });

  // ---- card textures (re-created from the supplied template so the placeholders stay editable)
  const scale = mobile ? 1.25 : 2;
  const F = makeCanvas(scale), B = makeCanvas(scale);
  drawFront(F.x, im, DEFAULT_CARD); drawBack(B.x, im, DEFAULT_CARD);
  const tFront = g.tex(F.c), tBack = g.tex(B.c); setProgress(0.5); await idle();
  const names = ['base', 'values', 'flame', 'ornament', 'seal', 'wordmark', 'clip'] as const;
  const imgs = await Promise.all(names.map(n => loadImg(A['lan_' + n]))); setProgress(0.65);
  const T: Record<string, WebGLTexture> = {};
  imgs.forEach((i, k) => { T[names[k]] = g.tex(i, { maxSize: mobile ? 2048 : 4096 }); });
  const tex: Textures = { front: tFront, back: tBack, base: T.base, vals: T.values, flame: T.flame, orn: T.ornament, seal: T.seal, word: T.wordmark, clip: T.clip };
  await idle(); setProgress(0.75);

  let world: World;
  try { world = new World(g, mobile); } catch (e) { console.error(e); fallback(im); return; }
  world.setTextures(tex); setProgress(0.92);

  const story = new Story(), hud = new Hud(world);
  buildDetails(F.c, B.c);
  const ed = new Editor(im, F.c, B.c, F.x, B.x, () => { g.updateTex(tFront, F.c); g.updateTex(tBack, B.c); buildDetails(F.c, B.c); });

  // ---- layout
  const sections: Inputs['sections'] = {};
  const measure = () => { for (const id of SECTION_IDS) { const el = document.getElementById(id); if (!el) continue; const r = el.getBoundingClientRect(); sections[id] = { top: r.top + scrollY, h: r.height }; } };
  let vw = innerWidth, vh = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2), quality = TEST ? 1 : (mobile ? 0.8 : 1), cw = 0, ch = 0;
  const resize = () => {
    vw = innerWidth; vh = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(vw * dpr * quality)), h = Math.max(2, Math.round(vh * dpr * quality));
    if (w !== cw || h !== ch) { cw = w; ch = h; canvas.width = w; canvas.height = h; }
    measure();
  };
  resize(); addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 200));
  new ResizeObserver(() => measure()).observe(document.body);
  document.fonts.ready.then(measure);

  // ---- input
  let mt: [number, number] = [0, 0], ms: [number, number] = [0, 0];
  addEventListener('pointermove', e => { mt = [(e.clientX / vw) * 2 - 1, -((e.clientY / vh) * 2 - 1)]; }, { passive: true });
  document.addEventListener('pointerleave', () => { mt = [0, 0]; });

  // ---- loop
  let last = performance.now(), time = 0, sm = scrollY, slow = 0, fast = 0, frames = 0;
  const run = (now: number, forced?: { sy: number; time: number }) => {
    const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000)); last = now;
    const reduced = reducedMQ.matches;
    time = forced ? forced.time : time + dt;
    const target = forced ? forced.sy : scrollY;
    sm = (reduced || TEST || forced) ? target : sm + (target - sm) * (1 - Math.exp(-dt * 11));
    if (Math.abs(target - sm) < 0.1) sm = target;
    ms = [ms[0] + (mt[0] - ms[0]) * (1 - Math.exp(-dt * 5)), ms[1] + (mt[1] - ms[1]) * (1 - Math.exp(-dt * 5))];
    // dynamic resolution
    if (!TEST && !forced) {
      frames++;
      if (dt > 1 / 38) { slow++; fast = 0; } else if (dt < 1 / 56) { fast++; slow = 0; } else { slow = Math.max(0, slow - 1); }
      if (slow > 40 && quality > 0.55) { quality = Math.max(0.55, quality * 0.86); slow = 0; resize(); }
      else if (fast > 300 && quality < (mobile ? 0.9 : 1)) { quality = Math.min(mobile ? 0.9 : 1, quality * 1.08); fast = 0; resize(); }
    }
    const det = sections.details;
    const covered = !!det && target >= det.top - 1 && target + vh <= det.top + det.h + 1;
    hud.setSheetCover(covered);
    if (covered) { return; }
    const { frame, hud: hs } = story.update({ sy: sm, vw, vh, time, mouse: ms, reduced, mobile, sections, path: world.path });
    frame.w = cw; frame.h = ch;
    world.render(frame);
    hud.update(hs, frame, vw, vh, time, frame.mood);
    (window as any).__isu.last = { frame, hud: hs };
  };
  const tick = (now: number) => { run(now); requestAnimationFrame(tick); };
  (window as any).__isu = { run: (sy: number, t = 1) => run(performance.now(), { sy, time: t }), sections, story, world, hud, g, size: () => [cw, ch], quality: (q: number) => { quality = q; resize(); }, last: null };

  await nextFrame(); run(performance.now());
  setProgress(1); await nextFrame();
  $('loader').classList.add('done');
  document.documentElement.classList.add('ready');
  if (!TEST) requestAnimationFrame(tick);
  void ed; void clamp;
}

boot().catch(err => { console.error(err); document.getElementById('loader')?.classList.add('done'); });

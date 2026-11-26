// Re-creates the supplied CR80 front/back layouts (816 x 1296 px design space) on a canvas so the
// placeholder text stays editable. Geometry, colours, sizes and fonts mirror the supplied template exactly.
import { A } from './assets.generated';

export interface CardData {
  name: string; number: string; college: string;
  contact: string; address: string; contactNo: string; birth: string;
  photo: HTMLImageElement | null;
}
export const DEFAULT_CARD: CardData = {
  name: 'STUDENT NAME', number: '20-2002', college: 'COLLEGE OF COMPUTING STUDIES, INFORMATION AND COMMUNICATION TECHNOLOGY',
  contact: 'NAME', address: 'ADDRESS', contactNo: 'CONTACT', birth: 'MM/DD/YYYY', photo: null,
};
export const CARD_W = 816, CARD_H = 1296;
const GREEN = '#0a6a35', DEEP = '#14442a', GOLD = '#f2c500';

export interface CardImages { seal: HTMLImageElement; wordmark: HTMLImageElement; photo: HTMLImageElement; qr: HTMLImageElement; signature: HTMLImageElement; }

const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
export async function loadCardImages(): Promise<CardImages> {
  const [seal, wordmark, photo, qr, signature] = await Promise.all([A.cardSeal, A.cardWordmark, A.cardPhoto, A.cardQr, A.cardSignature].map(loadImg));
  return { seal, wordmark, photo, qr, signature };
}
export async function loadFonts() {
  const defs: [string, string][] = [['400', A.poppins400], ['600', A.poppins600], ['700', A.poppins700]];
  await Promise.all(defs.map(async ([w, src]) => { const f = new FontFace('Poppins', `url(${src})`, { weight: w }); await f.load(); document.fonts.add(f); }));
}

// CSS baseline for a line box: Poppins ascent 1.05em, descent 0.35em
const baseline = (top: number, fs: number, lh: number) => top + (lh * fs - 1.4 * fs) / 2 + 1.05 * fs;

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean), lines: string[] = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width <= width || !cur) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur); return lines;
}
function contain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight), iw = img.naturalWidth * s, ih = img.naturalHeight * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function text(ctx: CanvasRenderingContext2D, s: string, x: number, top: number, fs: number, weight: number, color: string, align: CanvasTextAlign = 'left', lh = 1.5) {
  ctx.font = `${weight} ${fs}px Poppins, Arial, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, baseline(top, fs, lh));
}
function fitText(ctx: CanvasRenderingContext2D, s: string, x: number, top: number, maxW: number, fs: number, weight: number, color: string, align: CanvasTextAlign, lh: number) {
  ctx.font = `${weight} ${fs}px Poppins, Arial, sans-serif`;
  let f = fs; while (f > 14 && ctx.measureText(s).width > maxW) { f -= 1; ctx.font = `${weight} ${f}px Poppins, Arial, sans-serif`; }
  text(ctx, s, x, top, f, weight, color, align, lh);
}

export function drawFront(ctx: CanvasRenderingContext2D, im: CardImages, d: CardData) {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = GREEN; ctx.fillRect(0, 0, CARD_W, 42); ctx.fillStyle = GOLD; ctx.fillRect(0, 42, CARD_W, 7);
  contain(ctx, im.seal, 34, 78, 137, 137);
  text(ctx, 'Republic of the Philippines', 198 + 280, 88, 24, 600, GREEN, 'center');
  contain(ctx, im.wordmark, 198, 128, 560, 38);
  text(ctx, 'Cabagan, Isabela', 198 + 280, 173, 24, 600, GREEN, 'center');
  // photo frame
  ctx.save(); rrect(ctx, 181, 300, 453, 453, 28); ctx.fillStyle = GREEN; ctx.fill();
  rrect(ctx, 187, 306, 441, 441, 22); ctx.clip(); ctx.fillStyle = '#fff'; ctx.fillRect(187, 306, 441, 441);
  const ph = d.photo || im.photo, s = Math.max(441 / ph.naturalWidth, 441 / ph.naturalHeight);
  ctx.drawImage(ph, 187 + (441 - ph.naturalWidth * s) / 2, 306 + (441 - ph.naturalHeight * s) / 2, ph.naturalWidth * s, ph.naturalHeight * s); ctx.restore();
  fitText(ctx, d.name.toUpperCase() || ' ', 408, 880, 760, 41, 700, GREEN, 'center', 1.1);
  text(ctx, 'NAME', 408, 936, 18, 400, DEEP, 'center');
  fitText(ctx, d.number || ' ', 408, 984, 760, 41, 700, GREEN, 'center', 1.1);
  text(ctx, 'STUDENT NUMBER', 408, 1040, 18, 400, DEEP, 'center');
  ctx.font = `600 32px Poppins, Arial, sans-serif`;
  const lines = wrap(ctx, d.college.toUpperCase(), 680);
  lines.slice(0, 4).forEach((l, i) => text(ctx, l, 408, 1112 + i * 32 * 1.3, 32, 600, GREEN, 'center', 1.3));
  ctx.fillStyle = GOLD; ctx.fillRect(0, 1248, CARD_W, 8); ctx.fillStyle = GREEN; ctx.fillRect(0, 1256, CARD_W, 40);
}

export function drawBack(ctx: CanvasRenderingContext2D, im: CardImages, d: CardData) {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = GREEN; ctx.fillRect(0, 0, CARD_W, 94); ctx.fillStyle = GOLD; ctx.fillRect(0, 94, CARD_W, 7);
  text(ctx, 'PERSON TO NOTIFY IN CASE OF EMERGENCY', 22, (94 - 42) / 2 - 1, 28, 700, '#fff');
  const row = (label: string, val: string, top: number) => {
    ctx.font = '400 21px Poppins, Arial, sans-serif'; const lw = ctx.measureText(label + ' ').width;
    const bl = top + 1.1 * 32; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = DEEP; ctx.fillText(label + ' ', 22, bl);
    ctx.font = '700 32px Poppins, Arial, sans-serif'; ctx.fillStyle = GREEN;
    let f = 32; while (f > 16 && 22 + lw + ctx.measureText(val).width > 492) { f--; ctx.font = `700 ${f}px Poppins, Arial, sans-serif`; }
    ctx.fillText(val, 22 + lw, bl);
  };
  row('CONTACT PERSON:', d.contact, 148); row('ADDRESS:', d.address, 224); row('CONTACT NO.:', d.contactNo, 300); row('BIRTH DATE:', d.birth, 376);
  contain(ctx, im.qr, 510, 148, 262, 262);
  ctx.fillStyle = GREEN; ctx.fillRect(0, 467, CARD_W, 295); ctx.fillStyle = GOLD; ctx.fillRect(0, 467, CARD_W, 7); ctx.fillRect(0, 755, CARD_W, 7);
  ctx.fillStyle = '#fff'; for (const x of [58, 321, 587]) ctx.fillRect(x, 514, 175, 177);
  [['1ST SEMESTER', 58], ['2ND SEMESTER', 321], ['SUMMER', 587]].forEach(([t, x]) => text(ctx, t as string, (x as number) + 87.5, 706, 21, 400, '#fff', 'center'));
  contain(ctx, im.signature, 330, 772, 156, 118);
  text(ctx, 'MERCY C. ALBANO', 408, 872, 41, 700, GREEN, 'center', 1.1);
  text(ctx, 'University Registrar', 408, 928, 18, 400, DEEP, 'center');
  const para = (t: string, top: number, w: number) => {
    ctx.font = `${w} 26.7px Poppins, Arial, sans-serif`;
    wrap(ctx, t, 704).forEach((l, i) => text(ctx, l, 56, top + i * 26.7 * 1.25, 26.7, w, GREEN, 'left', 1.25));
  };
  para('THIS IS TO CERTIFY THAT THE PERSON WHOSE PICTURE AND SIGNATURE APPEAR HEREON IS A STUDENT OF THE ISABELA STATE UNIVERSITY, ECHAGUE CAMPUS.', 976, 400);
  para('THIS CARD IS NON-TRANSFERABLE AND VALID ONLY FOR THE SEMESTER INDICATED IN THE STICKER. REPORT LOSS IMMEDIATELY TO THE REGISTRAR.', 1112, 700);
  ctx.fillStyle = GOLD; ctx.fillRect(141, 1250, 535, 7); ctx.fillStyle = GREEN; ctx.fillRect(141, 1257, 535, 39);
}

export function makeCanvas(scale: number) { const c = document.createElement('canvas'); c.width = CARD_W * scale; c.height = CARD_H * scale; const x = c.getContext('2d')!; x.scale(scale, scale); x.imageSmoothingQuality = 'high'; return { c, x }; }

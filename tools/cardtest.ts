import { loadCardImages, loadFonts, makeCanvas, drawFront, drawBack, DEFAULT_CARD } from '../src/art/cardArt';
(async () => {
  await loadFonts(); const im = await loadCardImages();
  for (const [id, fn] of [['f', drawFront], ['b', drawBack]] as const) {
    const { c, x } = makeCanvas(2); (fn as any)(x, im, DEFAULT_CARD); c.id = id; document.body.appendChild(c);
  }
  (window as any).done = true;
})();

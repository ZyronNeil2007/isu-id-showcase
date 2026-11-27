# Hero image sequence

The landing hero is a pre-rendered, scroll-scrubbed frame sequence (no WebGL, no 3D hand at run time).

- Frames: `assets/animation/frame_000..059.webp` (1800x900, desktop), `md/` (1200x600), `pt/` (600x1300 portrait).
  Viewports narrower than 0.9 aspect use `pt`; small or low-end landscape use `md`.
- `src/hero/sequence.ts`: scroll progress -> frame (table in `manifest.generated.ts`), canvas draw on rAF only when the frame
  changes, nearest-first batched loading, off-screen pause, graceful missing frames, static fallback.
- The 3D engine (lanyard tour -> finale) is created lazily when the hero nears its end, and fades in over the last frame.
- Regenerate: `hero-bake/` holds the original 3D scene with the hand. `tools/bake.py` renders PNGs, `tools/encode_frames.py` encodes them.

## Short visible clip end-piece
The 20 × 50 mm end-piece artwork is shown as a short, near-square tab: `SLEEVE_LEN = 0.40` (world units, 1 = 100 mm) and the shader samples the middle 80 % of the texture (`0.1 + 0.8 * v`), so the seal stays centred; the outer ~5 mm top/bottom are tucked into the buckle and folded round the D-ring. The clasp sits 0.09 higher (`HW_RING_Y = -1.035`, `HANG_Y = 0.725`) so the badge hangs at the same world position as before. Hero frames were re-baked with this layout.

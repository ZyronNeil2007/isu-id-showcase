# Hero image sequence

The landing hero is a pre-rendered, scroll-scrubbed frame sequence (no WebGL, no 3D hand at run time).

- Frames: `assets/animation/frame_000..059.webp` (1800x900, desktop), `md/` (1200x600), `pt/` (600x1300 portrait).
  Viewports narrower than 0.9 aspect use `pt`; small or low-end landscape use `md`.
- `src/hero/sequence.ts`: scroll progress -> frame (table in `manifest.generated.ts`), canvas draw on rAF only when the frame
  changes, nearest-first batched loading, off-screen pause, graceful missing frames, static fallback.
- The 3D engine (lanyard tour -> finale) is created lazily when the hero nears its end, and fades in over the last frame.
- Regenerate: `hero-bake/` holds the original 3D scene with the hand. `tools/bake.py` renders PNGs, `tools/encode_frames.py` encodes them.

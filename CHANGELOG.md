# ISU Student ID — Change Log

A cinematic, scroll-driven digital experience of the ISU student ID and lanyard.
TypeScript + esbuild, dependency-free WebGL2, six sections: **Reveal, Lanyard, Identity, Front & back, Details, Finale**.

Units used throughout: 1 world unit = 100 mm. Card = 0.54 × 0.86 × 0.0095. Lanyard space has its origin where the two strands meet, +y up, and the card hangs toward −y.

---

## 1. Initial build

- Built the site from the supplied CR80 card template and lanyard SVG, following the ISU Visual Identity (colors, seal, Montserrat / Poppins type). No invented branding.
- Six scroll-driven sections sharing one scroll timeline, responsive layout, HUD callouts and section navigation.
- Card, lanyard strap and end-piece textures come from the supplied artwork.
- Hardware was first modelled as an illustrative lobster clasp and a side-release buckle.

## 2. Hero realism and hand

- Replaced the simple hero with a realistic rigged hand: 16 bones, linear blend skinning, and HOLD / OPEN / RELAX poses driven by scroll (`poseFor(open, relax, flick)`).
- Added the hand-based reveal: the hand lifts the ID and then releases it to hang from the lanyard.
- Added a skin shader with contact projection against the card.

## 3. Performance optimization — image-sequence hero

- The Reveal section is now a pre-rendered, scroll-scrubbed **WebP image sequence**: 60 frames in 3 sets (large, medium, portrait), with static fallbacks.
- WebGL boots lazily, only for the later sections.
- Bake pipeline: `isu-bake` (full 3D scene including the hand) → `tools/bake.py` → `tools/encode_frames.py` → `node build.mjs`.
- Static posters are the p = 1.0 renders: 1920×960 landscape and 720×1560 portrait.
- Added `tools/test_hero.py` and `tools/shots.py` for verification.

## 4. Hand–ID interaction fix and realism pass

Scope: only the hand animation in the Reveal section.

- **Card is solid.** The card no longer reads as translucent in blur frames. Blur is now disabled for p ≤ 0.3 and a crisp card is drawn after the blur composite.
- **No intersections.** The first diagnosis (the index finger passing through the card) was wrong. The real problem was that the thumb and index wrapped correctly but the card sat too far up the hand. Fixed with a 25 mm card offset along the fingers and a retimed release.
- **Anatomy and skin.** Reworked finger wrap and grip, and added creases, nails, specular and rim lighting to the skin shader.
- **Verification.** Added collision checks (pierce and clearance) in `collide.ts`, plus `side.ts`, `rel.ts` and `handview.ts` for inspecting offsets. All frames were re-baked rather than patching CSS.

## 5. Lanyard hardware replacement

References: `muckup.jpg` (primary), `buckle.webp`, `D-Ring_Swivel_Clasp.png`.

- Added `src/scene/hardware.ts` with procedural geometry helpers (`loft`, `sweep`, `lathe`, `ellipsoid`, `smoothPath`, `finish`).
- **Side-release buckle** modelled from `buckle.webp`: loops, bars, body, side prongs, webbing and black plastic.
- **D-ring swivel clasp** modelled from `D-Ring_Swivel_Clasp.png`: flat-topped D-ring, swivel and spring-gate hook. The gate is flagged `jaw` and opens when pressed. Steel material is `[0.80, 0.81, 0.83]`, roughness 0.15, metal 1. A split ring holds the badge holder.
- Placement and scale follow `muckup.jpg`.
- Fixed a winding bug: the shader flips normals on back faces, so `finish()` now reverses triangle order as well as negating normals.
- New Lanyard-stop cameras for the buckle and the clasp. Updated the HUD anchors and the clasp callout text.
- The strap artwork, colors and branding were not touched.

## 6. Updated upright 20 × 50 mm clip end-piece

- Replaced `assets/raw/lanyard.svg` with the supplied updated SVG.
- `tools/render_lanyard.py` now renders the clip layer (region 105, 85, 20, 50) to `assets/lanyard/clip.png` (480×1200, portrait).
- The end-piece mesh is an upright slab (0.20 wide × SLEEVE_LEN × 0.034) using shader mode 1.
- Fixed a shader bug where a `//` comment swallowed the `else` branch of the end-piece texture sampling.

## 7. Short visible end-piece (latest)

The 20 × 50 end-piece was too long compared with the mockup crop (buckle → short seal tab → swivel hook → badge holder).

| Setting | Before | After |
|---|---|---|
| `SLEEVE_LEN` (visible length) | full 50 mm artwork length | **0.40** (40 mm) |
| Texture sampled | full 50 mm artwork | **middle 80 %** (`0.1 + 0.8 * v`), seal stays centred |
| Clasp / D-ring position | lower | **raised 0.09** (`HW_RING_Y = −1.035`) |
| `HANG_Y` / `RING_Y` | — | **0.725 / −1.035** (sum kept at −0.31) |

- The badge hangs at exactly the same world position as before.
- The outer ~5 mm of artwork at top and bottom is treated as tucked into the buckle and folded round the D-ring.
- All hero frames (large, medium, portrait, static posters) were re-baked with this layout.

## Publishing

- Published as an Artifact, currently **Version 7**.
- Each update republishes the same file with the 180 frame files (60 frames × 3 sets) so the link stays stable.
- Source zip: `isu-source.zip`, containing the site project and the hero bake pipeline, without `node_modules` or `dist`.

## Verification

- `tsc --noEmit` is clean.
- `tools/test_hero.py` reports no hero errors.
- Screenshots are taken with `WAIT=3000 python3 tools/shots.py` so the GL crossfade settles. Lanyard stops checked at p = 0.91 (buckle), 0.95 (whole tab) and 0.985 (clasp).

## Known limits

- Hardware is an illustrative model, because the supplied SVG defines only the fabric.
- Not tested on a physical device.
- Only the middle 40 mm of the 50 mm end-piece artwork is visible.

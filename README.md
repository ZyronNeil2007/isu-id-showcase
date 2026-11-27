# ISU ID Showcase

An unofficial, interactive 3D showcase of an Isabela State University (ISU) student ID card and lanyard. The page presents the ID through a cinematic, scroll-driven experience and includes an editor for customizing the sample card details.

> **Unofficial concept project.** This is not an official Isabela State University website, student portal, or ID issuance system. It is a visual demonstration only.

## Features

- **Cinematic Reveal Hero**: Pre-rendered, high-fidelity WebP scroll-scrubbed image sequence with responsive landscape (`1800×900`), medium (`1200×600`), and portrait (`600×1300`) frame sets and crisp card rendering.
- **Accurate Lanyard Hardware**: Side-release buckle with squeeze tabs and an authentic D-ring swivel clasp with a spring-gate hook modelled directly after reference specifications.
- **Upright End-Piece & Proportion Tuning**: Shortened 40 mm visible clip end-piece (`SLEEVE_LEN = 0.40`) sampling the middle 80% of the artwork so the ISU seal remains cleanly centered with hardware proportions aligned to physical mockups.
- **Interactive 3D ID Presentation**: Front and back inspection of the student ID card with dynamic lighting, realistic card materials, and motion blur.
- **Card Customization & Live Editing**: In-browser editing of student name, student ID number, degree program, campus, and issuance date with instant preview updates.
- **Photo Upload Capability**: Upload personal profile images directly into the card preview canvas.
- **Responsive & Accessible**: Full mobile/touch support, reduced-motion preferences (`prefers-reduced-motion: reduce`), and lazy-booting WebGL engine for optimized load performance.

## Preview

Open the built page in a modern web browser:

```text
dist/index.html
```

The project also includes a standalone artifact fragment named `dist/artifact.html`.

## Project Structure

```text
.
├── assets/
│   ├── animation/      # Pre-rendered hero frame sequences (desktop, md, pt)
│   ├── lanyard/        # Prepared lanyard artwork textures (seal, wordmark, clip, etc.)
│   └── raw/            # Vector sources, fonts, seal, and signature assets
├── src/
│   ├── art/            # ID card canvas artwork generator and bundled asset mappings
│   ├── engine/         # WebGL2 engine, shader pipelines, and 3D math utilities
│   ├── hero/           # Frame sequence controller and manifest loader
│   ├── scene/          # Procedural hardware, lanyard geometry, and scene graph
│   ├── story/          # Scroll timeline and camera choreography
│   ├── ui/             # HUD overlays, editor controls, and callouts
│   ├── main.ts         # Application entry point and orchestrator
│   ├── index.html      # HTML shell template
│   └── styles.css      # CSS styles and responsive layout
├── hero-bake/          # Standalone 3D scene, rigged hand, and frame baking pipeline
├── tools/              # Verification, screenshot, and SVG rendering scripts
├── dist/
│   ├── index.html      # Self-contained production build
│   └── assets/         # Deployed animation assets
├── build.mjs           # esbuild bundling and asset inlining pipeline
├── CHANGELOG.md        # Comprehensive history of changes and design iterations
├── HERO.md             # Technical documentation for hero sequence rendering
└── package.json        # Project metadata, scripts, and build dependencies
```

## Run Locally

No backend or database is required for the showcase.

1. Download or clone this repository.
2. Open `dist/index.html` in a modern browser, or run a local static web server:

```bash
npm run serve
```

## Build from Source

The source is written in TypeScript and bundled with esbuild to inline core resources into a high-performance distribution.

Install dependencies:

```bash
npm install
```

Run TypeScript type check:

```bash
npm run typecheck
```

Build the distribution package:

```bash
npm run build
```

The built output is output to `dist/index.html` alongside lazy-loaded animation frame sets in `dist/assets/animation`.

## Technologies

- **HTML5 & CSS3** (Custom Properties, Flexbox, Grid)
- **TypeScript & JavaScript** (ES2020)
- **WebGL 2.0** (PBR lighting, contact projection, dynamic shadows)
- **Canvas 2D API** (Procedural ID card rendering & texture generation)
- **esbuild** (Fast bundling & packaging)

## Disclaimer

This project is an independent, unofficial design and coding showcase. ISU names, marks, and related visual materials belong to their respective owners. This project is not affiliated with or endorsed by Isabela State University. Do not use the sample card as a real or valid student identification document.

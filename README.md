# ISU ID Showcase

An unofficial, interactive 3D showcase of an Isabela State University (ISU) student ID card and lanyard. The page presents the ID through a cinematic, scroll-driven experience and includes an editor for customizing the sample card details.

> **Unofficial concept project.** This is not an official Isabela State University website, student portal, or ID issuance system. It is a visual demonstration only.

## Features

- Scroll-driven 3D ID card and lanyard presentation
- Front and back views of the sample student ID
- Editable sample card information
- Uploadable photo for the ID preview
- Responsive layout for desktop and mobile screens
- WebGL rendering with a 2D fallback for browsers that cannot use WebGL
- Reduced-motion support for users who prefer less animation
- Bundled fonts and visual assets

## Preview

Open the built page in a modern web browser:

```text
dist/index.html
```

The project also includes a standalone HTML preview named `ISU Student ID.html` when provided separately.

## Project Structure

```text
isu/
├── assets/
│   ├── lanyard/        # Prepared lanyard artwork
│   └── raw/            # Source images, fonts, and card assets
├── src/
│   ├── art/            # ID card artwork and generated asset data
│   ├── engine/         # WebGL, shader, and math utilities
│   ├── scene/          # 3D scene, card geometry, and lanyard
│   ├── story/          # Scroll-based presentation sequence
│   ├── ui/             # Interface and editor controls
│   ├── main.ts         # Application entry point
│   ├── index.html       # HTML template
│   └── styles.css       # Page styles
├── dist/
│   ├── index.html       # Standalone built page
│   └── artifact.html    # Built page fragment
├── build.mjs            # Build script
└── tsconfig.json        # TypeScript configuration
```

## Run Locally

No backend or database is required for the showcase.

1. Download or clone this repository.
2. Open `dist/index.html` in a modern browser.

For the most reliable local preview, serve the project folder with a simple static web server and open `dist/index.html` through its local address.

## Build from Source

The source is written in TypeScript and the build script uses esbuild to bundle the application and embed its assets into a standalone HTML file.

Install dependencies and run type checking:

```bash
npm install
npm run typecheck
```

To build the standalone bundle:

```bash
npm run build
```

The generated standalone output is written to `dist/index.html`.

## Technologies

- HTML
- CSS
- TypeScript / JavaScript
- WebGL
- Canvas 2D
- esbuild (build tooling)

## Disclaimer

This project is an independent, unofficial design and coding showcase. ISU names, marks, and related visual materials may belong to their respective owners. This project is not affiliated with or endorsed by Isabela State University. Do not use the sample card as a real or valid student identification document.

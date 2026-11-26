### ✨ New Features

- **Interactive 3D Student ID Showcase**: Interactive, scroll-driven presentation of the Isabela State University (ISU) student ID card and lanyard.
- **Card Customization & Live Editing**: In-browser customization of student details (name, student number, academic course/program, campus, date) with live preview updates.
- **Photo Upload Capability**: Upload personal profile images directly to the virtual student ID card preview.
- **Front & Back Inspection**: High-fidelity views of both card faces, featuring university seal, signature, barcode, and QR graphics.

### 🚀 Improvements

- **Standardized Build Tooling**: Added `package.json` with standard build scripts (`npm run build` and `npm run typecheck`).
- **Universal Dependency Resolution**: Updated `build.mjs` to resolve `esbuild` cleanly from local node modules across all operating systems.
- **Self-Contained Distribution**: Builds directly to standalone `dist/index.html` with inlined styles, fonts, and assets.
- **Smooth Fallback & Accessibility**: Robust 2D canvas fallback for environments lacking WebGL, along with `prefers-reduced-motion` support.

### 🔧 Technical Changes

- Introduced `package.json` defining version `1.0.0`.
- Added TypeScript compiler (`typescript`) and bundler (`esbuild`) dev dependencies.
- Added standard `.gitignore` rules for Node.js projects (`node_modules/`, logs, environment files).

### 📚 Documentation

- Updated `README.md` with installation, typecheck, build instructions, and updated project structure.

### ⚠️ Breaking Changes

- None.

### 🙏 Credits / Contributors

- [@ZyronNeil2007](https://github.com/ZyronNeil2007)

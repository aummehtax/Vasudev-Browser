# Vasudev Browser

A custom Chromium-based desktop browser built with Electron + React (Vite). It features a minimalist, futuristic UI with neon accents, a frameless window, custom title bar and tab bar, a rich offline homepage, omnibox-style suggestions, download history, and secure IPC.

> Status: Active development (Phase 1 complete scaffolding + core UX); cross‑platform targets: Windows/Linux.

## Tech Stack
- Electron (Chromium under the hood)
- React 18 + Vite 5
- electron-builder for packaging

## Key Features
- Frameless window with custom title bar (traffic lights on the right)
- Tabs with favicon, title, middle‑click close, hover preview, and active indicator at the bottom of tab bar (neon slide underline)
- Downloads button with Chrome‑like panel (recent downloads, open in folder, clear)
- Secure, sandboxed IPC via preload bridge
- Homepage: unique neon “Matrix” dock + cards, search bar with URL detection (single non-scrollable page)
- Address bar with "clean URL" display and sanitized navigation (tracking params removed)
- Omnibox suggestions dropdown (for searches only)
- Native context menu (navigation, edit, inspect, link/media actions)
- Titlebar color adapts to page meta theme-color

Planned/Next
- Tab audio indicator + click‑to‑mute
- Glowing bottom loading bar during page loads
- Build and package releases for Windows/Linux

## Project Structure
```
Vasudev-Browser/
├─ electron/
│  ├─ main.js          # Creates BrowserWindow, loads React, context menus
│  └─ preload.js       # Secure IPC bridge (contextIsolation)
├─ public/
│  ├─ homepage.html    # Offline homepage (Matrix rain, search, quick links)
│  └─ assets/
│     └─ icon.png      # App/Homepage icon
├─ src/
│  ├─ App.jsx          # Main React app shell
│  ├─ main.jsx         # React entry (mounts App)
│  ├─ components/
│  │  ├─ Titlebar.jsx
│  │  ├─ TabBar.jsx    # Tabs + hover preview + bottom indicator
│  │  └─ WebviewContainer.jsx
│  └─ styles.css       # Global styles + TabBar styling
├─ index.html          # Vite entry (CSP, root mount)
├─ package.json        # Scripts + builder config
└─ README.md
```

## Scripts
- `npm run dev` — Run Vite and Electron concurrently (hot reload frontend)
- `npm run start` — Build renderer then run Electron (production preview)
- `npm run build:renderer` — Vite build to `dist/`
- `npm run pack` — Package app (unpacked) using electron-builder
- `npm run make` — Package distributables for current OS
- `npm run make:win` — Windows build
- `npm run make:linux` — Linux build (AppImage, deb)

## Getting Started (Development)
Prerequisites
- Node.js 18+
- npm 9+

Install & Run
```bash
npm install
npm run dev
```
- Vite dev server: http://localhost:5173
- Electron auto-loads with `ELECTRON_START_URL` pointing to the dev server

Stop
- Press Ctrl+C in the terminal (both Vite and Electron exit)

## Build & Packaging
Renderer only
```bash
npm run build:renderer
```
Electron app (unpacked dir)
```bash
npm run pack
```
Installers / distributables
```bash
# Current OS
npm run make

# Windows
npm run make:win

# Linux (AppImage, deb)
npm run make:linux
```
Output goes to `release/` (configured in electron-builder). AppId: `ai.vasudev.browser`.

## Security Model
- Context isolation enabled via preload bridge
- No Node integration in renderer
- Strong CSP in `index.html`:
  ```html
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self' http: https:; script-src 'self' 'unsafe-inline' http: https:; style-src 'self' 'unsafe-inline' http: https:; img-src 'self' data: http: https:; connect-src 'self' ws: http: https:; frame-src http: https:;" />
  ```
- Renderer and homepage avoid remote execution and tracking; homepage uses local assets (Font Awesome CDN optional)

## Homepage Behavior
- Search field detects URL vs query; URLs navigate directly, search goes to Google
- Quick links navigate in the same tab (no new windows)
- Non-scrollable layout; neon themes; terminal toggle UI

## Tab Bar UX
- Hover shows preview thumbnail
- Active tab indicated by a neon underline positioned at the bottom of the tab bar (smooth slide)
- Loading shimmer/underline kept separate from the active indicator
- Middle-click closes tab; close button hover fades

## Known Issues / Troubleshooting
1) Navigation errors in dev logs (ERR_ABORTED or ERR_NAME_NOT_RESOLVED)
- `ERR_ABORTED` frequently appears when a navigation is superseded by another (e.g., dev reloads). Usually benign in dev.
- `ERR_NAME_NOT_RESOLVED https://google/` indicates an invalid URL. Ensure links use full domains (e.g., `https://www.google.com/`).

2) CSP blocking
- If adding new CDNs/APIs during development, update the CSP in `index.html` accordingly. Prefer local assets.

3) Wayland/Graphics on Linux
- If you encounter rendering issues, try launching Electron with flags:
  ```bash
  ELECTRON_ENABLE_LOGGING=1 electron .
  ```
  or experiment with `--ozone-platform-hint=auto/wayland` via app command line (advanced).

## Contributing
- Fork and create a feature branch
- Keep UI consistent with the minimalist neon aesthetic
- Follow the security model (no Node in renderer, use preload IPC)
- Open a PR with a concise description and screenshots/gifs if possible

## License
TBD

## Acknowledgements
- Electron, React, Vite, electron-builder communities
- Neon UI inspiration from modern macOS/Safari aesthetics

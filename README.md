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

---

# AI Assistant (Comet‑like) for Vasudev Browser

Vasudev Browser includes a Comet‑like AI assistant powered by Google Gemini. It provides persistent sidebar assistance, per‑tab session memory, highlight‑to‑ask, live page grounding, agentic actions with explicit permission gating, and an accuracy/citations UX for trustworthy answers.

## Key AI Capabilities
- __Persistent Assistant UI__: Always‑on sidebar `AISidebar` with conversation history per tab.
- __Per‑Tab Session Memory__: Conversation state is stored in `localStorage` per active tab, keeping context isolated.
- __Live Page Context Grounding__: Injects current page URL, title, visible text, selection, viewport and scroll state into prompts for relevant, grounded answers.
- __Highlight‑to‑Ask__: Select text on the page and click “Use Selection” to ask directly about it.
- __Agentic Actions Framework__: The assistant can propose action plans like navigate, scroll, click, and type. Actions only run after you approve them in‑app.
- __Permission Panel__: In‑app non‑blocking approval UI summarizing proposed actions with Approve & Run / Cancel.
- __Accuracy & Citations UX__: Answers separate the main body and “Sources” list, with clickable links opening in new tabs.
- __Robust Fallbacks__: When the model cannot produce valid action JSON, deterministic heuristics handle common intents (e.g., “open youtube”, “search X on amazon”).

## How It Works
- Renderer component `src/components/AISidebar.jsx` handles input, calls Gemini (via IPC), renders responses, splits citations, and manages the permission panel.
- Web automation lives in `src/components/WebviewContainer.jsx` exposing `performActions()` for:
  - `navigate` (absolute https URLs)
  - `scrollBy`, `scrollTo`
  - `click` (via selector or `textContains`)
  - `type` (selector + value)
- Electron main `electron/main.js` provides IPC handlers for:
  - Gemini completions with multi‑key fallback
  - Background web search and content extraction with Readability (in hidden window or server‑mode fallback)

## Quick Start (AI)
1) __Set API Keys__
   - Create `.env` at project root with one of:
     ```env
     GEMINI_API_KEY=your_key_here
     # or multiple, comma‑separated (fallback rotation)
     GEMINI_API_KEYS=key1,key2,key3
     ```
2) __Run Dev__
   ```bash
   npm install
   npm run dev
   ```
3) __Open the AI Sidebar__
   - Use the in‑app toggle (or the assigned shortcut) and start chatting.

## Example Prompts
- __Open a site__: “open youtube”, “open chatgpt”, “visit x.com”
- __Search__: “search CodeCraft with Surya on youtube”, “search budget laptops on amazon”
- __Ask about highlighted text__: Select text on a page → click “Use Selection”.
- __Grounded Q&A__: “What does this page say about pricing?” (assistant uses live context).

When an action plan is proposed, you’ll see a __permission panel__ with a bullet summary. Click __Approve & Run__ to execute.

## Permissions & Safety
- All agentic actions are gated by an in‑app permission panel.
- Links in responses open in a new tab (no surprise navigation).
- Navigation URLs are normalized to absolute https.

## Troubleshooting (AI)
- __“The action plan was not valid JSON”__
  - The assistant now falls back to deterministic plans for common intents (open/search). If you still see this, try rephrasing or specify the site.
- __“Script failed to execute” in Electron logs__
  - Usually indicates an in‑page selector changed. Share the failing site/action and we’ll add a text‑based fallback or adjust selectors.
- __`ERR_ABORTED (-3)` while loading URLs__
  - In dev, navigations may be superseded by hot reloads. Re‑try the action after the app stabilizes.
- __No sources shown__
  - For questions requiring web research, the assistant performs background search and extraction; if content can’t be read (CSP, fetch blocked), it will note failed sources.

## Roadmap (AI)
- Per‑step toggles and explanations in the permission panel
- Additional atomic actions (e.g., key presses, file uploads)
- Deeper app integrations (email/calendar) with OAuth gating
- Confidence cues and collapsible source details in the citations block

## Contributing (AI)
- Keep UI/UX consistent with the sidebar’s minimal, trustworthy design.
- Prefer grounded answers; when in doubt, emit a plan or “[search] …” for retrieval.
- Never auto‑execute actions; always request permission.

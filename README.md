# FactLens — Chrome extension scaffold

This is a scaffold for the FactLens Chrome extension (Manifest V3).

Features (scaffolded):
- Injects a verdict card below Twitter/X posts via `src/content_script.js`.
- Popup with ON/OFF toggle and session stats (`src/popup.html`, `src/popup.js`).
- Background service worker at `src/background.js` tracks stats and enabled state.
- Placeholder backend call to `http://localhost:3000/verify` from the content script.

Files:
- `manifest.json` — MV3 manifest.
- `src/content_script.js` — injects verdict cards and calls backend.
- `src/content_style.css` — styles for verdict cards.
- `src/background.js` — service worker for state and stats.
- `src/popup.html`, `src/popup.js`, `src/popup.css` — popup UI and logic.
- `icons/` — simple SVG placeholders.

How to load locally:
1. Open Chrome and go to `chrome://extensions`.
2. Enable "Developer mode".
3. Click "Load unpacked" and select the `d:/FacLens` folder.

Backend note:
- The content script POSTs to `http://localhost:3000/verify` expecting JSON `{ verdict: "verified"|"misleading"|"disputed" }`.
- If the network call fails the script falls back to a random placeholder verdict.

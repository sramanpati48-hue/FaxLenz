# FactLens project scaffold

Structure provided:

factlens/
├── extension/              ← Chrome extension (frontend)
│   ├── manifest.json
│   ├── content_script.js   ← Injects verdict cards
│   ├── background.js       ← Handles API calls
 │   ├── popup.html          ← ON/OFF toggle UI
 │   ├── popup.js
 │   └── styles.css
└── backend/                ← Node.js API server
    ├── server.js           ← Express API
    ├── pipeline/
    │   ├── extractClaims.js
    │   ├── checkCache.js
    │   ├── retrieveEvidence.js
    │   └── generateVerdict.js
    ├── .env                ← API keys (never commit this)
    └── package.json

How to run backend locally:

1. cd factlens/backend
2. npm install
3. npm start

How to load extension locally:

1. Open Chrome and go to chrome://extensions
2. Enable Developer mode
3. Click "Load unpacked" and select the `factlens/extension` folder

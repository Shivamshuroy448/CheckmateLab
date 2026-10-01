# ♟️ CheckmateLab — Stockfish 16 Engine

> **Live Demo**: https://checkmatelab.vercel.app/

**CheckmateLab** is an enterprise-grade, real-time chess assistant and tactical evaluation dashboard powered by **Stockfish 16 NNUE**. Designed for live game analysis, mid-game position reconstruction, daily tactical training, game reviews, and global leaderboard progression.

---

## 🔥 Key Features

### 1. 📖 Real-Time Opening Name Detector (ECO Database)
- Identifies official chess opening names dynamically as moves are played (*e.g., "Sicilian Defense: Najdorf [B90]"*, *"Ruy Lopez: Morphy Defense [C70]"*, *"Italian Game [C50]"*).
- Built-in Encyclopedia of Chess Openings (ECO) database.

### 2. 🔍 Full Game Review & Move Accuracy Meter (%)
- Calculates overall game accuracy percentage (*e.g., `92.4% Accuracy`*) and performance tier (*Grandmaster / Master / Solid*).
- Move-by-move evaluation breakdown categorizing moves into **Brilliant (‼️)**, **Best (⭐)**, **Good (👍)**, **Inaccuracy (⚠️)**, and **Blunder (❌)**.

### 3. 🤖 Stockfish 16 NNUE Engine & Master Opening Book
- Real-time position analysis with tactical evaluation score and dynamic move recommendation arrows.
- Master Opening Book (3500+ ELO) fallback for sub-50ms instant opening recommendations.

### 4. 📊 Real-Time Win Probability % Odds Bar
- Calculates win, draw, and loss probabilities on every turn (`⚪ White Win % | 🤝 Draw % | 🖤 Black Win %`).
- Evaluates winning chances using sigmoid evaluation scaling.

### 5. 🧩 Daily Tactical Puzzles & ELO Bonus Mode
- Curated grandmaster tactical positions (*Morphy's Opera Game Mate, Philidor's Smothered Mate, Greek Gift Sac, Back-Rank Execution*).
- Solve positions directly on the board to earn **+15 ELO bonus points** on your profile!

### 6. 🔑 Google 1-Click Sign-In & Verified Profile
- Secure Google OAuth authentication.
- Track verified victories, custom nationality flags, and live ELO ratings.

### 7. 🏆 Worldwide Live Leaderboard
- Real-time global player rankings and total win ticker.
- Guest Mode Blur Shield encouraging player registration for ELO tracking.

### 8. 📜 Multi-Platform Game Importer & Instant Clipboard (`Ctrl + V`)
- Direct Lichess game URL auto-fetch (`https://lichess.org/game/...`).
- Multi-proxy fallback pipeline for Chess.com game fetching.
- **Global `Ctrl + V` Move Paste**: Copy move notation (e.g. `1. e4 e5 2. Nc3`) or PGN anywhere on the web, press `Ctrl + V` on the app, and load mid-game positions instantly!

### 9. 🎨 Cyberpunk Aesthetic & Sound Engine
- Multiple visual themes (*Cyberpunk Neon, Midnight Glass, Emerald Grandmaster*).
- Sound effects for move, capture, check, and checkmate.

---

## 🛠️ Technology Stack

- **Core Engine**: Stockfish 16 WebWorker (NNUE) + Chess.js + ECO Opening Engine
- **Frontend**: Vanilla HTML5, CSS3 (Modern Glassmorphism & Custom Properties), ES6 Modules
- **Build Tool**: Vite 5
- **Authentication**: Google Identity Services (GIS SDK)
- **Deployment**: GitHub Pages

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v16.0.0 or higher)
- npm

### Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Shivamshuroy448/CheckmateLab.git
   cd CheckmateLab
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run local dev server**:
   ```bash
   npm run dev
   ```

4. **Open in browser**:
   Navigate to `http://localhost:5173/`

### Production Build

```bash
npm run build
```

The output production bundle will be generated in the `dist/` directory.

---

## 📂 Project Architecture

```text
CheckmateLab/
├── ai_companion_extension/   # Chrome Extension & Userscript Helper
│   ├── manifest.json
│   ├── background.js
│   └── content.js
├── src/                      # Application Source Code
│   ├── app.js                # Main Orchestrator & App Controller
│   ├── stockfishEngine.js    # Stockfish 16 Engine & NNUE Evaluator
│   ├── boardRenderer.js      # Custom Canvas & SVG Overlay Renderer
│   ├── openings.js           # ECO Opening Detector Engine
│   ├── soundEffects.js       # Web Audio API Sound Engine
│   ├── puzzles.js            # Curated Grandmaster Tactical Puzzles
│   └── style.css             # Cyberpunk Design Tokens & Stylesheet
├── index.html                # Single-Page Application Entrypoint
├── vite.config.js            # Vite Build & Asset Pipeline Config
└── README.md                 # Project Documentation
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

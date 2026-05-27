# Contributing to Junior Golf Tracker

## Code architecture

The app is being incrementally modularized from a single `script.js` into
per-concern ES modules under `src/`. Think of each module like a Flutter
widget tree: one file = one concern, imports declare its dependencies.

### Directory layout (target)

```
/
├── index.html         # Page shell + tab divs + modals
├── script.js          # Entry point. Imports from src/* and bootstraps the UI.
├── style.css          # All styles (will stay one file for now)
└── src/
    ├── core/
    │   ├── storage.js      # Multi-user localStorage namespace + accounts
    │   ├── utils.js        # todayISO, calcAge, escape helpers
    │   ├── courses.js      # COURSES static data + clubs lists
    │   └── nav.js          # (Phase 4) switchTab, drawer, showApp/showWelcome/showLogin
    ├── data/                # (Phase 2)
    │   ├── profile.js      # getProfile/saveProfile + clubDistances
    │   ├── rounds.js       # getHistory, saveRoundToHistory, computeAnalysis
    │   ├── practice.js     # putting/chipping/iron/driver state + insights
    │   ├── videos.js       # IndexedDB blob storage
    │   └── weather.js      # Open-Meteo fetching
    ├── ai/                  # (Phase 3)
    │   ├── grok.js         # callGrok + aiBaseContext + getGrokKey
    │   └── generators.js   # round report, practice plan, etc.
    └── screens/             # (Phase 4)
        ├── login.js
        ├── home.js
        ├── setup.js
        ├── clubs.js
        ├── tracker.js
        ├── stats.js
        ├── practice-ui.js
        ├── videos-ui.js
        ├── coach.js
        └── profile.js
```

### Current state (after PR #11)

Extracted:
- `src/core/storage.js`, `src/core/utils.js`, `src/core/courses.js`
- `src/data/rounds.js`, `src/data/practice.js`, `src/data/profile.js`,
  `src/data/videos.js`, `src/data/weather.js`
- `src/ai/grok.js`, `src/ai/context.js`, `src/ai/generators.js`
- `src/screens/practice-ui.js` — putting / chipping / iron / driver drill
  state machines + render summaries + `wirePracticeUi()` initializer

Pending (still in script.js):
- Other screens (login, home, setup, clubs, tracker, stats, videos-ui,
  coach, profile) — Phase 4b–4d
- Final cleanup — last PR

### Adding new code

- **New utility function** → `src/core/utils.js` (or create a focused module)
- **New screen** → `src/screens/<name>.js`, then wire from `script.js`'s tab dispatcher
- **New data layer concept** → `src/data/<concept>.js`
- **New AI generator** → `src/ai/generators.js`

### Style

- ES module syntax (`import` / `export`).
- Named exports preferred over default exports.
- No classes unless a clear reason — plain functions and module-scope state.
- Keep modules small (< 300 lines is ideal).

### Deployment

- GitHub Pages serves the repo root. The deploy workflow handles caching.
- Test locally: `python3 -m http.server 8765` from the repo root, then open
  `http://localhost:8765/index.html`.

# Contributing to Junior Golf Tracker

## Code architecture

The app uses ES modules with a Flutter-widget-style file-per-concern layout
under `src/`. `script.js` is the entry point and orchestration shell —
it loads as `<script type="module">` and imports everything else.

### Directory layout

```
/
├── index.html              # Page shell + tab divs + modals
├── script.js               # Entry point + orchestration shell + tracker
├── style.css               # All styles
└── src/
    ├── core/
    │   ├── storage.js      # Multi-user localStorage namespace + accounts
    │   ├── utils.js        # todayISO, calcAge, escape helpers
    │   └── courses.js      # COURSES static data + clubs lists + locationFor
    ├── data/
    │   ├── rounds.js       # getHistory, saveHistory, upcoming
    │   ├── practice.js     # CRUD + 4 insights getters + classifiers
    │   ├── profile.js      # Profile + clubs + observed-club-carry
    │   ├── videos.js       # IndexedDB blob storage
    │   └── weather.js      # Open-Meteo fetch + code → text
    ├── ai/
    │   ├── grok.js         # Two-mode client (direct + proxy)
    │   ├── context.js      # aiBaseContext + setAiOutput
    │   └── generators.js   # 9 generators incl. swing vision analyzers
    └── screens/
        ├── login.js        # Login + signup (DI nav helpers)
        ├── practice-ui.js  # 4 drill state machines + summaries + wire
        ├── videos-ui.js    # Upload + library + modal + compare + wire
        ├── coach.js        # Chat launcher + panel + rule-based + AI + wire
        └── stats.js        # Categories grid + filters + deep-dives + wire
```

### What stays in `script.js`

The orchestration shell — boot order, page-level navigation primitives
(showLogin / showWelcome / showApp / switchTab / syncDrawerActive /
syncBottomTabs / openDrawer / closeDrawer), the welcome / home dashboard
renderer, setup tab pill wiring, clubs tab grid, profile field handlers,
tee-progression goals, monthly summary / calendar / score-trend /
handicap-trend / weather-impact dashboard cards, and the entire round
tracker (hole-by-hole UI, shot logging, putt logging, save-round
computation, analyse-hole logic).

The tracker is intentionally not extracted: it shares ~30 helper functions
with the analysis path and the demo-seed path. Splitting them would create
circular module deps. If a future change makes the tracker self-contained
enough to extract, it goes in `src/screens/tracker.js`.

### Legacy bridges (window globals)

A few legacy script.js helpers are exposed on `window` so extracted
modules can call them until they're properly extracted:

- `window.suggestTeeProgression` — used by `src/screens/coach.js`

### Adding new code

- **New utility function** → `src/core/utils.js` or focused module
- **New screen** → `src/screens/<name>.js`; export `wire<Name>Ui()` and
  any render functions; call `wire<Name>Ui()` from `script.js` boot
- **New data concept** → `src/data/<concept>.js`
- **New AI generator** → `src/ai/generators.js`

### Style

- ES module syntax (`import` / `export`); named exports preferred
- Module-scope state for screen-specific UI state (drill state, chat
  history, filter selection); persisted to localStorage where needed
- No classes unless clearly justified
- Keep modules small — target < 400 lines

### Boot order (in `script.js`)

1. Side-effect imports (storage namespace installs on first `import`)
2. Named imports from all modules
3. Function declarations / global state (legacy)
4. Top-level event listener wiring (legacy)
5. Module wirings: `wirePracticeUi()`, `wireVideosUi()`,
   `wireStatsCategories()`, `wireCoachUi()`, `wireLoginUi(navHelpers)`
6. Initial boot: `applyUrlActivationToCurrentUser()` then
   `showWelcome()` or `showLogin()` based on login state

### Deployment

GitHub Pages serves the repo root. Local dev: `python3 -m http.server 8765`
from repo root, open `http://localhost:8765/index.html`.

### Cache-busting

After any change that ships, bump the `?v=` in `index.html`'s script tag
(e.g. `script.js?v=20260527h`) so browsers fetch fresh modules.


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

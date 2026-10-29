# The Eternal Simulation

The Eternal Simulation is a browser-first incremental game about restoring a dormant facility and turning manual experiments into an increasingly capable automated system. Its public BETA focuses on the Energy Era: gathering and stabilizing energy, improving algorithms, installing devices, and advancing the facility through Machine Learning and Facility Optimization.

The game is in active BETA. Saves are local to the browser, balance and presentation may evolve, and bug reports are welcome.

## Play

The intended public URL is:

<https://scheuer12.github.io/The-Eternal-Simulation-Game/>

The repository is also a complete static site. After cloning it, serve the repository root and open `index.html` through the local server:

```powershell
python -m http.server 8000
```

Then visit <http://localhost:8000/>.

The normal loop begins with manual energy collection and expands into algorithm studies, specialized hardware, automation, and facility-level progression. The interface reveals systems as they become relevant; the README intentionally avoids narrative spoilers.

Development Mode remains available at `?dev=1`, for example <http://localhost:8000/?dev=1>. It uses a separate save namespace from the normal game.

## Save behavior

Progress, backups, and quicksaves are stored in browser `localStorage`. Normal and Development Mode saves are isolated from one another.

Browser storage belongs to a specific origin. A save created on `localhost`, a local file URL, or another domain will not automatically appear on GitHub Pages. The game currently has no account sync or cloud-save service, so clearing site data can remove local progress.

## Development setup

Requirements:

- Node.js 20 or newer
- npm (using the committed `package-lock.json`)
- Python 3 only for the optional balance simulator and convenient local server
- Google Chrome or Chromium for the user-level QA runner; set `CHROME_PATH` when it is not in a standard location

Install the locked dependency tree:

```powershell
npm ci
```

Useful commands:

```powershell
npm test          # deterministic Node test suite
npm run build     # regenerate the committed browser bundle
npm run test:qa   # headless browser interaction suite
npm run simulate  # optional Python balance simulation
```

After changing JavaScript modules, configuration, narrative news, or the pinned numeric dependency, run `npm run build` and commit the synchronized `js/game.bundle.js`. The deployed game does not fetch npm packages at runtime.

## Architecture

The application is deliberately static and backend-free:

- `index.html` is the GitHub Pages entry point.
- `css/` contains the responsive interface styles.
- `js/` contains state, formulas, effects, simulation, persistence, and rendering modules.
- `config/game-config.json` is the source of truth for balance and timing parameters.
- `content/` contains player-facing narrative material and news.
- `icons/` contains the shipped UI assets.
- `simulation/tests/` contains the maintained deterministic acceptance and architecture tests.
- `simulation/legacy-tests/` preserves older tests that are not part of the default suite.
- `tools/` contains build, QA, screenshot, and diagnostic utilities.
- `docs/` contains design history, architectural records, and forward-looking material; see `docs/README.md` before treating it as current behavior.

`tools/build-bundle.mjs` embeds the current configuration, news content, source modules, and `break_eternity.js` into `js/game.bundle.js`. Relative asset paths allow the site to run under the GitHub Pages repository subpath.

## Current scope and limitations

The BETA includes the playable Energy Era, algorithm progression, device purchasing and management, automation, Machine Learning, Facility Optimization, local saves, offline progression, quicksave/restore, statistics, narrative milestones, and Development Mode.

Some navigation and design documents refer to later layers such as Science and Particles. Those are future-facing or incomplete and are not part of the public BETA acceptance criteria. There is no backend, multiplayer, cloud save, or cross-origin save transfer.

Future development may extend later eras and improve balance, accessibility, testing, and save portability. Roadmap documents describe direction, not commitments or implemented behavior.

## Contributing and licensing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, architecture, testing, and pull-request expectations. Changes are recorded in [CHANGELOG.md](CHANGELOG.md).

The project source is available under the [MIT License](LICENSE). Icon attribution and third-party artwork licensing are documented in [ATTRIBUTION.txt](ATTRIBUTION.txt). The bundled numeric library, `break_eternity.js`, is also MIT-licensed.

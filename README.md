# The Eternal Simulation

A text-driven cosmic incremental game prototype. The player restores an abandoned facility, condenses cosmic radiation and gradually turns manual experimentation into an automated system.

This first playable slice ends when the first **Processor** comes online.

## Run locally

Open `index.html` directly in a modern browser. The committed browser bundle does not require a server or installation.

During development, a local server is still convenient:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`.

Development controls are available in a separate save slot at:

```text
http://localhost:8000/?dev=1
```

## Tests and simulation

```powershell
npm test
python simulation/simulator.py --runs 1000
```

No runtime dependencies or build step are required.

When source modules change, regenerate the committed browser bundle with:

```powershell
npm run build
```

## Project structure

- `config/`: balance parameters.
- `content/`: player-facing narrative content.
- `css/`: responsive presentation.
- `js/`: game state, formulas, engine, persistence and UI.
- `simulation/`: Python balance and Monte Carlo tools.
- `tests/`: deterministic JavaScript tests.
- `docs/`: Obsidian-compatible design vault.

## Current scope

Included: introduction, Stored Energy, Power Cell, CRC, Manual Condensing, Algorithm Improvements, Algorithm Upgrades, Auto Calculator, CRC Blueprint, a second CRC, Processor, local save and development controls.

Deferred: Particle Laboratory access, particles, prestige, Science Points and full offline progress.

# Contributing to The Eternal Simulation

Thank you for helping improve The Eternal Simulation. The project is in BETA, so contributions should favor reproducible fixes, save compatibility, and small reviewable changes over broad rewrites.

## Development environment

1. Install Node.js 20 or newer and Python 3 if you intend to run the optional simulator.
2. Clone the repository and install the exact dependency versions from the lockfile:

   ```powershell
   npm ci
   ```

3. Start a static server from the repository root:

   ```powershell
   python -m http.server 8000
   ```

4. Open <http://localhost:8000/>. Use <http://localhost:8000/?dev=1> for accelerated manual verification; Development Mode uses a separate local save.

## Branches and pull requests

- Start from the current target branch and keep each branch focused on one concern.
- Use descriptive names such as `fix/save-recovery`, `feat/accessibility-labels`, or `docs/local-setup`.
- Do not combine balance changes, refactors, and unrelated UI work in one pull request.
- Explain the player-visible effect, technical approach, test evidence, save impact, and any remaining limitation in the pull-request description.
- Include screenshots for visible interface changes and clear reproduction steps for bug fixes.
- Never commit credentials, local environment files, generated screenshots, dependency folders, or editor workspace state.

## Code organization

- Keep balance and timing values in `config/game-config.json`; do not hide tuning constants in rendering code.
- Keep narrative and player-facing content in `content/` when the existing content model supports it.
- Keep game rules in the simulation, formula, effect, and engine layers. The UI should render state and dispatch actions rather than own gameplay rules.
- Use the existing component and effect registries instead of adding parallel mechanisms for the same responsibility.
- Preserve the precision-safe numeric path for values that can exceed native JavaScript number ranges.
- Preserve normal-save and Development Mode isolation. Any state-shape change must define normalization or migration behavior and include compatibility tests.
- Treat `js/game.bundle.js` as generated output. Edit source modules, then rebuild it with `npm run build`.

Before introducing a gameplay mechanic, define its state, configuration, formulas, reset behavior, persistence rules, UI exposure, and acceptance tests. Prefer extending existing contracts over creating a second architecture. New mechanics should not leak unrevealed narrative or progression information through tooltips or markup.

## Testing expectations

Run the checks relevant to every change:

```powershell
npm test
npm run build
npm run test:qa
```

For balance-sensitive work, also run:

```powershell
npm run simulate -- --runs 100
```

After a build, verify that `git diff --exit-code -- js/game.bundle.js` is clean when no bundle change was expected, or review and commit the generated diff when source inputs changed.

Use tests to validate requirements and edge cases, not merely to mirror the implementation. Do not weaken legitimate assertions to make a regression pass. A pull request should state exactly which commands were executed and report failures honestly.

Manual verification should cover the affected progression path, refresh persistence, normal and Development Mode save separation, browser console errors, and at least one desktop and one narrow/mobile viewport for UI changes.

## Reporting bugs

Open an issue with:

- a concise description of the observed and expected behavior;
- exact reproduction steps and the page URL, including query parameters;
- browser, operating system, and viewport or device information;
- relevant console errors or screenshots;
- whether the problem reproduces with a fresh save and in Development Mode.

Do not post save data, logs, or screenshots containing secrets or personal information.

## Suggesting improvements

Describe the player problem first, then the proposed change. Explain affected mechanics, balance, save compatibility, accessibility, and alternatives considered. Future-era ideas are welcome as design discussion, but unfinished roadmap work should not be presented as current BETA behavior.

## Documentation and licensing

Public-facing documentation and player text should use clear natural English. Historical design notes may retain their original language when rewriting them would reduce traceability, but they must be identified as historical or forward-looking rather than authoritative implementation documentation.

Contributions are accepted under the repository's MIT License. New third-party assets or code must have a compatible license and include the required attribution.

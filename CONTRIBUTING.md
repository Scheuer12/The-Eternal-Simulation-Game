# Contributing

## Principles

- Keep balance values in `config/game-config.json`.
- Keep game rules out of the rendering layer.
- Make randomness accelerate progress, never permanently block it.
- Preserve save compatibility or add an explicit migration.
- Add or update tests whenever a formula or rule changes.
- Keep player-facing game text in English.

## Before committing

Run:

```powershell
npm test
python simulation/simulator.py --runs 100
```

Then complete one accelerated run using `?dev=1`.


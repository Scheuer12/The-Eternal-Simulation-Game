# Documentation guide

This directory preserves the project's design history as well as material for possible future layers. It is useful context, but it is not uniformly authoritative for the current public BETA.

## Sources of truth for current behavior

When documentation and implementation differ, use the following evidence in order:

1. executable acceptance tests in `simulation/tests/`;
2. current behavior in `js/`, `config/game-config.json`, and `content/`;
3. `ARCHITECTURE_FINAL_DECISIONS.md` and accepted decision records;
4. design and balance documents in this directory;
5. archived blueprints and roadmap material.

Differences should be resolved deliberately. Do not silently change gameplay to match an older document.

## Current and historical material

- `08 - Decision Log/` contains architectural decision records.
- `09 - Playtests/` contains playtest templates and evidence formats.
- `03 - Layer 1/`, `04 - Systems and Formulas/`, and `05 - Balance/` describe the Energy Era, but some values may predate the latest executable configuration.
- `03 - Layer 2/` and other later-layer references are forward-looking and may describe unimplemented systems.
- `balancing-strategies-archive.md` and `classes-blueprint-archive.md` are preserved historical planning artifacts, not current release specifications.
- `Energy Era Documentation.docx` is retained as a source artifact; verify any claim against the current code and tests.

Several historical documents are written in Portuguese. They remain unchanged to preserve provenance. Public release instructions and contributor-facing guidance are maintained in English in the repository root and this guide.

## Editing guidance

Label proposals, experiments, and obsolete baselines explicitly. When a behavior changes, update the relevant executable tests and current documentation together. Avoid placing secrets, personal paths, editor state, or generated test artifacts in this directory.

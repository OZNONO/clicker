# Development rules

- Keep Vanilla HTML/CSS/JS; retain direct `file://` execution without a framework or build system.
- Support GitHub Pages project sites with relative asset paths; preserve the Pages workflow.
- Access localStorage only through `LocalStorageAdapter`.
- Save source state; recalculate TAP, DPS, costs, capacity and max HP from definitions.
- Concentrate balance constants/formulas in `balance.js`; label uncertain reconstruction rules as temporary.
- Use the existing injectable RNG and clock for game logic and deterministic tests.
- Preserve old save migrations and existing player data.
- Add relevant tests for changed behavior; pass the full regression suite and JavaScript syntax checks.
- One task includes implementation, tests and one commit. Never push automatically.
- When changing game rules or persistence, read and update `PROJECT_STATE.md`.

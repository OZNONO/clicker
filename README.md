# Lutie-like RPG Clicker v0.2

A personal reconstruction prototype exploring the overall structure and feel of a discontinued mobile RPG clicker. It uses original CSS placeholder shapes only; no original copyrighted image or audio assets are included.

> All currently unverified numerical balance and several progression rules are **temporary reconstruction values, not verified original game values**. They are isolated in `balance.js` and `data.js` so historical findings can replace them later.

## Run

Double-click `index.html` and play in a modern browser. There is no build step, server, database, login, analytics, payment, or online save. Progress is stored locally through `LocalStorageAdapter`.

## Current systems

- TAP combat by pointer or Space/Z/X/Enter, hit reactions, and distinct TAP/DPS feedback
- Base DPS plus combined active Guardian DPS
- Mobile layout with persistent combat view and five bottom tabs
- Ten-placeholder Guardian roster with encounters at Stages 5, 15, 25, and so on
- Region Bosses at Stages 10, 20, 30, and so on
- Thirty-second timed encounters, failure farming, and manual boss retry
- Independent Guardian levels, x1/x10/MAX upgrades, and permanent reincarnation levels
- Mimics with bonus Gold and Mana Stone drops
- Farming-only Nazar encounters with escalating HP
- Normal, High, and Legendary Mana Stones with Stage-based effective-level caps
- One-stone-per-Guardian equip and unequip rules
- Lutie active-skill slots; Flare Ray is the single functional prototype skill
- Reincarnation, Stars, and three placeholder Artifacts for TAP/DPS/Gold
- Automatic local save, manual Save Now, JSON Export/Import, and complete Reset Save
- Large-number formatting through K/M/B/T/Qa/Qi/Sx and scientific notation fallback

## Save data and migration

The full game is a single JSON-serializable save object. Version 2 separates current-run state from permanent discovery and progression. Existing version 1 saves are migrated without intentionally deleting their Gold, Stage, Lutie level, first Guardian level/unlock, or boss retry/farming progress.

`game.js` and `ui.js` never access browser storage directly. They use the adapter boundary in `storage.js`:

```text
saveGame(state)
loadGame()
resetGame()
```

JSON Export/Import is supported in the Settings tab. Imports are parsed and structurally validated before replacing the current state; invalid input leaves the active save untouched.

## File responsibilities

- `data.js` — placeholder Guardian, Artifact, and skill definitions
- `balance.js` — reconstruction constants and replaceable formulas
- `game.js` — runtime state, calculations, combat, progression, migration, and save import/export
- `ui.js` — DOM rendering, tab navigation, keyboard/pointer input, files, and visual feedback
- `storage.js` — persistence interface and `LocalStorageAdapter`
- `styles.css` — mobile layout and CSS-only placeholder graphics
- `tests/smoke.test.cjs` — deterministic smoke coverage with injected RNG

## Verification

Run:

```powershell
node tests/smoke.test.cjs
```

The smoke suite covers the 34 requested combat, encounter, roster, Mana Stone, Nazar, reincarnation, Artifact, bulk-upgrade, save, migration, import, and reset behaviors.

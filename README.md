# Lutie-like RPG Clicker v0.2.1

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
- Thirty-second timed encounters, optional **Give Up**, failure farming, and manual boss retry
- Guaranteed Region Boss Mana Stone rewards (Normal, with a provisional High upgrade chance)
- Independent Guardian levels, exact +1/+10/MAX upgrades, groups, acquisition-order sorting, and permanent reincarnation levels
- Mimics with a provisional 1% appearance rate, bonus Gold, and Mana Stone drops
- Farming-only Nazar indicator and encounters with hidden, exponentially escalating HP
- Normal, High, and Legendary Mana Stones with Stage-based effective-level caps
- One-stone-per-Guardian equip and unequip rules
- Lutie active-skill slots; Flare Ray is the single functional prototype skill
- Reincarnation, Stars, and three placeholder Artifacts for TAP/DPS/Gold
- Automatic local save, manual Save Now, JSON Export/Import, and complete Reset Save
- Large-number formatting through K/M/B/T/Qa/Qi/Sx and scientific notation fallback

## Save data and migration

The full game is a single JSON-serializable save object. Version 3 adds stable Guardian acquisition order and sort preferences to the run/permanent state introduced in v0.2. Version 1 and Version 2 saves are migrated without intentionally deleting Gold, Stage, Lutie level, Guardian level/discovery/reincarnation/Stone data, or boss retry/farming progress.

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

The smoke suite retains the v0.2 coverage and adds deterministic checks for guaranteed Region Boss Stones, Give Up, farming persistence, Nazar UX/escalation, exact +10 purchases, Guardian sorting, acquisition order, and v2→v3 migration.

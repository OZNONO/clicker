# Lutie-like RPG Clicker v0.2.4

A personal reconstruction prototype exploring the overall structure and feel of a discontinued mobile RPG clicker. It uses original CSS placeholder shapes only; no original copyrighted image or audio assets are included.

> All currently unverified numerical balance and several progression rules are **temporary reconstruction values, not verified original game values**. They are isolated in `balance.js` and `data.js` so historical findings can replace them later.

## Run

Double-click `index.html` and play in a modern browser. There is no build step, server, database, login, analytics, payment, or online save. Progress is stored locally through `LocalStorageAdapter`.

## Current systems

- TAP combat by pointer or Space/Z/X/Enter, hit reactions, and distinct TAP/DPS feedback
- Base DPS plus combined active Guardian DPS
- Mobile layout with persistent combat view and five bottom tabs
- Ten-placeholder Guardian roster with encounters at Stages 5, 15, 25, and so on; all Guardians currently share the same temporary base DPS
- Region Bosses at Stages 10, 20, 30, and so on
- Thirty-second timed encounters, optional **Give Up**, failure farming, and manual boss retry
- Guaranteed Region Boss Mana Stone rewards (Normal, with a provisional High upgrade chance)
- Independent Guardian levels, exact-cost +1/+10/MAX upgrades, readable Level/DPS values, groups, acquisition-order sorting, and permanent reincarnation levels
- Mimics with a provisional 1% appearance rate, bonus Gold, and Mana Stone drops
- Normal-monster Gold with temporary, deterministic-testable ±10% integer variance centered on the existing base reward
- Farming-only Nazar indicator and encounters with hidden, exponentially escalating HP; Nazar grants no Gold or drops
- Normal, High, and Legendary Mana Stones with Stage-based effective-level caps
- Touch-friendly Guardian Mana Stone picker with readable rarity/level/effect details and exclusive one-stone-per-Guardian equip rules
- Lutie active-skill slots; Flare Ray is the single functional prototype skill
- Reincarnation, Stars, and three placeholder Artifacts for TAP/DPS/Gold
- Automatic local save, manual Save Now, JSON Export/Import, and complete Reset Save
- Large-number formatting through K/M/B/T/Qa/Qi/Sx and scientific notation fallback

## Save data and migration

The full game is a single JSON-serializable save object. Version 4 stores progression source data but omits recalculable combat values such as Guardian DPS, Lutie TAP, Stone power, and monster max HP. These values are always rehydrated from the current `balance.js` and `data.js`, so balance changes apply to old saves immediately. Version 1, 2, and 3 saves migrate without intentionally deleting Gold, Stage, Lutie level, Guardian level/discovery/reincarnation/Stone data, or boss retry/farming progress.

`game.js` and `ui.js` never access browser storage directly. They use the adapter boundary in `storage.js`:

```text
saveGame(state)
loadGame()
resetGame()
```

JSON Export/Import is supported in the Settings tab. Imports are parsed and structurally validated before replacing the current state; invalid input leaves the active save untouched.

Browser storage is local to each origin, browser, and device. A `file://` save on a PC and the GitHub Pages save on a phone do not synchronize automatically; use JSON Export/Import to move progress manually.

Guardian cards are created only when their roster structure changes. Combat ticks and upgrades patch the live Level, DPS, Gold, Mana Stone, and purchase-cost fields in place, preserving Guardian scroll position, button focus, and an open Mana Stone picker while combat continues.

The collapsed Developer Info area includes **Force Nazar** and **+100K Gold** controls. Force Nazar is available only while farming and does not bypass normal reward or escalation rules. The Gold control adds exactly 100,000 through the normal game-state and storage boundary for Guardian UI testing.

## GitHub Pages

`.github/workflows/deploy-pages.yml` deploys this build-free static project whenever `main` is pushed and also supports manual runs. In the GitHub repository, select **Settings → Pages → Build and deployment → Source: GitHub Actions** once. The workflow then publishes the repository root using relative asset paths, so both the GitHub Pages project subpath and direct `file://` play remain supported.

The mobile layout uses the dynamic viewport height, allows the game shell to shrink below 650px, keeps the bottom navigation inside the viewport, and gives the Developer test controls larger touch targets.

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

The smoke suite retains prior coverage and adds deterministic checks for normalized Guardian DPS, preservation of saved Guardian levels, bounded and centered normal-monster Gold variance, stable Guardian rendering during combat, Mana Stone ownership, upgrade costs, Developer actions, derived-stat rehydration, Nazar behavior, Pages-safe relative paths, the Pages workflow, and v1/v2/v3→v4 migration.

Nazar appearance rates and all other unverified balance constants remain temporary tuning values rather than verified original values.

# Lutie-like RPG Clicker v0.1.1

A small, offline-first browser prototype that recreates the feel of a click → grow → auto-attack RPG loop using original CSS shapes and placeholder art only.

> All balance numbers in this project are **temporary reconstruction values, not verified original game values**.

## Run

Double-click `index.html`, or open it directly in any modern browser. No server, install, build step, account, or network connection is required. (The optional web font gracefully falls back to the system font while offline.)

## Core loop

- Tap the arena or monster, or press Space/Z/X/Enter, to deal Lutie's TAP damage.
- A base 1 DPS auto-attack runs from the beginning; unlocked Guardian DPS is added to it.
- Defeated monsters award gold; every 10 normal monsters advances the stage.
- Every fifth stage is a 30-second boss fight. Failure returns to the previous stage for repeatable farming until **Challenge Boss** is selected.
- The Stage 5 boss unlocks Ember, the first Guardian. Ember attacks once per second using its current DPS.
- Defeating the Stage 10 boss displays the v0.1 Clear milestone, then play continues.
- Spend gold in the lower panels to upgrade Lutie and the unlocked Guardian by x1, up to x10, or the affordable MAX.

## Files

- `balance.js` — every formula and tuning constant
- `game.js` — serializable game state, combat, monster creation, upgrades, and progression
- `ui.js` — DOM rendering, input binding, number formatting, and damage popups
- `storage.js` — persistence interface and `LocalStorageAdapter`
- `styles.css` — mobile-first presentation and CSS-only artwork

Scripts use browser globals instead of ES module imports so the game works when opened directly through `file://`. The game and UI never call `localStorage` directly. `game.js` receives an adapter exposing `saveGame(state)`, `loadGame()`, and `resetGame()`, so a future Supabase or Firebase adapter can replace local storage without changing combat or UI logic.

## Save data

The entire save is one JSON-serializable object with a `saveVersion`, timestamp, currency, stage state, Lutie data, Guardian array, boss deadline, retry/farming progression flags, and current monster. State changes save automatically. **Reset Save** asks for confirmation before replacing all progress with a fresh initial state.

## Balance tuning

Edit formulas and constants only in `balance.js`. Values are kept as full JavaScript numbers internally; `formatNumber` abbreviates large values only for display (`1K`, `1M`, `1B`, `1T`).

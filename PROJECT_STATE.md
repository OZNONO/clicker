# LUTIE CLICKER v0.3

Personal prototype reconstructed from memories of a discontinued game. Current implementation rules below are intentional; numerical formulas are not claims about the original game. Vanilla scripts load in order: balance → data → storage → game → UI. No build, external assets, audio, PWA or cloud save.

## Confirmed / intended current rules

- Combat always stays above the five tabs: LUTIE / GUARDIAN / MANA STONE / STAR / SETTINGS.
- Ordinary stages (last digit 1–4 or 6–9): nine normal monsters, then a `stageBoss` gate. Only defeating the gate advances the stage. Mimics are interruptions, not progression kills.
- Stages ending in 5: `guardian` encounters. Stages ending in 0: `regionBoss`. The six runtime enemy types are `normal`, `stageBoss`, `guardian`, `regionBoss`, `mimic`, `nazar`.
- Timed failures use one progression record: `pendingBossStage`, `pendingEncounterType`, optional `pendingGuardianId`, `bossRetryAvailable`, `farmingBeforeBoss`. Normal gates camp at the same stage; special encounters farm at the previous stage. Stage 1 stays at 1. Retry directly restores the exact gate with full HP/timer. Farming never automatically retries.
- Camping repeats normal monsters for Gold. Nazar can appear there when automatic DPS is at least half normal monster HP. Nazar gives **zero Gold, stones, other rewards and progression**. Hidden HP remains `??? / ???`. Mimic behavior and exclusive stone equipment remain supported.
- All real Gold rewards use `addGold` → `awardGold`, including duplicate Guardians. Offline batched awards use the same capacity helper after calculating the Gold artifact multiplier once. Full capacity discards excess rewards; it does not stop progression.
- ALL +1 / +10 upgrades every Guardian acquired **in this run** (`activeThisRun`), matching individual upgrade eligibility. Discovered but not yet reacquired Guardians are excluded. Sum every sequential level cost; insufficient funds change nothing. Equipment, stones and permanent bonuses remain intact. ALL MAX is intentionally absent.
- Guardian upgrade economics no longer depend on fixed Guardian ID / `unlockOrder`. Acquisition order is only for UI sorting; metadata still breaks stable UI ties.
- A newly dropped stone's level equals its relevant drop stage. Region Boss guaranteed drops and Mimic drops both create the stone before advancing. Existing rarity and equipment effects remain: multiplier `1 + min(stone.level, currentStage) × rarityPower`. Owned higher-level stones are not destroyed on returning to a lower stage.
- Reincarnation requires Lutie Lv200. Gold, stage, kills, Lutie/Guardian levels, active Guardian roster, cooldown and camping reset. Stars and TAP/DPS/GOLD artifact levels persist. Discovery/order persists; active Guardians gain +1 permanent reincarnation level. Only Legendary stones and their equipment persist, as before. `lifetime.totalReincarnations` persists and unlocks natural Balloon.

## Temporary reconstruction choices

### Normal gates / economy

- Normal Stage Boss HP = normal monster HP × 3; timer = 30s, isolated as `NORMAL_STAGE_BOSS_HP_MULTIPLIER` and `NORMAL_STAGE_BOSS_TIME_LIMIT_MS`.
- Bag starts at Lv1 with 10,000 Gold capacity. `capacity(L) = 10000 × 2^(L−1)`, bounded by finite JS maximum. `upgradeCost(L) = floor(capacity(L) × 0.5)`. A full bag can always buy its next upgrade; disable upgrade once finite capacity cannot increase.
- Bag level **persists through reincarnation**, controlled only by `BAG_PERSISTS_REINCARNATION`. This prevents repeated bag purchases becoming an early re-climb obstacle. Original permanence is unknown.
- Developer +100K Gold explicitly bypasses capacity. Normal awards never add to over-cap Gold or destroy it. Loading/importing any over-cap balance grants enough Bag levels to fit it, including developer saves; this intentional data-preservation policy is not a production reward.
- Existing base automatic DPS = 1 stays. Guardian DPS and TAP formulas stay unchanged. Upgrade cost growth is reduced: Lutie 1.12 → 1.09, Guardian 1.13 → 1.07; Guardian order multiplier is removed. All factors live in `balance.js`.
- Ten Lv1 Guardians contribute 20 DPS, not ten copies of a previously upgraded Guardian. Higher roster output still requires paying for each member. No invented group passives, diminishing returns or original skills are added. Early TAP remains an input-dependent source of damage; Guardian levels improve sustained farming. Long-session fun and final economy balance are **not validated**.

### Offline prototype

`applyOfflineProgress` uses `lastSavedAt` (milliseconds from the injected clock), written only after a successful adapter save. No timestamp means no retroactive rewards. The adapter's display `updatedAt` is not used as the authoritative clock.

1. `elapsed = max(0, now − lastSavedAt)`. Process at most seven days; display excluded time. Checkpoints never move backwards during normal saves, so clock rollback cannot reopen a paid interval.
2. Automatic DPS is base automatic DPS plus active Guardian DPS, including existing equipment/permanent bonuses. **No TAP or skills**. Use continuous `remainingHP / currentDPS` seconds per encounter, recalculate DPS after stage/roster changes, carry partial HP. This intentionally approximates the live discrete 1-second attacks.
3. Complete an affordable encounter, consume its duration, and reuse live defeat/progression/reward rules. Normal Gold uses its base value before the artifact multiplier (omits integer random variance). No per-second/tick loop. Hard safety bound: 10,000 completed/failed encounters; excluded remainder is shown if reached. Nonfinite combat arithmetic also ends settlement safely.
4. A boss must die within its **remaining** saved timer. Otherwise consume the remaining timer, use the shared failure transition, and batch the rest as farming. If offline time ends first, preserve partial HP and remaining timer. Already-camping saves continue camping until manual retry.
5. Farming uses current normal HP/Gold/DPS: complete the current partial monster first, then `floor(remainingDamage / fullHP)` more, and retain residual HP. Award the aggregated Gold once with capacity accounting. No random farming encounters.
6. Offline Guardian victories recruit the pending Guardian. For newly reached encounters choose the first not encountered this run deterministically (then first definition if all seen); no random rolls. Existing duplicate rewards still apply. Region Boss victories grant a guaranteed **Normal** stone at the defeated stage; no random High upgrade.
7. **Excluded:** Mimic and Nazar spawns and loot, normal Gold variance, random Guardian selection, random Region stone rarity, and Balloon. An already saved Mimic/Nazar is replaced by the underlying normal/gate encounter without loot or progression credit. Nazar escalation history is not incremented by offline processing.
8. Suppress intermediate events/writes; save the settled result and new checkpoint together before showing the summary. Reloading the same checkpoint grants nothing. JSON import deliberately starts a fresh checkpoint and pays **no offline rewards**, preventing repeated import claims. Dev +1H OFFLINE calls the same algorithm explicitly and is repeatable for testing.

The UI displays time away, stages actually advanced, credited Gold, capacity loss, final stage and excluded time in a collapsible LUTIE panel. Hidden tabs stop active timers and resume through the same settlement path when visible.

### Balloon

- Natural activation: only immediately after a live Region Boss victory with `totalReincarnations >= 1`; injected RNG `< 0.05` (**5%**).
- `Balance.balloonDestination(clearedStage) = clearedStage + 1 + 10`. Example: clear 10 → ordinary destination 11 → Balloon destination **21**, skipping stages **11–20**.
- No skipped Guardians, Gold, stones or boss rewards. The actually defeated Region Boss still gives its ordinary reward. Arrival updates reached-stage/highest-stage records, which also feed the existing reincarnation Star preview; intermediate encounters are never marked defeated.
- FORCE BALLOON is developer-only: skip current stage +10, bypassing unlock/clear conditions, clear any camping target, and grant no loot. Text feedback appears over the tab area without covering combat.

### Questions still requiring original-game evidence

- Normal Stage Boss exact HP/timer and failure location.
- Offline duration limits, acquisition selection, continuous vs discrete damage and reward details.
- Bag formulas/permanence and Balloon probability/skip semantics.
- Whether a stone's actual equipment effect depended on Guardian level. v0.3 does **not** invent this formula; it retains the existing stage-capped effect.

## Save version 5

New source fields: `bagLevel`, `lastSavedAt`; reuse existing reincarnation and typed camping state. Save enemy type/current HP, not max HP; costs, capacity, TAP, DPS and stone power remain derived.

v1–v4 migrations remain supported. Preserve Gold, progression, Guardian level/discovery/order, stones/equipment, Stars, artifacts and permanent bonuses wherever those existed. Grant the smallest sufficient Bag level for existing Gold; never clamp old wealth away. Old saves without `lastSavedAt` establish a fresh checkpoint. Legacy ordinary stages with nine kills resume at a full-health Stage Boss. New partial boss HP/timer survives roundtrip; stored deadlines are reanchored after offline settlement.

## Nazar UI diagnosis

The icon existed and had the correct active flag but its absolute position below HP overlapped the farming banner. The banner's z-index 7 covered the HP wrapper's z-index 2, including the Challenge button over the icon center at 375×667. A browser `elementFromPoint` regression failed before the fix. The indicator now occupies a normal-flow row in the HP block, and the banner/monster are moved below it. Inactive/active/forced-present states remain distinct across rerenders.

## Balance comparison (no bonuses)

TAP and single-Guardian DPS are identical before/after. Old Guardian costs below use Guardian 01; other IDs previously multiplied the pre-floor cost by `1 + (unlockOrder−1)×0.25` (Guardian 10: ×3.25).

| Level | TAP before = after | Lutie cost before → after | Guardian DPS before = after | G01 cost before → all Guardians after |
|---:|---:|---:|---:|---:|
| 1 | 1 | 10 → 10 | 2 | 25 → 25 |
| 10 | 19 | 27 → 21 | 37 | 75 → 45 |
| 25 | 158 | 151 → 79 | 156 | 469 → 126 |
| 50 | 2,171 | 2,580 → 682 | 741 | 9,972 → 688 |
| 100 | 203,681 | 745,734 → 50,725 | 8,287 | 4,494,753 → 20,273 |
| 200 | 896,101,774 | 62,285,436,357 → 280,461,395 | 517,002 | 913,167,112,051 → 17,591,860 |

The old cost growth outpaced the underlying exponential damage growth by 4 percentage points for Lutie and 9.5 for Guardians, before considering the level factor. Reduced cost growth narrows this gap without increasing already substantial high-level TAP or multiplying Guardian DPS. Permanent bonuses remain linear multipliers on the existing formulas.

## Verification

- `node --test tests/smoke.test.cjs tests/progression.test.cjs`
- `node tests/browser.test.cjs` with Playwright resolvable through `NODE_PATH`; uses installed Edge by default (`BROWSER_CHANNEL=chrome` supported). No runtime/build dependency is added to the game.
- Syntax: `node --check` each root `.js` and `tests/*.cjs`.
- Browser coverage: 320×568, 375×667, 430×932, 1280×900; real clicks for Bag, ALL, picker, Give Up/retry; retained Guardian DOM/scroll; visible Nazar; offline summary, feedback, bottom nav and horizontal overflow; `file://` and project-prefix HTTP boot.
- `.github/workflows/deploy-pages.yml` remains unchanged: main push deploys Pages. This task does not push.

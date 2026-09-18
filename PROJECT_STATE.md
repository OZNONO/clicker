# LUTIE CLICKER v0.3.1

Personal prototype reconstructed from memories of a discontinued game. Current implementation rules below are intentional; numerical formulas are not claims about the original game. Vanilla scripts load in order: balance → data → storage → game → i18n → UI. No build, external assets, audio, PWA or cloud save.

## Confirmed / intended current rules

- Combat always stays above the five tabs: LUTIE / GUARDIAN / MANA STONE / STAR / SETTINGS.
- Ordinary stages (last digit 1–4 or 6–9): nine normal monsters, then a `stageBoss` gate. Only defeating the gate advances the stage. Mimics are interruptions, not progression kills.
- Stages ending in 5: immediate `guardian` encounters. Stages ending in 0: nine normal monsters followed by the tenth `regionBoss`. The counter displays the current enemy ordinal (1–9), not completed kills; bosses show 10/10. The six runtime enemy types are `normal`, `stageBoss`, `guardian`, `regionBoss`, `mimic`, `nazar`.
- Timed failures use one progression record: `pendingBossStage`, `pendingEncounterType`, optional `pendingGuardianId`, `bossRetryAvailable`, `farmingBeforeBoss`. Normal gates camp at the same stage. Region Boss timeout/Give Up farms the same Region stage at a fixed ninth normal slot (`killsInStage = 8`); Challenge goes straight to its tenth Region Boss. Guardian failures retain previous-stage farming. Balloon failures are the separate rollback exception described below. Stage 1 stays at 1. Retry directly restores the exact gate with full HP/timer. Farming never automatically retries.
- Camping repeats normal monsters for Gold. Nazar can appear there when automatic DPS is at least half normal monster HP. Nazar gives **zero Gold, stones, other rewards and progression**. Hidden HP remains `??? / ???`, and Nazar visual HP fill is always 100%, without a transition. Internal HP still receives TAP and fractional automatic damage normally. All other HP bars show the real ratio. Mimic behavior and exclusive stone equipment remain supported.
- All real Gold rewards use `addGold` → `awardGold`, including duplicate Guardians. Offline batched awards use the same capacity helper after calculating the Gold artifact multiplier once. Full capacity discards excess rewards; it does not stop progression.
- ALL +1 / +10 upgrades every Guardian acquired **in this run** (`activeThisRun`), matching individual upgrade eligibility. Discovered but not yet reacquired Guardians are excluded. Sum every sequential level cost; insufficient funds change nothing. Equipment, stones and permanent bonuses remain intact. ALL MAX is intentionally absent.
- Guardian upgrade economics no longer depend on fixed Guardian ID / `unlockOrder`. Acquisition order is only for UI sorting; metadata still breaks stable UI ties.
- A newly dropped stone's level equals its relevant drop stage. Region Boss guaranteed drops and Mimic drops both create the stone before advancing. Existing rarity and equipment effects remain: multiplier `1 + min(stone.level, currentStage) × rarityPower`. Owned higher-level stones are not destroyed on returning to a lower stage.
- Reincarnation requires Lutie Lv200. Gold, stage, kills, Lutie/Guardian levels, active Guardian roster, cooldown and camping reset. Stars and TAP/DPS/GOLD artifact levels persist. Discovery/order persists; active Guardians gain +1 permanent reincarnation level. Only Legendary stones and their equipment persist, as before. `lifetime.totalReincarnations` persists and unlocks natural Balloon.

## Temporary reconstruction choices

### Normal gates / economy

- Normal Stage Boss HP = normal monster HP × 3; timer = 30s, isolated as `NORMAL_STAGE_BOSS_HP_MULTIPLIER` and `NORMAL_STAGE_BOSS_TIME_LIMIT_MS`.
- Bag starts at Lv1 with 10,000 Gold capacity. Capacity table Lv1–10: **10,000; 30,000; 120,000; 400,000; 1,000,000; 3,000,000; 10,000,000; 30,000,000; 100,000,000; 300,000,000**. After Lv10: `300000000 × 3^(L−10)`, bounded by finite JS maximum. `upgradeCost(L) = floor(capacity(L) × 0.5)`. A full bag can always buy its next upgrade; disable upgrade once finite capacity cannot increase.
- Bag level **persists through reincarnation**, controlled only by `BAG_PERSISTS_REINCARNATION`. This prevents repeated bag purchases becoming an early re-climb obstacle. Original permanence is unknown.
- Developer +100K Gold explicitly bypasses capacity. Normal awards never add to over-cap Gold or destroy it. Loading/importing any over-cap balance grants enough Bag levels to fit it, including developer saves; this intentional data-preservation policy is not a production reward.
- Existing base automatic DPS = 1 stays. Guardian DPS and TAP formulas stay unchanged. The v0.3 cost-growth changes remain: Lutie 1.09, Guardian 1.07, with no Guardian order multiplier. v0.3.1 changes none of the monster HP/Gold, TAP, Guardian DPS, Lutie/Guardian upgrade-cost growth, Mana Stone effects or permanent-bonus formulas. All factors live in `balance.js`.
- Ten Lv1 Guardians contribute 20 DPS, not ten copies of a previously upgraded Guardian. Higher roster output still requires paying for each member. No invented group passives, diminishing returns or original skills are added. Early TAP remains an input-dependent source of damage; Guardian levels improve sustained farming. Long-session fun and final economy balance are **not validated**.

### Offline prototype

`applyOfflineProgress` uses `lastSavedAt` (milliseconds from the injected clock), written only after a successful adapter save. No timestamp means no retroactive rewards. The adapter's display `updatedAt` is not used as the authoritative clock.

1. `elapsed = max(0, now − lastSavedAt)`. Process at most seven days; display excluded time. Checkpoints never move backwards during normal saves, so clock rollback cannot reopen a paid interval.
2. Automatic DPS is base automatic DPS plus active Guardian DPS, including existing equipment/permanent bonuses. **No TAP or skills**. Use continuous `remainingHP / currentDPS` seconds per encounter, recalculate DPS after stage/roster changes, carry partial HP. The settlement algorithm is unchanged in v0.3.1; it shares the updated Region/Balloon success/failure transitions.
3. Complete an affordable encounter, consume its duration, and reuse live defeat/progression/reward rules. Normal Gold uses its base value before the artifact multiplier (omits integer random variance). No per-second/tick loop. Hard safety bound: 10,000 completed/failed encounters; excluded remainder is shown if reached. Nonfinite combat arithmetic also ends settlement safely.
4. A boss must die within its **remaining** saved timer. Otherwise consume the remaining timer, use the shared failure transition, and batch the rest as farming. If offline time ends first, preserve partial HP and remaining timer. Already-camping saves continue camping until manual retry.
5. Farming uses current normal HP/Gold/DPS: complete the current partial monster first, then `floor(remainingDamage / fullHP)` more, and retain residual HP. Award the aggregated Gold once with capacity accounting. No random farming encounters.
6. Offline Guardian victories recruit the pending Guardian. For newly reached encounters choose the first not encountered this run deterministically (then first definition if all seen); no random rolls. Existing duplicate rewards still apply. Region Boss victories grant a guaranteed **Normal** stone at the defeated stage; no random High upgrade.
7. **Excluded:** Mimic and Nazar spawns and loot, normal Gold variance, random Guardian selection, random Region stone rarity, and new Balloon triggers. A saved active Balloon challenge is resolved as its existing timed Region Boss: success awards its target stone and skipped Guardian; failure restores its return encounter and processes remaining time there. An already saved Mimic/Nazar is replaced by the underlying normal/gate encounter without loot or progression credit. Nazar escalation history is not incremented by offline processing.
8. Suppress intermediate events/writes; save the settled result and new checkpoint together before showing the summary. Reloading the same checkpoint grants nothing. JSON import deliberately starts a fresh checkpoint and pays **no offline rewards**, preventing repeated import claims. Dev +1H OFFLINE calls the same algorithm explicitly and is repeatable for testing.

The UI displays time away, stages actually advanced, credited Gold, capacity loss, final stage and excluded time in a collapsible LUTIE panel. Hidden tabs stop active timers and resume through the same settlement path when visible.

### Balloon challenge

- Natural activation remains after a live Region Boss victory, with totalReincarnations >= 1 and injected RNG < 0.05 (5%).
- The destination helper now returns clearedStage + 10. Clear 10 → immediately challenge **Stage 20 Region Boss at slot 10/10**, with return point Stage 11 normal slot one. The target's first nine monsters are omitted.
- Success gives that actually defeated target's normal Gold and guaranteed Mana Stone exactly once. For each skipped Guardian stage (15 in this example), randomly acquire one Guardian not active this run using the existing injected selection/recruitment logic, and record it in the run encounter history. If all ten are already active, no duplicate Gold or invented Guardian reward is granted.
- No Gold, normal-monster or Stage Boss rewards for skipped stages 11–19. Continue at Stage 21 and roll the natural 5% trigger again, so consecutive challenges are possible.
- Timeout/Give Up restores the return encounter, without target rewards or target-stage farming. The previously earned Stage 10 rewards stay. Upgrades/equipment changes made during the challenge stay; rollback affects only the interrupted combat/progression snapshot. Highest-stage records are updated only after challenge victory.
- A saved challenge resumes its target HP/timer and rollback state; imports still grant no offline time. Offline can finish an existing challenge with deterministic Guardian selection, but never starts a new one.
- FORCE BALLOON challenges the next strictly higher multiple-of-ten Region Boss from the current position (e.g. Stage 11 → 20, Stage 10 → 20). It bypasses the unlock/trigger requirement, preserves the exact interrupted encounter for failure, and cannot nest another challenge. It gives nothing on activation.
- Separate Region CLEAR/milestone dialogs are removed, including for old saves with uncleared notice flags. Stone, Guardian acquisition and Balloon feedback remain.

### Live DPS, formatting and localization

- The scheduled automatic tick runs every 100ms and measures injected-clock elapsed time. Damage equals current automatic DPS × elapsed seconds, retaining fractional HP and spending time across enemy deaths instead of discarding overkill. DPS-changing actions settle preceding elapsed time before applying the change.
- Boss expiry and attacks use the same elapsed settlement: damage before the deadline may kill the boss; otherwise timeout follows. Automatic floating damage text is accumulated and emitted about once per 1,000ms; 100ms HP rendering is separate and does not rebuild Guardian cards.
- Gaps above 2,000ms (suspension/throttling) go through the existing bounded offline settlement exactly once. Visibility hide flushes live time and stops timers; show reloads the saved checkpoint and settles offline time, without double application. The old manual autoAttack helper remains a one-second damage action for deterministic/dev tests; production scheduling uses automaticTick.
- All Gold balances, capacity, Bag/Guardian/Lutie costs and offline Gold totals use the exact grouped currency formatter, without K/M/B or scientific notation. Combat TAP/DPS/HP/damage still uses the compact formatter. Currency is the existing JavaScript Number economy; formatting does not invent integer precision beyond Number's limits.
- Settings offers English (default) and 한국어. i18n.js holds centralized message templates, Korean translations, parameter interpolation and static data-i18n/ARIA translation. UI rendering calls the same translator; no per-element Korean/English conditionals or external library. Language saves through LocalStorageAdapter and does not change calculations.
- Translation covers combat/counters, tabs, upgrades, Bag, Balloon/offline/status feedback, farming/retry/Give Up, save/import/export/reset, developer tools, artifacts, rarity/group labels and the Mana Stone picker. Placeholder character/monster/skill proper names may remain unchanged. The catalog can accept later tutorial/story templates.

### Questions still requiring original-game evidence

- Normal Stage Boss exact HP/timer and failure location.
- Offline duration limits, acquisition selection, continuous vs discrete damage and reward details.
- Bag formulas/permanence and Balloon probability/skip semantics.
- Whether a stone's actual equipment effect depended on Guardian level. v0.3 does **not** invent this formula; it retains the existing stage-capped effect.

## Save version 6

v0.3.1 adds the authoritative nullable `balloonChallenge` with `targetStage` and a `resume` snapshot (stage, kill slot, source enemy HP/type/Guardian ID, pending progression, remaining timer and Nazar escalation). The version bump is needed so an in-flight leap can resume or fail safely. Language is persisted as `settings.language`, default `en`; invalid values normalize to English. Existing `bagLevel`, `lastSavedAt`, reincarnation and typed camping state remain. Save enemy type/current HP, not max HP; costs, capacity, TAP, DPS and stone power remain derived.

v1–v5 migrations remain supported. Preserve Gold, progression, Guardian level/discovery/order, stones/equipment, Stars, artifacts and permanent bonuses wherever those existed. Grant the smallest sufficient Bag level for existing Gold; never clamp old wealth away. Old saves without `lastSavedAt` establish a fresh checkpoint. Legacy ordinary stages with nine kills resume at a full-health Stage Boss. New partial boss HP/timer survives roundtrip; stored deadlines are reanchored after offline settlement. Existing active Region Bosses retain their boss/HP state and become slot ten; old previous-stage Region farming moves to the target Region at slot nine. Existing Bag levels are kept under the increased capacity curve. Active Balloon targets do not inflate highest-stage/Star eligibility before victory.

## Nazar UI diagnosis

The icon existed and had the correct active flag but its absolute position below HP overlapped the farming banner. The banner's z-index 7 covered the HP wrapper's z-index 2, including the Challenge button over the icon center at 375×667. A browser `elementFromPoint` regression failed before the fix. The indicator now occupies a normal-flow row in the HP block, and the banner/monster are moved below it. Inactive/active/forced-present states remain distinct across rerenders.

## Historical v0.2.4 → v0.3 balance comparison (unchanged in v0.3.1)

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
- Browser coverage: 320×568, 375×667, 430×932, 1280×900 plus Korean/exact-currency checks at 320/430px; real clicks for Bag, ALL, picker, Give Up/retry; retained Guardian DOM/scroll; visible Nazar; offline summary, feedback, bottom nav and horizontal overflow; `file://` and project-prefix HTTP boot.
- `.github/workflows/deploy-pages.yml` remains unchanged: main push deploys Pages. This task does not push.

## Future notes — not implemented or verified original rules

- “Camping” is this project's convenient term, not a confirmed original-game term.
- Memory suggests each ten stages formed one region/content set with its own background, monster concept, boss and Guardian.
- Roughly thirty regions / stages 1–300 may have had distinct content; stages 301 onward may have repeated content every approximately 300 stages.
- Exact structure is unverified, so no thirty-region/content-loop system is implemented here.
- Tutorial/story and an eventual original-IP direction remain future possibilities.
- The relationship between Mana Stone effects and Guardian level remains uncertain; retain the current effect formula until evidence exists.

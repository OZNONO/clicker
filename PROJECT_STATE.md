# LUTIE CLICKER v0.4.1

Personal Vanilla HTML/CSS/JS prototype reconstructed from surviving material and memories of a discontinued game. It runs through `file://` and as a GitHub Pages project site. Scripts load in order: balance → data → storage → game → i18n → UI. Rules marked temporary are implementation policy, not claims about the original game.

v0.4 is the **Guardian progression and early balance pass**. v0.4.1 fixes DPS-only ninth-normal kills so the newly created boss intro consumes elapsed time before any combat deadline, damage or timeout evaluation. It preserves v0.3.2 combat feedback, progression systems, offline settlement, Balloon semantics, storage adapter, localization structure and derived-state approach.

## Confirmed or explicitly requested v0.4 rules

### Stage and Guardian progression

- Every Stage has nine normal progression kills followed by a tenth boss. Mimic and Nazar remain interruptions.
- A 10-Stage block is one Region. Stages not divisible by 5 use `stageBoss`; Stages ending in 5 use `guardian`; Stages ending in 0 retain internal type `regionBoss` and Region-final mechanics.
- The fifth-Stage and tenth-Stage bosses in one Region use the **same assigned Guardian**: Stage 5/10 share Region 1's Guardian; Stage 15/20 share Region 2's.
- A first Guardian victory acquires that Guardian at Lv1. Repeated victories are idempotent: Stage 10 does not reacquire it or grant a duplicate acquisition reward.
- Region-final Guardian keeps the 30-second timer, same-Stage ninth-normal farming after failure, direct Challenge Boss retry, guaranteed Mana Stone and Balloon eligibility.
- Stage 5 Guardian failure now follows the same timed-gate rule: same Stage, ninth-normal farming, then direct retry of the same Guardian.
- Runtime types remain `normal`, `stageBoss`, `guardian`, `regionBoss`, `mimic`, `nazar` for compatibility.

### Region assignment and roster

- `regionGuardians` is authoritative saved state keyed by one-based Region. `ensureRegionGuardianFor` is the assignment seam shared by live progression, retry, migration, offline settlement and Balloon.
- The temporary prototype policy randomly chooses from Guardians not active this run when possible; after roster exhaustion it chooses from the full regular pool. Live selection uses injected RNG; migration/offline missing assignments use deterministic selection. **This is not asserted as the original formula.**
- Once assigned, a Region Guardian does not change across Stage 5/10, save/load, retry, offline settlement or Balloon.
- The regular data roster has stable IDs `guardian-01` through `guardian-31`: 아르, 아리엘, 아이멜, 안테아, 에단, 에밀리, 엘라임, 오르페오, 올리비에, 가이아, 도로시, 라엘, 브린힐트, 파라켈, 필리아, 티타니아, 일레노아, 제라드, 라이언, 레이너, 로렌스, 로이드, 루시드, 루시퍼, 리리엘, 세실리, 셀리온, 소냐, 스텔라, 시그룬, 실피드.
- `UNCLASSIFIED` is a neutral compatibility group, not recovered original race/group data. The common Guardian DPS formula/base value remains a temporary prototype; no individual coefficients or skills were invented.

### Early balance

- Lutie base TAP is `level`. Existing Artifact/permanent multipliers still apply afterward.
- At current level N and target L=N+1, Lutie cost is `L × ceil(L / 100)`. +10 sums exactly ten sequential costs and stays all-or-nothing; MAX uses the same formula.
- Guardian current level N costs `2 × N` to reach N+1. Individual and ALL +1/+10 sum exact sequential costs and stay all-or-nothing. Guardian DPS is unchanged.
- Bag Lv1 capacity is 5,000. Lv2+ remains 30,000; 120,000; 400,000; 1,000,000; 3,000,000; 10,000,000; 30,000,000; 100,000,000; 300,000,000, then the existing ×3 extension. Upgrade cost and reincarnation persistence are unchanged.
- Loading an over-cap legacy balance raises Bag level to the smallest capacity that preserves the Gold. Gold is never clamped or deleted. Developer +100K remains the explicit bypass.
- Monster HP, all boss HP, normal/boss Gold, Guardian DPS, Mana Stone effects and reward timing are unchanged.

## Boss introduction state

- Killing the ninth normal creates the boss immediately but sets authoritative `bossIntro`: ordinary bosses show a short WARNING; Guardian and Region-final bosses show WARNING plus a data-driven name cut-in.
- TAP, keyboard and automatic DPS cannot damage during `bossIntro`. The 30-second timer stays null and starts only after transition time is consumed.
- DOM animation completion is not authoritative. Live/offline elapsed time consumes saved intro duration; game-state progression never waits for an animation callback.
- The live automatic-DPS loop checks `bossIntro` inside every encounter transition iteration. If that same tick creates a boss, its remaining elapsed time advances only the intro; a null combat timer is never converted into a deadline.
- Intro remaining milliseconds persist and deadlines reanchor on load. Typed failure, Balloon rollback, reset and reincarnation clear or restore it safely, avoiding stale callbacks during rapid changes/reload.
- v0.3.2 idle wrapper, hit visual, death ghost, spawn animation, 100ms elapsed DPS and approximately one-second DPS popup remain separate and unchanged.

## Balloon integration

- Natural Balloon remains a 5% injected-RNG opportunity after a live Region-final victory once reincarnation unlocks it. Offline never starts a new Balloon.
- Clear Stage 10 → target Stage 20 Region-final. Success → Stage 21; failure/Give Up → the original Stage 11 encounter. Skipped normal/Stage Boss Gold is not awarded.
- The target uses Region 2's assignment, also used by Stage 15. If unacquired, Stage 20 acquires it once at Lv1. There is no separate “skipped Guardian” selection.
- Success retains exactly one target Gold/Mana Stone reward. Failure restores the precise combat snapshot. A forced Balloon interrupting WARNING/cut-in also restores intro duration without starting the original timer.
- Active target HP/timer/intro, rollback destination and assignment survive save/load and export/import.

## Existing systems intentionally preserved

- Normal/Stage Boss/Guardian/Region-final HP and Gold formulas; Mimic and Mana Stone behavior.
- Nazar internal damage, `??? / ???`, fixed 100% visual bar, zero rewards/progression.
- Bag progression beyond Lv1, exact Gold formatting and actual-credited-Gold popup.
- Z/X/Space and tap attacks, focus release and Space double-activation guard.
- 100ms elapsed automatic damage, one-second feedback, bounded offline catch-up.
- Korean/English i18n; reincarnation, Stars, Artifacts, equipment/permanent bonuses.
- JSON export/import, Pages project-prefix paths and mobile layouts.

## Offline settlement

`applyOfflineProgress` still uses injected time and persisted `lastSavedAt`, capped at seven days and 10,000 transitions. It applies automatic DPS only, carries fractional HP/overkill, shares live rewards/capacity/failure rules, suppresses random Mimic/Nazar/Balloon generation, and writes once. Active intro time is consumed before boss damage or timer. Missing assignments are deterministic and then persisted. Import establishes a fresh checkpoint and cannot replay offline rewards.

## Save version 7

v0.4 adds authoritative `regionGuardians` and `bossIntro`; `saveVersion` is 7. Balloon resume snapshots can also hold `bossIntro`.

- v1–v6 remain accepted. Existing Gold, Bag, Lutie level, Stage, G01–G10 state/levels/order/equipment, Mana Stones, Stars, reincarnation, Artifacts, Balloon and partial HP/timer are preserved where present.
- Static names/group/base DPS and derived TAP/DPS/cost/capacity/max HP rehydrate from definitions.
- Gold above the new 5,000 Lv1 cap increases Bag level rather than losing Gold.
- A missing current-Region assignment is created once; a valid current Guardian/Boss identity is preferred and recorded.
- Old v6 immediate Guardian encounters normalize safely to the new tenth slot. Deadlines reanchor across sessions.

## Evidence and research notes

1. Lutie Lv1–100 linear upgrade costs are confirmed by video.
2. The 101+ 100-level multiplier structure is based on user memory and needs more verification.
3. Guardian upgrade cost `2 × current level` matches several observed video levels.
4. Guardians are observed at Lv1 immediately after acquisition.
5. The same Region Guardian at Stage 5 and Stage 10 is confirmed by video.
6. A video case has Mana Stone level different from the cleared Stage.
7. No exact 300-Stage Guardian cycle is asserted because “31 regular Guardians” conflicts with “300-Stage cycle” records.

## Future / deferred / research — not implemented in v0.4

- Exact Guardian DPS formulas and per-Guardian coefficients.
- Original Guardian race/group data; unique skills/passives; skill unlock levels/effect values.
- Special Guardians.
- Exact normal monster, Stage Boss and Guardian Boss HP growth.
- Exact normal/boss Gold formulas.
- Exact Mana Stone level roll and High Mana Stone probability.
- The Guardian-level/Mana-Stone-effect relationship hypothesis.
- The 31-Guardian versus “300-stage cycle” conflict; Stage 300+ scaling.
- More high-level Lutie upgrade-formula validation.
- TAP-input stutter/lag diagnosis.
- Second-pass natural Korean translation; Lutie/Guardian/Monster name localization.
- BGM, SFX and normal/Guardian/Region-final BGM state.
- Actual monster/Guardian/background assets and Region-specific content.
- Worldbuilding, story, tutorial, collection/encyclopedia, statistics, achievements, PWA and cloud save.
- Mana Stone distribution remains unchanged pending evidence; the current Stage-equal policy is known not to match every observed case.

## Verification

- Node: `node --test tests/smoke.test.cjs tests/progression.test.cjs`
- Browser: `node tests/browser.test.cjs` with Playwright/installed Edge; 320×568, 375×667, 430×932, 1280×900, Korean 320/430, `file://`, project-prefix HTTP.
- Syntax: `node --check` every root `.js` and `tests/*.cjs`.
- Pages workflow is unchanged. This task does not push.

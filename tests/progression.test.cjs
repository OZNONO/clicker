const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ console, Date, JSON, Math, Map, Set, setInterval: () => 1, clearInterval: () => {} });
context.window = context;
for (const file of ['balance.js', 'data.js', 'storage.js', 'game.js', 'i18n.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
const B = context.Balance;
const clone = value => JSON.parse(JSON.stringify(value));
class MemoryAdapter {
  constructor(seed) { this.data = seed ? clone(seed) : null; this.writes = 0; }
  loadGame() { return clone(this.data); }
  saveGame(state) { this.data = clone(state); this.writes++; return clone(state); }
  resetGame() { this.data = null; }
}
function setup(seed = null, elapsed = 0, random = () => 0.99, adapter = new MemoryAdapter(seed)) {
  let clock = 1_000_000 + elapsed;
  const game = context.LutieGame.createGame(adapter, { now: () => clock, random });
  let summary;
  game.subscribe((state, event) => { if (event.type === 'loaded') summary = clone(event.offlineSummary); });
  game.start();
  return { game, adapter, summary, setClock: value => { clock = value; } };
}
const fresh = () => JSON.parse(setup().game.exportSave());
function active(seed, levels = [1]) {
  levels.forEach((level, i) => Object.assign(seed.guardians[i], { discovered: true, unlocked: true, activeThisRun: true, level, acquisitionOrder: i + 1 }));
  return seed;
}
function timedSeed(type, stage, hp, limit = 30000) {
  const seed = fresh();
  seed.stage = stage;
  seed.killsInStage = ['stageBoss', 'regionBoss'].includes(type) ? 9 : 0;
  seed.monster = { type, hp, guardianId: type === 'guardian' ? 'guardian-01' : null };
  seed.boss = { timeRemainingMs: limit, deadlineAt: 1_000_000 + limit };
  return seed;
}
function farmingSeed() {
  const seed = fresh();
  seed.stage = 10;
  seed.killsInStage = 8;
  seed.progression = { ...seed.progression, farmingBeforeBoss: true, bossRetryAvailable: true, pendingBossStage: 10, pendingEncounterType: 'regionBoss' };
  seed.monster = { type: 'normal', hp: B.monsterBaseHp(10) };
  return seed;
}

test('normal slots 1–9, tenth Stage Boss, boss defeat advances stage', () => {
  const seed = fresh(); seed.lutie.level = 100;
  const { game } = setup(seed);
  for (let n = 0; n < 9; n++) {
    assert.equal(game.getState().monster.type, 'normal');
    assert.equal(game.getState().stage, 1);
    game.attack();
  }
  assert.equal(game.getState().monster.type, 'stageBoss');
  assert.equal(game.getState().killsInStage, 9);
  assert.equal(game.getState().boss.timeRemainingMs, B.constants.NORMAL_STAGE_BOSS_TIME_LIMIT_MS);
  game.attack();
  assert.equal(game.getState().stage, 2);
  assert.equal(game.getState().killsInStage, 0);
});
test('normal gate failure camps same stage and retry goes directly to the gate', () => {
  const { game, adapter } = setup(timedSeed('stageBoss', 4, 40));
  game.bossTimerTick(1_030_000);
  assert.equal(game.getState().stage, 4);
  assert.equal(game.getState().progression.pendingEncounterType, 'stageBoss');
  const restored = setup(null, 0, () => 0.99, adapter).game;
  assert.equal(restored.challengeBoss(), true);
  assert.equal(restored.getState().monster.type, 'stageBoss');
  assert.equal(restored.getState().killsInStage, 9);
  assert.equal(restored.getState().monster.hp, B.normalStageBossHp(4));
});
test('stage-one gate can camp without invalid stage zero', () => {
  const { game } = setup(timedSeed('stageBoss', 1, 30));
  game.giveUpBoss();
  assert.equal(game.getState().stage, 1);
  assert.equal(game.getState().progression.farmingBeforeBoss, true);
});
for (const stage of [5, 15, 25, 10, 20, 30]) test(`special encounter preserved at stage ${stage}`, () => {
  const seed = timedSeed('stageBoss', stage - 1, 1);
  const { game } = setup(seed);
  game.attack();
  assert.equal(game.getState().stage, stage);
  assert.equal(game.getState().monster.type, stage % 10 === 5 ? 'guardian' : 'normal');
});
test('an overdue live attack cannot clear an expired boss', () => {
  const { game, setClock } = setup(timedSeed('stageBoss', 1, 1));
  game.stop();
  setClock(1_030_001);
  assert.equal(game.attack(), false);
  assert.equal(game.getState().progression.farmingBeforeBoss, true);
});
test('same-level Guardian cost ignores unlockOrder and DPS is equal', () => {
  const { game } = setup(active(fresh(), Array(10).fill(25)));
  assert.equal(new Set(game.getState().guardians.map(g => game.getGuardianFinalDps(g))).size, 1);
  assert.equal(new Set(Array.from({ length: 10 }, (_, i) => B.guardianUpgradeCost(25, i + 1))).size, 1);
});
for (const amount of [1, 10]) test(`ALL +${amount} charges exact sequential sum and preserves equipment`, () => {
  const seed = active(fresh(), [2, 5, 9]); seed.gold = 100000;
  seed.guardians[3].discovered = true; // not reacquired this run
  seed.guardians[0].equippedManaStoneId = 'stone';
  seed.manaStones = [{ id: 'stone', level: 1, rarity: 'HIGH', equippedGuardianId: seed.guardians[0].id }];
  const { game } = setup(seed);
  const before = game.getState();
  const expected = [2, 5, 9].reduce((sum, level) => sum + Array.from({ length: amount }, (_, i) => B.guardianUpgradeCost(level + i)).reduce((a, b) => a + b, 0), 0);
  assert.equal(game.getAllGuardianUpgradeQuote(amount).totalCost, expected);
  assert.equal(game.upgradeAllGuardians(amount), true);
  const after = game.getState();
  assert.equal(after.gold, before.gold - expected);
  assert.deepEqual(after.guardians.slice(0, 3).map(g => g.level), [2 + amount, 5 + amount, 9 + amount]);
  assert.equal(after.guardians[3].level, 1);
  assert.deepEqual(after.manaStones, before.manaStones);
  assert.equal(after.guardians[0].equippedManaStoneId, 'stone');
  assert.ok(game.getTotalGuardianDps() > 0);
});
test('insufficient ALL upgrade makes no partial changes', () => {
  const seed = active(fresh(), [1, 2]); seed.gold = 49;
  const { game } = setup(seed);
  const before = game.exportSave();
  assert.equal(game.upgradeAllGuardians(1), false);
  assert.equal(game.exportSave(), before);
  assert.equal(game.upgradeAllGuardians(10), false);
  assert.equal(game.exportSave(), before);
});
test('empty roster, unsupported ALL mode and overflowing cost cannot upgrade', () => {
  const { game } = setup();
  assert.equal(game.upgradeAllGuardians(1), false);
  assert.equal(game.upgradeAllGuardians('max'), false);
  const seed = active(fresh(), [1, 100000]); seed.gold = 100000;
  assert.equal(setup(seed).game.upgradeAllGuardians(1), false);
});
test('Bag cost remains payable at every finite capacity level', () => {
  for (let level = 1; level < 1024; level++) {
    assert.ok(B.bagUpgradeCost(level) <= B.bagCapacity(level));
    assert.ok(Number.isFinite(B.bagCapacity(level)));
  }
  const seed = fresh(); seed.gold = 5000;
  const { game } = setup(seed);
  assert.equal(game.getGoldCapacity(), 10000);
  assert.equal(game.upgradeBag(), true);
  assert.equal(game.getGoldCapacity(), 30000);
  assert.equal(game.getState().gold, 0);
  assert.equal(game.upgradeBag(), false);
});
for (const type of ['normal', 'mimic', 'stageBoss', 'regionBoss']) test(`${type} rewards respect capacity`, () => {
  const seed = timedSeed(type, type === 'regionBoss' ? 10 : 1, 1);
  seed.gold = 9999;
  const { game } = setup(seed, 0, () => 0);
  game.attack();
  assert.equal(game.getState().gold, 10000);
});
test('farming reward clamps and dev Gold explicitly bypasses capacity', () => {
  const seed = farmingSeed(); seed.gold = 9999; seed.monster.hp = 1;
  const { game } = setup(seed);
  game.attack();
  assert.equal(game.getState().gold, 10000);
  game.addDeveloperGold();
  assert.equal(game.getState().gold, 110000);
  game.autoAttack();
  assert.equal(game.getState().gold, 110000);
});
test('Nazar eligible/active/inactive indicator and zero rewards/progression', () => {
  const seed = farmingSeed();
  const { game } = setup(seed);
  assert.deepEqual(clone(game.getNazarIndicatorState()), { visible: true, active: false });
  game.forceNazar();
  assert.equal(game.getNazarIndicatorState().active, true);
  const forced = JSON.parse(game.exportSave()); forced.monster.hp = 1;
  game.importSave(JSON.stringify(forced));
  const before = game.getState(); game.attack();
  const after = game.getState();
  assert.equal(after.gold, before.gold);
  assert.equal(after.stage, before.stage);
  assert.equal(after.killsInStage, before.killsInStage);
  assert.deepEqual(after.manaStones, before.manaStones);
  assert.equal(setup().game.getNazarIndicatorState().visible, false);
});
test('combat reward event reports only Gold actually credited by Bag capacity', () => {
  const seed = fresh();
  seed.stage = 50; seed.gold = 9990; seed.bagLevel = 1;
  seed.monster = { type: 'normal', hp: 1 };
  const { game } = setup(seed, 0, () => 0);
  let rewardEvent;
  game.subscribe((state, event) => { if (event.type === 'tap') rewardEvent = clone(event); });
  game.attack();
  assert.equal(game.getState().gold, 10000);
  assert.equal(rewardEvent.reward, 10);
});
test('combat reward event is zero when capacity is full or Nazar is defeated', () => {
  const full = fresh(); full.stage = 50; full.gold = 10000; full.bagLevel = 1; full.monster = { type: 'normal', hp: 1 };
  const fullGame = setup(full, 0, () => 0).game;
  let fullReward;
  fullGame.subscribe((state, event) => { if (event.type === 'tap') fullReward = event.reward; });
  fullGame.attack();
  assert.equal(fullReward, 0);

  const nazar = farmingSeed(); nazar.monster = { type: 'nazar', hp: 1 };
  const nazarGame = setup(nazar).game;
  let nazarReward;
  nazarGame.subscribe((state, event) => { if (event.type === 'tap') nazarReward = event.reward; });
  nazarGame.attack();
  assert.equal(nazarReward, 0);
});
test('duplicate Guardian reward event equals the complete encounter Gold delta', () => {
  const seed = active(timedSeed('guardian', 5, 1), [1]);
  const { game } = setup(seed);
  const before = game.getState().gold;
  let rewardEvent;
  game.subscribe((state, event) => { if (event.type === 'tap') rewardEvent = clone(event); });
  game.attack();
  assert.equal(rewardEvent.reward, game.getState().gold - before);
});
test('offline excludes TAP and skills even with very high Lutie level', () => {
  const a = fresh(), b = fresh(); b.lutie.level = 200;
  const left = setup(a, 20000), right = setup(b, 20000);
  assert.deepEqual(left.summary, right.summary);
  assert.equal(left.game.getState().killsInStage, 2);
});
test('offline uses active Guardian DPS and partial HP deterministically', () => {
  const seed = active(fresh(), [1]);
  const a = setup(seed, 5000), b = setup(seed, 5000);
  assert.deepEqual(a.summary, b.summary);
  assert.equal(a.game.getState().killsInStage, 1);
  assert.equal(a.game.getState().monster.hp, 5);
  assert.equal(a.summary.goldEarned, 2);
});
test('offline timed wall consumes timer then farms with normal HP/Gold', () => {
  const seed = timedSeed('stageBoss', 4, B.normalStageBossHp(4));
  const { game, summary } = setup(seed, 60000);
  assert.equal(game.getState().progression.farmingBeforeBoss, true);
  assert.equal(game.getState().stage, 4);
  const hp = B.monsterBaseHp(4);
  assert.equal(summary.goldEarned, Math.floor(30 / hp) * B.monsterGold(4));
  assert.equal(summary.stagesAdvanced, 0);
});
test('offline Region wall keeps exact retry target, uses same-stage farm', () => {
  const { game } = setup(timedSeed('regionBoss', 10, 350), 60000);
  assert.equal(game.getState().stage, 10);
  assert.equal(game.getState().progression.pendingBossStage, 10);
  assert.equal(game.getState().progression.pendingEncounterType, 'regionBoss');
});
test('offline partially elapsed boss restores remaining timer without double elapsed', () => {
  const { game } = setup(timedSeed('stageBoss', 4, B.normalStageBossHp(4)), 10000);
  assert.equal(game.getState().boss.timeRemainingMs, 20000);
  assert.equal(game.getState().boss.deadlineAt, 1_030_000);
});
test('offline defeats a beatable boss and retains guaranteed Region stone', () => {
  const seed = active(timedSeed('regionBoss', 10, 3), [1]);
  const { game, summary } = setup(seed, 1000);
  assert.equal(summary.stagesAdvanced, 1);
  assert.equal(game.getState().stage, 11);
  assert.equal(game.getState().manaStones[0].level, 10);
  assert.equal(game.getState().manaStones[0].rarity, 'NORMAL');
});
test('offline guardian acquisition is deterministic and increases following DPS', () => {
  const seed = timedSeed('guardian', 5, 1);
  const { game } = setup(seed, 2000, () => { throw Error('offline must not roll RNG'); });
  assert.equal(game.getState().guardians[0].activeThisRun, true);
  assert.equal(game.getTotalDps(), 3);
  assert.equal(game.getState().monster.hp, B.monsterBaseHp(6) - 3);
});
test('offline farming applies artifact once and reports capacity loss', () => {
  const seed = farmingSeed(); seed.gold = 9999; seed.artifacts.gold.level = 5;
  const { game, summary } = setup(seed, 60000);
  const total = Math.floor(60 / B.monsterBaseHp(10)) * Math.floor(B.monsterGold(10) * 1.5);
  assert.equal(summary.goldEarned, 1);
  assert.equal(summary.goldLost, total - 1);
  assert.equal(game.getState().gold, 10000);
});
test('offline load settles once; repeated load/export-import grants no duplicate', () => {
  const seed = farmingSeed();
  const a = setup(seed, 60000);
  const gold = a.game.getState().gold;
  const b = setup(null, 60000, () => 0.99, a.adapter);
  assert.equal(b.summary, null);
  assert.equal(b.game.getState().gold, gold);
  b.game.importSave(JSON.stringify(seed));
  const c = setup(null, 60000, () => 0.99, b.adapter);
  assert.equal(c.summary, null);
  assert.equal(c.game.getState().gold, seed.gold);
  assert.equal(a.adapter.data.lastSavedAt, 1_060_000);
});
test('clock rollback neither pays nor moves the saved checkpoint backwards', () => {
  const seed = fresh();
  const { game, adapter } = setup(seed, -10000);
  assert.equal(game.getState().gold, 0);
  assert.equal(adapter.data.lastSavedAt, 1_000_000);
  const next = setup(null, 0, () => 0.99, adapter);
  assert.equal(next.summary, null);
});
test('huge offline time is capped, batched, finite, and one storage write', () => {
  const { game, summary, adapter } = setup(farmingSeed(), 1e15, () => { throw Error('No farming RNG'); });
  assert.equal(summary.processedMs, B.constants.OFFLINE_MAX_MS);
  assert.equal(summary.encounters, 0);
  assert.equal(adapter.writes, 1);
  assert.equal(game.getState().gold, game.getGoldCapacity());
  assert.ok(Number.isFinite(summary.goldLost));
});
for (const type of ['mimic', 'nazar']) test(`offline omits existing ${type} special loot`, () => {
  const seed = farmingSeed(); seed.monster = { type, hp: 1 };
  const { game, summary } = setup(seed, 1000, () => { throw Error('No offline special RNG'); });
  assert.equal(summary.goldEarned, 0);
  assert.equal(game.getState().manaStones.length, 0);
  assert.equal(game.getState().monster.type, 'normal');
});
test('developer offline invokes same algorithm and fresh checkpoint', () => {
  const { game, adapter } = setup(farmingSeed());
  const summary = game.simulateDeveloperOffline();
  assert.equal(summary.elapsedMs, 3600000);
  assert.ok(summary.goldEarned > 0);
  assert.equal(setup(null, 0, () => 0.99, adapter).summary, null);
});
test('natural balloon forbidden before reincarnation, even RNG zero', () => {
  const { game } = setup(timedSeed('regionBoss', 10, 1), 0, () => 0);
  game.attack(); assert.equal(game.getState().stage, 11);
});
test('natural balloon after Region clear starts Stage 20 challenge without premature rewards', () => {
  const seed = timedSeed('regionBoss', 10, 1); seed.lifetime.totalReincarnations = 1;
  const { game } = setup(seed, 0, () => 0);
  let balloon;
  game.subscribe((s, e) => { if (e.type === 'balloon') balloon = e; });
  game.attack();
  assert.equal(game.getState().stage, 20);
  assert.equal(game.getState().gold, B.monsterGold(10));
  assert.equal(game.getState().manaStones.length, 1);
  assert.equal(game.getState().guardians.filter(g => g.discovered).length, 0);
  assert.equal(balloon.destination, 20);
});
test('balloon RNG threshold is 5%, and non-Region gates never trigger', () => {
  assert.equal(B.constants.BALLOON_TRIGGER_CHANCE, 0.05);
  const seed = timedSeed('regionBoss', 10, 1); seed.lifetime.totalReincarnations = 1;
  const { game } = setup(seed, 0, () => 0.05); game.attack();
  assert.equal(game.getState().stage, 11);
  const normal = timedSeed('stageBoss', 4, 1); normal.lifetime.totalReincarnations = 1;
  const other = setup(normal, 0, () => 0).game; other.attack();
  assert.equal(other.getState().stage, 5);
});
test('FORCE BALLOON bypasses unlock and never awards skipped rewards', () => {
  const { game } = setup(); const before = game.getState();
  assert.equal(game.forceBalloon(), true);
  assert.equal(game.getState().stage, 10);
  assert.equal(game.getState().gold, before.gold);
  assert.deepEqual(game.getState().manaStones, before.manaStones);
});
test('offline has no balloon rolls even after reincarnation', () => {
  const seed = timedSeed('regionBoss', 10, 1); seed.lifetime.totalReincarnations = 1;
  assert.equal(setup(seed, 1000, () => { throw Error('No offline rolls'); }).game.getState().stage, 11);
});
for (const source of ['mimic', 'regionBoss']) test(`${source} Mana Stone never exceeds relevant stage`, () => {
  for (const stage of [10, 20, 50, 100]) {
    const { game } = setup(timedSeed(source, stage, 1), 0, () => 0);
    game.attack();
    assert.equal(game.getState().manaStones.length, 1);
    assert.ok(game.getState().manaStones[0].level <= stage);
  }
});
for (const version of [1, 2, 3, 4]) test(`v${version} migration preserves wealth and safe missing timestamp`, () => {
  const seed = active(fresh(), [17]); seed.saveVersion = version; seed.gold = 1_234_567;
  delete seed.bagLevel; delete seed.lastSavedAt;
  const { game, summary } = setup(seed, 1e12);
  assert.equal(summary, null);
  assert.equal(game.getState().saveVersion, 6);
  assert.equal(game.getState().gold, seed.gold);
  assert.ok(game.getGoldCapacity() >= seed.gold);
  assert.equal(game.getState().guardians[0].level, 17);
});
test('v4 normal slot ten migrates into normal Stage Boss', () => {
  const seed = fresh(); seed.saveVersion = 4; seed.killsInStage = 9; seed.monster.hp = 1;
  const { game } = setup(seed);
  assert.equal(game.getState().monster.type, 'stageBoss');
  assert.equal(game.getState().monster.hp, B.normalStageBossHp(1));
});
test('v6 source-state roundtrip excludes derived capacity and stats', () => {
  const seed = active(fresh(), [25]); seed.bagLevel = 5; seed.maxGoldCapacity = 999999;
  const a = setup(seed), payload = JSON.parse(a.game.exportSave());
  assert.equal(payload.maxGoldCapacity, undefined);
  assert.equal(payload.guardians[0].dps, undefined);
  assert.equal(payload.monster.maxHp, undefined);
  assert.equal(payload.lastSavedAt, 1_000_000);
  const b = setup(payload);
  assert.equal(b.game.getGoldCapacity(), B.bagCapacity(5));
  assert.deepEqual(b.game.getState().guardians, a.game.getState().guardians);
});
test('Bag/count/Stars/Artifacts/Legendary equipment persist on reincarnation', () => {
  const seed = active(fresh(), [25]); seed.bagLevel = 7; seed.lutie.level = 200; seed.stars = 7; seed.artifacts.tap.level = 2;
  seed.manaStones = [{ id: 'legend', level: 20, rarity: 'LEGENDARY', equippedGuardianId: seed.guardians[0].id }];
  seed.guardians[0].equippedManaStoneId = 'legend';
  const { game } = setup(seed); game.reincarnate();
  const after = game.getState();
  assert.equal(after.bagLevel, 7);
  assert.equal(after.lifetime.totalReincarnations, 1);
  assert.equal(after.stars, 8);
  assert.equal(after.artifacts.tap.level, 2);
  assert.equal(after.guardians[0].reincarnationLevel, 1);
  assert.equal(after.guardians[0].equippedManaStoneId, 'legend');
  assert.equal(after.gold, 0);
});
test('LocalStorageAdapter preserves injected source checkpoint', () => {
  const memory = new Map();
  const adapter = new context.GameStorage.LocalStorageAdapter({ getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) });
  adapter.saveGame({ lastSavedAt: 1234 });
  assert.equal(adapter.loadGame().lastSavedAt, 1234);
});

test('fractional offline HP survives a save/reload without losing damage', () => {
  const seed = fresh();
  const a = setup(seed, 9500);
  assert.equal(a.game.getState().monster.hp, 0.5);
  const b = setup(null, 9500, () => 0.99, a.adapter);
  assert.equal(b.game.getState().monster.hp, 0.5);
  const c = setup(null, 10000, () => 0.99, a.adapter);
  assert.equal(c.game.getState().killsInStage, 1);
  assert.equal(c.game.getState().gold, 2);
});
test('offline normal progression, not just farming, clamps every reward', () => {
  const seed = active(fresh(), [50]); seed.gold = 9999;
  const { game, summary } = setup(seed, 60000);
  assert.ok(summary.stagesAdvanced > 1);
  assert.equal(summary.goldEarned, 1);
  assert.ok(summary.goldLost > 0);
  assert.equal(game.getState().gold, 10000);
});
test('duplicate Guardian reward uses capacity helper', () => {
  const seed = active(timedSeed('guardian', 5, 1), [1]); seed.gold = 9999;
  const { game } = setup(seed); game.attack();
  assert.equal(game.getState().gold, 10000);
  assert.equal(game.getState().guardians.filter(g => g.activeThisRun).length, 1);
});
test('very high DPS progression still has a finite encounter bound', () => {
  const seed = active(fresh(), [5000]);
  const { summary, adapter } = setup(seed, 1e15, () => { throw Error('No offline RNG'); });
  assert.ok(summary.encounters <= B.constants.OFFLINE_MAX_ENCOUNTERS);
  assert.ok(summary.stagesAdvanced > 10);
  assert.equal(adapter.writes, 1);
});
test('new saved partial Stage Boss retains source HP/timer and gate identity', () => {
  const seed = timedSeed('stageBoss', 4, 10, 15000);
  const a = setup(seed), b = setup(null, 0, () => 0.99, a.adapter);
  assert.equal(b.game.getState().monster.type, 'stageBoss');
  assert.equal(b.game.getState().monster.hp, 10);
  assert.equal(b.game.getState().boss.timeRemainingMs, 15000);
  assert.equal(b.game.getState().killsInStage, 9);
});

// v0.3.1: changed expectations above retain the original coverage; these exercise new semantics.
test('Region stage has nine normal enemies, then its tenth Region Boss', () => {
  const seed = fresh(); seed.stage = 10; seed.lutie.level = 100;
  const { game } = setup(seed);
  for (let i = 0; i < 9; i++) {
    assert.equal(game.getState().monster.type, 'normal');
    assert.equal(game.getState().killsInStage, i);
    game.attack();
  }
  assert.equal(game.getState().monster.type, 'regionBoss');
  assert.equal(game.getState().killsInStage, 9);
  game.attack();
  assert.equal(game.getState().stage, 11);
  assert.equal(game.getState().killsInStage, 0);
});
for (const failure of ['timeout', 'giveUp']) test(`Region ${failure} repeats slot nine at same stage and retries boss directly`, () => {
  const { game } = setup(timedSeed('regionBoss', 20, 1000));
  game.stop();
  if (failure === 'timeout') game.bossTimerTick(1_030_000); else game.giveUpBoss();
  assert.equal(game.getState().stage, 20);
  assert.equal(game.getState().killsInStage, 8);
  const seed = JSON.parse(game.exportSave()); seed.lutie.level = 100;
  game.importSave(JSON.stringify(seed));
  for (let i = 0; i < 12; i++) {
    game.attack();
    assert.equal(game.getState().stage, 20);
    assert.equal(game.getState().killsInStage, 8);
    assert.equal(game.getState().monster.type, 'normal');
  }
  game.challengeBoss();
  assert.equal(game.getState().monster.type, 'regionBoss');
  assert.equal(game.getState().killsInStage, 9);
});
test('Balloon victory awards target exactly once, grants skipped Guardian and no skipped Gold', () => {
  const seed = timedSeed('regionBoss', 10, 1); seed.lifetime.totalReincarnations = 1; seed.lutie.level = 100;
  let roll = 0;
  const { game, adapter } = setup(seed, 0, () => roll);
  game.attack();
  assert.equal(game.getState().stage, 20);
  assert.equal(game.getState().balloonChallenge.resume.stage, 11);
  assert.equal(game.getState().killsInStage, 9);
  assert.equal(game.getState().guardians.filter(g => g.activeThisRun).length, 0);
  roll = 0.99;
  game.attack();
  const after = game.getState();
  assert.equal(after.stage, 21);
  assert.equal(after.balloonChallenge, null);
  assert.equal(after.gold, B.monsterGold(10) + B.monsterGold(20));
  assert.deepEqual(after.manaStones.map(s => s.level), [10, 20]);
  assert.equal(after.guardians.filter(g => g.activeThisRun).length, 1);
  assert.equal(after.run.encounteredGuardianIds.length, 1);
  const reloaded = setup(null, 0, () => 0.99, adapter).game;
  assert.equal(reloaded.getState().gold, after.gold);
  assert.equal(reloaded.getState().manaStones.length, 2);
  assert.equal(reloaded.getState().guardians.filter(g => g.activeThisRun).length, 1);
});
for (const failure of ['timeout', 'giveUp', 'offline']) test(`Balloon ${failure} returns to stage 11 with no target rewards or target camping`, () => {
  const seed = timedSeed('regionBoss', 10, 1); seed.lifetime.totalReincarnations = 1;
  const started = setup(seed, 0, () => 0); const game = started.game;
  game.attack(); game.stop();
  const highest = game.getState().run.highestStage;
  let after;
  if (failure === 'timeout') { game.bossTimerTick(1_030_000); after = game.getState(); }
  if (failure === 'giveUp') { game.giveUpBoss(); after = game.getState(); }
  if (failure === 'offline') { after = setup(null, 30000, () => 0.99, started.adapter).game.getState(); }
  assert.equal(after.stage, 11);
  assert.equal(after.progression.farmingBeforeBoss, false);
  assert.equal(after.balloonChallenge, null);
  assert.equal(after.gold, B.monsterGold(10));
  assert.equal(after.manaStones.length, 1);
  assert.equal(after.guardians.filter(g => g.activeThisRun).length, 0);
  assert.equal(after.run.highestStage, highest);
});
test('consecutive natural Balloon challenges preserve each intermediate Guardian opportunity', () => {
  const seed = timedSeed('regionBoss', 10, 1); seed.lifetime.totalReincarnations = 1; seed.lutie.level = 100;
  const { game } = setup(seed, 0, () => 0);
  game.attack(); game.attack();
  assert.equal(game.getState().stage, 30);
  assert.equal(game.getState().balloonChallenge.resume.stage, 21);
  game.attack();
  assert.equal(game.getState().stage, 40);
  assert.equal(game.getState().balloonChallenge.resume.stage, 31);
  assert.equal(game.getState().guardians.filter(g => g.activeThisRun).length, 2);
  assert.equal(game.getState().gold, B.monsterGold(10) + B.monsterGold(20) + B.monsterGold(30));
});
test('Balloon mid-challenge save/load and export/import keep HP, timer and rollback destination', () => {
  const seed = timedSeed('regionBoss', 10, 1); seed.lifetime.totalReincarnations = 1;
  const { game, adapter } = setup(seed, 0, () => 0); game.attack(); game.attack();
  const before = game.getState();
  const restored = setup(null, 0, () => 0.99, adapter).game;
  assert.deepEqual(restored.getState().balloonChallenge, before.balloonChallenge);
  assert.equal(restored.getState().monster.hp, before.monster.hp);
  assert.equal(restored.getState().boss.timeRemainingMs, before.boss.timeRemainingMs);
  assert.equal(restored.getState().run.highestStage, before.run.highestStage);
  assert.equal(restored.importSave(game.exportSave()).ok, true);
  restored.giveUpBoss();
  assert.equal(restored.getState().stage, 11);
});
test('FORCE Balloon prevents nested challenges and restores exact interrupted farming encounter', () => {
  const { game } = setup(farmingSeed());
  game.forceNazar(); game.attack();
  const before = game.getState();
  assert.equal(game.forceBalloon(), true);
  assert.equal(game.getState().stage, 20);
  assert.equal(game.forceBalloon(), false);
  game.giveUpBoss();
  const after = game.getState();
  assert.equal(after.stage, before.stage);
  assert.equal(after.killsInStage, before.killsInStage);
  assert.deepEqual(after.monster, before.monster);
  assert.deepEqual(after.progression, before.progression);
  assert.equal(after.run.nazarEscalation, before.run.nazarEscalation);
});
test('Balloon with full roster invents neither extra Guardians nor duplicate Guardian Gold', () => {
  const seed = active(timedSeed('regionBoss', 10, 1), Array(10).fill(1));
  seed.lifetime.totalReincarnations = 1; seed.lutie.level = 100;
  let roll = 0; const { game } = setup(seed, 0, () => roll);
  game.attack(); roll = 0.99; game.attack();
  assert.equal(game.getState().gold, B.monsterGold(10) + B.monsterGold(20));
  assert.equal(game.getState().guardians.filter(g => g.activeThisRun).length, 10);
});
test('Nazar receives fractional automatic damage and dies without rewards/progression', () => {
  const { game, setClock } = setup(farmingSeed()); game.forceNazar();
  const before = game.getState(); setClock(1_000_100); game.automaticTick();
  assert.ok(Math.abs(game.getState().monster.hp - (before.monster.hp - game.getTotalDps() / 10)) < 1e-8);
  const seed = JSON.parse(game.exportSave()); seed.monster.hp = 0.05; game.importSave(JSON.stringify(seed));
  setClock(1_000_200); game.automaticTick();
  assert.equal(game.getState().monster.type, 'normal');
  assert.equal(game.getState().gold, before.gold);
  assert.equal(game.getState().killsInStage, before.killsInStage);
});
for (const intervals of [[100,200,300,400,500,600,700,800,900,1000], [137,391,777,1000]]) test(`elapsed DPS conserves one-second damage for ${intervals.length} irregular frames`, () => {
  const seed = active(fresh(), [25]); seed.stage = 100; seed.monster = { type: 'normal', hp: B.monsterBaseHp(100) };
  const { game, setClock } = setup(seed); const before = game.getState().monster.hp; const dps = game.getTotalDps();
  const displays = []; let tickCount = 0;
  game.subscribe((s,e) => { if (e.type === 'autoDamageDisplay') displays.push(e.amount); if (e.type === 'autoAttack') tickCount++; });
  for (const elapsed of intervals) { setClock(1_000_000 + elapsed); game.automaticTick(); }
  assert.ok(Math.abs(before - game.getState().monster.hp - dps) < 1e-6);
  assert.equal(tickCount, intervals.length);
  assert.equal(displays.length, 1);
  assert.ok(Math.abs(displays[0] - dps) < 1e-8);
});
test('DPS damage carries across kills instead of dropping delayed-frame overkill', () => {
  const seed = active(fresh(), [10]);
  const { game, setClock } = setup(seed); setClock(1_001_000); game.automaticTick();
  assert.equal(game.getState().killsInStage, 3);
  assert.ok(Math.abs(game.getState().monster.hp - 2) < 1e-8); // 38 DPS = 3*10 + 8
});
test('DPS-changing purchase settles preceding elapsed time at old DPS', () => {
  const seed = active(fresh(), [25]); seed.stage = 100; seed.gold = 10000; seed.monster = { type: 'normal', hp: B.monsterBaseHp(100) };
  const { game, setClock } = setup(seed); const hp = game.getState().monster.hp; const oldDps = game.getTotalDps();
  setClock(1_000_500); game.upgradeGuardian('guardian-01'); const newDps = game.getTotalDps();
  setClock(1_001_000); game.automaticTick();
  assert.ok(Math.abs(hp - game.getState().monster.hp - (oldDps + newDps) / 2) < 1e-6);
});
test('throttled frames use offline catchup once and do not replay after restart', () => {
  const { game, setClock, adapter } = setup(farmingSeed());
  setClock(1_060_000); game.automaticTick(); const gold = game.getState().gold;
  assert.equal(gold, Math.floor(60 / B.monsterBaseHp(10)) * B.monsterGold(10));
  game.automaticTick(); assert.equal(game.getState().gold, gold);
  assert.equal(setup(null, 60000, () => 0.99, adapter).game.getState().gold, gold);
});
test('automatic damage up to deadline can defeat a boss even when the callback is late', () => {
  const { game, setClock } = setup(timedSeed('regionBoss', 10, 0.5, 1000));
  setClock(1_001_100); game.automaticTick();
  assert.equal(game.getState().stage, 11);
  assert.equal(game.getState().manaStones.length, 1);
});
test('Bag curve matches requested table and extends by x3; every upgrade is affordable at cap', () => {
  const expected = [10000,30000,120000,400000,1000000,3000000,10000000,30000000,100000000,300000000,900000000];
  expected.forEach((capacity,i) => {
    assert.equal(B.bagCapacity(i+1),capacity);
    assert.equal(B.bagUpgradeCost(i+1),capacity/2);
    assert.equal(B.bagLevelForGold(capacity),i+1);
    assert.equal(B.bagLevelForGold(capacity+1),i+2);
  });
});
test('v5 migration preserves Bag level, changes old Region farming to stage ten and defaults English', () => {
  const seed = farmingSeed(); seed.saveVersion = 5; seed.stage = 9; seed.bagLevel = 4; delete seed.settings.language;
  const { game } = setup(seed);
  assert.equal(game.getState().bagLevel, 4);
  assert.equal(game.getGoldCapacity(), 400000);
  assert.equal(game.getState().stage, 10);
  assert.equal(game.getState().killsInStage, 8);
  assert.equal(game.getState().settings.language, 'en');
  assert.equal(game.getState().balloonChallenge, null);
});
test('language changes persist without changing combat/economy/source progression', () => {
  const { game, adapter } = setup(active(fresh(), [25])); game.stop();
  const before = game.getState(); const dps = game.getTotalDps();
  assert.equal(game.setSetting('language','ko'),true);
  const after = game.getState(); after.settings.language = before.settings.language;
  assert.deepEqual(after,before);
  assert.equal(game.getTotalDps(),dps);
  assert.equal(setup(null,0,()=>0.99,adapter).game.getState().settings.language,'ko');
  assert.equal(game.setSetting('language','invalid'),false);
});
test('central i18n has Korean translations for static HTML and literal UI keys', () => {
  const dictionary = context.I18n.ko;
  const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const ui = fs.readFileSync(path.join(__dirname,'..','ui.js'),'utf8');
  const keys = [...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g), ...ui.matchAll(/\bt\("([^"]+)"/g)].map(match=>match[1]);
  for (const key of keys) assert.ok(dictionary[key], `Korean translation: ${key}`);
  context.I18n.setLanguage('ko');
  assert.equal(context.I18n.t('MONSTER {number} / {total}',{number:9,total:10}),'몬스터 9 / 10');
  context.I18n.setLanguage('en');
  assert.equal(context.I18n.t('MONSTER {number} / {total}',{number:1,total:10}),'MONSTER 1 / 10');
});

test('base DPS one does not display as zero after ten fractional ticks', () => {
  const { game, setClock } = setup(); let amount;
  game.subscribe((s,event) => { if (event.type === 'autoDamageDisplay') amount = event.amount; });
  for (let elapsed = 100; elapsed <= 1000; elapsed += 100) { setClock(1_000_000 + elapsed); game.automaticTick(); }
  assert.equal(amount, 1);
});

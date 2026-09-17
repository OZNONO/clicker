const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const uiSource = fs.readFileSync(path.join(root, "ui.js"), "utf8");
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const uiIds = [...uiSource.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]);
assert.deepEqual(uiIds.filter((id) => !htmlIds.has(id)), [], "Every UI binding resolves to index.html");
assert.equal((html.match(/data-tab="/g) || []).length, 5, "Five bottom navigation buttons are present");
assert.equal((html.match(/data-panel="/g) || []).length, 5, "Five persistent-content tab panels are present");

const context = vm.createContext({ console, Date, JSON, Math, Map, Set, setInterval, clearInterval });
context.window = context;
for (const file of ["balance.js", "data.js", "game.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}

const clone = (value) => JSON.parse(JSON.stringify(value));
class MemoryAdapter {
  constructor(seed = null) { this.data = seed ? clone(seed) : null; }
  saveGame(state) { this.data = { ...clone(state), updatedAt: new Date().toISOString() }; return clone(this.data); }
  loadGame() { return this.data ? clone(this.data) : null; }
  resetGame() { this.data = null; }
}

let clock = 1_000_000;
const steadyRuntime = { random: () => 0.99, now: () => clock };
const createStartedGame = (adapter = new MemoryAdapter(), runtime = steadyRuntime) => {
  const game = context.LutieGame.createGame(adapter, runtime);
  game.start();
  game.stop();
  return game;
};
const defeatCurrent = (game) => {
  const initial = game.getState().monster;
  let safety = 0;
  while (game.getState().monster.type === initial.type && game.getState().monster.name === initial.name && game.getState().monster.hp <= initial.hp && safety++ < 100000) {
    const before = game.getState().monster.hp;
    game.attack();
    if (game.getState().monster.hp > before || game.getState().monster.type !== initial.type || game.getState().monster.name !== initial.name) break;
  }
  assert.ok(safety < 100000, "Combat remains within safety limit");
};
const reachStage = (game, target) => {
  let safety = 0;
  while (game.getState().stage < target && safety++ < 10000) defeatCurrent(game);
  assert.ok(safety < 10000, `Reached Stage ${target}`);
};

// 1-2: base DPS and TAP.
const adapter = new MemoryAdapter();
const game = createStartedGame(adapter);
let state = game.getState();
assert.equal(game.getTotalDps(), 1, "1. New game BASE_DPS is 1");
const initialHp = state.monster.hp;
game.autoAttack();
assert.equal(game.getState().monster.hp, initialHp - 1, "1. BASE_DPS deals damage");
const hpBeforeTap = game.getState().monster.hp;
game.attack();
assert.equal(game.getState().monster.hp, hpBeforeTap - game.getTotalTap(), "2. Lutie TAP deals calculated damage");

// 3-6: roster and Guardian encounter/acquisition/DPS aggregation.
assert.equal(state.guardians.length, 10, "3. Ten-member Guardian roster is created");
reachStage(game, 5);
state = game.getState();
assert.equal(state.monster.type, "guardian", "4. Stage 5 is a Guardian encounter");
assert.equal(state.boss.timeRemainingMs, 30000);
const encounteredGuardianId = state.monster.guardianId;
defeatCurrent(game);
state = game.getState();
const firstGuardian = state.guardians.find((guardian) => guardian.id === encounteredGuardianId);
assert.equal(firstGuardian.activeThisRun, true, "5. Defeated Guardian joins the active roster");
assert.equal(firstGuardian.discovered, true);

const twoGuardianState = JSON.parse(game.exportSave());
const secondGuardian = twoGuardianState.guardians.find((guardian) => guardian.id !== firstGuardian.id);
secondGuardian.discovered = true;
secondGuardian.unlocked = true;
secondGuardian.activeThisRun = true;
assert.equal(game.importSave(JSON.stringify(twoGuardianState)).ok, true);
const expectedGuardianDps = game.getGuardianFinalDps(firstGuardian.id) + game.getGuardianFinalDps(secondGuardian.id);
assert.equal(game.getTotalGuardianDps(), expectedGuardianDps, "6. Multiple Guardian DPS values are summed");
assert.equal(game.getTotalDps(), 1 + expectedGuardianDps);

// 7-10 and 29-30: Region Boss, timeout, farming, retry, persistence.
reachStage(game, 10);
state = game.getState();
assert.equal(state.monster.type, "regionBoss", "7. Stage 10 is a Region Boss");
assert.equal(state.boss.timeRemainingMs, 30000, "8. Region Boss timer starts at 30 seconds");
game.bossTimerTick(state.boss.deadlineAt);
state = game.getState();
assert.equal(state.stage, 9, "9. Timeout returns to the previous farming stage");
assert.equal(state.progression.farmingBeforeBoss, true);
assert.equal(state.progression.pendingBossStage, 10);

const restored = createStartedGame(adapter);
assert.equal(restored.getState().progression.farmingBeforeBoss, true, "30. Boss farming state survives save/load");
assert.equal(restored.getState().progression.pendingBossStage, 10);
assert.equal(restored.challengeBoss(), true, "10. Manual Boss retry succeeds");
state = restored.getState();
assert.equal(state.stage, 10);
assert.equal(state.monster.type, "regionBoss");
assert.equal(state.monster.hp, context.Balance.monsterMaxHp(10));
assert.equal(state.boss.timeRemainingMs, 30000);

// 11-14: Mimic, stone creation, equip, cap.
const mimicAdapter = new MemoryAdapter();
const mimicGame = createStartedGame(mimicAdapter, { random: () => 0, now: () => clock });
defeatCurrent(mimicGame);
assert.equal(mimicGame.getState().monster.type, "mimic", "11. Mimic spawn roll is deterministic");
defeatCurrent(mimicGame);
const generatedStone = mimicGame.getState().manaStones[0];
assert.ok(generatedStone, "12. Mimic can generate a Mana Stone");
assert.equal(generatedStone.rarity, "LEGENDARY");

const equipmentState = JSON.parse(game.exportSave());
equipmentState.stage = 6;
equipmentState.progression.farmingBeforeBoss = false;
equipmentState.progression.bossRetryAvailable = false;
equipmentState.progression.pendingBossStage = null;
equipmentState.progression.pendingEncounterType = null;
equipmentState.monster = { type: "normal", name: "Cave Puff", isBoss: false, isTimed: false, guardianId: null, hp: 20, maxHp: 20 };
equipmentState.manaStones = [{ ...generatedStone, id: "stone-cap-test", level: 100, equippedGuardianId: null }];
assert.equal(game.importSave(JSON.stringify(equipmentState)).ok, true);
assert.equal(game.equipManaStone("stone-cap-test", firstGuardian.id), true, "13. Mana Stone equips to a Guardian");
assert.equal(game.getState().guardians.find((guardian) => guardian.id === firstGuardian.id).equippedManaStoneId, "stone-cap-test");
assert.equal(game.getEffectiveStoneLevel(game.getState().manaStones[0]), 6, "14. Stone effective level is capped by Stage");
assert.equal(game.unequipManaStone("stone-cap-test"), true, "13. Mana Stone unequips");
assert.equal(game.getState().manaStones[0].equippedGuardianId, null);

// 15-16: Nazar eligibility and escalating HP.
const nazarSeed = JSON.parse(game.exportSave());
nazarSeed.stage = 9;
nazarSeed.progression.farmingBeforeBoss = true;
nazarSeed.progression.bossRetryAvailable = true;
nazarSeed.progression.pendingBossStage = 10;
nazarSeed.progression.pendingEncounterType = "regionBoss";
nazarSeed.run.nazarEscalation = 0;
nazarSeed.monster = { type: "normal", name: "Mossling", isBoss: false, isTimed: false, guardianId: null, hp: context.Balance.monsterBaseHp(9), maxHp: context.Balance.monsterBaseHp(9) };
nazarSeed.guardians.forEach((guardian, index) => { if (index < 2) { guardian.discovered = true; guardian.activeThisRun = true; guardian.unlocked = true; guardian.level = 20; } });
const nazarRolls = [0.99, 0, 0];
const nazarGame = createStartedGame(new MemoryAdapter(nazarSeed), { random: () => nazarRolls.length ? nazarRolls.shift() : 0, now: () => clock });
assert.ok(nazarGame.getTotalDps() >= context.Balance.monsterBaseHp(9) * context.Balance.constants.NAZAR_DPS_THRESHOLD, "15. Nazar DPS condition is met");
defeatCurrent(nazarGame);
assert.equal(nazarGame.getState().monster.type, "nazar", "15. Eligible farming spawn can become Nazar");
const firstNazarHp = nazarGame.getState().monster.maxHp;
defeatCurrent(nazarGame);
assert.equal(nazarGame.getState().monster.type, "nazar");
assert.equal(nazarGame.getState().monster.maxHp, firstNazarHp * 2, "16. Repeated Nazar HP escalates x2");

// 17-27: reincarnation, permanence, and calculation bonuses.
const permanentSeed = JSON.parse(game.exportSave());
permanentSeed.lutie.level = 199;
permanentSeed.stage = 50;
permanentSeed.run.highestStage = 50;
permanentSeed.lifetime.highestStage = 50;
permanentSeed.stars = 5;
permanentSeed.artifacts = { tap: { level: 1 }, dps: { level: 1 }, gold: { level: 1 } };
permanentSeed.manaStones = [
  { id: "normal-keep-test", level: 50, rarity: "NORMAL", power: context.Balance.constants.MANA_STONE_POWER_NORMAL, equippedGuardianId: null },
  { id: "legendary-keep-test", level: 50, rarity: "LEGENDARY", power: context.Balance.constants.MANA_STONE_POWER_LEGENDARY, equippedGuardianId: null }
];
const reincGame = createStartedGame(new MemoryAdapter(permanentSeed));
assert.equal(reincGame.getReincarnationPreview().available, false, "17. Reincarnation is unavailable below Lv200");
const level200 = JSON.parse(reincGame.exportSave());
level200.lutie.level = 200;
assert.equal(reincGame.importSave(JSON.stringify(level200)).ok, true);
const preview = reincGame.getReincarnationPreview();
assert.equal(preview.available, true, "18. Reincarnation is available at Lv200");
assert.equal(preview.stars, 5, "19. Star formula uses highest Stage / 10");
const activeBeforeReinc = reincGame.getState().guardians.filter((guardian) => guardian.activeThisRun).map((guardian) => guardian.id);
const starsBefore = reincGame.getState().stars;
assert.equal(reincGame.reincarnate(), true);
state = reincGame.getState();
assert.equal(state.stage, 1, "20. Reincarnation resets Stage");
assert.equal(state.gold, 0);
assert.equal(state.lutie.level, 1);
assert.equal(state.guardians.filter((guardian) => guardian.activeThisRun).length, 0);
assert.equal(state.stars, starsBefore + preview.stars, "21. Earned and existing Stars persist");
assert.deepEqual(clone(state.artifacts), { tap: { level: 1 }, dps: { level: 1 }, gold: { level: 1 } }, "22. Artifacts persist");
assert.deepEqual(state.manaStones.map((stone) => stone.rarity), ["LEGENDARY"], "23. Only Legendary Mana Stones persist");
activeBeforeReinc.forEach((id) => assert.equal(state.guardians.find((guardian) => guardian.id === id).reincarnationLevel, 1, "27. Active Guardian gains reincarnation level"));

const bonusSeed = JSON.parse(game.exportSave());
bonusSeed.stage = 6;
bonusSeed.lutie.level = 10;
bonusSeed.artifacts = { tap: { level: 1 }, dps: { level: 1 }, gold: { level: 1 } };
bonusSeed.guardians[0].discovered = true;
bonusSeed.guardians[0].activeThisRun = true;
bonusSeed.guardians[0].unlocked = true;
bonusSeed.guardians[0].level = 3;
bonusSeed.guardians[0].reincarnationLevel = 1;
const bonusGame = createStartedGame(new MemoryAdapter(bonusSeed));
const baseTap = context.Balance.lutieTap(10);
assert.equal(bonusGame.getTotalTap(), Math.floor(baseTap * 1.1), "24. TAP Artifact bonus is applied");
const guardian = bonusGame.getState().guardians[0];
const rawGuardianDps = context.Balance.guardianBaseDps(guardian.level, guardian.baseDps);
assert.equal(bonusGame.getGuardianFinalDps(guardian.id), Math.floor(rawGuardianDps * 1.1 * 1.1), "25/27. DPS Artifact and reincarnation bonuses are applied");
assert.equal(bonusGame.calculateGoldReward(100), 110, "26. GOLD Artifact bonus is applied through unified reward calculation");

// 28: x1/x10/MAX sequential costs.
const upgradeSeed = JSON.parse(bonusGame.exportSave());
upgradeSeed.gold = 1_000_000;
upgradeSeed.lutie.level = 1;
const upgradeGame = createStartedGame(new MemoryAdapter(upgradeSeed));
const exactTenCost = Array.from({ length: 10 }, (_, index) => context.Balance.lutieUpgradeCost(index + 1)).reduce((sum, cost) => sum + cost, 0);
assert.deepEqual(clone(upgradeGame.getUpgradeQuote("lutie", 10)), { levels: 10, totalCost: exactTenCost });
assert.equal(upgradeGame.upgradeLutie(1), true);
assert.equal(upgradeGame.getState().lutie.level, 2);
assert.equal(upgradeGame.upgradeLutie(10), true);
const beforeMaxGold = upgradeGame.getState().gold;
const maxQuote = upgradeGame.getUpgradeQuote("lutie", "max");
assert.equal(upgradeGame.upgradeLutie("max"), true);
assert.equal(upgradeGame.getState().gold, beforeMaxGold - maxQuote.totalCost);
assert.ok(upgradeGame.getState().gold >= 0, "28. MAX never overspends");

// 29: general save/load.
const upgradeAdapter = new MemoryAdapter(JSON.parse(upgradeGame.exportSave()));
const saveRoundTrip = createStartedGame(upgradeAdapter);
assert.equal(saveRoundTrip.getState().lutie.level, upgradeGame.getState().lutie.level, "29. Save/load preserves progression");

// 31: v1 -> v2 migration.
const v1 = {
  saveVersion: 1, updatedAt: "2026-01-01T00:00:00.000Z", gold: 123, stage: 9, killsInStage: 4,
  lutie: { level: 7, tap: 8 }, guardians: [{ id: "ember", level: 3, dps: 7 }],
  progression: { guardianUnlocked: true, bossRetryAvailable: true, farmingBeforeBoss: true, pendingBossStage: 10, v01Cleared: false, clearSeen: false },
  boss: { timeRemainingMs: null, deadlineAt: null },
  monster: { name: "Mossling", isBoss: false, hp: 12, maxHp: context.Balance.monsterBaseHp(9) }
};
const migrated = createStartedGame(new MemoryAdapter(v1)).getState();
assert.equal(migrated.saveVersion, 2, "31. v1 save migrates to v2");
assert.equal(migrated.gold, 123);
assert.equal(migrated.stage, 9);
assert.equal(migrated.lutie.level, 7);
assert.equal(migrated.guardians[0].level, 3);
assert.equal(migrated.guardians[0].activeThisRun, true);
assert.equal(migrated.progression.farmingBeforeBoss, true);
assert.equal(migrated.updatedAt.slice(0, 4), "2026", "Migration keeps the previous updatedAt until next save writes a fresh timestamp");

// 32-34: export, invalid import, complete reset.
const exported = upgradeGame.exportSave();
assert.equal(JSON.parse(exported).saveVersion, 2, "32. Export produces valid JSON");
const beforeInvalidImport = upgradeGame.exportSave();
assert.equal(upgradeGame.importSave("{bad json").ok, false);
assert.equal(upgradeGame.exportSave(), beforeInvalidImport, "33. Invalid JSON does not damage current state");
assert.equal(upgradeGame.importSave(JSON.stringify({ saveVersion: 2, gold: "bad" })).ok, false);
assert.equal(upgradeGame.exportSave(), beforeInvalidImport, "33. Invalid structure does not damage current state");
upgradeGame.reset();
state = upgradeGame.getState();
assert.equal(state.gold, 0, "34. Reset clears Gold");
assert.equal(state.stage, 1);
assert.equal(state.lutie.level, 1);
assert.equal(state.stars, 0);
assert.equal(state.manaStones.length, 0);
assert.equal(state.guardians.filter((guardian) => guardian.discovered || guardian.activeThisRun).length, 0);
assert.equal(state.progression.farmingBeforeBoss, false);
assert.equal(state.run.nazarEscalation, 0);
assert.equal(upgradeGame.getTotalDps(), 1);

console.log("v0.2 smoke test passed: 34 progression, combat, persistence, migration, and economy checks.");

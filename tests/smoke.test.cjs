const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const uiSource = fs.readFileSync(path.join(root, "ui.js"), "utf8");
const pagesWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "deploy-pages.yml"), "utf8");
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const uiIds = [...uiSource.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]);
assert.deepEqual(uiIds.filter((id) => !htmlIds.has(id)), [], "Every UI binding resolves to index.html");
assert.equal((html.match(/data-tab="/g) || []).length, 5, "Five bottom navigation buttons are present");
assert.equal((html.match(/data-panel="/g) || []).length, 5, "Five persistent-content tab panels are present");
assert.match(uiSource, /monster\.type === "nazar" \? "\?\?\? \/ \?\?\?"/, "Nazar HP is hidden in the UI");
assert.match(html, /id="stonePicker"/, "Guardian Mana Stone picker overlay is present");
assert.doesNotMatch(uiSource, /data-stone-select/, "Legacy Mana Stone dropdown rendering is removed");
assert.match(uiSource, /data-upgrade-cost/, "Guardian upgrade controls render their shared quote cost");
assert.match(uiSource, /render\(state, event\)/, "Subscriber passes event context into incremental rendering");
const guardianRebuildSource = uiSource.match(/const rebuildGuardians = ([\s\S]*?);\n    if \(rebuildGuardians\)/)[1];
assert.doesNotMatch(guardianRebuildSource, /autoAttack|tap|skillAttack/, "Combat events never rebuild Guardian card DOM");
assert.match(uiSource, /if \(openStonePickerGuardianId && \[/, "Open picker state is preserved and selectively refreshed");
assert.doesNotMatch(html, /(?:href|src)="\//, "Page assets never assume the domain root");
assert.doesNotMatch(css, /url\(\s*["']?\//, "CSS assets never assume the domain root");
assert.match(pagesWorkflow, /branches:\s*\n\s*- main/);
assert.match(pagesWorkflow, /workflow_dispatch:/);
assert.match(pagesWorkflow, /contents: read[\s\S]*pages: write[\s\S]*id-token: write/);
assert.match(pagesWorkflow, /actions\/checkout@v7/);
assert.match(pagesWorkflow, /actions\/configure-pages@v6/);
assert.match(pagesWorkflow, /actions\/upload-pages-artifact@v5/);
assert.match(pagesWorkflow, /actions\/deploy-pages@v5/);

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

// Normalized Guardian source stats and derived DPS.
assert.equal(context.Balance.constants.GUARDIAN_BASE_DPS, 11, "All Guardians use the named median base DPS");
assert.equal(new Set(context.GameData.GUARDIAN_DEFINITIONS.map((guardian) => guardian.baseDps)).size, 1, "Guardian-specific 2–20 base DPS variance is removed");
const normalizedGuardianSeed = JSON.parse(game.exportSave());
normalizedGuardianSeed.guardians.forEach((guardian, index) => {
  guardian.discovered = true;
  guardian.unlocked = true;
  guardian.activeThisRun = true;
  guardian.level = 7 + index;
  guardian.reincarnationLevel = 0;
  guardian.equippedManaStoneId = null;
});
normalizedGuardianSeed.artifacts.dps.level = 0;
normalizedGuardianSeed.manaStones = [];
const normalizedGuardianGame = createStartedGame(new MemoryAdapter(normalizedGuardianSeed));
assert.deepEqual(normalizedGuardianGame.getState().guardians.map((guardian) => guardian.level), Array.from({ length: 10 }, (_, index) => 7 + index), "Existing save Guardian levels remain intact");
for (const level of [1, 10, 50]) {
  const sameLevelSave = JSON.parse(normalizedGuardianGame.exportSave());
  sameLevelSave.guardians.forEach((guardian) => { guardian.level = level; });
  assert.equal(normalizedGuardianGame.importSave(JSON.stringify(sameLevelSave)).ok, true);
  assert.equal(new Set(normalizedGuardianGame.getState().guardians.map((guardian) => normalizedGuardianGame.getGuardianFinalDps(guardian.id))).size, 1, `All Guardians have identical DPS at Lv.${level}`);
}
assert.equal(context.Balance.guardianBaseDps(1, context.Balance.constants.GUARDIAN_BASE_DPS), 2);
assert.equal(context.Balance.guardianBaseDps(10, context.Balance.constants.GUARDIAN_BASE_DPS), 37);
assert.equal(context.Balance.guardianBaseDps(50, context.Balance.constants.GUARDIAN_BASE_DPS), 741);

// Normal-monster Gold variance uses the injected RNG and remains centered.
assert.equal(context.Balance.constants.NORMAL_MONSTER_GOLD_VARIANCE, 0.10);
const minimumGoldGame = createStartedGame(new MemoryAdapter(), { random: () => 0, now: () => clock });
const maximumGoldGame = createStartedGame(new MemoryAdapter(), { random: () => 1 - Number.EPSILON, now: () => clock });
assert.equal(minimumGoldGame.rollNormalMonsterGold(100), 90, "Normal Gold never falls below -10%");
assert.equal(maximumGoldGame.rollNormalMonsterGold(100), 110, "Normal Gold never exceeds +10%");
const deterministicGoldA = createStartedGame(new MemoryAdapter(), { random: () => 0.37, now: () => clock });
const deterministicGoldB = createStartedGame(new MemoryAdapter(), { random: () => 0.37, now: () => clock });
assert.equal(deterministicGoldA.rollNormalMonsterGold(100), deterministicGoldB.rollNormalMonsterGold(100), "Injected RNG reproduces the same Gold reward");
let goldSampleIndex = 0;
const centeredGoldGame = createStartedGame(new MemoryAdapter(), { random: () => (goldSampleIndex++ + 0.5) / 21, now: () => clock });
const centeredRewards = Array.from({ length: 21 }, () => centeredGoldGame.rollNormalMonsterGold(100));
assert.equal(centeredRewards.reduce((sum, reward) => sum + reward, 0) / centeredRewards.length, 100, "Uniform integer outcomes average exactly to base Gold");
assert.ok(centeredRewards.every((reward) => reward >= 90 && reward <= 110));
const normalRewardSeed = JSON.parse(game.exportSave());
normalRewardSeed.stage = 50;
normalRewardSeed.gold = 0;
normalRewardSeed.monster = { type: "normal", hp: 1, guardianId: null };
const normalRewardRolls = [0, 0.99];
const normalRewardGame = createStartedGame(new MemoryAdapter(normalRewardSeed), { random: () => normalRewardRolls.shift() ?? 0.99, now: () => clock });
const stage50BaseGold = context.Balance.monsterGold(50);
normalRewardGame.attack();
assert.equal(normalRewardGame.getState().gold, stage50BaseGold - Math.floor(stage50BaseGold * 0.10), "Normal-monster defeat applies the rolled reward through combat");
const mimicRewardSeed = { ...normalRewardSeed, monster: { type: "mimic", hp: 1, guardianId: null } };
const mimicRewardGame = createStartedGame(new MemoryAdapter(mimicRewardSeed), { random: () => 0, now: () => clock });
mimicRewardGame.attack();
assert.equal(mimicRewardGame.getState().gold, context.Balance.mimicGold(50), "Mimic Gold remains fixed and bypasses normal variance");
const regionRewardSeed = { ...normalRewardSeed, monster: { type: "regionBoss", hp: 1, guardianId: null } };
const regionRewardGame = createStartedGame(new MemoryAdapter(regionRewardSeed), { random: () => 0, now: () => clock });
regionRewardGame.attack();
assert.equal(regionRewardGame.getState().gold, stage50BaseGold, "Region Boss Gold remains fixed and bypasses normal variance");

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
assert.equal(firstGuardian.acquisitionOrder, 1);

const twoGuardianState = JSON.parse(game.exportSave());
const secondGuardian = twoGuardianState.guardians.find((guardian) => guardian.id !== firstGuardian.id);
secondGuardian.discovered = true;
secondGuardian.unlocked = true;
secondGuardian.activeThisRun = true;
assert.equal(game.importSave(JSON.stringify(twoGuardianState)).ok, true);
const expectedGuardianDps = game.getGuardianFinalDps(firstGuardian.id) + game.getGuardianFinalDps(secondGuardian.id);
assert.equal(game.getTotalGuardianDps(), expectedGuardianDps, "6. Multiple Guardian DPS values are summed");
assert.equal(game.getTotalDps(), 1 + expectedGuardianDps);
const acquiredView = context.GameData.sortGuardianView(game.getState().guardians, "ACQUIRED");
assert.ok(acquiredView.slice(0, 2).every((guardian) => guardian.discovered), "Acquired Guardians render before undiscovered slots");
assert.deepEqual(acquiredView.slice(0, 2).map((guardian) => guardian.acquisitionOrder), [1, 2], "ACQUIRED sort uses stable acquisition order");
const nameView = context.GameData.sortGuardianView(game.getState().guardians, "NAME");
assert.deepEqual(nameView.slice(0, 2).map((guardian) => guardian.name), nameView.slice(0, 2).map((guardian) => guardian.name).sort(), "NAME sort orders acquired Guardians by name");
const groupView = context.GameData.sortGuardianView(game.getState().guardians, "GROUP");
assert.deepEqual(groupView.slice(0, 2).map((guardian) => guardian.group), groupView.slice(0, 2).map((guardian) => guardian.group).sort(), "GROUP sort orders acquired Guardians by group");

// 7-10 and 29-30: Region Boss, timeout, farming, retry, persistence.
reachStage(game, 10);
for (let index = 0; index < 9; index++) defeatCurrent(game);
state = game.getState();
assert.equal(state.monster.type, "regionBoss", "7. Stage 10 is a Region Boss");
assert.equal(state.boss.timeRemainingMs, 30000, "8. Region Boss timer starts at 30 seconds");
game.bossTimerTick(state.boss.deadlineAt);
state = game.getState();
assert.equal(state.stage, 10, "9. Timeout farms the same Region stage");
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
const stonesBeforeBoss = state.manaStones.length;
defeatCurrent(restored);
state = restored.getState();
assert.equal(state.manaStones.length, stonesBeforeBoss + 1, "Region Boss always grants one Mana Stone");
assert.equal(state.manaStones.at(-1).level, 10, "Region Boss Stone level matches Boss Stage");
assert.equal(state.manaStones.at(-1).rarity, "NORMAL", "Region Boss gives NORMAL unless the HIGH roll succeeds");

reachStage(restored, 15);
assert.equal(restored.getState().monster.type, "guardian");
assert.equal(restored.giveUpBoss(), true, "GIVE UP immediately exits a timed encounter");
assert.equal(restored.getState().stage, 14);
assert.equal(restored.getState().progression.farmingBeforeBoss, true);
for (let index = 0; index < 12; index += 1) defeatCurrent(restored);
assert.equal(restored.getState().stage, 14, "Farming never re-enters the encounter automatically");
assert.equal(restored.challengeBoss(), true);
assert.equal(restored.getState().stage, 15, "CHALLENGE BOSS retries after GIVE UP");

// 11-14: Mimic, stone creation, equip, cap.
const mimicAdapter = new MemoryAdapter();
const mimicGame = createStartedGame(mimicAdapter, { random: () => 0, now: () => clock });
defeatCurrent(mimicGame);
assert.equal(mimicGame.getState().monster.type, "mimic", "11. Mimic spawn roll is deterministic");
assert.notEqual(mimicGame.getState().monster.type, "nazar", "Normal progression never spawns Nazar");
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
equipmentState.manaStones = [
  { ...generatedStone, id: "stone-cap-test", level: 100, equippedGuardianId: null },
  { ...generatedStone, id: "stone-exclusive-test", level: 3, rarity: "HIGH", equippedGuardianId: null }
];
assert.equal(game.importSave(JSON.stringify(equipmentState)).ok, true);
assert.equal(game.equipManaStone("stone-cap-test", firstGuardian.id), true, "13. Mana Stone equips to a Guardian");
assert.equal(game.getState().guardians.find((guardian) => guardian.id === firstGuardian.id).equippedManaStoneId, "stone-cap-test");
assert.equal(game.getEffectiveStoneLevel(game.getState().manaStones[0]), 6, "14. Stone effective level is capped by Stage");
assert.equal(game.unequipManaStone("stone-cap-test"), true, "13. Mana Stone unequips");
assert.equal(game.getState().manaStones[0].equippedGuardianId, null);
assert.equal(game.equipManaStone("stone-cap-test", firstGuardian.id), true);
assert.equal(game.equipManaStone("stone-cap-test", secondGuardian.id), true, "Equipping a Stone to another Guardian moves it");
assert.equal(game.getState().guardians.find((guardian) => guardian.id === firstGuardian.id).equippedManaStoneId, null);
assert.equal(game.getState().guardians.find((guardian) => guardian.id === secondGuardian.id).equippedManaStoneId, "stone-cap-test");
assert.equal(game.equipManaStone("stone-exclusive-test", secondGuardian.id), true, "A Guardian accepts only one Stone");
assert.equal(game.getState().manaStones.find((stone) => stone.id === "stone-cap-test").equippedGuardianId, null);
assert.equal(game.getState().manaStones.find((stone) => stone.id === "stone-exclusive-test").equippedGuardianId, secondGuardian.id);

// 15-16: Nazar eligibility and escalating HP.
const nazarSeed = JSON.parse(game.exportSave());
nazarSeed.stage = 10;
nazarSeed.progression.farmingBeforeBoss = true;
nazarSeed.progression.bossRetryAvailable = true;
nazarSeed.progression.pendingBossStage = 10;
nazarSeed.progression.pendingEncounterType = "regionBoss";
nazarSeed.run.nazarEscalation = 0;
nazarSeed.monster = { type: "normal", name: "Mossling", isBoss: false, isTimed: false, guardianId: null, hp: context.Balance.monsterBaseHp(10), maxHp: context.Balance.monsterBaseHp(10) };
nazarSeed.guardians.forEach((guardian, index) => { if (index < 2) { guardian.discovered = true; guardian.activeThisRun = true; guardian.unlocked = true; guardian.level = 20; } });
const nazarRolls = [0.99, 0, 0];
const nazarGame = createStartedGame(new MemoryAdapter(nazarSeed), { random: () => nazarRolls.length ? nazarRolls.shift() : 0, now: () => clock });
assert.equal(nazarGame.isNazarEligible(), true, "15. Nazar indicator condition is calculated from farming DPS");
const noNazarGame = createStartedGame(new MemoryAdapter(nazarSeed), { random: () => 0.11, now: () => clock });
defeatCurrent(noNazarGame);
assert.equal(noNazarGame.getState().monster.type, "normal", "A roll above the named 10% chance does not spawn Nazar");
defeatCurrent(nazarGame);
assert.equal(nazarGame.getState().monster.type, "nazar", "15. Eligible farming spawn can become Nazar");
const firstNazarHp = nazarGame.getState().monster.maxHp;
const goldBeforeNazar = nazarGame.getState().gold;
const stonesBeforeNazar = nazarGame.getState().manaStones.length;
const killsBeforeNazar = nazarGame.getState().killsInStage;
defeatCurrent(nazarGame);
assert.equal(nazarGame.getState().monster.type, "nazar");
assert.equal(nazarGame.getState().gold, goldBeforeNazar, "Nazar gives zero Gold");
assert.equal(nazarGame.getState().manaStones.length, stonesBeforeNazar, "Nazar gives zero drops");
assert.equal(nazarGame.getState().killsInStage, killsBeforeNazar, "Nazar does not advance normal kill progression");
assert.equal(nazarGame.getState().monster.maxHp, firstNazarHp * 2, "16. Repeated Nazar HP escalates x2");
defeatCurrent(nazarGame);
assert.equal(nazarGame.getState().monster.maxHp, firstNazarHp * 4, "16. Nazar HP sequence continues 2x → 4x → 8x");
defeatCurrent(nazarGame);
assert.equal(nazarGame.getState().monster.maxHp, firstNazarHp * 8, "16. Nazar HP sequence continues to 16x");
assert.equal(context.Balance.constants.NAZAR_CHANCE, 0.10, "Natural Nazar chance is the named 10% tuning value");
assert.equal(context.Balance.constants.MIMIC_CHANCE, 0.01, "Mimic chance is tuned to 1%");

const forceSeed = JSON.parse(game.exportSave());
forceSeed.stage = 10;
forceSeed.killsInStage = 8;
forceSeed.progression.farmingBeforeBoss = true;
forceSeed.progression.bossRetryAvailable = true;
forceSeed.progression.pendingBossStage = 10;
forceSeed.progression.pendingEncounterType = "regionBoss";
forceSeed.run.nazarEscalation = 0;
forceSeed.monster = { type: "normal", hp: context.Balance.monsterBaseHp(9), guardianId: null };
const forceAdapter = new MemoryAdapter(forceSeed);
const forceGame = createStartedGame(forceAdapter);
assert.equal(game.forceNazar(), false, "FORCE NAZAR is unavailable outside farming");
assert.equal(forceGame.forceNazar(), true, "FORCE NAZAR works while farming without activation condition");
assert.equal(forceGame.getState().monster.type, "nazar");
assert.equal(forceGame.forceNazar(), false, "FORCE NAZAR never creates a duplicate active Nazar");
const forcedReload = createStartedGame(forceAdapter);
assert.equal(forcedReload.getState().monster.type, "nazar", "Forced Nazar survives the normal save/load path");
assert.equal(forcedReload.getState().stage, 10);
assert.equal(forcedReload.getState().killsInStage, 8);

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
const sevenLevelGold = Array.from({ length: 7 }, (_, index) => context.Balance.lutieUpgradeCost(index + 1)).reduce((sum, cost) => sum + cost, 0);
const insufficientSeed = JSON.parse(bonusGame.exportSave());
insufficientSeed.gold = sevenLevelGold;
insufficientSeed.lutie.level = 1;
const insufficientGame = createStartedGame(new MemoryAdapter(insufficientSeed));
assert.deepEqual(clone(insufficientGame.getUpgradeQuote("lutie", 10)), { levels: 0, totalCost: exactTenCost }, "+10 displays its exact cost but is disabled when all ten levels are unaffordable");
assert.equal(insufficientGame.upgradeLutie(10), false);
assert.equal(insufficientGame.getState().lutie.level, 1, "+10 never performs a partial purchase");
const guardianBulkSeed = JSON.parse(bonusGame.exportSave());
const bulkGuardian = guardianBulkSeed.guardians.find((guardian) => guardian.activeThisRun);
bulkGuardian.level = 1;
const guardianTenCost = Array.from({ length: 10 }, (_, index) => context.Balance.guardianUpgradeCost(index + 1, bulkGuardian.unlockOrder)).reduce((sum, cost) => sum + cost, 0);
guardianBulkSeed.gold = 1_000_000;
const guardianBulkGame = createStartedGame(new MemoryAdapter(guardianBulkSeed));
const guardianOneQuote = guardianBulkGame.getUpgradeQuote("guardian", 1, bulkGuardian.id);
const goldBeforeGuardianOne = guardianBulkGame.getState().gold;
assert.equal(guardianBulkGame.upgradeGuardian(bulkGuardian.id, 1), true);
assert.equal(goldBeforeGuardianOne - guardianBulkGame.getState().gold, guardianOneQuote.totalCost, "Guardian +1 displayed cost matches Gold spent");
const guardianTenQuote = guardianBulkGame.getUpgradeQuote("guardian", 10, bulkGuardian.id);
const expectedGuardianTenFromLevelTwo = Array.from({ length: 10 }, (_, index) => context.Balance.guardianUpgradeCost(index + 2, bulkGuardian.unlockOrder)).reduce((sum, cost) => sum + cost, 0);
assert.equal(guardianTenQuote.totalCost, expectedGuardianTenFromLevelTwo);
const goldBeforeGuardianTen = guardianBulkGame.getState().gold;
assert.equal(guardianBulkGame.upgradeGuardian(bulkGuardian.id, 10), true, "Guardian +10 purchases exactly ten levels");
assert.equal(guardianBulkGame.getState().guardians.find((guardian) => guardian.id === bulkGuardian.id).level, 12);
assert.equal(goldBeforeGuardianTen - guardianBulkGame.getState().gold, guardianTenQuote.totalCost, "Guardian +10 displayed cumulative cost matches Gold spent");
const guardianMaxQuote = guardianBulkGame.getUpgradeQuote("guardian", "max", bulkGuardian.id);
const levelBeforeGuardianMax = guardianBulkGame.getState().guardians.find((guardian) => guardian.id === bulkGuardian.id).level;
const goldBeforeGuardianMax = guardianBulkGame.getState().gold;
const dpsBeforeGuardianMax = guardianBulkGame.getGuardianFinalDps(bulkGuardian.id);
let upgradeEvent = null;
guardianBulkGame.subscribe((snapshot, event) => { if (event.type === "upgradeGuardian") upgradeEvent = { snapshot, event }; });
assert.equal(guardianBulkGame.upgradeGuardian(bulkGuardian.id, "max"), true);
const guardianAfterMax = guardianBulkGame.getState().guardians.find((guardian) => guardian.id === bulkGuardian.id);
assert.equal(guardianAfterMax.level - levelBeforeGuardianMax, guardianMaxQuote.levels, "Guardian MAX displayed level count matches purchased levels");
assert.equal(goldBeforeGuardianMax - guardianBulkGame.getState().gold, guardianMaxQuote.totalCost, "Guardian MAX displayed cost matches Gold spent");
assert.ok(guardianBulkGame.getGuardianFinalDps(bulkGuardian.id) > dpsBeforeGuardianMax, "Guardian DPS is recalculated immediately after upgrade");
assert.equal(guardianBulkGame.getUpgradeQuote("guardian", 1, bulkGuardian.id).totalCost, context.Balance.guardianUpgradeCost(guardianAfterMax.level, bulkGuardian.unlockOrder), "Next displayed cost is refreshed from the upgraded level");
assert.equal(upgradeEvent.snapshot.guardians.find((guardian) => guardian.id === bulkGuardian.id).level, guardianAfterMax.level, "Upgrade event immediately exposes the updated Guardian level");
assert.equal(upgradeEvent.event.totalCost, guardianMaxQuote.totalCost);

const guardianInsufficientSeed = JSON.parse(bonusGame.exportSave());
const insufficientGuardian = guardianInsufficientSeed.guardians.find((guardian) => guardian.activeThisRun);
insufficientGuardian.level = 1;
guardianInsufficientSeed.gold = guardianTenCost - 1;
const guardianInsufficientGame = createStartedGame(new MemoryAdapter(guardianInsufficientSeed));
assert.deepEqual(clone(guardianInsufficientGame.getUpgradeQuote("guardian", 10, insufficientGuardian.id)), { levels: 0, totalCost: guardianTenCost }, "Guardian +10 keeps the exact cumulative display cost when disabled");
assert.equal(guardianInsufficientGame.upgradeGuardian(insufficientGuardian.id, 10), false);

const developerGoldBefore = guardianInsufficientGame.getState().gold;
assert.equal(guardianInsufficientGame.addDeveloperGold(), true);
assert.equal(guardianInsufficientGame.getState().gold, developerGoldBefore + 100000, "+100K GOLD adds exactly 100,000 and uses normal state persistence");

// 29: general save/load.
const upgradeAdapter = new MemoryAdapter(JSON.parse(upgradeGame.exportSave()));
const saveRoundTrip = createStartedGame(upgradeAdapter);
assert.equal(saveRoundTrip.getState().lutie.level, upgradeGame.getState().lutie.level, "29. Save/load preserves progression");

// 31: v1/v2 -> v3 migration.
const v1 = {
  saveVersion: 1, updatedAt: "2026-01-01T00:00:00.000Z", gold: 123, stage: 9, killsInStage: 4,
  lutie: { level: 7, tap: 8 }, guardians: [{ id: "ember", level: 3, dps: 7 }],
  progression: { guardianUnlocked: true, bossRetryAvailable: true, farmingBeforeBoss: true, pendingBossStage: 10, v01Cleared: false, clearSeen: false },
  boss: { timeRemainingMs: null, deadlineAt: null },
  monster: { name: "Mossling", isBoss: false, hp: 12, maxHp: context.Balance.monsterBaseHp(9) }
};
const migrated = createStartedGame(new MemoryAdapter(v1)).getState();
assert.equal(migrated.saveVersion, 6, "31. v1 save migrates to v6");
assert.equal(migrated.gold, 123);
assert.equal(migrated.stage, 10);
assert.equal(migrated.lutie.level, 7);
assert.equal(migrated.guardians[0].level, 3);
assert.equal(migrated.guardians[0].activeThisRun, true);
assert.equal(migrated.progression.farmingBeforeBoss, true);
assert.equal(migrated.updatedAt.slice(0, 4), "2026", "Migration keeps the previous updatedAt until next save writes a fresh timestamp");
const v2 = JSON.parse(game.exportSave());
v2.saveVersion = 2;
v2.guardians.forEach((guardian) => { delete guardian.acquisitionOrder; });
v2.guardians[0].discovered = true;
v2.guardians[0].activeThisRun = true;
v2.guardians[0].level = 17;
v2.guardians[0].reincarnationLevel = 3;
v2.guardians[0].equippedManaStoneId = "v2-stone";
v2.manaStones = [{ id: "v2-stone", level: 20, rarity: "HIGH", power: context.Balance.constants.MANA_STONE_POWER_HIGH, equippedGuardianId: v2.guardians[0].id }];
const migratedV2Adapter = new MemoryAdapter(v2);
const migratedV2Game = createStartedGame(migratedV2Adapter);
const migratedV2 = migratedV2Game.getState();
assert.equal(migratedV2.saveVersion, 6, "v0.2 save migrates to v6");
assert.equal(migratedV2.guardians[0].level, 17);
assert.equal(migratedV2.guardians[0].reincarnationLevel, 3);
assert.equal(migratedV2.guardians[0].equippedManaStoneId, "v2-stone");
assert.equal(migratedV2.guardians[0].acquisitionOrder, 1, "Migration creates deterministic acquisitionOrder");
const migratedV2Reload = createStartedGame(migratedV2Adapter).getState();
assert.equal(migratedV2Reload.guardians[0].acquisitionOrder, 1, "acquisitionOrder survives save/load");

const legacyDerived = JSON.parse(game.exportSave());
legacyDerived.saveVersion = 3;
legacyDerived.lutie.level = 12;
legacyDerived.lutie.tap = 999999;
legacyDerived.guardians[0].discovered = true;
legacyDerived.guardians[0].activeThisRun = true;
legacyDerived.guardians[0].unlocked = true;
legacyDerived.guardians[0].level = 7;
legacyDerived.guardians[0].dps = 999999;
legacyDerived.guardians[0].baseDps = 999999;
legacyDerived.guardians[0].name = "Stale Guardian";
legacyDerived.manaStones = [{ id: "legacy-power", level: 8, rarity: "NORMAL", power: 999, equippedGuardianId: legacyDerived.guardians[0].id }];
legacyDerived.guardians[0].equippedManaStoneId = "legacy-power";
legacyDerived.monster.maxHp = 999999;
const derivedAdapter = new MemoryAdapter(legacyDerived);
const derivedGame = createStartedGame(derivedAdapter);
const hydratedGuardian = derivedGame.getState().guardians[0];
const guardianDefinition = context.GameData.GUARDIAN_DEFINITIONS[0];
assert.equal(hydratedGuardian.level, 7, "Guardian source level is preserved");
assert.equal(hydratedGuardian.baseDps, guardianDefinition.baseDps, "Legacy baseDps cannot override current definitions");
assert.equal(hydratedGuardian.name, guardianDefinition.name);
assert.notEqual(derivedGame.getGuardianFinalDps(hydratedGuardian.id), 999999, "Legacy saved DPS never overrides current balance formula");
assert.equal(derivedGame.getTotalTap(), context.Balance.lutieTap(12), "Legacy saved TAP never overrides current balance formula");
assert.equal(derivedGame.getState().manaStones[0].power, context.Balance.manaStonePowerForRarity("NORMAL"), "Mana Stone power is rehydrated from current balance");
assert.equal(derivedGame.getState().monster.maxHp, context.Balance.monsterBaseHp(derivedGame.getState().stage), "Monster max HP is rehydrated from current balance");
assert.equal(derivedAdapter.data.guardians[0].dps, undefined, "Persistent payload omits Guardian DPS");
assert.equal(derivedAdapter.data.guardians[0].baseDps, undefined, "Persistent payload omits static Guardian baseDps");
assert.equal(derivedAdapter.data.lutie.tap, undefined, "Persistent payload omits Lutie TAP");
assert.equal(derivedAdapter.data.manaStones[0].power, undefined, "Persistent payload omits derived Stone power");
assert.equal(derivedAdapter.data.monster.maxHp, undefined, "Persistent payload omits monster max HP");

// 32-34: export, invalid import, complete reset.
const exported = upgradeGame.exportSave();
assert.equal(JSON.parse(exported).saveVersion, 6, "32. Export produces valid JSON");
const beforeInvalidImport = upgradeGame.exportSave();
assert.equal(upgradeGame.importSave("{bad json").ok, false);
assert.equal(upgradeGame.exportSave(), beforeInvalidImport, "33. Invalid JSON does not damage current state");
assert.equal(upgradeGame.importSave(JSON.stringify({ saveVersion: 4, gold: "bad" })).ok, false);
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

console.log("v0.3 legacy smoke test passed: normalized Guardian DPS, centered normal Gold variance, Pages workflow, and prior coverage.");

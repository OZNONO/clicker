const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const uiSource = fs.readFileSync(path.join(root, "ui.js"), "utf8");
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const uiIds = [...uiSource.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]);
assert.deepEqual(uiIds.filter((id) => !htmlIds.has(id)), [], "Every UI binding resolves to an element in index.html");

const memory = new Map();
const localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};
const context = vm.createContext({ console, Date, JSON, Math, Map, Set, setInterval, clearInterval, localStorage });
context.window = context;

for (const file of ["balance.js", "storage.js", "game.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}

const adapter = context.GameStorage.createDefault();
const game = context.LutieGame.createGame(adapter);
game.start();
game.stop();

let state = game.getState();
assert.equal(state.stage, 1);
assert.equal(state.gold, 0);
assert.equal(state.lutie.tap, 1);
assert.equal(state.monster.maxHp, 10);
assert.equal(game.getTotalDps(), 1, "A new game starts with Total DPS 1");

game.autoAttack();
assert.equal(game.getState().monster.hp, 9, "Base DPS damages the monster before Guardian unlock");

for (let i = 0; i < 9; i += 1) game.tap();
state = game.getState();
assert.equal(state.killsInStage, 1, "Stage 1 monster dies from ten 1-damage taps");
assert.equal(state.gold, 2, "Stage 1 monster awards gold");

while (game.getState().gold < 10) game.tap();
assert.equal(game.upgradeLutie(), true, "Gold purchases a Lutie upgrade");
state = game.getState();
assert.equal(state.lutie.level, 2);
assert.equal(state.lutie.tap, 2);

let guard = 0;
while (game.getState().stage < 5 && guard++ < 10000) game.tap();
assert.equal(game.getState().stage, 5, "Ten normal kills per stage lead to Stage 5");
assert.equal(game.getState().monster.isBoss, true);
assert.equal(game.getState().monster.maxHp, context.Balance.monsterBaseHp(5) * 5);
assert.equal(game.getState().boss.timeRemainingMs, 30000, "Boss timer starts at 30 seconds");

while (game.getState().stage === 5 && guard++ < 10000) game.tap();
state = game.getState();
assert.equal(state.stage, 6, "Stage 5 boss advances the game");
assert.equal(state.guardians.length, 1, "Stage 5 boss unlocks the first Guardian");
assert.equal(state.guardians[0].dps, 2);

const hpBeforeAutoAttack = state.monster.hp;
game.autoAttack();
state = game.getState();
assert.equal(state.monster.hp, hpBeforeAutoAttack - 3, "Base and Guardian DPS are combined for automatic attacks");
assert.equal(game.upgradeGuardian(), true, "Gold purchases a Guardian upgrade after unlock");
assert.equal(game.getState().guardians[0].dps, context.Balance.guardianDps(2));

while (game.getState().stage < 10 && guard++ < 100000) game.tap();
state = game.getState();
assert.ok(guard < 100000, "Progression reaches the Stage 10 boss within the safety limit");
assert.equal(state.stage, 10);
assert.equal(state.boss.timeRemainingMs, 30000);

game.bossTimerTick(state.boss.deadlineAt);
state = game.getState();
assert.equal(state.stage, 9, "Stage 10 timeout returns to Stage 9");
assert.equal(state.progression.farmingBeforeBoss, true, "Boss timeout enters farming state");
assert.equal(state.progression.bossRetryAvailable, true);
assert.equal(state.progression.pendingBossStage, 10);

const restored = context.LutieGame.createGame(context.GameStorage.createDefault());
restored.start();
restored.stop();
state = restored.getState();
assert.equal(state.stage, 9, "Farming stage survives save/load");
assert.equal(state.progression.bossRetryAvailable, true, "Boss retry survives save/load");
assert.equal(state.progression.pendingBossStage, 10);

const goldBeforeFarming = state.gold;
let farmingKills = 0;
while (farmingKills < 21 && guard++ < 100000) {
  const beforeGold = restored.getState().gold;
  restored.tap();
  if (restored.getState().gold > beforeGold) farmingKills += 1;
}
state = restored.getState();
assert.equal(state.stage, 9, "Repeated farming kills never enter the boss automatically");
assert.ok(state.gold > goldBeforeFarming);
assert.equal(state.progression.bossRetryAvailable, true);

assert.equal(restored.challengeBoss(), true, "Challenge Boss starts the pending boss again");
state = restored.getState();
assert.equal(state.stage, 10);
assert.equal(state.monster.hp, context.Balance.monsterMaxHp(10), "Retry restores full boss HP");
assert.equal(state.boss.timeRemainingMs, 30000, "Retry resets the boss timer");

while (restored.getState().stage === 10 && guard++ < 100000) restored.tap();
state = restored.getState();
assert.ok(guard < 100000);
assert.equal(state.stage, 11, "Defeating the Stage 10 boss continues to Stage 11");
assert.equal(state.progression.farmingBeforeBoss, false, "Boss victory clears farming state");
assert.equal(state.progression.bossRetryAvailable, false);
assert.equal(state.progression.pendingBossStage, null);
assert.equal(state.progression.v01Cleared, true, "Stage 10 sets the v0.1 clear milestone");
assert.equal(state.progression.clearSeen, false, "Clear screen remains pending until acknowledged");

restored.reset();
state = restored.getState();
assert.equal(state.gold, 0, "Reset clears gold");
assert.equal(state.stage, 1, "Reset returns to Stage 1");
assert.equal(state.killsInStage, 0);
assert.equal(state.lutie.level, 1);
assert.equal(state.guardians.length, 0);
assert.deepEqual(JSON.parse(JSON.stringify(state.progression)), {
  guardianUnlocked: false,
  v01Cleared: false,
  clearSeen: false,
  bossRetryAvailable: false,
  farmingBeforeBoss: false,
  pendingBossStage: null
}, "Reset clears every progression flag");
assert.equal(restored.getTotalDps(), 1);

const seeded = JSON.parse(memory.get(context.GameStorage.STORAGE_KEY));
const exactTenCost = Array.from({ length: 10 }, (_, index) => context.Balance.lutieUpgradeCost(1 + index))
  .reduce((sum, cost) => sum + cost, 0);
seeded.gold = exactTenCost;
memory.set(context.GameStorage.STORAGE_KEY, JSON.stringify(seeded));
const bulkGame = context.LutieGame.createGame(context.GameStorage.createDefault());
bulkGame.start();
bulkGame.stop();
assert.deepEqual(JSON.parse(JSON.stringify(bulkGame.getUpgradeQuote("lutie", 10))), { levels: 10, totalCost: exactTenCost }, "x10 sums each real level cost");
assert.equal(bulkGame.upgradeLutie(10), true);
assert.equal(bulkGame.getState().lutie.level, 11);
assert.equal(bulkGame.getState().gold, 0);

const maxSeed = bulkGame.getState();
maxSeed.gold = 1000;
memory.set(context.GameStorage.STORAGE_KEY, JSON.stringify(maxSeed));
const maxGame = context.LutieGame.createGame(context.GameStorage.createDefault());
maxGame.start();
maxGame.stop();
const maxQuote = maxGame.getUpgradeQuote("lutie", "max");
const goldBeforeMax = maxGame.getState().gold;
assert.ok(maxQuote.levels > 0);
assert.equal(maxGame.upgradeLutie("max"), true);
state = maxGame.getState();
assert.equal(state.gold, goldBeforeMax - maxQuote.totalCost, "MAX spends exactly the quoted sequential cost");
assert.ok(state.gold >= 0, "MAX never overspends current gold");
assert.ok(context.Balance.lutieUpgradeCost(state.lutie.level) > state.gold, "MAX stops before an unaffordable level");

console.log("Smoke test passed: base DPS, boss timeout/farming/retry, bulk upgrades, reset, Stage 10 clear, and save/load.");

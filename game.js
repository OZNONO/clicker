(function (global) {
  "use strict";

  function createGame(storageAdapter) {
    const listeners = new Set();
    let state;
    let autoAttackTimer = null;
    let bossTimer = null;
    let running = false;

    function createMonster(stage) {
      const boss = Balance.isBossStage(stage);
      const maxHp = Balance.monsterMaxHp(stage);
      const names = ["Mossling", "Cave Puff", "Bramblekin", "Moon Slime"];
      return {
        name: boss ? `Floor ${stage} Warden` : names[(stage - 1) % names.length],
        isBoss: boss,
        hp: maxHp,
        maxHp
      };
    }

    function initialState() {
      return {
        saveVersion: Balance.constants.SAVE_VERSION,
        updatedAt: new Date().toISOString(),
        gold: 0,
        stage: 1,
        killsInStage: 0,
        lutie: { level: 1, tap: Balance.lutieTap(1) },
        guardians: [],
        progression: {
          guardianUnlocked: false,
          v01Cleared: false,
          clearSeen: false,
          bossRetryAvailable: false,
          farmingBeforeBoss: false,
          pendingBossStage: null
        },
        boss: { timeRemainingMs: null, deadlineAt: null },
        monster: createMonster(1)
      };
    }

    function normalize(saved) {
      if (!saved || saved.saveVersion !== Balance.constants.SAVE_VERSION) return initialState();
      const base = initialState();
      const next = {
        ...base,
        ...saved,
        lutie: { ...base.lutie, ...(saved.lutie || {}) },
        guardians: Array.isArray(saved.guardians) ? saved.guardians : [],
        progression: { ...base.progression, ...(saved.progression || {}) },
        boss: { ...base.boss, ...(saved.boss || {}) }
      };
      next.lutie.tap = Balance.lutieTap(next.lutie.level);
      next.guardians = next.guardians.map((guardian) => ({
        ...guardian,
        dps: Balance.guardianDps(guardian.level)
      }));
      const expectedMaxHp = Balance.monsterMaxHp(next.stage);
      if (!next.monster || next.monster.maxHp !== expectedMaxHp) next.monster = createMonster(next.stage);
      next.monster.hp = Math.max(1, Math.min(next.monster.hp, next.monster.maxHp));
      if (!next.monster.isBoss) {
        next.boss.timeRemainingMs = null;
        next.boss.deadlineAt = null;
      }
      return next;
    }

    function save() {
      state = storageAdapter.saveGame(state);
    }

    function emit(type, detail = {}) {
      const snapshot = getState();
      listeners.forEach((listener) => listener(snapshot, { type, ...detail }));
    }

    function clearBossTimerState() {
      clearInterval(bossTimer);
      bossTimer = null;
      state.boss.timeRemainingMs = null;
      state.boss.deadlineAt = null;
    }

    function ensureBossTimer() {
      if (!running || bossTimer !== null) return;
      bossTimer = setInterval(bossTimerTick, Balance.constants.BOSS_TIMER_TICK_MS);
    }

    function beginBossTimer() {
      state.boss.timeRemainingMs = Balance.constants.BOSS_TIME_LIMIT_MS;
      state.boss.deadlineAt = Date.now() + Balance.constants.BOSS_TIME_LIMIT_MS;
      ensureBossTimer();
    }

    function completeBoss() {
      clearBossTimerState();
      state.progression.bossRetryAvailable = false;
      state.progression.farmingBeforeBoss = false;
      state.progression.pendingBossStage = null;

      if (state.stage === Balance.constants.GUARDIAN_UNLOCK_STAGE && !state.progression.guardianUnlocked) {
        state.progression.guardianUnlocked = true;
        state.guardians.push({ id: "ember", name: "Ember", level: 1, dps: Balance.constants.GUARDIAN_INITIAL_DPS });
      }
      if (state.stage === Balance.constants.CLEAR_STAGE && !state.progression.v01Cleared) {
        state.progression.v01Cleared = true;
        state.progression.clearSeen = false;
      }
      state.stage += 1;
      state.killsInStage = 0;
      state.monster = createMonster(state.stage);
    }

    function respawnOrAdvance() {
      const wasBoss = Balance.isBossStage(state.stage);
      if (wasBoss) {
        completeBoss();
      } else {
        state.killsInStage += 1;
        if (state.progression.farmingBeforeBoss) {
          state.killsInStage %= Balance.constants.MONSTERS_PER_STAGE;
        } else if (state.killsInStage >= Balance.constants.MONSTERS_PER_STAGE) {
          state.stage += 1;
          state.killsInStage = 0;
          if (Balance.isBossStage(state.stage)) beginBossTimer();
        }
        state.monster = createMonster(state.stage);
      }
    }

    function dealDamage(amount, source) {
      if (!Number.isFinite(amount) || amount <= 0) return;
      state.monster.hp -= amount;
      let defeated = false;
      if (state.monster.hp <= 0) {
        defeated = true;
        state.gold += Balance.monsterGold(state.stage);
        respawnOrAdvance();
      }
      save();
      emit(source === "auto" ? "autoAttack" : "tap", { amount, defeated });
    }

    function attack() {
      dealDamage(state.lutie.tap, "lutie");
    }

    function purchaseQuote(level, gold, costForLevel, requested) {
      const limit = requested === "max"
        ? Balance.constants.MAX_UPGRADE_LEVELS_PER_PURCHASE
        : Math.max(1, Math.floor(Number(requested) || 1));
      let levels = 0;
      let totalCost = 0;
      while (levels < limit) {
        const cost = costForLevel(level + levels);
        if (!Number.isFinite(cost) || cost < 1 || totalCost + cost > gold) break;
        totalCost += cost;
        levels += 1;
      }
      return { levels, totalCost };
    }

    function getUpgradeQuote(target, requested = 1) {
      if (target === "lutie") {
        return purchaseQuote(state.lutie.level, state.gold, Balance.lutieUpgradeCost, requested);
      }
      const guardian = state.guardians[0];
      if (!guardian) return { levels: 0, totalCost: 0 };
      return purchaseQuote(guardian.level, state.gold, Balance.guardianUpgradeCost, requested);
    }

    function upgradeLutie(requested = 1) {
      const quote = getUpgradeQuote("lutie", requested);
      if (quote.levels === 0) return false;
      state.gold -= quote.totalCost;
      state.lutie.level += quote.levels;
      state.lutie.tap = Balance.lutieTap(state.lutie.level);
      save();
      emit("upgradeLutie", quote);
      return true;
    }

    function upgradeGuardian(requested = 1) {
      const guardian = state.guardians[0];
      if (!guardian) return false;
      const quote = getUpgradeQuote("guardian", requested);
      if (quote.levels === 0) return false;
      state.gold -= quote.totalCost;
      guardian.level += quote.levels;
      guardian.dps = Balance.guardianDps(guardian.level);
      save();
      emit("upgradeGuardian", quote);
      return true;
    }

    function getTotalDps() {
      return Balance.constants.BASE_DPS + state.guardians.reduce((sum, guardian) => sum + guardian.dps, 0);
    }

    function autoAttack() {
      dealDamage(getTotalDps(), "auto");
    }

    function failBoss() {
      if (!state.monster.isBoss) return false;
      const failedStage = state.stage;
      state.progression.bossRetryAvailable = true;
      state.progression.farmingBeforeBoss = true;
      state.progression.pendingBossStage = failedStage;
      state.stage = Math.max(1, failedStage - 1);
      state.killsInStage = 0;
      clearBossTimerState();
      state.monster = createMonster(state.stage);
      save();
      emit("bossFailed", { failedStage });
      return true;
    }

    function bossTimerTick(now = Date.now()) {
      if (!state.monster.isBoss || state.boss.deadlineAt === null) return;
      state.boss.timeRemainingMs = Math.max(0, state.boss.deadlineAt - now);
      if (state.boss.timeRemainingMs === 0) {
        failBoss();
      } else {
        emit("bossTimer");
      }
    }

    function challengeBoss() {
      if (!state.progression.bossRetryAvailable || !state.progression.pendingBossStage) return false;
      state.stage = state.progression.pendingBossStage;
      state.killsInStage = 0;
      state.progression.bossRetryAvailable = false;
      state.progression.farmingBeforeBoss = false;
      state.monster = createMonster(state.stage);
      beginBossTimer();
      save();
      emit("bossChallenge");
      return true;
    }

    function acknowledgeClear() {
      if (!state.progression.v01Cleared || state.progression.clearSeen) return;
      state.progression.clearSeen = true;
      save();
      emit("clearAcknowledged");
    }

    function reset() {
      storageAdapter.resetGame();
      clearInterval(bossTimer);
      bossTimer = null;
      state = initialState();
      save();
      emit("reset");
    }

    function getState() {
      return JSON.parse(JSON.stringify(state));
    }

    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function start() {
      running = true;
      clearInterval(autoAttackTimer);
      clearInterval(bossTimer);
      bossTimer = null;
      state = normalize(storageAdapter.loadGame());
      if (state.monster.isBoss) {
        if (state.boss.deadlineAt === null) beginBossTimer();
        state.boss.timeRemainingMs = Math.max(0, state.boss.deadlineAt - Date.now());
        if (state.boss.timeRemainingMs === 0) failBoss();
        else ensureBossTimer();
      }
      save();
      autoAttackTimer = setInterval(autoAttack, Balance.constants.AUTO_ATTACK_INTERVAL_MS);
      emit("loaded");
    }

    function stop() {
      running = false;
      clearInterval(autoAttackTimer);
      clearInterval(bossTimer);
      autoAttackTimer = null;
      bossTimer = null;
    }

    return Object.freeze({
      start, stop, attack, tap: attack, autoAttack, bossTimerTick, challengeBoss,
      upgradeLutie, upgradeGuardian, getUpgradeQuote, getTotalDps,
      acknowledgeClear, reset, getState, subscribe
    });
  }

  global.LutieGame = Object.freeze({ createGame });
})(window);

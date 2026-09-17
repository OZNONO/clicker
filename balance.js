(function (global) {
  "use strict";

  const constants = Object.freeze({
    SAVE_VERSION: 1,
    MONSTERS_PER_STAGE: 10,
    BOSS_INTERVAL: 5,
    BOSS_TIME_LIMIT_MS: 30000,
    BOSS_TIMER_TICK_MS: 100,
    GUARDIAN_UNLOCK_STAGE: 5,
    CLEAR_STAGE: 10,
    BASE_DPS: 1,
    LUTIE_TAP_GROWTH: 1.08,
    LUTIE_UPGRADE_BASE_COST: 10,
    LUTIE_UPGRADE_COST_GROWTH: 1.12,
    MONSTER_BASE_HP: 10,
    MONSTER_HP_GROWTH: 1.15,
    MONSTER_BASE_GOLD: 2,
    MONSTER_GOLD_GROWTH: 1.08,
    FIRST_BOSS_HP_MULTIPLIER: 5,
    LATER_BOSS_HP_MULTIPLIER: 10,
    GUARDIAN_INITIAL_DPS: 2,
    GUARDIAN_INITIAL_COST: 25,
    GUARDIAN_DPS_GROWTH: 1.10,
    GUARDIAN_COST_GROWTH: 1.13,
    AUTO_ATTACK_INTERVAL_MS: 1000,
    MAX_UPGRADE_LEVELS_PER_PURCHASE: 100000
  });

  const safeFloor = (value) => Math.max(0, Math.floor(value));

  const Balance = Object.freeze({
    constants,
    lutieTap: (level) => Math.max(1, safeFloor(level * Math.pow(constants.LUTIE_TAP_GROWTH, level - 1))),
    lutieUpgradeCost: (level) => Math.max(1, safeFloor(constants.LUTIE_UPGRADE_BASE_COST * Math.pow(constants.LUTIE_UPGRADE_COST_GROWTH, level - 1))),
    monsterBaseHp: (stage) => Math.max(1, safeFloor(constants.MONSTER_BASE_HP * Math.pow(constants.MONSTER_HP_GROWTH, stage - 1))),
    monsterGold: (stage) => Math.max(1, safeFloor(constants.MONSTER_BASE_GOLD * Math.pow(constants.MONSTER_GOLD_GROWTH, stage - 1))),
    isBossStage: (stage) => stage % constants.BOSS_INTERVAL === 0,
    bossMultiplier: (stage) => stage === constants.GUARDIAN_UNLOCK_STAGE ? constants.FIRST_BOSS_HP_MULTIPLIER : constants.LATER_BOSS_HP_MULTIPLIER,
    monsterMaxHp(stage) {
      const base = this.monsterBaseHp(stage);
      return this.isBossStage(stage) ? base * this.bossMultiplier(stage) : base;
    },
    guardianDps: (level) => Math.max(1, safeFloor(constants.GUARDIAN_INITIAL_DPS * level * Math.pow(constants.GUARDIAN_DPS_GROWTH, level - 1))),
    guardianUpgradeCost: (level) => Math.max(1, safeFloor(constants.GUARDIAN_INITIAL_COST * Math.pow(constants.GUARDIAN_COST_GROWTH, level - 1)))
  });

  global.Balance = Balance;
})(window);

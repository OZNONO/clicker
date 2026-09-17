(function (global) {
  "use strict";

  // All unverified values below are temporary reconstruction values.
  const constants = Object.freeze({
    SAVE_VERSION: 3,
    MONSTERS_PER_STAGE: 10,
    GUARDIAN_ENCOUNTER_OFFSET: 5,
    REGION_LENGTH: 10,
    REGION_BOSS_OFFSET: 0,
    GUARDIAN_ENCOUNTER_TIME_LIMIT_MS: 30000,
    REGION_BOSS_TIME_LIMIT_MS: 30000,
    BOSS_TIMER_TICK_MS: 100,
    BASE_DPS: 1,
    LUTIE_TAP_GROWTH: 1.08,
    LUTIE_UPGRADE_BASE_COST: 10,
    LUTIE_UPGRADE_COST_GROWTH: 1.12,
    MONSTER_BASE_HP: 10,
    MONSTER_HP_GROWTH: 1.15,
    MONSTER_BASE_GOLD: 2,
    MONSTER_GOLD_GROWTH: 1.08,
    GUARDIAN_ENCOUNTER_HP_MULTIPLIER: 5,
    REGION_BOSS_HP_MULTIPLIER: 10,
    GUARDIAN_INITIAL_COST: 25,
    GUARDIAN_COST_ORDER_SCALE: 0.25,
    GUARDIAN_BASE_DPS_SCALE: 0.25,
    GUARDIAN_DPS_GROWTH: 1.035,
    GUARDIAN_COST_GROWTH: 1.13,
    GUARDIAN_DUPLICATE_GOLD_MULTIPLIER: 10,
    GUARDIAN_REINCARNATION_BONUS: 0.10,
    AUTO_ATTACK_INTERVAL_MS: 1000,
    MAX_UPGRADE_LEVELS_PER_PURCHASE: 100000,
    MIMIC_CHANCE: 0.01,
    MIMIC_HP_MULTIPLIER: 3,
    MIMIC_GOLD_MULTIPLIER: 5,
    MIMIC_MANA_STONE_DROP_CHANCE: 0.35,
    REGION_BOSS_HIGH_STONE_CHANCE: 0.15,
    NAZAR_CHANCE: 0.05,
    NAZAR_DPS_THRESHOLD: 0.50,
    NAZAR_INITIAL_HP_MULTIPLIER: 2,
    NAZAR_ESCALATION_MULTIPLIER: 2,
    MANA_STONE_RARITY_HIGH_CHANCE: 0.25,
    MANA_STONE_RARITY_LEGENDARY_CHANCE: 0.05,
    MANA_STONE_POWER_NORMAL: 0.005,
    MANA_STONE_POWER_HIGH: 0.01,
    MANA_STONE_POWER_LEGENDARY: 0.02,
    REINCARNATION_REQUIRED_LEVEL: 200,
    ARTIFACT_BONUS_PER_LEVEL: 0.10,
    FLARE_RAY_MULTIPLIER: 5,
    FLARE_RAY_COOLDOWN_MS: 30000
  });

  const safeFloor = (value) => Math.max(0, Math.floor(value));

  const Balance = Object.freeze({
    constants,
    lutieTap: (level) => Math.max(1, safeFloor(level * Math.pow(constants.LUTIE_TAP_GROWTH, level - 1))),
    lutieUpgradeCost: (level) => Math.max(1, safeFloor(constants.LUTIE_UPGRADE_BASE_COST * Math.pow(constants.LUTIE_UPGRADE_COST_GROWTH, level - 1))),
    monsterBaseHp: (stage) => Math.max(1, safeFloor(constants.MONSTER_BASE_HP * Math.pow(constants.MONSTER_HP_GROWTH, stage - 1))),
    monsterGold: (stage) => Math.max(1, safeFloor(constants.MONSTER_BASE_GOLD * Math.pow(constants.MONSTER_GOLD_GROWTH, stage - 1))),
    isGuardianEncounterStage: (stage) => stage % constants.REGION_LENGTH === constants.GUARDIAN_ENCOUNTER_OFFSET,
    isRegionBossStage: (stage) => stage % constants.REGION_LENGTH === constants.REGION_BOSS_OFFSET,
    isBossStage(stage) {
      return this.isGuardianEncounterStage(stage) || this.isRegionBossStage(stage);
    },
    timedEncounterLimit(stage) {
      return this.isGuardianEncounterStage(stage) ? constants.GUARDIAN_ENCOUNTER_TIME_LIMIT_MS : constants.REGION_BOSS_TIME_LIMIT_MS;
    },
    bossMultiplier(stage) {
      return this.isGuardianEncounterStage(stage) ? constants.GUARDIAN_ENCOUNTER_HP_MULTIPLIER : constants.REGION_BOSS_HP_MULTIPLIER;
    },
    monsterMaxHp(stage) {
      const base = this.monsterBaseHp(stage);
      return this.isBossStage(stage) ? base * this.bossMultiplier(stage) : base;
    },
    guardianBaseDps: (level, baseDps) => Math.max(1, safeFloor(baseDps * constants.GUARDIAN_BASE_DPS_SCALE * level * Math.pow(constants.GUARDIAN_DPS_GROWTH, level - 1))),
    guardianUpgradeCost: (level, unlockOrder = 1) => Math.max(1, safeFloor(constants.GUARDIAN_INITIAL_COST * (1 + (unlockOrder - 1) * constants.GUARDIAN_COST_ORDER_SCALE) * Math.pow(constants.GUARDIAN_COST_GROWTH, level - 1))),
    reincarnationStars: (highestStage) => Math.max(1, safeFloor(highestStage / 10)),
    artifactUpgradeCost: (level) => level + 1,
    artifactMultiplier: (level) => 1 + level * constants.ARTIFACT_BONUS_PER_LEVEL,
    manaStonePowerForRarity(rarity) {
      return rarity === "LEGENDARY" ? constants.MANA_STONE_POWER_LEGENDARY : rarity === "HIGH" ? constants.MANA_STONE_POWER_HIGH : constants.MANA_STONE_POWER_NORMAL;
    },
    manaStoneMultiplier: (stone, currentStage) => stone ? 1 + Math.min(stone.level, currentStage) * stone.power : 1,
    guardianReincarnationMultiplier: (level) => 1 + level * constants.GUARDIAN_REINCARNATION_BONUS,
    mimicMaxHp: (stage) => Math.max(1, safeFloor(Balance.monsterBaseHp(stage) * constants.MIMIC_HP_MULTIPLIER)),
    nazarMaxHp: (stage, escalation) => Math.max(1, safeFloor(Balance.monsterBaseHp(stage) * constants.NAZAR_INITIAL_HP_MULTIPLIER * Math.pow(constants.NAZAR_ESCALATION_MULTIPLIER, escalation))),
    mimicGold: (stage) => Math.max(1, safeFloor(Balance.monsterGold(stage) * constants.MIMIC_GOLD_MULTIPLIER)),
    duplicateGuardianGold: (stage) => Math.max(1, safeFloor(Balance.monsterGold(stage) * constants.GUARDIAN_DUPLICATE_GOLD_MULTIPLIER))
  });

  global.Balance = Balance;
})(window);

(function (global) {
  "use strict";

  // All unverified values below are temporary reconstruction values.
  const constants = Object.freeze({
    SAVE_VERSION: 7,
    NORMAL_STAGE_BOSS_TIME_LIMIT_MS: 30000,
    NORMAL_STAGE_BOSS_HP_MULTIPLIER: 3,
    BOSS_WARNING_DURATION_MS: 650,
    GUARDIAN_CUTIN_DURATION_MS: 750,
    BAG_INITIAL_CAPACITY: 5000,
    BAG_CAPACITY_TABLE: Object.freeze([5000, 30000, 120000, 400000, 1000000, 3000000, 10000000, 30000000, 100000000, 300000000]),
    BAG_CAPACITY_GROWTH: 3,
    BAG_UPGRADE_COST_RATIO: 0.5,
    BAG_PERSISTS_REINCARNATION: true,
    BALLOON_TRIGGER_CHANCE: 0.05,
    BALLOON_SKIP_STAGES: 10,
    OFFLINE_MAX_MS: 7 * 24 * 60 * 60 * 1000,
    OFFLINE_MAX_ENCOUNTERS: 10000,
    MONSTERS_PER_STAGE: 10,
    GUARDIAN_ENCOUNTER_OFFSET: 5,
    REGION_LENGTH: 10,
    REGION_BOSS_OFFSET: 0,
    GUARDIAN_ENCOUNTER_TIME_LIMIT_MS: 30000,
    REGION_BOSS_TIME_LIMIT_MS: 30000,
    BOSS_TIMER_TICK_MS: 100,
    BASE_DPS: 1,
    MONSTER_BASE_HP: 10,
    MONSTER_HP_GROWTH: 1.15,
    MONSTER_BASE_GOLD: 2,
    MONSTER_GOLD_GROWTH: 1.08,
    NORMAL_MONSTER_GOLD_VARIANCE: 0.10,
    GUARDIAN_ENCOUNTER_HP_MULTIPLIER: 5,
    REGION_BOSS_HP_MULTIPLIER: 10,
    GUARDIAN_BASE_DPS: 11,
    GUARDIAN_BASE_DPS_SCALE: 0.25,
    GUARDIAN_DPS_GROWTH: 1.035,
    GUARDIAN_REINCARNATION_BONUS: 0.10,
    AUTO_ATTACK_INTERVAL_MS: 100,
    AUTO_DAMAGE_DISPLAY_INTERVAL_MS: 1000,
    LIVE_CATCHUP_THRESHOLD_MS: 2000,
    MAX_UPGRADE_LEVELS_PER_PURCHASE: 100000,
    MIMIC_CHANCE: 0.01,
    MIMIC_HP_MULTIPLIER: 3,
    MIMIC_GOLD_MULTIPLIER: 5,
    MIMIC_MANA_STONE_DROP_CHANCE: 0.35,
    REGION_BOSS_HIGH_STONE_CHANCE: 0.15,
    NAZAR_CHANCE: 0.10,
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
    bagCapacity(level) {
      const table = constants.BAG_CAPACITY_TABLE;
      return table[level - 1] || Math.min(Number.MAX_VALUE, table[table.length - 1] * Math.pow(constants.BAG_CAPACITY_GROWTH, level - table.length));
    },
    bagUpgradeCost: (level) => Math.floor(Balance.bagCapacity(level) * constants.BAG_UPGRADE_COST_RATIO),
    bagLevelForGold(gold) {
      const table = constants.BAG_CAPACITY_TABLE;
      const index = table.findIndex(capacity => capacity >= gold);
      return index >= 0 ? index + 1 : table.length + Math.ceil(Math.log(gold / table[table.length - 1]) / Math.log(constants.BAG_CAPACITY_GROWTH));
    },
    normalStageBossHp: (stage) => Balance.monsterBaseHp(stage) * constants.NORMAL_STAGE_BOSS_HP_MULTIPLIER,
    bossIntroDuration: (type) => constants.BOSS_WARNING_DURATION_MS
      + (["guardian", "regionBoss"].includes(type) ? constants.GUARDIAN_CUTIN_DURATION_MS : 0),
    balloonDestination: (clearedStage) => clearedStage + constants.BALLOON_SKIP_STAGES,
    lutieTap: (level) => Math.max(1, safeFloor(level)),
    // Confirmed linear through target Lv100; the 100-level multiplier above that is temporary policy.
    lutieUpgradeCost: (level) => {
      const targetLevel = Math.max(2, safeFloor(level) + 1);
      return targetLevel * Math.ceil(targetLevel / 100);
    },
    monsterBaseHp: (stage) => Math.max(1, safeFloor(constants.MONSTER_BASE_HP * Math.pow(constants.MONSTER_HP_GROWTH, stage - 1))),
    monsterGold: (stage) => Math.max(1, safeFloor(constants.MONSTER_BASE_GOLD * Math.pow(constants.MONSTER_GOLD_GROWTH, stage - 1))),
    isGuardianEncounterStage: (stage) => stage % constants.REGION_LENGTH === constants.GUARDIAN_ENCOUNTER_OFFSET,
    isRegionBossStage: (stage) => stage % constants.REGION_LENGTH === constants.REGION_BOSS_OFFSET,
    isBossStage(stage) {
      return this.isGuardianEncounterStage(stage) || this.isRegionBossStage(stage);
    },
    timedEncounterLimit(stage) {
      if (this.isGuardianEncounterStage(stage)) return constants.GUARDIAN_ENCOUNTER_TIME_LIMIT_MS;
      return this.isRegionBossStage(stage) ? constants.REGION_BOSS_TIME_LIMIT_MS : constants.NORMAL_STAGE_BOSS_TIME_LIMIT_MS;
    },
    bossMultiplier(stage) {
      return this.isGuardianEncounterStage(stage) ? constants.GUARDIAN_ENCOUNTER_HP_MULTIPLIER : constants.REGION_BOSS_HP_MULTIPLIER;
    },
    monsterMaxHp(stage) {
      const base = this.monsterBaseHp(stage);
      return this.isBossStage(stage) ? base * this.bossMultiplier(stage) : base;
    },
    guardianBaseDps: (level, baseDps) => Math.max(1, safeFloor(baseDps * constants.GUARDIAN_BASE_DPS_SCALE * level * Math.pow(constants.GUARDIAN_DPS_GROWTH, level - 1))),
    guardianUpgradeCost: (level) => Math.max(2, safeFloor(level) * 2),
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
  });

  global.Balance = Balance;
})(window);

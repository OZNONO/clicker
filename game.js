(function (global) {
  "use strict";

  function createGame(storageAdapter, runtime = {}) {
    const listeners = new Set();
    const random = runtime.random || Math.random;
    const now = runtime.now || Date.now;
    let state;
    let autoAttackTimer = null;
    let bossTimer = null;
    let running = false;
    let offlineMode = false;
    let offlineSummary = null;

    const clone = (value) => JSON.parse(JSON.stringify(value));

    function createGuardianRoster() {
      return GameData.GUARDIAN_DEFINITIONS.map((definition) => ({
        ...definition,
        discovered: false,
        unlocked: false,
        activeThisRun: false,
        level: 1,
        reincarnationLevel: 0,
        equippedManaStoneId: null,
        acquisitionOrder: null
      }));
    }

    function initialProgression() {
      return {
        bossRetryAvailable: false,
        farmingBeforeBoss: false,
        pendingBossStage: null,
        pendingEncounterType: null,
        pendingGuardianId: null,
        v01Cleared: false,
        clearSeen: false
      };
    }

    function initialState() {
      return {
        saveVersion: Balance.constants.SAVE_VERSION,
        updatedAt: new Date(now()).toISOString(),
        gold: 0,
        bagLevel: 1,
        lastSavedAt: null,
        stage: 1,
        killsInStage: 0,
        lutie: { level: 1 },
        guardians: createGuardianRoster(),
        manaStones: [],
        stars: 0,
        artifacts: { tap: { level: 0 }, dps: { level: 0 }, gold: { level: 0 } },
        progression: initialProgression(),
        run: { highestStage: 1, encounteredGuardianIds: [], nazarEscalation: 0 },
        lifetime: { highestStage: 1, totalReincarnations: 0, nextStoneId: 1, nextGuardianAcquisitionOrder: 1 },
        skills: { flareRayReadyAt: 0 },
        settings: { damageNumbers: true, hitAnimations: true, guardianSort: "ACQUIRED" },
        boss: { timeRemainingMs: null, deadlineAt: null },
        monster: createMonster("normal", 1)
      };
    }

    function createMonster(type, stage, details = {}) {
      const normalNames = ["Mossling", "Cave Puff", "Bramblekin", "Moon Slime"];
      let maxHp = Balance.monsterBaseHp(stage);
      let name = normalNames[(stage - 1) % normalNames.length];
      let isTimed = false;
      if (type === "guardian") {
        const definition = GameData.GUARDIAN_DEFINITIONS.find((item) => item.id === details.guardianId) || GameData.GUARDIAN_DEFINITIONS[0];
        maxHp = Balance.monsterMaxHp(stage);
        name = definition.name;
        isTimed = true;
      } else if (type === "stageBoss") {
        maxHp = Balance.normalStageBossHp(stage);
        name = `Stage ${stage} Sentinel`;
        isTimed = true;
      } else if (type === "regionBoss") {
        maxHp = Balance.monsterMaxHp(stage);
        name = `Region ${Math.floor(stage / Balance.constants.REGION_LENGTH)} Warden`;
        isTimed = true;
      } else if (type === "mimic") {
        maxHp = Balance.mimicMaxHp(stage);
        name = "Gilded Mimic";
      } else if (type === "nazar") {
        maxHp = Balance.nazarMaxHp(stage, details.escalation || 0);
        name = "Nazar";
      }
      return {
        type,
        name,
        isBoss: isTimed,
        isTimed,
        guardianId: details.guardianId || null,
        hp: maxHp,
        maxHp
      };
    }

    function migrateV1(saved) {
      const migrated = initialState();
      migrated.updatedAt = saved.updatedAt || migrated.updatedAt;
      migrated.gold = validNumber(saved.gold, 0);
      migrated.stage = Math.max(1, validNumber(saved.stage, 1));
      migrated.killsInStage = Math.max(0, validNumber(saved.killsInStage, 0));
      migrated.lutie.level = Math.max(1, validNumber(saved.lutie && saved.lutie.level, 1));
      migrated.run.highestStage = migrated.stage;
      migrated.lifetime.highestStage = migrated.stage;

      const oldGuardian = Array.isArray(saved.guardians) && saved.guardians[0];
      const oldProgression = saved.progression || {};
      if (oldGuardian || oldProgression.guardianUnlocked) {
        const guardian = migrated.guardians[0];
        guardian.discovered = true;
        guardian.unlocked = true;
        guardian.activeThisRun = true;
        guardian.level = Math.max(1, validNumber(oldGuardian && oldGuardian.level, 1));
        guardian.acquisitionOrder = 1;
        migrated.lifetime.nextGuardianAcquisitionOrder = 2;
      }

      migrated.progression.bossRetryAvailable = Boolean(oldProgression.bossRetryAvailable);
      migrated.progression.farmingBeforeBoss = Boolean(oldProgression.farmingBeforeBoss);
      migrated.progression.pendingBossStage = oldProgression.pendingBossStage || null;
      migrated.progression.pendingEncounterType = migrated.progression.pendingBossStage
        ? encounterTypeForStage(migrated.progression.pendingBossStage)
        : null;
      migrated.progression.v01Cleared = Boolean(oldProgression.v01Cleared);
      migrated.progression.clearSeen = Boolean(oldProgression.clearSeen);
      if (Balance.isGuardianEncounterStage(migrated.stage) || Balance.isGuardianEncounterStage(migrated.progression.pendingBossStage || 0)) {
        migrated.progression.pendingGuardianId = migrated.guardians[0].id;
        migrated.run.encounteredGuardianIds.push(migrated.guardians[0].id);
      }
      migrated.boss = { ...migrated.boss, ...(saved.boss || {}) };
      migrated.monster = createMonsterForState(migrated);
      if (saved.monster && migrated.monster.type === monsterTypeFromLegacy(saved.monster, migrated.stage)) {
        migrated.monster.hp = Math.max(1, Math.min(validNumber(saved.monster.hp, migrated.monster.maxHp), migrated.monster.maxHp));
      }
      return migrated;
    }

    function validNumber(value, fallback) {
      return Number.isFinite(value) ? value : fallback;
    }

    function monsterTypeFromLegacy(monster, stage) {
      if (monster.type) return monster.type;
      return encounterTypeForStage(stage) || "normal";
    }

    function encounterTypeForStage(stage) {
      if (Balance.isGuardianEncounterStage(stage)) return "guardian";
      if (Balance.isRegionBossStage(stage)) return "regionBoss";
      return null;
    }

    function createMonsterForState(target) {
      const type = target.progression.farmingBeforeBoss ? "normal" : encounterTypeForStage(target.stage)
        || (target.killsInStage >= Balance.constants.MONSTERS_PER_STAGE - 1 ? "stageBoss" : "normal");
      const guardianId = type === "guardian"
        ? target.progression.pendingGuardianId || GameData.GUARDIAN_DEFINITIONS[0].id
        : null;
      return createMonster(type, target.stage, { guardianId });
    }

    function normalizeV2(saved) {
      const base = initialState();
      const next = {
        ...base,
        ...saved,
        saveVersion: Balance.constants.SAVE_VERSION,
        lutie: { level: Math.max(1, validNumber(saved.lutie && saved.lutie.level, 1)) },
        artifacts: {
          tap: { ...base.artifacts.tap, ...((saved.artifacts && saved.artifacts.tap) || {}) },
          dps: { ...base.artifacts.dps, ...((saved.artifacts && saved.artifacts.dps) || {}) },
          gold: { ...base.artifacts.gold, ...((saved.artifacts && saved.artifacts.gold) || {}) }
        },
        progression: { ...base.progression, ...(saved.progression || {}) },
        run: { ...base.run, ...(saved.run || {}) },
        lifetime: { ...base.lifetime, ...(saved.lifetime || {}) },
        skills: { ...base.skills, ...(saved.skills || {}) },
        settings: { ...base.settings, ...(saved.settings || {}) },
        boss: { ...base.boss, ...(saved.boss || {}) }
      };
      const savedGuardians = new Map((Array.isArray(saved.guardians) ? saved.guardians : []).map((guardian) => [guardian.id, guardian]));
      next.guardians = base.guardians.map((guardian) => {
        const persisted = savedGuardians.get(guardian.id) || {};
        return {
          ...guardian,
          discovered: Boolean(persisted.discovered),
          unlocked: Boolean(persisted.unlocked),
          activeThisRun: Boolean(persisted.activeThisRun),
          level: Math.max(1, validNumber(persisted.level, 1)),
          reincarnationLevel: Math.max(0, validNumber(persisted.reincarnationLevel, 0)),
          equippedManaStoneId: typeof persisted.equippedManaStoneId === "string" ? persisted.equippedManaStoneId : null,
          acquisitionOrder: Number.isFinite(persisted.acquisitionOrder) ? persisted.acquisitionOrder : null
        };
      });
      let nextAcquisitionOrder = next.guardians
        .filter((guardian) => guardian.discovered && Number.isFinite(guardian.acquisitionOrder))
        .reduce((highest, guardian) => Math.max(highest, guardian.acquisitionOrder), 0) + 1;
      next.guardians.forEach((guardian) => {
        if (guardian.discovered && !Number.isFinite(guardian.acquisitionOrder)) {
          guardian.acquisitionOrder = nextAcquisitionOrder++;
        }
      });
      next.lifetime.nextGuardianAcquisitionOrder = Math.max(validNumber(next.lifetime.nextGuardianAcquisitionOrder, 1), nextAcquisitionOrder);
      if (!["ACQUIRED", "NAME", "GROUP"].includes(next.settings.guardianSort)) next.settings.guardianSort = "ACQUIRED";
      next.manaStones = Array.isArray(saved.manaStones) ? saved.manaStones.filter(isValidStone).map((stone) => ({
        id: stone.id,
        level: Math.max(1, stone.level),
        rarity: stone.rarity,
        power: Balance.manaStonePowerForRarity(stone.rarity),
        equippedGuardianId: typeof stone.equippedGuardianId === "string" ? stone.equippedGuardianId : null
      })) : [];
      next.gold = Math.max(0, validNumber(next.gold, 0));
      next.stage = Math.max(1, validNumber(next.stage, 1));
      next.killsInStage = Math.max(0, validNumber(next.killsInStage, 0));
      next.lutie.level = Math.max(1, validNumber(next.lutie.level, 1));
      next.run.highestStage = Math.max(next.stage, validNumber(next.run.highestStage, next.stage));
      next.lifetime.highestStage = Math.max(next.run.highestStage, validNumber(next.lifetime.highestStage, next.run.highestStage));
      const expected = createMonsterForState(next);
      const savedMonster = saved.monster;
      if (savedMonster && ["normal", "stageBoss", "guardian", "regionBoss", "mimic", "nazar"].includes(savedMonster.type)) {
        const details = { guardianId: savedMonster.guardianId, escalation: Math.max(0, next.run.nazarEscalation - 1) };
        next.monster = createMonster(savedMonster.type, next.stage, details);
        next.monster.hp = Math.max(Number.MIN_VALUE, Math.min(validNumber(savedMonster.hp, next.monster.maxHp), next.monster.maxHp));
      } else {
        next.monster = expected;
      }
      // Legacy normal slot ten becomes a full-health progression gate.
      if (expected.type === "stageBoss" && next.monster.type === "normal") next.monster = expected;
      if (!next.monster.isTimed) next.boss = { timeRemainingMs: null, deadlineAt: null };
      return next;
    }

    function normalize(saved) {
      if (!saved || typeof saved !== "object") return initialState();
      try {
        let next;
        if (saved.saveVersion === 1) next = migrateV1(saved);
        if ([2, 3, 4, Balance.constants.SAVE_VERSION].includes(saved.saveVersion)) next = normalizeV2(saved);
        if (next) {
          next.saveVersion = Balance.constants.SAVE_VERSION;
          next.bagLevel = Math.max(1, Math.floor(validNumber(saved.bagLevel, 1)));
          // Preserve existing wealth by granting enough bag levels, never deleting Gold.
          if (next.gold > Balance.bagCapacity(next.bagLevel)) {
            next.bagLevel = Math.max(next.bagLevel, Balance.bagLevelForGold(next.gold));
            while (next.gold > Balance.bagCapacity(next.bagLevel)) next.bagLevel += 1;
          }
          next.lastSavedAt = Number.isFinite(saved.lastSavedAt) && saved.lastSavedAt >= 0 ? saved.lastSavedAt : null;
          return next;
        }
      } catch (_error) {
        return initialState();
      }
      return initialState();
    }

    function isValidStone(stone) {
      return stone && typeof stone.id === "string" && Number.isFinite(stone.level) && ["NORMAL", "HIGH", "LEGENDARY"].includes(stone.rarity);
    }

    function isImportCandidate(candidate) {
      return candidate && typeof candidate === "object"
        && [1, 2, 3, 4, Balance.constants.SAVE_VERSION].includes(candidate.saveVersion)
        && Number.isFinite(candidate.gold)
        && Number.isFinite(candidate.stage)
        && candidate.lutie && Number.isFinite(candidate.lutie.level);
    }

    function serializeState() {
      return {
        saveVersion: Balance.constants.SAVE_VERSION,
        updatedAt: state.updatedAt,
        gold: state.gold,
        bagLevel: state.bagLevel,
        lastSavedAt: state.lastSavedAt,
        stage: state.stage,
        killsInStage: state.killsInStage,
        lutie: { level: state.lutie.level },
        guardians: state.guardians.map((guardian) => ({
          id: guardian.id,
          discovered: guardian.discovered,
          unlocked: guardian.unlocked,
          activeThisRun: guardian.activeThisRun,
          level: guardian.level,
          reincarnationLevel: guardian.reincarnationLevel,
          equippedManaStoneId: guardian.equippedManaStoneId,
          acquisitionOrder: guardian.acquisitionOrder
        })),
        manaStones: state.manaStones.map((stone) => ({
          id: stone.id,
          level: stone.level,
          rarity: stone.rarity,
          equippedGuardianId: stone.equippedGuardianId
        })),
        stars: state.stars,
        artifacts: clone(state.artifacts),
        progression: clone(state.progression),
        run: clone(state.run),
        lifetime: clone(state.lifetime),
        skills: clone(state.skills),
        settings: clone(state.settings),
        boss: clone(state.boss),
        monster: { type: state.monster.type, hp: state.monster.hp, guardianId: state.monster.guardianId }
      };
    }

    function save() {
      if (offlineMode) return;
      const savedAt = Math.max(now(), state.lastSavedAt || 0);
      if (state.monster.isTimed && state.boss.deadlineAt !== null) {
        state.boss.timeRemainingMs = Math.max(0, state.boss.deadlineAt - now());
      }
      const saved = storageAdapter.saveGame({ ...serializeState(), lastSavedAt: savedAt });
      state.lastSavedAt = savedAt;
      state.updatedAt = saved.updatedAt || state.updatedAt;
      return getState();
    }

    function emit(type, detail = {}) {
      if (offlineMode) return;
      const snapshot = getState();
      listeners.forEach((listener) => listener(snapshot, { type, ...detail }));
    }

    function updateHighestStage() {
      state.run.highestStage = Math.max(state.run.highestStage, state.stage);
      state.lifetime.highestStage = Math.max(state.lifetime.highestStage, state.stage);
    }

    function getTotalTap() {
      return Math.max(1, Math.floor(Balance.lutieTap(state.lutie.level) * Balance.artifactMultiplier(state.artifacts.tap.level)));
    }

    function getEffectiveStoneLevel(stone) {
      return stone ? Math.min(stone.level, state.stage) : 0;
    }

    function getGuardianFinalDps(guardianOrId) {
      const guardian = typeof guardianOrId === "string"
        ? state.guardians.find((item) => item.id === guardianOrId)
        : guardianOrId;
      if (!guardian) return 0;
      const stone = state.manaStones.find((item) => item.id === guardian.equippedManaStoneId);
      const base = Balance.guardianBaseDps(guardian.level, guardian.baseDps);
      return Math.max(1, Math.floor(
        base
        * Balance.manaStoneMultiplier(stone, state.stage)
        * Balance.guardianReincarnationMultiplier(guardian.reincarnationLevel)
        * Balance.artifactMultiplier(state.artifacts.dps.level)
      ));
    }

    function getTotalGuardianDps() {
      return state.guardians
        .filter((guardian) => guardian.activeThisRun)
        .reduce((sum, guardian) => sum + getGuardianFinalDps(guardian), 0);
    }

    function getTotalDps() {
      return Balance.constants.BASE_DPS + getTotalGuardianDps();
    }

    function calculateGoldReward(baseGold) {
      return Math.max(1, Math.floor(baseGold * Balance.artifactMultiplier(state.artifacts.gold.level)));
    }

    function rollNormalMonsterGold(baseGold) {
      const normalizedBase = Math.max(1, Math.floor(baseGold));
      const variance = Math.floor(normalizedBase * Balance.constants.NORMAL_MONSTER_GOLD_VARIANCE);
      if (variance === 0) return normalizedBase;
      const offset = Math.floor(random() * (variance * 2 + 1)) - variance;
      return Math.max(1, normalizedBase + offset);
    }

    function addGold(baseGold) {
      const reward = calculateGoldReward(baseGold);
      return awardGold(reward).earned;
    }

    function getGoldCapacity() {
      return Balance.bagCapacity(state.bagLevel);
    }

    function awardGold(reward) {
      const earned = Math.min(Math.max(0, getGoldCapacity() - state.gold), Math.max(0, reward));
      state.gold += earned;
      if (offlineMode) {
        offlineSummary.goldEarned += earned;
        offlineSummary.goldLost += Math.max(0, reward - earned);
      }
      return { earned, lost: Math.max(0, reward - earned) };
    }

    function upgradeBag() {
      const cost = Balance.bagUpgradeCost(state.bagLevel);
      if (state.gold < cost || Balance.bagCapacity(state.bagLevel + 1) <= getGoldCapacity()) return false;
      state.gold -= cost;
      state.bagLevel += 1;
      save();
      emit("bagUpgraded");
      return true;
    }

    function clearBossTimerState() {
      clearInterval(bossTimer);
      bossTimer = null;
      state.boss.timeRemainingMs = null;
      state.boss.deadlineAt = null;
    }

    function ensureBossTimer() {
      if (offlineMode || !running || bossTimer !== null || !state.monster.isTimed) return;
      bossTimer = setInterval(bossTimerTick, Balance.constants.BOSS_TIMER_TICK_MS);
    }

    function beginBossTimer() {
      const limit = Balance.timedEncounterLimit(state.stage);
      state.boss.timeRemainingMs = limit;
      state.boss.deadlineAt = now() + limit;
      ensureBossTimer();
    }

    function chooseGuardianForEncounter() {
      if (state.progression.pendingGuardianId) return state.progression.pendingGuardianId;
      const definition = GameData.selectGuardianDefinition(state.run.encounteredGuardianIds, offlineMode ? 0 : random());
      state.progression.pendingGuardianId = definition.id;
      if (!state.run.encounteredGuardianIds.includes(definition.id)) state.run.encounteredGuardianIds.push(definition.id);
      return definition.id;
    }

    function isNazarEligible() {
      return state.progression.farmingBeforeBoss
        && getTotalDps() >= Balance.monsterBaseHp(state.stage) * Balance.constants.NAZAR_DPS_THRESHOLD;
    }

    function getNazarIndicatorState() {
      return { visible: state.progression.farmingBeforeBoss, active: isNazarEligible() || state.monster.type === "nazar" };
    }

    function spawnNazar() {
      const escalation = state.run.nazarEscalation;
      state.monster = createMonster("nazar", state.stage, { escalation });
      state.run.nazarEscalation += 1;
    }

    function spawnCurrentMain({ allowNazar = true, startTimer = false } = {}) {
      const encounterType = state.progression.farmingBeforeBoss ? null : encounterTypeForStage(state.stage);
      if (encounterType === "guardian") {
        state.monster = createMonster("guardian", state.stage, { guardianId: chooseGuardianForEncounter() });
      } else if (encounterType === "regionBoss") {
        state.monster = createMonster("regionBoss", state.stage);
      } else if (!state.progression.farmingBeforeBoss && state.killsInStage >= Balance.constants.MONSTERS_PER_STAGE - 1) {
        state.monster = createMonster("stageBoss", state.stage);
      } else if (!offlineMode && allowNazar && isNazarEligible() && random() < Balance.constants.NAZAR_CHANCE) {
        spawnNazar();
      } else {
        state.monster = createMonster("normal", state.stage);
      }
      if (state.monster.isTimed && (startTimer || state.boss.timeRemainingMs === null)) beginBossTimer();
    }

    function enterStage(stage) {
      state.stage = stage;
      state.killsInStage = 0;
      updateHighestStage();
      spawnCurrentMain({ allowNazar: false, startTimer: true });
    }

    function rollStoneRarity() {
      const roll = random();
      if (roll < Balance.constants.MANA_STONE_RARITY_LEGENDARY_CHANCE) return "LEGENDARY";
      if (roll < Balance.constants.MANA_STONE_RARITY_LEGENDARY_CHANCE + Balance.constants.MANA_STONE_RARITY_HIGH_CHANCE) return "HIGH";
      return "NORMAL";
    }

    function createManaStone(forcedRarity = null) {
      const rarity = forcedRarity || rollStoneRarity();
      const stone = {
        id: `stone-${state.lifetime.nextStoneId++}`,
        level: Math.max(1, Math.floor(state.stage)),
        rarity,
        power: Balance.manaStonePowerForRarity(rarity),
        equippedGuardianId: null
      };
      state.manaStones.push(stone);
      return stone;
    }

    function maybeDropManaStone(chance) {
      return random() < chance ? createManaStone() : null;
    }

    function recruitGuardian(guardianId) {
      const guardian = state.guardians.find((item) => item.id === guardianId);
      if (!guardian) return { guardian: null, isNew: false, duplicate: false };
      const duplicate = guardian.activeThisRun;
      const isNew = !guardian.discovered;
      guardian.discovered = true;
      guardian.unlocked = true;
      guardian.activeThisRun = true;
      if (isNew && !Number.isFinite(guardian.acquisitionOrder)) {
        guardian.acquisitionOrder = state.lifetime.nextGuardianAcquisitionOrder++;
      }
      if (duplicate) addGold(Balance.duplicateGuardianGold(state.stage));
      return { guardian, isNew, duplicate };
    }

    function clearEncounterProgression() {
      clearBossTimerState();
      state.progression.bossRetryAvailable = false;
      state.progression.farmingBeforeBoss = false;
      state.progression.pendingBossStage = null;
      state.progression.pendingEncounterType = null;
      state.progression.pendingGuardianId = null;
      state.run.nazarEscalation = 0;
    }

    function completeTimedEncounter(defeatedMonster) {
      const clearedStage = state.stage;
      let acquisition = null;
      let stone = null;
      if (defeatedMonster.type === "guardian") acquisition = recruitGuardian(defeatedMonster.guardianId);
      if (defeatedMonster.type === "regionBoss") {
        const rarity = !offlineMode && random() < Balance.constants.REGION_BOSS_HIGH_STONE_CHANCE ? "HIGH" : "NORMAL";
        stone = createManaStone(rarity);
        if (state.stage === Balance.constants.REGION_LENGTH) {
          state.progression.v01Cleared = true;
          state.progression.clearSeen = false;
        }
      }
      clearEncounterProgression();
      enterStage(state.stage + 1);
      if (!offlineMode && defeatedMonster.type === "regionBoss") tryBalloon(clearedStage);
      return { acquisition, stone };
    }

    function tryBalloon(clearedStage, forced = false) {
      if (!forced && (state.lifetime.totalReincarnations < 1 || !Balance.isRegionBossStage(clearedStage)
        || random() >= Balance.constants.BALLOON_TRIGGER_CHANCE)) return false;
      const destination = Balance.balloonDestination(clearedStage);
      clearEncounterProgression();
      enterStage(destination);
      emit("balloon", { destination, forced });
      return true;
    }

    function forceBalloon() {
      // Dev-only: skip ten stages from the current position, with no rewards.
      tryBalloon(state.stage - 1, true);
      save();
      return true;
    }

    function handleDefeat(defeatedMonster) {
      let reward = 0;
      let stone = null;
      let acquisition = null;
      if (defeatedMonster.type === "normal") {
        reward = addGold(offlineMode ? Balance.monsterGold(state.stage) : rollNormalMonsterGold(Balance.monsterGold(state.stage)));
        state.killsInStage += 1;
        if (state.progression.farmingBeforeBoss) {
          state.killsInStage %= Balance.constants.MONSTERS_PER_STAGE;
          if (!offlineMode && random() < Balance.constants.MIMIC_CHANCE) state.monster = createMonster("mimic", state.stage);
          else spawnCurrentMain();
        } else if (state.killsInStage >= Balance.constants.MONSTERS_PER_STAGE - 1) {
          spawnCurrentMain({ allowNazar: false, startTimer: true });
        } else if (!offlineMode && random() < Balance.constants.MIMIC_CHANCE) {
          state.monster = createMonster("mimic", state.stage);
        } else {
          spawnCurrentMain({ allowNazar: false });
        }
      } else if (defeatedMonster.type === "mimic") {
        reward = addGold(Balance.mimicGold(state.stage));
        stone = maybeDropManaStone(Balance.constants.MIMIC_MANA_STONE_DROP_CHANCE);
        spawnCurrentMain();
      } else if (defeatedMonster.type === "nazar") {
        reward = 0;
        spawnCurrentMain();
      } else {
        reward = addGold(Balance.monsterGold(state.stage));
        const result = completeTimedEncounter(defeatedMonster);
        acquisition = result.acquisition;
        stone = result.stone;
      }
      return { reward, stone, acquisition };
    }

    function dealDamage(amount, source) {
      if (state.monster.isTimed && state.boss.deadlineAt !== null && now() >= state.boss.deadlineAt) {
        failBoss();
        return false;
      }
      if (!Number.isFinite(amount) || amount <= 0) return false;
      state.monster.hp -= amount;
      let defeated = false;
      let rewards = {};
      const defeatedMonster = { ...state.monster };
      if (state.monster.hp <= 0) {
        defeated = true;
        rewards = handleDefeat(defeatedMonster);
      }
      save();
      emit(source === "auto" ? "autoAttack" : source === "skill" ? "skillAttack" : "tap", { amount, defeated, defeatedMonster, ...rewards });
      if (rewards.acquisition && rewards.acquisition.guardian && rewards.acquisition.isNew) {
        emit("guardianAcquired", {
          guardian: clone(rewards.acquisition.guardian),
          dps: getGuardianFinalDps(rewards.acquisition.guardian),
          isNew: rewards.acquisition.isNew
        });
      }
      if (rewards.stone) emit("manaStoneDropped", { stone: clone(rewards.stone) });
      return true;
    }

    function attack() {
      return dealDamage(getTotalTap(), "tap");
    }

    function autoAttack() {
      return dealDamage(getTotalDps(), "auto");
    }

    function useFlareRay() {
      if (state.lutie.level < 1 || now() < state.skills.flareRayReadyAt) return false;
      state.skills.flareRayReadyAt = now() + Balance.constants.FLARE_RAY_COOLDOWN_MS;
      return dealDamage(getTotalTap() * Balance.constants.FLARE_RAY_MULTIPLIER, "skill");
    }

    function purchaseQuote(level, gold, costForLevel, requested) {
      const limit = requested === "max" ? Balance.constants.MAX_UPGRADE_LEVELS_PER_PURCHASE : Math.max(1, Math.floor(Number(requested) || 1));
      let levels = 0;
      let totalCost = 0;
      if (requested !== "max") {
        while (levels < limit) {
          const cost = costForLevel(level + levels);
          if (!Number.isFinite(cost) || cost < 1) return { levels: 0, totalCost: Infinity };
          totalCost += cost;
          levels += 1;
        }
        return { levels: totalCost <= gold ? levels : 0, totalCost };
      }
      while (levels < limit) {
        const cost = costForLevel(level + levels);
        if (!Number.isFinite(cost) || cost < 1 || totalCost + cost > gold) break;
        totalCost += cost;
        levels += 1;
      }
      return { levels, totalCost };
    }

    function getUpgradeQuote(target, requested = 1, guardianId = null) {
      if (target === "lutie") return purchaseQuote(state.lutie.level, state.gold, Balance.lutieUpgradeCost, requested);
      const guardian = guardianId ? state.guardians.find((item) => item.id === guardianId) : state.guardians.find((item) => item.activeThisRun);
      if (!guardian || !guardian.activeThisRun) return { levels: 0, totalCost: 0 };
      return purchaseQuote(guardian.level, state.gold, (level) => Balance.guardianUpgradeCost(level, guardian.unlockOrder), requested);
    }

    function upgradeLutie(requested = 1) {
      const quote = getUpgradeQuote("lutie", requested);
      if (!quote.levels) return false;
      state.gold -= quote.totalCost;
      state.lutie.level += quote.levels;
      save();
      emit("upgradeLutie", quote);
      return true;
    }

    function upgradeGuardian(idOrRequested = 1, requestedMaybe = 1) {
      const hasId = typeof idOrRequested === "string" && idOrRequested.startsWith("guardian-");
      const guardian = hasId ? state.guardians.find((item) => item.id === idOrRequested) : state.guardians.find((item) => item.activeThisRun);
      const requested = hasId ? requestedMaybe : idOrRequested;
      if (!guardian || !guardian.activeThisRun) return false;
      const quote = getUpgradeQuote("guardian", requested, guardian.id);
      if (!quote.levels) return false;
      state.gold -= quote.totalCost;
      guardian.level += quote.levels;
      save();
      emit("upgradeGuardian", { ...quote, guardianId: guardian.id });
      return true;
    }

    function getAllGuardianUpgradeQuote(amount = 1) {
      if (![1, 10].includes(amount)) return { levels: 0, totalCost: 0, count: 0 };
      const acquired = state.guardians.filter((guardian) => guardian.activeThisRun);
      const totalCost = acquired.reduce((sum, guardian) => sum
        + purchaseQuote(guardian.level, Number.MAX_VALUE, Balance.guardianUpgradeCost, amount).totalCost, 0);
      return { levels: acquired.length && Number.isFinite(totalCost) && totalCost > 0 && totalCost <= state.gold ? amount : 0, totalCost, count: acquired.length };
    }

    function upgradeAllGuardians(amount = 1) {
      const quote = getAllGuardianUpgradeQuote(amount);
      if (!quote.levels) return false;
      state.guardians.filter((guardian) => guardian.activeThisRun).forEach((guardian) => { guardian.level += amount; });
      state.gold -= quote.totalCost;
      save();
      emit("allGuardiansUpgraded", quote);
      return true;
    }

    // Temporary continuous-DPS model: visit completed encounters, never wall-clock ticks.
    // Farming is batched arithmetically. All writes/events are suppressed until settlement.
    function applyOfflineProgress(forcedElapsedMs = null) {
      const elapsed = forcedElapsedMs === null
        ? (state.lastSavedAt === null ? 0 : Math.max(0, now() - state.lastSavedAt))
        : Math.max(0, validNumber(forcedElapsedMs, 0));
      offlineSummary = null;
      if (!elapsed) {
        if (state.monster.isTimed) state.boss.deadlineAt = now() + (state.boss.timeRemainingMs ?? Balance.timedEncounterLimit(state.stage));
        return null;
      }
      const processedMs = Math.min(elapsed, Balance.constants.OFFLINE_MAX_MS);
      offlineSummary = { elapsedMs: elapsed, processedMs, stagesAdvanced: 0, goldEarned: 0, goldLost: 0, finalStage: state.stage, encounters: 0, unprocessedMs: elapsed - processedMs };
      let remaining = processedMs / 1000;
      offlineMode = true;
      try {
        // Existing special monsters are omitted too; never fabricate their loot/progression.
        if (["mimic", "nazar"].includes(state.monster.type)) spawnCurrentMain({ allowNazar: false });
        while (remaining > 0 && offlineSummary.encounters < Balance.constants.OFFLINE_MAX_ENCOUNTERS) {
          const dps = getTotalDps();
          if (!Number.isFinite(dps) || dps <= 0 || !Number.isFinite(state.monster.hp)) break;
          if (state.progression.farmingBeforeBoss) {
            const hp = Balance.monsterBaseHp(state.stage);
            const damage = remaining * dps;
            if (!Number.isFinite(damage) || !Number.isFinite(hp)) break;
            const kills = damage < state.monster.hp ? 0 : 1 + Math.floor((damage - state.monster.hp) / hp);
            if (kills) {
              awardGold(kills * calculateGoldReward(Balance.monsterGold(state.stage)));
              state.killsInStage = (state.killsInStage + kills) % Balance.constants.MONSTERS_PER_STAGE;
              state.monster.hp = hp - ((damage - state.monster.hp) % hp);
            } else state.monster.hp -= damage;
            remaining = 0;
            break;
          }
          const killSeconds = state.monster.hp / dps;
          const limitSeconds = state.monster.isTimed ? (state.boss.timeRemainingMs ?? Balance.timedEncounterLimit(state.stage)) / 1000 : Infinity;
          // Timeout consumes its remaining timer, then uses the shared camping transition.
          if (limitSeconds < killSeconds && remaining >= limitSeconds) {
            remaining -= limitSeconds;
            failBoss();
            offlineSummary.encounters += 1;
          } else if (killSeconds <= remaining && killSeconds <= limitSeconds) {
            remaining -= killSeconds;
            const oldStage = state.stage;
            handleDefeat({ ...state.monster });
            offlineSummary.stagesAdvanced += Math.max(0, state.stage - oldStage);
            offlineSummary.encounters += 1;
          } else {
            state.monster.hp -= remaining * dps;
            if (state.monster.isTimed) state.boss.timeRemainingMs = Math.max(0, (limitSeconds - remaining) * 1000);
            remaining = 0;
          }
        }
        offlineSummary.unprocessedMs += remaining * 1000;
        offlineSummary.processedMs -= remaining * 1000;
        offlineSummary.finalStage = state.stage;
      } finally {
        offlineMode = false;
      }
      if (state.monster.isTimed) state.boss.deadlineAt = now() + state.boss.timeRemainingMs;
      return clone(offlineSummary);
    }

    function simulateDeveloperOffline() {
      applyOfflineProgress(60 * 60 * 1000);
      save();
      emit("loaded", { offlineSummary, developer: true });
      return clone(offlineSummary);
    }

    function failBoss() {
      if (!state.monster.isTimed) return false;
      const failed = { stage: state.stage, type: state.monster.type, guardianId: state.monster.guardianId };
      state.progression.bossRetryAvailable = true;
      state.progression.farmingBeforeBoss = true;
      state.progression.pendingBossStage = failed.stage;
      state.progression.pendingEncounterType = failed.type;
      if (failed.guardianId) state.progression.pendingGuardianId = failed.guardianId;
      state.stage = failed.type === "stageBoss" ? failed.stage : Math.max(1, failed.stage - 1);
      state.killsInStage = 0;
      clearBossTimerState();
      state.monster = createMonster("normal", state.stage);
      save();
      emit("bossFailed", failed);
      return true;
    }

    function bossTimerTick(timestamp = now()) {
      if (!state.monster.isTimed || state.boss.deadlineAt === null) return;
      state.boss.timeRemainingMs = Math.max(0, state.boss.deadlineAt - timestamp);
      if (state.boss.timeRemainingMs === 0) failBoss();
      else emit("bossTimer");
    }

    function challengeBoss() {
      if (!state.progression.bossRetryAvailable || !state.progression.pendingBossStage) return false;
      state.stage = state.progression.pendingBossStage;
      state.killsInStage = state.progression.pendingEncounterType === "stageBoss" ? Balance.constants.MONSTERS_PER_STAGE - 1 : 0;
      state.progression.bossRetryAvailable = false;
      state.progression.farmingBeforeBoss = false;
      const type = state.progression.pendingEncounterType || encounterTypeForStage(state.stage);
      state.monster = createMonster(type, state.stage, { guardianId: state.progression.pendingGuardianId });
      beginBossTimer();
      save();
      emit("bossChallenge");
      return true;
    }

    function giveUpBoss() {
      return failBoss();
    }

    function forceNazar() {
      if (!state.progression.farmingBeforeBoss || state.monster.type === "nazar") return false;
      spawnNazar();
      save();
      emit("nazarForced");
      return true;
    }

    function addDeveloperGold() {
      // Explicit dev-only capacity bypass. Normal rewards never increase over-cap Gold.
      state.gold += 100000;
      save();
      emit("developerGoldAdded", { amount: 100000 });
      return true;
    }

    function equipManaStone(stoneId, guardianId) {
      const stone = state.manaStones.find((item) => item.id === stoneId);
      const guardian = state.guardians.find((item) => item.id === guardianId);
      if (!stone || !guardian || !guardian.discovered) return false;
      if (stone.equippedGuardianId) {
        const oldGuardian = state.guardians.find((item) => item.id === stone.equippedGuardianId);
        if (oldGuardian) oldGuardian.equippedManaStoneId = null;
      }
      if (guardian.equippedManaStoneId) {
        const oldStone = state.manaStones.find((item) => item.id === guardian.equippedManaStoneId);
        if (oldStone) oldStone.equippedGuardianId = null;
      }
      stone.equippedGuardianId = guardian.id;
      guardian.equippedManaStoneId = stone.id;
      save();
      emit("manaStoneEquipped", { stoneId, guardianId });
      return true;
    }

    function unequipManaStone(stoneId) {
      const stone = state.manaStones.find((item) => item.id === stoneId);
      if (!stone || !stone.equippedGuardianId) return false;
      const guardian = state.guardians.find((item) => item.id === stone.equippedGuardianId);
      if (guardian) guardian.equippedManaStoneId = null;
      stone.equippedGuardianId = null;
      save();
      emit("manaStoneUnequipped", { stoneId });
      return true;
    }

    function getReincarnationPreview() {
      return {
        available: state.lutie.level >= Balance.constants.REINCARNATION_REQUIRED_LEVEL,
        stars: Balance.reincarnationStars(state.run.highestStage)
      };
    }

    function reincarnate() {
      const preview = getReincarnationPreview();
      if (!preview.available) return false;
      const activeIds = state.guardians.filter((guardian) => guardian.activeThisRun).map((guardian) => guardian.id);
      activeIds.forEach((id) => {
        const guardian = state.guardians.find((item) => item.id === id);
        guardian.reincarnationLevel += 1;
      });
      state.stars += preview.stars;
      state.lifetime.totalReincarnations += 1;
      const keptStoneIds = new Set(state.manaStones.filter((stone) => stone.rarity === "LEGENDARY").map((stone) => stone.id));
      state.manaStones = state.manaStones.filter((stone) => stone.rarity === "LEGENDARY");
      state.guardians.forEach((guardian) => {
        guardian.level = 1;
        guardian.activeThisRun = false;
        guardian.unlocked = false;
        if (!keptStoneIds.has(guardian.equippedManaStoneId)) guardian.equippedManaStoneId = null;
      });
      state.gold = 0;
      if (!Balance.constants.BAG_PERSISTS_REINCARNATION) state.bagLevel = 1;
      state.stage = 1;
      state.killsInStage = 0;
      state.lutie.level = 1;
      state.progression = initialProgression();
      state.run = { highestStage: 1, encounteredGuardianIds: [], nazarEscalation: 0 };
      state.skills.flareRayReadyAt = 0;
      clearBossTimerState();
      state.monster = createMonster("normal", 1);
      save();
      emit("reincarnated", { starsEarned: preview.stars });
      return true;
    }

    function upgradeArtifact(artifactId) {
      const artifact = state.artifacts[artifactId];
      if (!artifact) return false;
      const cost = Balance.artifactUpgradeCost(artifact.level);
      if (state.stars < cost) return false;
      state.stars -= cost;
      artifact.level += 1;
      save();
      emit("artifactUpgraded", { artifactId, cost });
      return true;
    }

    function setSetting(key, value) {
      if (!(key in state.settings)) return false;
      if (key === "guardianSort") {
        if (!["ACQUIRED", "NAME", "GROUP"].includes(value)) return false;
        state.settings[key] = value;
      } else {
        state.settings[key] = Boolean(value);
      }
      save();
      emit("settingChanged", { key, value: state.settings[key] });
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
      offlineSummary = null;
      save();
      emit("reset");
    }

    function saveNow() {
      const snapshot = save();
      emit("saved");
      return snapshot;
    }

    function exportSave() {
      return JSON.stringify(serializeState(), null, 2);
    }

    function importSave(jsonText) {
      let candidate;
      try {
        candidate = JSON.parse(jsonText);
      } catch (_error) {
        return { ok: false, error: "Invalid JSON" };
      }
      if (!isImportCandidate(candidate)) return { ok: false, error: "Invalid save structure" };
      const imported = normalize(candidate);
      clearInterval(bossTimer);
      bossTimer = null;
      state = imported;
      // Imports establish a fresh checkpoint; an old exported timestamp cannot pay twice.
      state.lastSavedAt = now();
      offlineSummary = null;
      if (state.monster.isTimed) state.boss.deadlineAt = now() + (state.boss.timeRemainingMs ?? Balance.timedEncounterLimit(state.stage));
      restoreActiveTimer();
      save();
      emit("imported");
      return { ok: true };
    }

    function restoreActiveTimer() {
      if (!state.monster.isTimed) return;
      if (state.boss.deadlineAt === null) beginBossTimer();
      state.boss.timeRemainingMs = Math.max(0, state.boss.deadlineAt - now());
      if (state.boss.timeRemainingMs === 0) failBoss();
      else ensureBossTimer();
    }

    function getState() {
      return clone(state);
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
      applyOfflineProgress();
      restoreActiveTimer();
      save();
      autoAttackTimer = setInterval(autoAttack, Balance.constants.AUTO_ATTACK_INTERVAL_MS);
      emit("loaded", { offlineSummary });
    }

    function stop() {
      if (running) save();
      running = false;
      clearInterval(autoAttackTimer);
      clearInterval(bossTimer);
      autoAttackTimer = null;
      bossTimer = null;
    }

    return Object.freeze({
      start, stop, attack, tap: attack, autoAttack, useFlareRay, bossTimerTick, challengeBoss, giveUpBoss, forceNazar, addDeveloperGold,
      getGoldCapacity, upgradeBag, forceBalloon, getAllGuardianUpgradeQuote, upgradeAllGuardians, simulateDeveloperOffline, getNazarIndicatorState,
      upgradeLutie, upgradeGuardian, getUpgradeQuote, getTotalTap, getTotalDps, getTotalGuardianDps,
      getGuardianFinalDps, getEffectiveStoneLevel, calculateGoldReward, rollNormalMonsterGold, isNazarEligible, equipManaStone, unequipManaStone,
      getReincarnationPreview, reincarnate, upgradeArtifact, setSetting, acknowledgeClear, reset,
      saveNow, exportSave, importSave, getState, subscribe
    });
  }

  global.LutieGame = Object.freeze({ createGame });
})(window);

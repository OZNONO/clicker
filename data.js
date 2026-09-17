(function (global) {
  "use strict";

  // Placeholder content for the personal reconstruction prototype.
  // Names and values are not verified original game data.
  const guardianGroups = ["HUMAN", "MACHINE", "BEAST", "DRAGON", "FAIRY", "SPIRIT", "ANGEL", "DEMON", "HUMAN", "MACHINE"];
  const GUARDIAN_DEFINITIONS = Object.freeze(Array.from({ length: 10 }, (_, index) => Object.freeze({
    id: `guardian-${String(index + 1).padStart(2, "0")}`,
    name: `Guardian ${String(index + 1).padStart(2, "0")}`,
    baseDps: Balance.constants.GUARDIAN_BASE_DPS,
    unlockOrder: index + 1,
    group: guardianGroups[index]
  })));

  const ARTIFACT_DEFINITIONS = Object.freeze([
    Object.freeze({ id: "tap", name: "TAP Artifact", description: "TAP +10% per level" }),
    Object.freeze({ id: "dps", name: "DPS Artifact", description: "DPS +10% per level" }),
    Object.freeze({ id: "gold", name: "GOLD Artifact", description: "Gold +10% per level" })
  ]);

  const ACTIVE_SKILL_DEFINITIONS = Object.freeze([
    Object.freeze({ id: "flare-ray", name: "Flare Ray", requiredLevel: 1, implemented: true }),
    Object.freeze({ id: "shining-ray", name: "Shining Ray", requiredLevel: 100, implemented: false }),
    Object.freeze({ id: "glory", name: "Glory", requiredLevel: 200, implemented: false }),
    Object.freeze({ id: "gospel", name: "Gospel", requiredLevel: 300, implemented: false }),
    Object.freeze({ id: "blessing", name: "Blessing", requiredLevel: 400, implemented: false })
  ]);

  function selectGuardianDefinition(encounteredIds, randomValue) {
    const unseen = GUARDIAN_DEFINITIONS.filter((definition) => !encounteredIds.includes(definition.id));
    const pool = unseen.length ? unseen : GUARDIAN_DEFINITIONS;
    return pool[Math.min(pool.length - 1, Math.floor(randomValue * pool.length))];
  }

  function sortGuardianView(guardians, mode = "ACQUIRED") {
    const sorted = guardians.slice();
    sorted.sort((left, right) => {
      if (left.discovered !== right.discovered) return left.discovered ? -1 : 1;
      if (mode === "NAME") return left.name.localeCompare(right.name) || left.unlockOrder - right.unlockOrder;
      if (mode === "GROUP") return left.group.localeCompare(right.group) || left.name.localeCompare(right.name);
      if (left.discovered) return (left.acquisitionOrder || Number.MAX_SAFE_INTEGER) - (right.acquisitionOrder || Number.MAX_SAFE_INTEGER) || left.unlockOrder - right.unlockOrder;
      return left.unlockOrder - right.unlockOrder;
    });
    return sorted;
  }

  global.GameData = Object.freeze({
    GUARDIAN_DEFINITIONS,
    ARTIFACT_DEFINITIONS,
    ACTIVE_SKILL_DEFINITIONS,
    selectGuardianDefinition,
    sortGuardianView
  });
})(window);

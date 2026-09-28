(function (global) {
  "use strict";

  // Names are the documented normal-Guardian roster. Group and DPS metadata remain prototype defaults.
  const guardianNames = Object.freeze([
    "아르", "아리엘", "아이멜", "안테아", "에단", "에밀리", "엘라임", "오르페오", "올리비에", "가이아",
    "도로시", "라엘", "브린힐트", "파라켈", "필리아", "티타니아", "일레노아", "제라드", "라이언", "레이너",
    "로렌스", "로이드", "루시드", "루시퍼", "리리엘", "세실리", "셀리온", "소냐", "스텔라", "시그룬", "실피드"
  ]);
  const GUARDIAN_DEFINITIONS = Object.freeze(guardianNames.map((name, index) => Object.freeze({
    id: `guardian-${String(index + 1).padStart(2, "0")}`,
    name,
    baseDps: Balance.constants.GUARDIAN_BASE_DPS,
    unlockOrder: index + 1,
    group: "UNCLASSIFIED"
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

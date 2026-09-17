(function (global) {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const elements = {
    stage: $("stageValue"), gold: $("goldValue"), name: $("monsterName"), kills: $("killCount"),
    hp: $("hpValue"), hpFill: $("hpFill"), boss: $("bossRibbon"), attackArea: $("attackArea"),
    bossTimerWrap: $("bossTimerWrap"), bossTimerValue: $("bossTimerValue"), farmingBanner: $("farmingBanner"),
    farmingStage: $("farmingStage"), challengeBoss: $("challengeBoss"),
    monsterButton: $("monsterButton"), damageLayer: $("damageLayer"), tapStat: $("tapStat"), dpsStat: $("dpsStat"),
    lutieLevel: $("lutieLevel"), lutieTap: $("lutieTap"), lutieCost: $("lutieCost"), lutieUpgrade: $("lutieUpgrade"),
    lutieUpgrade10: $("lutieUpgrade10"), lutieUpgradeMax: $("lutieUpgradeMax"),
    guardianCard: $("guardianCard"), guardianLocked: $("guardianLocked"), guardianUnlocked: $("guardianUnlocked"),
    guardianLevel: $("guardianLevel"), guardianDps: $("guardianDps"), guardianCost: $("guardianCost"), guardianUpgrade: $("guardianUpgrade"),
    guardianUpgrade10: $("guardianUpgrade10"), guardianUpgradeMax: $("guardianUpgradeMax"),
    reset: $("resetSave"), overlay: $("clearOverlay"), continueButton: $("continueButton")
  };

  function formatNumber(value) {
    if (!Number.isFinite(value)) return "∞";
    const abs = Math.abs(value);
    const units = [
      { value: 1e12, suffix: "T" }, { value: 1e9, suffix: "B" },
      { value: 1e6, suffix: "M" }, { value: 1e3, suffix: "K" }
    ];
    const unit = units.find((item) => abs >= item.value);
    if (!unit) return Math.floor(value).toLocaleString("en-US");
    const scaled = value / unit.value;
    return `${scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2)}`.replace(/\.0+$|(?<=\.\d)0$/, "") + unit.suffix;
  }

  function render(state) {
    const guardian = state.guardians[0];
    const lutieCost = Balance.lutieUpgradeCost(state.lutie.level);
    const hpPercent = Math.max(0, Math.min(100, state.monster.hp / state.monster.maxHp * 100));
    const lutieQuotes = [1, 10, "max"].map((amount) => game.getUpgradeQuote("lutie", amount));

    elements.stage.textContent = state.stage;
    elements.gold.textContent = formatNumber(state.gold);
    elements.name.textContent = state.monster.name;
    elements.kills.textContent = state.monster.isBoss ? "BOSS FIGHT" : `${state.killsInStage} / ${Balance.constants.MONSTERS_PER_STAGE}`;
    elements.hp.textContent = `${formatNumber(state.monster.hp)} / ${formatNumber(state.monster.maxHp)}`;
    elements.hpFill.style.width = `${hpPercent}%`;
    elements.boss.hidden = !state.monster.isBoss;
    elements.bossTimerWrap.hidden = !state.monster.isBoss;
    elements.bossTimerValue.textContent = ((state.boss.timeRemainingMs || 0) / 1000).toFixed(1);
    elements.farmingBanner.hidden = !state.progression.farmingBeforeBoss;
    elements.farmingStage.textContent = `FARMING STAGE ${state.stage}`;
    elements.attackArea.classList.toggle("farming", state.progression.farmingBeforeBoss);
    elements.monsterButton.classList.toggle("boss-monster", state.monster.isBoss);
    elements.tapStat.textContent = formatNumber(state.lutie.tap);
    elements.dpsStat.textContent = formatNumber(game.getTotalDps());
    elements.lutieLevel.textContent = `LV. ${state.lutie.level}`;
    elements.lutieTap.textContent = formatNumber(state.lutie.tap);
    elements.lutieCost.textContent = formatNumber(lutieCost);
    elements.lutieUpgrade.disabled = lutieQuotes[0].levels === 0;
    elements.lutieUpgrade10.disabled = lutieQuotes[1].levels === 0;
    elements.lutieUpgradeMax.disabled = lutieQuotes[2].levels === 0;
    elements.lutieUpgrade10.textContent = lutieQuotes[1].levels ? `x10 (+${lutieQuotes[1].levels})` : "x10";
    elements.lutieUpgradeMax.textContent = lutieQuotes[2].levels ? `MAX (+${lutieQuotes[2].levels})` : "MAX";

    elements.guardianLocked.hidden = Boolean(guardian);
    elements.guardianUnlocked.hidden = !guardian;
    elements.guardianCard.classList.toggle("is-locked", !guardian);
    if (guardian) {
      const guardianCost = Balance.guardianUpgradeCost(guardian.level);
      const guardianQuotes = [1, 10, "max"].map((amount) => game.getUpgradeQuote("guardian", amount));
      elements.guardianLevel.textContent = `LV. ${guardian.level}`;
      elements.guardianDps.textContent = formatNumber(guardian.dps);
      elements.guardianCost.textContent = formatNumber(guardianCost);
      elements.guardianUpgrade.disabled = guardianQuotes[0].levels === 0;
      elements.guardianUpgrade10.disabled = guardianQuotes[1].levels === 0;
      elements.guardianUpgradeMax.disabled = guardianQuotes[2].levels === 0;
      elements.guardianUpgrade10.textContent = guardianQuotes[1].levels ? `x10 (+${guardianQuotes[1].levels})` : "x10";
      elements.guardianUpgradeMax.textContent = guardianQuotes[2].levels ? `MAX (+${guardianQuotes[2].levels})` : "MAX";
    }
    elements.overlay.hidden = !(state.progression.v01Cleared && !state.progression.clearSeen);
  }

  function showDamage(amount, x, y, automatic) {
    const popup = document.createElement("span");
    popup.className = automatic ? "damage-popup auto" : "damage-popup";
    popup.textContent = `${automatic ? "DPS " : "-"}${formatNumber(amount)}`;
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    elements.damageLayer.appendChild(popup);
    popup.addEventListener("animationend", () => popup.remove());
  }

  const game = LutieGame.createGame(GameStorage.createDefault());
  let lastTapPoint = null;
  let monsterAnimationTimer = null;

  function replayMonsterAnimation(className) {
    clearTimeout(monsterAnimationTimer);
    elements.monsterButton.classList.remove("hit", "defeated");
    void elements.monsterButton.offsetWidth;
    elements.monsterButton.classList.add(className);
    monsterAnimationTimer = setTimeout(() => elements.monsterButton.classList.remove(className), className === "defeated" ? 310 : 210);
  }

  function attack(point) {
    lastTapPoint = point || null;
    game.attack();
  }

  game.subscribe((state, event) => {
    if (event.type === "bossTimer") {
      elements.bossTimerValue.textContent = (state.boss.timeRemainingMs / 1000).toFixed(1);
      return;
    }
    render(state);
    if (event.type === "tap") {
      const rect = elements.attackArea.getBoundingClientRect();
      const point = lastTapPoint || { x: rect.width / 2, y: rect.height / 2 };
      showDamage(event.amount, point.x, point.y, false);
      replayMonsterAnimation(event.defeated ? "defeated" : "hit");
    }
    if (event.type === "autoAttack") {
      const rect = elements.attackArea.getBoundingClientRect();
      showDamage(event.amount, rect.width * 0.58, rect.height * 0.48, true);
      replayMonsterAnimation(event.defeated ? "defeated" : "hit");
    }
  });

  elements.attackArea.addEventListener("click", (event) => {
    if (event.target.closest("[data-no-attack], .boss-ribbon")) return;
    const rect = elements.attackArea.getBoundingClientRect();
    attack({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  });
  elements.lutieUpgrade.addEventListener("click", () => game.upgradeLutie());
  elements.lutieUpgrade10.addEventListener("click", () => game.upgradeLutie(10));
  elements.lutieUpgradeMax.addEventListener("click", () => game.upgradeLutie("max"));
  elements.guardianUpgrade.addEventListener("click", () => game.upgradeGuardian());
  elements.guardianUpgrade10.addEventListener("click", () => game.upgradeGuardian(10));
  elements.guardianUpgradeMax.addEventListener("click", () => game.upgradeGuardian("max"));
  elements.challengeBoss.addEventListener("click", (event) => {
    event.stopPropagation();
    game.challengeBoss();
  });
  document.addEventListener("keydown", (event) => {
    if (event.repeat || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
    if (event.target.closest && event.target.closest("button, input, textarea, select, a, [contenteditable='true']")) return;
    const attackKeys = [" ", "Spacebar", "z", "x", "Enter"];
    if (!attackKeys.includes(event.key)) return;
    if (event.key === " " || event.key === "Spacebar") event.preventDefault();
    attack();
  });
  elements.reset.addEventListener("click", () => {
    if (global.confirm("Reset all progress? This cannot be undone.")) game.reset();
  });
  elements.continueButton.addEventListener("click", () => game.acknowledgeClear());

  game.start();
  global.addEventListener("beforeunload", () => game.stop());
  global.LutieClicker = Object.freeze({ game, formatNumber });
})(window);

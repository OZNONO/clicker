(function (global) {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const elements = {
    goldCapacity: $("goldCapacity"), bagLevel: $("bagLevel"), bagGold: $("bagGold"), upgradeBag: $("upgradeBag"),
    allGuardian1: $("allGuardian1"), allGuardian10: $("allGuardian10"), forceBalloon: $("forceBalloon"), developerOffline: $("developerOffline"),
    offlineSummary: $("offlineSummary"), offlineDetails: $("offlineDetails"),
    stage: $("stageValue"), gold: $("goldValue"), stageLabel: $("stageLabel"), name: $("monsterName"), kills: $("killCount"),
    hp: $("hpValue"), hpFill: $("hpFill"), encounterBadge: $("encounterBadge"), attackArea: $("attackArea"),
    nazarIndicator: $("nazarIndicator"), giveUpBoss: $("giveUpBoss"),
    bossTimerWrap: $("bossTimerWrap"), bossTimerValue: $("bossTimerValue"), farmingBanner: $("farmingBanner"),
    farmingStage: $("farmingStage"), nextBossHp: $("nextBossHp"), challengeBoss: $("challengeBoss"),
    monsterButton: $("monsterButton"), damageLayer: $("damageLayer"), tapStat: $("tapStat"), dpsStat: $("dpsStat"),
    lutieLevel: $("lutieLevel"), lutieTap: $("lutieTap"), lutieCost: $("lutieCost"), lutieUpgrade: $("lutieUpgrade"),
    lutieUpgrade10: $("lutieUpgrade10"), lutieUpgradeMax: $("lutieUpgradeMax"), skillGrid: $("skillGrid"),
    guardianGold: $("guardianGold"), guardianTotalDps: $("guardianTotalDps"), guardianSort: $("guardianSort"), guardianList: $("guardianList"), stoneCount: $("stoneCount"), stoneList: $("stoneList"),
    starsValue: $("starsValue"), starsPreview: $("starsPreview"), reincarnateButton: $("reincarnateButton"), artifactList: $("artifactList"),
    saveNow: $("saveNow"), exportSave: $("exportSave"), importSave: $("importSave"), importFile: $("importFile"),
    damageNumbers: $("damageNumbers"), hitAnimations: $("hitAnimations"), reset: $("resetSave"), developerInfo: $("developerInfo"),
    forceNazar: $("forceNazar"), forceNazarHint: $("forceNazarHint"), addDeveloperGold: $("addDeveloperGold"),
    reincarnateModal: $("reincarnateModal"), modalStars: $("modalStars"), cancelReincarnate: $("cancelReincarnate"), confirmReincarnate: $("confirmReincarnate"),
    clearOverlay: $("clearOverlay"), continueButton: $("continueButton"), acquisitionOverlay: $("acquisitionOverlay"),
    acquisitionName: $("acquisitionName"), acquisitionDps: $("acquisitionDps"), stoneAcquisitionOverlay: $("stoneAcquisitionOverlay"),
    stoneAcquisitionName: $("stoneAcquisitionName"), stoneAcquisitionPower: $("stoneAcquisitionPower"),
    stonePicker: $("stonePicker"), stonePickerTitle: $("stonePickerTitle"), stonePickerList: $("stonePickerList"), closeStonePicker: $("closeStonePicker"), toast: $("toast")
  };

  function formatNumber(value) {
    if (!Number.isFinite(value)) return "∞";
    const abs = Math.abs(value);
    if (abs < 1000) return Math.floor(value).toLocaleString("en-US");
    const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
    const group = Math.floor(Math.log10(abs) / 3);
    if (group >= suffixes.length) return value.toExponential(2);
    const scaled = value / Math.pow(1000, group);
    const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    return `${scaled.toFixed(digits).replace(/\.0+$|(?<=\.\d)0$/, "")}${suffixes[group]}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
  }

  const game = LutieGame.createGame(GameStorage.createDefault());
  let lastTapPoint = null;
  let monsterAnimationTimer = null;
  let acquisitionTimer = null;
  let toastTimer = null;
  let openStonePickerGuardianId = null;
  let lastStoneInventoryStage = null;

  function upgradeButton(button, label, quote, showLevels = false) {
    button.disabled = quote.levels === 0;
    button.textContent = showLevels && quote.levels ? `${label} (+${quote.levels})` : label;
  }

  function formatGold(value) {
    return Math.floor(value).toLocaleString("en-US");
  }

  function renderCombat(state) {
    const monster = state.monster;
    const hpPercent = Math.max(0, Math.min(100, monster.hp / monster.maxHp * 100));
    const badgeByType = { stageBoss: "STAGE BOSS · 10 / 10", guardian: "GUARDIAN", regionBoss: "REGION BOSS", mimic: "MIMIC", nazar: "NAZAR" };
    elements.stage.textContent = formatNumber(state.stage);
    elements.gold.textContent = formatNumber(state.gold);
    elements.stageLabel.textContent = `STAGE ${formatNumber(state.stage)}`;
    elements.name.textContent = monster.name;
    elements.kills.textContent = monster.type === "normal" ? `MONSTER ${state.killsInStage} / ${Balance.constants.MONSTERS_PER_STAGE}` : badgeByType[monster.type] || "SPECIAL";
    elements.hp.textContent = monster.type === "nazar" ? "??? / ???" : `${formatNumber(monster.hp)} / ${formatNumber(monster.maxHp)}`;
    elements.hpFill.style.width = `${hpPercent}%`;
    elements.encounterBadge.hidden = !badgeByType[monster.type];
    elements.encounterBadge.textContent = badgeByType[monster.type] || "";
    elements.bossTimerWrap.hidden = !monster.isTimed;
    elements.giveUpBoss.hidden = !monster.isTimed;
    elements.bossTimerValue.textContent = ((state.boss.timeRemainingMs || 0) / 1000).toFixed(1);
    elements.farmingBanner.hidden = !state.progression.farmingBeforeBoss;
    elements.farmingStage.textContent = `FARMING STAGE ${state.stage}`;
    const pendingStage = state.progression.pendingBossStage || state.stage + 1;
    elements.nextBossHp.textContent = `NEXT BOSS HP: ${formatNumber(state.progression.pendingEncounterType === "stageBoss" ? Balance.normalStageBossHp(pendingStage) : Balance.monsterMaxHp(pendingStage))}`;
    elements.attackArea.classList.toggle("farming", state.progression.farmingBeforeBoss);
    const indicator = game.getNazarIndicatorState();
    elements.nazarIndicator.hidden = !indicator.visible;
    elements.nazarIndicator.classList.toggle("active", indicator.active);
    elements.nazarIndicator.querySelector("span").textContent = indicator.active ? "NAZAR ACTIVE" : "NAZAR INACTIVE";
    ["normal", "stageBoss", "guardian", "regionBoss", "mimic", "nazar"].forEach((type) => elements.monsterButton.classList.toggle(`type-${type}`, monster.type === type));
    elements.tapStat.textContent = formatNumber(game.getTotalTap());
    elements.dpsStat.textContent = formatNumber(game.getTotalDps());
  }

  function renderLutie(state) {
    const capacity = game.getGoldCapacity();
    const bagCost = Balance.bagUpgradeCost(state.bagLevel);
    elements.goldCapacity.textContent = `/ ${formatNumber(capacity)}`;
    elements.bagLevel.textContent = `BAG Lv. ${state.bagLevel}`;
    elements.bagGold.textContent = `${formatNumber(state.gold)} / ${formatNumber(capacity)} G`;
    elements.upgradeBag.textContent = `UPGRADE BAG · ${formatNumber(bagCost)} G`;
    elements.upgradeBag.disabled = state.gold < bagCost || Balance.bagCapacity(state.bagLevel + 1) <= capacity;
    const quotes = [1, 10, "max"].map((amount) => game.getUpgradeQuote("lutie", amount));
    elements.lutieLevel.textContent = `LV. ${formatNumber(state.lutie.level)}`;
    elements.lutieTap.textContent = formatNumber(game.getTotalTap());
    elements.lutieCost.textContent = formatNumber(Balance.lutieUpgradeCost(state.lutie.level));
    upgradeButton(elements.lutieUpgrade, "+1", quotes[0]);
    upgradeButton(elements.lutieUpgrade10, "+10", quotes[1]);
    upgradeButton(elements.lutieUpgradeMax, "MAX", quotes[2], true);
    const cooldownMs = Math.max(0, state.skills.flareRayReadyAt - Date.now());
    elements.skillGrid.innerHTML = GameData.ACTIVE_SKILL_DEFINITIONS.map((skill) => {
      const unlocked = state.lutie.level >= skill.requiredLevel;
      const onCooldown = skill.id === "flare-ray" && cooldownMs > 0;
      const status = !unlocked ? `Lv${skill.requiredLevel}` : !skill.implemented ? "COMING SOON" : onCooldown ? `${Math.ceil(cooldownMs / 1000)}s` : "READY";
      return `<button class="skill-slot ${unlocked ? "" : "locked"} ${unlocked && skill.implemented && !onCooldown ? "available" : ""} ${onCooldown ? "cooldown" : ""}" data-skill="${skill.id}" ${unlocked && skill.implemented && !onCooldown ? "" : "disabled"}><i></i><strong>${escapeHtml(skill.name)}</strong><span>${status}</span></button>`;
    }).join("");
  }

  function guardianUpgradeMarkup(guardianId, amount, label, quote) {
    const displayLabel = amount === "max" && quote.levels ? `MAX +${quote.levels}` : label;
    return `<button class="purchase-button" data-guardian-upgrade="${guardianId}" data-amount="${amount}" ${quote.levels ? "" : "disabled"}><span data-upgrade-label>${displayLabel}</span><small data-upgrade-cost>${formatGold(quote.totalCost)} G</small></button>`;
  }

  function updateGuardianValues(state) {
    [1, 10].forEach((amount) => {
      const quote = game.getAllGuardianUpgradeQuote(amount);
      const button = amount === 1 ? elements.allGuardian1 : elements.allGuardian10;
      button.textContent = `ALL +${amount} · ${formatGold(quote.totalCost)} G`;
      button.disabled = !quote.levels;
    });
    elements.guardianGold.textContent = `${formatGold(state.gold)} G`;
    elements.guardianTotalDps.textContent = formatNumber(game.getTotalGuardianDps());
    elements.guardianSort.value = state.settings.guardianSort;
    state.guardians.filter((guardian) => guardian.activeThisRun).forEach((guardian) => {
      const card = elements.guardianList.querySelector(`[data-guardian-card="${guardian.id}"]`);
      if (!card) return;
      const stone = state.manaStones.find((item) => item.id === guardian.equippedManaStoneId);
      card.querySelector("[data-guardian-level]").textContent = `Lv. ${formatNumber(guardian.level)}`;
      card.querySelector("[data-guardian-dps]").textContent = formatNumber(game.getGuardianFinalDps(guardian.id));
      card.querySelector("[data-guardian-stone]").textContent = stone ? `${stone.rarity} Lv.${formatNumber(stone.level)}` : "NONE";
      [1, 10, "max"].forEach((amount) => {
        const quote = game.getUpgradeQuote("guardian", amount, guardian.id);
        const button = card.querySelector(`[data-amount="${amount}"]`);
        button.disabled = quote.levels === 0;
        button.querySelector("[data-upgrade-label]").textContent = amount === "max" && quote.levels ? `MAX +${quote.levels}` : amount === "max" ? "MAX" : `+${amount}`;
        button.querySelector("[data-upgrade-cost]").textContent = `${formatGold(quote.totalCost)} G`;
      });
    });
  }

  function renderGuardians(state) {
    const guardianView = GameData.sortGuardianView(state.guardians, state.settings.guardianSort);
    elements.guardianList.innerHTML = guardianView.map((guardian) => {
      if (!guardian.discovered) return `<article class="roster-card locked"><h3>???</h3><p>Not discovered</p></article>`;
      if (!guardian.activeThisRun) return `<article class="roster-card locked"><div class="roster-card-head"><div><h3>${escapeHtml(guardian.name)}</h3><span class="group-label">${guardian.group}</span><p>Discovered · Awaiting this run</p></div><span class="reinc-chip">R${guardian.reincarnationLevel}</span></div></article>`;
      const quotes = [1, 10, "max"].map((amount) => game.getUpgradeQuote("guardian", amount, guardian.id));
      return `<article class="roster-card" data-guardian-card="${guardian.id}"><div class="roster-card-head"><div><h3>${escapeHtml(guardian.name)}</h3><span class="group-label">${guardian.group}</span></div><span class="reinc-chip">REINC. ${guardian.reincarnationLevel}</span></div><div class="guardian-core-stats"><span><small>LEVEL</small><strong data-guardian-level></strong></span><span><small>DPS</small><strong data-guardian-dps></strong></span></div><button class="mana-stone-control" data-open-stone-picker="${guardian.id}"><span><small>MANA STONE</small><strong data-guardian-stone>NONE</strong></span><b aria-hidden="true">›</b></button><div class="purchase-row">${guardianUpgradeMarkup(guardian.id, 1, "+1", quotes[0])}${guardianUpgradeMarkup(guardian.id, 10, "+10", quotes[1])}${guardianUpgradeMarkup(guardian.id, "max", "MAX", quotes[2])}</div></article>`;
    }).join("");
    updateGuardianValues(state);
  }

  function stoneEffectText(stone) {
    const effectiveLevel = game.getEffectiveStoneLevel(stone);
    return `DPS +${(effectiveLevel * stone.power * 100).toFixed(1)}% · Effective Lv.${formatNumber(effectiveLevel)}`;
  }

  function renderStonePicker(state) {
    if (!openStonePickerGuardianId) return;
    const guardian = state.guardians.find((item) => item.id === openStonePickerGuardianId && item.discovered);
    if (!guardian) return closeStonePicker();
    elements.stonePickerTitle.textContent = guardian.name;
    const noneSelected = !guardian.equippedManaStoneId;
    const noneRow = `<button class="stone-picker-item none ${noneSelected ? "selected" : ""}" data-picker-stone=""><span><strong>NONE</strong><small>Remove the equipped Mana Stone</small></span>${noneSelected ? "<b>EQUIPPED</b>" : ""}</button>`;
    const stoneRows = state.manaStones.map((stone) => {
      const equippedGuardian = state.guardians.find((item) => item.id === stone.equippedGuardianId);
      const selected = stone.id === guardian.equippedManaStoneId;
      const status = selected ? "EQUIPPED" : equippedGuardian ? `MOVE FROM ${escapeHtml(equippedGuardian.name)}` : "";
      return `<button class="stone-picker-item ${stone.rarity.toLowerCase()} ${selected ? "selected" : ""}" data-picker-stone="${stone.id}"><span><strong>${stone.rarity} · Lv.${formatNumber(stone.level)}</strong><small>${stoneEffectText(stone)}</small></span>${status ? `<b>${status}</b>` : ""}</button>`;
    }).join("");
    elements.stonePickerList.innerHTML = `${noneRow}${stoneRows || `<p class="empty-state">No Mana Stones owned.</p>`}`;
  }

  function openStonePicker(guardianId) {
    openStonePickerGuardianId = guardianId;
    elements.stonePicker.hidden = false;
    renderStonePicker(game.getState());
  }

  function closeStonePicker() {
    openStonePickerGuardianId = null;
    elements.stonePicker.hidden = true;
  }

  function renderStones(state) {
    elements.stoneCount.textContent = `${state.manaStones.length} STONES`;
    lastStoneInventoryStage = state.stage;
    if (!state.manaStones.length) {
      elements.stoneList.innerHTML = `<div class="empty-state">Defeat Mimics and Region Bosses to find Mana Stones.</div>`;
      return;
    }
    elements.stoneList.innerHTML = state.manaStones.map((stone) => {
      const equipped = state.guardians.find((guardian) => guardian.id === stone.equippedGuardianId);
      return `<article class="stone-card ${stone.rarity.toLowerCase()}"><div class="stone-card-head"><div><h3>Mana Stone · Lv.${formatNumber(stone.level)}</h3><p>${stoneEffectText(stone)}</p></div><span class="rarity">${stone.rarity}</span></div><p>${equipped ? `Equipped: ${escapeHtml(equipped.name)}` : "Not equipped · Select it from a Guardian card"}</p></article>`;
    }).join("");
  }

  function renderStars(state) {
    const preview = game.getReincarnationPreview();
    elements.starsValue.textContent = `${formatNumber(state.stars)} ★`;
    elements.starsPreview.textContent = `+${formatNumber(preview.stars)}`;
    elements.reincarnateButton.disabled = !preview.available;
    elements.reincarnateButton.textContent = preview.available ? "REINCARNATE" : `REINCARNATE · LV ${Balance.constants.REINCARNATION_REQUIRED_LEVEL}`;
    elements.artifactList.innerHTML = GameData.ARTIFACT_DEFINITIONS.map((definition) => {
      const artifact = state.artifacts[definition.id];
      const cost = Balance.artifactUpgradeCost(artifact.level);
      const effect = artifact.level * Balance.constants.ARTIFACT_BONUS_PER_LEVEL * 100;
      return `<article class="artifact-card"><div><h3>${escapeHtml(definition.name)} · Lv.${artifact.level}</h3><p>Current effect +${effect.toFixed(0)}%</p></div><button data-artifact="${definition.id}" ${state.stars < cost ? "disabled" : ""}>LEVEL UP<br>${cost} ★</button></article>`;
    }).join("");
  }

  function renderSettings(state) {
    elements.damageNumbers.checked = state.settings.damageNumbers;
    elements.hitAnimations.checked = state.settings.hitAnimations;
    elements.developerInfo.innerHTML = [
      ["Save Version", state.saveVersion], ["Highest Stage", state.lifetime.highestStage], ["Monster Type", state.monster.type],
      ["Boss Target", state.progression.pendingBossStage || "—"], ["Nazar Escalation", state.run.nazarEscalation],
      ["Total TAP", formatNumber(game.getTotalTap())], ["Total DPS", formatNumber(game.getTotalDps())]
    ].map(([term, value]) => `<dt>${term}</dt><dd>${value}</dd>`).join("");
    const canForceNazar = state.progression.farmingBeforeBoss && state.monster.type !== "nazar";
    elements.forceNazar.disabled = !canForceNazar;
    elements.forceNazarHint.textContent = state.monster.type === "nazar" ? "Nazar is already active" : "Available while farming";
  }

  function render(state, event = { type: "loaded" }) {
    renderCombat(state);
    renderLutie(state);
    const rebuildGuardians = ["loaded", "reset", "imported", "reincarnated", "guardianAcquired"].includes(event.type)
      || (event.type === "settingChanged" && event.key === "guardianSort");
    if (rebuildGuardians) renderGuardians(state);
    else updateGuardianValues(state);
    const rebuildStones = ["loaded", "reset", "imported", "reincarnated", "manaStoneDropped", "manaStoneEquipped", "manaStoneUnequipped"].includes(event.type)
      || lastStoneInventoryStage !== state.stage;
    if (rebuildStones) renderStones(state);
    if (openStonePickerGuardianId && ["manaStoneDropped", "manaStoneEquipped", "manaStoneUnequipped", "imported", "reincarnated", "reset"].includes(event.type)) renderStonePicker(state);
    renderStars(state);
    renderSettings(state);
    elements.clearOverlay.hidden = !(state.progression.v01Cleared && !state.progression.clearSeen);
  }

  function showDamage(amount, x, y, type, state) {
    if (!state.settings.damageNumbers) return;
    const popup = document.createElement("span");
    popup.className = `damage-popup ${type === "auto" ? "auto" : type === "skill" ? "skill" : ""}`;
    popup.textContent = `${type === "auto" ? "DPS " : type === "skill" ? "SKILL " : "-"}${formatNumber(amount)}`;
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    elements.damageLayer.appendChild(popup);
    popup.addEventListener("animationend", () => popup.remove());
  }

  function replayMonsterAnimation(className, state) {
    if (!state.settings.hitAnimations) return;
    clearTimeout(monsterAnimationTimer);
    elements.monsterButton.classList.remove("hit-strong", "hit-soft", "defeated");
    void elements.monsterButton.offsetWidth;
    elements.monsterButton.classList.add(className);
    monsterAnimationTimer = setTimeout(() => elements.monsterButton.classList.remove(className), className === "defeated" ? 310 : 210);
  }

  function performAttack(point) {
    lastTapPoint = point || null;
    game.attack();
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 1800);
  }

  function showAcquisition(guardian, dps) {
    clearTimeout(acquisitionTimer);
    elements.acquisitionName.textContent = guardian.name;
    elements.acquisitionDps.textContent = `DPS +${formatNumber(dps)}`;
    elements.acquisitionOverlay.hidden = false;
    acquisitionTimer = setTimeout(() => { elements.acquisitionOverlay.hidden = true; }, 1800);
  }

  function showStoneAcquisition(stone) {
    clearTimeout(acquisitionTimer);
    elements.stoneAcquisitionName.textContent = `Lv${stone.level} ${stone.rarity}`;
    elements.stoneAcquisitionPower.textContent = `Power +${(stone.power * 100).toFixed(1)}%/Lv`;
    elements.stoneAcquisitionOverlay.hidden = false;
    acquisitionTimer = setTimeout(() => { elements.stoneAcquisitionOverlay.hidden = true; }, 1800);
  }

  game.subscribe((state, event) => {
    if (event.type === "bossTimer") {
      elements.bossTimerValue.textContent = (state.boss.timeRemainingMs / 1000).toFixed(1);
      return;
    }
    render(state, event);
    if (["loaded", "reset", "imported"].includes(event.type)) {
      const summary = event.offlineSummary;
      elements.offlineSummary.hidden = !summary;
      if (summary) {
        const rows = [["Time Away", `${(summary.elapsedMs / 3600000).toFixed(2)} h`], ["Stages Advanced", summary.stagesAdvanced],
          ["Gold Earned", formatNumber(summary.goldEarned)], ["Uncollected (capacity)", formatNumber(summary.goldLost)],
          ["Final Stage", summary.finalStage], ["Time Excluded (safety cap)", `${(summary.unprocessedMs / 3600000).toFixed(2)} h`]];
        elements.offlineDetails.innerHTML = rows.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("");
        elements.offlineSummary.open = true;
        showToast("Offline progress applied · summary in LUTIE");
      }
    }
    if (event.type === "balloon") showToast(`BALLOON ↑ +10 STAGES · Stage ${event.destination}`);
    if (["tap", "autoAttack", "skillAttack"].includes(event.type)) {
      const rect = elements.attackArea.getBoundingClientRect();
      const isAuto = event.type === "autoAttack";
      const isSkill = event.type === "skillAttack";
      const point = !isAuto && lastTapPoint ? lastTapPoint : { x: rect.width * (isAuto ? .58 : .5), y: rect.height * .52 };
      showDamage(event.amount, point.x, point.y, isAuto ? "auto" : isSkill ? "skill" : "tap", state);
      replayMonsterAnimation(event.defeated ? "defeated" : isAuto ? "hit-soft" : "hit-strong", state);
    }
    if (event.type === "guardianAcquired") showAcquisition(event.guardian, event.dps);
    if (event.type === "manaStoneDropped") showStoneAcquisition(event.stone);
    if (event.type === "saved") showToast("Save complete");
    if (event.type === "imported") showToast("Save imported");
    if (event.type === "reincarnated") showToast(`Reincarnated · +${event.starsEarned} Stars`);
  });

  elements.attackArea.addEventListener("click", (event) => {
    if (event.target.closest("[data-no-attack], .encounter-badge")) return;
    const rect = elements.attackArea.getBoundingClientRect();
    performAttack({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  });
  elements.challengeBoss.addEventListener("click", (event) => { event.stopPropagation(); game.challengeBoss(); });
  elements.giveUpBoss.addEventListener("click", (event) => { event.stopPropagation(); game.giveUpBoss(); });
  elements.lutieUpgrade.addEventListener("click", () => game.upgradeLutie());
  elements.upgradeBag.addEventListener("click", () => game.upgradeBag());
  elements.allGuardian1.addEventListener("click", () => game.upgradeAllGuardians(1));
  elements.allGuardian10.addEventListener("click", () => game.upgradeAllGuardians(10));
  elements.forceBalloon.addEventListener("click", () => game.forceBalloon());
  elements.developerOffline.addEventListener("click", () => game.simulateDeveloperOffline());
  elements.lutieUpgrade10.addEventListener("click", () => game.upgradeLutie(10));
  elements.lutieUpgradeMax.addEventListener("click", () => game.upgradeLutie("max"));
  elements.skillGrid.addEventListener("click", (event) => { if (event.target.closest("[data-skill='flare-ray']")) game.useFlareRay(); });

  elements.guardianList.addEventListener("click", (event) => {
    const stoneControl = event.target.closest("[data-open-stone-picker]");
    if (stoneControl) return openStonePicker(stoneControl.dataset.openStonePicker);
    const button = event.target.closest("[data-guardian-upgrade]");
    if (!button) return;
    const raw = button.dataset.amount;
    game.upgradeGuardian(button.dataset.guardianUpgrade, raw === "max" ? "max" : Number(raw));
  });
  elements.guardianSort.addEventListener("change", () => game.setSetting("guardianSort", elements.guardianSort.value));
  elements.stonePickerList.addEventListener("click", (event) => {
    const option = event.target.closest("[data-picker-stone]");
    if (!option || !openStonePickerGuardianId) return;
    const state = game.getState();
    const guardian = state.guardians.find((item) => item.id === openStonePickerGuardianId);
    if (!option.dataset.pickerStone) {
      if (guardian && guardian.equippedManaStoneId) game.unequipManaStone(guardian.equippedManaStoneId);
      return;
    }
    game.equipManaStone(option.dataset.pickerStone, openStonePickerGuardianId);
  });
  elements.closeStonePicker.addEventListener("click", closeStonePicker);
  elements.stonePicker.addEventListener("click", (event) => { if (event.target === elements.stonePicker) closeStonePicker(); });
  elements.artifactList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-artifact]");
    if (button) game.upgradeArtifact(button.dataset.artifact);
  });

  document.querySelectorAll(".bottom-nav button").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".bottom-nav button").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      const active = panel.dataset.panel === button.dataset.tab;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
  }));

  elements.reincarnateButton.addEventListener("click", () => {
    const preview = game.getReincarnationPreview();
    if (!preview.available) return;
    elements.modalStars.textContent = `${preview.stars} Star${preview.stars === 1 ? "" : "s"}`;
    elements.reincarnateModal.hidden = false;
  });
  elements.cancelReincarnate.addEventListener("click", () => { elements.reincarnateModal.hidden = true; });
  elements.confirmReincarnate.addEventListener("click", () => { elements.reincarnateModal.hidden = true; game.reincarnate(); });
  elements.continueButton.addEventListener("click", () => game.acknowledgeClear());

  elements.saveNow.addEventListener("click", () => game.saveNow());
  elements.exportSave.addEventListener("click", () => {
    const blob = new Blob([game.exportSave()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");
    anchor.href = url;
    anchor.download = `lutie-clicker-save-${timestamp}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Save exported");
  });
  elements.importSave.addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", async () => {
    const file = elements.importFile.files[0];
    if (!file) return;
    const result = game.importSave(await file.text());
    if (!result.ok) showToast(result.error);
    elements.importFile.value = "";
  });
  elements.damageNumbers.addEventListener("change", () => game.setSetting("damageNumbers", elements.damageNumbers.checked));
  elements.hitAnimations.addEventListener("change", () => game.setSetting("hitAnimations", elements.hitAnimations.checked));
  elements.forceNazar.addEventListener("click", () => game.forceNazar());
  elements.addDeveloperGold.addEventListener("click", () => game.addDeveloperGold());
  elements.reset.addEventListener("click", () => { if (global.confirm("Reset all progress? This cannot be undone.")) game.reset(); });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && openStonePickerGuardianId) {
      closeStonePicker();
      return;
    }
    if (event.repeat || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
    if (event.target.closest && event.target.closest("button, input, textarea, select, a, [contenteditable='true']")) return;
    if (![" ", "Spacebar", "z", "x", "Enter"].includes(event.key)) return;
    if (event.key === " " || event.key === "Spacebar") event.preventDefault();
    performAttack();
  });

  game.start();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) game.stop();
    else game.start();
  });
  global.addEventListener("beforeunload", () => game.stop());
  global.LutieClicker = Object.freeze({ game, formatNumber });
})(window);

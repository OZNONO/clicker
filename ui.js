(function (global) {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const elements = {
    stage: $("stageValue"), gold: $("goldValue"), stageLabel: $("stageLabel"), name: $("monsterName"), kills: $("killCount"),
    hp: $("hpValue"), hpFill: $("hpFill"), encounterBadge: $("encounterBadge"), attackArea: $("attackArea"),
    bossTimerWrap: $("bossTimerWrap"), bossTimerValue: $("bossTimerValue"), farmingBanner: $("farmingBanner"),
    farmingStage: $("farmingStage"), nextBossHp: $("nextBossHp"), challengeBoss: $("challengeBoss"),
    monsterButton: $("monsterButton"), damageLayer: $("damageLayer"), tapStat: $("tapStat"), dpsStat: $("dpsStat"),
    lutieLevel: $("lutieLevel"), lutieTap: $("lutieTap"), lutieCost: $("lutieCost"), lutieUpgrade: $("lutieUpgrade"),
    lutieUpgrade10: $("lutieUpgrade10"), lutieUpgradeMax: $("lutieUpgradeMax"), skillGrid: $("skillGrid"),
    guardianTotalDps: $("guardianTotalDps"), guardianList: $("guardianList"), stoneCount: $("stoneCount"), stoneList: $("stoneList"),
    starsValue: $("starsValue"), starsPreview: $("starsPreview"), reincarnateButton: $("reincarnateButton"), artifactList: $("artifactList"),
    saveNow: $("saveNow"), exportSave: $("exportSave"), importSave: $("importSave"), importFile: $("importFile"),
    damageNumbers: $("damageNumbers"), hitAnimations: $("hitAnimations"), reset: $("resetSave"), developerInfo: $("developerInfo"),
    reincarnateModal: $("reincarnateModal"), modalStars: $("modalStars"), cancelReincarnate: $("cancelReincarnate"), confirmReincarnate: $("confirmReincarnate"),
    clearOverlay: $("clearOverlay"), continueButton: $("continueButton"), acquisitionOverlay: $("acquisitionOverlay"),
    acquisitionName: $("acquisitionName"), acquisitionDps: $("acquisitionDps"), toast: $("toast")
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

  function upgradeButton(button, label, quote) {
    button.disabled = quote.levels === 0;
    button.textContent = quote.levels ? `${label} (+${quote.levels})` : label;
  }

  function renderCombat(state) {
    const monster = state.monster;
    const hpPercent = Math.max(0, Math.min(100, monster.hp / monster.maxHp * 100));
    const badgeByType = { guardian: "GUARDIAN", regionBoss: "REGION BOSS", mimic: "MIMIC", nazar: "NAZAR" };
    elements.stage.textContent = formatNumber(state.stage);
    elements.gold.textContent = formatNumber(state.gold);
    elements.stageLabel.textContent = `STAGE ${formatNumber(state.stage)}`;
    elements.name.textContent = monster.name;
    elements.kills.textContent = monster.type === "normal" ? `MONSTER ${state.killsInStage} / ${Balance.constants.MONSTERS_PER_STAGE}` : badgeByType[monster.type] || "SPECIAL";
    elements.hp.textContent = `${formatNumber(monster.hp)} / ${formatNumber(monster.maxHp)}`;
    elements.hpFill.style.width = `${hpPercent}%`;
    elements.encounterBadge.hidden = !badgeByType[monster.type];
    elements.encounterBadge.textContent = badgeByType[monster.type] || "";
    elements.bossTimerWrap.hidden = !monster.isTimed;
    elements.bossTimerValue.textContent = ((state.boss.timeRemainingMs || 0) / 1000).toFixed(1);
    elements.farmingBanner.hidden = !state.progression.farmingBeforeBoss;
    elements.farmingStage.textContent = `FARMING STAGE ${state.stage}`;
    elements.nextBossHp.textContent = `NEXT BOSS HP: ${formatNumber(Balance.monsterMaxHp(state.progression.pendingBossStage || state.stage + 1))}`;
    elements.attackArea.classList.toggle("farming", state.progression.farmingBeforeBoss);
    ["normal", "guardian", "regionBoss", "mimic", "nazar"].forEach((type) => elements.monsterButton.classList.toggle(`type-${type}`, monster.type === type));
    elements.tapStat.textContent = formatNumber(game.getTotalTap());
    elements.dpsStat.textContent = formatNumber(game.getTotalDps());
  }

  function renderLutie(state) {
    const quotes = [1, 10, "max"].map((amount) => game.getUpgradeQuote("lutie", amount));
    elements.lutieLevel.textContent = `LV. ${formatNumber(state.lutie.level)}`;
    elements.lutieTap.textContent = formatNumber(game.getTotalTap());
    elements.lutieCost.textContent = formatNumber(Balance.lutieUpgradeCost(state.lutie.level));
    upgradeButton(elements.lutieUpgrade, "x1", quotes[0]);
    upgradeButton(elements.lutieUpgrade10, "x10", quotes[1]);
    upgradeButton(elements.lutieUpgradeMax, "MAX", quotes[2]);
    const cooldownMs = Math.max(0, state.skills.flareRayReadyAt - Date.now());
    elements.skillGrid.innerHTML = GameData.ACTIVE_SKILL_DEFINITIONS.map((skill) => {
      const unlocked = state.lutie.level >= skill.requiredLevel;
      const onCooldown = skill.id === "flare-ray" && cooldownMs > 0;
      const status = !unlocked ? `Lv${skill.requiredLevel}` : !skill.implemented ? "COMING SOON" : onCooldown ? `${Math.ceil(cooldownMs / 1000)}s` : "READY";
      return `<button class="skill-slot ${unlocked ? "" : "locked"} ${unlocked && skill.implemented && !onCooldown ? "available" : ""} ${onCooldown ? "cooldown" : ""}" data-skill="${skill.id}" ${unlocked && skill.implemented && !onCooldown ? "" : "disabled"}><i></i><strong>${escapeHtml(skill.name)}</strong><span>${status}</span></button>`;
    }).join("");
  }

  function renderGuardians(state) {
    elements.guardianTotalDps.textContent = formatNumber(game.getTotalGuardianDps());
    elements.guardianList.innerHTML = state.guardians.map((guardian) => {
      if (!guardian.discovered) return `<article class="roster-card locked"><h3>???</h3><p>Not discovered</p></article>`;
      const dps = game.getGuardianFinalDps(guardian.id);
      const stone = state.manaStones.find((item) => item.id === guardian.equippedManaStoneId);
      if (!guardian.activeThisRun) return `<article class="roster-card locked"><div class="roster-card-head"><div><h3>${escapeHtml(guardian.name)}</h3><p>Discovered · Awaiting this run</p></div><span class="reinc-chip">R${guardian.reincarnationLevel}</span></div></article>`;
      const quotes = [1, 10, "max"].map((amount) => game.getUpgradeQuote("guardian", amount, guardian.id));
      const labels = ["x1", "x10", "MAX"].map((label, index) => quotes[index].levels ? `${label} (+${quotes[index].levels})` : label);
      return `<article class="roster-card"><div class="roster-card-head"><div><h3>${escapeHtml(guardian.name)}</h3><p>Lv. ${formatNumber(guardian.level)} · DPS ${formatNumber(dps)}</p></div><span class="reinc-chip">REINC. ${guardian.reincarnationLevel}</span></div><div class="roster-stats"><span>STONE <b>${stone ? `Lv.${stone.level} ${stone.rarity}` : "NONE"}</b></span><span>NEXT <b>${formatNumber(Balance.guardianUpgradeCost(guardian.level, guardian.unlockOrder))}</b></span></div><div class="purchase-row">${[1, 10, "max"].map((amount, index) => `<button class="purchase-button" data-guardian-upgrade="${guardian.id}" data-amount="${amount}" ${quotes[index].levels ? "" : "disabled"}>${labels[index]}</button>`).join("")}</div></article>`;
    }).join("");
  }

  function renderStones(state) {
    elements.stoneCount.textContent = `${state.manaStones.length} STONES`;
    const discovered = state.guardians.filter((guardian) => guardian.discovered);
    if (!state.manaStones.length) {
      elements.stoneList.innerHTML = `<div class="empty-state">Defeat Mimics and Region Bosses to find Mana Stones.</div>`;
      return;
    }
    elements.stoneList.innerHTML = state.manaStones.map((stone) => {
      const equipped = state.guardians.find((guardian) => guardian.id === stone.equippedGuardianId);
      const options = [`<option value="">Choose Guardian</option>`, ...discovered.map((guardian) => `<option value="${guardian.id}" ${guardian.id === stone.equippedGuardianId ? "selected" : ""}>${escapeHtml(guardian.name)}</option>`)].join("");
      return `<article class="stone-card ${stone.rarity.toLowerCase()}"><div class="stone-card-head"><div><h3>Mana Stone · Lv.${formatNumber(stone.level)}</h3><p>Effective Lv.${formatNumber(game.getEffectiveStoneLevel(stone))} · ${(stone.power * 100).toFixed(1)}% per level</p></div><span class="rarity">${stone.rarity}</span></div><p>${equipped ? `Equipped: ${escapeHtml(equipped.name)}` : "Not equipped"}</p><div class="stone-actions"><select data-stone-select="${stone.id}">${options}</select><button data-stone-equip="${stone.id}">${equipped ? "UPDATE" : "EQUIP"}</button>${equipped ? `<button data-stone-unequip="${stone.id}">REMOVE</button>` : ""}</div></article>`;
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
  }

  function render(state) {
    renderCombat(state);
    renderLutie(state);
    renderGuardians(state);
    renderStones(state);
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

  game.subscribe((state, event) => {
    if (event.type === "bossTimer") {
      elements.bossTimerValue.textContent = (state.boss.timeRemainingMs / 1000).toFixed(1);
      return;
    }
    render(state);
    if (["tap", "autoAttack", "skillAttack"].includes(event.type)) {
      const rect = elements.attackArea.getBoundingClientRect();
      const isAuto = event.type === "autoAttack";
      const isSkill = event.type === "skillAttack";
      const point = !isAuto && lastTapPoint ? lastTapPoint : { x: rect.width * (isAuto ? .58 : .5), y: rect.height * .52 };
      showDamage(event.amount, point.x, point.y, isAuto ? "auto" : isSkill ? "skill" : "tap", state);
      replayMonsterAnimation(event.defeated ? "defeated" : isAuto ? "hit-soft" : "hit-strong", state);
    }
    if (event.type === "guardianAcquired") showAcquisition(event.guardian, event.dps);
    if (event.type === "manaStoneDropped") showToast(`${event.stone.rarity} Mana Stone acquired`);
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
  elements.lutieUpgrade.addEventListener("click", () => game.upgradeLutie());
  elements.lutieUpgrade10.addEventListener("click", () => game.upgradeLutie(10));
  elements.lutieUpgradeMax.addEventListener("click", () => game.upgradeLutie("max"));
  elements.skillGrid.addEventListener("click", (event) => { if (event.target.closest("[data-skill='flare-ray']")) game.useFlareRay(); });

  elements.guardianList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-guardian-upgrade]");
    if (!button) return;
    const raw = button.dataset.amount;
    game.upgradeGuardian(button.dataset.guardianUpgrade, raw === "max" ? "max" : Number(raw));
  });
  elements.stoneList.addEventListener("click", (event) => {
    const equip = event.target.closest("[data-stone-equip]");
    const unequip = event.target.closest("[data-stone-unequip]");
    if (equip) {
      const select = elements.stoneList.querySelector(`[data-stone-select='${equip.dataset.stoneEquip}']`);
      if (!select.value) return showToast("Choose a discovered Guardian");
      game.equipManaStone(equip.dataset.stoneEquip, select.value);
    } else if (unequip) game.unequipManaStone(unequip.dataset.stoneUnequip);
  });
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
  elements.reset.addEventListener("click", () => { if (global.confirm("Reset all progress? This cannot be undone.")) game.reset(); });

  document.addEventListener("keydown", (event) => {
    if (event.repeat || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
    if (event.target.closest && event.target.closest("button, input, textarea, select, a, [contenteditable='true']")) return;
    if (![" ", "Spacebar", "z", "x", "Enter"].includes(event.key)) return;
    if (event.key === " " || event.key === "Spacebar") event.preventDefault();
    performAttack();
  });

  game.start();
  global.addEventListener("beforeunload", () => game.stop());
  global.LutieClicker = Object.freeze({ game, formatNumber });
})(window);

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.evaluate(() => {
      const game = LutieClicker.game;
      game.stop();
      const seed = JSON.parse(game.exportSave());
      seed.stage = 1;
      seed.killsInStage = 0;
      seed.monster = { type: 'normal', hp: 1000 };
      seed.lutie.level = 1;
      seed.guardians.forEach(g => { g.activeThisRun = false; });
      game.importSave(JSON.stringify(seed));
    });
    const tapHpBefore = await page.evaluate(() => LutieClicker.game.getState().monster.hp);
    await page.click('#monsterButton');
    assert.equal(await page.evaluate(() => LutieClicker.game.getState().monster.hp), tapHpBefore - 1, 'Pointer/tap attack remains active');
    assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'monsterButton', 'Pointer attack must not leave monster focus behind');
    await page.click('#monsterButton');
    assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'monsterButton', 'Repeated pointer attacks must not retain focus');
    for (const key of ['z', 'x', ' ']) {
      const hpBefore = await page.evaluate(() => LutieClicker.game.getState().monster.hp);
      const tap = await page.evaluate(() => LutieClicker.game.getTotalTap());
      await page.keyboard.press(key === ' ' ? 'Space' : key);
      const hpAfter = await page.evaluate(() => LutieClicker.game.getState().monster.hp);
      assert.equal(hpBefore - hpAfter, tap, `${key === ' ' ? 'Space' : key.toUpperCase()} must attack exactly once after monster click`);
    }
    await page.locator('#monsterButton').focus();
    const focusedSpaceBefore = await page.evaluate(() => LutieClicker.game.getState().monster.hp);
    await page.keyboard.press('Space');
    assert.equal(focusedSpaceBefore - await page.evaluate(() => LutieClicker.game.getState().monster.hp), 1, 'Focused monster Space activation attacks exactly once');
    await page.click('[data-tab="settings"]');
    await page.locator('#language').focus();
    const controlHpBefore = await page.evaluate(() => LutieClicker.game.getState().monster.hp);
    await page.keyboard.press('z');
    assert.equal(await page.evaluate(() => LutieClicker.game.getState().monster.hp), controlHpBefore, 'Form controls retain the keyboard input guard');
    await page.click('[data-tab="lutie"]');
    await page.evaluate(() => {
      const game = LutieClicker.game;
      const seed = JSON.parse(game.exportSave());
      seed.stage = 100;
      seed.killsInStage = 0;
      seed.gold = 8766;
      seed.bagLevel = 1;
      seed.monster = { type: 'normal', hp: 1 };
      seed.lutie.level = 100;
      game.importSave(JSON.stringify(seed));
      document.querySelector('#damageLayer').replaceChildren();
    });
    await page.click('#monsterButton');
    assert.equal(await page.locator('.reward-popup').innerText(), '+1,234 G', 'Gold popup uses exact actual credited amount');
    await page.evaluate(() => {
      const game = LutieClicker.game;
      const seed = JSON.parse(game.exportSave());
      seed.gold = 10000;
      seed.bagLevel = 1;
      seed.monster = { type: 'normal', hp: 1 };
      game.importSave(JSON.stringify(seed));
      document.querySelector('#damageLayer').replaceChildren();
    });
    await page.click('#monsterButton');
    assert.equal(await page.locator('.reward-popup').count(), 0, 'No reward popup is shown when the Bag credits zero Gold');
    await page.evaluate(() => {
      const game = LutieClicker.game;
      const seed = JSON.parse(game.exportSave());
      seed.stage = 10;
      seed.killsInStage = 8;
      seed.gold = 0;
      seed.progression = { ...seed.progression, farmingBeforeBoss: true, bossRetryAvailable: true, pendingBossStage: 10, pendingEncounterType: 'regionBoss' };
      seed.monster = { type: 'nazar', hp: 1 };
      game.importSave(JSON.stringify(seed));
      document.querySelector('#damageLayer').replaceChildren();
    });
    await page.click('#monsterButton');
    assert.equal(await page.locator('.reward-popup').count(), 0, 'Nazar never shows a Gold reward popup');

    const animationState = await page.evaluate(() => {
      const idle = document.querySelector('.monster-idle');
      const visual = document.querySelector('.monster-visual');
      return { idleAnimation: getComputedStyle(idle).animationName, visualAnimation: getComputedStyle(visual).animationName };
    });
    assert.equal(animationState.idleAnimation, 'monsterIdle');
    await page.evaluate(() => {
      const game = LutieClicker.game;
      const seed = JSON.parse(game.exportSave());
      seed.stage = 1; seed.killsInStage = 0; seed.lutie.level = 1;
      seed.monster = { type: 'normal', hp: 10 };
      game.importSave(JSON.stringify(seed));
    });
    await page.click('#monsterButton');
    assert.equal(await page.locator('.monster-visual').evaluate(el => el.classList.contains('hit-strong')), true);
    assert.equal(await page.locator('.monster-idle').evaluate(el => getComputedStyle(el).animationName), 'monsterIdle', 'Hit feedback does not replace idle animation');
    await page.evaluate(() => {
      const game = LutieClicker.game;
      const seed = JSON.parse(game.exportSave());
      seed.stage = 1; seed.killsInStage = 0; seed.lutie.level = 100;
      seed.monster = { type: 'normal', hp: 1 };
      game.importSave(JSON.stringify(seed));
    });
    await page.click('#monsterButton');
    assert.equal(await page.locator('.monster-transition.defeated').count(), 1, 'Defeated encounter receives an independent death visual');
    assert.equal(await page.locator('.monster-visual.spawned').count(), 1, 'Replacement encounter receives spawn feedback');
    await page.click('#monsterButton');
    await page.click('#monsterButton');
    assert.ok(await page.locator('.monster-transition.defeated').count() <= 1, 'Rapid kills never accumulate stale death visuals');
    assert.equal(await page.locator('.monster-visual.defeated').count(), 0, 'Current encounter is never left in defeated state');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.monster-transition').count(), 0, 'Transition cleanup removes stale rapid-kill visuals');
    assert.equal(await page.locator('.monster-visual.spawned').count(), 0, 'Spawn state cleanup is token-safe');
    for (const encounter of [
      { type: 'stageBoss', stage: 1, kills: 9 },
      { type: 'regionBoss', stage: 10, kills: 9 },
      { type: 'guardian', stage: 5, kills: 0, guardianId: 'guardian-01' },
      { type: 'mimic', stage: 1, kills: 0 },
      { type: 'nazar', stage: 10, kills: 8, farming: true }
    ]) {
      await page.evaluate((entry) => {
        const game = LutieClicker.game;
        const seed = JSON.parse(game.exportSave());
        seed.stage = entry.stage; seed.killsInStage = entry.kills; seed.lutie.level = 100; seed.gold = 0; seed.bagLevel = 1;
        seed.balloonChallenge = null;
        seed.progression = entry.farming
          ? { ...seed.progression, farmingBeforeBoss: true, bossRetryAvailable: true, pendingBossStage: 10, pendingEncounterType: 'regionBoss' }
          : { ...seed.progression, farmingBeforeBoss: false, bossRetryAvailable: false, pendingBossStage: null, pendingEncounterType: null };
        seed.monster = { type: entry.type, hp: 1, guardianId: entry.guardianId || null };
        game.importSave(JSON.stringify(seed));
        game.attack();
      }, encounter);
      assert.equal(await page.locator(`.monster-transition.type-${encounter.type}`).count(), 1, `${encounter.type} uses the shared death transition`);
      assert.equal(await page.locator('.monster-visual.spawned').count(), 1, `${encounter.type} replacement uses the shared spawn transition`);
    }
    await page.evaluate(() => {
      document.querySelector('#acquisitionOverlay').hidden = true;
      document.querySelector('#stoneAcquisitionOverlay').hidden = true;
    });
    await page.evaluate(() => {
      const game = LutieClicker.game;
      game.stop();
      const seed = JSON.parse(game.exportSave());
      seed.stage = 10;
      seed.balloonChallenge = null;
      seed.progression = { ...seed.progression, farmingBeforeBoss: true, bossRetryAvailable: true, pendingBossStage: 10, pendingEncounterType: 'regionBoss' };
      seed.guardians[0].discovered = seed.guardians[0].activeThisRun = seed.guardians[0].unlocked = true;
      seed.guardians[0].level = 20;
      seed.monster = { type: 'normal', hp: 10 };
      game.importSave(JSON.stringify(seed));
    });
    const indicator = await page.locator('#nazarIndicator').evaluate(el => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { visible: !el.hidden, active: el.classList.contains('active'), uncovered: el.contains(top), covering: top?.outerHTML.slice(0, 120) };
    });
    console.log('Nazar visibility:', indicator);
    assert.ok(indicator.visible && indicator.active && indicator.uncovered, 'Eligible Nazar indicator must not be covered by farming banner');
    for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 430, height: 932 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => {
        const game = LutieClicker.game;
        const seed = JSON.parse(game.exportSave());
        seed.gold = 9000; seed.bagLevel = 1;
        seed.stage = 10;
      seed.balloonChallenge = null;
        seed.progression = { ...seed.progression, farmingBeforeBoss: true, bossRetryAvailable: true, pendingBossStage: 10, pendingEncounterType: 'regionBoss' };
        seed.monster = { type: 'normal', hp: 10 };
        seed.guardians.forEach((g, i) => Object.assign(g, { discovered: true, activeThisRun: true, unlocked: true, level: 1, acquisitionOrder: i + 1 }));
        seed.manaStones = [{ id: 'browser-stone', level: 9, rarity: 'HIGH', equippedGuardianId: null }];
        game.importSave(JSON.stringify(seed));
      });
      const uncovered = async selector => page.locator(selector).evaluate(el => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      });
      assert.equal(await uncovered('#nazarIndicator'), true);
      assert.equal(await uncovered('#challengeBoss'), true);
      await page.click('[data-tab="lutie"]');
      assert.ok((await page.locator('#upgradeBag').boundingBox()).height >= 44);
      await page.click('#upgradeBag');
      assert.equal(await page.locator('#bagLevel').innerText(), 'BAG Lv. 2');
      await page.click('[data-tab="guardian"]');
      await page.click('#allGuardian1');
      assert.equal(await page.evaluate(() => LutieClicker.game.getState().guardians.every(g => g.level === 2)), true);
      await page.locator('[data-open-stone-picker]').first().click();
      await page.click('[data-picker-stone="browser-stone"]');
      assert.equal(await page.evaluate(() => LutieClicker.game.getState().guardians[0].equippedManaStoneId), 'browser-stone');
      const pickerBox = await page.locator('#stonePicker .modal-card').boundingBox();
      assert.ok(pickerBox.x >= 0 && pickerBox.x + pickerBox.width <= viewport.width);
      await page.click('#closeStonePicker');
      await page.evaluate(() => {
        document.querySelector('#tab-guardian').scrollTop = 250;
        window.retainedGuardianCard = document.querySelector('[data-guardian-card]');
      });
      const scrollBefore = await page.locator('#tab-guardian').evaluate(el => el.scrollTop);
      await page.evaluate(() => LutieClicker.game.autoAttack());
      assert.equal(await page.evaluate(() => retainedGuardianCard === document.querySelector('[data-guardian-card]')), true);
      assert.equal(await page.locator('#tab-guardian').evaluate(el => el.scrollTop), scrollBefore);
      await page.click('[data-tab="settings"]');
      await page.locator('.developer-info').evaluate(el => { el.open = true; });
      await page.click('#developerOffline');
      await page.click('[data-tab="lutie"]');
      await page.locator('#offlineSummary').scrollIntoViewIfNeeded();
      const summaryBox = await page.locator('#offlineSummary').boundingBox();
      assert.ok(summaryBox.x >= 0 && summaryBox.x + summaryBox.width <= viewport.width);
      await page.evaluate(() => LutieClicker.game.forceBalloon());
      assert.match(await page.locator('#toast').innerText(), /BALLOON/);
      const navigation = await page.locator('.bottom-nav').boundingBox();
      assert.ok(navigation.y >= 0 && navigation.y + navigation.height <= viewport.height);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.SCREENSHOT_DIR) {
        await page.click('[data-tab="lutie"]');
        await page.evaluate(() => {
          const game = LutieClicker.game;
          const seed = JSON.parse(game.exportSave());
          seed.stage = 10;
      seed.balloonChallenge = null;
          seed.progression = { ...seed.progression, farmingBeforeBoss: true, bossRetryAvailable: true, pendingBossStage: 10, pendingEncounterType: 'regionBoss' };
          seed.monster = { type: 'normal', hp: 10 };
          seed.guardians[0].level = 20;
          seed.settings.hitAnimations = false;
          game.importSave(JSON.stringify(seed));
          document.querySelector('#monsterButton').classList.remove('hit-strong', 'hit-soft', 'defeated');
          document.querySelector('#damageLayer').replaceChildren();
          document.querySelector('#tab-lutie').scrollTop = 0;
          document.querySelector('#toast').hidden = true;
        });
        await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `v03-${viewport.width}.png`) });
      }
      console.log(`UI ${viewport.width}x${viewport.height}: Bag, ALL, Nazar, picker, scroll, offline summary, balloon, navigation passed`);
    }
    await page.evaluate(() => {
      const game = LutieClicker.game;
      const seed = JSON.parse(game.exportSave());
      seed.stage = 10;
      seed.balloonChallenge = null;
      seed.progression = { ...seed.progression, farmingBeforeBoss: true, bossRetryAvailable: true, pendingBossStage: 10, pendingEncounterType: 'regionBoss' };
      seed.monster = { type: 'normal', hp: 10 };
      seed.guardians.forEach(g => { g.activeThisRun = false; });
      game.importSave(JSON.stringify(seed));
    });
    assert.equal(await page.locator('#nazarIndicator').innerText(), 'NAZAR INACTIVE');
    await page.click('#challengeBoss');
    assert.equal(await page.locator('#giveUpBoss').isVisible(), true);
    await page.click('#giveUpBoss');
    assert.equal(await page.locator('#challengeBoss').isVisible(), true);

    for (const width of [320, 430]) {
      await page.setViewportSize({ width, height: 740 });
      await page.evaluate(() => {
        const game = LutieClicker.game; game.stop();
        const seed = JSON.parse(game.exportSave());
        seed.stage = 10; seed.killsInStage = 0; seed.balloonChallenge = null;
        seed.progression = { ...seed.progression, farmingBeforeBoss: false, bossRetryAvailable: false, pendingBossStage: null, pendingEncounterType: null };
        seed.settings.language = 'en'; seed.settings.hitAnimations = false;
        seed.guardians[0].activeThisRun = seed.guardians[0].discovered = seed.guardians[0].unlocked = true;
        seed.gold = 123456789012345; seed.bagLevel = 25; seed.lutie.level = 100;
        seed.monster = { type: 'normal', hp: 35 };
        game.importSave(JSON.stringify(seed));
      });
      assert.equal(await page.locator('#killCount').innerText(), 'MONSTER 1 / 10');
      assert.equal(await page.locator('#goldValue').innerText(), '123,456,789,012,345');
      const formats = await page.evaluate(() => ({ gold: LutieClicker.formatGold(12438291), combat: LutieClicker.formatNumber(12438291) }));
      assert.equal(formats.gold, '12,438,291');
      assert.match(formats.combat, /M$/);
      await page.click('[data-tab="settings"]');
      const numericBefore = await page.evaluate(() => ({ gold: LutieClicker.game.getState().gold, stage: LutieClicker.game.getState().stage, dps: LutieClicker.game.getTotalDps(), tap: LutieClicker.game.getTotalTap() }));
      await page.selectOption('#language', 'ko');
      const numericAfter = await page.evaluate(() => ({ gold: LutieClicker.game.getState().gold, stage: LutieClicker.game.getState().stage, dps: LutieClicker.game.getTotalDps(), tap: LutieClicker.game.getTotalTap() }));
      assert.deepEqual(numericAfter, numericBefore);
      assert.equal(await page.locator('html').getAttribute('lang'), 'ko');
      assert.equal(await page.locator('[data-tab="guardian"]').innerText(), '가디언');
      assert.match(await page.locator('#saveNow').innerText(), /지금 저장/);
      assert.equal(await page.locator('#killCount').innerText(), '몬스터 1 / 10');
      await page.click('[data-tab="lutie"]');
      assert.match(await page.locator('#bagLevel').innerText(), /가방 레벨/);
      for (const tab of ['lutie','guardian','stone','star','settings']) {
        await page.click(`[data-tab="${tab}"]`);
        const overflow = await page.locator(`[data-panel="${tab}"]`).evaluate(el => el.scrollWidth > el.clientWidth);
        assert.equal(overflow, false, `No ${tab} horizontal overflow at ${width}px with full Gold`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.click('[data-tab="guardian"]');
      await page.locator('[data-open-stone-picker]').first().click();
      assert.equal(await page.locator('#closeStonePicker').innerText(), '닫기');
      assert.match(await page.locator('#stonePickerList').innerText(), /장착|없음/);
      await page.click('#closeStonePicker');
      await page.evaluate(() => {
        const game = LutieClicker.game;
        const seed = JSON.parse(game.exportSave()); seed.killsInStage = 8; seed.monster = { type: 'normal', hp: 1 };
        game.importSave(JSON.stringify(seed));
      });
      assert.equal(await page.locator('#killCount').innerText(), '몬스터 9 / 10');
      await page.evaluate(() => LutieClicker.game.attack());
      assert.equal(await page.locator('#killCount').innerText(), '지역 보스 · 10 / 10');
      await page.evaluate(() => LutieClicker.game.attack());
      assert.equal(await page.locator('#clearOverlay').count(), 0);
      assert.equal(await page.evaluate(() => LutieClicker.game.getState().stage), 11);
      assert.equal(await page.locator('#stoneAcquisitionOverlay').isVisible(), true);
      // Test Nazar at nonlethal damage with the real render path.
      await page.evaluate(() => {
        const game = LutieClicker.game;
        const seed = JSON.parse(game.exportSave()); seed.stage = 10; seed.lutie.level = 1;
        seed.monster = { type: 'normal', hp: 35 };
        seed.progression = { ...seed.progression, farmingBeforeBoss: true, bossRetryAvailable: true, pendingBossStage: 10, pendingEncounterType: 'regionBoss' };
        game.importSave(JSON.stringify(seed)); game.forceNazar();
      });
      const nazarHp = await page.evaluate(() => LutieClicker.game.getState().monster.hp);
      await page.evaluate(() => LutieClicker.game.attack());
      assert.ok(await page.evaluate(() => LutieClicker.game.getState().monster.hp) < nazarHp);
      assert.equal(await page.locator('#hpValue').innerText(), '??? / ???');
      assert.equal(await page.locator('#hpFill').evaluate(el => el.style.width), '100%');
      await page.evaluate(() => {
        LutieClicker.game.saveNow();
        document.querySelector('#acquisitionOverlay').hidden = true;
        document.querySelector('#stoneAcquisitionOverlay').hidden = true;
        document.querySelector('#toast').hidden = true;
      });
      await page.click('[data-tab="lutie"]');
      if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `v031-ko-${width}.png`) });
      await page.reload();
      await page.evaluate(() => LutieClicker.game.stop());
      assert.equal(await page.locator('html').getAttribute('lang'), 'ko');
      assert.equal(await page.evaluate(() => LutieClicker.game.getState().settings.language), 'ko');
      console.log(`Korean ${width}px: localization/persistence, exact Gold, counters, Nazar hidden bar and no clear dialog passed`);
    }

    // Serve under a real project prefix to catch assumptions hidden by file://.
    const root = path.resolve(__dirname, '..');
    const server = http.createServer((req, res) => {
      const rel = req.url.replace(/^\/lutie-project\//, '').split('?')[0] || 'index.html';
      const file = path.resolve(root, rel);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
      res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/lutie-project/`);
      assert.equal(await page.evaluate(() => LutieClicker.game.getState().saveVersion), 6);
      await page.evaluate(() => LutieClicker.game.stop());
      assert.equal(await page.locator('.bottom-nav button').count(), 5);
      console.log('Project-prefix HTTP boot passed');
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    assert.deepEqual(errors, []);
    console.log('Browser regression passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

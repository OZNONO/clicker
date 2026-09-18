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
      seed.stage = 9;
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
        seed.stage = 9;
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
          seed.stage = 9;
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
      seed.stage = 9;
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
      assert.equal(await page.evaluate(() => LutieClicker.game.getState().saveVersion), 5);
      await page.evaluate(() => LutieClicker.game.stop());
      assert.equal(await page.locator('.bottom-nav button').count(), 5);
      console.log('Project-prefix HTTP boot passed');
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    assert.deepEqual(errors, []);
    console.log('Browser regression passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

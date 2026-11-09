// tools/drive.js — headless smoke test for Torched Planet.
//
// Loaded AFTER game.js by a generated harness (see PROJECT.md §2). It drives the
// real game loop by calling update() directly, because requestAnimationFrame does
// not advance reliably under Chrome's --virtual-time-budget.
//
// It writes a machine-readable "RESULT:{...}" line into #result for --dump-dom.
(function () {
  const errors = [];
  window.addEventListener('error', event => errors.push(event.message));

  const $ = id => document.getElementById(id);
  const out = document.createElement('div');
  out.id = 'result';
  out.textContent = 'pending';
  document.body.appendChild(out);

  const run = n => { for (let i = 0; i < n; i++) update(1 / 120); };
  // Named *Text: a bare `level`/`round` here would shadow the game's numeric module-scope state.
  const levelText = () => $('turn').textContent.split(' · ')[0];
  const roundText = () => $('turn').textContent.split(' · ')[1];
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass, detail });

  window.addEventListener('load', () => {
    try {
      check('boots at LEVEL 01 · ROUND 01', $('turn').textContent === 'LEVEL 01 · ROUND 01', $('turn').textContent);
      check('shop opens before the first turn', $('shop').open === true, String($('shop').open));
      check('wind is announced and mild', Math.abs(wind) <= WIND_MAX && /WIND/.test($('wind').textContent), $('wind').textContent);
      check('enemy gauge mirrors shield HP', $('gauge-hp').textContent === String(tanks[1].hp), $('gauge-hp').textContent + ' vs ' + tanks[1].hp);
      check('every weapon has an ammo count', Object.keys(weapons).every(id => tanks[0].ammo[id] !== undefined),
        Object.keys(weapons).filter(id => tanks[0].ammo[id] === undefined).join(',') || 'all present');
      check('new weapons are stocked', ['nukeMini', 'napalmXL', 'large'].every(id => catalog[0][1].some(item => item.id === id)),
        catalog[0][1].map(item => item.id).join(','));

      // A Large shell must be restockable: the contract is a catalogue entry plus purchase()'s
      // ammo branch. Cash is borrowed and returned so the rest of the run is unaffected.
      const restock = catalog[0][1].find(item => item.id === 'large');
      const shellsBefore = tanks[0].ammo.large;
      tanks[0].cash = 500;
      const bought = !!restock && purchase(tanks[0], restock);
      check('Large shells can be restocked', bought && tanks[0].ammo.large === shellsBefore + 1,
        bought ? 'large ' + shellsBefore + ' → ' + tanks[0].ammo.large : 'purchase refused');
      tanks[0].cash = 0;
      updateShop();
      updateWeapons();
      updateHud();

      $('deploy').click();
      check('DEPLOY enables FIRE', $('fire').disabled === false, String($('fire').disabled));

      // Aim at minimum power: a guaranteed miss, so the CPU turn can resolve safely.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown' }));
      run(2200);
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', code: 'ArrowDown' }));
      const power = $('power').textContent;
      $('fire').click();
      run(4500);

      check('power control reaches the floor', power === '1%', power);
      check('a turn cycle bumps ROUND only', levelText() === 'LEVEL 01' && roundText() !== 'ROUND 01', $('turn').textContent);

      // Play on until a tank is destroyed; that, and only that, advances the level.
      const start = levelText();
      let found = null;
      for (let i = 0; i < 40 && !found; i++) {
        $('deploy').click();
        $('fire').click();
        run(4500);
        if (levelText() !== start) found = { turn: $('turn').textContent, status: $('status').textContent };
      }

      check('a destruction advances LEVEL', !!found, found ? found.turn : 'no destruction in 40 shots');
      check('a new duel resets ROUND', !!found && roundText() === 'ROUND 01', found ? found.turn : '-');
      check('the duel outcome is announced', !!found && /duel|draw/i.test(found.status),
        found ? found.status.slice(0, 70) : '-');

      // ── Hull armour: Tank II / Tank III ───────────────────────────────────────────────────
      // Runs last, because it borrows cash and fires blasts directly. `carve: false` keeps the
      // terrain intact; report is stubbed because blast() pays rewards through it.
      const tierItem = tier => catalog[1][1].find(item => item.armor === tier);
      const hit = (target, weapon) => blast(target.x, target.y - 12, weapon, target, false);
      const stub = () => { report = { earned: 0, hits: 0, shields: 0, armor: 0, near: 0, falls: 0, initialY: 0 }; };

      tanks[0].armor = tanks[0].armorMax = 1;
      tanks[0].cash = 1e6;
      check('Tank III needs Tank II first', purchase(tanks[0], tierItem(3)) === false,
        'armorMax ' + tanks[0].armorMax);
      check('Tank III is stocked as an armour item', !!tierItem(2) && !!tierItem(3),
        catalog[1][1].map(item => item.id).join(','));
      check('Tank II can be bought', purchase(tanks[0], tierItem(2)) === true, 'cash ' + tanks[0].cash);
      check('Tank II grants 2 hull hit points', tanks[0].armor === 2 && tanks[0].armorMax === 2,
        'armor ' + tanks[0].armor + '/' + tanks[0].armorMax);
      check('Tank II recolours the chassis', tanks[0].color === armorColor(2), tanks[0].color);
      check('Tank II cannot be bought twice', purchase(tanks[0], tierItem(2)) === false,
        'armorMax ' + tanks[0].armorMax);
      check('Tank III follows Tank II', purchase(tanks[0], tierItem(3)) === true && tanks[0].armor === 3,
        'armor ' + tanks[0].armor + '/' + tanks[0].armorMax);

      // The hull is taken off one hit point at a time, whatever the shell.
      tanks[0].alive = true;
      tanks[0].hp = 0;
      tanks[0].armor = 3;
      active = 1;
      stub();
      hit(tanks[0], weapons.basic);
      check('one Basic hit strips one hull point', tanks[0].alive && tanks[0].armor === 2,
        'armor ' + tanks[0].armor + ' alive ' + tanks[0].alive);
      hit(tanks[0], weapons.basic);
      hit(tanks[0], weapons.basic);
      check('a Tank III dies on the third hit', !tanks[0].alive, 'armor ' + tanks[0].armor + ' alive ' + tanks[0].alive);
      check('hull hits pay and the kill still pays once', report.armor === 2 && report.hits === 1,
        'armor ' + report.armor + ' hits ' + report.hits);

      // Regression: tier 1 must behave exactly as it did before hull points existed.
      tanks[0].alive = true;
      tanks[0].armor = tanks[0].armorMax = 1;
      tanks[0].hp = 0;
      stub();
      hit(tanks[0], weapons.basic);
      check('a standard tank still dies to one direct hit', !tanks[0].alive, 'alive ' + tanks[0].alive);

      // The CPU's defence shopping must stay on shields.
      const rich = { cash: 1e9, hp: 0, fuel: 100, armor: 1, armorMax: 1 };
      const pick = shieldFor(rich);
      check('the CPU never buys armour', !!pick && !pick.armor && pick.id === 'strong', pick ? pick.id : 'nothing');
      check('CPU armour tiers by level',
        [1, 8, 9, 15, 16].map(l => progression.cpuArmor(l)).join(',') === '1,1,2,2,3',
        [1, 8, 9, 15, 16].map(l => l + ':' + progression.cpuArmor(l)).join(' '));

      // Wiring, not just the formula: a new duel must deploy the tier and repair the hull.
      tanks[0].alive = false;
      tanks[0].armorMax = 3;
      tanks[0].armor = 0;
      level = 8;
      nextLevel('harness');
      check('a new duel deploys the CPU at its tier',
        level === 9 && tanks[1].armorMax === progression.cpuArmor(9) && tanks[1].armorMax === 2,
        'level ' + level + ' armor ' + tanks[1].armorMax);
      check('a new duel repairs the player hull',
        tanks[0].armor === 3 && tanks[0].color === armorColor(3),
        'armor ' + tanks[0].armor + ' colour ' + tanks[0].color);

      reset();
      check('a new battlefield clears the upgrade',
        tanks[0].armorMax === 1 && tanks[0].armor === 1 && tanks[0].color === armorColor(1),
        'armorMax ' + tanks[0].armorMax + ' colour ' + tanks[0].color);

      check('no uncaught errors', errors.length === 0, errors.join(' | ') || 'none');
    } catch (error) {
      errors.push(error.message);
      check('driver ran without throwing', false, error.message);
    }
    out.textContent = 'RESULT:' + JSON.stringify({ checks, errors });
  });
})();

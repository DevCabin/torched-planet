// tools/drive.js — headless smoke test for Torched Planet.
//
// Loaded AFTER game.js by a generated harness (see HANDOFF.md §6). It drives the
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
  const level = () => $('turn').textContent.split(' · ')[0];
  const round = () => $('turn').textContent.split(' · ')[1];
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
      check('a turn cycle bumps ROUND only', level() === 'LEVEL 01' && round() !== 'ROUND 01', $('turn').textContent);

      // Play on until a tank is destroyed; that, and only that, advances the level.
      const start = level();
      let found = null;
      for (let i = 0; i < 40 && !found; i++) {
        $('deploy').click();
        $('fire').click();
        run(4500);
        if (level() !== start) found = { turn: $('turn').textContent, status: $('status').textContent };
      }

      check('a destruction advances LEVEL', !!found, found ? found.turn : 'no destruction in 40 shots');
      check('a new duel resets ROUND', !!found && round() === 'ROUND 01', found ? found.turn : '-');
      check('the duel outcome is announced', !!found && /duel|draw/i.test(found.status),
        found ? found.status.slice(0, 70) : '-');
      check('no uncaught errors', errors.length === 0, errors.join(' | ') || 'none');
    } catch (error) {
      errors.push(error.message);
      check('driver ran without throwing', false, error.message);
    }
    out.textContent = 'RESULT:' + JSON.stringify({ checks, errors });
  });
})();

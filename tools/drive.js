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

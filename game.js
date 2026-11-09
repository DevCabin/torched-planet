'use strict';

const byId = id => document.getElementById(id);
const canvas = byId('battle');
const ctx = canvas.getContext('2d');
const shop = byId('shop');
const weaponSelect = byId('weapon');
const W = canvas.width;
const H = canvas.height;
const BEDROCK = H - 24;
const GRAVITY = 205;
const STEP = 1 / 120;
const weapons = {
  basic: { name: 'Basic shell', radius: 13, damage: 1, color: '#ffdf91' },
  large: { name: 'Large shell', radius: 29, damage: 2, color: '#ffae6f' },
  nuke: { name: 'Nuke', radius: 107, damage: 5, lethalSplash: true, color: '#f5fcab' },
  spread: { name: '5 Spread', radius: 16, damage: 1, color: '#b2efff' },
  napalm: { name: 'Napalm', radius: 24, damage: 2, lethalSplash: true, color: '#ff864f' }
};
const catalog = [
  ['Weapons', [
    { id: 'nuke', name: 'Nuke', price: 160, detail: 'Huge blast · up to 5 shield damage' },
    { id: 'spread', name: '5 Spread', price: 85, detail: 'Five shells in a fan' },
    { id: 'napalm', name: 'Napalm', price: 105, detail: 'Impact lights nearby ground' }
  ]],
  ['Defense', [
    { id: 'weak', name: 'Weak shield', price: 50, hp: 1, detail: '1 HP' },
    { id: 'medium', name: 'Medium shield', price: 115, hp: 3, detail: '3 HP' },
    { id: 'strong', name: 'Strong shield', price: 175, hp: 5, detail: '5 HP' }
  ]],
  ['Utilities', [{ id: 'fuel', name: 'Fuel can', price: 35, detail: '+45 fuel · max 100' }]]
];
// Endless progression: `round` doubles as the level counter and never stops climbing.
const progression = {
  reward: level => 1 + .3 * (level - 1),
  price: level => 1 + .2 * (level - 1),
  aimError: level => Math.max(42, 150 - 18 * level),
  cpuShield: level => Math.min(5, level - 1),
  cpuCash: level => 40 + 45 * (level - 1),
  waveBonus: level => 250 * level
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const radians = angle => angle * Math.PI / 180;
const held = new Map();
const joystick = byId('joystick');
let stickPointer = null;
let stickX = 0;
let stickY = 0;

function clearControls() {
  held.clear();
  fineAim = false;
  powerHold = 0;
  stickPointer = null;
  stickX = stickY = 0;
  joystick.style.setProperty('--stick-x', '0px');
  joystick.style.setProperty('--stick-y', '0px');
}
let terrain, map, round, tanks, active, phase, shells, effects, burns, settling, botDelay, report, status, palette;
let last = 0;
let previousSummary = '';
let accumulator = 0;
let selected = 'basic';
let powerHold = 0;
let fineAim = false;
let lastPower = null;

function makeMap() {
  map = ['Salt Flats', 'Iron Hills', 'Rooftop District'][Math.floor(Math.random() * 3)];
  const offset = Math.random() * 6.28;
  const level = round || 1;
  const swell = 1 + Math.min(.5, (level - 1) * .06);
  const buildings = Array.from({ length: 12 }, () => 235 + Math.random() * (160 + Math.min(70, (level - 1) * 12)));
  palette = {
    'Salt Flats': ['#192c34', '#497079', '#536052', '#b3b691'],
    'Iron Hills': ['#242c3d', '#6a6467', '#525d55', '#a4b693'],
    'Rooftop District': ['#192634', '#475c70', '#3e515a', '#91a7a7']
  }[map];
  terrain = Array.from({ length: W }, (_, x) => {
    if (map === 'Rooftop District') return buildings[Math.floor(x * buildings.length / W)];
    if (map === 'Iron Hills') return 353 + Math.sin(x / 96 + offset) * 64 * swell + Math.sin(x / 43 + offset) * 17 * swell;
    return 365 + Math.sin(x / 175 + offset) * 14 + Math.sin(x / 77) * 4;
  });
}

function ground(x) {
  return terrain[clamp(Math.floor(x), 0, W - 1)];
}

function support(x) {
  let y = BEDROCK;
  for (let dx = -14; dx <= 14; dx++) y = Math.min(y, ground(x + dx));
  return y;
}

function makeTank(x, color, angle) {
  return { x, y: support(x), color, angle, power: 63, fuel: 100, travel: 0, hp: 0, cash: 0, alive: true, vy: 0,
    ammo: { basic: Infinity, large: 3, nuke: 0, spread: 0, napalm: 0 } };
}

function setStatus(message) {
  status = message;
  byId('status').textContent = message;
}

function updateHud() {
  const player = tanks[0];
  const values = { power: [Math.round(player.power) + '%', player.power], angle: [Math.round(player.angle) + '°', player.angle],
    fuel: [Math.round(player.fuel) + '%', player.fuel], shield: [player.hp ? player.hp + ' HP' : 'OFF', player.hp] };
  for (const [id, [label, value]] of Object.entries(values)) {
    byId(id).textContent = label;
    byId(id + '-meter').value = value;
  }
  byId('cash').textContent = '$' + player.cash;
  byId('turn').textContent = 'LEVEL ' + String(round).padStart(2, '0');
  byId('multiplier').textContent = progression.reward(round).toFixed(1) + '× REWARDS';
  byId('power-tick').style.setProperty('--at', (lastPower === null ? 0 : clamp(lastPower, 0, 100)) + '%');
  byId('enemy').textContent = !tanks[1].alive ? 'CPU / DOWN' : 'CPU / ' + (tanks[1].hp ? tanks[1].hp + ' HP' : 'NO SHIELD');
  byId('fire').disabled = phase !== 'aim';
  weaponSelect.disabled = phase !== 'aim';
}

function updateWeapons() {
  weaponSelect.replaceChildren(...Object.entries(weapons).map(([id, weapon]) => {
    const count = tanks[0].ammo[id];
    const option = new Option(weapon.name + ' · ' + (count === Infinity ? '∞' : count), id);
    option.disabled = count === 0;
    return option;
  }));
  if (!tanks[0].ammo[selected]) selected = 'basic';
  weaponSelect.value = selected;
}

const priceOf = item => Math.round(item.price * progression.price(round));

function canBuy(tank, item) {
  return tank.cash >= priceOf(item) && (!item.hp || tank.hp < item.hp) && (item.id !== 'fuel' || tank.fuel < 100);
}

function purchase(tank, item) {
  if (!canBuy(tank, item)) return false;
  tank.cash -= priceOf(item);
  if (item.hp) tank.hp = item.hp;
  else if (item.id === 'fuel') tank.fuel = Math.min(100, tank.fuel + 45);
  else tank.ammo[item.id]++;
  return true;
}

function updateShop() {
  byId('shop-cash').textContent = '$' + tanks[0].cash;
  for (const button of byId('catalog').querySelectorAll('button')) {
    button.disabled = !canBuy(tanks[0], button.item);
    const tag = button.querySelector('b');
    if (tag) tag.textContent = '$' + priceOf(button.item);
  }
}

for (const [category, items] of catalog) {
  const section = document.createElement('section');
  const title = document.createElement('h3');
  title.textContent = category;
  section.append(title);
  for (const item of items) {
    const button = document.createElement('button');
    button.item = item;
    const detail = document.createElement('span');
    const price = document.createElement('b');
    detail.textContent = item.detail;
    price.textContent = '$' + item.price;
    button.append(item.name, detail, price);
    button.onclick = () => {
      if (phase === 'shop' && purchase(tanks[0], item)) {
        byId('shop-note').textContent = item.name + ' equipped or added to inventory.';
        updateShop();
        updateWeapons();
        updateHud();
      }
    };
    section.append(button);
  }
  byId('catalog').append(section);
}

function openShop(message) {
  clearControls();
  active = 0;
  phase = 'shop';
  tanks[0].travel = 0;
  setStatus(message);
  byId('shop-turn').textContent = 'LEVEL ' + String(round).padStart(2, '0') + ' · SUPPLY DEPOT';
  byId('shop-note').textContent = round === 1 ? 'Select supplies or head straight to the field.' : message;
  updateShop();
  updateWeapons();
  updateHud();
  shop.showModal();
}

function deploy() {
  if (phase !== 'shop') return;
  phase = 'aim';
  shop.close();
  setStatus(previousSummary || 'Your shot. Adjust angle and power, or spend fuel to reposition.');
  updateHud();
  byId('fire').focus({ preventScroll: true });
}

function reset() {
  if (shop.open) shop.close();
  round = 1;
  tanks = [makeTank(115, '#d5fa71', 53), makeTank(875, '#ff927a', 127)];
  tanks[1].cash = progression.cpuCash(round);
  tanks[1].hp = progression.cpuShield(round);
  makeMap();
  previousSummary = '';
  lastPower = null;
  shells = [];
  effects = [];
  burns = [];
  settling = 0;
  botDelay = 0;
  selected = 'basic';
  byId('map').textContent = map.toUpperCase();
  openShop('New battlefield. Your tank is on the left.');
}

function drive(tank, direction, dt) {
  const distance = Math.max(0, Math.min(58 * dt, tank.fuel / 1.2, 45 - tank.travel));
  const x = clamp(tank.x + distance * direction, 19, W - 19);
  const floor = support(x);
  const used = Math.abs(x - tank.x);
  if (floor < tank.y - 5 || tanks.some(other => other !== tank && Math.abs(x - other.x) < 38)) return;
  tank.x = x;
  tank.travel += used;
  tank.fuel = Math.max(0, tank.fuel - used * 1.2);
}

function muzzle(tank, angle = tank.angle) {
  return { x: tank.x + Math.cos(radians(angle)) * 32, y: tank.y - 15 - Math.sin(radians(angle)) * 32 };
}

function launch(tank, angle, power, id) {
  const start = muzzle(tank, angle);
  const speed = 85 + power * 4.65;
  return { ...start, vx: Math.cos(radians(angle)) * speed, vy: -Math.sin(radians(angle)) * speed, id, trail: [], ticks: 0 };
}

function fire(id) {
  const tank = tanks[active];
  if ((phase !== 'aim' && phase !== 'bot') || !tank.ammo[id]) return;
  tank.ammo[id]--;
  if (!active) lastPower = tank.power;
  report = { earned: 0, hits: 0, shields: 0, near: 0, falls: 0, initialY: tanks[1 - active].y };
  const offsets = id === 'spread' ? [-10, -5, 0, 5, 10] : [0];
  shells = offsets.map(offset => launch(tank, clamp(tank.angle + offset, 1, 179), tank.power, id));
  phase = 'flight';
  clearControls();
  updateWeapons();
  updateHud();
  setStatus((active ? 'CPU' : 'You') + ' fired ' + weapons[id].name + '.');
}

function collision(x, y, shooter, ticks) {
  for (const tank of tanks) {
    if (!tank.alive || (tank === shooter && ticks < 16)) continue;
    const dx = x - tank.x;
    const dy = y - (tank.y - 12);
    if (tank.hp > 0 && Math.hypot(dx, dy) <= 24) return tank;
    if ((Math.abs(dx) <= 17 && dy >= -7 && dy <= 11) || Math.hypot(dx, dy + 4) <= 9) return tank;
  }
  if (y >= ground(x)) return 'ground';
  return null;
}

function advance(shell, shooter, step) {
  shell.vy += GRAVITY * step;
  shell.x += shell.vx * step;
  shell.y += shell.vy * step;
  shell.ticks++;
  if (shell.x < 0 || shell.x >= W || shell.y > H || shell.ticks > 1400) return 'out';
  return collision(shell.x, shell.y, shooter, shell.ticks);
}

function reward(amount, kind) {
  const scaled = Math.round(amount * progression.reward(round));
  report.earned += scaled;
  report[kind]++;
  tanks[active].cash += scaled;
  updateHud();
}

function blast(x, y, weapon, direct, carve = true) {
  effects.push({ x, y, radius: weapon.radius, color: weapon.color, age: 0 });
  const shooter = tanks[active];
  for (const tank of tanks) {
    if (!tank.alive) continue;
    const centerDistance = Math.hypot(tank.x - x, tank.y - 12 - y);
    const hullDistance = Math.hypot(Math.max(0, Math.abs(tank.x - x) - 16), Math.max(0, Math.abs(tank.y - 10 - y) - 9));
    const shieldContact = tank.hp && centerDistance <= weapon.radius + 24;
    const contact = tank === direct || hullDistance <= weapon.radius || shieldContact;
    if (contact && tank.hp) {
      const damage = tank === direct || hullDistance <= weapon.radius ? weapon.damage : 1;
      tank.hp = Math.max(0, tank.hp - damage);
      if (tank !== shooter) reward(50, 'shields');
    } else if (tank === direct || (contact && weapon.lethalSplash)) {
      tank.alive = false;
      if (tank !== shooter) reward(100, 'hits');
    } else if (tank !== shooter && hullDistance <= weapon.radius + 42) {
      reward(25, 'near');
    }
  }
  if (!carve) return;
  const radius = weapon.radius;
  for (let col = Math.max(0, Math.ceil(x - radius)); col <= Math.min(W - 1, Math.floor(x + radius)); col++) {
    const depth = Math.sqrt(radius ** 2 - (col - x) ** 2);
    if (y - depth <= terrain[col] && y + depth > terrain[col]) terrain[col] = Math.min(BEDROCK, y + depth);
  }
}

function impact(shell, direct) {
  const { x, y, id } = shell;
  blast(x, y, weapons[id], direct);
  if (id === 'napalm') {
    for (const [index, offset] of [-45, -23, 0, 23, 45].entries()) {
      burns.push({ x: clamp(x + offset, 0, W - 1), age: 0, delay: .22 + index * .13, spent: false });
    }
  }
}

function settleTank(tank, dt) {
  const floor = support(tank.x);
  if (tank.y >= floor) {
    tank.y = floor;
    tank.vy = 0;
  } else {
    tank.vy += 620 * dt;
    tank.y = Math.min(floor, tank.y + tank.vy * dt);
  }
}

function finishShot() {
  const opponent = tanks[1 - active];
  if (opponent.alive && opponent.y > report.initialY + 2) reward(35, 'falls');
  const tags = [];
  if (report.hits) tags.push('tank destroyed');
  if (report.shields) tags.push('shield hit ×' + report.shields);
  if (report.near) tags.push('near miss ×' + report.near);
  if (report.falls) tags.push('fall bonus');
  const summary = (active ? 'CPU' : 'You') + (report.earned ? ' earned $' + report.earned + ' (' + tags.join(', ') + ').' : ' earned $0.');
  if (!tanks[0].alive) {
    phase = 'over';
    const outcome = tanks[1].alive ? 'CPU wins.' : 'Draw.';
    setStatus(outcome + ' You reached LEVEL ' + String(round).padStart(2, '0') + ' with $' + tanks[0].cash + ' banked. ' + summary + ' Choose New battlefield to start a new run.');
    updateHud();
    return;
  }
  if (!tanks[1].alive) {
    nextWave(summary);
    return;
  }
  if (active === 0) {
    previousSummary = summary;
    active = 1;
    phase = 'bot';
    botDelay = .8;
    tanks[1].travel = 0;
    setStatus(summary + ' CPU is preparing its shot.');
    updateHud();
  } else {
    round++;
    previousSummary += ' ' + summary;
    openShop(previousSummary.trim());
  }
}

function nextWave(summary) {
  round++;
  const bonus = progression.waveBonus(round);
  tanks[0].cash += bonus;
  tanks[0].fuel = 100;
  tanks[0].travel = 0;
  makeMap();
  tanks[0].x = 115;
  tanks[0].y = support(115);
  tanks[0].vy = 0;
  tanks[1] = makeTank(875, '#ff927a', 127);
  tanks[1].hp = progression.cpuShield(round);
  tanks[1].cash = progression.cpuCash(round);
  shells = [];
  burns = [];
  settling = 0;
  byId('map').textContent = map.toUpperCase();
  previousSummary = summary + ' Level ' + round + ' bonus +$' + bonus + '.';
  openShop('Target destroyed. Level ' + round + ' — bank bonus +$' + bonus + '.');
}

function aimBot() {
  const bot = tanks[1];
  const player = tanks[0];
  const defense = catalog[1][1].slice().reverse().find(item => canBuy(bot, item));
  if (defense) purchase(bot, defense);
  if (bot.fuel < 30) purchase(bot, catalog[2][1][0]);
  if (!bot.ammo.large && !bot.ammo.nuke) {
    const special = catalog[0][1].find(item => canBuy(bot, item));
    if (special) purchase(bot, special);
  }
  const id = ['nuke', 'large', 'napalm', 'spread', 'basic'].find(key => bot.ammo[key]);
  const target = clamp(player.x + (Math.random() - .5) * progression.aimError(round), 18, W - 18);
  let best = { score: Infinity, angle: 130, power: 65 };
  for (let elevation = 25; elevation <= 75; elevation += 5) {
    const angle = player.x < bot.x ? 180 - elevation : elevation;
    for (let power = 32; power <= 100; power += 2) {
      const trial = launch(bot, angle, power, id);
      let hit;
      do { hit = advance(trial, bot, STEP * 2); } while (!hit);
      const score = hit === bot || hit === 'out' ? Infinity :
        Math.hypot(trial.x - target, (trial.y - (ground(target) - 9)) * .65);
      if (score < best.score) best = { score, angle, power };
    }
  }
  bot.angle = best.angle;
  bot.power = best.power;
  fire(id);
}

function update(dt) {
  for (const tank of tanks) if (tank.alive) settleTank(tank, dt);
  effects = effects.filter(effect => (effect.age += dt) < .58);
  if (phase === 'aim') {
    const player = tanks[0];
    const down = (...keys) => keys.some(key => [...held.values()].includes(key));
    const turn = clamp(Number(down('arrowleft', 'a')) - Number(down('arrowright', 'd')) - stickX, -1, 1);
    const power = clamp(Number(down('arrowup', 'w')) - Number(down('arrowdown', 's')) - stickY, -1, 1);
    const move = Number(down('x')) - Number(down('z'));
    powerHold = power ? powerHold + dt : 0;
    if (turn || power || move) {
      player.angle = clamp(player.angle + turn * dt * 53, 1, 179);
      const ramp = .35 + Math.min(1, powerHold / .65) * .65;
      player.power = clamp(player.power + power * dt * 16 * ramp * (fineAim ? .25 : 1), 1, 100);
      if (move) drive(player, move, dt);
      updateHud();
    }
  }
  if (phase === 'bot') {
    botDelay -= dt;
    if (botDelay > 0 && botDelay < .55 && round % 2 === 0) drive(tanks[1], tanks[1].x > W * .73 ? -1 : 1, dt);
    if (botDelay <= 0) aimBot();
  }
  if (phase !== 'flight') return;
  shells = shells.filter(shell => {
    if (shell.ticks % 4 === 0) {
      shell.trail.push([shell.x, shell.y]);
      if (shell.trail.length > 15) shell.trail.shift();
    }
    const hit = advance(shell, tanks[active], dt);
    if (!hit) return true;
    if (hit !== 'out') impact(shell, hit);
    return false;
  });
  for (const burn of burns) {
    burn.age += dt;
    if (!burn.spent && burn.age >= burn.delay) {
      burn.spent = true;
      blast(burn.x, ground(burn.x) - 2, { radius: 15, damage: 1, lethalSplash: true, color: '#ff864f' }, null, false);
    }
  }
  burns = burns.filter(burn => burn.age < burn.delay + .55);
  if (!shells.length && !burns.length && tanks.every(tank => !tank.alive || tank.y >= support(tank.x))) {
    settling += dt;
    if (settling > .5) {
      settling = 0;
      finishShot();
    }
  }
}

function drawBackdrop() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, palette[0]);
  sky.addColorStop(1, palette[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffe5b729';
  ctx.beginPath();
  ctx.arc(745, 135, 67, 0, Math.PI * 2);
  ctx.fill();
  for (let layer = 0; layer < 2; layer++) {
    ctx.fillStyle = layer ? '#17252d65' : '#23343b45';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 5) {
      const hill = 276 + layer * 39 + 26 * Math.sin(x / 71 + layer) + 17 * Math.sin(x / 34 + layer * 3);
      const skyline = 237 + layer * 54 + Math.floor((Math.sin(Math.floor(x / 35) * 14.6 + layer) + 1) * 29);
      ctx.lineTo(x, map === 'Rooftop District' ? skyline : hill);
    }
    ctx.lineTo(W, H);
    ctx.fill();
  }
  ctx.strokeStyle = '#c3d5d418';
  ctx.beginPath();
  for (let x = 25; x < W; x += 50) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = 25; y < H; y += 50) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
}

function drawTerrain() {
  const strata = ctx.createLinearGradient(0, 235, 0, H);
  strata.addColorStop(0, palette[2]);
  strata.addColorStop(1, '#172326');
  ctx.beginPath();
  ctx.moveTo(0, terrain[0]);
  terrain.forEach((height, x) => ctx.lineTo(x, height));
  ctx.lineTo(W, terrain[W - 1]);
  ctx.strokeStyle = palette[3];
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = strata;
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (map === 'Rooftop District') {
    for (let x = 13; x < W; x += 21) {
      for (let y = 250; y < BEDROCK; y += 19) {
        if (y < ground(x) + 10) continue;
        ctx.fillStyle = (x * y % 31 < 13) ? '#ffd48442' : '#0e192a62';
        ctx.fillRect(x, y, 8, 8);
      }
    }
  } else {
    ctx.fillStyle = '#d2cfab23';
    for (let x = 6; x < W; x += 13) {
      for (let y = 250 + x % 19; y < BEDROCK; y += 13) {
        if ((x * y) % 7 < 3) ctx.fillRect(x, y, 4, 1);
      }
    }
  }
  ctx.fillStyle = '#131d20';
  ctx.fillRect(0, BEDROCK, W, H - BEDROCK);
  ctx.restore();
}

function drawTank(tank, index) {
  const { x, y, color, alive, hp } = tank;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alive ? 1 : .55;
  if (alive && hp) {
    ctx.strokeStyle = '#86e5ff';
    ctx.fillStyle = '#86e5ff24';
    ctx.lineWidth = 1 + hp * .3;
    ctx.beginPath();
    ctx.arc(0, -12, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = alive ? color : '#b29482';
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, -15);
  const end = muzzle(tank);
  ctx.lineTo(end.x - x, end.y - y);
  ctx.stroke();
  ctx.fillStyle = '#141e22';
  ctx.beginPath();
  ctx.roundRect(-19, -9, 38, 9, 4);
  ctx.fill();
  ctx.fillStyle = alive ? color : '#a79787';
  ctx.beginPath();
  ctx.roundRect(-16, -15, 32, 9, 2);
  ctx.roundRect(-8, -20, 16, 8, 3);
  ctx.fill();
  for (let wheel = -13; wheel <= 13; wheel += 6) {
    ctx.fillStyle = '#80908a';
    ctx.fillRect(wheel, -5, 3, 2);
  }
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(index === 0 ? 'YOU' : 'CPU', 0, -57);
  if (active === index && alive && (phase === 'aim' || phase === 'bot')) {
    ctx.beginPath();
    ctx.moveTo(-5, -51);
    ctx.lineTo(5, -51);
    ctx.lineTo(0, -44);
    ctx.fill();
  }
  ctx.restore();
}

function draw() {
  drawBackdrop();
  drawTerrain();
  tanks.forEach(drawTank);
  for (const shell of shells) {
    const color = weapons[shell.id].color;
    ctx.fillStyle = color;
    shell.trail.forEach(([x, y], index) => {
      ctx.globalAlpha = (index + 1) / shell.trail.length * .48;
      ctx.fillRect(x, y, 3, 3);
    });
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(shell.x, Math.max(5, shell.y), shell.y < 0 ? 2 : 4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const effect of effects) {
    const progress = effect.age / .58;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius * (.15 + Math.sqrt(progress)), 0, Math.PI * 2);
    ctx.globalAlpha = (1 - progress) * .57;
    ctx.fillStyle = effect.color;
    ctx.fill();
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

const controlKeys = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', 'z', 'x']);
window.addEventListener('keydown', event => {
  if (phase !== 'aim' || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (event.target === weaponSelect) return;
  if (controlKeys.has(key)) {
    event.preventDefault();
    if (!event.repeat) nudge(key);
    held.set(event.code, key);
  } else if (key === ' ' && (!event.target.closest('button') || event.target === byId('fire'))) {
    event.preventDefault();
    if (!event.repeat) fire(selected);
  }
});
window.addEventListener('keyup', event => held.delete(event.code));
window.addEventListener('blur', clearControls);
window.addEventListener('keydown', event => { if (event.key === 'Shift') fineAim = true; });
window.addEventListener('keyup', event => { if (event.key === 'Shift') fineAim = false; });

function nudge(key) {
  const player = tanks[0];
  if (phase !== 'aim' || !player) return;
  if (key === 'arrowup' || key === 'w') player.power = clamp(player.power + 1, 1, 100);
  else if (key === 'arrowdown' || key === 's') player.power = clamp(player.power - 1, 1, 100);
  else return;
  updateHud();
}

function moveStick(event) {
  if (stickPointer !== event.pointerId) return;
  const box = joystick.getBoundingClientRect();
  const dx = event.clientX - box.left - box.width / 2;
  const dy = event.clientY - box.top - box.height / 2;
  const magnitude = Math.hypot(dx, dy);
  const limit = 29;
  const scale = magnitude > limit ? limit / magnitude : 1;
  stickX = Math.abs(dx) > 5 ? dx * scale / limit : 0;
  stickY = Math.abs(dy) > 5 ? dy * scale / limit : 0;
  joystick.style.setProperty('--stick-x', dx * scale + 'px');
  joystick.style.setProperty('--stick-y', dy * scale + 'px');
}

joystick.addEventListener('pointerdown', event => {
  if (phase !== 'aim' || stickPointer !== null) return;
  stickPointer = event.pointerId;
  joystick.setPointerCapture(stickPointer);
  moveStick(event);
});
joystick.addEventListener('pointermove', moveStick);
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  joystick.addEventListener(type, event => {
    if (stickPointer !== event.pointerId) return;
    stickPointer = null;
    stickX = stickY = 0;
    joystick.style.setProperty('--stick-x', '0px');
    joystick.style.setProperty('--stick-y', '0px');
  });
}
for (const button of document.querySelectorAll('[data-hold]')) {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (phase !== 'aim') return;
    button.setPointerCapture(event.pointerId);
    held.set(event.pointerId, button.dataset.hold);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, event => held.delete(event.pointerId));
  }
}
byId('reset').onclick = reset;
byId('deploy').onclick = deploy;
byId('fire').onclick = () => { if (phase === 'aim') fire(selected); };
shop.addEventListener('cancel', event => { event.preventDefault(); deploy(); });
weaponSelect.onchange = () => { selected = weaponSelect.value; };

function frame(now) {
  accumulator += Math.min(.075, (now - (last || now)) / 1000);
  last = now;
  while (accumulator >= STEP) {
    update(STEP);
    accumulator -= STEP;
  }
  draw();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);

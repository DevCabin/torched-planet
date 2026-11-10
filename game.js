'use strict';

const byId = id => document.getElementById(id);
const canvas = byId('battle');
const ctx = canvas.getContext('2d');
const shop = byId('shop');
const weaponSelect = byId('weapon');
// Everything in this file is authored in a fixed 1000 × 520 logical space — every radius, speed and
// position below means that. The canvas itself is 1/PIXEL of that in each direction and CSS scales it
// back up with nearest-neighbour, so the whole render quantises to a visible pixel grid. Raise PIXEL
// for chunkier art; nothing outside this block needs to know.
const PIXEL = 2;
const W = 1000;
const H = 520;
canvas.width = W / PIXEL;
canvas.height = H / PIXEL;
ctx.imageSmoothingEnabled = false;
ctx.setTransform(1 / PIXEL, 0, 0, 1 / PIXEL, 0, 0);
const BEDROCK = H - 24;
const GRAVITY = 205;
const WIND_MAX = 14;      // px/s² — the strongest wind a duel can roll (deliberately mild)
const SHIELD_MAX = 5;     // shield HP ceiling; must match shield-meter max in index.html
const STEP = 1 / 120;
const weapons = {
  basic: { name: 'Basic shell', radius: 13, damage: 1, color: '#ffdf91' },
  large: { name: 'Large shell', radius: 29, damage: 2, color: '#ffae6f' },
  nuke: { name: 'Nuke', radius: 107, damage: 5, lethalSplash: true, color: '#f5fcab' },
  spread: { name: '5 Spread', radius: 16, damage: 1, color: '#b2efff' },
  napalm: { name: 'Napalm', radius: 24, damage: 2, lethalSplash: true, color: '#ff864f', burns: [-45, -23, 0, 23, 45] },
  nukeMini: { name: 'Nuke Mini', radius: 52, damage: 3, lethalSplash: true, color: '#ffe27a' },
  napalmXL: { name: 'Napalm XL', radius: 46, damage: 2, lethalSplash: true, color: '#ff6236', burnStep: .075, burns: [-88, -66, -44, -22, 0, 22, 44, 66, 88] }
};
// Hull armour tiers. `armor` is the number of hits a tank absorbs before it is destroyed, and it
// doubles as the chassis colour so an upgrade is visible on the field. Tier 1 is the standard
// tank: exactly the pre-upgrade rules, which is what keeps blast() honest for both sides.
const armorTiers = [
  { tier: 1, name: 'Tank I', short: 'I', color: '#d5fa71' },
  { tier: 2, name: 'Tank II', short: 'II', color: '#ffd166' },
  { tier: 3, name: 'Tank III', short: 'III', color: '#c79bff' }
];
const armorTier = tier => armorTiers.find(entry => entry.tier === tier) || armorTiers[0];
const armorColor = tier => armorTier(tier).color;
const catalog = [
  ['Weapons', [
    { id: 'nuke', name: 'Nuke', price: 160, detail: 'Huge blast · up to 5 shield damage' },
    { id: 'spread', name: '5 Spread', price: 85, detail: 'Five shells in a fan' },
    { id: 'napalm', name: 'Napalm', price: 105, detail: 'Impact lights nearby ground' },
    { id: 'nukeMini', name: 'Nuke Mini', price: 95, detail: 'Tight blast · up to 3 shield damage' },
    { id: 'napalmXL', name: 'Napalm XL', price: 175, detail: 'Wide fire field · 9 burning pools' }
  ]],
  ['Defense', [
    { id: 'weak', name: 'Weak shield', price: 50, hp: 1, detail: '1 HP' },
    { id: 'medium', name: 'Medium shield', price: 115, hp: 3, detail: '3 HP' },
    { id: 'strong', name: 'Strong shield', price: 175, hp: 5, detail: '5 HP' },
    // Armour sits last so aimBot()'s reversed shield search still finds Strong first once it
    // filters these out. They are a ladder: Tank III requires Tank II.
    { id: 'tank2', name: 'Tank II', price: 2000, armor: 2, detail: '2 hull hits · amber chassis' },
    { id: 'tank3', name: 'Tank III', price: 5000, armor: 3, detail: '3 hull hits · violet chassis' }
  ]],
  ['Utilities', [
    { id: 'fuel', name: 'Fuel can', price: 35, detail: '+45 fuel · max 100' },
    // Ammunition belongs here too, and it must be appended: aimBot() refuels by position
    // (`catalog[2][1][0]`), so a shell at index 0 would silently stop the CPU refuelling.
    { id: 'large', name: 'Large shells', price: 35, detail: '+1 shell · 2 damage' }
  ]]
];
// Endless progression: `level` counts duels (advances when a tank is destroyed),
// `round` counts turn cycles within the current duel. All scaling uses `level`.
const progression = {
  reward: level => 1 + .3 * (level - 1),
  price: level => 1 + .2 * (level - 1),
  // Marksmanship: 0 at level 1 (sloppy) → 1 from level 11 onward (lethal).
  skill: level => Math.min(1, (level - 1) / 10),
  flub: level => .5 * (1 - progression.skill(level)),
  spread: level => 210 - 180 * progression.skill(level),
  cpuShield: level => Math.min(5, level - 1),
  // CPU hull tiers trail the player's purchase arc on purpose (Tank II lands around level 5–7,
  // Tank III around 10–12), so a bought upgrade stays an edge rather than being cancelled.
  cpuArmor: level => level >= 16 ? 3 : level >= 9 ? 2 : 1,
  cpuCash: level => 40 + 45 * (level - 1),
  waveBonus: level => 250 * level,   // duel bonus, paid only when you win
  salvage: level => 60 * level       // consolation when you lose the duel
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const radians = angle => angle * Math.PI / 180;
const held = new Map();

function clearControls() {
  held.clear();
  fineAim = false;
  powerHold = 0;
}
let terrain, map, round, level, wind, tanks, active, phase, shells, effects, burns, settling, botDelay, report, status, palette, stars, celestial;
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
  const levelNow = level || 1;
  const swell = 1 + Math.min(.5, (levelNow - 1) * .06);
  const buildings = Array.from({ length: 12 }, () => 235 + Math.random() * (160 + Math.min(70, (levelNow - 1) * 12)));
  // Space palettes: three hard sky bands (a smooth gradient bands anyway at a 2 px raster, so these
  // are chosen deliberately), plus the colours each map's celestial bodies are drawn from.
  palette = {
    'Salt Flats': {
      sky: ['#080d18', '#101a2e', '#1b2a45'], star: '#dfe9ff',
      ridge: ['#16223a', '#1f2f4c'], ground: ['#4d5a63', '#2b3540'], edge: '#c8cdb2',
      body: { face: '#cfd8e8', shade: '#7c8aa6', crater: '#5b6880', ring: '#8fa1c4' }
    },
    'Iron Hills': {
      sky: ['#0d0a14', '#1a1220', '#2b1a26'], star: '#ffe9d6',
      ridge: ['#241826', '#33202c'], ground: ['#5c4840', '#312825'], edge: '#c9a98b',
      body: { face: '#d8b48c', shade: '#8a6a4e', crater: '#6b4f3a', ring: '#b08a63' }
    },
    'Rooftop District': {
      sky: ['#07101a', '#0e1d2c', '#182c3e'], star: '#d8f0ff',
      ridge: ['#132433', '#1d3345'], ground: ['#45535f', '#28323b'], edge: '#9fb2bb',
      body: { face: '#a8d8e8', shade: '#5f8fa6', crater: '#456f86', ring: '#7fb4c9' }
    }
  }[map];
  // Sky furniture is rolled once per battlefield and never again, so stars cannot shimmer between
  // frames while you are lining up a shot.
  stars = Array.from({ length: 96 }, () => ({
    x: Math.floor(Math.random() * W),
    y: Math.floor(Math.random() * 330),
    size: Math.random() < .84 ? PIXEL : PIXEL * 2,
    bright: .30 + Math.random() * .70
  }));
  celestial = makeCelestial();
  terrain = Array.from({ length: W }, (_, x) => {
    if (map === 'Rooftop District') return buildings[Math.floor(x * buildings.length / W)];
    if (map === 'Iron Hills') return 353 + Math.sin(x / 96 + offset) * 64 * swell + Math.sin(x / 43 + offset) * 17 * swell;
    return 365 + Math.sin(x / 175 + offset) * 14 + Math.sin(x / 77) * 4;
  });
}

// At least one body per battlefield, sometimes two. Slots stay clear of the enemy gauge on the right
// edge and of the tank labels, and the second body is pushed sideways so the pair never overlap.
function makeCelestial() {
  const bodies = [];
  const main = { x: 190 + Math.random() * 520, y: 62 + Math.random() * 74, r: 60 + Math.random() * 34 };
  main.y = Math.max(main.y, main.r + 14);   // keep the whole disc in frame rather than cropping its top
  main.ring = Math.random() < .45;
  main.craters = cratersFor(main);
  bodies.push(main);
  if (Math.random() < .5) {
    const moon = {
      x: clamp(main.x + (Math.random() < .5 ? -1 : 1) * (170 + Math.random() * 150), 60, W - 170),
      y: 38 + Math.random() * 74, r: 18 + Math.random() * 16, ring: false
    };
    moon.craters = cratersFor(moon);
    bodies.push(moon);
  }
  return bodies;
}

// Craters are stored in logical coordinates, then clipped to the disc when drawn. Angles are spread
// evenly with jitter rather than fully random, which otherwise lands two or three on top of each
// other and reads as one blob.
function cratersFor(body) {
  const count = 2 + Math.floor(Math.random() * 4);
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + (Math.random() - .5) * .8;
    const distance = body.r * (.25 + Math.random() * .5);
    return {
      x: body.x + Math.cos(angle) * distance,
      y: body.y + Math.sin(angle) * distance,
      r: body.r * (.08 + Math.random() * .12)
    };
  });
}

// Wind is rolled once per duel: reset() and nextLevel() call makeMap(), then this.
// advance() applies it every step, so it bends the shot without dominating the aim.
function rollWind() {
  wind = Math.round((Math.random() * 2 - 1) * WIND_MAX);
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
    armor: 1, armorMax: 1,
    ammo: { basic: Infinity, large: 3, nuke: 0, spread: 0, napalm: 0, nukeMini: 0, napalmXL: 0 } };
}

function setStatus(message) {
  status = message;
  byId('status').textContent = message;
}

function updateHud() {
  const player = tanks[0];
  // The tier suffix appears only once the hull is upgraded, so the standard bench is untouched.
  const tier = armorTier(player.armorMax);
  const hull = tier.tier > 1 ? ' · ' + tier.short : '';
  const values = { power: [Math.round(player.power) + '%', player.power], angle: [Math.round(player.angle) + '°', player.angle],
    fuel: [Math.round(player.fuel) + '%', player.fuel], shield: [(player.hp ? player.hp + ' HP' : 'OFF') + hull, player.hp] };
  for (const [id, [label, value]] of Object.entries(values)) {
    byId(id).textContent = label;
    byId(id + '-meter').value = value;
  }
  byId('cash').textContent = '$' + player.cash;
  byId('turn').textContent = 'LEVEL ' + String(level).padStart(2, '0') + ' · ROUND ' + String(round).padStart(2, '0');
  byId('multiplier').textContent = progression.reward(level).toFixed(1) + '× REWARDS';
  byId('power-tick').style.setProperty('--at', (lastPower === null ? 0 : clamp(lastPower, 0, 100)) + '%');
  // The battlefield power gauge mirrors the HUD: fill is the live power, the red mark is the power
  // of your last shot, so you can dial back to it without reading the number.
  byId('power-gauge').textContent = String(Math.round(player.power));
  byId('power-fill').style.setProperty('--level', clamp(player.power, 0, 100) + '%');
  byId('power-mark').style.setProperty('--at', (lastPower === null ? 0 : clamp(lastPower, 0, 100)) + '%');
  // An empty shield is no longer the end of a tank's defence once hull points exist, so the
  // enemy readout names them explicitly rather than implying "empty bar = one hit kills".
  byId('enemy').textContent = !tanks[1].alive ? 'CPU / DOWN'
    : 'CPU / ' + (tanks[1].hp ? tanks[1].hp + ' HP' : 'NO SHIELD') + (tanks[1].armorMax > 1 ? ' · HULL ' + tanks[1].armor : '');
  byId('wind').textContent = wind ? 'WIND ' + (wind > 0 ? '▶ ' : '◀ ') + Math.abs(wind) : 'WIND · CALM';
  const enemy = tanks[1];
  const shield = enemy.alive ? clamp(enemy.hp, 0, SHIELD_MAX) : 0;
  const threat = enemy.alive ? weapons[selected].damage : 0;
  const strip = Math.min(threat, shield);
  byId('gauge-hp').textContent = String(shield);
  byId('gauge-hit').textContent = enemy.alive ? '-' + threat : '—';
  byId('gauge-fill').style.setProperty('--level', shield / SHIELD_MAX * 100 + '%');
  byId('gauge-threat').style.setProperty('--from', (shield - strip) / SHIELD_MAX * 100 + '%');
  byId('gauge-threat').style.setProperty('--size', strip / SHIELD_MAX * 100 + '%');
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

const priceOf = item => Math.round(item.price * progression.price(level));

function canBuy(tank, item) {
  return tank.cash >= priceOf(item)
    && (!item.hp || tank.hp < item.hp)
    && (!item.armor || tank.armorMax === item.armor - 1)   // armour is a ladder: one rung at a time
    && (item.id !== 'fuel' || tank.fuel < 100);
}

function purchase(tank, item) {
  if (!canBuy(tank, item)) return false;
  tank.cash -= priceOf(item);
  if (item.hp) tank.hp = item.hp;
  else if (item.armor) {
    // Hull tier: `armor` is the damage it can take, `armorMax` what was bought. nextLevel()
    // refills the first from the second, so the upgrade survives every duel in the run.
    tank.armorMax = item.armor;
    tank.armor = item.armor;
    tank.color = armorColor(item.armor);
  } else if (item.id === 'fuel') tank.fuel = Math.min(100, tank.fuel + 45);
  else tank.ammo[item.id]++;
  return true;
}

// The CPU's defence shopping is shields only. Armour tiers are earned from `progression.cpuArmor`
// instead — buying them would burn its wallet on a tier that makeTank() wipes next duel.
const shieldFor = tank => catalog[1][1].slice().reverse().find(item => !item.armor && canBuy(tank, item));

// Ammunition can be stocked in Weapons or Utilities, so the CPU's resupply scans both and keeps
// only real shells (fuel and shields have no `weapons` entry). Weapons come first, which leaves the
// cheap Large resupply last — exactly the ordering aimBot() was tuned against.
const ammoFor = tank => [...catalog[0][1], ...catalog[2][1]]
  .filter(item => weapons[item.id])
  .find(item => canBuy(tank, item));

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
    // Armour tiers get a colour chip, so the shop teaches the chassis colour before you buy it.
    if (item.armor) {
      const swatch = document.createElement('i');
      swatch.style.setProperty('--swatch', armorColor(item.armor));
      button.append(swatch);
    }
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
  byId('shop-turn').textContent = 'LEVEL ' + String(level).padStart(2, '0') + ' · SUPPLY DEPOT';
  byId('shop-note').textContent = level === 1 && round === 1 ? 'Select supplies or head straight to the field.' : message;
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
  level = 1;
  makeMap();
  rollWind();
  tanks = [makeTank(115, armorColor(1), 53), makeTank(875, '#ff927a', 127)];
  tanks[1].cash = progression.cpuCash(level);
  tanks[1].hp = progression.cpuShield(level);
  tanks[1].armor = tanks[1].armorMax = progression.cpuArmor(level);
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
  report = { earned: 0, hits: 0, shields: 0, armor: 0, near: 0, falls: 0, initialY: tanks[1 - active].y };
  const offsets = id === 'spread' ? [-10, -5, 0, 5, 10] : [0];
  shells = offsets.map(offset => launch(tank, clamp(tank.angle + offset, 1, 179), tank.power, id));
  phase = 'flight';
  clearControls();
  updateWeapons();
  updateHud();
  setStatus((active ? 'CPU' : 'You') + ' fired ' + weapons[id].name + '.');
}

function collision(x, y, shooter) {
  for (const tank of tanks) {
    if (!tank.alive || tank === shooter) continue;
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
  shell.vx += wind * step;
  shell.x += shell.vx * step;
  shell.y += shell.vy * step;
  shell.ticks++;
  if (shell.x < 0 || shell.x >= W || shell.y > H || shell.ticks > 1400) return 'out';
  return collision(shell.x, shell.y, shooter);
}

function reward(amount, kind) {
  const scaled = Math.round(amount * progression.reward(level));
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
      // Hull takes one hit point per hit, whatever the shell: a shield already absorbed the
      // damage on its own branch above. A standard tank has 1, so this still kills outright.
      tank.armor = Math.max(0, tank.armor - 1);
      if (!tank.armor) {
        tank.alive = false;
        if (tank !== shooter) reward(100, 'hits');
      } else if (tank !== shooter) reward(40, 'armor');
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
  const weapon = weapons[id];
  blast(x, y, weapon, direct);
  if (!weapon.burns) return;
  const step = weapon.burnStep || .13;
  weapon.burns.forEach((offset, index) => {
    burns.push({ x: clamp(x + offset, 0, W - 1), age: 0, delay: .22 + index * step, spent: false });
  });
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
  if (report.armor) tags.push('hull hit ×' + report.armor);
  if (report.near) tags.push('near miss ×' + report.near);
  if (report.falls) tags.push('fall bonus');
  const summary = (active ? 'CPU' : 'You') + (report.earned ? ' earned $' + report.earned + ' (' + tags.join(', ') + ').' : ' earned $0.');
  if (!tanks[0].alive || !tanks[1].alive) {
    nextLevel(summary);
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

function nextLevel(summary) {
  const won = tanks[0].alive && !tanks[1].alive;
  const outcome = won ? 'You win the duel!' : tanks[0].alive ? 'Draw.' : tanks[1].alive ? 'CPU wins the duel.' : 'Draw.';
  round = 1;
  level++;
  const bonus = won ? progression.waveBonus(level) : progression.salvage(level);
  const payout = won ? 'Duel bonus' : 'Salvage';
  tanks[0].cash += bonus;
  tanks[0].alive = true;
  tanks[0].hp = 0;
  tanks[0].armor = tanks[0].armorMax;                 // the hull is repaired along with the tank
  tanks[0].color = armorColor(tanks[0].armorMax);
  tanks[0].fuel = 100;
  tanks[0].travel = 0;
  tanks[0].vy = 0;
  makeMap();
  rollWind();
  tanks[0].x = 115;
  tanks[0].y = support(115);
  tanks[1] = makeTank(875, '#ff927a', 127);
  tanks[1].hp = progression.cpuShield(level);
  tanks[1].armor = tanks[1].armorMax = progression.cpuArmor(level);
  tanks[1].cash = progression.cpuCash(level);
  shells = [];
  burns = [];
  settling = 0;
  byId('map').textContent = map.toUpperCase();
  previousSummary = outcome + ' ' + summary + (bonus ? ' Level ' + level + ' ' + payout.toLowerCase() + ' +$' + bonus + '.' : '');
  openShop('LEVEL ' + level + ' — ' + outcome + (bonus ? ' ' + payout + ' +$' + bonus + '.' : ''));
}

function aimTarget(player) {
  const offset = Math.random() < progression.flub(level)
    ? (150 + Math.random() * 140) * (Math.random() < .5 ? -1 : 1)
    : (Math.random() - .5) * progression.spread(level);
  return clamp(player.x + offset, 24, W - 24);
}

function aimBot() {
  const bot = tanks[1];
  const player = tanks[0];
  const defense = shieldFor(bot);
  if (defense) purchase(bot, defense);
  if (bot.fuel < 30) purchase(bot, catalog[2][1][0]);
  if (!bot.ammo.large && !bot.ammo.nuke) {
    const special = ammoFor(bot);
    if (special) purchase(bot, special);
  }
  const id = level < 3 ? 'basic' : ['nuke', 'large', 'napalm', 'nukeMini', 'napalmXL', 'spread', 'basic'].find(key => bot.ammo[key]);
  const target = aimTarget(player);
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
    // Touch buttons write the same logical keys into `held`, so this one expression serves both.
    const turn = clamp(Number(down('arrowleft', 'a')) - Number(down('arrowright', 'd')), -1, 1);
    const power = clamp(Number(down('arrowup', 'w')) - Number(down('arrowdown', 's')), -1, 1);
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
  // Three hard bands instead of a vertical gradient. At a 2 px raster a gradient steps anyway; this
  // way the steps are chosen rather than accidental.
  const band = Math.ceil(H / palette.sky.length);
  palette.sky.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, index * band, W, index === palette.sky.length - 1 ? H - index * band : band);
  });
  for (const star of stars) {
    ctx.globalAlpha = star.bright;
    ctx.fillStyle = palette.star;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
  ctx.globalAlpha = 1;
  for (const body of celestial) drawBody(body);
  for (let layer = 0; layer < 2; layer++) {
    ctx.fillStyle = palette.ridge[layer];
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 5) {
      // Kept low and shallow: these are the planet's distant ridges, and the sky is the point now.
      const hill = 306 + layer * 34 + 22 * Math.sin(x / 71 + layer) + 14 * Math.sin(x / 34 + layer * 3);
      const skyline = 262 + layer * 46 + Math.floor((Math.sin(Math.floor(x / 35) * 14.6 + layer) + 1) * 27);
      ctx.lineTo(x, map === 'Rooftop District' ? skyline : hill);
    }
    ctx.lineTo(W, H);
    ctx.fill();
  }
}

// A body is a shaded disc, an offset lit disc on top of it (which leaves a crescent), and craters
// clipped to the limb. The arcs quantise into blocky rings for free at this raster.
function drawBody(body) {
  const tone = palette.body;
  if (body.ring) {
    ctx.strokeStyle = tone.ring;
    ctx.lineWidth = PIXEL * 2;
    ctx.beginPath();
    ctx.ellipse(body.x, body.y, body.r * 1.6, body.r * .32, -.3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = tone.shade;
  ctx.beginPath();
  ctx.arc(body.x, body.y, body.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tone.face;
  ctx.beginPath();
  ctx.arc(body.x - body.r * .17, body.y - body.r * .17, body.r * .92, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(body.x, body.y, body.r * .97, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = tone.crater;
  for (const crater of body.craters) {
    ctx.beginPath();
    ctx.arc(crater.x, crater.y, crater.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawTerrain() {
  // One polyline, used three times: closed for the body fill, clipped for the topsoil band, and
  // stroked again for the rim. Stroking rather than layering rectangles keeps the strata following
  // the contour instead of cutting a hard horizontal line through it.
  const surface = () => {
    ctx.beginPath();
    ctx.moveTo(0, terrain[0]);
    for (let x = 1; x < W; x++) ctx.lineTo(x, terrain[x]);
  };
  ctx.beginPath();
  ctx.moveTo(0, terrain[0]);
  for (let x = 1; x < W; x++) ctx.lineTo(x, terrain[x]);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = palette.ground[1];
  ctx.fill();
  ctx.save();
  ctx.clip();
  surface();
  ctx.strokeStyle = palette.ground[0];
  ctx.lineWidth = 34;
  ctx.lineJoin = 'bevel';
  ctx.stroke();
  if (map === 'Rooftop District') {
    for (let x = 13; x < W; x += 21) {
      for (let y = 250; y < BEDROCK; y += 19) {
        if (y < ground(x) + 10) continue;
        ctx.fillStyle = (x * y % 31 < 13) ? '#ffd48442' : '#0e192a62';
        ctx.fillRect(x, y, 8, 8);
      }
    }
  } else {
    ctx.fillStyle = '#d2cfab3d';
    for (let x = 6; x < W; x += 13) {
      for (let y = 250 + x % 19; y < BEDROCK; y += 13) {
        // 8 × 2: at PIXEL = 2 that is a 4 × 1 block, the smallest mark that survives the raster.
        if ((x * y) % 7 < 3) ctx.fillRect(x, y, 8, 2);
      }
    }
  }
  ctx.fillStyle = '#0b1116';
  ctx.fillRect(0, BEDROCK, W, H - BEDROCK);
  ctx.restore();
  surface();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = PIXEL * 2;
  ctx.lineJoin = 'bevel';
  ctx.stroke();
}

function drawTank(tank, index) {
  const { x, y, color, alive, hp } = tank;
  ctx.save();
  // Snap to the art-pixel grid: a tank mid-drive then steps between pixel columns instead of
  // shimmering inside one.
  ctx.translate(Math.round(x / PIXEL) * PIXEL, Math.round(y / PIXEL) * PIXEL);
  ctx.globalAlpha = alive ? 1 : .55;
  if (alive && hp) {
    // Shield: a chunky force-field box. A 2.5 px ring thinned to a ragged 1.25 px line at this
    // raster, and a box reads better in the same visual language as the rest of the art.
    ctx.strokeStyle = '#86e5ff';
    ctx.lineWidth = PIXEL * 2;
    ctx.strokeRect(-30, -42, 60, 50);
    ctx.fillStyle = '#86e5ff';
    for (const [cornerX, cornerY] of [[-30, -42], [24, -42], [-30, 2], [24, 2]]) {
      ctx.fillRect(cornerX, cornerY, PIXEL * 3, PIXEL * 3);
    }
  }
  ctx.strokeStyle = alive ? color : '#b29482';
  ctx.lineCap = 'square';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, -14);
  const end = muzzle(tank);
  ctx.lineTo(end.x - x, end.y - y);
  ctx.stroke();
  ctx.fillStyle = '#141e22';
  ctx.fillRect(-20, -10, 40, 10);
  ctx.fillStyle = '#80908a';
  for (let wheel = -14; wheel <= 14; wheel += 7) ctx.fillRect(wheel, -6, 4, 2);
  ctx.fillStyle = alive ? color : '#a79787';
  ctx.fillRect(-16, -17, 32, 8);
  ctx.fillRect(-8, -22, 16, 6);
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(index === 0 ? 'YOU' : 'CPU', 0, -58);
  // Hull pips: one per tier, filled while the hull holds. Drawn only above tier 1, so a standard
  // tank looks exactly as it always has, and the CPU's tiers are visible without the gauge.
  // y = -84 clears the 16px label, whose top edge sits at about -70.
  if (tank.armorMax > 1) {
    for (let pip = 0; pip < tank.armorMax; pip++) {
      ctx.fillStyle = pip < tank.armor ? color : '#9fb3b8';
      ctx.fillRect(-(tank.armorMax * 10 - 2) / 2 + pip * 10, -84, 8, 6);
    }
  }
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
      ctx.fillRect(x, y, PIXEL * 2, PIXEL * 2);
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
    ctx.lineWidth = PIXEL * 2;
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
  else if (key === 'arrowleft' || key === 'a') player.angle = clamp(player.angle + 1, 1, 179);
  else if (key === 'arrowright' || key === 'd') player.angle = clamp(player.angle - 1, 1, 179);
  else return;
  updateHud();
}

// Touch controls are plain buttons: they write the same logical keys into `held` that the keyboard
// does, so update() samples them identically. A tap steps exactly 1 % or 1° via nudge() and a hold
// ramps or sweeps — the joystick this replaced could do neither exactly.
for (const button of document.querySelectorAll('[data-hold]')) {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (phase !== 'aim') return;
    try { button.setPointerCapture(event.pointerId); } catch { /* pointer already released */ }
    nudge(button.dataset.hold);
    held.set(event.pointerId, button.dataset.hold);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, event => held.delete(event.pointerId));
  }
}
// Fullscreen. Two buttons, one handler: the header is hidden by the landscape immersive layout, and
// that is exactly the layout where a phone most wants the browser chrome gone.
const fullscreenButtons = [byId('fullscreen'), byId('fullscreen-rail')].filter(Boolean);
const canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

function syncFullscreen() {
  const active = !!document.fullscreenElement;
  for (const button of fullscreenButtons) {
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
  }
}

function toggleFullscreen() {
  if (!canFullscreen) return;
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
    return;
  }
  const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
  // Swallow rejections and synchronous throws: a missing user gesture or an unsupported context must
  // never reach the frame loop.
  if (!request) return;
  try { Promise.resolve(request.call(document.documentElement)).catch(() => {}); } catch { /* ignored */ }
}

if (canFullscreen) {
  for (const button of fullscreenButtons) button.onclick = toggleFullscreen;
  document.addEventListener('fullscreenchange', syncFullscreen);
  syncFullscreen();
} else {
  // No Fullscreen API (iOS Safari, for instance): drop the control rather than show a dead button.
  for (const button of fullscreenButtons) button.remove();
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

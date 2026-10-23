/* ═══════════════════════════════════════════════════════════
   HF.Data — the numbers constitution. Every tunable lives here.
   All content is original design; units are metres / seconds.
   Depth values are metres BELOW the surface (entity y = -depth).
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Palette');
  var P = HF.Palette;

  var D = HF.Data = {};

  /* ── world ────────────────────────────────────────────── */
  D.WORLD = {
    X0: 0, X1: 3000,
    WATER_Y: 0,
    AIR_CEIL: 70,                  // hard ceiling above water
    ZONES: [
      { x0: 0, x1: 900, floorMin: 45, floorMax: 75 },
      { x0: 900, x1: 2100, floorMin: 120, floorMax: 240 },
      { x0: 2100, x1: 3000, floorMin: 300, floorMax: 460 }
    ],
    GRAVITY_AIR: 5.5,              // half-ish gravity → hang-time on jumps
    PRESSURE_DPS: 4                // hp/s beyond a shark's depth limit
  };

  /* ── economy / run rules ─────────────────────────────── */
  D.RULES = {
    SCORE_TO_COINS: 60,            // coins = floor(score/60) at run end
    COIN_DROP_CHANCE: 0.10, COIN_DROP_MIN: 1, COIN_DROP_MAX: 3,
    COMBO_WINDOWS: [5.0, 4.0, 3.0],       // <10, 10-24, >=25 hits
    COMBO_MULT: [[70, 5], [40, 4], [20, 3], [10, 2], [5, 1.5], [0, 1]], // [minCombo, mult]
    COMBO_BREAK_DMG: 8,            // single hit >= this breaks combo
    GR_CHARGE_MAX: 1000,
    GR_CHARGE_RATE: 0.6,           // charge += points * rate (frozen during GR)
    GR_DURATION: 12,
    GR_SCORE_MULT: 2,
    GR_COIN_MULT: 3,
    GR_SPEED_BONUS: 1.4,
    GR_TIER_BONUS: 2,
    AIR_SCORE_MULT: 2,             // eating while airborne
    BOOST_DRAIN: 30, BOOST_REGEN: 20, BOOST_REGEN_DELAY: 0.6,
    BITE_STAMINA_REFUND: 15, BITE_REFUND_COOLDOWN: 0.4,
    IFRAMES: 0.8,
    XP_LEVEL_BASE: 80, XP_LEVEL_GROWTH: 1.5, MAX_LEVEL: 10,
    LVL_SIZE: 0.045,               // +4.5%/level (additive)
    LVL_SPEED: 0.015, LVL_HP: 0.03,
    LVL_HEAL_FRAC: 0.15,           // heal on level-up
    BITE_RADIUS_LVL: 0.0225,       // judge ruling: bite radius grows at HALF size rate…
    BITE_RADIUS_CAP: 1.20,         // …capped at +20%
    MAGNET_RANGE: 3.6,             // fixed world metres (does NOT scale)
    MAGNET_PULL: 26,
    MOUTH_CONE_COS: Math.cos(Math.PI / 4), // ±45° facing filter
    PET_KILL_PERIOD: 2.5,
    HITSTOP_BASE: 0.03, HITSTOP_PER_TIER: 0.014, HITSTOP_MAX: 0.14,
    HITSTOP_RAPID_FACTOR: 0.5,     // when eating faster than 0.4s apart
    HUNGER_WARN: 0.30, HUNGER_CRIT: 0.15
  };

  /* ── sharks (7) ───────────────────────────────────────── */
  /* eff bite tier = tier +1 @L4, +2 @L8 (cap 7) */
  D.SHARKS = [
    { id: 'pup', name: 'Reef Pup', cost: 0, tier: 1, hp: 100, drain: 1.0, speed: 6.0, boost: 1.60, stamina: 100, len: 1.2, depthLimit: 80,
      colors: { dorsal: 0x5C7A99, belly: 0xE8EEF2, fin: 0x46617D, accent: 0x1A2B3C }, head: 'round',
      desc: 'Small, quick to smile, quicker to bite. Every legend starts somewhere.' },
    { id: 'swift', name: 'Swiftfang', cost: 1800, tier: 2, hp: 140, drain: 1.3, speed: 7.2, boost: 1.75, stamina: 110, len: 2.2, depthLimit: 150,
      colors: { dorsal: 0x3D6B8E, belly: 0xEFF6F9, fin: 0x2E5570, accent: 0x9BF6FF }, head: 'sharp',
      desc: 'Built like a torpedo with opinions. Fastest jaws in the shallows.' },
    { id: 'anvil', name: 'Anvilhead', cost: 5000, tier: 3, hp: 190, drain: 1.6, speed: 6.8, boost: 1.70, stamina: 120, len: 3.4, depthLimit: 250,
      colors: { dorsal: 0x7A8B6F, belly: 0xD9E0C8, fin: 0x5E6E54, accent: 0xF9F871 }, head: 'hammer',
      desc: 'Trades a little speed for a lot of skull. Sees around corners, eats around them too.' },
    { id: 'dusk', name: 'Duskstripe', cost: 13000, tier: 4, hp: 260, drain: 2.0, speed: 7.4, boost: 1.80, stamina: 130, len: 4.8, depthLimit: 420,
      colors: { dorsal: 0x4A4E69, belly: 0xC9CED6, fin: 0x3A3E55, accent: 0xFF9F1C }, head: 'round',
      desc: 'Striped like twilight, patient like the tide. Divers tell stories about her.' },
    { id: 'pale', name: 'Pale Sovereign', cost: 32000, tier: 5, hp: 350, drain: 2.4, speed: 7.8, boost: 1.85, stamina: 145, len: 6.5, depthLimit: 420,
      colors: { dorsal: 0x465B70, belly: 0xF2F5F7, fin: 0x37485A, accent: 0xFF5D5D }, head: 'sharp',
      desc: 'The open blue has a monarch. Long may she reign, briefly may you swim.' },
    { id: 'rift', name: 'Riftjaw', cost: 42000, tier: 6, hp: 470, drain: 2.8, speed: 8.2, boost: 1.90, stamina: 160, len: 9.0, depthLimit: Infinity,
      colors: { dorsal: 0x1A1A2E, belly: 0x3A3A5C, fin: 0x12121F, accent: 0x4CC9F0 }, head: 'sharp',
      desc: 'Something the abyss dreamed up and forgot to wake from. Glows on purpose.' },
    { id: 'mega', name: 'Megalith', cost: 80000, tier: 7, hp: 640, drain: 3.2, speed: 8.6, boost: 2.00, stamina: 180, len: 13.0, depthLimit: Infinity,
      colors: { dorsal: 0x2F3B45, belly: 0xB8C4CC, fin: 0x222B33, accent: 0xFFC93C }, head: 'blunt',
      desc: 'A rumour with teeth. Whales file complaints. The ocean files them under M.' }
  ];
  D.MEGA_DISCOUNT = 0.75;          // after all three bosses are slain

  /* ── creatures (28) ───────────────────────────────────── */
  /* proto: school | wander | flee | chase | hazard | surface
     mods : bottom(sticks to floor) ambush bird boat inflate pack
     zones: indexes into WORLD.ZONES; depth: [min,max] metres below surface
     dmg  : touch/bite damage to the player (when hostile / hazardous) */
  D.CREATURES = [
    { id: 'sardine', name: 'Silver Sliver', tier: 1, pts: 10, xp: 2, heal: 2, proto: 'school', school: [8, 14], speed: 3.0, len: 0.25, r: 0.14, zones: [0, 1], depth: [2, 40], kind: 'fish', colors: P.fish.sardine, cap: 60 },
    { id: 'parrot', name: 'Reef Parrot', tier: 1, pts: 12, xp: 2, heal: 3, proto: 'wander', speed: 2.0, len: 0.35, r: 0.18, zones: [0], depth: [2, 30], kind: 'fish', colors: P.fish.parrot, cap: 16 },
    { id: 'crab', name: 'Ember Crab', tier: 2, pts: 15, xp: 3, heal: 3, proto: 'wander', mods: ['bottom'], speed: 0.7, len: 0.35, r: 0.2, zones: [0], depth: [0, 999], kind: 'crab', colors: P.critters.crab, cap: 10 },
    { id: 'gull', name: 'White Gull', tier: 1, pts: 20, xp: 4, heal: 3, proto: 'surface', mods: ['bird'], speed: 4.0, len: 0.4, r: 0.22, zones: [0, 1], depth: [0, 0], kind: 'gull', colors: P.critters.gull, cap: 6 },
    { id: 'cuda', name: 'Striped Cuda', tier: 2, pts: 30, xp: 6, heal: 5, proto: 'flee', speed: 3.8, len: 0.9, r: 0.24, zones: [0, 1], depth: [10, 80], kind: 'fish', colors: P.fish.barracuda, cap: 14 },
    { id: 'squid', name: 'Bulb Squid', tier: 2, pts: 35, xp: 7, heal: 6, proto: 'wander', speed: 2.4, len: 0.7, r: 0.26, zones: [1, 2], depth: [80, 250], kind: 'squid', colors: P.critters.squid, cap: 12 },
    { id: 'turtle', name: 'Moss Turtle', tier: 2, pts: 45, xp: 9, heal: 8, proto: 'wander', speed: 1.2, len: 1.0, r: 0.42, zones: [0, 1], depth: [2, 50], kind: 'turtle', colors: P.critters.turtle, cap: 8 },
    { id: 'swimmer', name: 'Swimmer', tier: 2, pts: 60, xp: 12, heal: 10, proto: 'surface', speed: 1.6, len: 1.1, r: 0.4, zones: [0, 1], depth: [0, 2], kind: 'human', human: 'swimmer', cap: 5 },
    { id: 'tuna', name: 'Sunfin Tuna', tier: 3, pts: 70, xp: 14, heal: 10, proto: 'flee', speed: 6.5, len: 1.5, r: 0.4, zones: [1], depth: [20, 150], kind: 'fish', colors: P.fish.tuna, cap: 12 },
    { id: 'diver', name: 'Diver', tier: 3, pts: 100, xp: 20, heal: 14, proto: 'flee', speed: 1.8, len: 1.6, r: 0.42, zones: [0, 1], depth: [5, 60], kind: 'human', human: 'diver', cap: 4 },
    { id: 'kayaker', name: 'Kayak Angler', tier: 3, pts: 120, xp: 24, heal: 14, proto: 'surface', mods: ['boat'], speed: 1.2, len: 2.4, r: 0.6, zones: [0, 1], depth: [0, 0], kind: 'human', human: 'kayaker', cap: 3 },
    { id: 'puffer', name: 'Thorn Puffer', tier: 3, pts: 50, xp: 10, heal: 8, proto: 'wander', mods: ['inflate'], speed: 1.6, len: 0.5, r: 0.28, zones: [0], depth: [10, 50], kind: 'puffer', colors: P.critters.puffer, dmg: 12, cap: 8 },
    { id: 'jelly', name: 'Glow Jelly', tier: 3, pts: 40, xp: 8, heal: 4, proto: 'hazard', mods: ['drift'], safeTier: 4, dmg: 8, speed: 0.4, len: 0.6, r: 0.34, zones: [0, 1, 2], depth: [30, 200], kind: 'jelly', colors: P.critters.jelly, cap: 14 },
    { id: 'sealion', name: 'Spot Sealion', tier: 4, pts: 140, xp: 28, heal: 16, proto: 'wander', speed: 3.4, len: 2.0, r: 0.55, zones: [1], depth: [0, 40], kind: 'sealion', colors: P.critters.sealion, cap: 6 },
    { id: 'sword', name: 'Sabre Bill', tier: 4, pts: 160, xp: 32, heal: 18, proto: 'chase', dmg: 12, senseR: 26, speed: 7.0, len: 2.6, r: 0.5, zones: [1], depth: [0, 120], kind: 'fish', colors: P.fish.tuna, cap: 6 },
    { id: 'reefshark', name: 'Rival Reefshark', tier: 4, pts: 180, xp: 36, heal: 20, proto: 'chase', dmg: 10, senseR: 24, speed: 5.4, len: 2.4, r: 0.55, zones: [0, 1], depth: [20, 100], kind: 'shark', colors: { a: 0x6E7F8D, b: 0xC9D4DC }, cap: 6 },
    { id: 'angler', name: 'Gulp Angler', tier: 4, pts: 200, xp: 40, heal: 22, proto: 'chase', mods: ['ambush'], dmg: 15, senseR: 14, speed: 5.8, len: 1.6, r: 0.5, zones: [2], depth: [200, 350], kind: 'angler', colors: P.fish.angler, cap: 8 },
    { id: 'grouper', name: 'Boulder Grouper', tier: 5, pts: 280, xp: 56, heal: 28, proto: 'wander', mods: ['bottom'], dmg: 15, speed: 1.8, len: 2.4, r: 0.8, zones: [0, 2], depth: [0, 999], kind: 'fish', colors: P.fish.grouper, cap: 5 },
    { id: 'gulper', name: 'Gulper Eel', tier: 5, pts: 300, xp: 60, heal: 30, proto: 'wander', speed: 2.2, len: 3.2, r: 0.5, zones: [2], depth: [250, 420], kind: 'eel', colors: P.fish.eel, cap: 6 },
    { id: 'orca', name: 'Blackring Orca', tier: 5, pts: 320, xp: 64, heal: 30, proto: 'chase', mods: ['pack'], dmg: 25, senseR: 32, speed: 7.2, len: 4.5, r: 1.0, zones: [1], depth: [0, 100], kind: 'orca', colors: P.critters.orca, cap: 4 },
    { id: 'manta', name: 'Ghost Manta', tier: 6, pts: 400, xp: 80, heal: 45, proto: 'school', school: [3, 5], speed: 1.8, len: 3.4, r: 1.1, zones: [2], depth: [150, 300], kind: 'ray', colors: P.critters.ray, cap: 8 },
    { id: 'sub', name: 'Armed Submersible', tier: 6, pts: 500, xp: 100, heal: 25, proto: 'chase', dmg: 20, senseR: 38, speed: 3.0, len: 4.0, r: 1.2, zones: [1, 2], depth: [50, 300], kind: 'sub', colors: P.critters.sub, bites: 3, coins: 30, shooter: true, cap: 2 },
    { id: 'volt', name: 'Volt Eel', tier: 6, pts: 350, xp: 70, heal: 35, proto: 'wander', mods: ['bottom'], safeTier: 6, dmg: 12, shock: true, speed: 1.6, len: 2.8, r: 0.5, zones: [2], depth: [200, 400], kind: 'eel', colors: P.fish.volt, cap: 5 },
    { id: 'whale', name: 'Drift Whale', tier: 7, pts: 400, xp: 80, heal: 40, proto: 'wander', speed: 1.4, len: 12.0, r: 2.6, zones: [1], depth: [0, 80], kind: 'whale', colors: P.critters.whale, bites: 5, cap: 1 },
    { id: 'lion', name: 'Spine Lion', tier: 5, pts: 60, xp: 12, heal: 8, proto: 'wander', safeTier: 5, poison: true, dmg: 3, speed: 1.4, len: 0.5, r: 0.28, zones: [0], depth: [10, 50], kind: 'lionfish', colors: P.fish.lionfish, cap: 6 },
    { id: 'mine', name: 'Anchor Mine', tier: 99, pts: 0, xp: 0, heal: 0, proto: 'hazard', dmg: 40, explode: true, speed: 0, len: 0.9, r: 0.5, zones: [1], depth: [4, 60], kind: 'mine', colors: P.critters.mine, cap: 12 },
    { id: 'trawler', name: 'Trawler', tier: 6, pts: 800, xp: 120, heal: 0, proto: 'surface', mods: ['boat'], net: true, speed: 1.5, len: 8.0, r: 1.6, zones: [1], depth: [0, 0], kind: 'trawler', bites: 3, coins: 50, cap: 1 },
    { id: 'vent', name: 'Thermal Vent', tier: 99, pts: 0, xp: 0, heal: 0, proto: 'hazard', mods: ['bottom'], dmg: 20, vent: true, speed: 0, len: 1.6, r: 1.4, zones: [2], depth: [0, 999], kind: 'vent', cap: 6 }
  ];
  D.byId = {};
  D.CREATURES.forEach(function (c) { D.byId[c.id] = c; });

  /* spawn population target per zone. New creatures appear in a ring just
     off-screen (RING_IN × view radius, RING_W wide) and within VRANGE metres
     of the player's depth; anything past the ring + DESPAWN_MARGIN is
     recycled. During the first OPENING_SECS of a run the target is raised
     and anything that can hurt you is rarer, so the start is busy but fair. */
  D.SPAWN = {
    TARGET: [55, 65, 60], RING_IN: 1.25, RING_W: 16, DESPAWN_MARGIN: 18,
    VRANGE: 14, WARMUP_IN: 0.4,
    OPENING_SECS: 30, OPENING_MULT: 1.5, OPENING_DANGER_W: 0.35,
    AUDIT: 0.5
  };

  /* ── bosses ───────────────────────────────────────────── */
  D.BOSSES = [
    { id: 'moray', zone: 0, name: 'Inkfang, Coral Tyrant',
      trigger: { score: 8000 }, lairX: 830, bites: 18, phases: 3,
      lungeDmg: 20, stun: 4.0, rewardFirst: 3000, rewardDaily: 600,
      unlock: { cosmetic: 'fangChain' },
      hint: 'Lure it into biting a Thorn Puffer, then strike the glowing gland.' },
    { id: 'orcaKing', zone: 1, name: 'Blacktide Regent',
      trigger: { score: 25000 }, lairX: 1900, bites: 24, phases: 3,
      chargeDmg: 35, stun: 3.0, rewardFirst: 5000, rewardDaily: 1000,
      unlock: { pet: 'volt' },
      hint: 'Bait its charge into the wreck masts, then bite the glowing belly.' },
    { id: 'squid', zone: 2, name: 'Eye of the Abyss',
      trigger: { depth: 350, tier: 5 }, lairX: 2780, bites: 18, phases: 2,
      slamDmg: 25, grabDps: 5, rewardFirst: 8000, rewardDaily: 1600,
      unlock: { cosmetic: 'abyssGoggles' },
      hint: 'Bite the glowing tentacle tips. When inked, eat lantern fish to see.' }
  ];

  /* ── pets ─────────────────────────────────────────────── */
  D.PETS = [
    { id: 'remora', name: 'Pilot', cost: 4000, desc: 'Vacuums coins within 8 m.', color: P.pets.remora },
    { id: 'lantern', name: 'Lumen', cost: 7000, needAch: 'abyss', desc: 'Lights the abyss; zaps a chaser every 20 s.', color: P.pets.lantern },
    { id: 'petrel', name: 'Skimmer', cost: 9000, desc: '-20% air gravity, +20% airborne score.', color: P.pets.petrel },
    { id: 'buddy', name: 'Rivet', cost: 12000, desc: 'Hunts nearby small prey — coins only.', color: P.pets.buddy },
    { id: 'bulwark', name: 'Bulwark', cost: 15000, needAch: 'boss1', desc: 'Once per run: survive a killing blow at 15% HP.', color: P.pets.bulwark },
    { id: 'volt', name: 'Sprocket', cost: 18000, needBoss: 'orcaKing', desc: 'Auto-zaps chasers that get within 5 m.', color: P.pets.volt }
  ];

  /* ── cosmetics (slots: head / body / tail) ───────────── */
  D.COSMETICS = [
    { id: 'kelpWig', name: 'Kelp Wig', slot: 'head', cost: 800, fx: null, desc: 'Fashion. Photosynthesis sold separately.' },
    { id: 'plaster', name: 'Cartoon Plaster', slot: 'body', cost: 500, fx: null, desc: 'It has seen things.' },
    { id: 'flag', name: 'Race Pennant', slot: 'tail', cost: 600, fx: null, desc: 'Officially 0% faster.' },
    { id: 'bubbleCrown', name: 'Bubble Crown', slot: 'head', cost: 2500, fx: { score: 1.05 }, desc: '+5% score. Heavy is the head.' },
    { id: 'sonarRing', name: 'Sonar Fin-ring', slot: 'body', cost: 5000, fx: { sonar: 30 }, desc: 'Highlights edible prey within 30 m.' },
    { id: 'abyssGoggles', name: 'Abyss Goggles', slot: 'head', cost: 6000, fx: { light: 1.25 }, desc: '+25% vision radius in the dark.' },
    { id: 'coralCharm', name: 'Coral Charm', slot: 'body', cost: 7000, fx: { grCharge: 1.10 }, desc: '+10% Gold Rush charge.' },
    { id: 'tailTurbine', name: 'Tail Turbine', slot: 'tail', cost: 8000, fx: { stamRegen: 1.10 }, desc: '+10% boost recovery.' },
    { id: 'fangChain', name: 'Fang Chain', slot: 'body', cost: 12000, bossGift: 'moray', fx: { bite: 1.08 }, desc: '+8% bite reach. A trophy with teeth.' }
  ];

  /* ── achievements (15, three hidden) ─────────────────── */
  D.ACHIEVEMENTS = [
    { id: 'firstBite', name: 'First Bite', desc: 'Eat your very first prey.', coins: 100, stat: 'eaten', goal: 1 },
    { id: 'feast100', name: 'Feast of 100', desc: 'Eat 100 creatures in one run.', coins: 500, run: 'eaten', goal: 100 },
    { id: 'airtime', name: 'Skywalker', desc: 'Stay airborne for 3.5 s in one jump.', coins: 500, event: true },
    { id: 'beachDay', name: 'Vacation Ruiner', desc: 'Eat 50 swimmers (lifetime).', coins: 800, stat: 'swimmers', goal: 50 },
    { id: 'abyss', name: 'Abyssal Visitor', desc: 'Dive to 400 m.', coins: 800, event: true },
    { id: 'combo50', name: 'Combo Maestro', desc: 'Reach a ×50 combo.', coins: 1000, event: true },
    { id: 'gr3', name: 'Golden Storm', desc: 'Trigger 3 Gold Rushes in one run.', coins: 1000, run: 'goldRushes', goal: 3 },
    { id: 'boss1', name: 'Tyrant Toppled', desc: 'Slay your first apex predator.', coins: 1500, event: true },
    { id: 'whaleEat', name: 'Big Game', desc: 'Devour a Drift Whale.', coins: 2000, event: true },
    { id: 'chests', name: 'Wreck Raider', desc: 'Open all 12 hidden chests.', coins: 3000, stat: 'chests', goal: 12 },
    { id: 'boss3', name: 'Triple Crown', desc: 'Slay all three apex predators.', coins: 5000, event: true },
    { id: 'allSharks', name: 'Full Cast', desc: 'Own all 7 sharks.', coins: 10000, event: true },
    { id: 'davidGoliath', name: 'Minnow of the Deep', desc: '???', hidden: true, real: 'Survive 5 min in the Abyss as the Reef Pup.', coins: 2000, event: true },
    { id: 'mineBait', name: 'Dance With Thunder', desc: '???', hidden: true, real: 'Lure 5 chasers into mines (lifetime).', coins: 1500, stat: 'mineKills', goal: 5 },
    { id: 'shipSinker', name: 'Uninvited Guest', desc: '???', hidden: true, real: 'Sink 3 trawlers in one run.', coins: 2000, run: 'trawlers', goal: 3 }
  ];

  /* ── daily challenge templates (seeded by date) ──────── */
  /* tiers pick param by progression band (max owned shark tier 1-2 / 3-4 / 5-7) */
  D.DAILY_TEMPLATES = [
    { id: 'eatHumans', text: 'Eat {n} humans', params: [6, 12, 20], track: 'humans' },
    { id: 'score', text: 'Score {n} in one run', params: [8000, 30000, 90000], track: 'bestScore', single: true },
    { id: 'combo', text: 'Reach a ×{n} combo', params: [12, 25, 40], track: 'bestCombo', single: true },
    { id: 'goldRush', text: 'Trigger {n} Gold Rushes', params: [2, 4, 6], track: 'goldRushes' },
    { id: 'airTime', text: 'Total {n}s of airtime', params: [8, 16, 26], track: 'airTime' },
    { id: 'eatTier', text: 'Eat {n} tier-{t} creatures', params: [[15, 2], [10, 4], [8, 5]], track: 'tierEats' },
    { id: 'survive', text: 'Survive {n} min in one run', params: [4, 6, 8], track: 'bestSurvive', single: true },
    { id: 'distance', text: 'Swim {n} km total', params: [2, 4, 7], track: 'distance' },
    { id: 'orcas', text: 'Eat {n} orcas', params: [1, 2, 4], track: 'orcas', minBand: 1 },
    { id: 'gulls', text: 'Snatch {n} gulls from the air', params: [2, 5, 8], track: 'gulls' }
  ];
  D.DAILY_REWARDS = [400, 700, 1200];
  D.DAILY_ALL_BONUS = 500;
  D.DAILY_STREAK_BONUS = 2000;     // every 7-day full streak

  /* chest hunt: 4 per zone, coins each */
  D.CHESTS = { PER_ZONE: 4, COINS: 150 };
})();

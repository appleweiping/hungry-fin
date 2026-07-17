/* ═══════════════════════════════════════════════════════════
   HF.Palette — the single source of truth for every colour.
   Discipline: cool hues = environment, warm hues = interactive,
   gold = UI emphasis. No random HSV anywhere else in the code.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M');

  HF.Palette = {
    ui: { gold: 0xFFC93C, danger: 0xFF5D5D, ok: 0x3BCEAC, text: 0xEAF6FF },

    sky: { top: 0x4EA8DE, horizon: 0xCDEBF5, sun: 0xFFF6D8, cloud: 0xFFFFFF },

    /* per-zone atmosphere — lerped by player x/depth at runtime */
    zones: [
      { /* 0: Coral Shallows */
        name: 'Coral Shallows',
        waterTop: 0x7EDCE2, waterMid: 0x3FA9BF, waterDeep: 0x1E6E8C,
        fog: 0x4FB8C9, fogDensity: 0.016,
        sunColor: 0xFFF4D6, sunIntensity: 1.1,
        hemiSky: 0xBFEAF0, hemiGround: 0x2C7A8C, hemiIntensity: 0.75,
        seabed: 0xE8DCC4, seabedAlt: 0xC9BCA4,
        deco: { coral: [0xFF6F91, 0xFF9671, 0xF9F871, 0xD65DB1], weed: 0x2EC4B6, rock: 0xB7A98E }
      },
      { /* 1: Open Blue */
        name: 'Open Blue',
        waterTop: 0x2E86AB, waterMid: 0x155E8A, waterDeep: 0x0A3D62,
        fog: 0x1B6A96, fogDensity: 0.011,
        sunColor: 0xDCEFFF, sunIntensity: 0.85,
        hemiSky: 0x7FB8D8, hemiGround: 0x0A3D62, hemiIntensity: 0.55,
        seabed: 0x2F4858, seabedAlt: 0x24363F,
        deco: { coral: [0x3A5A6E, 0x4F7285], weed: 0x1F7A6D, rock: 0x3A5A6E }
      },
      { /* 2: The Abyss */
        name: 'The Abyss',
        waterTop: 0x16213E, waterMid: 0x0F1B33, waterDeep: 0x05070F,
        fog: 0x0D1B2E, fogDensity: 0.026,
        sunColor: 0x223355, sunIntensity: 0.15,
        hemiSky: 0x1B2A4A, hemiGround: 0x05070F, hemiIntensity: 0.35,
        seabed: 0x141C2B, seabedAlt: 0x0D1320,
        deco: { glowA: 0xB5179E, glowB: 0x4CC9F0, rock: 0x1B263B, bone: 0xDDE3EA }
      }
    ],

    goldRush: { fog: 0x8a6a18, tint: 0xFFD700 },

    /* creature families */
    fish: {
      sardine: { a: 0xC6D8E0, b: 0x8FA8B8 },
      parrot: { a: 0x2EC4B6, b: 0xFF9671 },
      barracuda: { a: 0x9FB4C0, b: 0x5E7A8A },
      tuna: { a: 0x3D5A80, b: 0xE0FBFC, fin: 0xFFD166 },
      lionfish: { a: 0xC1440E, b: 0xF2E8CF },
      angler: { a: 0x1B1B2F, b: 0x30304F, lure: 0xCFF7FF },
      eel: { a: 0x3A2E4F, b: 0x5C4A78 },
      volt: { a: 0x223344, b: 0x4CC9F0 },
      grouper: { a: 0x6B4F3A, b: 0xC9A227 }
    },
    critters: {
      crab: { a: 0xE85D3A, b: 0xFFB59E }, turtle: { shell: 0x3E7C59, skin: 0xA8C69F },
      jelly: { a: 0x9BF6FF, b: 0xCAF0F8 }, squid: { a: 0xE29AC1, b: 0xF7D6E6 },
      puffer: { a: 0xE9C46A, b: 0xF4E8C1, spike: 0x7A5C2E },
      sealion: { a: 0x7A5C43, b: 0xA98467 }, gull: { a: 0xF4F7F9, b: 0x39424E, beak: 0xFF9F1C },
      ray: { a: 0x4B5D8A, b: 0xB8C6E8 }, orca: { a: 0x10151C, b: 0xF2F5F7 },
      whale: { a: 0x4A6274, b: 0x9FB4C0 }, mine: { a: 0x39424E, spike: 0x20262E, light: 0xFF3333 },
      sub: { a: 0xC9A227, b: 0x6E5A18, glass: 0x9BF6FF },
      trawler: { hull: 0x8C4A3A, deck: 0xC9BCA4, mast: 0x5C4A38 },
      chest: { a: 0x8C6A4F, b: 0xFFC93C }
    },
    human: {
      skin: 0xFFD9B3,
      suits: [0xFF5D8F, 0x3BCEAC, 0xFFD23F, 0x4CC9F0, 0xF15BB5],
      diveSuit: 0x2B3A55, tank: 0xC9CED6, ring: [0xFF6F91, 0xF9F871, 0x4CC9F0],
      kayak: [0xE85D3A, 0x3BCEAC, 0xFFD23F], paddle: 0xD9C7A7
    },
    boss: {
      moray: { a: 0x2F5233, b: 0x8FB877, weak: 0xFFD166 },
      orcaKing: { a: 0x0A0E14, b: 0xE8EEF2, weak: 0xFF5D5D },
      squid: { a: 0x4A1E5C, b: 0x8E44AD, weak: 0x4CC9F0, eye: 0xFFC93C }
    },
    coin: 0xFFC93C,
    pets: { remora: 0x8FB8CC, lantern: 0x9BF6FF, petrel: 0xF4F7F9, buddy: 0x7A8B6F, bulwark: 0xC1440E, volt: 0x4CC9F0 }
  };
})();

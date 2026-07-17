<p align="center">
  <img src="assets/banner.svg" alt="Hungry Fin — Ocean Odyssey" width="100%">
</p>

<h1 align="center">🦈 Hungry Fin — Ocean Odyssey</h1>

<p align="center">
  <b>Eat. Grow. Survive.</b> A complete shark-survival arcade game that runs from a single <code>index.html</code> —
  no build step, no bundler, no image or audio files. Every model is generated in code, every sound is synthesized live.
</p>

<p align="center">
  <a href="https://appleweiping.github.io/hungry-fin/"><b>▶ PLAY IT IN YOUR BROWSER</b></a>
  &nbsp;·&nbsp;
  <a href="README.zh.md">中文文档</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/engine-Three.js%20r147-049EF4" alt="Three.js r147">
  <img src="https://img.shields.io/badge/build-none%20%F0%9F%8E%89-3BCEAC" alt="zero build">
  <img src="https://img.shields.io/badge/assets-0%20files-FFC93C" alt="zero assets">
  <img src="https://img.shields.io/badge/license-MIT-8FB8CC" alt="MIT">
</p>

---

> **Fair-use note** — Hungry Fin is an original, open-source homage to the shark-survival genre
> popularized by games like *Hungry Shark World* (Ubisoft / Future Games of London). It is **not
> affiliated with, endorsed by, or derived from** those games in any way: every line of code, every
> 3D model, every sound, every name and every number in this repository is original work, built from
> scratch for this project. If you enjoy the genre, go buy the real thing too.

---

## What is this?

You are a shark. The ocean is a buffet. Everything smaller than you is food; everything bigger has
opinions about *you* being food. Keep your hunger bar filled, chain combos, trigger Gold Rushes,
grow within each run, earn coins across runs, unlock seven sharks, three ocean zones, three apex
bosses, six pets and a hat or two — then do it again but deeper.

| Feeding frenzy | Boss fight |
|---|---|
| ![Feeding frenzy with combo counter](assets/shot-frenzy.jpg) | ![Inkfang the Coral Tyrant boss fight](assets/shot-boss.jpg) |

| Title reef | The abyss (your shark is the lamp) |
|---|---|
| ![Title screen attract mode](assets/shot-title.jpg) | ![Deep abyss with bioluminescence](assets/shot-abyss.jpg) |

## Play

**Online:** [appleweiping.github.io/hungry-fin](https://appleweiping.github.io/hungry-fin/)

**Locally:** clone the repo and double-click `index.html`. That's it — the game runs from `file://`.
(A local server also works: `python -m http.server 8000`.)

### Controls

| Action | Desktop | Touch |
|---|---|---|
| Swim | Move the mouse (your fin follows) or `WASD` / arrows | Floating joystick, left half of screen |
| Boost | Hold left mouse / `Space` / `Shift` | Hold the ⚡ button |
| Bite | Automatic — get your mouth on it | Automatic |
| Escape nets & grabs | Mash boost | Mash ⚡ |
| Pause | `Esc` / `P` | ⏸ button |

## Features

**The core loop, faithfully rebuilt**

- **Hunger is health.** One bar, always draining. Eating is the only cure.
- **Tier-based food chain** — 28 creature types across 7 bite tiers. Grow in-run (L1→L10) to
  unlock bigger prey mid-run; buy bigger sharks to move up the chain permanently.
- **Combos** with tightening timing windows (×1 → ×5 score) and a **Gold Rush** meter: fill it for
  12 seconds of invulnerable, double-score, everything-is-edible mayhem.
- **Boost with a bite-refund**: every successful chomp refunds stamina (0.4 s internal cooldown),
  so aggression — not caution — keeps you fast.
- **Jump out of the water.** Half gravity, slow-motion at the apex, airborne catches score ×2.

**A world worth crossing**

- Three zones with their own palettes, fog, spawns and music scales: candy-bright **Coral
  Shallows**, wide-open **Open Blue**, and **The Abyss**, where your shark's dive-lamp is the only
  light you get.
- **Three apex bosses** on one shared fight framework — lure Inkfang into biting a Thorn Puffer,
  bait the Blacktide Regent into wreck masts, and take the Eye of the Abyss down one glowing
  tentacle at a time (mind the ink).
- Anchor mines, thermal vents, jellyfish, trawler nets with a mash-to-escape QTE, harpoon-firing
  submersibles, and 12 hidden treasure chests.

**Progression that persists (localStorage, no accounts)**

- **7 sharks** from the 1.2 m Reef Pup to the 13 m Megalith (slaying all three bosses discounts it).
- **6 pets** — coin magnet, abyss lantern, air-time gull, auto-hunter, one-per-run death save, and
  a chaser-zapping eel.
- **9 cosmetics** across head/body/tail slots. Bonuses are capped at ~10% and only buy convenience,
  never raw damage.
- **15 achievements** (3 hidden) and **date-seeded daily challenges** — same three tasks for every
  player on Earth each day, no server involved.

**And the whole thing is procedural**

- Sharks are built by one parametric generator (cross-section lofting) fed by a data table; fish,
  humans, boats and bosses come from the same modelling kit.
- Tails, wings, jelly skirts all animate in a single vertex-shader chunk injected into stock
  Three.js materials — one draw call per species via `InstancedMesh`.
- All 13 sound effects plus the generative ambient soundtrack are WebAudio oscillators and filtered
  noise, synthesized at play time. The repo contains **zero** image, model or audio files.

## Architecture

Classic `<script>` tags, one global namespace, five dependency tiers — the load order in
`index.html` *is* the dependency graph. `HF.require()` fails loudly at boot if the order breaks.

```
index.html
├── vendor/three.min.js      Three.js r147 UMD, pinned & vendored (see vendor/README.md)
└── js/
    ├── core/core.js         namespace · math · seeded RNG · events · pools · fatal overlay
    ├── data/                palette.js (every colour) · balance.js (every number)
    ├── audio/audio.js       synthesized SFX + layered generative ambient
    ├── gfx/                 materials (sway shader) · modelKit (lofting) · sharkBuilder ·
    │                        builders (28 species) · water · environment · particles
    ├── game/                engine (timeScale channel stack) · save · input · cameraRig ·
    │                        entity+grid · ai (6 behaviour protos) · spawner · player ·
    │                        combat · systems (GR/pets/coins/nets) · boss · progression
    └── ui/                  hud · screens · shop (scissored 3D preview)
```

Design decisions worth stealing:

- **timeScale channel stack** — hit-stop, cinematics and slow-motion each own a channel;
  the final scale is their minimum, so a bite freeze can never cancel a jump's slow-mo.
- **Two-layer bite judgement** — a physical layer (mouth circle + swept segment, no tunnelling at
  boost speed) under a feel layer (facing cone + fixed-range magnet). Bite reach grows at *half*
  the shark's visual growth rate, capped — growth should feel powerful, not remove aiming.
- **Six behaviour prototypes** (`school / wander / flee / chase / hazard / surface`) drive all 28
  species; a new creature is a data row, not new code.
- **Population is local** — a ring just off-screen tops up to a target count and anything past the
  ring recycles, so the action density is constant no matter where you swim.
- **The player is the light source** — below ~100 m a point light fades in on your shark, kept
  always-on at ε intensity because toggling light *count* would recompile every lit shader.
- **Defensive by default** — save-file migration + `__proto__`-safe merge + corrupted-value
  fallbacks, `pointercancel`/`blur` input recovery, WebGL context-loss handling, DPR-aware resize
  polling, and an auto performance governor that steps quality down if FPS sags.

## Numbers people, this way

The full economy lives in [`js/data/balance.js`](js/data/balance.js): shark stats, all 28 creature
rows, combo windows `5s/4s/3s`, Gold Rush charge rate ×0.6 (frozen during GR and boss fights),
coins = `⌊score/60⌋`, XP curve `80·1.5^(L−1)`. Target pacing: next purchase always ≤8 runs away;
full shark roster in ~5 h of play, full collection in ~8.

## How it was built

This project was built end-to-end by [Claude Code](https://claude.com/claude-code) as a serious
exercise in **multi-agent adversarial development**: three specialist agents (game design /
engine architecture / game-feel) drafted the spec in parallel, an adversarial reviewer attacked
the merged design and froze a ruled specification, the game was implemented against it, and three
more reviewer agents (correctness & economy / rendering & performance / robustness & cross-env)
audited the finished code — 47 findings, 33 confirmed and fixed, verified by an automated
CDP-driven regression that plays the game for real (feeding, Gold Rush, a full boss kill, death,
shop, save persistence) with zero console errors.

## Roadmap

- [ ] Gamepad support
- [ ] More zones (arctic shelf, volcanic fields) and a fourth apex
- [ ] Photo mode
- [ ] Seeded speedrun mode with shareable results
- [ ] i18n for in-game text (the code base is ready — all strings live in UI modules)

## Contributing

PRs welcome. Ground rules:

1. **No build tooling.** If it needs `npm install`, it doesn't merge.
2. **No binary assets.** Models are code, sounds are synthesis, colours come from `palette.js`.
3. **Numbers go in `balance.js`**, colours in `palette.js` — never inline.
4. Keep `file://` working: no `fetch`, no ES modules, relative paths only.
5. New creatures should be data rows using the six existing behaviour prototypes.

## License

[MIT](LICENSE) — the vendored Three.js keeps its own MIT license
([vendor/LICENSE-three.txt](vendor/LICENSE-three.txt)).

---

<p align="center">🌊 <i>The ocean files complaints. The ocean files them under M.</i> 🌊</p>

/* ═══════════════════════════════════════════════════════════
   HF.Game — assembly & state machine.
   BOOT → TITLE (attract mode: autopilot shark) → PLAYING
        ↕ SHOP                    ↕ PAUSED → RESULTS
   Update order per frame:
   input → player → AI → spawner → combat → systems → boss →
   progress → camera → world/water/materials/particles →
   entity matrices → HUD → render (+ shop preview pass).
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Engine', 'Save', 'Input', 'Camera', 'World', 'Water', 'Particles',
    'Entities', 'AI', 'Spawner', 'Player', 'Combat', 'Systems', 'Boss', 'Progress',
    'HUD', 'UIScreens', 'Shop', 'Audio');
  var M = HF.M;

  var autoT = 0, autoTarget = { x: 200, y: -14 };
  var deathSeq = 0;

  HF.Game = {
    state: 'BOOT',

    init: function () {
      HF.Save.load();
      var st = HF.Save.data.settings;
      HF.Audio.setVolume('sfx', st.sfx);
      HF.Audio.setVolume('music', st.music);

      HF.Engine.init();
      if (st.quality !== undefined && st.quality !== 2) HF.Engine.setQuality(st.quality);
      var scene = HF.World.init();
      HF.Water.init(scene);
      HF.Particles.init(scene);
      HF.Entities.init(scene);
      HF.Systems.init(scene);
      HF.Camera.init();
      HF.Input.init();
      HF.HUD.init();
      HF.UIScreens.init();
      HF.Player.init(scene);
      HF.Player.equip(HF.Save.data.equipped.shark);

      HF.Events.on('playerDied', function (cause) { HF.Game.onDeath(cause); });

      /* attract-mode world */
      HF.Camera.snapTo(HF.Player.x, HF.Player.y);
      HF.Spawner.warmup(HF.Player.x, HF.Player.y, false);

      HF.Engine.start();
    },

    /* ── state transitions ── */
    toTitle: function () {
      HF.Game.state = 'TITLE';
      HF.HUD.show(false);
      HF.UIScreens.title();
      HF.Boss.reset();
      if (HF.Player.dead) {
        HF.Player.equip(HF.Save.data.equipped.shark);
        HF.Player.x = 200; HF.Player.y = -14;
      }
      HF.Time.clear('cine'); HF.Time.clear('slow');
    },

    startRun: function () {
      HF.Game.state = 'PLAYING';
      HF.Input.consumePause();       // stale Esc from menus must not pause frame 1
      HF.UIScreens.clear();
      HF.Boss.reset();
      HF.Entities.despawnAll();
      HF.Player.equip(HF.Save.data.equipped.shark);
      HF.Player.x = 160; HF.Player.y = -12;
      HF.Player.resetRun();
      HF.Combat.reset();
      HF.Systems.resetRun();
      HF.Spawner.reset();
      HF.Progress.startRun();
      HF.HUD.resetRunUI();
      HF.HUD.show(true);
      HF.Camera.snapTo(HF.Player.x, HF.Player.y);
      HF.Camera.clearCine();
      HF.Spawner.warmup(HF.Player.x, HF.Player.y, true);
      deathSeq = 0;
      /* contextual first-run hints */
      HF.HUD.hintOnce('move', HF.Input.isTouch() ? 'Drag on the left to swim' : 'Move the mouse — your fin follows', 4);
      HF.HUD.hintOnce('eat', 'Eat anything smaller than you 🐟', 4);
      setTimeout(function () {
        if (HF.Game.state === 'PLAYING') {
          HF.HUD.hintOnce('boost', HF.Input.isTouch() ? 'Hold ⚡ to boost' : 'Hold click / SPACE to boost', 4);
        }
      }, 9000);
      if (document.getElementById('touch-ui') && HF.Input.isTouch()) HF.Input.showTouchUI(true);
    },

    pause: function () {
      if (HF.Game.state !== 'PLAYING' && HF.Game.state !== 'RESUMING') return;
      HF.Game.state = 'PAUSED';
      HF.UIScreens.pause();
      HF.Save.flush();
    },
    resume: function () {
      HF.UIScreens.countdown(function () {
        if (HF.Game.state !== 'RESUMING') return;   // backgrounded mid-countdown
        HF.Input.consumePause();                     // Esc pressed in the menu ≠ pause again
        HF.Game.state = 'PLAYING';
      });
      HF.Game.state = 'RESUMING';
    },
    abandon: function () {
      HF.Player.die('hunger');
      HF.Game.state = 'PLAYING';   // let the death sequence play
      HF.UIScreens.clear();
    },

    onDeath: function (cause) {
      var run = HF.Progress.run;
      if (run) run.cause = cause;
      HF.Audio.play('death');
      HF.Time.set('slow', 0.3, 2.2);
      HF.Camera.addTrauma(0.4);
      deathSeq = 2.6;
    },

    /* ── per-frame ── */
    frame: function (dt, dtRaw) {
      var state = HF.Game.state;
      var P = HF.Player;

      if (state === 'TITLE' || state === 'SHOP') {
        /* attract mode: autopilot shark keeps the world alive */
        autopilot(dt);
        HF.AI.update(dt, P);
        HF.Grid.rebuild();
        HF.Spawner.update(dt, P);
        HF.Systems.update(dt);
      } else if (state === 'PLAYING') {
        var intent = HF.Input.poll();
        if (HF.Input.consumePause() && !P.dead) { HF.Game.pause(); return; }

        P.update(dt, intent);
        HF.AI.update(dt, P);
        HF.Grid.rebuild();
        HF.Spawner.update(dt, P);
        HF.Combat.update(dt);
        HF.Systems.update(dt);
        HF.Boss.update(dt);
        HF.Progress.update(dt);

        if (P.dead && deathSeq > 0) {
          deathSeq -= dtRaw;
          if (deathSeq <= 0) {
            var run = HF.Progress.endRun();
            HF.Game.lastRun = run;      // shop can return to this recap
            HF.Game.state = 'RESULTS';
            HF.HUD.show(false);
            HF.UIScreens.death(run);
          }
        }
      } else if (state === 'PAUSED' || state === 'RESULTS' || state === 'RESUMING') {
        /* world breathes but logic sleeps */
        HF.Systems.update(0);
      }

      /* always: visuals */
      var camX = HF.Camera.x(), camY = HF.Camera.y();
      HF.Camera.update(dtRaw, (state === 'PLAYING' || state === 'TITLE' || state === 'SHOP') ? P : null);
      HF.World.update(dt, HF.Time.now, P.x, P.y, HF.Engine.quality());
      HF.Water.update(dt, HF.Time.now, camX, camY, HF.Engine.quality());
      HF.Materials.update(HF.Time.now, dt);
      HF.Particles.update(dt, HF.Time.now);
      HF.Entities.render();
      if (state === 'PLAYING') HF.HUD.update(dt, dtRaw);
      HF.Audio.tick(dtRaw, {
        zone: HF.World.zoneIndexAt(P.x),
        combo: HF.Progress.run ? HF.Progress.run.combo : 0,
        dead: P.dead
      });
      HF.Save.tick(dtRaw);

      var renderer = HF.Engine.renderer;
      renderer.render(HF.World.scene, HF.Camera.cam);
      HF.Shop.renderPreview(renderer);
    }
  };

  /* title-screen autopilot: swim around, look alive */
  function autopilot(dt) {
    var P = HF.Player;
    if (P.dead) return;
    autoT -= dt;
    if (autoT <= 0 || M.dist2(P.x, P.y, autoTarget.x, autoTarget.y) < 30) {
      autoT = M.rand(3, 6);
      autoTarget.x = M.clamp(P.x + M.rand(-70, 90), 60, 850);
      autoTarget.y = M.rand(-30, -6);
    }
    var fake = {
      steerMode: 'dir',
      steer: {
        x: M.clamp((autoTarget.x - P.x) * 0.1, -1, 1),
        y: M.clamp((autoTarget.y - P.y) * 0.1, -1, 1)
      },
      pointer: { x: 0, y: 0 },
      boost: false
    };
    P.update(dt, fake);
    P.hp = P.maxHp;   // demo shark never starves
  }

  /* ── boot ── */
  window.addEventListener('DOMContentLoaded', function () {
    try {
      HF.Game.init();
    } catch (e) {
      console.error(e);
      var el = document.getElementById('fatal');
      if (el) {
        el.classList.remove('hidden');
        el.textContent = '🦈 Failed to start.\n\n' + e.message + '\n\n' + (e.stack || '');
      }
    }
  });
})();

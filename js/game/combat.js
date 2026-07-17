/* ═══════════════════════════════════════════════════════════
   HF.Combat — eating & getting eaten.
   Two-layer bite judgement (review ruling): a physical layer
   (mouth circle + swept segment vs prey circle) AND a feel
   layer (facing cone filter + fixed-range magnet pull).
   Also: hostile bites, hazards, multi-bite giants, coins.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Data', 'Player', 'Entities', 'Grid');
  var M = HF.M, D = HF.Data;

  var q = [];
  var lastEatAt = -9;
  var coinStreakT = 0, coinStreak = 0;

  function edible(e, P) {
    if (e.dead) return false;
    var gr = HF.Systems.goldRush.active;
    var tierOk = e.def.tier <= P.effTier + (gr ? D.RULES.GR_TIER_BONUS : 0);
    if (e.def.tier === 99) return false;                     // pure hazards never edible
    if (e.def.safeTier && P.effTier < e.def.safeTier && !gr) return false;
    if (e.def.net && P.effTier < 6 && !gr) return false;     // trawler needs big jaws
    return tierOk;
  }

  function eat(e, P) {
    var def = e.def;
    var gr = HF.Systems.goldRush.active;

    /* multi-bite giants: whale (5), sub (3), trawler (3).
       Per-target cooldown — the mouth overlaps for many consecutive
       frames and each partial bite must be a deliberate CHOMP. */
    if (def.bites && e.bites > 1) {
      if (HF.Time.now < e.nextBiteAt) return;
      e.nextBiteAt = HF.Time.now + 0.45;
      e.bites--;
      e.scale *= 0.88;
      partialBiteFeedback(e, P);
      HF.Progress.onBitePartial(def);
      return;
    }
    if (def.bites && HF.Time.now < e.nextBiteAt) return;

    /* poison punishment for under-tier lionfish is handled by safeTier gate;
       eating it when allowed is clean. Jelly under-tier stings elsewhere. */
    HF.Entities.despawn(e);

    var airborne = P.airborne;
    HF.Progress.onEat(def, e, { air: airborne, gr: gr });

    /* feedback: hitstop scaled by tier, diminishing when chain-eating */
    var stop = Math.min(D.RULES.HITSTOP_BASE + def.tier * D.RULES.HITSTOP_PER_TIER, D.RULES.HITSTOP_MAX);
    if (HF.Time.now - lastEatAt < 0.4) stop *= D.RULES.HITSTOP_RAPID_FACTOR;
    lastEatAt = HF.Time.now;
    HF.Time.hitstop(stop);
    P.chomp();
    P.biteRefund();
    P.heal(def.heal);

    var col = def.kind === 'human' ? 0xF9F871 : (def.colors ? def.colors.a : 0xCCCCCC);
    if (def.kind === 'human') {
      HF.Particles.humanPoof(e.x, e.y);
      HF.Audio.play('gulp');
    } else {
      HF.Particles.burst(e.x, e.y, col, Math.min(6 + def.tier * 3, 18), 2 + def.tier * 0.6);
      HF.Audio.play(def.tier >= 4 ? 'gulp' : 'bite', { combo: Math.min(HF.Progress.comboStage(), 5) });
    }
    HF.Particles.bubbles(e.x, e.y, 4, 0.5, 2);
    HF.Camera.biteKick(Math.cos(P.angle), Math.sin(P.angle), 0.25 + def.tier * 0.08);
    if (def.tier >= 4) HF.Camera.addTrauma(0.12 + def.tier * 0.03);

    /* coin drops */
    var coins = 0;
    if (def.coins) coins += def.coins;
    if (Math.random() < D.RULES.COIN_DROP_CHANCE) coins += M.randi(D.RULES.COIN_DROP_MIN, D.RULES.COIN_DROP_MAX);
    if (coins > 0) HF.Systems.dropCoins(e.x, e.y, coins * (gr ? D.RULES.GR_COIN_MULT : 1));
  }

  function partialBiteFeedback(e, P) {
    HF.Time.hitstop(0.09);
    P.chomp(); P.biteRefund();
    HF.Particles.burst(e.x + M.rand(-1, 1), e.y + M.rand(-1, 1), e.def.colors ? e.def.colors.a : 0x888888, 10, 4);
    HF.Audio.play('bite', { big: true });
    HF.Camera.addTrauma(0.2);
    HF.Materials.flash(HF.Player.group(), 0xffffff, 0.08);
    if (e.def.kind === 'trawler') HF.Particles.burst(e.x, e.y + 1, 0x8C4A3A, 8, 5);
  }

  HF.Combat = {
    reset: function () { lastEatAt = -9; coinStreak = 0; },

    update: function (dt) {
      var P = HF.Player;
      if (P.dead || !P.def) return;
      var R = D.RULES;
      coinStreakT -= dt; if (coinStreakT <= 0) coinStreak = 0;

      /* ── eating pass ── */
      var reach = R.MAGNET_RANGE + P.mouth.r + 3;
      HF.Grid.query(P.mouth.x, P.mouth.y, reach, q);
      var cosA = Math.cos(P.angle), sinA = Math.sin(P.angle);
      for (var i = 0; i < q.length; i++) {
        var e = q[i];
        if (!edible(e, P)) continue;
        var dx = e.x - P.mouth.x, dy = e.y - P.mouth.y;
        var dist = M.len(dx, dy);
        var eatR = P.mouth.r + e.def.r * e.scale * 0.75;

        /* physical layer: mouth circle now, or swept segment this frame */
        var hit = dist <= eatR ||
          M.segDist2(e.x, e.y, P.prevMouth.x, P.prevMouth.y, P.mouth.x, P.mouth.y) <= eatR * eatR;

        if (hit) { eat(e, P); continue; }

        /* feel layer: cone + magnet (fixed world range, review ruling) */
        if (dist < eatR + R.MAGNET_RANGE) {
          var facing = (dx * cosA + dy * sinA) / (dist || 1);
          if (facing > R.MOUTH_CONE_COS) {
            var pull = R.MAGNET_PULL * dt / Math.max(dist, 1);
            e.x -= dx * pull; e.y -= dy * pull;
          }
        }
      }

      /* ── hostile & hazard pass (body circle) ── */
      var bodyR = P.lenScaled * 0.28;
      var pendingMines = [];   // mine events processed AFTER the loop (q is a shared buffer)
      HF.Grid.query(P.x, P.y, bodyR + 6, q);
      for (var j = 0; j < q.length; j++) {
        var h = q[j];
        if (!h.alive) continue;
        var def = h.def;
        var rr = bodyR + def.r * h.scale;
        var d2 = M.dist2(P.x, P.y, h.x, h.y);
        if (d2 > rr * rr) continue;

        if (def.explode) {                       /* mine */
          HF.Entities.despawn(h);
          HF.Particles.boom(h.x, h.y);
          HF.Audio.play('explosion');
          HF.Camera.addTrauma(0.7);
          P.takeDamage(def.dmg, 'mine', { knock: { x: (P.x - h.x) * 2, y: (P.y - h.y) * 2 + 3 } });
          pendingMines.push({ x: h.x, y: h.y });
          continue;
        }
        if (def.vent) {
          /* continuous hazard: hurts through i-frames, never grants them */
          if (h.state === 2) P.takeDamage(def.dmg * dt, 'vent', { dot: true });
          continue;
        }
        if (def.kind === 'jelly' && P.effTier < (def.safeTier || 99) && !HF.Systems.goldRush.active) {
          if (P.iframes <= 0) {
            P.takeDamage(def.dmg, 'jelly');
            HF.Progress.breakCombo('sting');
          }
          continue;
        }
        if (def.poison && P.effTier < def.safeTier && !HF.Systems.goldRush.active) {
          if (P.iframes <= 0) { P.poison = 5; P.takeDamage(def.dmg, 'poison'); }
          continue;
        }
        if (def.shock && P.effTier < def.safeTier && !HF.Systems.goldRush.active) {
          if (P.iframes <= 0) {
            P.takeDamage(def.dmg, 'shock');
            P.shockT = 0.5;
            HF.Particles.zap(P.x, P.y);
            HF.Audio.play('zap');
          }
          continue;
        }
        if (def.mods && def.mods.indexOf('inflate') >= 0 && h.inflate > 0.5) {
          if (P.iframes <= 0) P.takeDamage(def.dmg, 'puffer', { knock: { x: (P.x - h.x) * 3, y: 2 } });
          continue;
        }
        /* chasers bite on contact */
        if (def.proto === 'chase' && h.state === 1 && def.dmg) {
          if (h.atkCd <= 0 && P.iframes <= 0) {
            h.atkCd = 1.1;
            P.takeDamage(def.dmg, def.id, { knock: { x: (P.x - h.x) * 1.5, y: 1.5 } });
          }
        }
        /* trawler net */
        if (def.net && !P.netted && P.effTier < 6 && P.y > -4 && HF.Systems.canNet()) {
          HF.Systems.startNet(h);
        }
      }
      for (var k = 0; k < HF.Entities.list.length; k++) {
        var c = HF.Entities.list[k];
        if (c.atkCd > 0) c.atkCd -= dt;
      }
      for (var pm = 0; pm < pendingMines.length; pm++) {
        HF.Combat.mineChainCheck(pendingMines[pm]);
      }

      /* ── sub harpoons: simple ranged nuisance ── */
      HF.Systems.updateHarpoons(dt);

      /* ── chest opening ── */
      var chests = HF.World.chests;
      for (var ci = 0; ci < chests.length; ci++) {
        var ch = chests[ci];
        if (!ch.visible) continue;
        if (HF.Save.data.chestsOpened[ch.userData.chestId]) { ch.visible = false; continue; }
        if (M.dist2(P.mouth.x, P.mouth.y, ch.position.x, ch.position.y) < (P.mouth.r + 1.4) * (P.mouth.r + 1.4)) {
          ch.visible = false;
          HF.Save.data.chestsOpened[ch.userData.chestId] = true;
          HF.Save.data.stats.chests++;
          HF.Save.mark();
          HF.Systems.dropCoins(ch.position.x, ch.position.y + 1, D.CHESTS.COINS);
          HF.Particles.burst(ch.position.x, ch.position.y + 1, 0xFFC93C, 16, 4);
          HF.Audio.play('chest');
          HF.Events.emit('chestOpened');
        }
      }
    },

    coinPickup: function () {
      coinStreak++; coinStreakT = 1.2;
      HF.Audio.play('coin', { streak: coinStreak });
    },

    /* chasers that die to mines (hidden achievement) are detected here.
       Own buffer — the shared q may be mid-iteration in the caller. */
    mineChainCheck: function (at) {
      var qm = [];
      HF.Grid.query(at.x, at.y, 6, qm);
      var kills = 0;
      for (var i = 0; i < qm.length; i++) {
        var e = qm[i];
        if (e.alive && e.def.proto === 'chase' && e.state === 1) {
          HF.Particles.burst(e.x, e.y, e.def.colors ? e.def.colors.a : 0x888888, 12, 5);
          HF.Entities.despawn(e);
          kills++;
        }
      }
      if (kills > 0) {
        HF.Save.data.stats.mineKills += kills;
        HF.Save.mark();
        HF.Events.emit('mineKills', kills);
      }
    }
  };
})();

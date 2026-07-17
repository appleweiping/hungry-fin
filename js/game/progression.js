/* ═══════════════════════════════════════════════════════════
   HF.Progress — score, combo, Gold Rush charge feed, XP,
   achievements engine, daily challenges (date-seeded),
   lifetime stats and the end-of-run recap.
   Review rulings baked in: XP ignores combo multipliers;
   coins = floor(score/60); GR charge frozen while active.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Data', 'RNG', 'Player');
  var M = HF.M, D = HF.Data;

  var run = null;

  function freshRun() {
    return {
      score: 0, combo: 0, comboT: 0, bestCombo: 0,
      eaten: 0, humans: 0, orcas: 0, gulls: 0, trawlers: 0,
      goldRushes: 0, airTime: 0, coinsPicked: 0,
      tierEats: {}, startAt: 0, time: 0, distance: 0,
      deepest: 0, cause: '', newRecord: false,
      bossFought: {}, lastX: 0, speciesNew: []
    };
  }

  function comboWindow(c) {
    var w = D.RULES.COMBO_WINDOWS;
    return c >= 25 ? w[2] : c >= 10 ? w[1] : w[0];
  }
  function comboMult(c) {
    var t = D.RULES.COMBO_MULT;
    for (var i = 0; i < t.length; i++) if (c >= t[i][0]) return t[i][1];
    return 1;
  }

  HF.Progress = {
    run: null,

    startRun: function () {
      run = HF.Progress.run = freshRun();
      run.startAt = HF.Time.real;
      run.lastX = HF.Player.x;
      HF.Save.data.stats.runs++;
      HF.Save.mark();
      HF.Progress.ensureDaily();
    },

    comboStage: function () {
      if (!run) return 0;
      var c = run.combo;
      return c >= 70 ? 5 : c >= 40 ? 4 : c >= 20 ? 3 : c >= 10 ? 2 : c >= 5 ? 1 : 0;
    },

    /* raw score add (boss bites, bonuses) — still feeds GR charge */
    addScorePts: function (pts) {
      if (!run) return;
      var gr = HF.Systems.goldRush.active;
      var total = Math.round(pts * (gr ? D.RULES.GR_SCORE_MULT : 1) * (HF.Player.fx.score || 1));
      run.score += total;
      HF.Systems.addCharge(total);
      HF.Events.emit('score', run.score);
      return total;
    },

    onEat: function (def, e, opts) {
      if (!run) return;
      var R = D.RULES;
      /* combo */
      run.combo++;
      run.comboT = comboWindow(run.combo);
      run.bestCombo = Math.max(run.bestCombo, run.combo);
      if (run.combo === 50) HF.Progress.grant('combo50');

      var mult = comboMult(run.combo);
      var gr = opts.gr;
      var pts = def.pts * mult *
        (opts.air ? R.AIR_SCORE_MULT * HF.Systems.petAirScoreMul() : 1) *
        (gr ? R.GR_SCORE_MULT : 1) *
        (HF.Player.fx.score || 1);
      pts = Math.round(pts);
      run.score += pts;
      HF.Systems.addCharge(pts);

      /* XP: base value only — review ruling */
      HF.Player.addXP(def.xp);

      /* tallies */
      run.eaten++;
      run.tierEats[def.tier] = (run.tierEats[def.tier] || 0) + 1;
      var S = HF.Save.data.stats;
      S.eaten++;
      if (def.kind === 'human') { run.humans++; S.swimmers += def.id === 'swimmer' ? 1 : 0; }
      if (def.id === 'orca') run.orcas++;
      if (def.id === 'gull' && opts.air) run.gulls++;
      if (def.id === 'trawler') { run.trawlers++; if (run.trawlers >= 3) HF.Progress.grant('shipSinker'); }
      if (def.id === 'whale') HF.Progress.grant('whaleEat');
      if (S.eaten === 1) HF.Progress.grant('firstBite');
      if (run.eaten >= 100) HF.Progress.grant('feast100');
      HF.Save.mark();

      HF.Events.emit('eat', { def: def, pts: pts, x: e.x, y: e.y, combo: run.combo, air: opts.air });
      HF.Events.emit('score', run.score);
      this.dailyBump(def, opts);
    },

    onBitePartial: function (def) {
      var pts = this.addScorePts(Math.round(def.pts / (def.bites || 1)));
      HF.Events.emit('eat', { def: def, pts: pts, x: HF.Player.mouth.x, y: HF.Player.mouth.y, combo: run.combo, partial: true });
    },

    breakCombo: function (why) {
      if (!run || run.combo === 0) return;
      run.combo = 0; run.comboT = 0;
      HF.Events.emit('comboBreak', why);
    },

    update: function (dt) {
      if (!run || HF.Player.dead) return;
      var P = HF.Player;
      run.time += dt;
      /* combo window ticks down unless GR freezes it */
      if (run.combo > 0 && !HF.Systems.goldRush.active) {
        run.comboT -= dt;
        if (run.comboT <= 0) HF.Progress.breakCombo('timeout');
      }
      if (P.airborne) {
        run.airTime += dt;
        HF.Save.data.stats.airTime = (HF.Save.data.stats.airTime || 0) + dt;
      }
      run.distance += Math.abs(P.x - run.lastX);
      run.lastX = P.x;
      run.deepest = Math.max(run.deepest, -P.y);
      if (run.deepest >= 400) HF.Progress.grant('abyss');
      /* hidden: reef pup surviving the abyss */
      if (P.def.id === 'pup' && HF.World.zoneIndexAt(P.x) === 2) {
        run.pupAbyssT = (run.pupAbyssT || 0) + dt;
        if (run.pupAbyssT > 300) HF.Progress.grant('davidGoliath');
      } else run.pupAbyssT = 0;
    },

    /* big hits break combos (review: damage >= 8 breaks) */
    onHurt: function (amount) {
      if (amount >= D.RULES.COMBO_BREAK_DMG) HF.Progress.breakCombo('hurt');
    },

    endRun: function () {
      if (!run) return null;
      var S = HF.Save.data.stats;
      var coins = Math.floor(run.score / D.RULES.SCORE_TO_COINS);
      HF.Save.addCoins(coins);
      run.convertCoins = coins;
      run.newRecord = run.score > S.bestScore;
      S.bestScore = Math.max(S.bestScore, run.score);
      S.bestCombo = Math.max(S.bestCombo, run.bestCombo);
      S.bestDepth = Math.max(S.bestDepth, Math.round(run.deepest));
      S.bestSurvive = Math.max(S.bestSurvive, run.time);
      S.playTime += run.time;
      S.distance += run.distance;
      S.deaths++;
      /* mastery: 10% of run XP-ish → use score/1000 as proxy feed */
      var sh = HF.Save.data.sharks[HF.Player.def.id];
      if (sh) {
        sh.masteryXP = (sh.masteryXP || 0) + Math.round(run.score / 100);
        var need = [3000, 8000, 18000, 40000, Infinity][Math.min(sh.mastery || 0, 4)];
        while (sh.masteryXP >= need && (sh.mastery || 0) < 5) {
          sh.masteryXP -= need;
          sh.mastery = (sh.mastery || 0) + 1;
          need = [3000, 8000, 18000, 40000, Infinity][Math.min(sh.mastery, 4)];
        }
      }
      /* daily single-run style tasks */
      this.dailySingle(run);
      HF.Save.mark();
      HF.Save.flush();
      return run;
    },

    /* ── achievements ─────────────────────────────────── */
    grant: function (id) {
      var a = HF.Save.data.achievements;
      if (a[id] && a[id].done) return;
      var def = null;
      D.ACHIEVEMENTS.forEach(function (x) { if (x.id === id) def = x; });
      if (!def) return;
      a[id] = { done: true, at: Date.now() };
      HF.Save.addCoins(def.coins);
      HF.Save.mark();
      HF.Events.emit('achievement', def);
    },

    /* stat-goal achievements checked on the fly */
    checkStatAchievements: function () {
      var S = HF.Save.data.stats;
      D.ACHIEVEMENTS.forEach(function (a) {
        if (!a.stat) return;
        var cur = S[a.stat] || 0;
        if (cur >= a.goal) HF.Progress.grant(a.id);
      });
      /* all sharks */
      var all = true;
      D.SHARKS.forEach(function (s) { if (!HF.Save.ownsShark(s.id)) all = false; });
      if (all) HF.Progress.grant('allSharks');
      /* all bosses */
      var b = HF.Save.data.bossKills;
      if (b.moray && b.orcaKing && b.squid) HF.Progress.grant('boss3');
    },

    /* ── daily challenges (deterministic by date) ─────── */
    ensureDaily: function () {
      var d = HF.Save.data.daily;
      var today = HF.RNG.todayKey();
      if (d.date === today && d.tasks.length) return;
      /* streak survives ONLY if yesterday was a full clear — a missed or
         partial day always resets, regardless of when they come back */
      var yesterday = new Date(Date.now() - 864e5);
      var yKey = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
      if (d.lastFullDate !== yKey && d.lastFullDate !== today) d.streak = 0;
      d.date = today;
      d.claimedAll = false;
      var band = Math.min(2, HF.Save.maxOwnedTier() <= 2 ? 0 : HF.Save.maxOwnedTier() <= 4 ? 1 : 2);
      var rng = HF.RNG.mulberry32(HF.RNG.seedFromString('HF-' + today));
      var pool = D.DAILY_TEMPLATES.filter(function (t) { return !(t.minBand && band < t.minBand); });
      var tasks = [];
      var used = {};
      while (tasks.length < 3 && pool.length) {
        var idx = Math.floor(rng() * pool.length);
        var tpl = pool[idx];
        if (used[tpl.id]) { pool.splice(idx, 1); continue; }
        used[tpl.id] = true;
        var prm = tpl.params[band];
        var n = Array.isArray(prm) ? prm[0] : prm;
        var t2 = Array.isArray(prm) ? prm[1] : null;
        tasks.push({
          id: tpl.id, n: n, t: t2, progress: 0, done: false, claimed: false,
          text: tpl.text.replace('{n}', n).replace('{t}', t2 || ''),
          reward: D.DAILY_REWARDS[tasks.length]
        });
      }
      d.tasks = tasks;
      HF.Save.mark();
    },

    dailyBump: function (def, opts) {
      var d = HF.Save.data.daily;
      if (!d.tasks) return;
      d.tasks.forEach(function (t) {
        if (t.done) return;
        var inc = 0;
        switch (t.id) {
          case 'eatHumans': if (def.kind === 'human') inc = 1; break;
          case 'eatTier': if (def.tier === t.t) inc = 1; break;
          case 'orcas': if (def.id === 'orca') inc = 1; break;
          case 'gulls': if (def.id === 'gull' && opts.air) inc = 1; break;
          case 'goldRush': break; /* via event */
        }
        if (inc) HF.Progress.dailyProgress(t, inc);
      });
    },

    dailyProgress: function (t, inc) {
      t.progress += inc;
      if (t.progress >= t.n && !t.done) {
        t.done = true;
        HF.Save.addCoins(t.reward);
        HF.Events.emit('dailyDone', t);
        var d = HF.Save.data.daily;
        if (d.tasks.every(function (x) { return x.done; }) && !d.claimedAll) {
          d.claimedAll = true;
          d.lastFullDate = d.date;
          d.streak++;
          HF.Save.addCoins(D.DAILY_ALL_BONUS + (d.streak % 7 === 0 ? D.DAILY_STREAK_BONUS : 0));
          HF.Events.emit('dailyAllDone', d.streak);
        }
      }
      HF.Save.mark();
    },

    dailySingle: function (run) {
      var d = HF.Save.data.daily;
      if (!d.tasks) return;
      var mins = run.time / 60;
      d.tasks.forEach(function (t) {
        if (t.done) return;
        switch (t.id) {
          case 'score': if (run.score >= t.n) HF.Progress.dailyProgress(t, t.n); break;
          case 'combo': if (run.bestCombo >= t.n) HF.Progress.dailyProgress(t, t.n); break;
          case 'survive': if (mins >= t.n) HF.Progress.dailyProgress(t, t.n); break;
          case 'airTime': HF.Progress.dailyProgress(t, run.airTime); break;
          case 'distance': HF.Progress.dailyProgress(t, run.distance / 1000); break;
          case 'goldRush': HF.Progress.dailyProgress(t, run.goldRushes); break;
        }
      });
    }
  };

  /* event hookups */
  HF.Events.on('playerHurt', function (d) { HF.Progress.onHurt(d.amount); });
  HF.Events.on('goldRushStart', function () {
    if (run) {
      run.goldRushes++;
      if (run.goldRushes >= 3) HF.Progress.grant('gr3');
    }
  });
  HF.Events.on('splashDown', function (airT) { if (airT >= 3.5) HF.Progress.grant('airtime'); });
  HF.Events.on('mineKills', function () { HF.Progress.checkStatAchievements(); });
  HF.Events.on('chestOpened', function () { HF.Progress.checkStatAchievements(); });
  HF.Events.on('bossKilled', function (d) {
    HF.Progress.grant('boss1');
    HF.Progress.checkStatAchievements();
  });
  HF.Events.on('eat', function () { HF.Progress.checkStatAchievements(); });
})();

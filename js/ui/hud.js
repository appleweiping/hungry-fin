/* ═══════════════════════════════════════════════════════════
   HF.HUD — in-run DOM overlay: bars, score, combo, depth,
   boss bar, floating score popups, vignettes, contextual
   FTUE hints. All numbers tween; nothing snaps.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Events', 'Data');
  var M = HF.M;

  var el = {};
  var shownScore = 0, shownCoins = 0;
  var ghostHp = 1;
  var floaterPool = [];
  var hurtT = 0, flashT = 0, heartT = 0;
  var hintT = 0, hintQueue = [], curHint = null;
  var inked = 0;
  var netQTE = 0, netQTEt = 0;   // escape-progress readout (net / squid grab)

  function div(id, parent, cls, html) {
    var d = document.createElement('div');
    if (id) d.id = id;
    if (cls) d.className = cls;
    if (html) d.innerHTML = html;
    (parent || document.body).appendChild(d);
    return d;
  }

  HF.HUD = {
    init: function () {
      var hud = document.getElementById('hud');
      hud.innerHTML =
        '<div class="top-left">' +
        '  <div class="hbar" id="hp-bar"><div class="ghost" id="hp-ghost"></div><div class="fill" id="hp-fill"></div></div>' +
        '  <div class="hbar stam" id="stam-bar"><div class="fill" id="stam-fill"></div></div>' +
        '  <div class="hbar gr" id="gr-bar"><div class="fill" id="gr-fill"></div></div>' +
        '  <div id="lvl-chip">LV <span id="lvl-num">1</span><div class="xpbar"><i id="xp-fill"></i></div></div>' +
        '</div>' +
        '<div class="top-right">' +
        '  <div id="score-num">0</div>' +
        '  <div id="coin-num">🪙 0</div>' +
        '</div>' +
        '<div id="combo"></div>' +
        '<div id="depth"></div>' +
        '<div id="gr-timer"></div>' +
        '<div id="boss-bar-wrap" class="hidden"><div class="bname" id="boss-name"></div>' +
        '  <div class="hbar"><div class="ghost" id="boss-ghost"></div><div class="fill" id="boss-fill" style="background:linear-gradient(90deg,#FF5D5D,#FF9F1C)"></div></div></div>' +
        '<div id="hint" style="opacity:0"></div>' +
        '<div id="pause-btn">⏸</div>';

      ['hp-fill', 'hp-ghost', 'hp-bar', 'stam-fill', 'gr-bar', 'gr-fill', 'score-num', 'coin-num',
        'combo', 'depth', 'gr-timer', 'boss-bar-wrap', 'boss-name', 'boss-fill', 'boss-ghost',
        'lvl-num', 'xp-fill', 'hint', 'pause-btn'].forEach(function (id) { el[id] = document.getElementById(id); });
      el.floaters = document.getElementById('floaters');
      el.vHurt = document.getElementById('vignette-hurt');
      el.vHunger = document.getElementById('vignette-hunger');
      el.vGold = document.getElementById('vignette-gold');
      el.flash = document.getElementById('flash-white');

      for (var i = 0; i < 24; i++) {
        var f = div(null, el.floaters, 'floater');
        f.style.opacity = 0;
        floaterPool.push({ el: f, t: 0, x: 0, y: 0 });
      }

      el['pause-btn'].addEventListener('click', function () { if (HF.Game.state === 'PLAYING') HF.Game.pause(); });

      /* events → visuals */
      HF.Events.on('eat', function (d) {
        var s = HF.Camera.screenFromWorld(d.x, d.y);
        var big = d.pts >= 100;
        HF.HUD.floater('+' + M.fmt(d.pts), s.x, s.y,
          big ? '#FF7B24' : d.pts >= 40 ? '#FFC93C' : '#FFFFFF',
          big ? 26 : d.pts >= 40 ? 20 : 15);
        if (d.air && !d.partial) HF.HUD.floater('AIR ×2!', s.x, s.y - 34, '#9BF6FF', 18);
      });
      HF.Events.on('playerHurt', function () { hurtT = 0.35; });
      HF.Events.on('levelup', function (lvl) {
        HF.Audio.play('levelup');
        var s = HF.Camera.screenFromWorld(HF.Player.x, HF.Player.y - 3);
        HF.HUD.floater('LEVEL ' + lvl + '!', s.x, s.y, '#4CC9F0', 30);
        flashT = 0.12;
      });
      HF.Events.on('goldRushStart', function () { flashT = 0.2; });
      HF.Events.on('bossIntro', function (cfg) {
        el['boss-bar-wrap'].classList.remove('hidden');
        el['boss-name'].textContent = cfg.name;
        el['boss-fill'].style.transform = 'scaleX(1)';
        el['boss-ghost'].style.transform = 'scaleX(1)';
        document.getElementById('cine-bars').classList.add('on');
        setTimeout(function () { document.getElementById('cine-bars').classList.remove('on'); }, 2800);
        HF.HUD.hint(cfg.hint, 6);
      });
      HF.Events.on('bossBar', function (d) {
        if (!d) { el['boss-bar-wrap'].classList.add('hidden'); return; }
        el['boss-fill'].style.transform = 'scaleX(' + d.frac + ')';
        setTimeout(function () { el['boss-ghost'].style.transform = 'scaleX(' + d.frac + ')'; }, 350);
      });
      HF.Events.on('bossLure', function (cfg) {
        HF.HUD.hintOnce('lure_' + cfg.id, (HF.Player.x < cfg.lairX ? '→ ' : '← ') + cfg.name + ' is waiting at its lair…', 5);
      });
      HF.Events.on('inkPhase', function (on) { inked = on ? 1 : 0; });
      HF.Events.on('inkLevel', function (v) { inked = v; });
      HF.Events.on('comboBreak', function (why) {
        if (why === 'sting') {
          var s = HF.Camera.screenFromWorld(HF.Player.x, HF.Player.y);
          HF.HUD.floater('COMBO LOST!', s.x, s.y - 20, '#FF5D5D', 18);
        }
      });
      HF.Events.on('zoneBlocked', function (zi) {
        HF.HUD.hintOnce('gate' + zi, 'You need a bigger shark to hunt out here. (Tier ' + (zi === 1 ? 2 : 3) + '+)', 4);
      });
      HF.Events.on('achievement', function (a) {
        HF.UIScreens.toast('🏆 ' + a.name, (a.real || a.desc) + '  +' + M.fmt(a.coins) + ' 🪙');
        HF.Audio.play('record');
      });
      HF.Events.on('netProgress', function (v) { netQTE = M.clamp01(v); netQTEt = 0.3; });
      HF.Events.on('dailyDone', function (t) {
        HF.UIScreens.toast('📅 Daily complete!', t.text + '  +' + M.fmt(t.reward) + ' 🪙');
      });
      HF.Events.on('netStart', function () { HF.HUD.hint('MASH boost to break free!', 3); });
      HF.Events.on('pressure', function () { HF.HUD.hintOnce('pressure', '⚠ Too deep! This shark can\'t take the pressure.', 4); });
    },

    show: function (on) { document.getElementById('hud').classList.toggle('hidden', !on); },

    floater: function (text, x, y, color, size) {
      var best = floaterPool[0];
      for (var i = 0; i < floaterPool.length; i++) {
        if (floaterPool[i].t <= 0) { best = floaterPool[i]; break; }
        if (floaterPool[i].t < best.t) best = floaterPool[i];
      }
      best.t = 0.85; best.x = x; best.y = y;
      best.el.textContent = text;
      best.el.style.color = color || '#fff';
      best.el.style.fontSize = (size || 16) + 'px';
    },

    hint: function (text, secs) { hintQueue.push({ text: text, secs: secs || 3.5 }); },
    hintOnce: function (key, text, secs) {
      var seen = HF.Save.data.ftue;
      if (seen[key]) return;
      seen[key] = true; HF.Save.mark();
      HF.HUD.hint(text, secs);
    },

    update: function (dt, dtRaw) {
      var P = HF.Player, run = HF.Progress.run;
      if (!P.def || !run) return;

      /* bars */
      var hpFrac = M.clamp01(P.hp / P.maxHp);
      el['hp-fill'].style.transform = 'scaleX(' + hpFrac + ')';
      ghostHp = Math.max(hpFrac, ghostHp - dtRaw * 0.35);
      el['hp-ghost'].style.transform = 'scaleX(' + ghostHp + ')';
      var warn = hpFrac < HF.Data.RULES.HUNGER_WARN;
      el['hp-bar'].classList.toggle('warn', warn);
      el['hp-bar'].classList.toggle('pulse', warn);
      /* while grappled, the stamina bar becomes the ESCAPE meter */
      netQTEt -= dtRaw;
      if (netQTEt > 0) {
        el['stam-fill'].style.transform = 'scaleX(' + netQTE + ')';
        el['stam-fill'].parentElement.classList.add('pulse');
      } else {
        el['stam-fill'].style.transform = 'scaleX(' + M.clamp01(P.stamina / P.staminaMax) + ')';
        el['stam-fill'].parentElement.classList.remove('pulse');
      }
      var gr = HF.Systems.goldRush;
      el['gr-fill'].style.transform = 'scaleX(' + (gr.active ? gr.t / HF.Data.RULES.GR_DURATION : M.clamp01(gr.charge / HF.Data.RULES.GR_CHARGE_MAX)) + ')';
      el['gr-bar'].classList.toggle('full', !gr.active && gr.charge >= HF.Data.RULES.GR_CHARGE_MAX * 0.98);
      el['gr-timer'].textContent = gr.active ? ('GOLD RUSH ' + Math.ceil(gr.t) + 's') : '';

      /* tweened numbers */
      shownScore = shownScore + (run.score - shownScore) * Math.min(1, dtRaw * 8);
      if (Math.abs(shownScore - run.score) < 1) shownScore = run.score;
      el['score-num'].textContent = M.fmt(shownScore);
      var coins = HF.Save.data.coins;
      shownCoins = shownCoins + (coins - shownCoins) * Math.min(1, dtRaw * 8);
      if (Math.abs(shownCoins - coins) < 1) shownCoins = coins;
      el['coin-num'].textContent = '🪙 ' + M.fmt(shownCoins);

      /* level chip */
      el['lvl-num'].textContent = P.level;
      el['xp-fill'].style.width = (P.level >= HF.Data.RULES.MAX_LEVEL ? 100 : M.clamp01(P.xp / P.xpNext) * 100) + '%';

      /* combo */
      var c = run.combo;
      if (c >= 2) {
        el.combo.textContent = '×' + c;
        var stage = HF.Progress.comboStage();
        el.combo.className = stage >= 4 ? 'c5' : stage === 3 ? 'c4' : stage === 2 ? 'c3' : stage === 1 ? 'c2' : '';
        el.combo.style.opacity = 1;
      } else el.combo.style.opacity = 0;

      /* depth gauge */
      el.depth.textContent = Math.max(0, Math.round(-P.y)) + ' m ▾';

      /* floaters drift & fade */
      for (var i = 0; i < floaterPool.length; i++) {
        var f = floaterPool[i];
        if (f.t <= 0) { f.el.style.opacity = 0; continue; }
        f.t -= dtRaw;
        f.y -= dtRaw * 55;
        var k = M.clamp01(f.t / 0.85);
        f.el.style.opacity = k;
        f.el.style.transform = 'translate(' + (f.x - 40) + 'px,' + f.y + 'px) scale(' + (0.8 + 0.2 * k) + ')';
      }

      /* vignettes */
      hurtT = Math.max(0, hurtT - dtRaw);
      el.vHurt.style.opacity = hurtT > 0 ? M.clamp01(hurtT / 0.35) : 0;
      flashT = Math.max(0, flashT - dtRaw);
      el.flash.style.opacity = flashT > 0 ? M.clamp01(flashT / 0.2) * 0.5 : 0;
      el.vGold.style.opacity = gr.active ? 0.8 + 0.2 * Math.sin(HF.Time.now * 4) : 0;

      /* hunger heartbeat panic */
      if (hpFrac < HF.Data.RULES.HUNGER_CRIT && !P.dead) {
        heartT -= dtRaw;
        var period = M.lerp(0.5, 1.2, hpFrac / HF.Data.RULES.HUNGER_CRIT);
        if (heartT <= 0) { heartT = period; HF.Audio.play('heartbeat'); }
        el.vHunger.style.opacity = 0.4 + 0.25 * Math.sin(HF.Time.now * 6);
      } else if (inked > 0) {
        el.vHunger.style.opacity = Math.min(0.92, inked * 0.92);
      } else el.vHunger.style.opacity = 0;

      /* hint queue */
      if (curHint) {
        hintT -= dtRaw;
        if (hintT <= 0) { curHint = null; el.hint.style.opacity = 0; }
      } else if (hintQueue.length) {
        curHint = hintQueue.shift();
        hintT = curHint.secs;
        el.hint.textContent = curHint.text;
        el.hint.style.opacity = 1;
      }
    },

    resetRunUI: function () {
      shownScore = 0; shownCoins = HF.Save.data.coins; ghostHp = 1;
      hintQueue.length = 0; curHint = null; inked = 0;
      el['boss-bar-wrap'].classList.add('hidden');
      el['gr-timer'].textContent = '';
    }
  };
})();

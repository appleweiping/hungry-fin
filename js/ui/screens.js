/* ═══════════════════════════════════════════════════════════
   HF.UIScreens — boot gate, title (attract mode behind it),
   pause, death recap, daily challenges, settings, toasts.
   Static markup only via innerHTML; every dynamic string goes
   through textContent (XSS discipline even for local data).
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Events', 'Data');
  var M = HF.M, D = HF.Data;

  var root = null;
  var current = null;

  var DEATH_QUIPS = {
    hunger: ['The ocean is a buffet — you skipped it.', 'Starved with snacks everywhere. Bold.'],
    mine: ['That was not a beach ball.', 'Boom. Fish confetti.'],
    jelly: ['Pretty lights. Bad idea.', 'Hugged by 10,000 volts of pudding.'],
    poison: ['That fish had opinions.', 'Spicy. Too spicy.'],
    pressure: ['The abyss pressed back.', 'Should have brought a bigger shark.'],
    net: ['Caught like a common cod.', 'The one that didn\'t get away.'],
    boss: ['The apex stays apex. For now.', 'You met the landlord of this reef.'],
    orca: ['Outranked by a black-and-white bus.'],
    sub: ['Harpooned by a very rude kettle.'],
    reefshark: ['Bitten by middle management.'],
    sword: ['Fenced. Lost.'],
    angler: ['Followed the pretty light.'],
    shock: ['A crackling last impression.'],
    vent: ['Flash-boiled. Al dente.'],
    puffer: ['Hugged a cactus of the sea.']
  };

  function show(html) {
    root.innerHTML = '';
    var sc = document.createElement('div');
    sc.className = 'screen dim';
    sc.innerHTML = html;
    root.appendChild(sc);
    current = sc;
    return sc;
  }
  function clear() { root.innerHTML = ''; current = null; }

  HF.UIScreens = {
    init: function () {
      root = document.getElementById('screens');

      /* boot gate: the audio-unlock click */
      var boot = document.getElementById('boot');
      document.getElementById('boot-start').addEventListener('click', function () {
        HF.Audio.unlock();
        boot.classList.add('hidden');
        HF.Game.toTitle();
      });
      HF.Events.on('quality', function (q) {
        HF.UIScreens.toast('⚙ Performance mode: ' + ['Low', 'Medium', 'High'][q], 'auto-adjusted to keep 60 fps');
      });
    },

    clear: clear,

    /* ── title ── */
    title: function () {
      var sc = show(
        '<div id="title-wrap">' +
        '  <h1>BRINEFIN</h1>' +
        '  <div class="tagline">Eat. Grow. Survive.</div>' +
        '  <div class="row">' +
        '    <button class="btn btn-gold btn-big btn-pulse" id="bt-play">▶ &nbsp;Hunt</button>' +
        '  </div>' +
        '  <div class="row">' +
        '    <button class="btn" id="bt-shop">🦈 Shark Shop</button>' +
        '    <button class="btn" id="bt-daily">📅 Daily</button>' +
        '    <button class="btn" id="bt-settings">⚙</button>' +
        '  </div>' +
        '</div>' +
        '<div id="title-foot"><span id="tf-best"></span><span>v' + HF.VERSION + ' · open source 🌊</span></div>'
      );
      sc.classList.remove('dim');   // attract mode visible behind
      var best = HF.Save.data.stats.bestScore;
      sc.querySelector('#tf-best').textContent = best > 0 ? ('Best score  ' + M.fmt(best)) : 'Your first bite is a few metres ahead.';
      sc.querySelector('#bt-play').addEventListener('click', function () { HF.Audio.play('confirm'); HF.Game.startRun(); });
      sc.querySelector('#bt-shop').addEventListener('click', function () { HF.Audio.play('click'); HF.Shop.open(); });
      sc.querySelector('#bt-daily').addEventListener('click', function () { HF.Audio.play('click'); HF.UIScreens.daily(); });
      sc.querySelector('#bt-settings').addEventListener('click', function () { HF.Audio.play('click'); HF.UIScreens.settings(); });
    },

    /* ── pause ── */
    pause: function () {
      var sc = show(
        '<div class="panel" style="text-align:center">' +
        '  <h2>Paused</h2>' +
        '  <div class="row"><button class="btn btn-gold btn-big" id="bt-resume">Resume</button></div>' +
        '  <div class="row">' +
        '    <label style="color:var(--c-text-dim);font-size:13px">SFX <input type="range" id="sl-sfx" min="0" max="1" step="0.05"></label>' +
        '    <label style="color:var(--c-text-dim);font-size:13px">Music <input type="range" id="sl-music" min="0" max="1" step="0.05"></label>' +
        '  </div>' +
        '  <div class="row"><button class="btn" id="bt-quit">Abandon Run</button></div>' +
        '</div>'
      );
      wireVolume(sc);
      sc.querySelector('#bt-resume').addEventListener('click', function () { HF.Audio.play('click'); HF.Game.resume(); });
      sc.querySelector('#bt-quit').addEventListener('click', function () { HF.Audio.play('click'); HF.Game.abandon(); });
    },

    /* ── countdown after resume ── */
    countdown: function (done) {
      var sc = show('<div style="font-family:var(--font-display);font-size:90px;color:#fff;text-shadow:0 4px 20px #000" id="cd">3</div>');
      sc.classList.remove('dim');
      var n = 3;
      var iv = setInterval(function () {
        n--;
        HF.Audio.play('countdown');
        if (n <= 0) { clearInterval(iv); clear(); done(); }
        else sc.querySelector('#cd').textContent = n;
      }, 450);
    },

    /* ── death recap ── */
    death: function (run) {
      var quips = DEATH_QUIPS[run.cause] || DEATH_QUIPS.boss;
      var sc = show(
        '<div class="panel" style="min-width:380px">' +
        '  <h2 id="d-title">You got eaten!</h2>' +
        '  <div class="sub" id="d-quip"></div>' +
        '  <div id="d-lines"></div>' +
        '  <div id="d-banner"></div>' +
        '  <div class="row">' +
        '    <button class="btn btn-gold btn-big" id="bt-again">↻ &nbsp;Hunt Again</button>' +
        '  </div>' +
        '  <div class="row">' +
        '    <button class="btn" id="bt-shop2">🦈 Shop</button>' +
        '    <button class="btn" id="bt-title">Title</button>' +
        '  </div>' +
        '</div>'
      );
      var titles = { hunger: 'You starved!', mine: 'BOOM.', net: 'Netted!', pressure: 'Crushed by the deep!', poison: 'Poisoned!', jelly: 'Stung out!' };
      sc.querySelector('#d-title').textContent = titles[run.cause] || 'You got eaten!';
      sc.querySelector('#d-quip').textContent = M.pick(quips);

      var lines = [
        ['Score', M.fmt(run.score)],
        ['Best combo', '×' + run.bestCombo],
        ['Creatures eaten', M.fmt(run.eaten)],
        ['Deepest dive', Math.round(run.deepest) + ' m'],
        ['Survived', Math.floor(run.time / 60) + ':' + String(Math.floor(run.time % 60)).padStart(2, '0')],
        ['Coins from score', '+' + M.fmt(run.convertCoins) + ' 🪙'],
        ['Coins picked up', '+' + M.fmt(run.coinsPicked) + ' 🪙']
      ];
      var wrap = sc.querySelector('#d-lines');
      lines.forEach(function (l, i) {
        var d = document.createElement('div');
        d.className = 'recap-line';
        d.style.animationDelay = (i * 0.13) + 's';
        var a = document.createElement('span'); a.textContent = l[0];
        var b = document.createElement('b'); b.textContent = l[1];
        d.appendChild(a); d.appendChild(b);
        wrap.appendChild(d);
      });
      if (run.newRecord) {
        var ban = document.createElement('div');
        ban.className = 'recap-banner';
        ban.textContent = '★ NEW RECORD! ★';
        sc.querySelector('#d-banner').appendChild(ban);
        HF.Audio.play('record');
      }
      sc.querySelector('#bt-again').addEventListener('click', function () { HF.Audio.play('confirm'); HF.Game.startRun(); });
      sc.querySelector('#bt-shop2').addEventListener('click', function () { HF.Audio.play('click'); HF.Shop.open(true); });
      sc.querySelector('#bt-title').addEventListener('click', function () { HF.Audio.play('click'); HF.Game.toTitle(); });
    },

    /* ── daily challenges ── */
    daily: function () {
      HF.Progress.ensureDaily();
      var d = HF.Save.data.daily;
      var sc = show(
        '<div class="panel" style="min-width:400px">' +
        '  <h2>📅 Daily Challenges</h2>' +
        '  <div class="sub" id="dl-sub"></div>' +
        '  <div id="dl-cards"></div>' +
        '  <div class="sub" id="dl-streak" style="margin-top:10px"></div>' +
        '  <div class="row"><button class="btn btn-gold" id="bt-back">Back</button></div>' +
        '</div>'
      );
      var now = new Date();
      var midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
      var left = (midnight - now) / 1000;
      sc.querySelector('#dl-sub').textContent = 'Same tasks for everyone today · resets in ' +
        Math.floor(left / 3600) + 'h ' + Math.floor((left % 3600) / 60) + 'm';
      var cards = sc.querySelector('#dl-cards');
      d.tasks.forEach(function (t) {
        var card = document.createElement('div');
        card.className = 'daily-card' + (t.done ? ' done' : '');
        var left2 = document.createElement('div');
        left2.style.flex = '1';
        var txt = document.createElement('div');
        txt.textContent = (t.done ? '✅ ' : '') + t.text;
        var bar = document.createElement('div'); bar.className = 'bar';
        var fill = document.createElement('i');
        fill.style.width = Math.min(100, (t.progress / t.n) * 100) + '%';
        bar.appendChild(fill);
        left2.appendChild(txt); left2.appendChild(bar);
        var rw = document.createElement('div');
        rw.className = 'coin-chip';
        rw.textContent = '+' + M.fmt(t.reward) + ' 🪙';
        card.appendChild(left2); card.appendChild(rw);
        cards.appendChild(card);
      });
      sc.querySelector('#dl-streak').textContent =
        d.streak > 0 ? ('🔥 Full-clear streak: ' + d.streak + ' day' + (d.streak > 1 ? 's' : '') + ' (bonus every 7)') :
          'Clear all three for a +' + M.fmt(D.DAILY_ALL_BONUS) + ' 🪙 bonus';
      sc.querySelector('#bt-back').addEventListener('click', function () { HF.Audio.play('click'); HF.Game.toTitle(); });
    },

    /* ── settings ── */
    settings: function () {
      var sc = show(
        '<div class="panel" style="text-align:center">' +
        '  <h2>⚙ Settings</h2>' +
        '  <div class="row">' +
        '    <label style="color:var(--c-text-dim)">SFX <input type="range" id="sl-sfx" min="0" max="1" step="0.05"></label>' +
        '    <label style="color:var(--c-text-dim)">Music <input type="range" id="sl-music" min="0" max="1" step="0.05"></label>' +
        '  </div>' +
        '  <div class="row"><label style="color:var(--c-text-dim)">Quality ' +
        '    <select id="sel-q"><option value="0">Low</option><option value="1">Medium</option><option value="2">High</option></select></label>' +
        '  </div>' +
        '  <div class="row"><button class="btn btn-danger" id="bt-wipe">Erase Save</button></div>' +
        '  <div class="row"><button class="btn btn-gold" id="bt-back">Back</button></div>' +
        '</div>'
      );
      wireVolume(sc);
      var q = sc.querySelector('#sel-q');
      q.value = String(HF.Engine.quality());
      q.addEventListener('change', function () {
        HF.Engine.setQuality(parseInt(q.value, 10));
        HF.Save.data.settings.quality = parseInt(q.value, 10);
        HF.Save.mark();
      });
      var wiped = false;
      sc.querySelector('#bt-wipe').addEventListener('click', function (ev) {
        if (!wiped) { ev.target.textContent = 'Really erase everything?'; wiped = true; return; }
        HF.Save.wipe();
        location.reload();
      });
      sc.querySelector('#bt-back').addEventListener('click', function () { HF.Audio.play('click'); HF.Game.toTitle(); });
    },

    /* ── toasts ── */
    toast: function (title, sub) {
      var wrap = document.getElementById('toasts');
      var t = document.createElement('div');
      t.className = 'toast';
      var a = document.createElement('div'); a.textContent = title;
      t.appendChild(a);
      if (sub) { var b = document.createElement('div'); b.className = 't-sub'; b.textContent = sub; t.appendChild(b); }
      wrap.appendChild(t);
      setTimeout(function () {
        t.style.transition = 'opacity .4s, transform .4s';
        t.style.opacity = 0; t.style.transform = 'translateY(-10px)';
        setTimeout(function () { wrap.removeChild(t); }, 450);
      }, 3400);
    }
  };

  function wireVolume(sc) {
    var sfx = sc.querySelector('#sl-sfx'), mus = sc.querySelector('#sl-music');
    sfx.value = HF.Audio.getVolume('sfx'); mus.value = HF.Audio.getVolume('music');
    sfx.addEventListener('input', function () {
      HF.Audio.setVolume('sfx', parseFloat(sfx.value));
      HF.Save.data.settings.sfx = parseFloat(sfx.value); HF.Save.mark();
    });
    sfx.addEventListener('change', function () { HF.Audio.play('bite'); });
    mus.addEventListener('input', function () {
      HF.Audio.setVolume('music', parseFloat(mus.value));
      HF.Save.data.settings.music = parseFloat(mus.value); HF.Save.mark();
    });
  }
})();

/* ═══════════════════════════════════════════════════════════
   HF.Boss — shared apex-predator framework.
   One phase machine + three verbs (telegraph attack / stun
   weak-point window / add minions) drives all three bosses;
   each boss is a config + a small attack function, per the
   review's "shared framework, no three snowflakes" ruling.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Data', 'Player', 'Entities', 'ModelKit', 'Materials');
  var M = HF.M, D = HF.Data, K = HF.ModelKit;

  var active = null;        // current fight
  var lairsReady = {};      // bossId -> lair prop group
  var qbuf = [];

  /* ─────────────────────────────────────────────────────── */
  function bossDef(id) { for (var i = 0; i < D.BOSSES.length; i++) if (D.BOSSES[i].id === id) return D.BOSSES[i]; }

  function makeWeakGlow(radius) {
    var s = HF.Materials.glowSprite(0xFFD166, radius * 3, 0.0);
    return s;
  }

  /* ── boss model builders (original designs) ───────────── */
  function buildMoray() {
    var C = HF.Palette.boss.moray;
    var g = new THREE.Group();
    var body = K.mesh(K.merge([
      K.loft([
        { x: -6, ry: 0.7, rz: 0.9 }, { x: -2, ry: 0.9, rz: 1.2 },
        { x: 0.5, ry: 1.0, rz: 1.35 }, { x: 2.4, ry: 0.8, rz: 1.0 }
      ], K.duoTone(C.a, C.b), 8),
      K.xform(K.fin([[0, 0], [-5, 1.4], [-6.5, 0]], 0.1, C.a), 0, 1.2, 0)
    ]));
    var jaw = K.mesh(K.merge([
      K.loft([{ x: 0, ry: 0.7, rz: 0.3 }, { x: 1.6, ry: 0.4, rz: 0.2 }], K.duoTone(C.b, C.b), 6),
      teeth(1.4, 0.55, 5)
    ]));
    jaw.position.set(1.6, -0.6, 0);
    var eyeL = K.mesh(K.sphere(0.22, 0xFFD166, 6)); eyeL.position.set(1.8, 0.6, 0.7);
    var eyeR = eyeL.clone(); eyeR.position.z = -0.7;
    g.add(body, jaw, eyeL, eyeR);
    return { group: g, jaw: jaw, r: 1.6 };
  }
  function buildOrcaKing() {
    var C = HF.Palette.boss.orcaKing;
    var g = new THREE.Group();
    var mesh = K.mesh(HF.Builders.geoFor({ kind: 'orca', len: 9, colors: { a: C.a, b: C.b } }));
    var crown = K.mesh(K.merge([0, 1, 2].map(function (i) {
      return K.xform(K.cone(0.25, 1.1 - Math.abs(i - 1) * 0.3, 0xFFC93C, 4), (i - 1) * 0.6, 2.2, 0);
    })));
    crown.position.x = 0.4;
    /* battle scars */
    var scar = K.mesh(K.xform(K.box(1.6, 0.12, 0.1, 0xFF5D5D), 2.4, 0.8, 0.9, 0, 0, 0.5));
    g.add(mesh, crown, scar);
    return { group: g, r: 2.4 };
  }
  function buildSquid() {
    var C = HF.Palette.boss.squid;
    var g = new THREE.Group();
    var mantle = K.mesh(K.merge([
      K.xform(K.cone(2.6, 7, C.a, 8), 0, 5.2, 0),
      K.xform(K.sphere(2.4, C.a, 8), 0, 1.4, 0)
    ]));
    var eye = K.mesh(K.sphere(1.1, C.eye, 9));
    eye.position.set(0, 1.2, 2.0);
    var pupil = K.mesh(K.sphere(0.5, 0x0A0E14, 7));
    pupil.position.set(0, 1.2, 2.9);
    var eyeGlow = HF.Materials.glowSprite(C.eye, 6, 0.25);
    eyeGlow.position.copy(eye.position);
    g.add(mantle, eye, pupil, eyeGlow);
    var tentacles = [];
    for (var i = 0; i < 4; i++) {
      var t = new THREE.Group();
      var arm = K.mesh(K.merge([
        K.xform(K.cyl(0.55, 0.22, 9, C.a, 6), 0, -4.5, 0),
        K.xform(K.sphere(0.6, C.weak, 6), 0, -9, 0)
      ]));
      t.add(arm);
      var tipGlow = HF.Materials.glowSprite(C.weak, 3.4, 0.5);
      tipGlow.position.set(0, -9, 0);
      t.add(tipGlow);
      t.position.set((i - 1.5) * 2.2, 0.5, (i % 2 ? 1 : -1) * 0.8);
      t.userData.tip = { ox: (i - 1.5) * 2.2, glow: tipGlow };
      g.add(t);
      tentacles.push(t);
    }
    return { group: g, tentacles: tentacles, eye: eye, r: 2.8 };
  }
  function teeth(w, y, n) {
    var t = [];
    for (var i = 0; i < n; i++) {
      t.push(K.xform(K.cone(0.09, 0.35, 0xF2F5F7, 4), 0.3 + i * 0.28, y, 0.35));
      t.push(K.xform(K.cone(0.09, 0.35, 0xF2F5F7, 4), 0.3 + i * 0.28, y, -0.35));
    }
    return K.merge(t);
  }

  /* ── fight object ─────────────────────────────────────── */
  function startFight(id) {
    var cfg = bossDef(id);
    var built = id === 'moray' ? buildMoray() : id === 'orcaKing' ? buildOrcaKing() : buildSquid();
    active = {
      id: id, cfg: cfg, built: built, group: built.group,
      bitesLeft: cfg.bites, phase: 0,
      state: 'intro', t: 0, biteCd: 0,
      x: cfg.lairX, y: 0, vx: 0, vy: 0, dir: -1,
      weakOpen: false, weakX: 0, weakY: 0, weakR: 1.6,
      glow: makeWeakGlow(1.6),
      /* squid extras */
      tentaclesLeft: 4, ink: 0, grabT: 0,
      /* orca extras */
      minionWave: 0,
      chargeFrom: null, chargeTo: null,
      holes: []
    };
    var floor = HF.World.floorY(cfg.lairX);
    if (id === 'moray') {
      active.y = floor + 3;
      /* four lunge holes around the lair */
      for (var h = 0; h < 4; h++) active.holes.push({ x: cfg.lairX - 24 + h * 16, y: floor + 2.5 + (h % 2) * 9 });
      /* ensure some puffers hang around the arena */
      for (var p = 0; p < 3; p++) {
        var pe = HF.Entities.spawn('puffer', cfg.lairX - 16 + p * 12, floor + 7 + p * 3);
        if (pe) pe.arena = true;
      }
    } else if (id === 'orcaKing') {
      active.y = -14;
      /* mast obstacles */
      active.masts = [];
      for (var m2 = 0; m2 < 3; m2++) {
        var mx = cfg.lairX - 30 + m2 * 28;
        var mastGroup = K.mesh(K.merge([
          K.xform(K.cyl(0.4, 0.55, 26, 0x5C4A38, 6), 0, -13, 0),
          K.xform(K.box(5, 0.5, 0.5, 0x5C4A38), 0, -6, 0)
        ]));
        mastGroup.position.set(mx, HF.Water.heightAt(mx), 0);
        HF.World.scene.add(mastGroup);
        active.masts.push({ x: mx, mesh: mastGroup });
      }
    } else {
      active.y = floor + 12;
    }
    active.group.position.set(active.x, active.y, 0);
    active.glow.position.set(0, 0, 1);
    HF.World.scene.add(active.group, active.glow);

    /* review ruling: boss entry cancels GR with refund */
    if (HF.Systems.goldRush.active) HF.Systems.endGoldRush(true);

    HF.Audio.play('roar');
    HF.Camera.addTrauma(0.6);
    HF.Camera.setCine(active.x, active.y, 46);
    HF.Time.set('cine', 0.25, 2.6);
    HF.Events.emit('bossIntro', cfg);
  }

  function endFight(win) {
    if (!active) return;
    var cfg = active.cfg;
    HF.World.scene.remove(active.group, active.glow);
    HF.Materials.disposeGroup(active.group);
    if (active.masts) active.masts.forEach(function (m) {
      HF.World.scene.remove(m.mesh);
      HF.Materials.disposeGroup(m.mesh);
    });
    HF.Events.emit('bossBar', null);
    HF.Events.emit('inkPhase', false);
    if (win) {
      var kills = HF.Save.data.bossKills[cfg.id] || 0;
      var first = kills === 0;
      HF.Save.data.bossKills[cfg.id] = kills + 1;
      HF.Save.mark();
      var reward = first ? cfg.rewardFirst : cfg.rewardDaily;
      HF.Systems.dropCoins(active.x, active.y, Math.min(reward, 400));
      HF.Save.addCoins(Math.max(0, reward - 400));
      HF.Progress.addScorePts(2500);
      if (first && cfg.unlock) {
        if (cfg.unlock.cosmetic) {
          HF.Save.data.cosmeticsOwned[cfg.unlock.cosmetic] = true;
          HF.Save.mark();
          HF.UIScreens.toast('🎁 Trophy unlocked!', 'Check the Style tab in the shop');
        }
        /* pet unlocks are gated in the shop via needBoss — nothing to grant here */
      }
      HF.Particles.burst(active.x, active.y, 0xFFC93C, 30, 8);
      HF.Audio.play('unlock');
      HF.Events.emit('bossKilled', { id: cfg.id, first: first, reward: reward });
    }
    active = null;
  }

  /* one confirmed player bite on the weak point */
  function biteBoss() {
    var a = active;
    a.bitesLeft--;
    a.biteCd = 0.45;
    HF.Player.chomp(); HF.Player.biteRefund();
    HF.Time.hitstop(0.12);
    HF.Audio.play('bite', { big: true });
    HF.Particles.burst(a.weakX, a.weakY, 0xFFD166, 14, 5);
    HF.Camera.addTrauma(0.3);
    HF.Progress.addScorePts(500);
    HF.Events.emit('bossBar', { name: a.cfg.name, frac: a.bitesLeft / a.cfg.bites });
    var phaseSize = Math.ceil(a.cfg.bites / a.cfg.phases);
    var newPhase = Math.floor((a.cfg.bites - a.bitesLeft) / phaseSize);
    if (newPhase > a.phase) {
      a.phase = newPhase;
      HF.Audio.play('roar');
      HF.Camera.addTrauma(0.5);
      if (a.id === 'orcaKing') spawnMinions(a);
    }
    if (a.bitesLeft <= 0) endFight(true);
  }

  function spawnMinions(a) {
    for (var i = 0; i < 2; i++) HF.Entities.spawn('orca', a.x + M.rand(-14, 14), a.y + M.rand(-6, 6));
  }

  function hurtPlayerOnContact(a, r, dmg, cause, knockScale) {
    var P = HF.Player;
    var rr = r + P.lenScaled * 0.28;
    if (M.dist2(a.x, a.y, P.x, P.y) < rr * rr && P.iframes <= 0) {
      P.takeDamage(dmg, cause, { knock: { x: (P.x - a.x) * (knockScale || 1.2), y: 2 } });
    }
  }

  /* ── per-boss brains (config + one attack verb each) ──── */
  var BRAINS = {
    moray: function (a, dt) {
      var P = HF.Player;
      switch (a.state) {
        case 'idle':   // hidden in lair
          a.group.visible = false;
          a.t += dt;
          if (a.t > (a.phase >= 2 ? 0.9 : 1.5)) { a.state = 'telegraph'; a.t = 0; a.hole = M.pick(a.holes); }
          break;
        case 'telegraph':
          a.group.visible = true;
          a.x = a.hole.x; a.y = a.hole.y;
          a.dir = P.x > a.x ? 1 : -1;
          a.t += dt;
          /* head pokes out, shivering */
          a.group.position.set(a.x + Math.sin(a.t * 40) * 0.15, a.y, 0);
          if (Math.floor(a.t * 10) % 3 === 0) HF.Particles.bubbles(a.x, a.y + 1, 1, 1, 2);
          if (a.t > 0.8) {
            a.state = 'lunge'; a.t = 0;
            a.lungeDir = Math.atan2(P.y - a.y, P.x - a.x);
            HF.Audio.play('swoosh');
          }
          break;
        case 'lunge':
          a.t += dt;
          var sp = a.phase >= 1 ? 34 : 27;
          a.x += Math.cos(a.lungeDir) * sp * dt;
          a.y += Math.sin(a.lungeDir) * sp * dt;
          hurtPlayerOnContact(a, a.built.r, a.cfg.lungeDmg, 'boss');
          /* the trick: bite a puffer mid-lunge → self-stun */
          HF.Grid.query(a.x, a.y, 2.4, qbuf);
          for (var i = 0; i < qbuf.length; i++) {
            if (qbuf[i].def.id === 'puffer') {
              HF.Entities.despawn(qbuf[i]);
              a.state = 'stunned'; a.t = 0;
              HF.Particles.burst(a.x, a.y, 0xE9C46A, 20, 6);
              HF.Audio.play('explosion');
              HF.Camera.addTrauma(0.4);
              break;
            }
          }
          if (a.t > 1.4) { a.state = 'retreat'; a.t = 0; }
          break;
        case 'stunned':
          a.t += dt;
          a.weakOpen = true;
          a.weakX = a.x + a.dir * 1.6; a.weakY = a.y + 0.6;
          a.group.rotation.z = Math.sin(a.t * 6) * 0.12;
          if (a.t > a.cfg.stun) { a.state = 'retreat'; a.t = 0; a.weakOpen = false; }
          break;
        case 'retreat':
          a.t += dt;
          a.y -= dt * 10;
          a.group.visible = a.t < 0.6;
          if (a.t > 0.8) { a.state = 'idle'; a.t = 0; }
          break;
      }
      a.group.position.x = a.x; a.group.position.y = a.y;
      a.group.rotation.y = a.dir < 0 ? Math.PI : 0;
      /* keep puffer bait stocked */
      if (Math.random() < dt * 0.3) {
        HF.Grid.query(a.cfg.lairX, HF.World.floorY(a.cfg.lairX) + 8, 30, qbuf);
        var puffers = 0;
        for (var p = 0; p < qbuf.length; p++) if (qbuf[p].def.id === 'puffer') puffers++;
        if (puffers < 2) HF.Entities.spawn('puffer', a.cfg.lairX + M.rand(-18, 18), HF.World.floorY(a.cfg.lairX) + M.rand(5, 12));
      }
    },

    orcaKing: function (a, dt) {
      var P = HF.Player;
      switch (a.state) {
        case 'idle':   // circle the player menacingly
          a.t += dt;
          var ang = a.t * 0.7;
          var tx = P.x + Math.cos(ang) * 24, ty = M.clamp(P.y + Math.sin(ang) * 10, -30, -2);
          a.vx = M.damp(a.vx, (tx - a.x) * 1.2, 2, dt);
          a.vy = M.damp(a.vy, (ty - a.y) * 1.2, 2, dt);
          a.x += a.vx * dt; a.y += a.vy * dt;
          if (a.t > (a.phase >= 2 ? 2.2 : 3.2)) { a.state = 'telegraph'; a.t = 0; }
          break;
        case 'telegraph':   // freeze, aim at player's CURRENT spot
          a.t += dt;
          a.dir = P.x > a.x ? 1 : -1;
          a.group.position.x = a.x + Math.sin(a.t * 30) * 0.2;
          if (a.t > 0.9) {
            a.state = 'charge'; a.t = 0;
            var dl = M.dist(a.x, a.y, P.x, P.y) || 1;
            a.chargeVX = (P.x - a.x) / dl * 30;
            a.chargeVY = (P.y - a.y) / dl * 30;
            HF.Audio.play('swoosh');
          }
          break;
        case 'charge':
          a.t += dt;
          a.x += a.chargeVX * dt; a.y += a.chargeVY * dt;
          if (Math.random() < dt * 20) HF.Particles.bubbles(a.x, a.y, 2, 1.2, 1);
          hurtPlayerOnContact(a, a.built.r, a.cfg.chargeDmg, 'boss', 2);
          /* smash into a mast → stun */
          for (var mi = 0; mi < a.masts.length; mi++) {
            var mst = a.masts[mi];
            if (Math.abs(a.x - mst.x) < 2.2 && a.y > -26) {
              a.state = 'stunned'; a.t = 0;
              mst.mesh.rotation.z += (a.chargeVX > 0 ? -1 : 1) * 0.15;
              HF.Particles.burst(a.x, a.y, 0x5C4A38, 22, 7);
              HF.Audio.play('explosion');
              HF.Camera.addTrauma(0.6);
              break;
            }
          }
          if (a.t > 1.6) { a.state = 'idle'; a.t = 0; }
          if (a.y > -1.2) a.y = -1.2;
          if (a.y < -34) a.y = -34;
          break;
        case 'stunned':
          a.t += dt;
          a.weakOpen = true;
          a.weakX = a.x; a.weakY = a.y - 1.6;
          a.group.rotation.z = Math.sin(a.t * 5) * 0.2 + 0.5;
          if (a.t > a.cfg.stun) { a.state = 'idle'; a.t = 0; a.weakOpen = false; a.group.rotation.z = 0; }
          break;
      }
      if (a.state !== 'telegraph') a.group.position.x = a.x;
      a.group.position.y = a.y;
      if (Math.abs(a.vx) > 0.2 && a.state === 'idle') a.dir = a.vx < 0 ? -1 : 1;
      a.group.rotation.y = a.dir < 0 ? Math.PI : 0;
    },

    squid: function (a, dt) {
      var P = HF.Player;
      a.t += dt;
      a.group.position.y = a.y + Math.sin(a.t * 0.8) * 1.2;
      /* tentacle slam cycle */
      a.slamT = (a.slamT || 0) - dt;
      if (a.slamT <= 0 && a.tentaclesLeft > 0 && a.state !== 'grab') {
        a.slamT = a.phase >= 1 ? 2.2 : 3.0;
        a.slamTarget = { x: P.x, y: P.y };
        a.slamProg = 0;
      }
      if (a.slamTarget) {
        a.slamProg += dt;
        if (a.slamProg > 0.8 && a.slamProg < 1.1) {
          /* sweep hits a disc around the target */
          if (M.dist2(P.x, P.y, a.slamTarget.x, a.slamTarget.y) < 16 && P.iframes <= 0) {
            P.takeDamage(a.cfg.slamDmg, 'boss', { knock: { x: (P.x - a.x) * 2, y: 3 } });
          }
          if (a.slamProg < 0.85) {
            HF.Particles.burst(a.slamTarget.x, a.slamTarget.y, 0x4A1E5C, 12, 5);
            HF.Camera.addTrauma(0.25);
            HF.Audio.play('swoosh');
          }
        }
        if (a.slamProg > 1.4) a.slamTarget = null;
      }
      /* grab when player hugs the mantle */
      if (a.state !== 'grab' && M.dist2(P.x, P.y, a.x, a.y) < 36 && Math.random() < dt * 0.5 && a.tentaclesLeft > 0) {
        a.state = 'grab'; a.grabT = 0;
        HF.Input.consumeStruggles();
      }
      if (a.state === 'grab') {
        a.grabT += dt;
        P.x = M.damp(P.x, a.x, 4, dt);
        P.y = M.damp(P.y, a.y - 3, 4, dt);
        P.hp -= a.cfg.grabDps * dt;
        if (P.hp <= 0) { P.die('boss'); a.state = 'idle'; }
        var taps = HF.Input.consumeStruggles();
        a.grabProg = (a.grabProg || 0) + taps * 0.15 - dt * 0.05;
        HF.Events.emit('netProgress', a.grabProg);
        if (a.grabProg >= 1) {
          a.state = 'idle'; a.grabProg = 0;
          P.vy = -8; P.vx = (P.x - a.x) * 3;
          HF.Particles.burst(P.x, P.y, 0x8E44AD, 14, 6);
        }
      }
      /* weak points: glowing tentacle tips, then the eye */
      a.weakOpen = true;
      if (a.tentaclesLeft > 0) {
        var t = a.built.tentacles[4 - a.tentaclesLeft];
        /* compute the tip in-place: localToWorld would use LAST frame's
           matrixWorld (update runs before render) and allocate per frame */
        var rz = t.rotation.z;
        a.weakX = a.x + t.position.x + 9 * Math.sin(rz);
        a.weakY = a.group.position.y + t.position.y - 9 * Math.cos(rz);
        a.weakR = 2.0;
        /* wave the arms */
        a.built.tentacles.forEach(function (tt, ti) {
          tt.rotation.z = Math.sin(a.t * 1.3 + ti * 1.7) * 0.35;
        });
        /* ink phase transition */
        var bitesIntoTentacles = a.cfg.bites - a.bitesLeft;
        var perTent = 3;
        var downed = Math.floor(bitesIntoTentacles / perTent);
        if (4 - downed < a.tentaclesLeft) {
          a.tentaclesLeft = 4 - downed;
          if (a.tentaclesLeft >= 0 && a.built.tentacles[3 - a.tentaclesLeft]) {
            a.built.tentacles[3 - a.tentaclesLeft].visible = false;
          }
          if (a.tentaclesLeft === 0) {
            a.ink = 1;
            HF.Events.emit('inkPhase', true);
            HF.Audio.play('roar');
          }
        }
      } else {
        /* eye phase; ink fades as the player eats anything */
        a.weakX = a.x; a.weakY = a.y + 1.2; a.weakR = 1.6;
        if (a.ink > 0) {
          HF.Events.emit('inkLevel', a.ink);
        }
      }
    }
  };

  HF.Events.on('eat', function () {
    if (active && active.id === 'squid' && active.ink > 0) {
      active.ink = Math.max(0, active.ink - 0.25);
      HF.Events.emit('inkLevel', active.ink);
      if (active.ink === 0) HF.Events.emit('inkPhase', false);
    }
  });

  /* ── public ───────────────────────────────────────────── */
  HF.Boss = {
    active: function () { return active; },

    reset: function () { if (active) { endFight(false); } HF.Events.emit('inkPhase', false); },

    /* trigger checks — called from progression on relevant events */
    maybeTrigger: function () {
      if (active) return;
      var P = HF.Player, run = HF.Progress.run;
      for (var i = 0; i < D.BOSSES.length; i++) {
        var cfg = D.BOSSES[i];
        if (run.bossFought[cfg.id]) continue;
        var zi = HF.World.zoneIndexAt(P.x);
        if (cfg.trigger.score && run.score >= cfg.trigger.score && zi === cfg.zone) {
          if (Math.abs(P.x - cfg.lairX) < 26) {
            run.bossFought[cfg.id] = true;
            startFight(cfg.id);
            return;
          } else {
            HF.Events.emit('bossLure', cfg);
          }
        }
        if (cfg.trigger.depth && -P.y >= cfg.trigger.depth && P.def.tier >= cfg.trigger.tier && zi === cfg.zone) {
          if (Math.abs(P.x - cfg.lairX) < 30) {
            run.bossFought[cfg.id] = true;
            startFight(cfg.id);
            return;
          } else {
            HF.Events.emit('bossLure', cfg);
          }
        }
      }
    },

    update: function (dt) {
      if (!active) { HF.Boss.maybeTrigger(); return; }
      var a = active;
      if (a.state === 'intro') {
        /* frame-timed intro — no setTimeout (review ruling: cine timing
           lives in the update loop, never in wall-clock callbacks) */
        a.t += HF.Time.dtRaw;
        if (a.t > 2.6) { HF.Camera.clearCine(); a.state = 'idle'; a.t = 0; }
        return;
      }
      a.biteCd = Math.max(0, a.biteCd - dt);
      BRAINS[a.id](a, dt);

      /* weak-point glow + player bite check */
      a.glow.visible = a.weakOpen;
      if (a.weakOpen) {
        a.glow.position.set(a.weakX, a.weakY, 1);
        a.glow.material.opacity = 0.35 + 0.2 * Math.sin(HF.Time.now * 8);
        var P = HF.Player;
        var rr = P.mouth.r + a.weakR;
        if (a.biteCd <= 0 && !P.dead &&
            M.dist2(P.mouth.x, P.mouth.y, a.weakX, a.weakY) < rr * rr) {
          biteBoss();
        }
      }
      if (HF.Player.dead) { endFight(false); }
    }
  };
})();

/* ═══════════════════════════════════════════════════════════
   HF.Systems — Gold Rush, pets (aura-style pseudo-hunting per
   the review ruling: coins only, no XP/combo/charge), coin
   entities with magnet pickup, trawler net QTE (reuses the
   boost key), submersible harpoons.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Data', 'Player', 'Entities', 'Materials');
  var M = HF.M, D = HF.Data;

  /* ── coins (instanced) ───────────────────────────────── */
  var coinMesh = null, coinDummy = new THREE.Object3D();
  var COIN_CAP = 96;
  var coins = [];

  /* ── gold rush ───────────────────────────────────────── */
  var goldRush = { active: false, t: 0, charge: 0 };

  /* ── pets ────────────────────────────────────────────── */
  var pet = { id: null, group: null, x: 0, y: 0, killT: 0, zapT: 0, saveUsed: false, glow: null };

  /* ── net QTE ─────────────────────────────────────────── */
  var net = { active: false, boat: null, progress: 0, cd: 0, mesh: null };

  /* ── harpoons ────────────────────────────────────────── */
  var harpoons = [];
  var qbuf = [];

  HF.Systems = {
    goldRush: goldRush,

    init: function (scene) {
      var geo = HF.Builders.coinGeo();
      coinMesh = new THREE.InstancedMesh(geo, HF.Materials.flat({ emissive: 0xFFC93C, emissiveIntensity: 0.35 }), COIN_CAP);
      coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      coinMesh.frustumCulled = false;
      coinDummy.position.set(0, -9999, 0); coinDummy.scale.setScalar(0.001); coinDummy.updateMatrix();
      for (var i = 0; i < COIN_CAP; i++) {
        coinMesh.setMatrixAt(i, coinDummy.matrix);
        coins.push({ live: false, x: 0, y: 0, v: 0, vx: 0, vy: 0, value: 1, t: 0 });
      }
      scene.add(coinMesh);
    },

    resetRun: function () {
      goldRush.active = false; goldRush.t = 0; goldRush.charge = 0;
      /* park matrices too — a bare live=false leaves ghost coins rendering */
      coinDummy.position.set(0, -9999, 0); coinDummy.scale.setScalar(0.001); coinDummy.updateMatrix();
      coins.forEach(function (c, i) {
        c.live = false;
        coinMesh.setMatrixAt(i, coinDummy.matrix);
      });
      coinMesh.instanceMatrix.needsUpdate = true;
      pet.saveUsed = false; pet.killT = 0; pet.zapT = 0;
      net.active = false; net.cd = 0;
      harpoons.length = 0;
      HF.Systems.equipPet(HF.Save.data.equipped.pet);
    },

    /* ── gold rush ── */
    addCharge: function (points) {
      if (goldRush.active) return;                       // review: frozen during GR
      if (HF.Boss && HF.Boss.active()) return;           // and during boss fights (no invuln cheese)
      goldRush.charge += points * D.RULES.GR_CHARGE_RATE * (HF.Player.fx.grCharge || 1);
      if (goldRush.charge >= D.RULES.GR_CHARGE_MAX) {
        goldRush.charge = D.RULES.GR_CHARGE_MAX;
        HF.Systems.triggerGoldRush();
      }
    },
    triggerGoldRush: function () {
      goldRush.active = true;
      goldRush.t = D.RULES.GR_DURATION;
      goldRush.charge = 0;
      HF.Time.hitstop(0.2);
      HF.Audio.play('grStart');
      HF.Camera.addTrauma(0.3);
      HF.Events.emit('goldRushStart');
    },
    endGoldRush: function (refund) {
      goldRush.active = false;
      goldRush.t = 0;
      goldRush.charge = refund ? D.RULES.GR_CHARGE_MAX * 0.6 : 0;   // boss interrupt refunds charge
      HF.Events.emit('goldRushEnd');
    },

    /* ── pets ── */
    equipPet: function (petId) {
      if (pet.group) {
        HF.World.scene.remove(pet.group);
        HF.Materials.disposeGroup(pet.group);
        pet.group = null;
      }
      pet.id = petId || null;
      if (!pet.id) return;
      var def = null;
      D.PETS.forEach(function (p) { if (p.id === petId) def = p; });
      if (!def) { pet.id = null; return; }
      var K = HF.ModelKit;
      var g = new THREE.Group();
      var body = K.mesh(HF.Builders.geoFor({ kind: 'fish', len: 0.7, colors: { a: def.color, b: 0xEAF6FF } }));
      if (petId === 'bulwark') { g.remove(body); body = K.mesh(HF.Builders.geoFor({ kind: 'crab', len: 0.6, colors: { a: def.color, b: 0xEAF6FF } })); }
      if (petId === 'lantern') { body = K.mesh(HF.Builders.geoFor({ kind: 'jelly', len: 0.6, colors: { a: def.color, b: 0xCAF0F8 } })); }
      if (petId === 'petrel') { body = K.mesh(HF.Builders.geoFor({ kind: 'gull', len: 0.5, colors: { a: def.color, b: 0x39424E, beak: 0xFF9F1C } })); }
      if (petId === 'volt') { body = K.mesh(HF.Builders.geoFor({ kind: 'eel', len: 0.8, colors: { a: def.color, b: 0x223344 } })); }
      g.add(body);
      if (petId === 'lantern') {
        pet.glow = HF.Materials.glowSprite(0x9BF6FF, 10, 0.35);
        g.add(pet.glow);
      } else pet.glow = null;
      pet.group = g;
      pet.x = HF.Player.x - 3; pet.y = HF.Player.y + 1;
      HF.World.scene.add(g);
    },
    petGravityMul: function () { return pet.id === 'petrel' ? 0.8 : 1; },
    petAirScoreMul: function () { return pet.id === 'petrel' ? 1.2 : 1; },
    petSaveAvailable: function () { return pet.id === 'bulwark' && !pet.saveUsed; },
    consumePetSave: function () {
      pet.saveUsed = true;
      HF.UIScreens.toast('🦀 Bulwark absorbed the blow!', 'once per run');
    },

    /* ── coins ── */
    dropCoins: function (x, y, value) {
      /* exact distribution: n visual coins carry the full value, remainder
         on the first coin; if the pool is exhausted the rest is credited
         directly — value must never drift or silently vanish */
      var n = M.clamp(Math.ceil(value / 5), 1, 8);
      var per = Math.floor(value / n);
      var rem = value - per * n;
      var left = value;
      for (var i = 0; i < n; i++) {
        var give = per + (i === 0 ? rem : 0);
        if (give <= 0) continue;
        var placed = false;
        for (var s = 0; s < COIN_CAP; s++) {
          var c = coins[s];
          if (c.live) continue;
          c.live = true; c.slot = s;
          c.x = x + M.rand(-0.8, 0.8); c.y = y + M.rand(-0.5, 0.8);
          c.vx = M.rand(-2, 2); c.vy = M.rand(1, 3);
          c.value = give; c.t = 0;
          placed = true;
          break;
        }
        if (placed) left -= give;
      }
      if (left > 0) HF.Save.addCoins(left);   // pool full: credit the rest directly
    },

    canNet: function () {
      /* never during a boss fight — stacked capture states are showstoppers */
      return net.cd <= 0 && !net.active && !(HF.Boss && HF.Boss.active());
    },
    startNet: function (boat) {
      net.active = true; net.boat = boat; net.progress = 0;
      HF.Player.netted = boat;
      HF.Input.consumeStruggles();
      HF.Events.emit('netStart');
      if (!net.mesh) {
        var K = HF.ModelKit;
        var lines = [];
        for (var i = 0; i < 5; i++) {
          lines.push(K.xform(K.cyl(0.02, 0.02, 4, 0xC9BCA4, 3), (i - 2) * 0.8, 0, 0));
          lines.push(K.xform(K.cyl(0.02, 0.02, 4, 0xC9BCA4, 3), 0, (i - 2) * 0.8, 0, 0, 0, Math.PI / 2));
        }
        net.mesh = K.mesh(K.merge(lines), {});
        net.mesh.material.transparent = true; net.mesh.material.opacity = 0.8;
      }
      HF.World.scene.add(net.mesh);
    },
    updateNet: function (dt) {
      var P = HF.Player;
      if (!net.active) { P.netted = null; return; }
      /* dragged up toward the boat, taking damage */
      P.x = M.damp(P.x, net.boat.x, 1.2, dt);
      P.y = M.damp(P.y, net.boat.y - 2.2, 1.2, dt);
      P.hp -= 5 * dt;
      net.mesh.position.set(P.x, P.y, 0.5);
      net.mesh.rotation.z += dt;
      var taps = HF.Input.consumeStruggles();
      if (taps > 0) {
        net.progress += taps * 0.12;
        HF.Audio.play('netStruggle');
        HF.Particles.bubbles(P.x, P.y, taps * 2, 0.8, 2);
      }
      net.progress = Math.max(0, net.progress - dt * 0.1);
      HF.Events.emit('netProgress', net.progress);
      if (net.progress >= 1) {
        net.active = false; net.cd = 12;
        P.netted = null;
        HF.World.scene.remove(net.mesh);
        P.vy = -6;
        HF.Particles.burst(P.x, P.y, 0xC9BCA4, 14, 5);
        HF.Audio.play('gulp');
        HF.Events.emit('netEscape');
      }
      if (P.hp <= 0) {
        net.active = false;
        P.netted = null;
        HF.World.scene.remove(net.mesh);
        P.die('net');
      }
    },

    /* ── harpoons from submersibles ── */
    updateHarpoons: function (dt) {
      var P = HF.Player;
      /* subs fire when hunting */
      var list = HF.Entities.list;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e.def.shooter || e.state !== 1) continue;
        e.t += dt;
        if (e.t > 2.4) {
          e.t = 0;
          var a = Math.atan2(P.y - e.y, P.x - e.x);
          harpoons.push({ x: e.x, y: e.y, vx: Math.cos(a) * 16, vy: Math.sin(a) * 16, life: 2.2 });
          HF.Audio.play('swoosh');
        }
      }
      for (var h = harpoons.length - 1; h >= 0; h--) {
        var p = harpoons[h];
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        if (Math.random() < dt * 30) HF.Particles.bubbles(p.x, p.y, 1, 0.1, 0.5);
        var rr = P.lenScaled * 0.28 + 0.4;
        if (M.dist2(p.x, p.y, P.x, P.y) < rr * rr) {
          P.takeDamage(20, 'sub', { knock: { x: p.vx * 0.2, y: p.vy * 0.2 } });
          harpoons.splice(h, 1);
          continue;
        }
        if (p.life <= 0) harpoons.splice(h, 1);
      }
    },

    update: function (dt) {
      var P = HF.Player;
      net.cd = Math.max(0, net.cd - dt);

      /* gold rush timer + juice */
      if (goldRush.active) {
        goldRush.t -= dt;
        if (Math.random() < dt * 10) HF.Particles.goldTrail(P.x + M.rand(-1, 1), P.y + M.rand(-1, 1), 2);
        if (goldRush.t <= 0) HF.Systems.endGoldRush(false);
      }

      /* pet follow + abilities */
      if (pet.group) {
        var tx = P.x - Math.cos(P.angle) * P.lenScaled * 0.8;
        var ty = P.y + 1.2 + Math.sin(HF.Time.now * 2) * 0.3;
        pet.x = M.damp(pet.x, tx, 3.5, dt);
        pet.y = M.damp(pet.y, ty, 3.5, dt);
        pet.group.position.set(pet.x, pet.y, -1.2);
        pet.group.rotation.y = P.dir < 0 ? Math.PI : 0;

        if (pet.id === 'buddy' && HF.Game.state === 'PLAYING') {
          pet.killT += dt;
          if (pet.killT >= D.RULES.PET_KILL_PERIOD) {
            pet.killT = 0;
            HF.Grid.query(pet.x, pet.y, 6, qbuf);
            for (var i = 0; i < qbuf.length; i++) {
              var t = qbuf[i];
              /* "small prey" means it: no giants/boats, no humans (daily tasks),
                 nothing already dead this frame (stale grid entries) */
              if (t.alive && !t.def.bites && !t.def.net && t.def.kind !== 'human' &&
                  t.def.tier <= Math.max(P.effTier - 1, 1) && t.def.tier !== 99 && !t.def.safeTier) {
                HF.Entities.despawn(t);
                HF.Particles.burst(t.x, t.y, t.def.colors ? t.def.colors.a : 0x999999, 6, 2);
                /* review ruling: pets pay coins only */
                HF.Systems.dropCoins(t.x, t.y, Math.max(1, Math.round(t.def.pts / 20)));
                break;
              }
            }
          }
        }
        if (pet.id === 'volt' || pet.id === 'lantern') {
          pet.zapT -= dt;
          var cd = pet.id === 'volt' ? 8 : 20;
          if (pet.zapT <= 0) {
            HF.Grid.query(P.x, P.y, pet.id === 'volt' ? 5 : 9, qbuf);
            for (var z = 0; z < qbuf.length; z++) {
              var c = qbuf[z];
              if (c.def.proto === 'chase' && c.state === 1) {
                pet.zapT = cd;
                c.state = 0; c.fleeT = 2; c.atkCd = 2.5;
                c.vx = (c.x - P.x); c.vy = 1;
                HF.Particles.zap(c.x, c.y);
                HF.Audio.play('zap');
                break;
              }
            }
          }
        }
        if (pet.glow) pet.glow.material.opacity = 0.25 + 0.1 * Math.sin(HF.Time.now * 2);
      }

      /* coins: physics + magnet + pickup */
      var magnetR = pet.id === 'remora' ? 8 : 2.6;
      var any = false;
      for (var ci = 0; ci < COIN_CAP; ci++) {
        var c = coins[ci];
        if (!c.live) continue;
        any = true;
        c.t += dt;
        var d2 = M.dist2(c.x, c.y, P.x, P.y);
        if (d2 < magnetR * magnetR && !P.dead) {
          var l = Math.sqrt(d2) || 1;
          c.vx += ((P.x - c.x) / l) * 40 * dt;
          c.vy += ((P.y - c.y) / l) * 40 * dt;
        } else {
          c.vx = M.damp(c.vx, 0, 2, dt);
          c.vy = M.damp(c.vy, -0.5, 1.5, dt);
        }
        c.x += c.vx * dt; c.y += c.vy * dt;
        var floor = HF.World.floorY(c.x) + 0.3;
        if (c.y < floor) { c.y = floor; c.vy = 0; }
        var pr = P.lenScaled * 0.3 + 0.5;
        if (d2 < pr * pr && !P.dead && HF.Game.state === 'PLAYING') {
          c.live = false;
          HF.Save.addCoins(c.value);
          HF.Progress.run.coinsPicked += c.value;
          HF.Combat.coinPickup();
          coinDummy.position.set(0, -9999, 0); coinDummy.scale.setScalar(0.001);
          coinDummy.updateMatrix();
          coinMesh.setMatrixAt(c.slot, coinDummy.matrix);
          continue;
        }
        if (c.t > 25) { c.live = false; }
        coinDummy.position.set(c.x, c.y, 0.4);
        coinDummy.rotation.y = HF.Time.now * 3 + ci;
        coinDummy.scale.setScalar(c.live ? 1 : 0.001);
        coinDummy.updateMatrix();
        coinMesh.setMatrixAt(c.slot, coinDummy.matrix);
      }
      if (any) coinMesh.instanceMatrix.needsUpdate = true;
    }
  };
})();

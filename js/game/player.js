/* ═══════════════════════════════════════════════════════════
   HF.Player — the shark you steer.
   Pointer-seek or direction steering, boost stamina with the
   bite-refund (0.4 s internal cooldown — the review's anti-
   perpetual-motion ruling), half-gravity air jumps, pressure
   damage, per-run growth L1-L10, i-frames, jaw animation.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Data', 'SharkBuilder', 'Materials');
  var M = HF.M, D = HF.Data, R = null;

  var P = HF.Player = {
    def: null, model: null,
    x: 120, y: -10, vx: 0, vy: 0,
    dir: 1, angle: 0,
    hp: 100, maxHp: 100,
    stamina: 100, staminaMax: 100,
    boosting: false, airborne: false,
    level: 1, xp: 0, xpNext: 80,
    effTier: 1, lenScaled: 1.2,
    dead: false, deadCause: '',
    iframes: 0, refundCd: 0, regenDelay: 0,
    airT: 0, jumpPeak: 0,
    mouth: { x: 0, y: 0, r: 0.5 },
    prevMouth: { x: 0, y: 0 },
    poison: 0, netted: null, shockT: 0,
    fx: {}                              // cosmetic bonuses, filled on equip
  };

  var group = null, built = null, scene = null;
  var jawOpen = 0, jawTarget = 0, chompT = 0;
  var trailT = 0;
  var lamp = null;   // the player IS the light source down in the dark

  P.init = function (sc) { scene = sc; R = D.RULES; };

  P.equip = function (sharkId) {
    if (group) {
      scene.remove(group);
      if (built && built.sway) HF.Materials.removeSway(built.sway);
      HF.Materials.disposeGroup(group);
      group = null;
    }
    var def = null;
    D.SHARKS.forEach(function (s) { if (s.id === sharkId) def = s; });
    if (!def) {
      /* corrupted save value must never brick the boot — heal to the pup */
      console.warn('unknown shark "' + sharkId + '" in save — falling back to pup');
      sharkId = 'pup';
      D.SHARKS.forEach(function (s) { if (s.id === 'pup') def = s; });
      HF.Save.data.equipped.shark = 'pup';
      HF.Save.mark();
    }
    P.def = def;
    built = HF.SharkBuilder.build(sharkId);
    group = built.group;
    scene.add(group);
    if (!lamp) {
      lamp = new THREE.PointLight(0x7EC8E3, 0, 30, 1.6);
      scene.add(lamp);
    }
    P.applyCosmetics();
    P.resetRun();
  };

  /* cosmetic attachments + fx aggregation */
  P.applyCosmetics = function () {
    var eq = HF.Save.data.equipped.cosmetics;
    P.fx = { score: 1, sonar: 0, light: 1, grCharge: 1, stamRegen: 1, bite: 1 };
    /* clear old attachments */
    for (var s in built.sockets) {
      var sock = built.sockets[s];
      for (var i = sock.children.length - 1; i >= 0; i--) sock.remove(sock.children[i]);
    }
    var K = HF.ModelKit, L = P.def.len;
    ['head', 'body', 'tail'].forEach(function (slot) {
      var id = eq[slot];
      if (!id) return;
      var cos = null;
      D.COSMETICS.forEach(function (c) { if (c.id === id) cos = c; });
      if (!cos) return;
      if (cos.fx) for (var k in cos.fx) {
        if (k === 'sonar') P.fx.sonar = cos.fx[k];
        else P.fx[k] = (P.fx[k] || 1) * cos.fx[k];
      }
      var mesh = cosmeticMesh(cos, L, K);
      if (mesh) built.sockets[slot === 'head' ? 'head' : slot === 'tail' ? 'tail' : 'dorsal'].add(mesh);
    });
  };

  function cosmeticMesh(cos, L, K) {
    var s = Math.max(L * 0.14, 0.2);
    switch (cos.id) {
      case 'kelpWig': return K.mesh(K.merge([0, 1, 2].map(function (i) {
        return K.xform(K.fin([[0, 0], [0.3 * s, s * (1.4 + i * 0.2)], [0.6 * s, s * 0.2]], s * 0.1, 0x2EC4B6), (i - 1) * s * 0.5, 0, 0, 0, 0, (i - 1) * 0.3);
      })));
      case 'plaster': return K.mesh(K.xform(K.box(s * 1.6, s * 0.5, s * 0.1, 0xF2E8CF), 0, 0, 0, 0.3, 0, 0.6));
      case 'flag': { var m = K.mesh(K.merge([K.cyl(s * 0.05, s * 0.05, s * 2, 0x8C6A4F, 5), K.xform(K.fin([[0, 0], [s * 1.1, s * 0.35], [0, s * 0.7]], s * 0.05, 0xFF5D5D), 0, s * 0.95, 0)])); m.rotation.z = -0.5; return m; }
      case 'bubbleCrown': return K.mesh(K.merge([0, 1, 2, 3, 4].map(function (i) {
        var a = (i / 5) * Math.PI - Math.PI / 2;
        return K.xform(K.sphere(s * (i === 2 ? 0.5 : 0.32), 0x9BF6FF, 6), Math.sin(a) * s, Math.abs(Math.cos(a)) * s * 0.7 + s * 0.3, 0);
      })));
      case 'sonarRing': { var r = K.mesh(K.torus(s * 1.6, s * 0.14, 0x4CC9F0)); r.rotation.y = Math.PI / 2; return r; }
      case 'abyssGoggles': return K.mesh(K.merge([
        K.xform(K.torus(s * 0.45, s * 0.12, 0xFFC93C), 0, 0, s * 0.8, 0, 0, 0),
        K.xform(K.torus(s * 0.45, s * 0.12, 0xFFC93C), 0, 0, -s * 0.8, 0, 0, 0)
      ]));
      case 'coralCharm': return K.mesh(K.xform(K.cone(s * 0.4, s * 0.9, 0xFF6F91, 5), 0, s * 0.5, 0));
      case 'tailTurbine': { var t = K.mesh(K.merge([K.cyl(s * 0.5, s * 0.5, s * 0.4, 0x8FB8CC, 7), K.xform(K.cyl(s * 0.2, s * 0.2, s * 0.6, 0x39424E, 5), 0, 0, 0)])); t.rotation.z = Math.PI / 2; return t; }
      case 'fangChain': return K.mesh(K.merge([0, 1, 2, 3, 4].map(function (i) {
        return K.xform(K.cone(s * 0.12, s * 0.4, 0xF2F5F7, 4), (i - 2) * s * 0.35, -s * 0.2 - Math.abs(i - 2) * -s * 0.08, 0, Math.PI, 0, 0);
      })));
    }
    return null;
  }

  P.resetRun = function () {
    var def = P.def;
    P.level = 1; P.xp = 0; P.xpNext = R.XP_LEVEL_BASE;
    P.maxHp = def.hp; P.hp = def.hp;
    P.staminaMax = def.stamina; P.stamina = def.stamina;
    P.dead = false; P.deadCause = '';
    P.iframes = 0; P.refundCd = 0; P.poison = 0; P.netted = null; P.shockT = 0;
    P.vx = P.vy = 0; P.dir = 1; P.angle = 0;
    P.airborne = false; P.airT = 0;
    P.updateDerived();
    if (group) group.visible = true;
    if (group) group.rotation.set(0, 0, 0);
  };

  P.updateDerived = function () {
    var def = P.def;
    var lvlK = P.level - 1;
    P.sizeScale = 1 + R.LVL_SIZE * lvlK;
    P.lenScaled = def.len * P.sizeScale;
    P.speedMax = def.speed * (1 + R.LVL_SPEED * lvlK);
    var hpMaxOld = P.maxHp;
    var mastery = (HF.Save.data.sharks[def.id] && HF.Save.data.sharks[def.id].mastery) || 0;
    P.maxHp = Math.round(def.hp * (1 + R.LVL_HP * lvlK) * (1 + mastery * 0.02));
    if (P.maxHp > hpMaxOld) P.hp += P.maxHp - hpMaxOld;
    P.effTier = Math.min(7, def.tier + (P.level >= 4 ? 1 : 0) + (P.level >= 8 ? 1 : 0));
    /* judge ruling: bite reach grows at HALF the visual rate, capped */
    var biteScale = Math.min(1 + R.BITE_RADIUS_LVL * lvlK, R.BITE_RADIUS_CAP) * (P.fx.bite || 1);
    P.mouthR = Math.max(def.len * 0.16 * biteScale, 0.4);
    if (group) group.scale.setScalar(P.sizeScale);
    HF.Camera.fitTo(P.lenScaled);
  };

  P.addXP = function (n) {
    if (P.level >= R.MAX_LEVEL) return;
    P.xp += n;
    while (P.xp >= P.xpNext && P.level < R.MAX_LEVEL) {
      P.xp -= P.xpNext;
      P.level++;
      P.xpNext = Math.round(R.XP_LEVEL_BASE * Math.pow(R.XP_LEVEL_GROWTH, P.level - 1));
      P.updateDerived();
      P.hp = Math.min(P.maxHp, P.hp + P.maxHp * R.LVL_HEAL_FRAC);
      HF.Events.emit('levelup', P.level);
    }
  };

  P.heal = function (n) { P.hp = Math.min(P.maxHp, P.hp + n); };

  P.biteRefund = function () {
    if (P.refundCd > 0) return;
    P.refundCd = R.BITE_REFUND_COOLDOWN;
    P.stamina = Math.min(P.staminaMax, P.stamina + R.BITE_STAMINA_REFUND);
  };

  P.takeDamage = function (amount, cause, opts) {
    var dot = opts && opts.dot;          // damage-over-time: ignores & never grants iframes
    if (P.dead || (P.iframes > 0 && !dot)) return false;
    if (HF.Systems && HF.Systems.goldRush.active) return false;
    /* Bulwark pet: cheat death once per run */
    if (P.hp - amount <= 0 && HF.Systems && HF.Systems.petSaveAvailable()) {
      HF.Systems.consumePetSave();
      P.hp = P.maxHp * 0.15;
      P.iframes = 1.6;
      HF.Materials.flash(group, 0xFFC93C, 0.5);
      return true;
    }
    P.hp -= amount;
    if (!dot) {
      P.iframes = R.IFRAMES;
      HF.Materials.flash(group, 0xFF3333, 0.14);
      HF.Camera.addTrauma(Math.min(0.3 + amount / 90, 0.6));
      HF.Audio.play('hurt');
    }
    HF.Events.emit('playerHurt', { amount: amount, cause: cause });
    if (opts && opts.knock) {
      P.vx += opts.knock.x; P.vy += opts.knock.y;
    }
    if (P.hp <= 0) P.die(cause);
    return true;
  };

  P.die = function (cause) {
    if (P.dead) return;
    P.dead = true;
    P.deadCause = cause || 'hunger';
    HF.Events.emit('playerDied', cause);
  };

  P.update = function (dt, intent) {
    if (!P.def) return;
    var W = D.WORLD;
    P.iframes = Math.max(0, P.iframes - dt);
    P.refundCd = Math.max(0, P.refundCd - dt);
    P.shockT = Math.max(0, P.shockT - dt);

    if (P.dead) { deathDrift(dt); return; }

    /* ── net QTE lock ── */
    if (P.netted) { HF.Systems.updateNet(dt); syncModel(dt); return; }

    /* ── steering ── */
    var desireX = 0, desireY = 0, throttle = 0;
    if (P.shockT <= 0) {
      if (intent.steerMode === 'pointer') {
        var w = HF.Camera.worldFromScreen(intent.pointer.x, intent.pointer.y);
        var dx = w.x - P.x, dy = w.y - P.y;
        var dl = M.len(dx, dy);
        throttle = M.clamp01((dl - P.lenScaled * 0.3) / 6);
        if (dl > 0.01) { desireX = dx / dl; desireY = dy / dl; }
      } else {
        desireX = intent.steer.x; desireY = intent.steer.y;
        throttle = M.len(desireX, desireY) > 0.05 ? 1 : 0;
      }
    }

    /* ── boost ── */
    var wantBoost = intent.boost && throttle > 0.1 && P.stamina > 1 && !P.airborne;
    var grActive = HF.Systems && HF.Systems.goldRush.active;
    P.boosting = wantBoost || (grActive && throttle > 0.1);
    if (P.boosting && !grActive) {
      P.stamina -= R.BOOST_DRAIN * dt;
      P.regenDelay = R.BOOST_REGEN_DELAY;
      if (P.stamina <= 0) { P.stamina = 0; P.boosting = false; }
    } else {
      P.regenDelay -= dt;
      if (P.regenDelay <= 0) {
        P.stamina = Math.min(P.staminaMax, P.stamina + R.BOOST_REGEN * (P.fx.stamRegen || 1) * dt);
      }
    }

    var spd = P.speedMax * (P.boosting ? P.def.boost : 1) * (grActive ? R.GR_SPEED_BONUS : 1);

    if (P.airborne) {
      /* ballistic: keep momentum, tiny air control, half gravity */
      var g = W.GRAVITY_AIR * (HF.Systems && HF.Systems.petGravityMul ? HF.Systems.petGravityMul() : 1);
      P.vy -= g * dt;
      P.vx += desireX * 2.5 * dt;
      P.airT += dt;
      P.jumpPeak = Math.max(P.jumpPeak, P.y);
    } else {
      var accel = 8;
      P.vx = M.damp(P.vx, desireX * spd * throttle, accel * dt >= 1 ? 1 : accel, dt);
      P.vy = M.damp(P.vy, desireY * spd * throttle, accel, dt);
    }

    P.x += P.vx * dt;
    P.y += P.vy * dt;

    /* ── water surface crossing ── */
    var waveY = HF.Water.heightAt(P.x);
    if (!P.airborne && P.y > waveY + 0.3) {
      if (P.vy > 3.2) {
        P.airborne = true; P.airT = 0; P.jumpPeak = P.y;
        HF.Particles.ringSplash(P.x, waveY, 18);
        HF.Particles.splash(P.x, waveY, 18, 1);
        HF.Audio.play('splashOut');
        HF.Time.set('slow', 0.4, 0.9);
        HF.Events.emit('jumpOut');
      } else {
        P.y = waveY + 0.3; P.vy = Math.min(P.vy, 0); /* too slow: skim */
      }
    }
    if (P.airborne && P.y <= waveY && P.vy < 0) {
      P.airborne = false;
      HF.Particles.splash(P.x, waveY, 26, 1.4);
      HF.Particles.bubbles(P.x, P.y - 1, 12, 1, 2);
      HF.Audio.play('splashIn');
      HF.Camera.addTrauma(0.18);
      HF.Events.emit('splashDown', P.airT);
      P.airT = 0;
    }
    if (P.airborne && P.y > W.AIR_CEIL) { P.y = W.AIR_CEIL; P.vy = Math.min(P.vy, 0); }

    /* ── world clamps ── */
    var floor = HF.World.floorY(P.x) + P.lenScaled * 0.14;
    if (P.y < floor) { P.y = floor; if (P.vy < 0) P.vy *= -0.3; }
    if (P.x < W.X0 + 3) { P.x = W.X0 + 3; P.vx = Math.abs(P.vx) * 0.4; }
    if (P.x > W.X1 - 3) { P.x = W.X1 - 3; P.vx = -Math.abs(P.vx) * 0.4; }

    /* zone gate: soft push-back if shark tier too low */
    var zi = HF.World.zoneIndexAt(P.x);
    var needTier = zi === 1 ? 2 : zi === 2 ? 3 : 1;
    if (P.def.tier < needTier) {
      var gateX = D.WORLD.ZONES[zi].x0;
      P.vx -= (P.x - gateX + 8) * 0.7 * dt * 10;
      HF.Events.emit('zoneBlocked', zi);
    }

    /* ── hunger drain / pressure / poison ── */
    var drain = P.def.drain * (P.boosting ? 1.5 : 1);
    if (!grActive) P.hp -= drain * dt;
    if (-P.y > P.def.depthLimit) {
      P.hp -= W.PRESSURE_DPS * dt;
      HF.Events.emit('pressure');
    }
    if (P.poison > 0) { P.poison -= dt; P.hp -= 3 * dt; }
    if (P.hp <= 0) { P.hp = 0; P.die(P.poison > 0 ? 'poison' : (-P.y > P.def.depthLimit ? 'pressure' : 'hunger')); }

    /* ── mouth point (physics uses prev→cur sweep) ── */
    P.prevMouth.x = P.mouth.x; P.prevMouth.y = P.mouth.y;
    var ang = Math.atan2(P.vy, P.vx);
    if (M.len(P.vx, P.vy) < 0.4) ang = P.dir < 0 ? Math.PI : 0;
    P.angle = ang;
    if (Math.abs(P.vx) > 0.15) P.dir = P.vx < 0 ? -1 : 1;
    var mOff = P.lenScaled * 0.42;
    P.mouth.x = P.x + Math.cos(ang) * mOff;
    P.mouth.y = P.y + Math.sin(ang) * mOff;
    P.mouth.r = P.mouthR;

    /* ── trails ── */
    trailT -= dt;
    if (trailT <= 0 && !P.airborne) {
      trailT = P.boosting ? 0.05 : 0.35;
      HF.Particles.bubbles(P.x - Math.cos(ang) * P.lenScaled * 0.5, P.y - Math.sin(ang) * P.lenScaled * 0.5, P.boosting ? 3 : 1, 0.3, 1.2);
      if (grActive) HF.Particles.goldTrail(P.x - Math.cos(ang) * P.lenScaled * 0.4, P.y, 2);
    }

    syncModel(dt);
  };

  /* jaw: auto-open near edible prey; chomp() snaps shut */
  var qNear = [];
  function syncModel(dt) {
    if (!group) return;
    group.position.set(P.x, P.y, 0);
    /* dive lamp: fades in below 100 m so the abyss stays scary but playable */
    if (lamp) {
      var deepK = M.smoothstep(100, 220, -P.y);
      /* keep a floor intensity: toggling light COUNT recompiles every lit
         shader in the scene (r147 program cache keys include numPointLights) */
      lamp.intensity = M.damp(lamp.intensity, 0.001 + deepK * 2.4, 2, dt);
      lamp.distance = 30 * (P.fx.light || 1);
      lamp.position.set(P.x + Math.cos(P.angle) * 2, P.y + 1.2, 4);
    }
    /* orientation: yaw flip + pitch toward motion */
    var targetPitch = M.clamp(Math.atan2(P.vy, Math.abs(P.vx) + 0.001), -1.1, 1.1);
    var flip = P.dir < 0;
    group.rotation.y = M.damp(group.rotation.y, flip ? Math.PI : 0, 8, dt);
    group.rotation.z = M.damp(group.rotation.z, flip ? -targetPitch : targetPitch, 6, dt);

    /* swim animation intensity follows speed */
    if (built.sway) {
      var sp = M.len(P.vx, P.vy);
      built.sway.uHFFreq.value = 4 + sp * 0.6;
      built.sway.uHFAmp.value = P.def.len * (0.03 + Math.min(sp / P.speedMax, 1.6) * 0.035);
    }

    /* jaw target: open when prey is in front */
    jawTarget = 0.12;
    if (!P.dead) {
      HF.Grid.query(P.mouth.x, P.mouth.y, 4 + P.lenScaled, qNear);
      for (var i = 0; i < qNear.length; i++) {
        var t = qNear[i].def.tier;
        if (t <= P.effTier || (HF.Systems && HF.Systems.goldRush.active)) { jawTarget = 0.55; break; }
      }
      if (P.boosting) jawTarget = Math.max(jawTarget, 0.3);
    }
    if (chompT > 0) { chompT -= dt; jawTarget = 0.02; }
    jawOpen = M.damp(jawOpen, jawTarget, chompT > 0 ? 26 : 10, dt);
    if (built.jaw) built.jaw.rotation.z = -jawOpen;
  }

  P.chomp = function () { chompT = 0.09; };

  function deathDrift(dt) {
    /* belly-up float + slow sink, schadenfreude fish handled by AI naturally */
    P.vx = M.damp(P.vx, 0, 1.2, dt);
    P.vy = M.damp(P.vy, -0.8, 0.8, dt);
    P.x += P.vx * dt; P.y += P.vy * dt;
    var floor = HF.World.floorY(P.x) + 1;
    if (P.y < floor) P.y = floor;
    if (group) {
      group.position.set(P.x, P.y, 0);
      group.rotation.z = M.damp(group.rotation.z, Math.PI * 0.9, 1.2, dt);
      if (Math.random() < dt * 3) HF.Particles.bubbles(P.x, P.y + 0.5, 1, 0.4, 1.5);
    }
  }

  P.sockets = function () { return built ? built.sockets : null; };
  P.group = function () { return group; };
})();

/* ═══════════════════════════════════════════════════════════
   HF.AI — six behaviour prototypes drive all 28 species:
   school / wander / flee / chase / hazard / surface.
   Species differences are pure data (speed, sense radius,
   modifiers) — the review's "no per-species code" rule.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Data', 'Entities', 'Grid');
  var M = HF.M, D = HF.Data;

  var qbuf = [];

  function depthBand(e) {
    var d = e.def.depth;
    var floor = HF.World.floorY(e.x);
    var top = -Math.max(d[0], 0.5);
    var bot = Math.max(-d[1], floor + e.def.r + 0.5);
    if (top < bot) top = bot + 0.1;
    return { top: top, bot: bot };
  }

  function steerInto(e, tx, ty, speed, dt, turn) {
    var dx = tx - e.x, dy = ty - e.y;
    var l = M.len(dx, dy) || 1;
    var lam = turn || 2;
    e.vx = M.damp(e.vx, (dx / l) * speed, lam, dt);
    e.vy = M.damp(e.vy, (dy / l) * speed, lam, dt);
  }

  function integrate(e, dt) {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    /* facing & pitch follow velocity */
    if (Math.abs(e.vx) > 0.12) e.dir = e.vx < 0 ? -1 : 1;
    var sp = M.len(e.vx, e.vy);
    e.pitch = M.damp(e.pitch, sp > 0.2 ? Math.atan2(e.vy, Math.abs(e.vx)) : 0, 4, dt);
    /* world clamp */
    var floor = HF.World.floorY(e.x) + e.def.r * e.scale;
    if (e.y < floor) { e.y = floor; if (e.vy < 0) e.vy *= -0.4; }
    var isSurface = e.def.proto === 'surface';
    if (!isSurface && e.y > -0.4 && e.def.kind !== 'gull') { e.y = -0.4; if (e.vy > 0) e.vy *= -0.5; }
    e.x = M.clamp(e.x, D.WORLD.X0 + 2, D.WORLD.X1 - 2);
  }

  function playerThreat(e, player) {
    /* is the player scary to me? */
    return player.effTier >= e.def.tier && !player.dead;
  }

  var PROTOS = {
    /* boid-lite: follow shared anchor + separation, anchor wanders */
    school: function (e, dt, player) {
      var band = depthBand(e);
      if (!e.schoolAnchor) e.schoolAnchor = { x: e.x, y: e.y, vx: M.rand(-1, 1), vy: 0, t: 0 };
      var a = e.schoolAnchor;
      a.t -= dt;
      if (a.t <= 0) { a.t = M.rand(2, 5); a.vx = M.rand(-1, 1) * e.def.speed * 0.5; a.vy = M.rand(-0.6, 0.6); }
      a.x += a.vx * dt; a.y += a.vy * dt;
      a.y = M.clamp(a.y, band.bot, band.top);
      a.x = M.clamp(a.x, D.WORLD.X0 + 10, D.WORLD.X1 - 10);

      /* panic scatter: only when the shark is already IN the school —
         the fantasy is bursting in and snapping fish as they explode */
      var pd2 = M.dist2(e.x, e.y, player.x, player.y);
      var scareR = player.boosting ? 42 : 22;   // squared distances (≈6.5 / 4.7 m)
      var scare = pd2 < scareR && playerThreat(e, player);
      if (scare) {
        var away = Math.atan2(e.y - player.y, e.x - player.x);
        steerInto(e, e.x + Math.cos(away) * 20, e.y + Math.sin(away) * 12, e.def.speed * 1.6, dt, 3.5);
      } else {
        /* cohesion to anchor + tiny separation from neighbours */
        var sx = 0, sy = 0;
        HF.Grid.query(e.x, e.y, 2.2, qbuf);
        for (var i = 0; i < qbuf.length && i < 6; i++) {
          var o = qbuf[i];
          if (o === e || o.def !== e.def) continue;
          var d2 = M.dist2(e.x, e.y, o.x, o.y) || 0.01;
          sx += (e.x - o.x) / d2; sy += (e.y - o.y) / d2;
        }
        steerInto(e, a.x + sx * 3 + Math.sin(e.t * 2 + e.ph) * 2, a.y + sy * 3 + Math.cos(e.t * 1.7 + e.ph) * 1.4, e.def.speed, dt, 3);
      }
      integrate(e, dt);
    },

    wander: function (e, dt, player) {
      var band = depthBand(e);
      var bottom = e.def.mods && e.def.mods.indexOf('bottom') >= 0;
      e.t += dt;
      /* flee reaction for edible wanderers */
      var pd2 = M.dist2(e.x, e.y, player.x, player.y);
      if (pd2 < 140 && playerThreat(e, player) && e.def.speed > 1) {
        var away = Math.atan2(e.y - player.y, e.x - player.x);
        steerInto(e, e.x + Math.cos(away) * 15, e.y + Math.sin(away) * 8, e.def.speed * 1.3, dt, 4);
        if (e.def.mods && e.def.mods.indexOf('inflate') >= 0) e.inflate = Math.min(1, e.inflate + dt * 4);
      } else {
        if (e.def.mods && e.def.mods.indexOf('inflate') >= 0) e.inflate = Math.max(0, e.inflate - dt * 0.8);
        if (bottom) {
          var fy = HF.World.floorY(e.x) + e.def.r + 0.2;
          steerInto(e, e.x + Math.sin(e.t * 0.6 + e.ph) * 12, fy, e.def.speed, dt, 2);
        } else {
          var ty = M.clamp(e.y + Math.cos(e.t * 0.5 + e.ph) * 6, band.bot, band.top);
          steerInto(e, e.x + Math.sin(e.t * 0.4 + e.ph) * 14, ty, e.def.speed, dt, 1.6);
        }
      }
      integrate(e, dt);
    },

    flee: function (e, dt, player) {
      var band = depthBand(e);
      var pd2 = M.dist2(e.x, e.y, player.x, player.y);
      var sense = (e.def.senseR || 16);
      if (pd2 < sense * sense && playerThreat(e, player)) {
        e.fleeT = 1.2;
      }
      if (e.fleeT > 0) {
        e.fleeT -= dt;
        var away = Math.atan2(e.y - player.y, e.x - player.x);
        var ty = M.clamp(e.y + Math.sin(away) * 10, band.bot, band.top);
        steerInto(e, e.x + Math.cos(away) * 20, ty, e.def.speed, dt, 5);
      } else {
        var ty2 = M.clamp(e.y + Math.cos(e.t * 0.5 + e.ph) * 5, band.bot, band.top);
        e.t += dt;
        steerInto(e, e.x + Math.sin(e.t * 0.4 + e.ph) * 16, ty2, e.def.speed * 0.45, dt, 2);
      }
      integrate(e, dt);
    },

    chase: function (e, dt, player) {
      var band = depthBand(e);
      var ambush = e.def.mods && e.def.mods.indexOf('ambush') >= 0;
      var sense = e.def.senseR || 24;
      var pd2 = M.dist2(e.x, e.y, player.x, player.y);
      /* pet zaps set fleeT — a zapped chaser backs off instead of re-engaging */
      if (e.fleeT > 0) {
        e.fleeT -= dt;
        var zAway = Math.atan2(e.y - player.y, e.x - player.x);
        steerInto(e, e.x + Math.cos(zAway) * 16, M.clamp(e.y + Math.sin(zAway) * 8, band.bot, band.top), e.def.speed * 0.8, dt, 3);
        e.state = 0;
        integrate(e, dt);
        return;
      }
      var canHunt = player.effTier < e.def.tier && !player.dead && !(HF.Systems && HF.Systems.goldRush.active);

      if (canHunt && pd2 < sense * sense) {
        e.state = 1;
        steerInto(e, player.x, player.y, e.def.speed, dt, ambush ? 8 : 3.2);
      } else if (!canHunt && pd2 < 160 && playerThreat(e, player)) {
        /* I'm edible now — run */
        var away = Math.atan2(e.y - player.y, e.x - player.x);
        steerInto(e, e.x + Math.cos(away) * 18, M.clamp(e.y + Math.sin(away) * 8, band.bot, band.top), e.def.speed * 0.9, dt, 4);
        e.state = 0;
      } else {
        e.state = 0;
        if (ambush) {
          /* lurk nearly still */
          e.vx = M.damp(e.vx, 0, 3, dt); e.vy = M.damp(e.vy, Math.sin(e.t) * 0.2, 2, dt);
          e.t += dt;
        } else {
          e.t += dt;
          var ty = M.clamp(e.y + Math.cos(e.t * 0.4 + e.ph) * 6, band.bot, band.top);
          steerInto(e, e.x + Math.sin(e.t * 0.3 + e.ph) * 20, ty, e.def.speed * 0.5, dt, 2);
        }
      }
      integrate(e, dt);
    },

    /* static-ish dangers: jellies drift, mines bob, vents erupt */
    hazard: function (e, dt) {
      e.t += dt;
      if (e.def.kind === 'jelly') {
        e.vy = Math.sin(e.t * 0.8 + e.ph) * 0.5;
        e.vx = M.damp(e.vx, Math.sin(e.t * 0.23 + e.ph) * 0.3, 1, dt);
        e.x += e.vx * dt; e.y += e.vy * dt;
        var band = depthBand(e);
        e.y = M.clamp(e.y, band.bot, band.top);
        e.pitch = 0; /* jellies stay upright */
      } else if (e.def.kind === 'mine') {
        e.y += Math.sin(e.t * 0.7 + e.ph) * 0.15 * dt;
      } else if (e.def.vent) {
        /* eruption cycle: 5 s calm → 1 s warning bubbles → 3 s blast */
        e.ventT += dt;
        var cyc = e.ventT % 9;
        e.state = cyc > 6 ? 2 : (cyc > 5 ? 1 : 0);
        if (e.state === 1 && Math.random() < dt * 12) HF.Particles.bubbles(e.x, e.y + 1, 1, 0.6, 2);
        if (e.state === 2 && Math.random() < dt * 24) {
          HF.Particles.burst(e.x + M.rand(-0.5, 0.5), e.y + M.rand(1, 4), 0x39424E, 2, 2);
          HF.Particles.bubbles(e.x, e.y + 2, 2, 0.8, 5);
        }
      }
    },

    /* surface dwellers: swimmers bob, kayaks drift, gulls sit/fly, trawler cruises */
    surface: function (e, dt, player) {
      var isBird = e.def.mods && e.def.mods.indexOf('bird') >= 0;
      var isBoat = e.def.mods && e.def.mods.indexOf('boat') >= 0;
      e.t += dt;

      if (isBird) {
        /* state 0: sitting on the surface. state 1: airborne escape */
        var pd2 = M.dist2(e.x, e.y, player.x, player.y);
        if (e.state === 0) {
          e.y = HF.Water.heightAt(e.x) + 0.15;
          e.vx = M.damp(e.vx, Math.sin(e.t * 0.5) * 0.4, 1, dt);
          e.x += e.vx * dt;
          if (pd2 < 64 && (player.y > -6 || player.boosting)) { e.state = 1; e.vy = 5; }
        } else {
          /* fly up & away, come back down far away */
          e.vy = M.damp(e.vy, 2.2, 1.2, dt);
          e.vx = M.damp(e.vx, (e.dir || 1) * 5, 1.5, dt);
          e.x += e.vx * dt; e.y += e.vy * dt;
          if (e.y > 16) e.vy = -0.5;
          if (M.dist2(e.x, e.y, player.x, player.y) > 3600) { e.state = 0; }
          e.y = Math.max(e.y, HF.Water.heightAt(e.x) + 0.15);
        }
        if (Math.abs(e.vx) > 0.1) e.dir = e.vx < 0 ? -1 : 1;
        return; /* birds skip integrate (they handle y themselves) */
      }

      /* swimmers panic toward away-direction when player near&big */
      var pd2b = M.dist2(e.x, e.y, player.x, player.y);
      var scared = pd2b < 200 && playerThreat(e, player);
      if (scared) e.fleeT = 1.5;
      if (e.fleeT > 0) e.fleeT -= dt;
      var spd = e.fleeT > 0 ? e.def.speed * 2.6 : e.def.speed * 0.5;
      var dir = e.fleeT > 0 ? M.sign(e.x - player.x) : Math.sin(e.t * 0.2 + e.ph);
      e.vx = M.damp(e.vx, dir * spd, 2, dt);
      e.x += e.vx * dt;
      e.x = M.clamp(e.x, D.WORLD.X0 + 4, D.WORLD.X1 - 4);
      if (Math.abs(e.vx) > 0.08) e.dir = e.vx < 0 ? -1 : 1;
      if (!isBoat) {
        /* swimmer bobs in the waves */
        e.y = HF.Water.heightAt(e.x) - 0.25 + Math.sin(e.t * 2) * 0.08;
      }
      /* boats set their own y in entity render (wave height) */
    }
  };

  HF.AI = {
    update: function (dt, player) {
      var list = HF.Entities.list;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        var fn = PROTOS[e.def.proto];
        if (fn) fn(e, dt, player);
      }
    }
  };
})();

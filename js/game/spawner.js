/* ═══════════════════════════════════════════════════════════
   HF.Spawner — population manager.
   Every 0.5 s it audits the live population near the player
   and tops it up inside an off-screen ring; entities far past
   the despawn radius are recycled. Zone tables come straight
   from balance data (creature.zones + depth bands).
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Data', 'Entities');
  var M = HF.M, D = HF.Data;

  var auditT = 0;
  var counts = {};

  function viewRadius() {
    var cam = HF.Camera.cam;
    var half = (cam ? cam.position.z : 24) * Math.tan(25 * Math.PI / 180) * (cam ? cam.aspect : 1.7);
    if (!isFinite(half)) half = 12;
    return Math.max(half, 9);
  }

  function pickSpawnPos(def, px, py) {
    var R = viewRadius();
    var inner = R * D.SPAWN.RING_IN;
    for (var tries = 0; tries < 8; tries++) {
      var side = Math.random() < 0.5 ? -1 : 1;
      var x = px + side * (inner + Math.random() * D.SPAWN.RING_W);
      if (x < D.WORLD.X0 + 5 || x > D.WORLD.X1 - 5) continue;
      /* respect the species' zone list */
      var zi = HF.World.zoneIndexAt(x);
      if (def.zones.indexOf(zi) < 0) continue;
      var floor = HF.World.floorY(x);
      var y;
      if (def.proto === 'surface') y = HF.Water.heightAt(x) - 0.2;
      else {
        var top = -Math.max(def.depth[0], 0.5);
        var bot = Math.max(-def.depth[1], floor + def.r + 0.5);
        if (top <= bot) continue;
        y = M.rand(bot, top);
      }
      return { x: x, y: y };
    }
    return null;
  }

  HF.Spawner = {
    reset: function () { auditT = 0; },

    /* pre-fill around a position (run start) */
    warmup: function (px, py, boostFood) {
      for (var k = 0; k < 3; k++) HF.Spawner.audit(px, py, true);
      if (boostFood) {
        /* first-bite guarantee: a fat school right in front of the player */
        var anchor = { x: px + 10, y: py, vx: 0.4, vy: 0, t: 3 };
        for (var i = 0; i < 9; i++) {
          var e = HF.Entities.spawn('sardine', px + 5 + M.rand(0, 5), py + M.rand(-2.5, 2.5));
          if (e) e.schoolAnchor = anchor;
        }
        for (var p = 0; p < 3; p++) HF.Entities.spawn('parrot', px + 9 + p * 3, py + M.rand(-3, 3));
      }
    },

    audit: function (px, py, instant) {
      var zi = HF.World.zoneIndexAt(px);
      var target = D.SPAWN.TARGET[zi];
      var R = viewRadius();
      /* population is strictly LOCAL: anything past the spawn ring + margin
         is recycled, so the target count always surrounds the player */
      var despawnR = R * D.SPAWN.RING_IN + D.SPAWN.RING_W + 30;

      /* recycle far entities + census */
      for (var id in counts) counts[id] = 0;
      var list = HF.Entities.list;
      var total = 0;
      for (var i = list.length - 1; i >= 0; i--) {
        var e = list[i];
        if (Math.abs(e.x - px) > despawnR) { HF.Entities.despawn(e); continue; }
        counts[e.def.id] = (counts[e.def.id] || 0) + 1;
        total++;
      }
      if (total >= target) return;

      /* weighted top-up: prefer species valid for this zone & underfilled */
      var budget = instant ? (target - total) : Math.min(8, target - total);
      var candidates = [];
      D.CREATURES.forEach(function (def) {
        if (def.zones.indexOf(zi) < 0 && !(zi > 0 && def.zones.indexOf(zi - 1) >= 0)) return;
        var cur = counts[def.id] || 0;
        if (cur >= def.cap) return;
        /* small fish dominate; big things stay rare */
        var w = def.tier <= 2 ? 6 : def.tier === 3 ? 3 : def.tier <= 5 ? 1.6 : 0.7;
        if (def.proto === 'hazard') w *= 0.8;
        candidates.push({ def: def, w: w * (1 - cur / def.cap) });
      });
      if (!candidates.length) return;
      var wsum = 0;
      candidates.forEach(function (c) { wsum += c.w; });

      while (budget > 0) {
        var r = Math.random() * wsum, def = candidates[0].def;
        for (var c = 0; c < candidates.length; c++) {
          r -= candidates[c].w;
          if (r <= 0) { def = candidates[c].def; break; }
        }
        var pos = pickSpawnPos(def, px, py);
        if (pos) {
          if (def.proto === 'school' && def.school) {
            var n = M.randi(def.school[0], def.school[1]);
            var anchor = { x: pos.x, y: pos.y, vx: M.rand(-1, 1), vy: 0, t: 2 };
            for (var s = 0; s < n && budget > 0; s++) {
              var m = HF.Entities.spawn(def.id, pos.x + M.rand(-3, 3), pos.y + M.rand(-2, 2));
              if (m) { m.schoolAnchor = anchor; budget--; }
              else break;
            }
          } else {
            /* a capped/failed species just costs one attempt — never abort the audit */
            budget--;
            HF.Entities.spawn(def.id, pos.x, pos.y);
          }
        } else budget--;
      }
    },

    update: function (dt, player) {
      auditT += dt;
      if (auditT >= D.SPAWN.AUDIT) {
        auditT = 0;
        HF.Spawner.audit(player.x, player.y, false);
      }
    }
  };
})();

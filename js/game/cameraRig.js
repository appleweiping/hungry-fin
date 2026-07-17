/* ═══════════════════════════════════════════════════════════
   HF.Camera — side-view follow rig.
   Damped follow + velocity look-ahead, size-based zoom with a
   slow ceremony ease, boost FOV kick, simplex-ish trauma shake,
   cine override for boss intros / death shots, and screen→world
   unprojection onto the play plane (z=0).
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Data');
  var M = HF.M;

  var cam = null;
  var pos = { x: 60, y: -8 };
  var look = { x: 60, y: -8 };
  var dist = 22, distTgt = 22, distCeremony = 0;
  var trauma = 0, shakeT = 0;
  var cine = null;   // {x,y,dist,lock, t}
  var baseFov = 50;
  var kick = { x: 0, y: 0, vx: 0, vy: 0 };

  var ray = new THREE.Raycaster();
  var planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  var v3 = new THREE.Vector3();
  var ndc = new THREE.Vector2();

  HF.Camera = {
    cam: null,
    x: function () { return pos.x; },
    y: function () { return pos.y; },

    init: function () {
      var a = window.innerWidth / window.innerHeight;
      cam = new THREE.PerspectiveCamera(baseFov, isFinite(a) && a > 0 ? a : 16 / 9, 0.1, 1400);
      cam.position.set(pos.x, pos.y, dist);
      HF.Camera.cam = cam;
      HF.Events.on('resize', function (s) {
        var asp = s.w / s.h;
        if (isFinite(asp) && asp > 0) { cam.aspect = asp; cam.updateProjectionMatrix(); }
      });
      return cam;
    },

    addTrauma: function (v) { trauma = Math.min(1, trauma + v); },

    /* bite kick along a direction */
    biteKick: function (dx, dy, power) {
      kick.vx += dx * power; kick.vy += dy * power;
    },

    setCine: function (x, y, d, snap) {
      cine = { x: x, y: y, dist: d || dist };
      if (snap) { pos.x = x; pos.y = y; dist = cine.dist; }
    },
    clearCine: function () { cine = null; },

    /* distance target from shark length (called on grow/switch).
       pow<1 keeps big sharks impressive without losing the scene */
    fitTo: function (sharkLen) {
      distTgt = 7.5 * Math.pow(Math.max(sharkLen, 1.2) / 1.2, 0.75);
      distCeremony = 2.0;             // slow 2 s ease = "I grew" ritual
    },
    snapTo: function (x, y) { pos.x = look.x = x; pos.y = look.y = y; },

    update: function (dt, player) {
      var W = HF.Data.WORLD;
      if (cine) {
        pos.x = M.damp(pos.x, cine.x, 2.5, dt);
        pos.y = M.damp(pos.y, cine.y, 2.5, dt);
        dist = M.damp(dist, cine.dist, 2.5, dt);
      } else if (player) {
        /* look-ahead toward velocity */
        var sp = M.len(player.vx, player.vy);
        var la = M.clamp(sp * 0.55, 0, player.boosting ? 10 : 7);
        var tx = player.x + (sp > 0.5 ? (player.vx / sp) * la : 0);
        var ty = player.y + (sp > 0.5 ? (player.vy / sp) * la : 0) * 0.6;

        /* airborne: keep the waterline in frame */
        if (player.y > 0) { ty = Math.max(player.y * 0.45, 0); }

        pos.x = M.damp(pos.x, tx, 6, dt);
        pos.y = M.damp(pos.y, ty, 4.5, dt);

        var dTgt = distTgt * (player.boosting ? 1.07 : 1) * (player.y > 0 ? 1.15 : 1);
        var lam = distCeremony > 0 ? 1.6 : 4;
        distCeremony = Math.max(0, distCeremony - dt);
        dist = M.damp(dist, dTgt, lam, dt);
      }

      /* clamp inside world so edges never show void */
      var halfW = dist * Math.tan(baseFov * Math.PI / 360) * cam.aspect;
      pos.x = M.clamp(pos.x, W.X0 + halfW * 0.6, W.X1 - halfW * 0.6);
      pos.y = Math.max(pos.y, HF.World.floorY(pos.x) + 4);
      pos.y = Math.min(pos.y, 30);

      /* trauma shake: decays, drives noise offset */
      trauma = Math.max(0, trauma - dt * 1.2);
      shakeT += dt * 24;
      var sh = trauma * trauma;
      var shx = sh * 0.7 * (Math.sin(shakeT * 1.3) + Math.sin(shakeT * 2.7) * 0.5);
      var shy = sh * 0.7 * (Math.cos(shakeT * 1.7) + Math.sin(shakeT * 3.1) * 0.5);
      var roll = sh * 0.02 * Math.sin(shakeT * 2.1);

      /* bite kick spring */
      var K = 120, DAMP = 14;
      kick.vx += (-kick.x * K - kick.vx * DAMP) * dt;
      kick.vy += (-kick.y * K - kick.vy * DAMP) * dt;
      kick.x += kick.vx * dt; kick.y += kick.vy * dt;

      cam.position.set(pos.x + shx + kick.x, pos.y + shy + kick.y, dist);
      cam.lookAt(pos.x + shx + kick.x, pos.y + shy + kick.y, 0);
      cam.rotation.z += roll;

      /* boost FOV push */
      var fovTgt = baseFov + ((player && player.boosting) ? 6 : 0) + ((HF.Systems && HF.Systems.goldRush.active) ? 3 : 0);
      if (Math.abs(cam.fov - fovTgt) > 0.05) {
        cam.fov = M.damp(cam.fov, fovTgt, 6, dt);
        cam.updateProjectionMatrix();
      }
    },

    /* screen px → world point on z=0 plane */
    worldFromScreen: function (sx, sy) {
      ndc.set((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      ray.ray.intersectPlane(planeZ, v3);
      return { x: v3.x, y: v3.y };
    },
    screenFromWorld: function (wx, wy, wz) {
      v3.set(wx, wy, wz || 0).project(cam);
      return { x: (v3.x * 0.5 + 0.5) * window.innerWidth, y: (-v3.y * 0.5 + 0.5) * window.innerHeight, behind: v3.z > 1 };
    }
  };
})();

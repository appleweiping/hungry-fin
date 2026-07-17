/* ═══════════════════════════════════════════════════════════
   HF.Particles — pooled THREE.Points systems.
   Systems: bubbles (normal blend), burst shards, splash,
   gold aura (additive). CPU-updated ring buffers; a few
   hundred live particles is trivial per-frame work and keeps
   the code readable. 4 draw calls total.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Materials');
  var M = HF.M;

  var systems = {};
  var tmpColor = new THREE.Color();

  function makeSystem(name, cap, additive, scene) {
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(cap * 3);
    var col = new Float32Array(cap * 3);
    var size = new Float32Array(cap);
    var alpha = new Float32Array(cap);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    var pts = new THREE.Points(geo, HF.Materials.pointsMaterial({ additive: additive }));
    pts.frustumCulled = false;
    pts.renderOrder = 8;
    scene.add(pts);
    var parts = [];
    for (var i = 0; i < cap; i++) {
      parts.push({ live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 1, size: 1, r: 1, gcol: 1, b: 1, life: 0, maxLife: 1, wob: 0, ph: 0, shrink: false });
      alpha[i] = 0;
    }
    systems[name] = { pts: pts, geo: geo, parts: parts, cap: cap, cursor: 0, count: 0 };
    return systems[name];
  }

  function spawn(sys, o) {
    var s = systems[sys];
    var p = s.parts[s.cursor];
    s.cursor = (s.cursor + 1) % s.cap;
    p.live = true;
    p.x = o.x; p.y = o.y; p.z = o.z || M.rand(-0.5, 0.5);
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.g = o.g || 0; p.drag = o.drag !== undefined ? o.drag : 1;
    p.size = o.size || 0.4;
    tmpColor.setHex(o.color !== undefined ? o.color : 0xffffff);
    p.r = tmpColor.r; p.gcol = tmpColor.g; p.b = tmpColor.b;
    p.life = p.maxLife = o.life || 1;
    p.wob = o.wob || 0; p.ph = M.rand(0, 6);
    p.shrink = o.shrink !== false;
  }

  HF.Particles = {
    init: function (scene) {
      makeSystem('bubble', 320, false, scene);
      makeSystem('burst', 320, false, scene);
      makeSystem('splash', 220, false, scene);
      makeSystem('gold', 200, true, scene);
    },

    /* ── emitters ─────────────────────────────────────── */
    bubbles: function (x, y, n, spread, up) {
      for (var i = 0; i < n; i++) {
        spawn('bubble', {
          x: x + M.rand(-spread, spread), y: y + M.rand(-spread, spread),
          vx: M.rand(-0.3, 0.3), vy: (up || 1.4) + M.rand(0, 0.8),
          size: M.rand(0.08, 0.3), color: 0xCFEFF7, life: M.rand(0.8, 2.2), wob: 0.6, g: 0.4
        });
      }
    },
    burst: function (x, y, colorHex, n, power) {
      power = power || 3;
      for (var i = 0; i < n; i++) {
        var a = M.rand(0, M.TAU);
        var v = M.rand(0.3, 1) * power;
        spawn('burst', {
          x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8 + power * 0.15,
          g: -4, drag: 2.2, size: M.rand(0.12, 0.34), color: colorHex, life: M.rand(0.35, 0.7)
        });
      }
      /* star accents */
      for (var s = 0; s < Math.min(4, n >> 2); s++) {
        var a2 = M.rand(0, M.TAU);
        spawn('gold', { x: x, y: y, vx: Math.cos(a2) * power * 0.7, vy: Math.sin(a2) * power * 0.7, size: M.rand(0.3, 0.5), color: 0xFFF3B0, life: 0.45, drag: 3 });
      }
    },
    splash: function (x, y, n, dirY) {
      for (var i = 0; i < n; i++) {
        spawn('splash', {
          x: x + M.rand(-0.8, 0.8), y: y, z: M.rand(-1, 1),
          vx: M.rand(-2.5, 2.5), vy: (dirY || 1) * M.rand(2, 7),
          g: -12, size: M.rand(0.12, 0.4), color: 0xEAF8FF, life: M.rand(0.4, 0.9)
        });
      }
    },
    ringSplash: function (x, y, n) {
      for (var i = 0; i < n; i++) {
        var a = (i / n) * M.TAU;
        spawn('splash', { x: x, y: y, vx: Math.cos(a) * 5, vy: Math.abs(Math.sin(a)) * 4 + 1.5, g: -11, size: 0.3, color: 0xFFFFFF, life: 0.6 });
      }
    },
    goldTrail: function (x, y, n) {
      for (var i = 0; i < n; i++) {
        spawn('gold', { x: x + M.rand(-0.4, 0.4), y: y + M.rand(-0.4, 0.4), vx: M.rand(-0.5, 0.5), vy: M.rand(-0.2, 0.8), size: M.rand(0.2, 0.5), color: 0xFFD700, life: M.rand(0.4, 0.9), wob: 0.4 });
      }
    },
    zap: function (x, y) {
      for (var i = 0; i < 10; i++) {
        var a = M.rand(0, M.TAU);
        spawn('gold', { x: x, y: y, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, size: 0.25, color: 0x4CC9F0, life: 0.3, drag: 2 });
      }
    },
    boom: function (x, y) {
      HF.Particles.burst(x, y, 0xFF9F1C, 26, 7);
      HF.Particles.burst(x, y, 0x39424E, 18, 5);
      HF.Particles.bubbles(x, y, 20, 1.6, 3);
    },
    humanPoof: function (x, y) {
      HF.Particles.bubbles(x, y, 14, 0.6, 2.4);
      for (var i = 0; i < 5; i++) {
        spawn('gold', { x: x, y: y, vx: M.rand(-2, 2), vy: M.rand(1, 3), size: M.rand(0.35, 0.5), color: 0xF9F871, life: 0.6, g: -3 });
      }
    },

    update: function (dt, t) {
      for (var name in systems) {
        var s = systems[name];
        var live = 0;
        var posA = s.geo.attributes.position.array;
        var colA = s.geo.attributes.aColor.array;
        var sizeA = s.geo.attributes.aSize.array;
        var alphaA = s.geo.attributes.aAlpha.array;
        for (var i = 0; i < s.cap; i++) {
          var p = s.parts[i];
          if (!p.live) { alphaA[i] = 0; continue; }
          live++;
          p.life -= dt;
          if (p.life <= 0) { p.live = false; alphaA[i] = 0; continue; }
          var dr = Math.exp(-p.drag * dt);
          p.vx *= dr; p.vz *= dr;
          p.vy = p.vy * dr - p.g * dt;   // note: g<0 sinks, g>0 rises handled via sign
          p.x += p.vx * dt + (p.wob ? Math.sin(t * 5 + p.ph) * p.wob * dt : 0);
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          var k = p.life / p.maxLife;
          posA[i * 3] = p.x; posA[i * 3 + 1] = p.y; posA[i * 3 + 2] = p.z;
          colA[i * 3] = p.r; colA[i * 3 + 1] = p.gcol; colA[i * 3 + 2] = p.b;
          sizeA[i] = p.size * (p.shrink ? (0.4 + 0.6 * k) : 1);
          alphaA[i] = Math.min(1, k * 2.2);
        }
        /* one trailing upload after the last particle dies, then rest */
        if (live > 0 || s.wasLive) {
          s.geo.attributes.position.needsUpdate = true;
          s.geo.attributes.aColor.needsUpdate = true;
          s.geo.attributes.aSize.needsUpdate = true;
          s.geo.attributes.aAlpha.needsUpdate = true;
        }
        s.wasLive = live > 0;
        s.pts.visible = live > 0 || s.wasLive;
      }
    }
  };
})();

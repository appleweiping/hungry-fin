/* ═══════════════════════════════════════════════════════════
   HF core — namespace, require guard, math, RNG, events, pools
   Tier 1: zero dependencies.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var HF = window.HF = {
    VERSION: '1.0.0',
    DEBUG: /[?&]debug/.test(location.search)
  };

  /* Load-order insurance: modules call HF.require('M','Pool') at their top.
     A missing name means index.html script order is broken — fail loudly. */
  HF.require = function () {
    for (var i = 0; i < arguments.length; i++) {
      if (!(arguments[i] in HF)) {
        var msg = 'HF.require: missing module "' + arguments[i] + '" — check <script> order in index.html';
        console.error(msg);
        throw new Error(msg);
      }
    }
  };

  /* ── math ─────────────────────────────────────────────── */
  var M = HF.M = {
    TAU: Math.PI * 2,
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    clamp01: function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    /* frame-rate independent smoothing (exp decay). lambda ~ responsiveness */
    damp: function (a, b, lambda, dt) { return M.lerp(a, b, 1 - Math.exp(-lambda * dt)); },
    rand: function (a, b) {
      if (a === undefined) return Math.random();
      if (b === undefined) return Math.random() * a;
      return a + Math.random() * (b - a);
    },
    randi: function (a, b) { return Math.floor(M.rand(a, b + 1)); },
    pick: function (arr) { return arr[(Math.random() * arr.length) | 0]; },
    sign: function (v) { return v < 0 ? -1 : 1; },
    len: function (x, y) { return Math.sqrt(x * x + y * y); },
    dist2: function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; },
    dist: function (ax, ay, bx, by) { return Math.sqrt(M.dist2(ax, ay, bx, by)); },
    angLerp: function (a, b, t) {
      var d = (b - a) % M.TAU;
      if (d > Math.PI) d -= M.TAU;
      if (d < -Math.PI) d += M.TAU;
      return a + d * t;
    },
    smoothstep: function (a, b, v) {
      var t = M.clamp01((v - a) / (b - a));
      return t * t * (3 - 2 * t);
    },
    /* point-vs-segment closest distance² — used for swept mouth checks */
    segDist2: function (px, py, ax, ay, bx, by) {
      var abx = bx - ax, aby = by - ay;
      var d = abx * abx + aby * aby;
      var t = d > 0 ? M.clamp01(((px - ax) * abx + (py - ay) * aby) / d) : 0;
      var cx = ax + abx * t, cy = ay + aby * t;
      return M.dist2(px, py, cx, cy);
    },
    fmt: function (n) { return Math.round(n).toLocaleString('en-US'); }
  };

  /* ── seeded RNG (daily challenges must be deterministic) ── */
  HF.RNG = {
    mulberry32: function (seed) {
      var a = seed >>> 0;
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    /* "2026-07-17" → 32-bit seed via xmur3-style hash */
    seedFromString: function (str) {
      var h = 1779033703 ^ str.length;
      for (var i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
      }
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    },
    todayKey: function () {
      var d = new Date();
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      return d.getFullYear() + '-' + mm + '-' + dd;
    }
  };

  /* ── pub/sub ──────────────────────────────────────────── */
  var listeners = {};
  HF.Events = {
    on: function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); return fn; },
    off: function (name, fn) {
      var l = listeners[name]; if (!l) return;
      var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
    },
    emit: function (name, data) {
      var l = listeners[name]; if (!l) return;
      for (var i = 0; i < l.length; i++) {
        try { l[i](data); } catch (e) { console.error('[HF.Events:' + name + ']', e); }
      }
    }
  };

  /* ── generic object pool ──────────────────────────────── */
  HF.Pool = {
    make: function (createFn, resetFn, prealloc) {
      var free = [];
      for (var i = 0; i < (prealloc || 0); i++) free.push(createFn());
      return {
        get: function () {
          var o = free.length ? free.pop() : createFn();
          if (resetFn) resetFn(o);
          return o;
        },
        put: function (o) { free.push(o); }
      };
    }
  };

  /* ── fatal error overlay (file:// users don't open DevTools) ── */
  window.addEventListener('error', function (ev) {
    var el = document.getElementById('fatal');
    if (!el) return;
    el.classList.remove('hidden');
    el.textContent = '🦈 Brinefin hit a rock.\n\n' +
      (ev.message || 'unknown error') + '\n' +
      (ev.filename || '') + ':' + (ev.lineno || '') + '\n\n' +
      'Please report this at github — include the text above.\n' +
      (ev.error && ev.error.stack ? '\n' + ev.error.stack : '');
  });
})();

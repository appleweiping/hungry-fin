/* ═══════════════════════════════════════════════════════════
   HF.Save — localStorage persistence with versioned migration,
   throttled writes, and an in-memory fallback for private
   browsing / locked-down file:// contexts.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Events', 'Data');

  var KEY = 'hungryfin.save';
  var storageOk = true;
  var dirty = false, flushTimer = 0;

  function defaults() {
    return {
      v: 1,
      coins: 0,
      sharks: { pup: { owned: true, mastery: 0, masteryXP: 0 } },
      equipped: { shark: 'pup', pet: null, cosmetics: { head: null, body: null, tail: null } },
      cosmeticsOwned: {},
      petsOwned: {},
      achievements: {},        // id -> {done, at} or {progress}
      bossKills: {},           // id -> count
      chestsOpened: {},        // chestId -> true
      daily: { date: '', tasks: [], claimedAll: false, streak: 0, lastFullDate: '' },
      stats: {
        eaten: 0, swimmers: 0, chests: 0, mineKills: 0, coinsEarned: 0,
        bestScore: 0, bestCombo: 0, bestDepth: 0, bestSurvive: 0,
        deaths: 0, runs: 0, playTime: 0, distance: 0
      },
      settings: { sfx: 0.8, music: 0.55, quality: 2, sens: 1 },
      ftue: {}                 // seen hints
    };
  }

  var MIGRATIONS = { /* 1→2 would live here */ };

  HF.Save = {
    data: null,

    load: function () {
      var raw = null;
      try { raw = localStorage.getItem(KEY); }
      catch (e) { storageOk = false; console.warn('localStorage unavailable — session-only save'); }
      var d = defaults();
      if (raw) {
        try {
          var parsed = JSON.parse(raw);
          var ver = parsed.v || 1;
          while (MIGRATIONS[ver]) { parsed = MIGRATIONS[ver](parsed); ver = parsed.v; }
          d = deepMerge(d, parsed);
        } catch (e) {
          console.warn('save corrupted — starting fresh', e);
          try { localStorage.setItem(KEY + '.corrupt', raw); } catch (e2) { }
        }
      }
      HF.Save.data = d;
      return d;
    },

    mark: function () { dirty = true; },

    flush: function () {
      if (!dirty || !storageOk) return;
      dirty = false;
      try { localStorage.setItem(KEY, JSON.stringify(HF.Save.data)); }
      catch (e) { storageOk = false; }
    },

    tick: function (dt) {
      flushTimer += dt;
      if (flushTimer > 3) { flushTimer = 0; HF.Save.flush(); }
    },

    /* helpers */
    addCoins: function (n) {
      HF.Save.data.coins += n;
      if (n > 0) HF.Save.data.stats.coinsEarned += n;
      HF.Save.mark();
      HF.Events.emit('coins', HF.Save.data.coins);
    },
    spend: function (n) {
      if (HF.Save.data.coins < n) return false;
      HF.Save.data.coins -= n;
      HF.Save.mark();
      HF.Events.emit('coins', HF.Save.data.coins);
      return true;
    },
    ownsShark: function (id) { return !!(HF.Save.data.sharks[id] && HF.Save.data.sharks[id].owned); },
    maxOwnedTier: function () {
      var t = 1;
      HF.Data.SHARKS.forEach(function (s) { if (HF.Save.ownsShark(s.id) && s.tier > t) t = s.tier; });
      return t;
    },
    wipe: function () {
      HF.Save.data = defaults();
      /* bypass the storageOk latch — erase must work even after a
         quota failure earlier in the session */
      try { localStorage.removeItem(KEY); storageOk = true; } catch (e) { }
      dirty = true;
      HF.Save.flush();
    }
  };

  function deepMerge(base, over) {
    for (var k in over) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') {
        deepMerge(base[k], over[k]);
      } else base[k] = over[k];
    }
    return base;
  }

  window.addEventListener('beforeunload', function () { dirty = true; HF.Save.flush(); });
})();

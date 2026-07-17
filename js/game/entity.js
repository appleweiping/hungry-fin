/* ═══════════════════════════════════════════════════════════
   HF.Entities — pooled gameplay entities + per-species
   InstancedMesh slots + HF.Grid uniform spatial hash.
   Gameplay is strictly 2D (x, y); z is decorative jitter for
   depth layering. Humans/boats/whales use individual Groups.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Data', 'Builders', 'Materials');
  var M = HF.M, D = HF.Data;

  var scene = null;
  var species = {};          // id -> {def, mesh, free[], dummy}
  var entities = [];         // active list
  var pool = [];
  var dummy = new THREE.Object3D();
  var euler = new THREE.Euler();

  function makeEntity() {
    return {
      alive: false, def: null, x: 0, y: 0, z: 0, vx: 0, vy: 0,
      dir: 1, pitch: 0, scale: 1, hp: 1, bites: 0,
      slot: -1, group: null,          // instanced slot OR individual group
      state: 0, t: 0, ph: 0,          // generic AI scratch
      schoolAnchor: null, fleeT: 0, atkCd: 0,
      inflate: 0, ventT: 0, dead: false, id: 0, nextBiteAt: 0
    };
  }
  var nextId = 1;

  HF.Entities = {
    list: entities,

    init: function (sc) {
      scene = sc;
      /* build one InstancedMesh per instanced species */
      D.CREATURES.forEach(function (def) {
        if (def.kind === 'human' || def.kind === 'trawler') { species[def.id] = { def: def, individual: true, active: 0, pool: [] }; return; }
        var geo = HF.Builders.geoFor(def);
        var em = HF.Builders.emissiveFor(def);
        var mat = HF.Materials.flat(em ? { emissive: em.color, emissiveIntensity: em.intensity } : {});
        var sw = HF.Builders.swayFor(def);
        if (sw) {
          HF.Materials.addSway(mat, sw);
          /* static per-instance swim phase (see materials.js sway chunk) */
          var phases = new Float32Array(def.cap);
          for (var ph = 0; ph < def.cap; ph++) phases[ph] = Math.random() * 6.2832;
          geo.setAttribute('aHFPhase', new THREE.InstancedBufferAttribute(phases, 1));
        }
        var mesh = new THREE.InstancedMesh(geo, mat, def.cap);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        /* park all instances at scale 0 */
        dummy.position.set(0, -9999, 0); dummy.scale.setScalar(0.0001); dummy.updateMatrix();
        for (var i = 0; i < def.cap; i++) mesh.setMatrixAt(i, dummy.matrix);
        mesh.count = def.cap;
        scene.add(mesh);
        var free = [];
        for (var f = def.cap - 1; f >= 0; f--) free.push(f);
        species[def.id] = { def: def, mesh: mesh, free: free, active: 0 };
      });
    },

    count: function () { return entities.length; },

    spawn: function (defId, x, y) {
      var sp = species[defId];
      if (!sp) return null;
      if (sp.active >= sp.def.cap) return null;      // hard cap for ALL species
      var e = pool.length ? pool.pop() : makeEntity();
      var def = sp.def;
      e.alive = true; e.dead = false; e.def = def; e.id = nextId++;
      e.x = x; e.y = y;
      /* surface units must sit at z=0: the CPU wave-height mirror ignores z */
      e.z = def.proto === 'surface' ? 0 : M.rand(-1, 1) * Math.min(def.r * 2, 3);
      e.vx = M.rand(-0.5, 0.5); e.vy = M.rand(-0.2, 0.2);
      e.dir = Math.random() < 0.5 ? -1 : 1;
      e.pitch = 0; e.scale = M.rand(0.9, 1.1);
      e.hp = 1; e.bites = def.bites || 1; e.nextBiteAt = 0;
      e.state = 0; e.t = M.rand(0, 10); e.ph = M.rand(0, 6);
      e.schoolAnchor = null; e.fleeT = 0; e.atkCd = 0; e.inflate = 0; e.ventT = M.rand(0, 8);
      if (sp.individual) {
        e.slot = -1;
        /* pooled groups: humans/boats churn constantly — never rebuild or leak */
        var built = sp.pool.length ? sp.pool.pop() :
          (def.kind === 'trawler' ? HF.Builders.buildTrawler() : HF.Builders.buildHuman(def.human));
        e.group = built.group; e.anim = built.anim; e.built = built;
        scene.add(e.group);
      } else {
        if (!sp.free.length) { e.alive = false; pool.push(e); return null; }
        e.slot = sp.free.pop();
        e.group = null; e.anim = null;
        sp.mesh.visible = true;
      }
      sp.active++;
      entities.push(e);
      return e;
    },

    despawn: function (e) {
      if (!e.alive) return;
      e.alive = false;
      var sp = species[e.def.id];
      if (sp) sp.active = Math.max(0, sp.active - 1);
      if (e.slot >= 0 && sp && sp.mesh) {
        dummy.position.set(0, -9999, 0); dummy.scale.setScalar(0.0001); dummy.updateMatrix();
        sp.mesh.setMatrixAt(e.slot, dummy.matrix);
        sp.mesh.instanceMatrix.needsUpdate = true;
        sp.free.push(e.slot);
        if (sp.active === 0) sp.mesh.visible = false;   // empty species skip the draw
      }
      if (e.group) {
        scene.remove(e.group);
        if (sp && sp.pool) sp.pool.push(e.built);        // recycle, don't leak
        e.group = null; e.built = null;
      }
      var i = entities.indexOf(e);
      if (i >= 0) entities.splice(i, 1);
      pool.push(e);
    },

    despawnAll: function () {
      for (var i = entities.length - 1; i >= 0; i--) HF.Entities.despawn(entities[i]);
    },

    /* write instance matrices / group transforms after AI update */
    render: function () {
      var touched = {};
      for (var i = 0; i < entities.length; i++) {
        var e = entities[i];
        var def = e.def;
        if (e.slot >= 0) {
          var sp = species[def.id];
          dummy.position.set(e.x, e.y, e.z);
          var yaw = e.dir < 0 ? Math.PI : 0;
          var pitch = M.clamp(e.pitch, -0.7, 0.7) * (e.dir < 0 ? -1 : 1);
          euler.set(0, yaw, pitch);
          dummy.rotation.copy(euler);
          var s = e.scale * (1 + e.inflate * 0.7);
          dummy.scale.setScalar(Math.max(s, 0.0001));
          dummy.updateMatrix();
          sp.mesh.setMatrixAt(e.slot, dummy.matrix);
          touched[def.id] = true;
        } else if (e.group) {
          e.group.position.set(e.x, e.y, e.z);
          e.group.rotation.y = e.dir < 0 ? Math.PI : 0;
          e.group.rotation.z = M.clamp(e.pitch, -0.5, 0.5) * (e.dir < 0 ? -1 : 1);
          if (e.anim) animateIndividual(e);
        }
      }
      for (var id in touched) species[id].mesh.instanceMatrix.needsUpdate = true;
    }
  };

  /* rigid-limb wiggle for humans / bob for boats */
  function animateIndividual(e) {
    var a = e.anim;
    a.t += HF.Time.dt * (e.fleeT > 0 ? 3 : 1);
    if (a.limbs) {
      var k = Math.sin(a.t * 6);
      if (a.limbs.armL) { a.limbs.armL.rotation.x = k * 0.8; a.limbs.armR.rotation.x = -k * 0.8; }
      if (a.limbs.legL) { a.limbs.legL.rotation.x = -k * 0.6; a.limbs.legR.rotation.x = k * 0.6; }
    }
    if (a.paddle) a.paddle.rotation.z = Math.sin(a.t * 2.2) * 0.7;
    if (e.def.mods && e.def.mods.indexOf('boat') >= 0) {
      e.group.rotation.z += Math.sin(a.t * 1.3) * 0.03;
      e.group.position.y = HF.Water.heightAt(e.x) + (e.def.kind === 'trawler' ? 0.4 : 0.05);
    }
  }

  /* ── uniform spatial hash (cell 40 m) ────────────────── */
  var CELL = 40;
  var grid = new Map();
  HF.Grid = {
    rebuild: function () {
      grid.clear();
      for (var i = 0; i < entities.length; i++) {
        var e = entities[i];
        var key = ((e.x / CELL) | 0) * 4096 + ((e.y / CELL) | 0);
        var cell = grid.get(key);
        if (!cell) { cell = []; grid.set(key, cell); }
        cell.push(e);
      }
    },
    query: function (x, y, r, out) {
      out.length = 0;
      var x0 = ((x - r) / CELL) | 0, x1 = ((x + r) / CELL) | 0;
      var y0 = ((y - r) / CELL) | 0, y1 = ((y + r) / CELL) | 0;
      var r2 = r * r;
      for (var cx = x0; cx <= x1; cx++) {
        for (var cy = y0; cy <= y1; cy++) {
          var cell = grid.get(cx * 4096 + cy);
          if (!cell) continue;
          for (var i = 0; i < cell.length; i++) {
            var e = cell[i];
            if (M.dist2(x, y, e.x, e.y) <= r2) out.push(e);
          }
        }
      }
      return out;
    }
  };
})();

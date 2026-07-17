/* ═══════════════════════════════════════════════════════════
   HF.World — scene, lights, fog, seabed terrain, decorations,
   zone atmosphere blending, caustics sheet, hidden chests.
   The seabed is one long displaced strip; decorations are
   merged per-zone into a handful of draw calls.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Palette', 'Materials', 'ModelKit', 'Data');
  var M = HF.M, P = HF.Palette, K = HF.ModelKit, D = HF.Data;

  var scene, hemi, sunlight, fog;
  var caustics, causticsTex;
  var glowPulses = [];   // abyss glow sprites that breathe
  var chestMeshes = [];
  var seabedPts = [];    // sampled floor heights for fast lookup

  /* deterministic “noise” so terrain is stable between sessions */
  function tnoise(x) {
    return Math.sin(x * 0.011) * 0.55 + Math.sin(x * 0.031 + 2.1) * 0.3 + Math.sin(x * 0.087 + 4.7) * 0.15;
  }

  function floorDepth(x) {
    /* piecewise zone base depth + rolling noise; deep trench near squid lair */
    var z = D.WORLD.ZONES, d;
    if (x < z[0].x1) d = M.lerp(z[0].floorMin, z[0].floorMax, (tnoise(x) + 1) / 2);
    else if (x < z[1].x1) {
      var t = M.smoothstep(z[1].x0, z[1].x0 + 300, x);
      d = M.lerp(z[0].floorMax, M.lerp(z[1].floorMin, z[1].floorMax, (tnoise(x) + 1) / 2), t);
    } else {
      var t2 = M.smoothstep(z[2].x0, z[2].x0 + 250, x);
      d = M.lerp(z[1].floorMax, M.lerp(z[2].floorMin, z[2].floorMax, (tnoise(x) + 1) / 2), t2);
      var trench = Math.exp(-Math.pow((x - 2780) / 90, 2));
      d += trench * 60;
    }
    return d;
  }

  function zoneIndexAt(x) {
    var z = D.WORLD.ZONES;
    if (x < z[0].x1) return 0;
    if (x < z[1].x1) return 1;
    return 2;
  }

  function buildSeabed() {
    var X0 = D.WORLD.X0 - 100, X1 = D.WORLD.X1 + 100;
    var SEG = 340, DEPTH_Z = 90;
    var geo = new THREE.PlaneGeometry(X1 - X0, DEPTH_Z, SEG, 4);
    geo.rotateX(-Math.PI / 2);
    geo.translate((X0 + X1) / 2, 0, 0);
    var pos = geo.attributes.position;
    var colors = new Float32Array(pos.count * 3);
    var c = new THREE.Color(), cA = new THREE.Color(), cB = new THREE.Color();
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i);
      var zz = pos.getZ(i);
      var y = -floorDepth(x) + tnoise(x * 3 + zz) * 2 - Math.abs(zz) * 0.12;
      pos.setY(i, y);
      var zi = zoneIndexAt(x);
      var zp = P.zones[zi];
      cA.setHex(zp.seabed); cB.setHex(zp.seabedAlt);
      c.copy(cA).lerp(cB, (tnoise(x * 7 + zz * 3) + 1) / 2);
      /* blend across zone borders */
      var znext = zi < 2 ? P.zones[zi + 1] : zp;
      var border = zi < 2 ? M.smoothstep(D.WORLD.ZONES[zi].x1 - 120, D.WORLD.ZONES[zi].x1, x) : 0;
      cB.setHex(znext.seabed);
      c.lerp(cB, border);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    var nonIdx = geo.toNonIndexed();
    nonIdx.computeVertexNormals();
    var mesh = new THREE.Mesh(nonIdx, HF.Materials.flat());
    scene.add(mesh);

    /* cache floor heights every 4 m for gameplay queries */
    for (var s = 0; s <= (D.WORLD.X1 / 4) | 0; s++) seabedPts.push(-floorDepth(s * 4));
  }

  function scatterDecorations() {
    var batches = { 0: [], 1: [], 2: [] };
    var rng = HF.RNG.mulberry32(1337);

    function at(x, z) { return { x: x, y: -floorDepth(x) + 0.2, z: z !== undefined ? z : (rng() - 0.5) * 30 }; }

    /* zone 0: candy coral clusters + anemones + kelp */
    for (var i = 0; i < 70; i++) {
      var p = at(rng() * 880 + 10);
      var pal = P.zones[0].deco;
      var n = 2 + (rng() * 3 | 0);
      for (var k = 0; k < n; k++) {
        var col = pal.coral[(rng() * pal.coral.length) | 0];
        var h = 0.8 + rng() * 2.4;
        var g = rng() < 0.5 ? K.cone(h * 0.28, h, col, 5) : K.sphere(h * 0.4, col, 5);
        batches[0].push(K.xform(g, p.x + (rng() - 0.5) * 2.4, p.y + h * 0.4, p.z + (rng() - 0.5) * 2.4, 0, rng() * 6, (rng() - 0.5) * 0.4));
      }
    }
    for (var w = 0; w < 46; w++) {
      var p2 = at(rng() * 880 + 10);
      var h2 = 2 + rng() * 4;
      batches[0].push(K.xform(K.fin([[0, 0], [0.35, h2 * 0.5], [0.05, h2], [-0.3, h2 * 0.55]], 0.05, P.zones[0].deco.weed), p2.x, p2.y, p2.z, 0, rng() * 6, 0));
    }
    /* zone 1: rock pillars + shipwreck + buoys handled by boss arena */
    for (var r = 0; r < 26; r++) {
      var p3 = at(900 + rng() * 1150);
      var h3 = 6 + rng() * 22;
      batches[1].push(K.xform(K.cyl(1.2 + rng() * 2.4, 2.6 + rng() * 3, h3, P.zones[1].deco.rock, 6), p3.x, p3.y + h3 / 2 - 1, p3.z, 0, rng() * 6, (rng() - 0.5) * 0.16));
    }
    /* wreck (chest landmark) */
    var wx = 1560, wy = -floorDepth(1560);
    batches[1].push(K.xform(K.box(16, 3.4, 4.6, 0x6E4A38), wx, wy + 1.6, -6, 0, 0.2, 0.12));
    batches[1].push(K.xform(K.box(4, 5, 4, 0x5C4030), wx + 3, wy + 5, -6, 0, 0.2, 0));
    batches[1].push(K.xform(K.cyl(0.18, 0.22, 12, 0x4A3428, 5), wx - 4, wy + 7, -6, 0, 0, 0.5));

    /* zone 2: glow shroom pillars, bone arches, black smokers */
    for (var a = 0; a < 30; a++) {
      var p4 = at(2110 + rng() * 860);
      var pal2 = P.zones[2].deco;
      var h4 = 3 + rng() * 10;
      batches[2].push(K.xform(K.cyl(0.5 + rng(), 1 + rng(), h4, pal2.rock, 5), p4.x, p4.y + h4 / 2, p4.z, 0, rng() * 6, (rng() - 0.5) * 0.2));
      if (rng() < 0.75) {
        var gc = rng() < 0.5 ? pal2.glowA : pal2.glowB;
        batches[2].push(K.xform(K.sphere(0.5 + rng() * 0.5, gc, 6), p4.x, p4.y + h4 + 0.4, p4.z));
        glowPulses.push({ x: p4.x, y: p4.y + h4 + 0.4, z: p4.z, c: gc, ph: rng() * 6 });
      }
    }
    for (var b = 0; b < 4; b++) {
      var bx = 2200 + b * 180 + rng() * 60;
      var by = -floorDepth(bx);
      for (var rib = 0; rib < 5; rib++) {
        batches[2].push(K.xform(K.cyl(0.14, 0.2, 9 + rib, P.zones[2].deco.bone, 5), bx + rib * 2.2, by + (9 + rib) / 2 - 0.5, -4 + rib * 0.6, 0, 0, 0.5 - rib * 0.2));
      }
    }

    [0, 1, 2].forEach(function (z) {
      if (!batches[z].length) return;
      var mesh = new THREE.Mesh(K.merge(batches[z]), HF.Materials.flat());
      scene.add(mesh);
    });

    /* breathing glow sprites over abyss shrooms (few, cheap) */
    glowPulses.forEach(function (gp) {
      var sp = HF.Materials.glowSprite(gp.c, 4, 0.5);
      sp.position.set(gp.x, gp.y, gp.z);
      gp.sprite = sp;
      scene.add(sp);
    });

    /* background silhouettes for parallax depth (behind the play plane) */
    var silh = [];
    for (var s = 0; s < 40; s++) {
      var sx = rng() * 3000;
      var sy = -floorDepth(sx);
      var sh = 10 + rng() * 40;
      silh.push(K.xform(K.cone(4 + rng() * 9, sh, zoneIndexAt(sx) === 0 ? 0x2C7A8C : (zoneIndexAt(sx) === 1 ? 0x0F3B55 : 0x0A1120), 5), sx, sy + sh / 2 - 4, -55 - rng() * 45));
    }
    var sm = new THREE.Mesh(K.merge(silh), HF.Materials.flat());
    scene.add(sm);
  }

  function placeChests() {
    var rng = HF.RNG.mulberry32(4242);
    var geo = HF.Builders.chestGeo();
    var spots = [];
    [[60, 860], [960, 2050], [2150, 2960]].forEach(function (range) {
      for (var i = 0; i < D.CHESTS.PER_ZONE; i++) {
        spots.push(range[0] + rng() * (range[1] - range[0]));
      }
    });
    spots.forEach(function (x, idx) {
      var m = new THREE.Mesh(geo, HF.Materials.flat({ emissive: 0xFFC93C, emissiveIntensity: 0.12 }));
      m.position.set(x, -floorDepth(x) + 0.5, (idx % 3 - 1) * 6);
      m.rotation.y = rng() * 6;
      m.userData.chestId = 'chest' + idx;
      scene.add(m);
      chestMeshes.push(m);
    });
  }

  var curFog = new THREE.Color(), tgtFog = new THREE.Color();
  var curSun = new THREE.Color(), curHemiS = new THREE.Color(), curHemiG = new THREE.Color();
  /* scratch colours — the atmosphere blend runs every frame, zero allocations */
  var scrA = new THREE.Color(), scrB = new THREE.Color(), scrC = new THREE.Color();
  var zoneMsg = { waterTop: 0, waterMid: 0 };

  HF.World = {
    scene: null,
    zoneIndexAt: zoneIndexAt,
    floorY: function (x) {
      var i = M.clamp((x / 4) | 0, 0, seabedPts.length - 1);
      return seabedPts[i];
    },
    chests: chestMeshes,

    init: function () {
      scene = new THREE.Scene();
      HF.World.scene = scene;
      fog = new THREE.FogExp2(P.zones[0].fog, P.zones[0].fogDensity);
      scene.fog = fog;

      hemi = new THREE.HemisphereLight(P.zones[0].hemiSky, P.zones[0].hemiGround, P.zones[0].hemiIntensity);
      sunlight = new THREE.DirectionalLight(P.zones[0].sunColor, P.zones[0].sunIntensity);
      sunlight.position.set(0.25, 1, 0.35);
      scene.add(hemi, sunlight);

      buildSeabed();
      scatterDecorations();
      placeChests();

      /* caustics: additive scrolling sheet floating just under the surface,
         only meaningful in the shallows (fades with depth) */
      causticsTex = HF.Materials.causticsTexture();
      causticsTex.repeat.set(10, 2);
      caustics = new THREE.Mesh(
        new THREE.PlaneGeometry(240, 46),
        new THREE.MeshBasicMaterial({
          map: causticsTex, transparent: true, opacity: 0.15, fog: false,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        }));
      caustics.rotation.x = -Math.PI / 2;
      scene.add(caustics);
      return scene;
    },

    /* zone/depth atmosphere blending, glow breathing, caustics scroll */
    update: function (dt, t, px, py, quality) {
      var zi = zoneIndexAt(px);
      var zp = P.zones[zi];
      /* blend toward next zone near borders for smooth travel */
      var zBlend = 0, zNext = zp;
      if (zi < 2) {
        var x1 = D.WORLD.ZONES[zi].x1;
        zBlend = M.smoothstep(x1 - 160, x1 + 40, px);
        zNext = P.zones[zi + 1];
      }
      var depth = Math.max(0, -py);
      var depthK = M.clamp01(depth / 320);

      tgtFog.setHex(zp.fog).lerp(scrA.setHex(zNext.fog), zBlend);
      tgtFog.multiplyScalar(1 - depthK * 0.65);
      if (HF.Systems && HF.Systems.goldRush.active) tgtFog.lerp(scrA.setHex(P.goldRush.fog), 0.35);
      curFog.copy(fog.color);
      fog.color.copy(curFog.lerp(tgtFog, 1 - Math.exp(-2.5 * dt)));
      var tgtDen = M.lerp(zp.fogDensity, zNext.fogDensity, zBlend) * (1 + depthK * 0.9);
      if (py > 0.5) tgtDen = 0.0004;          // airborne: crystal clear
      fog.density = M.damp(fog.density, tgtDen, 3, dt);

      curSun.setHex(zp.sunColor).lerp(scrA.setHex(zNext.sunColor), zBlend);
      sunlight.color.copy(curSun);
      sunlight.intensity = M.damp(sunlight.intensity,
        M.lerp(zp.sunIntensity, zNext.sunIntensity, zBlend) * (1 - depthK * 0.8), 3, dt);
      curHemiS.setHex(zp.hemiSky).lerp(scrA.setHex(zNext.hemiSky), zBlend);
      curHemiG.setHex(zp.hemiGround).lerp(scrA.setHex(zNext.hemiGround), zBlend);
      hemi.color.copy(curHemiS); hemi.groundColor.copy(curHemiG);
      hemi.intensity = M.damp(hemi.intensity, M.lerp(zp.hemiIntensity, zNext.hemiIntensity, zBlend), 3, dt);

      zoneMsg.waterTop = zp.waterTop; zoneMsg.waterMid = zp.waterMid;
      HF.Water.setZone(zoneMsg);
      var goldK = (HF.Systems && HF.Systems.goldRush.active) ? 1 : 0;
      scrB.setHex(zp.waterMid).lerp(scrA.setHex(zNext.waterMid), zBlend);
      scrC.setHex(zp.waterDeep).lerp(scrA.setHex(zNext.waterDeep), zBlend);
      HF.Water.setBackdrop(scrB.getHex(), scrC.getHex(), depthK, goldK);

      /* caustics follow camera in shallows */
      var cvis = quality > 0 && zi === 0 && depth < 55;
      caustics.visible = cvis;
      if (cvis) {
        caustics.position.set(px, -1.6, 0);
        causticsTex.offset.x = t * 0.03;
        causticsTex.offset.y = Math.sin(t * 0.2) * 0.05;
        caustics.material.opacity = 0.15 * (1 - depth / 55);
      }

      for (var i = 0; i < glowPulses.length; i++) {
        var gp = glowPulses[i];
        if (Math.abs(gp.x - px) > 130) { gp.sprite.visible = false; continue; }
        gp.sprite.visible = true;
        gp.sprite.material.opacity = 0.3 + 0.25 * Math.sin(t * 2 + gp.ph);
      }

      /* chest idle sparkle spin */
      for (var c = 0; c < chestMeshes.length; c++) {
        var ch = chestMeshes[c];
        if (!ch.visible) continue;
        if (Math.abs(ch.position.x - px) < 130) ch.rotation.y += dt * 0.4;
      }
    }
  };
})();

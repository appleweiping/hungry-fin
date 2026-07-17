/* ═══════════════════════════════════════════════════════════
   HF.Builders — procedural generators for every creature,
   human, vehicle and prop. Instanced species get one merged
   geometry + one swaying material each; humans/boats/whales
   are individual Groups with simple rigid-limb animation.
   Local space: +X forward, +Y up.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'ModelKit', 'Materials', 'Palette', 'Data');
  var M = HF.M, K = HF.ModelKit, P = HF.Palette;

  /* generic small fish: loft + tail fin + eye dots */
  function fishGeo(len, colors, opts) {
    opts = opts || {};
    var H = len * (opts.fat || 0.18), W = H * 0.55;
    var duo = K.duoTone(colors.a, colors.b);
    var parts = [K.loft([
      { x: -len / 2, ry: W * 0.08, rz: H * 0.1 },
      { x: -len * 0.25, ry: W * 0.7, rz: H * 0.7 },
      { x: 0, ry: W, rz: H },
      { x: len * 0.28, ry: W * 0.85, rz: H * 0.85 },
      { x: len / 2, ry: W * 0.25, rz: H * 0.3 }
    ], duo, 7)];
    var T = len * 0.28;
    parts.push(K.xform(K.fin([[0, 0], [-T, T * 0.8], [-T * 0.5, 0], [-T, -T * 0.8]], len * 0.02, colors.fin || colors.a), -len / 2, 0, 0));
    parts.push(K.xform(K.fin([[0, 0], [-T * 0.6, T * 0.7], [-T * 0.8, 0]], len * 0.02, colors.fin || colors.a), len * 0.05, H, 0));
    if (opts.bill) parts.push(K.xform(K.cone(len * 0.025, len * 0.4, colors.b, 5), len * 0.68, 0, 0, 0, 0, -Math.PI / 2));
    if (opts.spines) for (var i = 0; i < 7; i++) {
      var a = (i / 6 - 0.5) * 2.2;
      parts.push(K.xform(K.cone(len * 0.02, len * 0.3, colors.b, 4), Math.cos(a) * len * 0.1, Math.sin(a) * H * 1.2, 0, 0, 0, a));
    }
    [1, -1].forEach(function (s) {
      parts.push(K.xform(K.sphere(Math.max(len * 0.035, 0.02), 0x101418, 5), len * 0.34, H * 0.25, s * W * 0.9));
    });
    return K.merge(parts);
  }

  function crabGeo(len, colors) {
    var parts = [K.xform(K.sphere(len * 0.55, colors.a, 7), 0, 0, 0, 0, 0, 0, new THREE.Vector3(1.3, 0.6, 1))];
    for (var i = 0; i < 3; i++) [1, -1].forEach(function (s) {
      parts.push(K.xform(K.cyl(len * 0.05, len * 0.03, len * 0.5, colors.a, 4),
        (i - 1) * len * 0.3, -len * 0.18, s * len * 0.5, s * 0.9, 0, 0));
    });
    [1, -1].forEach(function (s) {
      parts.push(K.xform(K.sphere(len * 0.18, colors.b, 5), len * 0.5, len * 0.1, s * len * 0.35));
    });
    parts.push(K.xform(K.sphere(len * 0.06, 0x101418, 4), len * 0.45, len * 0.32, len * 0.12));
    parts.push(K.xform(K.sphere(len * 0.06, 0x101418, 4), len * 0.45, len * 0.32, -len * 0.12));
    return K.merge(parts);
  }

  function turtleGeo(len, colors) {
    var parts = [
      K.xform(K.sphere(len * 0.42, colors.shell, 8), 0, len * 0.05, 0, 0, 0, 0, new THREE.Vector3(1.25, 0.55, 1)),
      K.xform(K.sphere(len * 0.16, colors.skin, 6), len * 0.55, 0, 0)
    ];
    [[len * 0.25, 1], [len * 0.25, -1], [-len * 0.3, 1], [-len * 0.3, -1]].forEach(function (f) {
      parts.push(K.xform(K.fin([[0, 0], [len * 0.3, -len * 0.16], [len * 0.42, 0]], len * 0.03, colors.skin), f[0], -len * 0.08, f[1] * len * 0.4, f[1] * 0.5, 0, 0));
    });
    return K.merge(parts);
  }

  function jellyGeo(len, colors) {
    var parts = [K.xform(K.sphere(len * 0.5, colors.a, 8), 0, len * 0.15, 0, 0, 0, 0, new THREE.Vector3(1, 0.7, 1))];
    for (var i = 0; i < 5; i++) {
      var a = (i / 5) * M.TAU;
      parts.push(K.xform(K.cyl(len * 0.03, len * 0.015, len * 0.9, colors.b, 4),
        Math.cos(a) * len * 0.22, -len * 0.35, Math.sin(a) * len * 0.22));
    }
    return K.merge(parts);
  }

  function squidGeo(len, colors) {
    var parts = [K.loft([
      { x: -len * 0.5, ry: len * 0.05, rz: len * 0.05 },
      { x: 0, ry: len * 0.16, rz: len * 0.18 },
      { x: len * 0.3, ry: len * 0.13, rz: len * 0.15 }
    ], K.duoTone(colors.a, colors.b), 7)];
    for (var i = 0; i < 4; i++) {
      var a = (i / 4) * M.TAU;
      parts.push(K.xform(K.cyl(len * 0.03, len * 0.01, len * 0.5, colors.b, 4),
        len * 0.42, Math.sin(a) * len * 0.08, Math.cos(a) * len * 0.08, 0, 0, Math.PI / 2 - 0.3));
    }
    parts.push(K.xform(K.sphere(len * 0.05, 0x101418, 4), len * 0.18, len * 0.08, len * 0.12));
    parts.push(K.xform(K.sphere(len * 0.05, 0x101418, 4), len * 0.18, len * 0.08, -len * 0.12));
    return K.merge(parts);
  }

  function pufferGeo(len, colors) {
    var parts = [K.sphere(len * 0.5, colors.a, 8)];
    for (var i = 0; i < 14; i++) {
      var th = Math.acos(2 * ((i + 0.5) / 14) - 1), ph = i * 2.4;
      var x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      var g = K.cone(len * 0.045, len * 0.22, colors.spike, 4);
      var m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, y, z), new THREE.Vector3(0, 1, 0));
      g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      g.applyMatrix4(m);
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(x * len * 0.5, y * len * 0.5, z * len * 0.5));
      parts.push(g);
    }
    parts.push(K.xform(K.sphere(len * 0.07, 0x101418, 4), len * 0.38, len * 0.15, len * 0.2));
    parts.push(K.xform(K.sphere(len * 0.07, 0x101418, 4), len * 0.38, len * 0.15, -len * 0.2));
    return K.merge(parts);
  }

  function rayGeo(len, colors) {
    /* diamond wing plate + tail whip */
    var parts = [K.fin([[len * 0.5, 0], [0, len * 0.45], [-len * 0.35, 0], [0, -len * 0.45]], len * 0.06, colors.a)];
    parts[0].applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2)); // lay flat: wings span z
    parts.push(K.xform(K.cyl(len * 0.02, len * 0.005, len * 0.5, colors.a, 4), -len * 0.55, 0, 0, 0, 0, Math.PI / 2));
    return K.merge(parts);
  }

  function gullGeo(len, colors) {
    var parts = [K.loft([
      { x: -len * 0.4, ry: len * 0.06, rz: len * 0.07 },
      { x: 0, ry: len * 0.16, rz: len * 0.18 },
      { x: len * 0.35, ry: len * 0.1, rz: len * 0.12 }
    ], K.duoTone(colors.a, colors.a), 6)];
    parts.push(K.xform(K.sphere(len * 0.12, colors.a, 5), len * 0.42, len * 0.12, 0));
    parts.push(K.xform(K.cone(len * 0.035, len * 0.16, colors.beak, 4), len * 0.56, len * 0.1, 0, 0, 0, -Math.PI / 2));
    [1, -1].forEach(function (s) {
      var w = K.fin([[0, 0], [len * 0.15, len * 0.5], [-len * 0.2, len * 0.55], [-len * 0.15, 0]], len * 0.02, colors.b);
      w.applyMatrix4(new THREE.Matrix4().makeRotationX(s * Math.PI / 2));
      parts.push(K.xform(w, 0, len * 0.1, s * len * 0.1));
    });
    return K.merge(parts);
  }

  function eelGeo(len, colors) {
    var st = [];
    for (var i = 0; i <= 8; i++) {
      var u = i / 8;
      var r = len * 0.05 * (0.4 + Math.sin(u * Math.PI) * 0.9);
      st.push({ x: (u - 0.5) * len, ry: r, rz: r * 1.4 });
    }
    var parts = [K.loft(st, K.duoTone(colors.a, colors.b), 6)];
    parts.push(K.xform(K.sphere(len * 0.035, 0x101418, 4), len * 0.42, len * 0.03, len * 0.045));
    parts.push(K.xform(K.sphere(len * 0.035, 0x101418, 4), len * 0.42, len * 0.03, -len * 0.045));
    return K.merge(parts);
  }

  function anglerGeo(len, colors) {
    var g = fishGeo(len, colors, { fat: 0.3 });
    var lure = K.merge([
      K.xform(K.cyl(len * 0.015, len * 0.01, len * 0.35, colors.a, 4), len * 0.32, len * 0.42, 0, 0, 0, 0.5),
      K.xform(K.sphere(len * 0.06, colors.lure, 6), len * 0.42, len * 0.58, 0)
    ]);
    /* jagged teeth */
    var teeth = [];
    for (var i = 0; i < 4; i++) {
      teeth.push(K.xform(K.cone(len * 0.02, len * 0.09, 0xF2F5F7, 4), len * (0.3 + i * 0.05), -len * 0.1, 0, Math.PI, 0, 0));
    }
    return K.merge([g, lure, K.merge(teeth)]);
  }

  function sealionGeo(len, colors) {
    var parts = [K.loft([
      { x: -len * 0.5, ry: len * 0.05, rz: len * 0.06 },
      { x: -len * 0.1, ry: len * 0.16, rz: len * 0.2 },
      { x: len * 0.25, ry: len * 0.14, rz: len * 0.17 },
      { x: len * 0.5, ry: len * 0.07, rz: len * 0.09 }
    ], K.duoTone(colors.a, colors.b), 7)];
    parts.push(K.xform(K.fin([[0, 0], [-len * 0.2, -len * 0.14], [-len * 0.28, 0]], len * 0.02, colors.a), len * 0.1, -len * 0.14, len * 0.1, 0.6, 0, 0));
    parts.push(K.xform(K.fin([[0, 0], [-len * 0.2, -len * 0.14], [-len * 0.28, 0]], len * 0.02, colors.a), len * 0.1, -len * 0.14, -len * 0.1, -0.6, 0, 0));
    parts.push(K.xform(K.sphere(len * 0.04, 0x101418, 4), len * 0.46, len * 0.06, len * 0.05));
    parts.push(K.xform(K.sphere(len * 0.04, 0x101418, 4), len * 0.46, len * 0.06, -len * 0.05));
    return K.merge(parts);
  }

  function orcaGeo(len, colors) {
    var g = fishGeo(len, { a: colors.a, b: colors.a }, { fat: 0.22 });
    /* white belly + eye patches painted as separate shapes */
    var patches = K.merge([
      K.xform(K.sphere(len * 0.09, colors.b, 5), len * 0.3, len * 0.13, len * 0.11, 0, 0, 0, new THREE.Vector3(1.6, 0.7, 0.5)),
      K.xform(K.sphere(len * 0.09, colors.b, 5), len * 0.3, len * 0.13, -len * 0.11, 0, 0, 0, new THREE.Vector3(1.6, 0.7, 0.5)),
      K.xform(K.sphere(len * 0.3, colors.b, 6), -len * 0.02, -len * 0.16, 0, 0, 0, 0, new THREE.Vector3(1.5, 0.35, 0.75))
    ]);
    var dorsal = K.xform(K.fin([[0, 0], [-len * 0.12, len * 0.3], [-len * 0.2, 0]], len * 0.02, colors.a), len * 0.05, len * 0.2, 0);
    return K.merge([g, patches, dorsal]);
  }

  function whaleGeo(len, colors) {
    var st = [];
    for (var i = 0; i <= 10; i++) {
      var u = i / 10;
      var r = 0.16 * len * (u < 0.75 ? (0.35 + Math.sin(Math.min(u / 0.75, 1) * Math.PI) * 0.75) : (1.05 - u) * 1.9);
      st.push({ x: (u - 0.5) * len, ry: Math.max(r * 0.8, len * 0.008), rz: Math.max(r, len * 0.01), yOff: -u * u * len * 0.02 });
    }
    st.reverse().forEach(function (s) { s.x = -s.x; }); // head at +x
    var parts = [K.loft(st, K.duoTone(colors.a, colors.b), 8)];
    var T = len * 0.16;
    var fl = K.fin([[0, 0], [-T, T * 0.7], [-T * 0.5, 0], [-T, -T * 0.7]], len * 0.02, colors.a);
    fl.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2)); // horizontal fluke
    parts.push(K.xform(fl, -len * 0.5, 0, 0));
    parts.push(K.xform(K.fin([[0, 0], [-T * 0.8, -T * 0.5], [-T * 1.1, 0]], len * 0.015, colors.a), len * 0.18, -len * 0.13, len * 0.12, 0.7, 0, 0));
    parts.push(K.xform(K.fin([[0, 0], [-T * 0.8, -T * 0.5], [-T * 1.1, 0]], len * 0.015, colors.a), len * 0.18, -len * 0.13, -len * 0.12, -0.7, 0, 0));
    parts.push(K.xform(K.sphere(len * 0.012, 0x101418, 4), len * 0.42, len * 0.03, len * 0.07));
    return K.merge(parts);
  }

  function mineGeo(len, colors) {
    var parts = [K.sphere(len * 0.5, colors.a, 8)];
    for (var i = 0; i < 8; i++) {
      var th = Math.acos(2 * ((i + 0.5) / 8) - 1), ph = i * 2.4;
      var x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      parts.push(K.xform(K.cyl(len * 0.05, len * 0.08, len * 0.3, colors.spike, 5),
        x * len * 0.55, y * len * 0.55, z * len * 0.55, Math.atan2(z, y) + (Math.abs(y) > 0.9 ? 0 : 0), 0, -Math.atan2(x, y)));
    }
    parts.push(K.xform(K.sphere(len * 0.08, colors.light, 5), 0, len * 0.62, 0));
    return K.merge(parts);
  }

  function subGeo(len, colors) {
    var parts = [K.loft([
      { x: -len * 0.5, ry: len * 0.1, rz: len * 0.1 },
      { x: 0, ry: len * 0.16, rz: len * 0.16 },
      { x: len * 0.5, ry: len * 0.08, rz: len * 0.08 }
    ], K.duoTone(colors.a, colors.b), 8)];
    parts.push(K.xform(K.sphere(len * 0.11, colors.glass, 6), len * 0.24, len * 0.13, 0));
    parts.push(K.xform(K.box(len * 0.02, len * 0.16, len * 0.02, colors.b), -len * 0.1, len * 0.2, 0));
    [1, -1].forEach(function (s) {
      parts.push(K.xform(K.cyl(len * 0.04, len * 0.04, len * 0.06, colors.b, 6), -len * 0.45, 0, s * len * 0.12, Math.PI / 2, 0, 0));
    });
    return K.merge(parts);
  }

  function ventGeo(len, colors) {
    return K.merge([
      K.cone(len * 0.7, len * 1.1, 0x1B263B, 7),
      K.xform(K.cyl(len * 0.18, len * 0.25, len * 0.3, 0x0D1320, 6), 0, len * 0.6, 0)
    ]);
  }

  function lionfishGeo(len, colors) { return fishGeo(len, colors, { spines: true, fat: 0.22 }); }

  function sharkNPCGeo(len, colors) {
    /* simplified rival shark for instancing */
    var g = fishGeo(len, colors, { fat: 0.16 });
    var fin = K.xform(K.fin([[0, 0], [-len * 0.14, len * 0.22], [-len * 0.24, 0]], len * 0.02, colors.a), len * 0.02, len * 0.16, 0);
    return K.merge([g, fin]);
  }

  /* ── instanced species geometry dispatch ── */
  var GEO_FNS = {
    fish: fishGeo, crab: crabGeo, turtle: turtleGeo, jelly: jellyGeo, squid: squidGeo,
    puffer: pufferGeo, ray: rayGeo, gull: gullGeo, eel: eelGeo, angler: anglerGeo,
    sealion: sealionGeo, orca: orcaGeo, whale: whaleGeo, mine: mineGeo, sub: subGeo,
    vent: ventGeo, lionfish: lionfishGeo, shark: sharkNPCGeo
  };

  var SWAY_BY_KIND = {
    fish: { mode: 0, amp: 0.10, freq: 7 }, shark: { mode: 0, amp: 0.07, freq: 5 },
    eel: { mode: 0, amp: 0.16, freq: 4 }, angler: { mode: 0, amp: 0.08, freq: 5 },
    sealion: { mode: 0, amp: 0.06, freq: 4 }, orca: { mode: 0, amp: 0.05, freq: 3.5 },
    whale: { mode: 0, amp: 0.03, freq: 1.6 }, squid: { mode: 0, amp: 0.08, freq: 5 },
    jelly: { mode: 2, amp: 0.10, freq: 2.5 }, ray: { mode: 1, amp: 0.22, freq: 2.2 },
    gull: { mode: 1, amp: 0.3, freq: 8 }, turtle: { mode: 1, amp: 0.06, freq: 2 },
    puffer: { mode: 0, amp: 0.03, freq: 6 }, crab: null, mine: null, sub: null, vent: null,
    lionfish: { mode: 0, amp: 0.06, freq: 5 }
  };

  /* ── humans (chibi primitive dolls riding gear) ── */
  function humanCore(skin, suit) {
    var g = new THREE.Group();
    var torso = K.mesh(K.xform(K.sphere(0.16, suit, 6), 0, 0, 0, 0, 0, 0, new THREE.Vector3(0.8, 1.25, 0.7)));
    var head = K.mesh(K.sphere(0.14, skin, 7)); head.position.y = 0.34;
    /* two dot eyes */
    var e1 = K.mesh(K.sphere(0.018, 0x101418, 4)); e1.position.set(0.115, 0.37, 0.05);
    var e2 = K.mesh(K.sphere(0.018, 0x101418, 4)); e2.position.set(0.115, 0.37, -0.05);
    g.add(torso, head, e1, e2);
    var limbs = {};
    [['armL', 0.05, 0.12, 0.16], ['armR', 0.05, 0.12, -0.16], ['legL', 0, -0.2, 0.08], ['legR', 0, -0.2, -0.08]].forEach(function (l) {
      var isArm = l[0][0] === 'a';
      var m = K.mesh(K.xform(K.cyl(0.045, 0.035, isArm ? 0.26 : 0.3, skin, 5), 0, isArm ? -0.11 : -0.13, 0));
      m.position.set(l[1], l[2], l[3]);
      g.add(m); limbs[l[0]] = m;
    });
    return { group: g, limbs: limbs, head: head };
  }

  function buildHuman(type) {
    var suit = M.pick(P.human.suits);
    var root = new THREE.Group();
    var anim = { limbs: null, type: type, t: M.rand(0, 6) };
    if (type === 'swimmer') {
      var ring = K.mesh(K.torus(0.42, 0.13, M.pick(P.human.ring)));
      ring.rotation.x = Math.PI / 2;
      var c = humanCore(P.human.skin, suit);
      c.group.position.y = 0.28;
      root.add(ring, c.group);
      anim.limbs = c.limbs;
    } else if (type === 'diver') {
      var c2 = humanCore(P.human.skin, P.human.diveSuit);
      c2.group.rotation.z = -Math.PI / 2.2;   // horizontal swimming pose
      var tank = K.mesh(K.cyl(0.09, 0.09, 0.3, P.human.tank, 6));
      tank.position.set(-0.16, 0.05, 0);
      tank.rotation.z = -Math.PI / 2.2;
      var mask = K.mesh(K.box(0.06, 0.08, 0.16, 0x4CC9F0));
      mask.position.set(0.42, 0.12, 0);
      root.add(c2.group, tank, mask);
      anim.limbs = c2.limbs;
    } else { // kayaker
      var hull = K.mesh(K.loft([
        { x: -1.2, ry: 0.02, rz: 0.02 }, { x: 0, ry: 0.3, rz: 0.14 }, { x: 1.2, ry: 0.02, rz: 0.02 }
      ], K.duoTone(M.pick(P.human.kayak), 0xF2E8CF), 6));
      var c3 = humanCore(P.human.skin, suit);
      c3.group.position.y = 0.42; c3.group.scale.setScalar(0.9);
      var paddle = K.mesh(K.merge([
        K.cyl(0.02, 0.02, 1.4, P.human.paddle, 5),
        K.xform(K.box(0.02, 0.24, 0.14, P.human.paddle), 0, 0.7, 0),
        K.xform(K.box(0.02, 0.24, 0.14, P.human.paddle), 0, -0.7, 0)
      ]));
      paddle.rotation.x = Math.PI / 2;
      paddle.position.y = 0.55;
      root.add(hull, c3.group, paddle);
      anim.limbs = c3.limbs; anim.paddle = paddle;
    }
    return { group: root, anim: anim };
  }

  function buildTrawler() {
    var root = new THREE.Group();
    var C = P.critters.trawler;
    var hull = K.mesh(K.loft([
      { x: -4, ry: 0.3, rz: 0.5, yOff: 0.5 }, { x: -1, ry: 1.3, rz: 0.9 }, { x: 2.6, ry: 1.1, rz: 0.85 }, { x: 4, ry: 0.15, rz: 0.7, yOff: 0.5 }
    ], K.duoTone(C.hull, C.hull), 7));
    var cabin = K.mesh(K.box(1.6, 1.2, 1.6, C.deck)); cabin.position.set(1, 1.4, 0);
    var mast = K.mesh(K.cyl(0.08, 0.1, 2.6, C.mast, 5)); mast.position.set(-1.6, 2, 0);
    var boom = K.mesh(K.cyl(0.05, 0.05, 2.4, C.mast, 5)); boom.rotation.z = 1.1; boom.position.set(-2.4, 1.8, 0);
    root.add(hull, cabin, mast, boom);
    return { group: root, anim: { t: 0 } };
  }

  HF.Builders = {
    geoFor: function (def) {
      var fn = GEO_FNS[def.kind];
      if (!fn) throw new Error('no geometry builder for kind ' + def.kind);
      return fn(def.len, def.colors || { a: 0x888888, b: 0xcccccc });
    },
    swayFor: function (def) {
      var s = SWAY_BY_KIND[def.kind];
      if (!s) return null;
      return { mode: s.mode, amp: s.amp * def.len, freq: s.freq, len: def.len };
    },
    emissiveFor: function (def) {
      if (def.kind === 'jelly') return { color: 0x9BF6FF, intensity: 0.5 };
      if (def.kind === 'angler') return { color: 0xCFF7FF, intensity: 0.35 };
      if (def.kind === 'mine') return { color: 0xFF3333, intensity: 0.4 };
      if (def.id === 'volt') return { color: 0x4CC9F0, intensity: 0.45 };
      return null;
    },
    buildHuman: buildHuman,
    buildTrawler: buildTrawler,

    /* coins: shared instanced disc */
    coinGeo: function () {
      var g = K.merge([
        K.xform(K.cyl(0.22, 0.22, 0.07, P.coin, 10), 0, 0, 0, Math.PI / 2, 0, 0),
        K.xform(K.cyl(0.13, 0.13, 0.075, 0xFFE9A8, 8), 0, 0, 0, Math.PI / 2, 0, 0)
      ]);
      return g;
    },
    chestGeo: function () {
      var C = P.critters.chest;
      return K.merge([
        K.box(0.9, 0.5, 0.6, C.a),
        K.xform(K.cyl(0.32, 0.32, 0.88, C.a, 7), 0, 0.25, 0, 0, 0, Math.PI / 2),
        K.xform(K.box(0.94, 0.1, 0.64, C.b), 0, 0.12, 0),
        K.xform(K.box(0.16, 0.2, 0.06, C.b), 0, 0.2, 0.31)
      ]);
    }
  };
})();

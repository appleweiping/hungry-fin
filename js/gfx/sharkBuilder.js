/* ═══════════════════════════════════════════════════════════
   HF.SharkBuilder — one parametric generator, seven sharks.
   Body + fins are merged into a single swaying mesh; the lower
   jaw is a separate mesh with its pivot at the jaw joint so it
   can chomp. Sockets (empty Object3D) expose attachment points
   for cosmetics, particles and pets.
   Local space: +X = forward (head), +Y = up. Length ≈ def.len.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'ModelKit', 'Materials', 'Data');
  var M = HF.M, K = HF.ModelKit;

  var cache = {};

  /* body half-height profile (u: 0 tail → 1 head), classic shark silhouette */
  function bodyProfile(u, head) {
    var r;
    if (u < 0.12) r = M.lerp(0.02, 0.30, u / 0.12);            // tail root
    else if (u < 0.62) r = M.lerp(0.30, 1.0, M.smoothstep(0.12, 0.62, u)); // to widest
    else if (u < 0.9) r = M.lerp(1.0, 0.62, M.smoothstep(0.62, 0.9, u));   // toward head
    else {
      var t = (u - 0.9) / 0.1;
      r = head === 'blunt' ? M.lerp(0.62, 0.42, t) :
          head === 'sharp' ? M.lerp(0.62, 0.12, t) :
          M.lerp(0.62, 0.3, t);                                 // round
    }
    return r;
  }

  function build(def) {
    var L = def.len;
    var H = L * 0.135;                 // half-height at widest
    var W = H * 0.72;                  // half-width
    var col = def.colors;
    var paintDuo = K.duoTone(col.dorsal, col.belly);
    var parts = [];

    /* ── body loft (upper jaw included) ── */
    var stations = [];
    var N = 13;
    for (var i = 0; i <= N; i++) {
      var u = i / N;
      var p = bodyProfile(u, def.head);
      var st = { x: (u - 0.5) * L, ry: W * p, rz: H * p, yOff: H * 0.10 * Math.sin(u * Math.PI) };
      if (def.head === 'hammer' && u > 0.88) st.ry = W * p * (1 + (u - 0.88) * 22); // T-head flare
      stations.push(st);
    }
    parts.push(K.loft(stations, paintDuo, 9));

    /* ── tail fin (crescent) ── */
    var T = L * 0.30;
    parts.push(K.xform(K.fin([[0, 0], [-T * 0.72, T * 0.72], [-T * 0.44, T * 0.12], [-T * 0.62, -T * 0.5], [-T * 0.18, -T * 0.06]], L * 0.02, col.fin), -L * 0.5, 0, 0));
    /* dorsal fin */
    var Df = L * 0.16;
    parts.push(K.xform(K.fin([[0, 0], [-Df * 1.1, Df * 1.25], [-Df * 1.35, 0]], L * 0.018, col.fin), L * 0.06, H * 0.92, 0));
    /* pectoral fins (angled down-out) */
    var Pf = L * 0.15;
    [1, -1].forEach(function (s) {
      parts.push(K.xform(K.fin([[0, 0], [-Pf * 1.5, -Pf * 0.9], [-Pf * 0.4, -Pf * 0.15]], L * 0.015, col.fin),
        L * 0.13, -H * 0.45, s * W * 0.8, s * 0.55, 0, 0));
    });
    /* small second dorsal + anal fin for silhouette richness */
    parts.push(K.xform(K.fin([[0, 0], [-Df * 0.5, Df * 0.5], [-Df * 0.62, 0]], L * 0.015, col.fin), -L * 0.28, H * 0.55, 0));
    parts.push(K.xform(K.fin([[0, 0], [-Df * 0.45, -Df * 0.4], [-Df * 0.55, 0]], L * 0.015, col.fin), -L * 0.26, -H * 0.5, 0));

    /* gill slits: three thin dark boxes */
    for (var g = 0; g < 3; g++) {
      [1, -1].forEach(function (s) {
        parts.push(K.xform(K.box(L * 0.012, H * 0.5, L * 0.012, col.accent),
          L * (0.24 - g * 0.035), H * 0.08, s * W * 0.78, 0.2 * s, 0, 0));
      });
    }

    var bodyGeo = K.merge(parts);
    var bodyMat = HF.Materials.flat();
    var sway = HF.Materials.addSway(bodyMat, { len: L, amp: L * 0.045, freq: 6, mode: 0 });
    var body = new THREE.Mesh(bodyGeo, bodyMat);

    /* ── lower jaw: separate chomping mesh ── */
    var jawL = L * 0.16, jawW = W * 0.8, jawH = H * 0.22;
    var jawGeo = K.merge([
      K.xform(K.loft([
        { x: 0, ry: jawW, rz: jawH },
        { x: jawL * 0.7, ry: jawW * 0.8, rz: jawH * 0.8 },
        { x: jawL, ry: jawW * 0.4, rz: jawH * 0.45 }
      ], K.duoTone(col.belly, col.belly), 7), 0, 0, 0),
      /* teeth: tiny white cones along the jaw rim */
      teethRow(jawL, jawW, jawH, 4)
    ]);
    var jaw = new THREE.Mesh(jawGeo, HF.Materials.flat());
    var headX = L * (0.5 - 0.13);
    jaw.position.set(headX - jawL * 0.55, -H * 0.36, 0);

    /* upper teeth (static, hint of menace when mouth opens) */
    var upTeeth = new THREE.Mesh(teethRow(jawL * 0.9, jawW * 0.9, jawH, 4, true), HF.Materials.flat());
    upTeeth.position.set(headX - jawL * 0.45, -H * 0.18, 0);

    /* ── eyes ── */
    var eyeR = Math.max(L * 0.02, 0.03);
    var eyes = [];
    [1, -1].forEach(function (s) {
      var e = new THREE.Mesh(K.sphere(eyeR, 0x101418, 6), HF.Materials.flat());
      var ex = def.head === 'hammer' ? L * 0.485 : L * 0.36;
      var ez = def.head === 'hammer' ? W * 3.1 : W * 0.86;
      e.position.set(ex, H * 0.28, s * ez);
      eyes.push(e);
    });

    /* ── group + sockets ── */
    var group = new THREE.Group();
    group.add(body, jaw, upTeeth);
    eyes.forEach(function (e) { group.add(e); });

    var sockets = {};
    [['mouth', headX + L * 0.03, -H * 0.25, 0],
     ['head', L * 0.38, H * 0.75, 0],
     ['body', 0, H * 1.0, 0],
     ['dorsal', L * 0.02, H * 1.75, 0],
     ['tail', -L * 0.5, 0, 0],
     ['eyes', L * 0.38, H * 0.3, 0]].forEach(function (s) {
      var o = new THREE.Object3D();
      o.position.set(s[1], s[2], s[3]);
      o.name = 'socket_' + s[0];
      group.add(o);
      sockets[s[0]] = o;
    });

    /* accent glow for the abyss shark */
    if (def.id === 'rift') {
      var gl = HF.Materials.glowSprite(col.accent, L * 0.5, 0.35);
      gl.position.set(L * 0.1, 0, 0);
      group.add(gl);
    }

    return { group: group, jaw: jaw, sway: sway, sockets: sockets, len: L, halfH: H, def: def };
  }

  function teethRow(jawL, jawW, jawH, n, flip) {
    var teeth = [];
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1);
      var x = jawL * (0.25 + t * 0.65);
      [1, -1].forEach(function (s) {
        teeth.push(K.xform(K.cone(jawL * 0.05, jawL * 0.16, 0xF2F5F7, 4),
          x, flip ? -jawH * 0.5 : jawH * 0.45, s * jawW * (0.55 - t * 0.2) * 0.8,
          flip ? Math.PI : 0, 0, 0));
      });
    }
    return K.merge(teeth);
  }

  HF.SharkBuilder = {
    /* returns a FRESH group each call (cached geometry via closure would
       complicate jaw pivots; shark builds are rare — menu + spawn only) */
    build: function (sharkId) {
      var def = null;
      for (var i = 0; i < HF.Data.SHARKS.length; i++)
        if (HF.Data.SHARKS[i].id === sharkId) { def = HF.Data.SHARKS[i]; break; }
      if (!def) throw new Error('unknown shark ' + sharkId);
      return build(def);
    }
  };
})();

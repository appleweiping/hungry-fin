/* ═══════════════════════════════════════════════════════════
   HF.ModelKit — low-poly procedural modelling toolbox.
   Everything visible in the game is assembled from these
   primitives at runtime: no model files, no textures.
   All geometry is non-indexed (flat-shaded facets) with
   per-vertex colours.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Materials');
  var M = HF.M;

  var _c = new THREE.Color();

  /* paint a whole geometry one colour (or gradient fn(x,y,z)->Color) */
  function paint(geo, color) {
    var pos = geo.attributes.position;
    var colors = new Float32Array(pos.count * 3);
    var isFn = typeof color === 'function';
    if (!isFn) _c.setHex(color);
    for (var i = 0; i < pos.count; i++) {
      var c = isFn ? color(pos.getX(i), pos.getY(i), pos.getZ(i)) : _c;
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }

  /* apply a Matrix4 built from pos/rot/scale to geometry */
  function xform(geo, px, py, pz, rx, ry, rz, s) {
    var m = new THREE.Matrix4();
    var q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
    var sc = (s === undefined) ? 1 : s;
    m.compose(new THREE.Vector3(px || 0, py || 0, pz || 0), q,
      sc.isVector3 ? sc : new THREE.Vector3(sc, sc, sc));
    geo.applyMatrix4(m);
    return geo;
  }

  /* merge many non-indexed geometries (position+color) into one */
  function merge(geos) {
    var total = 0;
    geos.forEach(function (g) { total += g.attributes.position.count; });
    var pos = new Float32Array(total * 3);
    var col = new Float32Array(total * 3);
    var off = 0;
    geos.forEach(function (g) {
      pos.set(g.attributes.position.array, off * 3);
      if (g.attributes.color) col.set(g.attributes.color.array, off * 3);
      off += g.attributes.position.count;
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeVertexNormals();
    return out;
  }

  function prep(geo) { return geo.index ? geo.toNonIndexed() : geo; }

  var K = HF.ModelKit = {
    paint: paint, xform: xform, merge: merge,

    box: function (w, h, d, color) { return paint(prep(new THREE.BoxGeometry(w, h, d)), color); },
    sphere: function (r, color, seg) { return paint(prep(new THREE.SphereGeometry(r, seg || 7, seg ? Math.max(4, seg - 2) : 5)), color); },
    cyl: function (rt, rb, h, color, seg) { return paint(prep(new THREE.CylinderGeometry(rt, rb, h, seg || 6)), color); },
    cone: function (r, h, color, seg) { return paint(prep(new THREE.ConeGeometry(r, h, seg || 6)), color); },
    torus: function (r, tube, color) { return paint(prep(new THREE.TorusGeometry(r, tube, 6, 10)), color); },

    /* thin triangular fin in the XY plane, extruded along z.
       pts: [[x,y],...] polygon (fan-triangulated), th: thickness */
    fin: function (pts, th, color) {
      var tris = [];
      for (var i = 1; i < pts.length - 1; i++) tris.push([pts[0], pts[i], pts[i + 1]]);
      var v = [];
      var hz = (th || 0.04) / 2;
      tris.forEach(function (t) {
        // front + back faces
        v.push(t[0][0], t[0][1], hz, t[1][0], t[1][1], hz, t[2][0], t[2][1], hz);
        v.push(t[2][0], t[2][1], -hz, t[1][0], t[1][1], -hz, t[0][0], t[0][1], -hz);
      });
      // rim
      for (var e = 0; e < pts.length; e++) {
        var a = pts[e], b = pts[(e + 1) % pts.length];
        v.push(a[0], a[1], hz, b[0], b[1], hz, b[0], b[1], -hz);
        v.push(b[0], b[1], -hz, a[0], a[1], -hz, a[0], a[1], hz);
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
      return paint(geo, color);
    },

    /* ── the workhorse: cross-section loft along +X ─────────
       stations: [{x, ry(half-width z), rz(half-height y), yOff}]
       head at max x. colorFn(u, vNorm) — u:0 tail→1 head,
       vNorm: -1 belly → +1 back. */
    loft: function (stations, colorFn, radial) {
      var SEG = radial || 8;
      var rings = stations.map(function (st) {
        var ring = [];
        for (var s = 0; s < SEG; s++) {
          var a = (s / SEG) * M.TAU;
          ring.push([st.x, Math.sin(a) * (st.rz || 0.001) + (st.yOff || 0), Math.cos(a) * (st.ry || 0.001)]);
        }
        return ring;
      });
      var xMin = stations[0].x, xMax = stations[stations.length - 1].x;
      var v = [], c = [];
      var col = new THREE.Color();
      function push(p) {
        v.push(p[0], p[1], p[2]);
        var u = (p[0] - xMin) / (xMax - xMin);
        // vNorm from the station's own half-height
        var st = null;
        for (var i = 0; i < stations.length; i++) if (Math.abs(stations[i].x - p[0]) < 1e-4) { st = stations[i]; break; }
        var vn = st && st.rz ? M.clamp((p[1] - (st.yOff || 0)) / st.rz, -1, 1) : 0;
        var cc = colorFn(u, vn, col);
        c.push(cc.r, cc.g, cc.b);
      }
      for (var i = 0; i < rings.length - 1; i++) {
        var A = rings[i], B = rings[i + 1];
        for (var s = 0; s < SEG; s++) {
          var s2 = (s + 1) % SEG;
          push(A[s]); push(B[s]); push(B[s2]);
          push(A[s]); push(B[s2]); push(A[s2]);
        }
      }
      /* end caps */
      [0, rings.length - 1].forEach(function (ri, which) {
        var R = rings[ri];
        var cx = stations[ri].x, cy = stations[ri].yOff || 0;
        for (var s = 0; s < SEG; s++) {
          var s2 = (s + 1) % SEG;
          if (which === 0) { push([cx, cy, 0]); push(R[s2]); push(R[s]); }
          else { push([cx, cy, 0]); push(R[s]); push(R[s2]); }
        }
      });
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(c), 3));
      geo.computeVertexNormals();
      return geo;
    },

    /* standard two-tone body colouring (counter-shading) */
    duoTone: function (dorsalHex, bellyHex) {
      var d = new THREE.Color(dorsalHex), b = new THREE.Color(bellyHex);
      return function (u, vn, out) {
        var t = M.clamp01(vn * 0.5 + 0.5);
        out.copy(b).lerp(d, M.smoothstep(0.25, 0.75, t));
        return out;
      };
    },

    mesh: function (geo, opts) {
      var mat = HF.Materials.flat(opts);
      return new THREE.Mesh(geo, mat);
    }
  };
})();

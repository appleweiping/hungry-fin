/* ═══════════════════════════════════════════════════════════
   HF.Materials — shared material factory.
   The centrepiece is the "sway" vertex-shader chunk injected
   via onBeforeCompile: one cheap sinusoidal bend drives every
   fish tail (and jelly skirt / manta wing) in the game,
   including InstancedMesh schools, at ~zero CPU cost.
   Fallback: HF.Materials.SWAY_ENABLED=false → static meshes.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Palette');

  var registered = [];   // uniforms to receive uTime each frame
  var flashes = [];      // active emissive flashes

  var SWAY_VERT = [
    'float hfPh;',
    '#ifdef USE_INSTANCING',
    '  hfPh = aHFPhase;',      // static per-slot phase — position-derived phase drifts as fish swim
    '#else',
    '  hfPh = uHFPhase;',
    '#endif',
    'if (uHFMode < 0.5) {',
    // mode 0: fish — bend sideways (z), weighted toward the tail (-x)
    '  float hfU = clamp(position.x / uHFLen + 0.5, 0.0, 1.0);',      // 0=tail 1=head
    '  float hfW = 1.0 - smoothstep(0.35, 1.0, hfU);',
    '  transformed.z += sin(uHFTime * uHFFreq + hfPh - hfU * 4.0) * uHFAmp * hfW;',
    '} else if (uHFMode < 1.5) {',
    // mode 1: wing flap — displace y by |z| (mantas, gulls)
    '  float hfS = abs(position.z) / max(uHFLen, 0.001);',
    '  transformed.y += sin(uHFTime * uHFFreq + hfPh) * uHFAmp * hfS;',
    '} else {',
    // mode 2: skirt — hanging parts (y<0) wave in z (jellies, weeds)
    '  float hfD = clamp(-position.y / max(uHFLen, 0.001), 0.0, 1.0);',
    '  transformed.z += sin(uHFTime * uHFFreq + hfPh + position.y * 2.0) * uHFAmp * hfD;',
    '  transformed.x += cos(uHFTime * uHFFreq * 0.7 + hfPh) * uHFAmp * 0.4 * hfD;',
    '}'
  ].join('\n');

  HF.Materials = {
    SWAY_ENABLED: true,

    /* the game's default look: cheap, lit, flat, vertex-coloured */
    flat: function (opts) {
      opts = opts || {};
      return new THREE.MeshLambertMaterial({
        vertexColors: true,
        flatShading: true,
        emissive: opts.emissive || 0x000000,
        emissiveIntensity: opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 1,
        transparent: !!opts.transparent,
        opacity: opts.opacity !== undefined ? opts.opacity : 1,
        side: opts.side || THREE.FrontSide
      });
    },

    /* inject the sway chunk. mode: 0 fish, 1 flap, 2 skirt */
    addSway: function (material, opts) {
      if (!HF.Materials.SWAY_ENABLED) return null;
      opts = opts || {};
      var uniforms = {
        uHFTime: { value: 0 },
        uHFPhase: { value: opts.phase || 0 },
        uHFLen: { value: opts.len || 1 },
        uHFAmp: { value: opts.amp !== undefined ? opts.amp : 0.08 },
        uHFFreq: { value: opts.freq !== undefined ? opts.freq : 6 },
        uHFMode: { value: opts.mode || 0 }
      };
      material.onBeforeCompile = function (shader) {
        for (var k in uniforms) shader.uniforms[k] = uniforms[k];
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>',
            '#include <common>\nuniform float uHFTime,uHFPhase,uHFLen,uHFAmp,uHFFreq,uHFMode;\n' +
            '#ifdef USE_INSTANCING\nattribute float aHFPhase;\n#endif')
          .replace('#include <begin_vertex>',
            '#include <begin_vertex>\n' + SWAY_VERT);
      };
      material.customProgramCacheKey = function () { return 'hf-sway'; };
      registered.push(uniforms);
      return uniforms;
    },

    /* forget a sway registration (models that get rebuilt, e.g. the player) */
    removeSway: function (uniforms) {
      var i = registered.indexOf(uniforms);
      if (i >= 0) registered.splice(i, 1);
    },

    /* free every geometry + material under a root (NOT for pooled objects) */
    disposeGroup: function (root) {
      root.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
    },

    update: function (t, dt) {
      for (var i = 0; i < registered.length; i++) registered[i].uHFTime.value = t;
      /* emissive flash decay */
      for (var j = flashes.length - 1; j >= 0; j--) {
        var f = flashes[j];
        f.t -= dt;
        var k = Math.max(f.t / f.dur, 0);
        f.mats.forEach(function (m) { m.emissiveIntensity = f.base + k * f.peak; });
        if (f.t <= 0) {
          f.mats.forEach(function (m) { m.emissive.setHex(f.oldHex); m.emissiveIntensity = f.base; });
          flashes.splice(j, 1);
        }
      }
    },

    /* flash a mesh/group white (or coloured) for dur seconds.
       Overlapping flashes on the same target REFRESH the existing one —
       re-capturing oldHex mid-flash would restore to the flash colour. */
    flash: function (root, hex, dur) {
      var mats = [];
      root.traverse(function (o) {
        if (o.isMesh && o.material && o.material.emissive) mats.push(o.material);
      });
      if (!mats.length) return;
      var want = hex === undefined ? 0xffffff : hex;
      for (var i = 0; i < flashes.length; i++) {
        if (flashes[i].mats[0] === mats[0]) {
          flashes[i].t = flashes[i].dur = dur || 0.12;
          mats.forEach(function (m) { m.emissive.setHex(want); });
          return;
        }
      }
      flashes.push({ mats: mats, oldHex: mats[0].emissive.getHex(), base: 1, peak: 0.9, t: dur || 0.12, dur: dur || 0.12 });
      mats.forEach(function (m) { m.emissive.setHex(want); });
    },

    /* soft radial glow sprite (shared canvas textures by colour) */
    _glowTex: {},
    glowSprite: function (hex, scale, opacity) {
      var key = hex;
      if (!this._glowTex[key]) {
        var cv = document.createElement('canvas'); cv.width = cv.height = 64;
        var g = cv.getContext('2d');
        var c = new THREE.Color(hex);
        var grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
        var rgb = (c.r * 255 | 0) + ',' + (c.g * 255 | 0) + ',' + (c.b * 255 | 0);
        grad.addColorStop(0, 'rgba(' + rgb + ',1)');
        grad.addColorStop(0.35, 'rgba(' + rgb + ',0.45)');
        grad.addColorStop(1, 'rgba(' + rgb + ',0)');
        g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
        this._glowTex[key] = new THREE.CanvasTexture(cv);
      }
      var mat = new THREE.SpriteMaterial({
        map: this._glowTex[key], transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: opacity !== undefined ? opacity : 0.8
      });
      var sp = new THREE.Sprite(mat);
      sp.scale.setScalar(scale || 1);
      return sp;
    },

    /* scrolling caustics sheet texture (procedural voronoi-ish lines) */
    causticsTexture: function () {
      var cv = document.createElement('canvas'); cv.width = cv.height = 256;
      var g = cv.getContext('2d');
      g.clearRect(0, 0, 256, 256);
      var pts = [];
      for (var i = 0; i < 26; i++) pts.push([Math.random() * 256, Math.random() * 256]);
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 1.6;
      /* wobbly cell edges: connect near neighbours with curves */
      for (var a = 0; a < pts.length; a++) {
        for (var b = a + 1; b < pts.length; b++) {
          var dx = pts[a][0] - pts[b][0], dy = pts[a][1] - pts[b][1];
          var d2 = dx * dx + dy * dy;
          if (d2 < 3600) {
            g.beginPath();
            var mx = (pts[a][0] + pts[b][0]) / 2 + (Math.random() - 0.5) * 22;
            var my = (pts[a][1] + pts[b][1]) / 2 + (Math.random() - 0.5) * 22;
            g.moveTo(pts[a][0], pts[a][1]);
            g.quadraticCurveTo(mx, my, pts[b][0], pts[b][1]);
            g.stroke();
          }
        }
      }
      var tex = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    },

    /* soft round point sprite shader for particle systems */
    pointsMaterial: function (opts) {
      opts = opts || {};
      return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexShader: [
          'attribute float aSize; attribute vec3 aColor; attribute float aAlpha;',
          'varying vec3 vC; varying float vA;',
          'void main(){ vC=aColor; vA=aAlpha;',
          ' vec4 mv = modelViewMatrix * vec4(position,1.0);',
          ' gl_PointSize = aSize * (140.0 / -mv.z);',
          ' gl_Position = projectionMatrix * mv; }'
        ].join('\n'),
        fragmentShader: [
          'varying vec3 vC; varying float vA;',
          'void main(){',
          ' float d = length(gl_PointCoord - 0.5) * 2.0;',
          ' float a = smoothstep(1.0, 0.35, d) * vA;',
          ' if (a < 0.01) discard;',
          ' gl_FragColor = vec4(vC, a); }'
        ].join('\n')
      });
    }
  };
})();

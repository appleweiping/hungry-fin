/* ═══════════════════════════════════════════════════════════
   HF.Water — surface strip, sky dome, sun, god rays.
   The surface is a single camera-following band with three
   summed sine waves in the vertex shader; wave phase is taken
   from WORLD x so the follow is seamless. A BackSide copy with
   a bright emissive gradient is the "glowing ceiling" seen
   from below. No render targets anywhere.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Palette', 'Materials', 'Data');
  var M = HF.M, P = HF.Palette;

  var uTime = { value: 0 };
  var surface, under, sky, sun, clouds = [], rays = [], group;
  var bgPlane, bgTop, bgBot;   // underwater backdrop gradient
  var GOLD = new THREE.Color(0xB8860B);

  var WAVE_GLSL = [
    'float hfWave(vec2 wp, float t){',
    '  return sin(wp.x * 0.35 + t * 1.1) * 0.6',
    '       + sin(wp.x * 0.9 - t * 1.7 + wp.y * 0.3) * 0.25',
    '       + sin(wp.x * 2.1 + t * 2.3) * 0.1;',
    '}'
  ].join('\n');

  /* CPU mirror of the same formula (jump detection & splash placement) */
  function waveHeight(x, t) {
    return Math.sin(x * 0.35 + t * 1.1) * 0.6 +
           Math.sin(x * 0.9 - t * 1.7) * 0.25 +
           Math.sin(x * 2.1 + t * 2.3) * 0.1;
  }

  function surfaceMaterial(topSide) {
    return new THREE.ShaderMaterial({
      transparent: true,
      side: topSide ? THREE.FrontSide : THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: uTime,
        uShallow: { value: new THREE.Color(0x7EDCE2) },
        uDeep: { value: new THREE.Color(0x155E8A) },
        uSky: { value: new THREE.Color(0xCDEBF5) },
        uUnder: { value: topSide ? 0 : 1 }
      },
      vertexShader: [
        'uniform float uTime;',
        'varying vec3 vWorld; varying vec3 vN;',
        WAVE_GLSL,
        'void main(){',
        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
        '  float h = hfWave(wp.xz, uTime);',
        '  wp.y += h;',
        '  float hx = hfWave(wp.xz + vec2(0.5, 0.0), uTime);',
        '  vN = normalize(vec3(h - hx, 1.0, 0.0));',
        '  vWorld = wp.xyz;',
        '  gl_Position = projectionMatrix * viewMatrix * wp;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uShallow, uDeep, uSky; uniform float uUnder, uTime;',
        'varying vec3 vWorld; varying vec3 vN;',
        'void main(){',
        '  if (uUnder > 0.5) {',
        // seen from below: bright ceiling, fresnel-ish glow near grazing angles
        '    vec3 v = normalize(cameraPosition - vWorld);',
        '    float g = pow(1.0 - abs(v.y), 1.5);',
        '    vec3 c = mix(uShallow * 1.25, uSky * 1.15, g);',
        '    float shimmer = sin(vWorld.x * 2.7 + uTime * 2.0) * 0.5 + 0.5;',
        '    c += uSky * shimmer * 0.08;',
        '    gl_FragColor = vec4(c, 0.9);',
        '  } else {',
        '    vec3 v = normalize(cameraPosition - vWorld);',
        '    float fres = pow(1.0 - max(dot(v, vN), 0.0), 2.0);',
        '    vec3 c = mix(uDeep, uShallow, fres * 0.8 + 0.1);',
        '    c = mix(c, uSky, fres * 0.55);',
        // whitecaps on crests
        '    float crest = smoothstep(0.55, 0.85, sin(vWorld.x * 0.35 + uTime * 1.1) * 0.5 + 0.5);',
        '    c += vec3(1.0) * crest * 0.12;',
        '    gl_FragColor = vec4(c, 0.92);',
        '  }',
        '}'
      ].join('\n')
    });
  }

  HF.Water = {
    group: null,
    init: function (scene) {
      group = new THREE.Group();

      var geo = new THREE.PlaneGeometry(260, 60, 96, 5);
      geo.rotateX(-Math.PI / 2);
      surface = new THREE.Mesh(geo, surfaceMaterial(true));
      surface.position.y = HF.Data.WORLD.WATER_Y;
      surface.renderOrder = 5;
      under = new THREE.Mesh(geo, surfaceMaterial(false));
      under.position.y = HF.Data.WORLD.WATER_Y;
      under.renderOrder = 5;
      group.add(surface, under);

      /* sky dome: gradient shader on inside of a big sphere */
      var skyGeo = new THREE.SphereGeometry(900, 16, 10);
      sky = new THREE.Mesh(skyGeo, new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color(P.sky.top) },
          uHorizon: { value: new THREE.Color(P.sky.horizon) }
        },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: [
          'uniform vec3 uTop, uHorizon; varying vec3 vP;',
          'void main(){ float t = smoothstep(0.0, 0.45, normalize(vP).y);',
          ' gl_FragColor = vec4(mix(uHorizon, uTop, t), 1.0); }'
        ].join('\n')
      }));
      sky.renderOrder = -10;
      group.add(sky);

      /* sun + halo */
      sun = HF.Materials.glowSprite(P.sky.sun, 120, 0.9);
      sun.position.set(120, 260, -350);
      group.add(sun);

      /* a few lazy low-poly clouds */
      for (var i = 0; i < 4; i++) {
        var K = HF.ModelKit;
        var puffs = [];
        for (var p = 0; p < 4; p++) {
          puffs.push(K.xform(K.sphere(M.rand(6, 11), P.sky.cloud, 6), p * 9 - 14 + M.rand(-3, 3), M.rand(-2, 2), M.rand(-3, 3)));
        }
        var cl = new THREE.Mesh(K.merge(puffs), HF.Materials.flat({ transparent: true, opacity: 0.92 }));
        cl.material.fog = false;
        cl.position.set(M.rand(-260, 260), M.rand(55, 110), M.rand(-320, -180));
        clouds.push(cl); group.add(cl);
      }

      /* god rays: additive slanted quads hanging from the surface */
      var rayTexCv = document.createElement('canvas'); rayTexCv.width = 32; rayTexCv.height = 128;
      var g2 = rayTexCv.getContext('2d');
      var grad = g2.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, 'rgba(255,255,255,0.55)');
      grad.addColorStop(0.7, 'rgba(255,255,255,0.10)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g2.fillStyle = grad;
      g2.fillRect(0, 0, 32, 128);
      var rayTex = new THREE.CanvasTexture(rayTexCv);
      for (var r = 0; r < 7; r++) {
        var rm = new THREE.Mesh(
          new THREE.PlaneGeometry(M.rand(2.5, 6), M.rand(30, 55)),
          new THREE.MeshBasicMaterial({
            map: rayTex, transparent: true, depthWrite: false, fog: false,
            blending: THREE.AdditiveBlending, opacity: M.rand(0.05, 0.11), side: THREE.DoubleSide
          }));
        rm.rotation.z = M.rand(-0.22, -0.12);
        rm.userData.baseOp = rm.material.opacity;
        rm.userData.dx = M.rand(-40, 40);
        rm.userData.ph = M.rand(0, 6);
        rays.push(rm); group.add(rm);
      }

      /* underwater backdrop: a huge two-colour gradient quad far behind
         the play plane. Without it the sky dome shows through the water
         and everything reads pale — this quad IS "the water". */
      bgTop = { value: new THREE.Color(0x3FA9BF) };
      bgBot = { value: new THREE.Color(0x0F3550) };
      bgPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1600, 900),
        new THREE.ShaderMaterial({
          depthWrite: false,
          uniforms: { uTop: bgTop, uBot: bgBot },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: 'uniform vec3 uTop, uBot; varying vec2 vUv; void main(){ gl_FragColor = vec4(mix(uBot, uTop, smoothstep(0.25, 0.75, vUv.y)), 1.0); }'
        }));
      bgPlane.renderOrder = -9;
      group.add(bgPlane);

      HF.Water.group = group;
      scene.add(group);
    },

    /* CPU wave height at world x (for jump/splash checks) */
    heightAt: function (x) { return HF.Data.WORLD.WATER_Y + waveHeight(x, uTime.value); },

    setZone: function (zonePal) {
      surface.material.uniforms.uShallow.value.setHex(zonePal.waterTop);
      surface.material.uniforms.uDeep.value.setHex(zonePal.waterMid);
      under.material.uniforms.uShallow.value.setHex(zonePal.waterTop);
      under.material.uniforms.uDeep.value.setHex(zonePal.waterMid);
    },

    /* backdrop colours follow zone + depth (+ gold rush tint) */
    setBackdrop: function (topHex, botHex, depthK, goldK) {
      bgTop.value.setHex(topHex);
      bgBot.value.setHex(botHex);
      bgTop.value.multiplyScalar(1 - depthK * 0.55);
      bgBot.value.multiplyScalar(1 - depthK * 0.7);
      if (goldK > 0) {
        bgTop.value.lerp(GOLD, goldK * 0.5);
        bgBot.value.lerp(GOLD, goldK * 0.35);
      }
    },

    update: function (dt, t, camX, camY, quality) {
      uTime.value = t;
      group.position.x = camX;              // strip follows camera; waves use world x
      surface.position.x = under.position.x = 0;
      sky.position.y = 0;
      /* rays only near surface, fade with camera depth, cheap breathing */
      var vis = quality > 0 ? M.clamp01(1 - (-camY) / 60) : 0;
      for (var i = 0; i < rays.length; i++) {
        var rm = rays[i];
        rm.visible = vis > 0.02;
        if (!rm.visible) continue;
        rm.position.set(rm.userData.dx + Math.sin(t * 0.05 + rm.userData.ph) * 6, HF.Data.WORLD.WATER_Y - 18, -14);
        rm.material.opacity = rm.userData.baseOp * vis * (0.75 + 0.25 * Math.sin(t * 0.4 + rm.userData.ph));
      }
      for (var c = 0; c < clouds.length; c++) {
        clouds[c].position.x += dt * 0.6;
        if (clouds[c].position.x > 300) clouds[c].position.x = -300;
      }
      /* backdrop follows the camera; sky only matters near the surface */
      bgPlane.position.set(0, camY, -220);
      var deep = camY < -60;
      sky.visible = !deep; sun.visible = !deep;
      for (var cl = 0; cl < clouds.length; cl++) clouds[cl].visible = !deep;
    }
  };
})();

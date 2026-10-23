/* ═══════════════════════════════════════════════════════════
   HF.Engine + HF.Time — renderer, main loop, resize/DPR,
   performance fuse, and the timeScale CHANNEL STACK.
   Channels (hitstop / cine / slow) multiply-min into one final
   scale so a bite-freeze can never cancel a jump's slow-mo —
   the single most important integration ruling of the design
   review.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Events');
  var M = HF.M;

  /* ── time channels ───────────────────────────────────── */
  var channels = { hitstop: { v: 1, t: 0 }, cine: { v: 1, t: -1 }, slow: { v: 1, t: -1 } };
  HF.Time = {
    now: 0,            // accumulated *scaled* game seconds
    real: 0,           // accumulated real seconds
    dt: 0, dtRaw: 0,
    scale: function () {
      return Math.min(channels.hitstop.v, channels.cine.v, channels.slow.v);
    },
    /* timed channel set: value for dur seconds (dur<0 = until cleared) */
    set: function (name, value, dur) {
      channels[name].v = value;
      channels[name].t = dur === undefined ? -1 : dur;
    },
    clear: function (name) { channels[name].v = 1; channels[name].t = -1; },
    hitstop: function (dur) {
      /* don't let a weaker hitstop shorten a stronger one */
      if (channels.hitstop.v < 1 && channels.hitstop.t > dur) return;
      channels.hitstop.v = 0.05;
      channels.hitstop.t = dur;
    },
    _tick: function (dtRaw) {
      for (var k in channels) {
        var c = channels[k];
        if (c.t >= 0) {
          c.t -= dtRaw;
          if (c.t < 0) { c.v = 1; c.t = -1; }
        }
      }
      this.dtRaw = dtRaw;
      this.real += dtRaw;
      this.dt = dtRaw * this.scale();
      this.now += this.dt;
      return this.dt;
    }
  };

  /* ── engine ──────────────────────────────────────────── */
  var renderer = null, canvas = null;
  var last = 0, running = false;
  var fpsAcc = 0, fpsN = 0, fpsAvg = 60, lowTimer = 0;
  var quality = 2;                       // 2 high / 1 med / 0 low
  var DPR_CAP = [1.0, 1.25, 1.5];

  var lastW = -1, lastH = -1, lastDPR = -1;
  function resize() {
    var w = Math.max(window.innerWidth, 2), h = Math.max(window.innerHeight, 2);
    lastW = window.innerWidth; lastH = window.innerHeight;
    lastDPR = window.devicePixelRatio || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP[quality]));
    renderer.setSize(w, h);
    HF.Events.emit('resize', { w: w, h: h });
  }

  function frame(nowMs) {
    if (!running) return;
    requestAnimationFrame(frame);
    var dtRaw = Math.min((nowMs - last) / 1000, 1 / 30);
    if (dtRaw <= 0) dtRaw = 1 / 60;
    last = nowMs;

    /* embedded panes can be laid out AFTER load without firing a
       window resize — poll dimensions AND DPR every frame (cheap) */
    if (window.innerWidth !== lastW || window.innerHeight !== lastH ||
        (window.devicePixelRatio || 1) !== lastDPR) resize();

    /* perf fuse: rolling avg, degrade after 5 s under 45 fps */
    fpsAcc += 1 / dtRaw; fpsN++;
    if (fpsN >= 30) { fpsAvg = fpsAcc / fpsN; fpsAcc = 0; fpsN = 0; }
    if (fpsAvg < 45 && quality > 0) {
      lowTimer += dtRaw;
      if (lowTimer > 5) {
        quality--;
        lowTimer = 0;
        resize();
        HF.Events.emit('quality', quality);
      }
    } else lowTimer = Math.max(0, lowTimer - dtRaw);

    var dt = HF.Time._tick(dtRaw);
    try {
      HF.Game.frame(dt, dtRaw);
    } catch (e) {
      console.error(e);
      running = false;
      var el = document.getElementById('fatal');
      if (el) {
        el.classList.remove('hidden');
        el.textContent = '🦈 Brinefin hit a rock mid-swim.\n\n' + e.message + '\n\n' + (e.stack || '');
      }
      return;
    }
  }

  HF.Engine = {
    renderer: null,
    quality: function () { return quality; },
    setQuality: function (q) { quality = M.clamp(q, 0, 2); resize(); HF.Events.emit('quality', quality); },
    fps: function () { return fpsAvg; },

    init: function () {
      canvas = document.getElementById('gl');
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = true;
      HF.Engine.renderer = renderer;
      window.addEventListener('resize', resize);
      resize();

      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          HF.Audio.suspend();
          if (HF.Game && (HF.Game.state === 'PLAYING' || HF.Game.state === 'RESUMING')) HF.Game.pause();
        } else {
          HF.Audio.resume();
        }
      });

      /* GPU context loss: without preventDefault the context never
         restores; on restore the cleanest recovery is a reload */
      canvas.addEventListener('webglcontextlost', function (ev) {
        ev.preventDefault();
        if (HF.Game && HF.Game.state === 'PLAYING') HF.Game.pause();
      });
      canvas.addEventListener('webglcontextrestored', function () { location.reload(); });
    },

    start: function () {
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  };
})();

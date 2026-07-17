/* ═══════════════════════════════════════════════════════════
   HF.Audio — 100% synthesized WebAudio. No samples, no files.
   Graph: voices → sfxBus(compressor) → master → destination
           ambient layers → ambientBus(lowpass) → master
   The lowpass on ambientBus doubles as the above/below-water
   filter and the death "muffle".
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Events');
  var M = HF.M;

  var ctx = null, master = null, sfxBus = null, ambBus = null, ambLP = null;
  var noiseBuf = null;
  var unlocked = false;
  var vol = { sfx: 0.8, music: 0.55 };
  var ambient = { started: false, padOsc: [], padGain: null, tickTimer: 0, beatOn: false, beatGain: null, beatTimer: 0, zone: -1 };
  var SCALES = [ // per zone: semitone offsets from root
    { root: 261.63, steps: [0, 2, 4, 7, 9] },          // C major pentatonic — shallows
    { root: 146.83, steps: [0, 2, 3, 5, 7, 9, 10] },   // D dorian — open blue
    { root: 55.0, steps: [0, 2, 4, 6, 8, 10] }         // whole-tone on A1 — abyss
  ];

  function now() { return ctx.currentTime; }

  function makeNoise() {
    var len = ctx.sampleRate * 2;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* ── tiny synth helpers ─────────────────────────────── */
  function env(g, t0, a, peak, d, sustain) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain || 0.0001, 0.0001), t0 + a + d);
  }
  function tone(opts) {
    var t0 = now() + (opts.at || 0);
    var o = ctx.createOscillator(); o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(opts.f0, t0);
    if (opts.f1) o.frequency.exponentialRampToValueAtTime(Math.max(opts.f1, 1), t0 + (opts.slideT || opts.dur));
    var g = ctx.createGain();
    env(g, t0, opts.a || 0.002, opts.vol || 0.3, opts.dur);
    o.connect(g);
    var head = g;
    if (opts.lp) { var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; head.connect(f); head = f; }
    if (opts.shape) { var ws = ctx.createWaveShaper(); ws.curve = shapeCurve(opts.shape); head.connect(ws); head = ws; }
    head.connect(opts.bus || sfxBus);
    if (opts.vibrato) {
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = opts.vibrato[0]; lg.gain.value = opts.vibrato[1];
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t0); lfo.stop(t0 + opts.dur + 0.2);
    }
    o.start(t0); o.stop(t0 + opts.dur + 0.25);
    return g;
  }
  function noise(opts) {
    var t0 = now() + (opts.at || 0);
    var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = opts.ftype || 'bandpass';
    f.frequency.setValueAtTime(opts.f0 || 1000, t0);
    if (opts.f1) f.frequency.exponentialRampToValueAtTime(Math.max(opts.f1, 10), t0 + opts.dur);
    f.Q.value = opts.q || 1.2;
    var g = ctx.createGain();
    env(g, t0, opts.a || 0.004, opts.vol || 0.25, opts.dur);
    src.connect(f); f.connect(g); g.connect(opts.bus || sfxBus);
    src.start(t0); src.stop(t0 + opts.dur + 0.2);
  }
  function shapeCurve(k) {
    var c = new Float32Array(128);
    for (var i = 0; i < 128; i++) { var x = i / 63.5 - 1; c[i] = Math.tanh(x * k); }
    return c;
  }
  function duck(to, recover) {
    var t0 = now();
    master.gain.cancelScheduledValues(t0);
    master.gain.setValueAtTime(master.gain.value, t0);
    master.gain.linearRampToValueAtTime(to, t0 + 0.03);
    master.gain.linearRampToValueAtTime(1, t0 + recover);
  }

  /* ── SFX recipes ─────────────────────────────────────── */
  var SFX = {
    click: function () { tone({ f0: 1200, dur: 0.05, a: 0.001, vol: 0.15 }); },
    confirm: function () { tone({ f0: 1200, dur: 0.05, vol: 0.14 }); tone({ f0: 1600, dur: 0.08, vol: 0.14, at: 0.07 }); },
    bite: function (p) {
      p = p || {};
      var det = Math.pow(2, (p.combo || 0) * 2 / 12); // +2 semitones per combo stage
      var jit = M.rand(0.97, 1.03);
      noise({ f0: 1800 * det * jit, f1: 600 * det, dur: 0.07, vol: 0.28 * (p.big ? 1.3 : 1) });
      tone({ f0: 180 * det * jit, f1: 70 * det, type: 'sine', dur: 0.09, vol: 0.3 });
    },
    gulp: function () {
      SFX.bite({ big: true });
      SFX.bite({ big: true, combo: 1 });
      tone({ f0: 90, f1: 45, dur: 0.3, vol: 0.3, at: 0.12 });
      noise({ ftype: 'lowpass', f0: 400, dur: 0.2, vol: 0.2, at: 0.1 });
      tone({ f0: 523, f1: 1046, dur: 0.12, vol: 0.12, at: 0.28 });
    },
    coin: function (p) {
      var step = Math.min((p && p.streak) || 0, 8);
      var mul = Math.pow(2, step / 12);
      tone({ type: 'square', f0: 988 * mul, dur: 0.04, vol: 0.08 });
      tone({ type: 'square', f0: 1319 * mul, dur: 0.12, a: 0.001, vol: 0.10, at: 0.045 });
    },
    levelup: function () {
      var notes = [261.6, 329.6, 392, 523.3, 659.3];
      notes.forEach(function (f, i) { tone({ type: 'sawtooth', f0: f, dur: 0.09, vol: 0.10, at: i * 0.07, lp: 800 + i * 1300 }); });
      tone({ f0: 1318.5, dur: 0.4, vol: 0.08, at: notes.length * 0.07 });
      noise({ f0: 3000, dur: 0.35, vol: 0.06, a: 0.1, at: 0.1 });
    },
    grStart: function () {
      noise({ f0: 400, f1: 4000, dur: 0.6, vol: 0.3, a: 0.05 });
      [660, 990, 1320].forEach(function (f) { tone({ f0: f, dur: 1.2, vol: 0.10, at: 0.55, vibrato: [4, 6] }); });
      tone({ f0: 55, dur: 0.3, vol: 0.35, at: 0.55 });
    },
    hurt: function () {
      tone({ type: 'square', f0: 220, f1: 110, dur: 0.15, vol: 0.22, vibrato: [30, 30] });
      noise({ ftype: 'highpass', f0: 2000, dur: 0.05, vol: 0.15 });
      muffle(500, 0.5);
    },
    explosion: function () {
      tone({ f0: 100, f1: 30, dur: 0.5, vol: 0.5 });
      noise({ ftype: 'lowpass', f0: 6000, f1: 200, dur: 0.8, vol: 0.45, shape: 3 });
      duck(0.4, 0.6);
    },
    zap: function () {
      noise({ ftype: 'highpass', f0: 3000, dur: 0.12, vol: 0.2 });
      tone({ type: 'square', f0: 880, f1: 220, dur: 0.12, vol: 0.12, vibrato: [60, 120] });
    },
    splashOut: function () {
      noise({ f0: 2500, f1: 5000, dur: 0.3, a: 0.005, vol: 0.3 });
      for (var i = 0; i < 8; i++) noise({ ftype: 'highpass', f0: 4000, dur: 0.02, vol: 0.06, at: M.rand(0, 0.2) });
      setUnderwater(false);
    },
    splashIn: function () {
      noise({ f0: 3000, f1: 800, dur: 0.35, vol: 0.32 });
      tone({ f0: 60, dur: 0.1, vol: 0.3 });
      setUnderwater(true);
    },
    roar: function () {
      [55, 82, 110].forEach(function (f) {
        tone({ type: 'sawtooth', f0: f * 0.97, f1: f * 1.15, slideT: 0.3, dur: 1.6, vol: 0.18, shape: 5, lp: 900, vibrato: [6, f * 0.06] });
      });
      noise({ ftype: 'lowpass', f0: 200, dur: 2.0, vol: 0.2, a: 0.3 });
      duck(0.35, 1.2);
    },
    death: function () {
      muffle(300, 3);
      tone({ f0: 440, f1: 220, dur: 1.2, vol: 0.2, vibrato: [5, 8] });
      [440, 349.2, 293.7].forEach(function (f, i) { tone({ type: 'triangle', f0: f, dur: 0.4, vol: 0.12, at: 0.5 + i * 0.35 }); });
    },
    record: function () {
      [523, 659, 784, 1046].forEach(function (f, i) { tone({ f0: f, dur: 0.25, vol: 0.1, at: i * 0.09 }); });
    },
    heartbeat: function () {
      tone({ f0: 60, dur: 0.09, vol: 0.4, lp: 120 });
      tone({ f0: 55, dur: 0.07, vol: 0.28, lp: 120, at: 0.18 });
    },
    swoosh: function () { noise({ f0: 800, f1: 2400, dur: 0.18, vol: 0.12 }); },
    unlock: function () { SFX.levelup(); duck(0.7, 0.4); },
    netStruggle: function () { noise({ f0: 900, dur: 0.08, vol: 0.1 }); },
    chest: function () {
      tone({ f0: 392, dur: 0.1, vol: 0.12 }); tone({ f0: 523, dur: 0.1, vol: 0.12, at: 0.1 });
      tone({ f0: 784, dur: 0.3, vol: 0.14, at: 0.2 });
    },
    countdown: function () { tone({ f0: 880, dur: 0.07, vol: 0.14 }); }
  };

  function muffle(freq, recoverSec) {
    if (!ambLP) return;
    var t0 = now();
    ambLP.frequency.cancelScheduledValues(t0);
    ambLP.frequency.setValueAtTime(freq, t0);
    ambLP.frequency.exponentialRampToValueAtTime(underwater ? 800 : 18000, t0 + recoverSec);
  }
  var underwater = true;
  function setUnderwater(v) {
    underwater = v;
    if (!ambLP) return;
    var t0 = now();
    ambLP.frequency.cancelScheduledValues(t0);
    ambLP.frequency.setValueAtTime(ambLP.frequency.value, t0);
    ambLP.frequency.exponentialRampToValueAtTime(v ? 800 : 18000, t0 + 0.1);
  }

  /* ── generative ambient ──────────────────────────────── */
  var padTimer = 0, noteTimer = 2;
  function startAmbient() {
    if (ambient.started) return;
    ambient.started = true;
    /* sea-breath brown-ish noise bed */
    var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    var g = ctx.createGain(); g.gain.value = 0.05;
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    var lg = ctx.createGain(); lg.gain.value = 0.025;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(ambBus);
    src.start(); lfo.start();
    /* zone pad: two detuned triangles */
    ambient.padGain = ctx.createGain(); ambient.padGain.gain.value = 0.0;
    var plp = ctx.createBiquadFilter(); plp.type = 'lowpass'; plp.frequency.value = 600;
    ambient.padGain.connect(plp); plp.connect(ambBus);
    for (var i = 0; i < 2; i++) {
      var o = ctx.createOscillator(); o.type = 'triangle';
      o.detune.value = i ? 6 : -6;
      o.frequency.value = SCALES[0].root / 2;
      o.connect(ambient.padGain); o.start();
      ambient.padOsc.push(o);
    }
    ambient.padGain.gain.setTargetAtTime(0.05, now(), 3);
    /* combo beat bus */
    ambient.beatGain = ctx.createGain(); ambient.beatGain.gain.value = 0; ambient.beatGain.connect(ambBus);
  }
  function ambientTick(dt, state) {
    if (!ambient.started || !ctx) return;
    /* zone pad root change */
    if (state.zone !== ambient.zone) {
      ambient.zone = state.zone;
      var s = SCALES[state.zone] || SCALES[0];
      ambient.padOsc.forEach(function (o, i) {
        o.frequency.setTargetAtTime(s.root / 2 * (i ? 1.5 : 1), now(), 4);
      });
    }
    /* poisson music-box notes */
    noteTimer -= dt;
    if (noteTimer <= 0) {
      var s = SCALES[ambient.zone >= 0 ? ambient.zone : 0];
      var f = s.root * Math.pow(2, s.steps[M.randi(0, s.steps.length - 1)] / 12) * (ambient.zone === 2 ? 1 : 2);
      tone({ f0: f, dur: 1.4, a: 0.01, vol: 0.05, bus: ambBus });
      noteTimer = ambient.zone === 2 ? M.rand(9, 18) : M.rand(4, 8);
    }
    /* combo-driven pulse layer */
    var want = state.combo >= 3 && !state.dead;
    ambient.beatGain.gain.setTargetAtTime(want ? 0.09 : 0, now(), want ? 0.8 : 2);
    if (want) {
      ambient.beatTimer -= dt;
      if (ambient.beatTimer <= 0) {
        ambient.beatTimer = 60 / 90 / 2; // 90 BPM eighths
        ambient.beatOn = !ambient.beatOn;
        if (ambient.beatOn) tone({ f0: 150, f1: 50, dur: 0.1, vol: 0.5, bus: ambient.beatGain });
        else noise({ ftype: 'highpass', f0: 6000, dur: 0.015, vol: 0.25, bus: ambient.beatGain });
      }
    }
  }

  /* ── public API ──────────────────────────────────────── */
  HF.Audio = {
    unlock: function () {
      if (unlocked) return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 1;
        var comp = ctx.createDynamicsCompressor();
        sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx;
        ambBus = ctx.createGain(); ambBus.gain.value = vol.music;
        ambLP = ctx.createBiquadFilter(); ambLP.type = 'lowpass'; ambLP.frequency.value = 800;
        sfxBus.connect(comp); comp.connect(master);
        ambBus.connect(ambLP); ambLP.connect(master);
        master.connect(ctx.destination);
        noiseBuf = makeNoise();
        unlocked = true;
        if (ctx.state === 'suspended') ctx.resume();
        startAmbient();
        SFX.click();
      } catch (e) { console.warn('Audio unavailable:', e); }
    },
    play: function (name, p) {
      if (!unlocked || !SFX[name]) return;
      /* iOS Safari uses a non-standard 'interrupted' state after calls/Siri —
         treat anything that isn't running as resumable */
      if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) { } return; }
      try { SFX[name](p); } catch (e) { /* never let audio kill the game */ }
    },
    tick: function (dt, state) { if (unlocked) ambientTick(dt, state); },
    setUnderwater: setUnderwater,
    setVolume: function (kind, v) {
      vol[kind] = v;
      if (!unlocked) return;
      if (kind === 'sfx') sfxBus.gain.value = v;
      else ambBus.gain.value = v;
    },
    getVolume: function (kind) { return vol[kind]; },
    suspend: function () { if (unlocked && ctx.state === 'running') ctx.suspend(); },
    resume: function () { if (unlocked && ctx.state !== 'running') { try { ctx.resume(); } catch (e) { } } }
  };
})();

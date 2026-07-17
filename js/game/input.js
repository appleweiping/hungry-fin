/* ═══════════════════════════════════════════════════════════
   HF.Input — one intent object for mouse / keyboard / touch.
   Desktop default: pointer-seek (shark chases the cursor),
   hold LMB or Space to boost. WASD/arrows override the pointer
   while held. Touch: floating left joystick + boost button.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Events');
  var M = HF.M;

  var keys = {};
  var mouse = { x: 0, y: 0, down: false, moved: false };
  var joy = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
  var boostTouch = false;
  var pausePressed = false;
  var struggleTaps = 0;
  /* coarse-pointer devices get touch UI/hints from the start —
     waiting for the first canvas touch burns the FTUE hints */
  var isTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  var intent = { steer: { x: 0, y: 0 }, steerMode: 'pointer', pointer: { x: 0, y: 0 }, boost: false };

  function onKey(e, down) {
    if (e.repeat) return;
    keys[e.code] = down;
    if (down && (e.code === 'Escape' || e.code === 'KeyP')) pausePressed = true;
    if (down && (e.code === 'Space' || e.code === 'ShiftLeft')) struggleTaps++;
    if (['Space', 'ArrowUp', 'ArrowDown'].indexOf(e.code) >= 0) e.preventDefault();
  }

  HF.Input = {
    isTouch: function () { return isTouch; },

    init: function () {
      var cv = document.getElementById('gl');
      window.addEventListener('keydown', function (e) { onKey(e, true); });
      window.addEventListener('keyup', function (e) { onKey(e, false); });

      cv.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true;
      });
      cv.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch') { touchStart(e); return; }
        mouse.down = true; struggleTaps++;
      });
      window.addEventListener('pointerup', function (e) {
        if (e.pointerType === 'touch') { touchEnd(e); return; }
        mouse.down = false;
      });
      /* pointercancel fires INSTEAD of pointerup when the OS steals the
         touch (notification pull-down, edge gesture, palm rejection) —
         without this the joystick locks up until refresh */
      window.addEventListener('pointercancel', function (e) {
        if (e.pointerType === 'touch') { touchEnd(e); }
        mouse.down = false;
        boostTouch = false;
        var bb2 = document.getElementById('btn-boost');
        if (bb2) bb2.classList.remove('on');
      });
      /* losing window focus eats keyup/pointerup — clear all held state */
      window.addEventListener('blur', function () {
        keys = {};
        mouse.down = false;
        boostTouch = false;
        joy.active = false; joy.dx = joy.dy = 0;
        if (joyEl) joyEl.style.display = 'none';
        var bb3 = document.getElementById('btn-boost');
        if (bb3) bb3.classList.remove('on');
      });
      cv.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') touchMove(e);
      });
      cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

      var bb = document.getElementById('btn-boost');
      bb.addEventListener('pointerdown', function (e) { e.preventDefault(); boostTouch = true; bb.classList.add('on'); struggleTaps++; });
      bb.addEventListener('pointerup', function () { boostTouch = false; bb.classList.remove('on'); });
      bb.addEventListener('pointerleave', function () { boostTouch = false; bb.classList.remove('on'); });
    },

    /* returns the shared intent object (do not mutate outside) */
    poll: function () {
      var kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      var ky = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);

      if (joy.active) {
        intent.steerMode = 'dir';
        var l = M.len(joy.dx, joy.dy);
        var k = l > 1 ? 1 / l : 1;
        intent.steer.x = joy.dx * k;
        intent.steer.y = -joy.dy * k;
      } else if (kx || ky) {
        intent.steerMode = 'dir';
        var kl = M.len(kx, ky) || 1;
        intent.steer.x = kx / kl; intent.steer.y = ky / kl;
      } else if (mouse.moved) {
        intent.steerMode = 'pointer';
        intent.pointer.x = mouse.x; intent.pointer.y = mouse.y;
      } else {
        /* mouse never seen yet: idle in place instead of darting to (0,0) */
        intent.steerMode = 'dir';
        intent.steer.x = 0; intent.steer.y = 0;
      }
      intent.boost = !!(mouse.down || keys.Space || keys.ShiftLeft || boostTouch);
      return intent;
    },

    consumePause: function () { var p = pausePressed; pausePressed = false; return p; },
    consumeStruggles: function () { var s = struggleTaps; struggleTaps = 0; return s; },

    showTouchUI: function (show) {
      document.getElementById('touch-ui').classList.toggle('hidden', !show);
    }
  };

  /* floating joystick on left half of the screen */
  var joyEl, ringEl, nubEl;
  function touchStart(e) {
    isTouch = true;
    HF.Input.showTouchUI(true);
    if (e.clientX < window.innerWidth * 0.55 && !joy.active) {
      joy.active = true; joy.id = e.pointerId;
      joy.ox = e.clientX; joy.oy = e.clientY; joy.dx = joy.dy = 0;
      joyEl = joyEl || document.getElementById('joy');
      joyEl.style.display = 'block';
      joyEl.style.left = (joy.ox - 55) + 'px';
      joyEl.style.top = (joy.oy - 55) + 'px';
    } else {
      struggleTaps++;
    }
  }
  function touchMove(e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    var dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    var l = M.len(dx, dy), max = 48;
    if (l > max) { dx *= max / l; dy *= max / l; }
    joy.dx = dx / max; joy.dy = dy / max;
    nubEl = nubEl || document.getElementById('joy-nub');
    nubEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }
  function touchEnd(e) {
    if (joy.active && e.pointerId === joy.id) {
      joy.active = false; joy.dx = joy.dy = 0;
      if (joyEl) joyEl.style.display = 'none';
      if (nubEl) nubEl.style.transform = '';
    }
  }
})();

/* ═══════════════════════════════════════════════════════════
   HF.Shop — sharks / pets / cosmetics, with a live 3D preview
   rendered by the MAIN renderer into a scissored viewport that
   tracks the #shop-preview div (no second GL context).
   Locked sharks render as black silhouettes — suspense is free
   marketing.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  HF.require('M', 'Data', 'SharkBuilder', 'Materials');
  var M = HF.M, D = HF.Data;

  var open = false, tab = 'sharks', selId = null;
  var pvScene = null, pvCam = null, pvModel = null, pvSpin = 0, pvDrag = null, pvVel = 0.5;
  var slotEl = null, sc = null;
  var fromDeath = false;
  var pvCache = {};              // preview models built once per (kind,id,locked)
  var windowWired = false;       // window listeners registered exactly once

  function buildPreviewScene() {
    pvScene = new THREE.Scene();
    pvCam = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
    var key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(2, 3, 4);
    var rim = new THREE.DirectionalLight(0x7EDCE2, 0.6); rim.position.set(-3, 1, -2);
    pvScene.add(key, rim, new THREE.AmbientLight(0x8FB8CC, 0.5));
  }

  function setPreview(kind, id, locked) {
    if (pvModel) { pvScene.remove(pvModel); pvModel = null; }
    var cacheKey = kind + ':' + id + ':' + (locked ? 1 : 0) +
      (kind === 'cosmetics' ? ':' + HF.Save.data.equipped.shark : '');
    if (pvCache[cacheKey]) {
      pvModel = pvCache[cacheKey];
      pvSpin = -0.5; pvVel = 0.5;
      pvScene.add(pvModel);
      HF.Audio.play('swoosh');
      return;
    }
    var g;
    if (kind === 'sharks') {
      var b = HF.SharkBuilder.build(id);
      g = b.group;
      var L = b.len;
      g.scale.setScalar(3.2 / L);
    } else if (kind === 'pets') {
      var def = petDef(id);
      var kindMap = { remora: 'fish', lantern: 'jelly', petrel: 'gull', buddy: 'fish', bulwark: 'crab', volt: 'eel' };
      g = new THREE.Group();
      g.add(HF.ModelKit.mesh(HF.Builders.geoFor({ kind: kindMap[id], len: 1, colors: { a: def.color, b: 0xEAF6FF, beak: 0xFF9F1C } })));
      g.scale.setScalar(2.2);
    } else {
      /* cosmetics: preview on the equipped shark */
      var b2 = HF.SharkBuilder.build(HF.Save.data.equipped.shark);
      g = b2.group;
      g.scale.setScalar(3.2 / b2.len);
    }
    if (locked) {
      g.traverse(function (o) {
        if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: 0x0A1220 });
        if (o.isSprite) o.visible = false;
      });
    }
    pvModel = g;
    pvCache[cacheKey] = g;       // bounded by catalogue size — never rebuilt
    pvSpin = -0.5; pvVel = 0.5;
    g.position.y = 0;
    pvScene.add(g);
    pvCam.position.set(0, 0.8, 5.4);
    pvCam.lookAt(0, 0, 0);
    HF.Audio.play('swoosh');
  }

  function petDef(id) { var d = null; D.PETS.forEach(function (p) { if (p.id === id) d = p; }); return d; }
  function cosDef(id) { var d = null; D.COSMETICS.forEach(function (c) { if (c.id === id) d = c; }); return d; }
  function sharkDef(id) { var d = null; D.SHARKS.forEach(function (s) { if (s.id === id) d = s; }); return d; }

  function sharkCost(s) {
    if (s.id === 'mega') {
      var b = HF.Save.data.bossKills;
      if (b.moray && b.orcaKing && b.squid) return Math.round(s.cost * D.MEGA_DISCOUNT);
    }
    return s.cost;
  }

  HF.Shop = {
    isOpen: function () { return open; },

    open: function (fromDeathScreen) {
      fromDeath = !!fromDeathScreen;
      open = true; tab = 'sharks';
      selId = HF.Save.data.equipped.shark;
      if (!pvScene) buildPreviewScene();
      render();
    },

    close: function () {
      open = false;
      HF.UIScreens.clear();
      /* entered from the death recap → return there, don't eat the stats */
      if (fromDeath && HF.Game.lastRun) {
        HF.Game.state = 'RESULTS';
        HF.UIScreens.death(HF.Game.lastRun);
      } else {
        HF.Game.toTitle();
      }
    },

    /* scissored preview pass — called from the main render loop */
    renderPreview: function (renderer) {
      if (!open || !slotEl || !pvModel) return;
      var r = slotEl.getBoundingClientRect();
      if (r.width < 10) return;
      var dpr = renderer.getPixelRatio();
      var h = window.innerHeight;
      pvSpin += pvVel * HF.Time.dtRaw;
      pvVel = M.damp(pvVel, pvDrag ? 0 : 0.5, 2, HF.Time.dtRaw);
      pvModel.rotation.y = pvSpin;
      pvModel.position.y = Math.sin(HF.Time.real * 1.4) * 0.12;
      pvCam.aspect = r.width / r.height;
      pvCam.updateProjectionMatrix();
      /* r147 setViewport/setScissor take CSS pixels (they multiply by DPR) */
      renderer.setScissorTest(true);
      renderer.setViewport(r.left, (h - r.bottom), r.width, r.height);
      renderer.setScissor(r.left, (h - r.bottom), r.width, r.height);
      renderer.render(pvScene, pvCam);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
      renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
    }
  };

  function render() {
    var root = document.getElementById('screens');
    root.innerHTML = '';
    sc = document.createElement('div');
    sc.className = 'screen dim';
    sc.innerHTML =
      '<div class="panel" style="width:min(92vw,720px)">' +
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '    <button class="btn" id="sh-back">← Back</button>' +
      '    <h2 style="margin:0">Shark Shop</h2>' +
      '    <div class="coin-chip" id="sh-coins"></div>' +
      '  </div>' +
      '  <div class="tabs">' +
      '    <div class="tab" data-tab="sharks">🦈 Sharks</div>' +
      '    <div class="tab" data-tab="pets">🐠 Pets</div>' +
      '    <div class="tab" data-tab="cosmetics">🎩 Style</div>' +
      '  </div>' +
      '  <div id="shop-body">' +
      '    <div id="shop-list"></div>' +
      '    <div id="shop-detail">' +
      '      <div id="shop-preview"></div>' +
      '      <div id="shop-info"></div>' +
      '    </div>' +
      '  </div>' +
      '</div>';
    root.appendChild(sc);
    sc.querySelector('#sh-back').addEventListener('click', function () { HF.Audio.play('click'); HF.Shop.close(); });
    sc.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('sel', t.dataset.tab === tab);
      t.addEventListener('click', function () {
        tab = t.dataset.tab;
        selId = tab === 'sharks' ? HF.Save.data.equipped.shark : (tab === 'pets' ? (D.PETS[0].id) : D.COSMETICS[0].id);
        HF.Audio.play('click');
        render();
      });
    });
    slotEl = sc.querySelector('#shop-preview');
    slotEl.addEventListener('pointerdown', function (e) { pvDrag = { x: e.clientX, spin: pvSpin }; });
    if (!windowWired) {
      windowWired = true;   // once per session — render() runs on every tab switch
      window.addEventListener('pointermove', onDrag);
      window.addEventListener('pointerup', function () { pvDrag = null; });
      window.addEventListener('pointercancel', function () { pvDrag = null; });
    }
    renderList();
    renderCoins();
  }

  function onDrag(e) {
    if (!pvDrag) return;
    pvSpin = pvDrag.spin + (e.clientX - pvDrag.x) * 0.012;
  }

  function renderCoins() {
    sc.querySelector('#sh-coins').textContent = '🪙 ' + M.fmt(HF.Save.data.coins);
  }

  function renderList() {
    var list = sc.querySelector('#shop-list');
    list.innerHTML = '';
    var save = HF.Save.data;

    function addItem(label, price, sel, locked, onclick, sub) {
      var it = document.createElement('div');
      it.className = 'shop-item' + (sel ? ' sel' : '') + (locked ? ' locked' : '');
      var l = document.createElement('span'); l.textContent = label;
      var p = document.createElement('span'); p.className = 'price'; p.textContent = price;
      it.appendChild(l); it.appendChild(p);
      it.addEventListener('click', function () { HF.Audio.play('click'); onclick(); });
      list.appendChild(it);
      return it;
    }

    if (tab === 'sharks') {
      D.SHARKS.forEach(function (s) {
        var owned = HF.Save.ownsShark(s.id);
        var equipped = save.equipped.shark === s.id;
        addItem((owned ? (equipped ? '✔ ' : '') : '🔒 ') + s.name,
          owned ? 'T' + s.tier : '🪙 ' + M.fmt(sharkCost(s)),
          selId === s.id, !owned,
          function () { selId = s.id; renderList(); });
      });
      renderSharkDetail();
    } else if (tab === 'pets') {
      D.PETS.forEach(function (p) {
        var owned = !!save.petsOwned[p.id];
        var equipped = save.equipped.pet === p.id;
        addItem((owned ? (equipped ? '✔ ' : '') : '🔒 ') + p.name,
          owned ? '' : '🪙 ' + M.fmt(p.cost),
          selId === p.id, !owned,
          function () { selId = p.id; renderList(); });
      });
      renderPetDetail();
    } else {
      D.COSMETICS.forEach(function (c) {
        var owned = !!save.cosmeticsOwned[c.id];
        var equipped = save.equipped.cosmetics[c.slot] === c.id;
        addItem((owned ? (equipped ? '✔ ' : '') : '') + c.name,
          owned ? c.slot : '🪙 ' + M.fmt(c.cost),
          selId === c.id, !owned,
          function () { selId = c.id; renderList(); });
      });
      renderCosDetail();
    }
  }

  function detail(el, html) { el.innerHTML = html; }

  function renderSharkDetail() {
    var s = sharkDef(selId);
    var owned = HF.Save.ownsShark(s.id);
    setPreview('sharks', s.id, !owned);
    var info = sc.querySelector('#shop-info');
    var cost = sharkCost(s);
    var meta = HF.Save.data.sharks[s.id];
    detail(info,
      '<div style="display:flex;justify-content:space-between;align-items:baseline">' +
      '  <b style="font-family:var(--font-display);font-size:20px" id="si-name"></b>' +
      '  <span style="color:var(--c-text-dim)" id="si-len"></span></div>' +
      '<div class="desc" id="si-desc"></div>' +
      statBar('Bite', s.tier / 7) + statBar('Speed', s.speed / 9) + statBar('Health', s.hp / 640) + statBar('Appetite', s.drain / 3.4) +
      '<div class="row" id="si-actions"></div>'
    );
    info.querySelector('#si-name').textContent = owned ? s.name : '??? (' + s.name + ')';
    info.querySelector('#si-len').textContent = s.len + ' m · Tier ' + s.tier + (meta && meta.mastery ? ' · ★' + meta.mastery : '');
    info.querySelector('#si-desc').textContent = s.desc + (s.depthLimit !== Infinity ? (' Safe below ' + s.depthLimit + ' m? No.') : ' No depth limit.');
    var act = info.querySelector('#si-actions');
    if (owned) {
      var eq = HF.Save.data.equipped.shark === s.id;
      var b = button(eq ? 'Equipped ✓' : 'Equip', eq ? '' : 'btn-gold', function () {
        HF.Save.data.equipped.shark = s.id; HF.Save.mark();
        HF.Audio.play('confirm');
        renderList();
      });
      if (eq) b.disabled = true;
      act.appendChild(b);
    } else {
      var afford = HF.Save.data.coins >= cost;
      var bb = button('Buy  🪙 ' + M.fmt(cost), 'btn-gold', function () {
        if (!HF.Save.spend(cost)) return;
        HF.Save.data.sharks[s.id] = { owned: true, mastery: 0, masteryXP: 0 };
        HF.Save.data.equipped.shark = s.id;
        HF.Save.mark();
        HF.Audio.play('unlock');
        HF.Progress.checkStatAchievements();
        renderCoins(); renderList();
      });
      if (!afford) bb.disabled = true;
      act.appendChild(bb);
    }
  }

  function renderPetDetail() {
    var p = petDef(selId);
    var owned = !!HF.Save.data.petsOwned[p.id];
    setPreview('pets', p.id, !owned);
    var info = sc.querySelector('#shop-info');
    detail(info,
      '<b style="font-family:var(--font-display);font-size:20px" id="pi-name"></b>' +
      '<div class="desc" id="pi-desc"></div>' +
      '<div class="row" id="pi-actions"></div>');
    info.querySelector('#pi-name').textContent = p.name;
    info.querySelector('#pi-desc').textContent = p.desc;
    var act = info.querySelector('#pi-actions');
    var gate = null;
    if (p.needAch && !(HF.Save.data.achievements[p.needAch] && HF.Save.data.achievements[p.needAch].done)) gate = 'Unlock: achievement first';
    if (p.needBoss && !HF.Save.data.bossKills[p.needBoss]) gate = 'Unlock: slay the Blacktide Regent';
    if (owned) {
      var eq = HF.Save.data.equipped.pet === p.id;
      act.appendChild(button(eq ? 'Unequip' : 'Equip', eq ? '' : 'btn-gold', function () {
        HF.Save.data.equipped.pet = eq ? null : p.id;
        HF.Save.mark(); HF.Audio.play('confirm');
        renderList();
      }));
    } else if (gate) {
      var gb = button(gate, '', function () { });
      gb.disabled = true;
      act.appendChild(gb);
    } else {
      var afford = HF.Save.data.coins >= p.cost;
      var bb = button('Buy  🪙 ' + M.fmt(p.cost), 'btn-gold', function () {
        if (!HF.Save.spend(p.cost)) return;
        HF.Save.data.petsOwned[p.id] = { owned: true };
        HF.Save.data.equipped.pet = p.id;
        HF.Save.mark(); HF.Audio.play('unlock');
        renderCoins(); renderList();
      });
      if (!afford) bb.disabled = true;
      act.appendChild(bb);
    }
  }

  function renderCosDetail() {
    var c = cosDef(selId);
    var owned = !!HF.Save.data.cosmeticsOwned[c.id];
    setPreview('cosmetics', c.id, false);
    var info = sc.querySelector('#shop-info');
    detail(info,
      '<b style="font-family:var(--font-display);font-size:20px" id="ci-name"></b>' +
      '<div class="desc" id="ci-desc"></div>' +
      '<div class="row" id="ci-actions"></div>');
    info.querySelector('#ci-name').textContent = c.name + '  ·  ' + c.slot;
    info.querySelector('#ci-desc').textContent = c.desc + (c.fx ? '' : '  (cosmetic only)');
    var act = info.querySelector('#ci-actions');
    if (owned) {
      var eq = HF.Save.data.equipped.cosmetics[c.slot] === c.id;
      act.appendChild(button(eq ? 'Take off' : 'Wear', eq ? '' : 'btn-gold', function () {
        HF.Save.data.equipped.cosmetics[c.slot] = eq ? null : c.id;
        HF.Save.mark(); HF.Audio.play('confirm');
        renderList();
      }));
    } else if (c.bossGift) {
      var gb = button('Trophy: slay Inkfang', '', function () { });
      gb.disabled = true;
      act.appendChild(gb);
    } else {
      var afford = HF.Save.data.coins >= c.cost;
      var bb = button('Buy  🪙 ' + M.fmt(c.cost), 'btn-gold', function () {
        if (!HF.Save.spend(c.cost)) return;
        HF.Save.data.cosmeticsOwned[c.id] = true;
        HF.Save.data.equipped.cosmetics[c.slot] = c.id;
        HF.Save.mark(); HF.Audio.play('unlock');
        renderCoins(); renderList();
      });
      if (!afford) bb.disabled = true;
      act.appendChild(bb);
    }
  }

  function statBar(label, frac) {
    return '<div class="stat"><span>' + label + '</span><div class="meter"><i style="width:' + Math.round(M.clamp01(frac) * 100) + '%"></i></div></div>';
  }
  function button(text, cls, fn) {
    var b = document.createElement('button');
    b.className = 'btn ' + (cls || '');
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }
})();

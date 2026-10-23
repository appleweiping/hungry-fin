// Sanity checks that run without a browser: every script parses, the
// script order in index.html loads, and the balance tables are consistent.
// usage: node tools/check.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const errors = [];
const fail = (msg) => errors.push(msg);

// 1. every <script> in index.html exists and parses, in order
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"?]+)/g)].map((m) => m[1]);
for (const s of scripts) {
  const file = path.join(root, s);
  if (!fs.existsSync(file)) { fail(`index.html loads missing file ${s}`); continue; }
  try { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: s }); }
  catch (e) { fail(`${s}: ${e.message}`); }
}

// 2. load core + data in a stub window and check the tables
const ctx = { console, Math, JSON, Object, Array, Infinity, isFinite };
ctx.window = ctx;
ctx.location = { search: '' };
ctx.addEventListener = () => {};
vm.createContext(ctx);
for (const s of ['js/core/core.js', 'js/data/palette.js', 'js/data/balance.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, s), 'utf8'), ctx, { filename: s });
}
const D = ctx.HF.Data;
const nZones = D.WORLD.ZONES.length;
const protos = ['school', 'wander', 'flee', 'chase', 'hazard', 'surface'];
const ids = new Set();
for (const c of D.CREATURES) {
  if (ids.has(c.id)) fail(`duplicate creature id ${c.id}`);
  ids.add(c.id);
  if (!protos.includes(c.proto)) fail(`${c.id}: unknown proto ${c.proto}`);
  if (!(c.cap > 0)) fail(`${c.id}: cap must be > 0`);
  if (!(c.depth[0] <= c.depth[1])) fail(`${c.id}: depth range is reversed`);
  if (!c.zones.length || c.zones.some((z) => z < 0 || z >= nZones)) fail(`${c.id}: bad zone list`);
  if (c.proto === 'school' && !c.school) fail(`${c.id}: school proto needs a school size`);
}
// every zone has something the starting shark can eat
for (let z = 0; z < nZones; z++) {
  if (!D.CREATURES.some((c) => c.zones.includes(z) && c.tier <= 2 && c.proto !== 'hazard')) fail(`zone ${z} has no tier 1-2 food`);
}
for (let i = 1; i < D.SHARKS.length; i++) {
  if (D.SHARKS[i].tier <= D.SHARKS[i - 1].tier) fail(`shark tiers must increase (${D.SHARKS[i].id})`);
}
if (D.SPAWN.TARGET.length !== nZones) fail('SPAWN.TARGET needs one entry per zone');
for (const b of D.BOSSES) if (b.zone < 0 || b.zone >= nZones) fail(`boss ${b.id}: bad zone`);

if (errors.length) {
  console.error(errors.map((e) => '  - ' + e).join('\n'));
  console.error(`${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`ok: ${scripts.length} scripts parse, ${D.CREATURES.length} creatures, ${D.SHARKS.length} sharks, ${nZones} zones`);

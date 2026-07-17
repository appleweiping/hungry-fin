# Vendored dependencies

## three.min.js — Three.js r147 (UMD build), pinned on purpose

This file is the official `build/three.min.js` from `three@0.147.0`
(https://unpkg.com/three@0.147.0/build/three.min.js), MIT licensed
(see `LICENSE-three.txt`).

**Why vendored:** the game must run by double-clicking `index.html` (`file://`).
ES modules are blocked by CORS on `file://`, and CDN scripts break offline play,
so a classic UMD script committed to the repo is the only option that satisfies
both. It also makes the repo fully reproducible — no network at build or run time.

**Why r147 specifically:**

- r150+ prints a deprecation warning for the UMD builds on every page load;
- r160 removed the UMD builds entirely;
- r152 changed colour-management and lighting defaults, which would silently
  alter the game's hand-tuned palette.

**Do not upgrade this file past r159.** Upgrading to r160+ requires migrating the
whole codebase to ES modules and giving up `file://` support — that is a project
decision, not a dependency bump. API-difference gotchas if you touch renderer
code: this codebase uses the r147-era names (`outputEncoding`, `sRGBEncoding`),
not the newer `outputColorSpace`.

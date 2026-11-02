# Vendored: realistic planet renderer (Atlas 3.0.2)

These files are copied **verbatim** from upstream and must stay that way, so they can be
re-synced by a plain `git show` without resolving conflicts.

| | |
|---|---|
| Upstream | <https://github.com/SurceBeats/Atlas> |
| Commit | `2a9ec243fe0366f93dba2c15e55c1e2b59ac5c8a` (v3.0.2, 2026-10-23) |
| Source path | `atlas-ui/react/static/js/Explore/planet/realistic/` |
| License | PolyForm Noncommercial 1.0.0 — same as this repository, see `/LICENSE.md` |
| Copyright | Claudio González (SurceBeats) / Banshee |

## Files (unchanged)

| File | Bytes | Role |
|---|---:|---|
| `glsl.ts` | 5,322 | shared GLSL: simplex/fbm/ridged/cellular noise, lighting helpers |
| `shaders.ts` | 55,038 | surface / cloud / haze / atmosphere GLSL |
| `effects.ts` | 43,911 | 16 effect kinds (aurora, volcanic, jets, monolith…) |
| `looks.ts` | 20,469 | planet type → family, palette and structure parameters |
| `rings.ts` | 7,354 | ring bands, shadows, Roche structure |
| `RealisticPlanet.ts` | 10,823 | assembles surface + clouds + haze + atmosphere + rings |

### `MoonSystem.tsx` (vendored in step 2)

| | |
|---|---|
| Source | `atlas-ui/react/static/js/3DComponents/MoonSystem.tsx` @ `2a9ec243` |
| Bytes / lines | 65,140 / 1,804 |
| **Only deviation** | import path: `../Explore/planet/realistic/glsl.ts` → `./glsl.ts` |

Re-sync:

```bash
git show FETCH_HEAD:atlas-ui/react/static/js/3DComponents/MoonSystem.tsx \
  | sed 's#"../Explore/planet/realistic/glsl.ts"#"./glsl.ts"#' \
  > atlas-ui/react/static/js/3DComponents/realistic3/MoonSystem.tsx
```

Do **not** swap in the 2.x local `MoonSystem.tsx` (1,672 lines): it was modified here
(Chinese labels, time offsets) and no longer matches upstream.

## Vendored in step 5 (§10: star / system / exotic)

Same commit, same license. Source paths differ per file, so the re-sync commands are listed
per group.

| File | Bytes | Upstream path | Deviation |
|---|---:|---|---|
| `StarSurface.ts` | 10,657 | `Explore/system/StarSurface.ts` | `NOISE` import `../planet/realistic/glsl.ts` → `./glsl.ts` |
| `SystemLayer.ts` | 18,090 | `Explore/system/SystemLayer.ts` | 4 import paths: `../api.ts`→`./systemTypes.ts`, `../../Utils/OrbitalMechanics.ts`→`./OrbitalMechanics.ts`, `../planet/planetColors.ts`→`./planetColors.ts`, `../core/hash.ts`→`./hash.ts` |
| `OrbitalMechanics.ts` | 1,482 | `Utils/OrbitalMechanics.ts` | none (3.0-only file; 2.x has no equivalent) |
| `planetColors.ts` | 3,829 | `Explore/planet/planetColors.ts` | none |
| `hash.ts` | 2,064 | `Explore/core/hash.ts` | none |
| `ExoticLayer.ts` | 28,915 | `Explore/galaxy/ExoticLayer.ts` | 2 import paths: `../core/hash.ts`→`./hash.ts`, `../core/torus.ts`→`./torus.ts`, plus `../planet/realistic/glsl.ts`→`./glsl.ts` |
| `torus.ts` | 7,043 | `Explore/core/torus.ts` | none |
| `GalaxyModel.ts` | 21,843 | `Explore/galaxy/GalaxyModel.ts` | `../core/hash.ts`→`./hash.ts` |

`GalaxyModel.ts` is vendored whole (not just the `PointOfInterest` type) because
`ExoticLayer` imports the type from it; the file itself only needs `hash.ts`.

Re-sync (all of step 5):

```bash
git fetch --depth=1 upstream main
B=atlas-ui/react/static/js
D=atlas-ui/react/static/js/3DComponents/realistic3
git show FETCH_HEAD:$B/Explore/system/StarSurface.ts   | sed 's#"../planet/realistic/glsl.ts"#"./glsl.ts"#' > $D/StarSurface.ts
git show FETCH_HEAD:$B/Explore/system/SystemLayer.ts   | sed -e 's#"../api.ts"#"./systemTypes.ts"#' \
    -e 's#"../../Utils/OrbitalMechanics.ts"#"./OrbitalMechanics.ts"#' \
    -e 's#"../planet/planetColors.ts"#"./planetColors.ts"#' \
    -e 's#"../core/hash.ts"#"./hash.ts"#' > $D/SystemLayer.ts
git show FETCH_HEAD:$B/Utils/OrbitalMechanics.ts        > $D/OrbitalMechanics.ts
git show FETCH_HEAD:$B/Explore/planet/planetColors.ts   > $D/planetColors.ts
git show FETCH_HEAD:$B/Explore/core/hash.ts             > $D/hash.ts
git show FETCH_HEAD:$B/Explore/galaxy/ExoticLayer.ts    | sed -e 's#"../core/hash.ts"#"./hash.ts"#' \
    -e 's#"../core/torus.ts"#"./torus.ts"#' \
    -e 's#"../planet/realistic/glsl.ts"#"./glsl.ts"#' > $D/ExoticLayer.ts
git show FETCH_HEAD:$B/Explore/core/torus.ts            > $D/torus.ts
git show FETCH_HEAD:$B/Explore/galaxy/GalaxyModel.ts    | sed 's#"../core/hash.ts"#"./hash.ts"#' > $D/GalaxyModel.ts
```

Gotcha recorded while checking: `ExoticLayer`'s torus lattice reads `window.innerWidth`
directly, so headless tests need a `window` stub (see `scripts/system_variants_check.ts`).

## Local additions (not from upstream)

| File | Role |
|---|---|
| `adapter.ts` | maps the 2.x planet payload onto the shape `planetLook()` / `effectKinds()` read; also `sampleRings()` for the lab |
| `RealisticPlanetView.tsx` | self-contained host: canvas, camera, orbit controls, star light, rings, moons, per-frame state |
| `moons.ts` | synthesises a deterministic `MoonSystemData` from (count, seed) until the backend ships real moons |
| `perf.ts` | quality tier → `maxOctaves` / `maxPixelRatio` (`?quality=low|mid|high` override) |
| `variantCache.ts` | step 4: 16 family probes → `compileAsync` warm-up of the program cache |
| `systemTypes.ts` | the type half of upstream `Explore/api.ts`, so `SystemLayer` keeps its contract without the fetch layer |
| `systemAdapter.ts` | 2.x `/api/system/rendering-data` → `SystemDetail` + `Timing` (index, numeric star size, timing fallbacks) |

## Re-sync

```bash
git fetch --depth=1 upstream main
for f in glsl shaders effects looks rings RealisticPlanet; do
  git show FETCH_HEAD:atlas-ui/react/static/js/Explore/planet/realistic/$f.ts \
    > atlas-ui/react/static/js/3DComponents/realistic3/$f.ts
done
git diff --stat -- atlas-ui/react/static/js/3DComponents/realistic3
```

If upstream ever changes the `PlanetLook` interface or `RealisticFrameState`, `adapter.ts`
and `RealisticPlanetView.tsx` are the two files to fix — never the vendored six.

## Notes for step 2 (rings + moons) — done

- **Rings need no adapter.** `pymodules/planet_renderer/rings_translator.py` already emits
  `{has_rings, inner_radius, outer_radius, planet_radius, tilt_factor, shape_seed, bands:[{inner,outer}]}`
  — the same field names as `RingsData`, and `RealisticRings` normalises by `1 / planet_radius`
  internally. Pass `planetData.rings` straight through.
- **Moons**: vendored, one import-path fix (see above). `Object.assign`-style wrapping is not
  needed; `MoonSystem` only needs `(scene, planetRadius, camera, planetPosition, cosmicOriginTime)`
  plus `loadMoonSystem(data)`.
- **Lights**: moons are `MeshStandardMaterial`, so `RealisticPlanetView` adds a directional +
  ambient light **only when moons > 0**. The planet surface is a fragment shader and ignores
  scene lights, so this cannot change the planet's look.

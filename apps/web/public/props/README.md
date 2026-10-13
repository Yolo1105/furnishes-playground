# Room items as real models: what to download

The room items (the things in a room that are not for sale: the sofa,
the armchair, the coffee table, the lamps, the rug, plants and decor)
are drawn from real scanned or artist-made models, each with its own
textures. The models in this folder are what the studio has so far.
They are Poly Haven's CC0 models at 1k, cut to about 6,000 triangles
(`LICENSES.md`). This file lists what is still needed.

**Why this is a list and not the files.** The sandbox the 2026-10-13
round was built in could not reach polyhaven.com (the network policy
refused it), so nothing could be downloaded. The brief says to list
exactly what is needed and stop, so the repository owner can fetch the
files. The model names below are Poly Haven's slugs as best known,
**to be confirmed on polyhaven.com/models**. The sizes, resolutions and
formats are what the studio needs, whatever the slug.

## How to download

From each model's page on https://polyhaven.com/models:

- format **glTF**, at the resolution given below (2k for hero items,
  1k for small ones);
- keep every map, the `_arm` (AO, roughness, metal) map included. The
  studio applies its R channel as the occlusion map (B4).

Then, per model:

1. `npx @gltf-transform/cli optimize in.gltf out.glb --compress meshopt --texture-compress webp`
   (meshopt, not a hard simplify: hero items keep up to 40–60k
   triangles);
2. a far LOD for the same model:
   `npx @gltf-transform/cli simplify out.glb out.lod1.glb --ratio 0.15 --error 0.002`;
3. put both in this folder and add the model to `index.json` with its
   kind and its size in metres as it stands (width × height × depth);
4. add a line to `LICENSES.md` (source, CC0, what was changed).

The studio picks a model for a room item only when every axis of the
item's size is within ±10 % of the model's size. Otherwise it picks
the nearest variant, or keeps the built form. A model's texture is never
stretched.

## Hero items, 2k textures

| Slot                      | Poly Haven candidates (confirm the slug)                                                                  | The size the plan uses, m             | Notes                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three-seat sofa           | a modern three-seater, e.g. `sofa_03` or another modern sofa                                              | 2.2–2.4 × 0.8 × 0.9                   | Linen or plain cloth (its map is tinted, B1.4); slim legs. The stock `sofa_02` is a 1.81 m tufted Chesterfield: too small (more than 10 % short) and a period style. |
| Two-seat sofa             | a modern two-seater                                                                                       | 1.6–1.8 × 0.8 × 0.9                   | The second variant, for smaller rooms.                                                                                                                               |
| Armchair                  | `modern_arm_chair_01` (have, at 1k; fetch at 2k)                                                          | 0.82 × 1.02 × 0.99                    | Already in use.                                                                                                                                                      |
| Coffee table, rectangular | a low wood table about 1.2 × 0.6 m (have `modern_coffee_table_01` at 1k, 1.20 × 0.39 × 0.60: fetch at 2k) | 1.0–1.2 × 0.4 × 0.6                   | For the first project's 1.0 m table, a 1.0–1.1 m model is needed; or the table is set to 1.2 m in the plan.                                                          |
| Coffee table, round       | e.g. `round_wooden_table_01` (a low one)                                                                  | Ø 0.8–0.9 × 0.4                       |                                                                                                                                                                      |
| Floor lamp                | a linen-shade standing lamp, e.g. `standing_lamp_01`                                                      | 0.45 × 1.6 × 0.45                     | The studio lights it (its shade glows with the bulb, A5).                                                                                                            |
| Rug                       | a flat-woven or low-pile rug, e.g. `rug_01` / `persian_rug_01` if listed                                  | 2.0 × 0.01 × 3.0 and 1.6 × 0.01 × 2.3 | Otherwise the built rug stays (pile material, woven border band).                                                                                                    |

## Small items, 1k textures

| Slot          | Poly Haven candidates                                          | Real size, m                  |
| ------------- | -------------------------------------------------------------- | ----------------------------- |
| Pot plant     | `potted_plant_01`, `potted_plant_02`, `potted_plant_04` (have) | 0.3–0.6 tall                  |
| Vase          | `ceramic_vase_01` (have), `ceramic_vase_02`, `ceramic_vase_03` | 0.25–0.35 tall                |
| Books (a set) | `book_encyclopedia_set_01` (have)                              | 0.17–0.30 tall                |
| Throw         | a folded or draped throw blanket                               | about 0.6 × 0.05 × 0.4 folded |
| Cushions      | `throw_pillows_01` (have)                                      | 0.45 × 0.45                   |
| Side table    | e.g. `side_table_01`                                           | 0.45 × 0.55 × 0.45            |
| Table lamp    | e.g. `table_lamp_01`                                           | 0.3 × 0.5 × 0.3               |

## Paid libraries

Do not use 3dsky, CGTrader or TurboSquid models without checking their
licence first. Most forbid shipping the model inside a web app, where
anyone can download the `.glb`.
